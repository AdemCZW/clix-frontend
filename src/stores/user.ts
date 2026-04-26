import { defineStore } from "pinia"
import { ref, computed } from "vue"
import { apiRequest } from "@/utils/api"
import type { User, LoginResponse } from "@/types"

export const useUserStore = defineStore("user", () => {
    const isAuthenticated = ref(false)
    const user = ref<User | null>(null)
    const authToken = ref<string | null>(null)
    const isSuperAdmin = computed(() => !!(user.value && user.value.is_superuser))

    const clearAuthStorage = () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_data')
        clearCurrentEventKeys()
    }

    const isJwtExpired = (token: string) => {
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

    const clearCurrentEventKeys = () => {
        localStorage.removeItem('current_event')
        Object.keys(localStorage).forEach((key) => {
            if (key.startsWith('current_event__')) {
                localStorage.removeItem(key)
            }
        })
    }

    // 檢查是否已登入
    const checkAuth = () => {
        const token = localStorage.getItem("access_token")
        const userData = localStorage.getItem("user_data")

        if (!token || !userData || isJwtExpired(token)) {
            authToken.value = null
            user.value = null
            isAuthenticated.value = false
            clearAuthStorage()
            return false
        }

        try {
            authToken.value = token
            user.value = JSON.parse(userData) as User
            isAuthenticated.value = true
            return true
        } catch {
            authToken.value = null
            user.value = null
            isAuthenticated.value = false
            clearAuthStorage()
            return false
        }
    }

    // 登入 (呼叫 POST /api/auth/login/)
    const login = async (username: string, password: string) => {
        const res = await apiRequest('/api/auth/login/', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
            skipAuthRefresh: true,
        })

        if (!res.ok) {
            const err: Record<string, unknown> = await res.json()
            const msg = (err.detail as string | undefined)
                || (Array.isArray(err.non_field_errors) && (err.non_field_errors as string[])[0])
                || '帳號或密碼錯誤'
            throw new Error(msg)
        }

        const data: LoginResponse = await res.json()

        localStorage.setItem('access_token', data.access)
        localStorage.setItem('refresh_token', data.refresh)
        localStorage.setItem('user_data', JSON.stringify(data.user))

        authToken.value = data.access
        user.value = data.user
        isAuthenticated.value = true

        // 每次登入都要求重新選擇活動
        clearCurrentEventKeys()

        return { success: true, user: data.user }
    }

    // 登出 (呼叫 POST /api/auth/logout/)
    const logout = async () => {
        try {
            const refresh = localStorage.getItem('refresh_token')
            if (refresh) {
                await apiRequest('/api/auth/logout/', {
                    method: 'POST',
                    body: JSON.stringify({ refresh }),
                    skipAuthRefresh: true,
                })
            }
        } catch {
            // 忽略登出 API 失敗，仍清除本地憑證
        }

        authToken.value = null
        user.value = null
        isAuthenticated.value = false

        clearAuthStorage()
    }

    return {
        isAuthenticated,
        user,
        authToken,
        isSuperAdmin,
        checkAuth,
        login,
        logout,
    }
})
