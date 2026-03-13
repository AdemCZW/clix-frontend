import { computed } from 'vue'
import { useParticipantsStore } from '@/stores/participants'

/**
 * 報到統計共用 composable
 * 供 Dashboard、CheckIn/History 等頁面共用
 */
export function useCheckinStats() {
    const participantsStore = useParticipantsStore()
    const participants = computed(() => participantsStore.participants)

    // 基本統計
    const stats = computed(() => {
        const all = participants.value
        const checkedIn = all.filter((p) => p.status === '已報到').length
        return {
            total: all.length,
            checkedIn,
            pending: all.length - checkedIn,
            vip: all.filter((p) => p.type === 'VIP').length,
            general: all.filter((p) => p.type === '一般民眾').length,
        }
    })

    // 報到率（百分比整數）
    const checkInRate = computed(() =>
        stats.value.total > 0
            ? Math.round((stats.value.checkedIn / stats.value.total) * 100)
            : 0,
    )

    // 每日報到趨勢（指定天數範圍）
    const dailyTrend = (days) =>
        computed(() => {
            const now = new Date()
            now.setHours(23, 59, 59, 999)

            const dateMap = {}
            for (let i = 0; i < days.value; i++) {
                const d = new Date(now)
                d.setDate(d.getDate() - (days.value - 1 - i))
                dateMap[d.toISOString().slice(0, 10)] = 0
            }

            const startDate = Object.keys(dateMap)[0]
            participants.value
                .filter((p) => p.status === '已報到' && p.updatedAt)
                .forEach((p) => {
                    const dateStr = new Date(p.updatedAt).toISOString().slice(0, 10)
                    if (dateStr >= startDate && dateStr in dateMap) {
                        dateMap[dateStr]++
                    }
                })

            return Object.entries(dateMap).map(([key, value]) => ({
                date: new Date(key),
                value,
            }))
        })

    // 趨勢摘要（期間總計、日均、最高單日）
    const trendSummary = (trendData, days) =>
        computed(() => {
            const data = trendData.value
            const total = data.reduce((s, p) => s + p.value, 0)
            return {
                periodTotal: total,
                dailyAvg: Math.round(total / days.value),
                peakDay: Math.max(...data.map((p) => p.value), 0),
            }
        })

    return {
        participants,
        stats,
        checkInRate,
        dailyTrend,
        trendSummary,
    }
}
