/**
 * 公開 API 請求工具（不帶 JWT，用於前台報名頁等）
 *
 * 與 apiRequest 平行，但不走 token refresh 流程。
 */

import { API_BASE_URL } from '@/utils/api'

const fetchWithTimeout = (url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    return fetch(url, { ...options, signal: controller.signal })
        .catch((err) => {
            if (err.name === 'AbortError') throw new Error('請求超時，請檢查網路連線')
            throw err
        })
        .finally(() => clearTimeout(timer))
}

export async function publicGet<T = unknown>(path: string): Promise<T> {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`)
    if (res.status === 404) throw new Error('NOT_FOUND')
    if (!res.ok) throw new Error(`請求失敗 (${res.status})`)
    return res.json() as Promise<T>
}

export async function publicPost<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        // 嘗試解析後端錯誤
        const errData = await res.json().catch(() => null)
        if (errData && typeof errData === 'object') {
            const msg = Object.entries(errData as Record<string, unknown>)
                .map(([, msgs]) => (Array.isArray(msgs) ? msgs.join(', ') : msgs))
                .join('；')
            throw new Error(msg)
        }
        throw new Error(`請求失敗 (${res.status})`)
    }
    return res.json() as Promise<T>
}
