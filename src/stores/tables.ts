import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'
import { parseApiError } from '@/utils/parseApiError'
import { useStoreRequest } from '@/utils/useStoreRequest'

// 會場桌位（VenueMap）— 對應後端 Table model
//
// API：
//   GET    /api/events/<event_id>/tables/                    取桌位列表
//   POST   /api/events/<event_id>/tables/                    建立單張桌
//   DELETE /api/events/<event_id>/tables/<table_id>/         刪除單張桌
//   PATCH  /api/events/<event_id>/tables/bulk-coords/        批次更新座標
//
// 設計：bulkUpdateCoords 走 debounce（拖曳結束後再合併打），避免 move 過程狂打 API。

export interface VenueTable {
  id: number
  x: number
  y: number
  label: string
  capacity: number
  shape: 'round' | 'rect'
}

export const useTablesStore = defineStore('tables', () => {
  const tables = ref<VenueTable[]>([])
  const { loading, error, run, clearError } = useStoreRequest()

  async function fetchTables(eventId: number) {
    return run(async () => {
      const res = await apiRequest(`/api/events/${eventId}/tables/`)
      if (!res.ok) throw new Error(`取桌位失敗 (${res.status})`)
      tables.value = (await res.json()) as VenueTable[]
      return tables.value
    })
  }

  async function createTable(eventId: number, payload: Partial<VenueTable>) {
    return run(async () => {
      const res = await apiRequest(`/api/events/${eventId}/tables/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await parseApiError(res, `建立桌位失敗 (${res.status})`))
      const created: VenueTable = await res.json()
      tables.value.push(created)
      return created
    })
  }

  async function deleteTable(eventId: number, tableId: number) {
    return run(async () => {
      const res = await apiRequest(`/api/events/${eventId}/tables/${tableId}/`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) {
        throw new Error(await parseApiError(res, `刪除失敗 (${res.status})`))
      }
      tables.value = tables.value.filter((t) => t.id !== tableId)
      // 後端會同步清掉該桌範圍 seat_index 的 SeatAssignment，前端也要清乾淨
      // 直接從本地 seatAssignments 移除該桌範圍（seat_index = tableId * 100 ~ +99）
      const lo = tableId * 100
      const hi = lo + 100
      let clearedCount = 0
      for (const si of Object.keys(seatAssignments.value)) {
        const idx = Number(si)
        if (idx >= lo && idx < hi) {
          delete seatAssignments.value[idx]
          clearedCount++
        }
      }
      // 解析 response 的 cleared_assignments_count（200 OK），做最後保險（理論上跟本地一致）
      try {
        const body = await res.json()
        if (typeof body?.cleared_assignments_count === 'number') {
          return { clearedCount: body.cleared_assignments_count as number }
        }
      } catch { /* 204 沒 body 或 parse 失敗：用 local count */ }
      return { clearedCount }
    })
  }

  // ── 批次更新座標（debounce 用） ────────────────────────────
  // 拖曳結束時收集 dirty ids，500ms 後合併打一次 API
  // 多次拖曳同一張桌只會送最後一次的座標
  let dirtyIds = new Set<number>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function queueBulkCoords(eventId: number, tableId: number) {
    dirtyIds.add(tableId)
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => flushBulkCoords(eventId), 500)
  }

  async function flushBulkCoords(eventId: number) {
    if (dirtyIds.size === 0) return
    const idsToSync = Array.from(dirtyIds)
    dirtyIds = new Set()  // 先清，避免下個拖曳衝突
    flushTimer = null

    const coords = idsToSync
      .map((id) => tables.value.find((t) => t.id === id))
      .filter((t): t is VenueTable => !!t)
      .map((t) => ({ id: t.id, x: t.x, y: t.y }))

    if (coords.length === 0) return

    try {
      const res = await apiRequest(`/api/events/${eventId}/tables/bulk-coords/`, {
        method: 'PATCH',
        body: JSON.stringify({ coords }),
      })
      if (!res.ok) {
        // 後端拒絕（通常是跨活動 / id 不存在）→ 把這些 id 重 fetch 同步回正確狀態
        console.error('bulk-coords 失敗，重 fetch 同步', res.status)
        await fetchTables(eventId)
      }
    } catch (err) {
      console.error('bulk-coords 異常', err)
    }
  }

  // 強制把 pending 寫入立即送出（元件卸載前用）
  async function flushNow(eventId: number) {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    if (dirtyIds.size > 0) {
      await flushBulkCoords(eventId)
    }
  }

  // ── Phase B：seat-level 分配 ────────────────────────────────
  // 沿用既有 SeatAssignment（不新增 model），seat_index 規則：
  //   seat_index = table_id * 100 + seat_no（seat_no 從 1 起）
  // capacity 上限 50，乘 100 不會碰撞。
  //
  // seatAssignments：seat_index → participant_id（前端 source of truth）

  const seatAssignments = ref<Record<number, number>>({})

  function tableSeatIndex(tableId: number, seatNo: number): number {
    return tableId * 100 + seatNo
  }

  function parseSeatIndex(seatIndex: number): { tableId: number; seatNo: number } {
    return { tableId: Math.floor(seatIndex / 100), seatNo: seatIndex % 100 }
  }

  async function fetchAssignments(eventId: number) {
    try {
      const res = await apiRequest(`/api/seats/assignments/${eventId}/`)
      if (!res.ok) return
      const data = await res.json()
      const map: Record<number, number> = {}
      for (const a of data.assignments || []) {
        // 只認 seat_index >= 100 的（table-based seat），低於 100 是舊 SeatManager 的 grid seat
        if (a.seat_index >= 100) {
          map[a.seat_index] = a.participant
        }
      }
      seatAssignments.value = map
    } catch (err) {
      console.error('fetchAssignments failed', err)
    }
  }

  async function saveAssignments(eventId: number) {
    const assignments = Object.entries(seatAssignments.value).map(
      ([si, pid]) => ({
        participant_id: pid,
        seat_index: Number(si),
        seat_label: '',
      }),
    )
    try {
      const res = await apiRequest(`/api/seats/assignments/${eventId}/bulk/`, {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      })
      if (!res.ok) {
        console.error('saveAssignments failed', res.status)
        // 後端拒絕 → 重 fetch 同步回正確狀態
        await fetchAssignments(eventId)
      }
    } catch (err) {
      console.error('saveAssignments error', err)
    }
  }

  // ── 衝突規則 ─────────────────────────────────────────────────
  // - 同 participant 只能一席：落座新位時移除舊位
  // - 同 seat 只能一人：新指派覆蓋舊指派
  function assignSeat(seatIndex: number, participantId: number): {
    movedFromSeat: number | null
    overwroteParticipant: number | null
  } {
    let movedFromSeat: number | null = null
    let overwroteParticipant: number | null = null

    // 同 participant 只能一席
    for (const [si, pid] of Object.entries(seatAssignments.value)) {
      if (pid === participantId && Number(si) !== seatIndex) {
        movedFromSeat = Number(si)
        delete seatAssignments.value[Number(si)]
      }
    }
    // 同 seat 只能一人（記錄被踢掉的那位）
    if (seatAssignments.value[seatIndex] !== undefined && seatAssignments.value[seatIndex] !== participantId) {
      overwroteParticipant = seatAssignments.value[seatIndex]
    }
    seatAssignments.value[seatIndex] = participantId
    return { movedFromSeat, overwroteParticipant }
  }

  function unassignSeat(seatIndex: number) {
    delete seatAssignments.value[seatIndex]
  }

  function unassignParticipant(participantId: number) {
    for (const [si, pid] of Object.entries(seatAssignments.value)) {
      if (pid === participantId) delete seatAssignments.value[Number(si)]
    }
  }

  function clear() {
    tables.value = []
    seatAssignments.value = {}
    dirtyIds = new Set()
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    clearError()
  }

  return {
    tables,
    loading,
    error,
    fetchTables,
    createTable,
    deleteTable,
    queueBulkCoords,
    flushNow,
    // Phase B
    seatAssignments,
    tableSeatIndex,
    parseSeatIndex,
    fetchAssignments,
    saveAssignments,
    assignSeat,
    unassignSeat,
    unassignParticipant,
    clear,
    clearError,
  }
})
