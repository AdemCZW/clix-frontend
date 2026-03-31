import { defineStore } from "pinia"
import { reactive, ref, watch } from "vue"
import { apiRequest } from "@/utils/api"
import type { SeatLayout, Seat, ActivitySeats } from "@/types"

const LS_LAYOUT = "seatMgr_layout"
const LS_SEATS = "seatMgr_seats"

const loadLayout = (): SeatLayout | null => {
  try { return JSON.parse(localStorage.getItem(LS_LAYOUT)!) } catch { return null }
}
const loadSeats = (): ActivitySeats | null => {
  try { return JSON.parse(localStorage.getItem(LS_SEATS)!) } catch { return null }
}

// 深層合併，保留 reactive 物件的代理
const applySeats = (target: ActivitySeats, source: ActivitySeats) => {
  for (const key of Object.keys(source)) {
    target[key] = source[key]
  }
  // 移除已不存在的 key
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key]
  }
}

const makeSeat = (index: number): Seat => ({
  id: `s-${Date.now()}-${index}`,
  label: `座-${index + 1}`,
  attendee: [],
})

export const useSeatsStore = defineStore("seats", () => {
  const layout = reactive<SeatLayout>(loadLayout() || { rows: 3, cols: 5 })

  const activitySeats = reactive<ActivitySeats>(loadSeats() || {
    act_01: Array.from({ length: 15 }, (_, i) => ({
      id: `s-${i}`,
      label: `座-${i + 1}`,
      attendee: [],
    })),
  })

  // 寫入 localStorage（只在本分頁修改時）
  watch(layout, (val) => localStorage.setItem(LS_LAYOUT, JSON.stringify(val)), { deep: true })
  watch(activitySeats, (val) => localStorage.setItem(LS_SEATS, JSON.stringify(val)), { deep: true })

  // 跨分頁同步：監聽其他分頁寫入 localStorage 的 storage 事件
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_SEATS && e.newValue) {
      try {
        const incoming: ActivitySeats = JSON.parse(e.newValue)
        applySeats(activitySeats, incoming)
      } catch { /* 忽略解析錯誤 */ }
    }
    if (e.key === LS_LAYOUT && e.newValue) {
      try {
        const incoming: SeatLayout = JSON.parse(e.newValue)
        Object.assign(layout, incoming)
      } catch { /* 忽略解析錯誤 */ }
    }
  }
  window.addEventListener("storage", onStorage)

  const ensureActivity = (actId: string) => {
    if (!activitySeats[actId]) {
      activitySeats[actId] = Array.from({ length: layout.rows * layout.cols }, (_, i) => makeSeat(i))
    }
  }

  const addRow = (actId: string) => {
    ensureActivity(actId)
    layout.rows++
    const seats = activitySeats[actId]
    const newCount = layout.rows * layout.cols
    while (seats.length < newCount) {
      seats.push(makeSeat(seats.length))
    }
  }

  const addCol = (actId: string) => {
    ensureActivity(actId)
    layout.cols++
    const seats = activitySeats[actId]
    const newCount = layout.rows * layout.cols
    while (seats.length < newCount) {
      seats.push(makeSeat(seats.length))
    }
  }

  // 從後端載入座位（只在 localStorage 沒有該活動資料時呼叫）
  const loadFromBackend = async (eventId: number) => {
    const actId = `event_${eventId}`
    // 如果 localStorage 已有資料，不覆蓋
    if (activitySeats[actId] && activitySeats[actId].length > 0) {
      const hasAnyPerson = activitySeats[actId].some((s: Seat) => s.attendee.length > 0)
      if (hasAnyPerson) return // 本地已有分配，不從後端拉
    }

    try {
      // 拉 layout
      const layoutRes = await apiRequest(`/api/seats/layout/${eventId}/`)
      if (layoutRes.ok) {
        const data = await layoutRes.json()
        layout.rows = data.rows
        layout.cols = data.cols
      }

      // 拉 assignments + seat_metas
      const assignRes = await apiRequest(`/api/seats/assignments/${eventId}/`)
      if (!assignRes.ok) return
      const resData = await assignRes.json()
      const assignments: Array<{
        seat_index: number; seat_label: string;
        participant: number; participant_name: string;
        participant_type: string; participant_company: string;
      }> = resData.assignments || resData
      const metasData: Array<{ seat_index: number; status: string }> = resData.seat_metas || []

      // 載入座位狀態
      for (const m of metasData) {
        setSeatMeta(actId, m.seat_index, m.status)
      }

      // 沒有後端資料就不覆蓋
      if (assignments.length === 0 && metasData.length === 0) return

      // 建立座位陣列
      const totalSeats = layout.rows * layout.cols
      const seats: Seat[] = Array.from({ length: totalSeats }, (_, i) => makeSeat(i))
      for (const a of assignments) {
        if (a.seat_index < seats.length) {
          seats[a.seat_index] = {
            id: `s-${a.seat_index}`,
            label: a.seat_label || `座-${a.seat_index + 1}`,
            attendee: [{
              id: a.participant,
              name: a.participant_name,
              type: a.participant_type,
              company: a.participant_company,
            }],
          }
        }
      }
      activitySeats[actId] = seats
    } catch (err) {
      console.error('loadFromBackend error:', err)
    }
  }

  // 座位狀態（走道/保留座）— 用 ref 確保響應式更新
  const seatMetasMap = ref<Record<string, string>>({})

  const getSeatMeta = (actId: string, idx: number): string | null => {
    return seatMetasMap.value[`${actId}_${idx}`] || null
  }

  const setSeatMeta = (actId: string, idx: number, status: string | null) => {
    const key = `${actId}_${idx}`
    const newMap = { ...seatMetasMap.value }
    if (status) newMap[key] = status
    else delete newMap[key]
    seatMetasMap.value = newMap // 整個替換觸發響應式
  }

  return { layout, activitySeats, ensureActivity, addRow, addCol, loadFromBackend, seatMetasMap, getSeatMeta, setSeatMeta }
})
