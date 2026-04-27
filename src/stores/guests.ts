import { ref, computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
import { useStoreRequest } from '@/utils/useStoreRequest'
import { useCache } from '@/utils/useCache'
import type { Guest } from '@/types'

export const useGuestsStore = defineStore('guests', () => {

    // ===== API State =====
    const guests = reactive<Guest[]>([])
    const { loading: isLoading, error, run } = useStoreRequest()
    const cache = useCache(30_000)

    const fetchGuests = async (eventId: number) => {
        const key = String(eventId)
        if (guests.length > 0 && cache.isValid(key)) return
        await run(async () => {
            const res = await apiRequest(`/api/guests/?event=${eventId}`)
            if (!res.ok) throw new Error('取得貴賓列表失敗')
            const data = await res.json()
            guests.splice(0, guests.length)
            guests.push(...(data.results || data))
            cache.touch(key)
        })
    }

    const createGuest = (payload: Partial<Guest>) =>
        run(async () => {
            const res = await apiRequest('/api/guests/', {
                method: 'POST',
                body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error(await parseApiError(res, '新增貴賓失敗'))
            const newGuest: Guest = await res.json()
            guests.push(newGuest)
            return newGuest
        })

    const updateGuest = (id: number, payload: Partial<Guest>) =>
        run(async () => {
            const res = await apiRequest(`/api/guests/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error('更新貴賓失敗')
            const updated: Guest = await res.json()
            const idx = guests.findIndex((g) => g.id === id)
            if (idx > -1) Object.assign(guests[idx], updated)
            return updated
        })

    const deleteGuest = (id: number) =>
        run(async () => {
            const res = await apiRequest(`/api/guests/${id}/`, { method: 'DELETE' })
            if (!res.ok) throw new Error('刪除貴賓失敗')
            const idx = guests.findIndex((g) => g.id === id)
            if (idx > -1) guests.splice(idx, 1)
            const selIdx = selectedGuests.value.findIndex((g) => g.id === id)
            if (selIdx > -1) selectedGuests.value.splice(selIdx, 1)
        })

    // ===== Selection State（報名頁面預覽用）=====
    const selectedGuests = ref<Guest[]>([])

    const toggleGuest = (guest: Guest) => {
        const index = selectedGuests.value.findIndex((g) => g.id === guest.id)
        if (index > -1) {
            selectedGuests.value.splice(index, 1)
        } else {
            selectedGuests.value.push(guest)
        }
    }

    const isGuestSelected = (guestId: number) => {
        return selectedGuests.value.some((g) => g.id === guestId)
    }

    const clearSelectedGuests = () => {
        selectedGuests.value = []
    }

    const getSelectedGuests = computed(() => selectedGuests.value)

    return {
        guests,
        isLoading,
        error,
        fetchGuests,
        createGuest,
        updateGuest,
        deleteGuest,
        selectedGuests,
        toggleGuest,
        isGuestSelected,
        clearSelectedGuests,
        getSelectedGuests,
    }
})
