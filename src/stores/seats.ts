import { defineStore } from "pinia"
import { reactive, ref } from "vue"
import { apiRequest } from "@/utils/api"
import type { SeatLayout, Seat, ActivitySeats, SeatAttendee } from "@/types"

const LS_LAYOUT = "seatMgr_layout"
const LS_SEATS = "seatMgr_seats"

const makeSeat = (index: number): Seat => ({
  id: `s-${Date.now()}-${index}`,
  label: `座-${index + 1}`,
  attendee: [],
})

export const useSeatsStore = defineStore("seats", () => {
  const layout = reactive<SeatLayout>({ rows: 3, cols: 5 })
  const activitySeats = reactive<ActivitySeats>({})
  const loading = ref(false)
  const saving = ref(false)
  const loaded = ref(false)

  // ─── localStorage 手動同步（不用 watch，由操作觸發）──────────
  const broadcastToOtherTabs = () => {
    try {
      localStorage.setItem(LS_LAYOUT, JSON.stringify(layout))
      localStorage.setItem(LS_SEATS, JSON.stringify(activitySeats))
    } catch { /* ignore */ }
  }

  // 監聽其他分頁的變更（監控頁接收 SeatManager 的更新）
  if (typeof window !== 'undefined') {
    window.addEventListener("storage", (e: StorageEvent) => {
      if (e.key === LS_SEATS && e.newValue) {
        try {
          const incoming: ActivitySeats = JSON.parse(e.newValue)
          for (const key of Object.keys(incoming)) {
            activitySeats[key] = incoming[key]
          }
        } catch { /* ignore */ }
      }
      if (e.key === LS_LAYOUT && e.newValue) {
        try {
          Object.assign(layout, JSON.parse(e.newValue))
        } catch { /* ignore */ }
      }
    })
  }

  // ─── 從後端載入（初始化用）─────────────────────────────────
  const loadEventSeats = async (eventId: number) => {
    loading.value = true
    try {
      // Layout
      const layoutRes = await apiRequest(`/api/seats/layout/${eventId}/`)
      if (layoutRes.ok) {
        const data = await layoutRes.json()
        layout.rows = data.rows
        layout.cols = data.cols
      }

      // Assignments
      const assignRes = await apiRequest(`/api/seats/assignments/${eventId}/`)
      if (assignRes.ok) {
        const data = await assignRes.json()
        const totalSeats = layout.rows * layout.cols
        const actId = `event_${eventId}`
        const seats: Seat[] = Array.from({ length: totalSeats }, (_, i) => makeSeat(i))

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
      }

      loaded.value = true
      broadcastToOtherTabs()
    } catch (err) {
      console.error('loadEventSeats error:', err)
    } finally {
      loading.value = false
    }
  }

  // ─── 儲存到後端 + 廣播到其他分頁 ─────────────────────────────
  const saveAll = async (eventId: number) => {
    saving.value = true
    try {
      await apiRequest(`/api/seats/layout/${eventId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ rows: layout.rows, cols: layout.cols }),
      })

      const actId = `event_${eventId}`
      const seats = activitySeats[actId] || []
      const assignments = seats
        .map((seat: Seat, index: number) => {
          if (seat.attendee.length === 0) return null
          const person = seat.attendee[0] as SeatAttendee
          return { seat_index: index, seat_label: seat.label, participant_id: person.id }
        })
        .filter(Boolean)

      await apiRequest(`/api/seats/assignments/${eventId}/bulk/`, {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      })

      broadcastToOtherTabs()
    } finally {
      saving.value = false
    }
  }

  // ─── 本地操作（拖曳時呼叫，觸發跨分頁廣播）─────────────────
  const notifyChange = () => {
    broadcastToOtherTabs()
  }

  const ensureActivity = (actId: string) => {
    if (!activitySeats[actId]) {
      activitySeats[actId] = Array.from({ length: layout.rows * layout.cols }, (_, i) => makeSeat(i))
    }
  }

  const addRow = (actId: string) => {
    layout.rows++
    const seats = activitySeats[actId]
    if (!seats) return
    const newCount = layout.rows * layout.cols
    while (seats.length < newCount) seats.push(makeSeat(seats.length))
    broadcastToOtherTabs()
  }

  const addCol = (actId: string) => {
    layout.cols++
    const seats = activitySeats[actId]
    if (!seats) return
    const newCount = layout.rows * layout.cols
    while (seats.length < newCount) seats.push(makeSeat(seats.length))
    broadcastToOtherTabs()
  }

  return {
    layout, activitySeats, loading, saving, loaded,
    loadEventSeats, saveAll,
    ensureActivity, addRow, addCol, notifyChange, broadcastToOtherTabs,
  }
})
