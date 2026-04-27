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

const clearAuthAndRedirect = (): never => {
    clearAuth()
    window.location.href = '/#/login'
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
