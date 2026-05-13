/**
 * API 工具模組
 * 處理 JWT Token 自動刷新、統一 Authorization Header
 *
 * 開發環境：Vite proxy 將 /api/* 轉發到後端（無 CORS 問題）
 * 正式環境：透過 VITE_API_BASE_URL 環境變數指定後端完整 URL
 */

import { getAccessToken, getRefreshToken, setTokens, clearAuth } from '@/utils/authStorage'

const BASE_URL =
    (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

type ApiRequestOptions = RequestInit & {
    skipAuthRefresh?: boolean
}

let refreshPromise: Promise<string> | null = null

// P1.7：登入過期前留訊息給 LoginView，並帶 redirect 讓登入後回原頁
// 用 sessionStorage 跨組件傳遞（api.ts 在 Vue setup context 外，無法直接呼 useToast）
const clearAuthAndRedirect = (): never => {
    clearAuth()
    try {
        sessionStorage.setItem('auth_expired_toast', '1')
    } catch {
        // 隱私模式可能擋下 sessionStorage，靜默 — toast 沒了但流程仍正確
    }
    // hash router：當前路徑來自 location.hash，剝掉前置 #
    const currentHash = window.location.hash || ''
    const currentPath = currentHash.replace(/^#/, '').split('?')[0]
    // 已經在 /login（或無路徑）就不重導；避免登入頁自身 401 造成 redirect 循環
    if (!currentPath || currentPath.startsWith('/login')) {
        window.location.href = '/#/login'
    } else {
        const redirectParam = encodeURIComponent(currentPath)
        window.location.href = `/#/login?redirect=${redirectParam}`
    }
    throw new Error('Authentication expired, please login again')
}

const getHeaders = (): Record<string, string> => {
    const token = getAccessToken()
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
}

const refreshAccessToken = async (): Promise<string> => {
    const refresh = getRefreshToken()
    if (!refresh) throw new Error('No refresh token')

    const res = await fetch(`${BASE_URL}/api/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
    })

    if (!res.ok) throw new Error('Token refresh failed')

    const data: { access: string; refresh?: string } = await res.json()
    setTokens(data.access, data.refresh)
    return data.access
}

const refreshAccessTokenOnce = async (): Promise<string> => {
    if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null
        })
    }
    return refreshPromise
}

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

export const apiRequest = async (path: string, options: ApiRequestOptions = {}): Promise<Response> => {
    const url = `${BASE_URL}${path}`
    const { skipAuthRefresh = false, ...requestOptions } = options

    const isFormData = requestOptions.body instanceof FormData
    const makeHeaders = (): Record<string, string> => {
        const token = getAccessToken()
        const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
        if (isFormData) {
            return { ...auth, ...(requestOptions.headers as Record<string, string>) }
        }
        return { ...getHeaders(), ...(requestOptions.headers as Record<string, string>) }
    }

    let response = await fetchWithTimeout(url, {
        ...requestOptions,
        headers: makeHeaders(),
    })

    if (!skipAuthRefresh && response.status === 401) {
        try {
            await refreshAccessTokenOnce()
        } catch {
            clearAuthAndRedirect()
        }

        response = await fetchWithTimeout(url, {
            ...requestOptions,
            headers: makeHeaders(),
        })

        if (response.status === 401) {
            clearAuthAndRedirect()
        }
    }

    return response
}

export const API_BASE_URL = BASE_URL
