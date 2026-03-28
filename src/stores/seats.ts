import { defineStore } from "pinia"
import { reactive, ref } from "vue"
import { apiRequest } from "@/utils/api"
import type { SeatLayout, Seat, ActivitySeats, SeatAttendee } from "@/types"

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
  const loaded = ref(false) // 是否已從後端載入過

  // ─── 從後端載入 ─────────────────────────────────────────────
  const fetchLayout = async (eventId: number) => {
    try {
      const res = await apiRequest(`/api/seats/layout/${eventId}/`)
      if (!res.ok) return
      const data = await res.json()
      layout.rows = data.rows
      layout.cols = data.cols
    } catch (err) {
      console.error('fetchLayout error:', err)
    }
  }

  const fetchAssignments = async (eventId: number) => {
    try {
      const res = await apiRequest(`/api/seats/assignments/${eventId}/`)
      if (!res.ok) return
      const data: Array<{
        seat_index: number
        seat_label: string
        participant: number
        participant_name: string
        participant_type: string
        participant_company: string
      }> = await res.json()

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
    } catch (err) {
      console.error('fetchAssignments error:', err)
    }
  }

  const loadEventSeats = async (eventId: number) => {
    loading.value = true
    try {
      await fetchLayout(eventId)
      await fetchAssignments(eventId)
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  // ─── 儲存到後端 ─────────────────────────────────────────────
  const saveLayout = async (eventId: number) => {
    const res = await apiRequest(`/api/seats/layout/${eventId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ rows: layout.rows, cols: layout.cols }),
    })
    if (!res.ok) throw new Error('儲存座位配置失敗')
  }

  const saveAssignments = async (eventId: number) => {
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
  }

  const saveAll = async (eventId: number) => {
    saving.value = true
    try {
      await saveLayout(eventId)
      return await saveAssignments(eventId)
    } finally {
      saving.value = false
    }
  }

  // ─── 本地操作 ─────────────────────────────────────────────
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
    while (seats.length < newCount) {
      seats.push(makeSeat(seats.length))
    }
  }

  const addCol = (actId: string) => {
    layout.cols++
    const seats = activitySeats[actId]
    if (!seats) return
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
    loaded,
    fetchLayout,
    fetchAssignments,
    loadEventSeats,
    saveLayout,
    saveAssignments,
    saveAll,
    ensureActivity,
    addRow,
    addCol,
  }
})
