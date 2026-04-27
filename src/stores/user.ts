import { defineStore } from "pinia"
import { ref, computed } from "vue"
import { apiRequest } from "@/utils/api"
import {
    getAccessToken,
    getRefreshToken,
    setTokens,
    getStoredUser,
    setStoredUser,
    isJwtExpired,
    clearAuth,
    clearCurrentEventKeys,
    clearAll,
} from "@/utils/authStorage"
import type { User, LoginResponse } from "@/types"

export const useUserStore = defineStore("user", () => {
    const isAuthenticated = ref(false)
    const user = ref<User | null>(null)
    const authToken = ref<string | null>(null)
    const isSuperAdmin = computed(() => !!(user.value && user.value.is_superuser))

    const checkAuth = () => {
        const token = getAccessToken()
        const userData = getStoredUser<User>()

        if (!token || !userData || isJwtExpired(token)) {
            authToken.value = null
            user.value = null
            isAuthenticated.value = false
            clearAll()
            return false
        }

        authToken.value = token
        user.value = userData
        isAuthenticated.value = true
        return true
    }

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

        setTokens(data.access, data.refresh)
        setStoredUser(data.user)

        authToken.value = data.access
        user.value = data.user
        isAuthenticated.value = true

        clearCurrentEventKeys()

        return { success: true, user: data.user }
    }

    const logout = async () => {
        try {
            const refresh = getRefreshToken()
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

        clearAll()
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
