import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest, API_BASE_URL } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
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

export const useParticipantsStore = defineStore('participants', () => {
    const participants = ref<Participant[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)
    const selectedVIPs = ref<Participant[]>([])

    // ── 快取 ──────────────────────────────────────────────────────────────
    const CACHE_TTL = 30_000 // 30 秒
    const _lastFetched = ref(0)
    const _lastFetchedKey = ref('')

    async function fetchParticipants(params: Record<string, string> = {}) {
        const cacheKey = params.event ? String(params.event) : ''
        if (participants.value.length > 0 && _lastFetchedKey.value === cacheKey && Date.now() - _lastFetched.value < CACHE_TTL) {
            return participants.value
        }
        loading.value = true
        error.value = null
        try {
            const query = new URLSearchParams(params).toString()
            const url = query ? `/api/participants/?${query}` : '/api/participants/'
            const res = await apiRequest(url)
            if (!res.ok) throw new Error(`取得參與者列表失敗 (${res.status})`)
            const data = await res.json()
            participants.value = (data.results || data).map(mapParticipant)
            _lastFetched.value = Date.now()
            _lastFetchedKey.value = cacheKey
            return participants.value
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function createParticipant(data: Record<string, unknown>) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest('/api/participants/', {
                method: 'POST',
                body: JSON.stringify(data),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `新增失敗 (${res.status})`))
            const p = mapParticipant(await res.json())
            participants.value.unshift(p)
            return p
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function updateParticipant(id: number, data: Record<string, unknown>) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/participants/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `更新失敗 (${res.status})`))
            const updated = mapParticipant(await res.json())
            const idx = participants.value.findIndex(p => p.id === id)
            if (idx !== -1) participants.value[idx] = updated
            return updated
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function deleteParticipant(id: number) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/participants/${id}/`, { method: 'DELETE' })
            if (!res.ok && res.status !== 204) throw new Error(`刪除失敗 (${res.status})`)
            participants.value = participants.value.filter(p => p.id !== id)
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function checkinByToken(token: string) {
        loading.value = true
        error.value = null
        try {
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
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function checkIn(id: number) {
        const res = await apiRequest(`/api/participants/${id}/check_in/`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error(`報到失敗 (${res.status})`)
        const updated = mapParticipant(await res.json())
        const idx = participants.value.findIndex(p => p.id === id)
        if (idx !== -1) participants.value[idx] = updated
        return updated
    }

    async function checkOut(id: number) {
        const res = await apiRequest(`/api/participants/${id}/check_out/`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error(`取消報到失敗 (${res.status})`)
        const updated = mapParticipant(await res.json())
        const idx = participants.value.findIndex(p => p.id === id)
        if (idx !== -1) participants.value[idx] = updated
        return updated
    }

    async function regenerateQr(id: number) {
        const res = await apiRequest(`/api/participants/${id}/regenerate_qr/`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error(`重新產生 QR Code 失敗 (${res.status})`)
        const data: { qr_code_url: string } = await res.json()
        const newUrl = data.qr_code_url
        const idx = participants.value.findIndex(p => p.id === id)
        if (idx !== -1) participants.value[idx].qrCodeUrl = newUrl
        return newUrl
    }

    async function fetchStatistics(eventId?: number) {
        const url = eventId
            ? `/api/participants/statistics/?event=${eventId}`
            : '/api/participants/statistics/'
        const res = await apiRequest(url)
        if (!res.ok) throw new Error('取得統計資料失敗')
        return res.json()
    }

    async function importParticipants(data: Record<string, unknown>[], eventId: number) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest('/api/participants/bulk_import/', {
                method: 'POST',
                body: JSON.stringify({ event: eventId, participants: data }),
            })
            if (!res.ok) throw new Error(await parseApiError(res, `批量匯入失敗 (${res.status})`))
            const result = await res.json()
            // 匯入成功後清除快取，下次拉取最新資料
            _lastFetched.value = 0
            return result
        } catch (err) {
            error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    function clearError() { error.value = null }

    function clear() {
        participants.value = []
        error.value = null
        _lastFetched.value = 0
        _lastFetchedKey.value = ''
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
// 公開報名 Store（前台，不需登入，使用 plain fetch）
// =========================================================
export const usePublicRegisterStore = defineStore('publicRegister', () => {
    const page = ref<RegistrationPage | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)
    const submitted = ref(false)
    const submittedParticipant = ref<Participant | null>(null)
    const BASE = API_BASE_URL

    async function fetchPage(shortLink: string) {
        loading.value = true
        error.value = null
        try {
            const res = await fetch(`${BASE}/api/public/register/${shortLink}/`)
            if (res.status === 404) {
                error.value = '找不到此報名頁面，可能尚未發布或連結錯誤'
                throw new Error(error.value)
            }
            if (!res.ok) throw new Error('載入報名頁面失敗')
            page.value = await res.json()
            return page.value
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function submitRegistration(shortLink: string, formData: Record<string, unknown>) {
        loading.value = true
        error.value = null
        try {
            const res = await fetch(`${BASE}/api/public/register/${shortLink}/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            })
            if (!res.ok) {
                const errData = await res.json().catch(() => null)
                if (errData && typeof errData === 'object') {
                    error.value = Object.entries(errData as Record<string, unknown>)
                        .map(([, msgs]) => (Array.isArray(msgs) ? msgs.join(', ') : msgs))
                        .join('；')
                } else {
                    error.value = `報名失敗 (${res.status})`
                }
                throw new Error(error.value!)
            }
            const data = await res.json()
            submitted.value = true
            submittedParticipant.value = data.participant
            return data
        } catch (err) {
            if (!error.value) error.value = (err as Error).message
            throw err
        } finally {
            loading.value = false
        }
    }

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
