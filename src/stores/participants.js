import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest, API_BASE_URL } from '@/utils/api'

function mapParticipant(p) {
    return {
        id: p.id,
        name: p.name,
        company: p.company,
        title: p.title,
        phone: p.phone,
        email: p.email,
        type: p.type,
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
    const participants = ref([])
    const loading = ref(false)
    const error = ref(null)
    const selectedVIPs = ref([])

    async function fetchParticipants(params = {}) {
        loading.value = true
        error.value = null
        try {
            const query = new URLSearchParams(params).toString()
            const url = query ? `/api/participants/?${query}` : '/api/participants/'
            const res = await apiRequest(url)
            if (!res.ok) throw new Error(`取得參與者列表失敗 (${res.status})`)
            const data = await res.json()
            participants.value = (data.results || data).map(mapParticipant)
            return participants.value
        } catch (err) {
            error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function createParticipant(data) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest('/api/participants/', {
                method: 'POST',
                body: JSON.stringify(data),
            })
            if (!res.ok) {
                let msg = `新增失敗 (${res.status})`
                try { const e = await res.json();
                    msg = e.detail || JSON.stringify(e) } catch { /* ignore */ }
                throw new Error(msg)
            }
            const p = mapParticipant(await res.json())
            participants.value.unshift(p)
            return p
        } catch (err) {
            error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function updateParticipant(id, data) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/participants/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            })
            if (!res.ok) {
                let msg = `更新失敗 (${res.status})`
                try { const e = await res.json();
                    msg = e.detail || JSON.stringify(e) } catch { /* ignore */ }
                throw new Error(msg)
            }
            const updated = mapParticipant(await res.json())
            const idx = participants.value.findIndex(p => p.id === id)
            if (idx !== -1) participants.value[idx] = updated
            return updated
        } catch (err) {
            error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function deleteParticipant(id) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest(`/api/participants/${id}/`, { method: 'DELETE' })
            if (!res.ok && res.status !== 204) throw new Error(`刪除失敗 (${res.status})`)
            participants.value = participants.value.filter(p => p.id !== id)
        } catch (err) {
            error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function checkinByToken(token) {
        loading.value = true
        error.value = null
        try {
            const res = await apiRequest('/api/participants/checkin_by_token/', {
                method: 'POST',
                body: JSON.stringify({ token }),
            })
            if (!res.ok) {
                let msg = `報到失敗 (${res.status})`
                try { const e = await res.json();
                    msg = e.detail || e.message || JSON.stringify(e) } catch { /* ignore */ }
                throw new Error(msg)
            }
            const data = await res.json()
            const updated = mapParticipant(data.participant)
            const idx = participants.value.findIndex(p => p.id === updated.id)
            if (idx !== -1) participants.value[idx] = updated
            return { message: data.message, participant: updated }
        } catch (err) {
            error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function checkIn(id) {
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

    async function checkOut(id) {
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

    async function regenerateQr(id) {
        const res = await apiRequest(`/api/participants/${id}/regenerate_qr/`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error(`重新產生 QR Code 失敗 (${res.status})`)
        const data = await res.json()
        const newUrl = data.qr_code_url
        const idx = participants.value.findIndex(p => p.id === id)
        if (idx !== -1) participants.value[idx].qrCodeUrl = newUrl
        return newUrl
    }

    async function fetchStatistics(eventId) {
        const url = eventId ?
            `/api/participants/statistics/?event=${eventId}` :
            '/api/participants/statistics/'
        const res = await apiRequest(url)
        if (!res.ok) throw new Error('取得統計資料失敗')
        return res.json()
    }

    function clearError() { error.value = null }

    function clear() { participants.value = [];
        error.value = null }

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
        clearError,
        clear,
    }
})

// =========================================================
// 公開報名 Store（前台，不需登入，使用 plain fetch）
// =========================================================
export const usePublicRegisterStore = defineStore('publicRegister', () => {
    const page = ref(null)
    const loading = ref(false)
    const error = ref(null)
    const submitted = ref(false)
    const submittedParticipant = ref(null)
    const BASE = API_BASE_URL

    async function fetchPage(shortLink) {
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
            if (!error.value) error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function submitRegistration(shortLink, formData) {
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
                    error.value = Object.entries(errData)
                        .map(([, msgs]) => (Array.isArray(msgs) ? msgs.join(', ') : msgs))
                        .join('；')
                } else {
                    error.value = `報名失敗 (${res.status})`
                }
                throw new Error(error.value)
            }
            const data = await res.json()
            submitted.value = true
            submittedParticipant.value = data.participant
            return data
        } catch (err) {
            if (!error.value) error.value = err.message
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
