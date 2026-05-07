import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
import { useStoreRequest } from '@/utils/useStoreRequest'
import { useCache } from '@/utils/useCache'
import type { Participant, RawParticipant, RegistrationPage, PublicSubmittedParticipant } from '@/types'

export class ImportValidationError extends Error {
    payload: Record<string, unknown>

    constructor(message: string, payload: Record<string, unknown>) {
        super(message)
        this.name = 'ImportValidationError'
        this.payload = payload
    }
}

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
        // ── 訂單 / 票券 / 自訂（5/5 schema）─────────────────────
        formAnswers: p.form_answers ?? {},
        orderId: p.order ?? null,
        orderNumber: p.order_number ?? '',
        buyerName: p.buyer_name ?? '',
        buyerEmail: p.buyer_email ?? '',
        buyerPhone: p.buyer_phone ?? '',
        paymentMethod: p.payment_method ?? '',
        paymentStatus: p.payment_status ?? '',
        paidAt: p.paid_at ?? null,
        cardLast4: p.card_last4 ?? '',
        promoCode: p.promo_code ?? '',
        note: p.note ?? '',
        ticketId: p.ticket ?? null,
        ticketName: p.ticket_name ?? '',
        ticketNumber: p.ticket_number ?? '',
        ticketPrice: p.ticket_price ?? '',
        validFrom: p.valid_from ?? null,
        validTo: p.valid_to ?? null,
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
            // 改打 hybrid endpoint：支援逐筆錯誤回報、相容新舊 Excel 格式
            // event 在 top-level 帶（後端會強制注入到每筆，不信任 row 內自帶的 event）
            const res = await apiRequest('/api/participants/bulk_import_hybrid/', {
                method: 'POST',
                body: JSON.stringify({ event: eventId, strict: true, participants: data }),
            })
            if (!res.ok) {
                let payload: Record<string, unknown> | null = null
                try {
                    payload = await res.json()
                } catch {
                    payload = null
                }

                if (payload && Array.isArray(payload.errors)) {
                    throw new ImportValidationError(
                        String(payload.message || `批量匯入失敗 (${res.status})`),
                        payload,
                    )
                }

                throw new Error(
                    payload
                        ? String(payload.detail || payload.message || `批量匯入失敗 (${res.status})`)
                        : await parseApiError(res, `批量匯入失敗 (${res.status})`),
                )
            }
            cache.invalidate()
            const raw = await res.json()
            // hybrid response: { success: bool, mode, count|success_count, error_count, data, errors, message }
            // 舊 caller 期望 { success: number, failed: number, errors, mode, ... }
            // 統一 normalize 成舊格式，避免 List.vue 也跟著改
            return {
                ...raw,
                success: raw.success_count ?? raw.count ?? (Array.isArray(raw.data) ? raw.data.length : 0),
                failed: raw.error_count ?? (Array.isArray(raw.errors) ? raw.errors.length : 0),
                errors: raw.errors ?? [],
            }
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

// ── 公開報名後端回傳的 order 結構（snake_case，僅用於成功頁顯示）──
export interface PublicSubmittedOrder {
    id: number
    order_number: string
    buyer_name: string
    buyer_email: string
    buyer_phone: string
    payment_method?: string
    payment_status?: string
    paid_at?: string | null
    total_amount: number
    promo_code?: string
    note?: string
    created_at?: string
}

// 把後端 raw participant 拍平成成功頁用的 camelCase 型別
// 後端目前已是 snake_case，但保留 camelCase fallback 以容忍未來中介層轉換
function toPublicSubmittedParticipant(raw: any): PublicSubmittedParticipant {
    return {
        id: Number(raw?.id ?? 0),
        name: String(raw?.name ?? ''),
        email: String(raw?.email ?? ''),
        phone: String(raw?.phone ?? ''),
        company: String(raw?.company ?? ''),
        title: String(raw?.title ?? ''),
        type: String(raw?.type ?? ''),
        ticketId:
            (typeof raw?.ticket === 'number' ? raw.ticket : null)
            ?? (typeof raw?.ticket_id === 'number' ? raw.ticket_id : null)
            ?? (typeof raw?.ticketId === 'number' ? raw.ticketId : null),
        ticketName: String(raw?.ticket_name ?? raw?.ticketName ?? ''),
        ticketNumber: String(raw?.ticket_number ?? raw?.ticketNumber ?? ''),
        checkInToken: String(raw?.check_in_token ?? raw?.checkInToken ?? ''),
        qrCodeUrl: String(raw?.qr_code_url ?? raw?.qrCodeUrl ?? ''),
    }
}

export const usePublicRegisterStore = defineStore('publicRegister', () => {
    const page = ref<RegistrationPage | null>(null)
    const { loading, error, run } = useStoreRequest()
    const submitted = ref(false)
    // submittedParticipant 保留作舊畫面 fallback；新畫面請優先讀 submittedParticipants / submittedOrder
    // 三者都是「公開報名成功頁」專用型別（PublicSubmittedParticipant），不要當成一般後台 Participant 使用
    const submittedParticipant = ref<PublicSubmittedParticipant | null>(null)
    const submittedParticipants = ref<PublicSubmittedParticipant[]>([])
    const submittedOrder = ref<PublicSubmittedOrder | null>(null)
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
            // 後端回傳：{ message, order, participants[], participant (向下相容) }
            const data = await publicPost<{
                message?: string
                order?: PublicSubmittedOrder | null
                participants?: any[]
                participant?: any | null
            }>(`/api/public/register/${shortLink}/`, formData)

            const rawParticipants = data.participants ?? (data.participant ? [data.participant] : [])
            const normalized = rawParticipants.map(toPublicSubmittedParticipant)

            submitted.value = true
            submittedOrder.value = data.order ?? null
            submittedParticipants.value = normalized
            // 舊畫面 fallback：取第一位 participant
            submittedParticipant.value = normalized[0] ?? null
            return data
        })

    function reset() {
        page.value = null
        submitted.value = false
        submittedParticipant.value = null
        submittedParticipants.value = []
        submittedOrder.value = null
        error.value = null
    }

    return {
        page,
        loading,
        error,
        submitted,
        submittedParticipant,
        submittedParticipants,
        submittedOrder,
        fetchPage,
        submitRegistration,
        reset,
    }
})
