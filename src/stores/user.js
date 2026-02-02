import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useUserStore = defineStore("user", () => {
    const onboarded = ref(false);
    const series = ref([]);
    const events = ref([]);
    const currentSeries = ref(null);
    const currentEvent = ref(null);

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
        isOnboarded,
        currentEventDisplay,
        completeOnboarding,
        switchEvent,
        switchSeries,
        addEvent,
        addSeries,
        initFromStorage,
        resetOnboarding,
    };
});
