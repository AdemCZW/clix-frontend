/**
 * Auth token / user data 的 localStorage 存取集中管理
 *
 * 所有讀寫 access_token / refresh_token / user_data 的操作
 * 都應透過此模組，避免 key 散落在多個檔案中。
 */

const KEYS = {
    access: 'access_token',
    refresh: 'refresh_token',
    user: 'user_data',
    currentEvent: 'current_event',
} as const

// ── Token ────────────────────────────────────────────────

export function getAccessToken(): string | null {
    return localStorage.getItem(KEYS.access)
}

export function getRefreshToken(): string | null {
    return localStorage.getItem(KEYS.refresh)
}

export function setTokens(access: string, refresh?: string) {
    localStorage.setItem(KEYS.access, access)
    if (refresh) localStorage.setItem(KEYS.refresh, refresh)
}

// ── User ─────────────────────────────────────────────────

export function getStoredUser<T = unknown>(): T | null {
    const raw = localStorage.getItem(KEYS.user)
    if (!raw) return null
    try { return JSON.parse(raw) as T } catch { return null }
}

export function setStoredUser(user: unknown) {
    localStorage.setItem(KEYS.user, JSON.stringify(user))
}

// ── JWT ──────────────────────────────────────────────────

export function isJwtExpired(token: string): boolean {
    try {
        const payloadBase64 = token.split('.')[1]
        if (!payloadBase64) return true
        const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(normalized)) as { exp?: number }
        if (!payload.exp) return false
        return payload.exp * 1000 <= Date.now()
    } catch {
        return true
    }
}

// ── Clear ────────────────────────────────────────────────

export function clearAuth() {
    localStorage.removeItem(KEYS.access)
    localStorage.removeItem(KEYS.refresh)
    localStorage.removeItem(KEYS.user)
}

export function clearCurrentEventKeys() {
    localStorage.removeItem(KEYS.currentEvent)
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith('current_event__')) {
            localStorage.removeItem(key)
        }
    }
}

export function clearAll() {
    clearAuth()
    clearCurrentEventKeys()
}
