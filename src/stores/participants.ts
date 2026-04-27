import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
import { useStoreRequest } from '@/utils/useStoreRequest'
import { useCache } from '@/utils/useCache'
import type { Participant, RawParticipant, RegistrationPage } from '@/types'

function mapParticipant(p: RawParticipant): Participant {
    return {
        id: p.id,
        name: p.name,
        company: p.company,
        title: p.title,
        phone: p.phone,
        email: p.email,
        type: p.type as Participant['type'],
        status: p.status,
        eventId: p.event,
        eventName: p.event_name,
        managerId: p.manager,
        managerEmail: p.manager_email,
        checkInToken: p.check_in_token,
        qrCodeUrl: p.qr_code_url,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
    }
}

function buildCacheKey(params: Record<string, string>) {
    const entries = Object.entries(params)
        .filter(([, value]) => value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
    return new URLSearchParams(entries).toString()
}

export const useParticipantsStore = defineStore('participants', () => {
    const participants = ref<Participant[]>([])
    const selectedVIPs = ref<Participant[]>([])
    const { loading, error, run, clearError } = useStoreRequest()
    const cache = useCache(30_000)

    async function fetchParticipants(params: Record<string, string> = {}) {
        const key = buildCacheKey(params)
        if (participants.value.length > 0 && cache.isValid(key)) return participants.value
        return run(async () => {
            const query = new URLSearchParams(params).toString()
            const url = query ? `/api/participants/?${query}` : '/api/participants/'
            const res = await apiRequest(url)
            if (!res.ok) throw new Error(`取得參與者列表失敗 (${res.status})`)
            const data = await res.json()
            participants.value = (data.results || data).map(mapParticipant)
            cache.touch(key)
            return participants.value
        })
    }

    const createParticipant = (data: Record<string, unknown>) =>
        run(async () => {
            const res = await apiRequest('/api/participants/', {
                method: 'POST',
                body: JSON.stringify(data),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `新增失敗 (${res.status})`))
            const p = mapParticipant(await res.json())
            participants.value.unshift(p)
            return p
        })

    const updateParticipant = (id: number, data: Record<string, unknown>) =>
        run(async () => {
            const res = await apiRequest(`/api/participants/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `更新失敗 (${res.status})`))
            const updated = mapParticipant(await res.json())
            const idx = participants.value.findIndex(p => p.id === id)
            if (idx !== -1) participants.value[idx] = updated
            return updated
        })

    const deleteParticipant = (id: number) =>
        run(async () => {
            const res = await apiRequest(`/api/participants/${id}/`, { method: 'DELETE' })
            if (!res.ok && res.status !== 204) throw new Error(`刪除失敗 (${res.status})`)
            participants.value = participants.value.filter(p => p.id !== id)
        })

    const checkinByToken = (token: string) =>
        run(async () => {
            const res = await apiRequest('/api/participants/checkin_by_token/', {
                method: 'POST',
                body: JSON.stringify({ token }),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `報到失敗 (${res.status})`))
            const data = await res.json()
            const updated = mapParticipant(data.participant)
            const idx = participants.value.findIndex(p => p.id === updated.id)
            if (idx !== -1) participants.value[idx] = updated
            return { message: data.message as string, participant: updated }
        })

    const checkIn = (id: number) =>
        run(async () => {
            const res = await apiRequest(`/api/participants/${id}/check_in/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `報到失敗 (${res.status})`))
            const updated = mapParticipant(await res.json())
            const idx = participants.value.findIndex(p => p.id === id)
            if (idx !== -1) participants.value[idx] = updated
            return updated
        })

    const checkOut = (id: number) =>
        run(async () => {
            const res = await apiRequest(`/api/participants/${id}/check_out/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `取消報到失敗 (${res.status})`))
            const updated = mapParticipant(await res.json())
            const idx = participants.value.findIndex(p => p.id === id)
            if (idx !== -1) participants.value[idx] = updated
            return updated
        })

    const regenerateQr = (id: number) =>
        run(async () => {
            const res = await apiRequest(`/api/participants/${id}/regenerate_qr/`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `重新產生 QR Code 失敗 (${res.status})`))
            const data: { qr_code_url: string } = await res.json()
            const newUrl = data.qr_code_url
            const idx = participants.value.findIndex(p => p.id === id)
            if (idx !== -1) participants.value[idx].qrCodeUrl = newUrl
            return newUrl
        })

    async function fetchStatistics(eventId?: number) {
        try {
            const url = eventId
                ? `/api/participants/statistics/?event=${eventId}`
                : '/api/participants/statistics/'
            const res = await apiRequest(url)
            if (!res.ok) throw new Error('取得統計資料失敗')
            return res.json()
        } catch (err) {
            error.value = (err as Error).message
            throw err
        }
    }

    const importParticipants = (data: Record<string, unknown>[], eventId: number) =>
        run(async () => {
            const res = await apiRequest('/api/participants/bulk_import/', {
                method: 'POST',
                body: JSON.stringify({ event: eventId, participants: data }),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `批量匯入失敗 (${res.status})`))
            cache.invalidate()
            return res.json()
        })

    function clear() {
        participants.value = []
        error.value = null
        cache.invalidate()
    }

    return {
        participants,
        loading,
        error,
        selectedVIPs,
        fetchParticipants,
        createParticipant,
        updateParticipant,
        deleteParticipant,
        checkinByToken,
        checkIn,
        checkOut,
        regenerateQr,
        fetchStatistics,
        importParticipants,
        clearError,
        clear,
    }
})

// =========================================================
// 公開報名 Store（前台，不需登入）
// =========================================================
import { publicGet, publicPost } from '@/utils/publicApi'

export const usePublicRegisterStore = defineStore('publicRegister', () => {
    const page = ref<RegistrationPage | null>(null)
    const { loading, error, run } = useStoreRequest()
    const submitted = ref(false)
    const submittedParticipant = ref<Participant | null>(null)
    const cache = useCache(30_000)

    async function fetchPage(shortLink: string) {
        if (cache.isValid(shortLink) && page.value) return page.value
        return run(async () => {
            let raw: Record<string, any>
            try {
                raw = await publicGet(`/api/public/register/${shortLink}/`)
            } catch (err) {
                if ((err as Error).message === 'NOT_FOUND') {
                    throw new Error('找不到此報名頁面，可能尚未發布或連結錯誤')
                }
                throw new Error('載入報名頁面失敗')
            }
            page.value = {
                ...raw,
                shortLink: raw.short_link,
                mainContent: raw.main_content,
                isPublished: raw.is_published,
                eventName: raw.event_name,
                eventDate: raw.event_date,
                eventEndDate: raw.event_end_date,
                eventTime: raw.event_time,
                eventLocation: raw.event_location,
                eventAddress: raw.event_address,
                eventStatus: raw.event_status,
                eventStatusText: raw.event_status_text,
                formFields: raw.form_fields || [],
                tickets: raw.tickets || [],
                faqs: raw.faqs || [],
            } as unknown as RegistrationPage
            cache.touch(shortLink)
            return page.value
        })
    }

    const submitRegistration = (shortLink: string, formData: Record<string, unknown>) =>
        run(async () => {
            const data = await publicPost<{ participant: Participant }>(`/api/public/register/${shortLink}/`, formData)
            submitted.value = true
            submittedParticipant.value = data.participant
            return data
        })

    function reset() {
        page.value = null
        submitted.value = false
        submittedParticipant.value = null
        error.value = null
    }

    return {
        page,
        loading,
        error,
        submitted,
        submittedParticipant,
        fetchPage,
        submitRegistration,
        reset,
    }
})
