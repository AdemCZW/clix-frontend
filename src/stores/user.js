import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { apiRequest, API_BASE_URL } from "@/utils/api";

export const useUserStore = defineStore("user", () => {
    const onboarded = ref(false);
    const series = ref([]);
    const events = ref([]);
    const currentSeries = ref(null);
    const currentEvent = ref(null);
    const isAuthenticated = ref(false);
    const user = ref(null);
    const authToken = ref(null);
    const isSuperAdmin = computed(() => !!(user.value && user.value.is_superuser));

    // 檢查是否已登入
    const checkAuth = () => {
        const token = localStorage.getItem("access_token");
        const userData = localStorage.getItem("user_data");
        if (token && userData) {
            authToken.value = token;
            user.value = JSON.parse(userData);
            isAuthenticated.value = true;
            return true;
        }
        return false;
    };

    // 登入 (呼叫 POST /api/auth/login/)
    const login = async(username, password) => {
        const res = await fetch(`${API_BASE_URL}/api/auth/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || (err.non_field_errors && err.non_field_errors[0]) || '帳號或密碼錯誤');
        }

        const data = await res.json();

        localStorage.setItem('access_token', data.access);
        localStorage.setItem('refresh_token', data.refresh);
        localStorage.setItem('user_data', JSON.stringify(data.user));

        authToken.value = data.access;
        user.value = data.user;
        isAuthenticated.value = true;

        return { success: true, user: data.user };
    };

    // 登出 (呼叫 POST /api/auth/logout/)
    const logout = async() => {
        try {
            const refresh = localStorage.getItem('refresh_token');
            if (refresh) {
                await apiRequest('/api/auth/logout/', {
                    method: 'POST',
                    body: JSON.stringify({ refresh }),
                });
            }
        } catch {
            // 忽略登出 API 失敗，仍清除本地憑證
        }

        authToken.value = null;
        user.value = null;
        isAuthenticated.value = false;
        onboarded.value = false;
        currentEvent.value = null;

        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('current_event');
    };

    // 檢查是否已完成引導
    const isOnboarded = computed(() => {
        // 這裡可以從 localStorage 或 API 檢查
        const stored = localStorage.getItem("user_onboarded");
        return stored === "true" || onboarded.value;
    });

    // 目前活動顯示名稱
    const currentEventDisplay = computed(() => {
        if (currentEvent.value) {
            return `${currentSeries.value?.name || "未命名系列"} - ${currentEvent.value.name}`;
        }
        return "未選擇活動";
    });

    // 完成引導
    const completeOnboarding = (data) => {
        onboarded.value = true;
        series.value = [data.series];
        events.value = [data.event];
        currentSeries.value = data.series;
        currentEvent.value = data.event;

        // 儲存到 localStorage
        localStorage.setItem("user_onboarded", "true");
        localStorage.setItem("user_series", JSON.stringify(series.value));
        localStorage.setItem("user_events", JSON.stringify(events.value));
        localStorage.setItem("current_event", JSON.stringify(currentEvent.value));
    };

    // 切換活動
    const switchEvent = (event) => {
        currentEvent.value = event;
        // 找到對應的系列
        const eventSeries = series.value.find((s) => s.id === event.seriesId);
        if (eventSeries) {
            currentSeries.value = eventSeries;
        }
        // 儲存到 localStorage
        localStorage.setItem("current_event", JSON.stringify(currentEvent.value));
    };

    // 切換系列
    const switchSeries = (series) => {
        currentSeries.value = series;
        // 如果當前系列有活動，自動切換到第一個活動
        const seriesEvents = events.value.filter((e) => e.seriesId === series.id);
        if (seriesEvents.length > 0 && !currentEvent.value) {
            currentEvent.value = seriesEvents[0];
        }
        // 儲存到 localStorage
        localStorage.setItem("current_series", JSON.stringify(currentSeries.value));
    };

    // 添加新活動
    const addEvent = (eventData) => {
        events.value.push(eventData);
        localStorage.setItem("user_events", JSON.stringify(events.value));
    };

    // 添加新系列
    const addSeries = (seriesData) => {
        series.value.push(seriesData);
        localStorage.setItem("user_series", JSON.stringify(series.value));
    };

    // 初始化時從 localStorage 載入
    const initFromStorage = () => {
        const storedOnboarded = localStorage.getItem("user_onboarded");
        const storedSeries = localStorage.getItem("user_series");
        const storedEvents = localStorage.getItem("user_events");
        const storedCurrentEvent = localStorage.getItem("current_event");

        if (storedOnboarded === "true") {
            onboarded.value = true;
        }

        if (storedSeries) {
            series.value = JSON.parse(storedSeries);
            currentSeries.value = series.value[0] || null;
        }

        if (storedEvents) {
            events.value = JSON.parse(storedEvents);
        }

        if (storedCurrentEvent) {
            currentEvent.value = JSON.parse(storedCurrentEvent);
        }
        // 移除自動設置第一個活動的邏輯，讓用戶每次登入都要選擇
    };

    // 清除資料（用於測試或重置）
    const resetOnboarding = () => {
        onboarded.value = false;
        series.value = [];
        events.value = [];
        currentSeries.value = null;

        localStorage.removeItem("user_onboarded");
        localStorage.removeItem("user_series");
        localStorage.removeItem("user_events");
    };

    return {
        onboarded,
        series,
        events,
        currentSeries,
        currentEvent,
        isAuthenticated,
        user,
        authToken,
        isSuperAdmin,
        isOnboarded,
        currentEventDisplay,
        checkAuth,
        login,
        logout,
        completeOnboarding,
        switchEvent,
        switchSeries,
        addEvent,
        addSeries,
        initFromStorage,
        resetOnboarding,
    };
});
