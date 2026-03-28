import { defineStore } from "pinia"
import { reactive, ref, watch } from "vue"
import { apiRequest } from "@/utils/api"
import type { SeatLayout, Seat, ActivitySeats, SeatAttendee } from "@/types"

const LS_LAYOUT = "seatMgr_layout"
const LS_SEATS = "seatMgr_seats"

const loadLayout = (): SeatLayout | null => {
  try { return JSON.parse(localStorage.getItem(LS_LAYOUT)!) } catch { return null }
}
const loadSeats = (): ActivitySeats | null => {
  try { return JSON.parse(localStorage.getItem(LS_SEATS)!) } catch { return null }
}

const applySeats = (target: ActivitySeats, source: ActivitySeats) => {
  for (const key of Object.keys(source)) {
    target[key] = source[key]
  }
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
  const activitySeats = reactive<ActivitySeats>(loadSeats() || {})
  const loading = ref(false)
  const saving = ref(false)

  // 寫入 localStorage（跨分頁同步），加防抖避免高頻寫入
  let layoutTimer: ReturnType<typeof setTimeout> | null = null
  let seatsTimer: ReturnType<typeof setTimeout> | null = null
  let isSyncing = false // 防止 onStorage 回寫觸發 watch 循環

  watch(layout, (val) => {
    if (isSyncing) return
    if (layoutTimer) clearTimeout(layoutTimer)
    layoutTimer = setTimeout(() => localStorage.setItem(LS_LAYOUT, JSON.stringify(val)), 300)
  }, { deep: true })

  watch(activitySeats, (val) => {
    if (isSyncing) return
    if (seatsTimer) clearTimeout(seatsTimer)
    seatsTimer = setTimeout(() => localStorage.setItem(LS_SEATS, JSON.stringify(val)), 300)
  }, { deep: true })

  // 跨分頁同步（只接收其他分頁的變更）
  const onStorage = (e: StorageEvent) => {
    isSyncing = true
    if (e.key === LS_SEATS && e.newValue) {
      try { applySeats(activitySeats, JSON.parse(e.newValue)) } catch { /* ignore */ }
    }
    if (e.key === LS_LAYOUT && e.newValue) {
      try { Object.assign(layout, JSON.parse(e.newValue)) } catch { /* ignore */ }
    }
    setTimeout(() => { isSyncing = false }, 50)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener("storage", onStorage)
  }

  // ─── 從後端載入座位配置和分配 ─────────────────────────────────
  const fetchLayout = async (eventId: number) => {
    loading.value = true
    try {
      const res = await apiRequest(`/api/seats/layout/${eventId}/`)
      if (!res.ok) throw new Error('載入座位配置失敗')
      const data = await res.json()
      layout.rows = data.rows
      layout.cols = data.cols
    } catch (err) {
      console.error('fetchLayout error:', err)
    } finally {
      loading.value = false
    }
  }

  const fetchAssignments = async (eventId: number) => {
    loading.value = true
    try {
      const res = await apiRequest(`/api/seats/assignments/${eventId}/`)
      if (!res.ok) throw new Error('載入座位分配失敗')
      const data: Array<{
        seat_index: number
        seat_label: string
        participant: number
        participant_name: string
        participant_type: string
        participant_company: string
      }> = await res.json()

      // 建立座位陣列
      const totalSeats = layout.rows * layout.cols
      const actId = `event_${eventId}`
      const seats: Seat[] = Array.from({ length: totalSeats }, (_, i) => makeSeat(i))

      // 填入後端的分配資料
      for (const a of data) {
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
      console.error('fetchAssignments error:', err)
    } finally {
      loading.value = false
    }
  }

  // 一次載入 layout + assignments
  const loadEventSeats = async (eventId: number) => {
    await fetchLayout(eventId)
    await fetchAssignments(eventId)
  }

  // ─── 儲存到後端 ─────────────────────────────────────────────
  const saveLayout = async (eventId: number) => {
    saving.value = true
    try {
      const res = await apiRequest(`/api/seats/layout/${eventId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: layout.rows, cols: layout.cols }),
      })
      if (!res.ok) throw new Error('儲存座位配置失敗')
    } catch (err) {
      console.error('saveLayout error:', err)
      throw err
    } finally {
      saving.value = false
    }
  }

  const saveAssignments = async (eventId: number) => {
    saving.value = true
    try {
      const actId = `event_${eventId}`
      const seats = activitySeats[actId] || []

      const assignments = seats
        .map((seat: Seat, index: number) => {
          if (seat.attendee.length === 0) return null
          const person = seat.attendee[0] as SeatAttendee
          return {
            seat_index: index,
            seat_label: seat.label,
            participant_id: person.id,
          }
        })
        .filter(Boolean)

      const res = await apiRequest(`/api/seats/assignments/${eventId}/bulk/`, {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      })
      if (!res.ok) throw new Error('儲存座位分配失敗')
      return await res.json()
    } catch (err) {
      console.error('saveAssignments error:', err)
      throw err
    } finally {
      saving.value = false
    }
  }

  // 一次存 layout + assignments
  const saveAll = async (eventId: number) => {
    await saveLayout(eventId)
    return await saveAssignments(eventId)
  }

  // ─── 本地操作（與原有邏輯相容）─────────────────────────────────
  const ensureActivity = (actId: string) => {
    if (!activitySeats[actId]) {
      activitySeats[actId] = Array.from({ length: layout.rows * layout.cols }, (_, i) => makeSeat(i))
    }
  }

  const addRow = (actId: string) => {
    layout.rows++
    const seats = activitySeats[actId]
    const newCount = layout.rows * layout.cols
    while (seats.length < newCount) {
      seats.push(makeSeat(seats.length))
    }
  }

  const addCol = (actId: string) => {
    layout.cols++
    const seats = activitySeats[actId]
    const newCount = layout.rows * layout.cols
    while (seats.length < newCount) {
      seats.push(makeSeat(seats.length))
    }
  }

  return {
    layout,
    activitySeats,
    loading,
    saving,
    // API 操作
    fetchLayout,
    fetchAssignments,
    loadEventSeats,
    saveLayout,
    saveAssignments,
    saveAll,
    // 本地操作
    ensureActivity,
    addRow,
    addCol,
  }
})
