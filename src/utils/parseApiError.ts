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
