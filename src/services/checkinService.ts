/**
 * 掃碼報到統一服務
 *
 * 收斂四個 callsite 的差異：
 * - stores/participants.ts（後台名單觸發 + 同步本地清單）
 * - MobileScanner.vue（需自處理 401，不走 api.ts 自動重導）
 * - MobilePrintDispatch.vue（手機掃碼 → 派站）
 * - Badges/Printer.vue（後台列印頁掃碼）
 *
 * 統一規則：
 * 1. token 解析（JSON envelope / 純字串 / external_ticket_id）
 * 2. 錯誤 mapping（kind + status + message）
 * 3. 雙軌 — UUID / 純數字票號都交由後端判斷
 */

import { apiRequest, API_BASE_URL } from '@/utils/api'
import { getAccessToken } from '@/utils/authStorage'

export type CheckinErrorKind =
    | 'empty_token'
    | 'unauthorized'
    | 'not_found'
    | 'rate_limit'
    | 'invalid'
    | 'server'

export class CheckinError extends Error {
    kind: CheckinErrorKind
    status?: number
    constructor(kind: CheckinErrorKind, message: string, status?: number) {
        super(message)
        this.name = 'CheckinError'
        this.kind = kind
        this.status = status
    }
}

export interface RawCheckinParticipant {
    name?: string
    company?: string
    title?: string
    type?: string
    [k: string]: unknown
}

export type CheckinResult = {
    /** 後端回傳的 participant 物件（原 schema，未經 mapParticipant） */
    participant: RawCheckinParticipant
    /** 後端 message，例如「報到成功」 */
    message: string
}

export type CheckinOptions = {
    /**
     * MobileScanner 等需自處理 401 UI（顯示「請先登入」按鈕）的頁面開啟此選項，
     * 走 raw fetch 避免 api.ts 自動跳轉 /login。
     */
    disableAuthRedirect?: boolean
}

/**
 * 把掃描到的 raw QR 內容拆成單純 token 字串。
 * - JSON envelope: `{ "token": "..." }` 或 `{ "check_in_token": "..." }`
 * - 純字串（UUID / 數字票號）
 */
export function parseTokenFromQr(raw: string): string {
    let token = raw
    try {
        const parsed = JSON.parse(raw)
        if (parsed?.token) token = parsed.token
        else if (parsed?.check_in_token) token = parsed.check_in_token
    } catch {
        // 純字串 token
    }
    return String(token || '').trim()
}

const mapStatusToKind = (status: number): CheckinErrorKind => {
    if (status === 401) return 'unauthorized'
    if (status === 404) return 'not_found'
    if (status === 429) return 'rate_limit'
    if (status === 400) return 'invalid'
    if (status >= 500) return 'server'
    return 'invalid'
}

/**
 * 統一報到入口。
 * 成功 → 回傳 { participant, message }
 * 失敗 → throw CheckinError（含 kind/status/message）
 */
export async function checkinByToken(
    token: string,
    opts: CheckinOptions = {},
): Promise<CheckinResult> {
    const trimmed = String(token || '').trim()
    if (!trimmed) {
        throw new CheckinError('empty_token', '無效的 QR Code，請重新掃描')
    }

    let res: Response
    if (opts.disableAuthRedirect) {
        const accessToken = getAccessToken()
        res = await fetch(`${API_BASE_URL}/api/participants/checkin_by_token/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({ token: trimmed }),
        })
    } else {
        res = await apiRequest('/api/participants/checkin_by_token/', {
            method: 'POST',
            body: JSON.stringify({ token: trimmed }),
        })
    }

    if (!res.ok) {
        let message = `報到失敗 (${res.status})`
        try {
            const data = await res.json()
            message = data?.detail || data?.message || message
        } catch {
            // body 不是 json，沿用預設 message
        }
        throw new CheckinError(mapStatusToKind(res.status), message, res.status)
    }

    const data = await res.json()
    return {
        participant: data.participant || data,
        message: data.message || '報到成功',
    }
}
