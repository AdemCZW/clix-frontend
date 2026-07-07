/**
 * 從失敗的 Response 解析後端錯誤訊息
 */
export async function parseApiError(res: Response, fallback?: string): Promise<string> {
    const defaultMsg = fallback || `請求失敗 (${res.status})`
    try {
        const e: Record<string, unknown> = await res.json()
        return (e.detail as string) || (e.message as string)
            || (e.non_field_errors && Array.isArray(e.non_field_errors) ? (e.non_field_errors as string[]).join(', ') : null)
            || defaultMsg
    } catch {
        return defaultMsg
    }
}

/**
 * 把 DRF 錯誤 body（{ detail } 或 { 欄位: [訊息] } map）格式化成單一字串。
 * detail 優先；否則 non_field_errors 放最前、其餘以「欄位：訊息」呈現，用「；」串接。
 */
export function formatDrfErrors(body: Record<string, unknown>, fallback: string): string {
    if (typeof body?.detail === 'string') return body.detail
    const parts: string[] = []
    for (const [field, val] of Object.entries(body || {})) {
        const msg = Array.isArray(val) ? val.join(', ') : String(val)
        if (field === 'non_field_errors') parts.unshift(msg)
        else parts.push(`${field}：${msg}`)
    }
    return parts.length ? parts.join('；') : fallback
}
