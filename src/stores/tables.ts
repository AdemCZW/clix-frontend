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

  function clear() {
    tables.value = []
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
    clear,
    clearError,
  }
})
