import { ref, computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
import type { Guest } from '@/types'

export const useGuestsStore = defineStore('guests', () => {

    // ===== API State =====
    const guests = reactive<Guest[]>([])
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    // ── 快取 ──────────────────────────────────────────────────────────────
    const CACHE_TTL = 30_000 // 30 秒
    const _lastFetched = ref(0)
    const _lastFetchedEventId = ref<number | null>(null)

    /**
     * 取得活動貴賓 GET /api/guests/?event={eventId}
     */
    const fetchGuests = async (eventId: number) => {
        if (guests.length > 0 && _lastFetchedEventId.value === eventId && Date.now() - _lastFetched.value < CACHE_TTL) return
        isLoading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/guests/?event=${eventId}`)
            if (!res.ok) throw new Error('取得貴賓列表失敗')
            const data = await res.json()
            guests.splice(0, guests.length)
            guests.push(...(data.results || data))
            _lastFetched.value = Date.now()
            _lastFetchedEventId.value = eventId
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            isLoading.value = false
        }
    }

    /**
     * 建立貴賓 POST /api/guests/
     */
    const createGuest = async (payload: Partial<Guest>) => {
        isLoading.value = true
        error.value = null
        try {
            const res = await apiRequest('/api/guests/', {
                method: 'POST',
                body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error(await parseApiError(res, '新增貴賓失敗'))
            const newGuest: Guest = await res.json()
            guests.push(newGuest)
            return newGuest
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            isLoading.value = false
        }
    }

    /**
     * 更新貴賓 PATCH /api/guests/{id}/
     */
    const updateGuest = async (id: number, payload: Partial<Guest>) => {
        isLoading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/guests/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error('更新貴賓失敗')
            const updated: Guest = await res.json()
            const idx = guests.findIndex((g) => g.id === id)
            if (idx > -1) Object.assign(guests[idx], updated)
            return updated
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            isLoading.value = false
        }
    }

    /**
     * 刪除貴賓 DELETE /api/guests/{id}/
     */
    const deleteGuest = async (id: number) => {
        isLoading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/guests/${id}/`, { method: 'DELETE' })
            if (!res.ok) throw new Error('刪除貴賓失敗')
            const idx = guests.findIndex((g) => g.id === id)
            if (idx > -1) guests.splice(idx, 1)
            // 同步從選中列表移除
            const selIdx = selectedGuests.value.findIndex((g) => g.id === id)
            if (selIdx > -1) selectedGuests.value.splice(selIdx, 1)
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            isLoading.value = false
        }
    }

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
        // API state
        guests,
        isLoading,
        error,
        fetchGuests,
        createGuest,
        updateGuest,
        deleteGuest,
        // Selection state
        selectedGuests,
        toggleGuest,
        isGuestSelected,
        clearSelectedGuests,
        getSelectedGuests,
    }
})
