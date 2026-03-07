/**
 * 從失敗的 Response 解析後端錯誤訊息
 * @param {Response} res - fetch Response 物件（!res.ok 時使用）
 * @param {string} fallback - 解析失敗時的預設訊息
 * @returns {Promise<string>} 錯誤訊息字串
 */
export async function parseApiError(res, fallback) {
    const defaultMsg = fallback || `請求失敗 (${res.status})`
    try {
        const e = await res.json()
        return e.detail || e.message || JSON.stringify(e)
    } catch {
        return defaultMsg
    }
}
