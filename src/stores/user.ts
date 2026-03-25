import { defineStore } from "pinia"
import { ref, computed } from "vue"
import { apiRequest, API_BASE_URL } from "@/utils/api"
import type { User, LoginResponse } from "@/types"

export const useUserStore = defineStore("user", () => {
    const isAuthenticated = ref(false)
    const user = ref<User | null>(null)
    const authToken = ref<string | null>(null)
    const isSuperAdmin = computed(() => !!(user.value && user.value.is_superuser))

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
        if (token && userData) {
            authToken.value = token
            user.value = JSON.parse(userData) as User
            isAuthenticated.value = true
            return true
        }
        return false
    }

    // 登入 (呼叫 POST /api/auth/login/)
    const login = async (username: string, password: string) => {
        const res = await fetch(`${API_BASE_URL}/api/auth/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
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
                })
            }
        } catch {
            // 忽略登出 API 失敗，仍清除本地憑證
        }

        authToken.value = null
        user.value = null
        isAuthenticated.value = false

        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_data')
        clearCurrentEventKeys()
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
