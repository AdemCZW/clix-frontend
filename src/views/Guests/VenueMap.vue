<script setup lang="ts">
// ════════════════════════════════════════════════════════════════════
// 會場桌位佈局 — P1+P2+P3+P4 完整 MVP
// ════════════════════════════════════════════════════════════════════
//
// 設計目標（依 REMAINING_ISSUES「會場圖拖曳新規劃」）：
// P1 ✅ 純 SVG + Pointer Events 桌位拖曳 + 50px 網格吸附
// P2 ✅ wheel zoom（以滑鼠位置為中心）+ 中鍵 / 空白鍵 + 拖曳 pan
// P3 ✅ 後端 Table model + bulk-coords PATCH 持久化（debounce 500ms）
// P4 視覺 ✅ 圓桌依 capacity 用 sin/cos 環圈算座位點
// P4 Phase B ✅ 未分配賓客 panel + drag-from-panel-to-seat + 衝突規則
// P4 Phase C ✅ 自動排位（按姓名 round-robin）+ 預覽 + 一鍵回滾
//
// seat-level schema: 沿用既有 SeatAssignment（不新 model）
// - seat_index = table_id * 100 + seat_no（seat_no 從 1 起，capacity ≤ 50 不碰撞）
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEventsStore } from '@/stores/events'
import { useParticipantsStore } from '@/stores/participants'
import { useTablesStore, type VenueTable } from '@/stores/tables'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import type { Participant } from '@/types'

const eventsStore = useEventsStore()
const tablesStore = useTablesStore()
const participantsStore = useParticipantsStore()
const { success: toastSuccess, warning: toastWarning, info: toastInfo } = useToast()
const { confirm } = useConfirm()

// ── 畫布 / 桌位常數 ──────────────────────────────────────────
const SVG_W = 1600
const SVG_H = 1200
const GRID = 50          // 網格吸附單位
const TABLE_SIZE = 80    // 桌寬高（圓桌直徑、方桌邊長）
const SEAT_RADIUS = 6    // 座位點半徑（P4 視覺）
const SEAT_OFFSET = 18   // 座位點離桌外緣距離

// ── 桌位資料來源：store（P3 接後端） ────────────────────────
const tables = computed(() => tablesStore.tables)
const loading = computed(() => tablesStore.loading)

// ── 工具 ─────────────────────────────────────────────────────
const snap = (v: number) => Math.round(v / GRID) * GRID

const svgRef = ref<SVGSVGElement | null>(null)

// ── viewBox 狀態（P2 zoom/pan 用） ─────────────────────────
// 初始視角覆蓋整個 SVG 區域；wheel 縮放時只改 w/h，pan 改 x/y
const viewBox = ref({ x: 0, y: 0, w: SVG_W, h: SVG_H })
const ZOOM_MIN = 0.25  // 縮到原本 25%
const ZOOM_MAX = 4     // 放大到 400%
const zoomPercent = computed(() => Math.round((SVG_W / viewBox.value.w) * 100))

// 螢幕 → SVG 內部座標（依目前 viewBox 換算，zoom/pan 後仍正確）
const screenToSvg = (clientX: number, clientY: number) => {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const rect = svg.getBoundingClientRect()
  const v = viewBox.value
  return {
    x: v.x + ((clientX - rect.left) / rect.width) * v.w,
    y: v.y + ((clientY - rect.top) / rect.height) * v.h,
  }
}

// ── 拖曳狀態（單一 pointer） ───────────────────────────────
interface DragState {
  tableId: number
  pointerId: number
  targetEl: Element
  startClientX: number
  startClientY: number
  offsetX: number
  offsetY: number
  rafId: number | null
  // pending 座標：rafId 觸發時才寫入 tables，避免每次 move 都 re-render
  pendingX: number
  pendingY: number
  moved: boolean
}
let drag: DragState | null = null

const draggingTableId = ref<number | null>(null)
const selectedTableId = ref<number | null>(null)
const TABLE_DRAG_START_PX = 5

const onPointerDown = (e: PointerEvent, table: VenueTable) => {
  e.preventDefault()
  e.stopPropagation()
  const target = e.currentTarget as Element
  target.setPointerCapture(e.pointerId)
  const p = screenToSvg(e.clientX, e.clientY)
  drag = {
    tableId: table.id,
    pointerId: e.pointerId,
    targetEl: target,
    startClientX: e.clientX,
    startClientY: e.clientY,
    offsetX: p.x - table.x,
    offsetY: p.y - table.y,
    rafId: null,
    pendingX: table.x,
    pendingY: table.y,
    moved: false,
  }
  draggingTableId.value = null
}

const onPointerMove = (e: PointerEvent) => {
  if (!drag || drag.pointerId !== e.pointerId) return
  e.preventDefault()

  // 先判斷是否真的要進拖曳（避免 click 被誤判）
  if (!drag.moved) {
    const dx = e.clientX - drag.startClientX
    const dy = e.clientY - drag.startClientY
    if (Math.hypot(dx, dy) < TABLE_DRAG_START_PX) return
    drag.moved = true
    draggingTableId.value = drag.tableId
    selectedTableId.value = drag.tableId
  }

  const p = screenToSvg(e.clientX, e.clientY)
  // 拖曳中先走平滑移動，放手時再吸附網格
  drag.pendingX = p.x - drag.offsetX
  drag.pendingY = p.y - drag.offsetY
  // requestAnimationFrame 節流：每 frame 最多寫入一次 tables
  if (drag.rafId !== null) return
  drag.rafId = requestAnimationFrame(() => {
    if (!drag) return
    // store 內找對應的桌（reactive）
    const t = tablesStore.tables.find((tt) => tt.id === drag!.tableId)
    if (t) {
      // 邊界保護：避免拖出 SVG 範圍
      t.x = Math.max(0, Math.min(SVG_W - TABLE_SIZE, drag.pendingX))
      t.y = Math.max(0, Math.min(SVG_H - TABLE_SIZE, drag.pendingY))
    }
    drag.rafId = null
  })
}

const onPointerUp = (e: PointerEvent) => {
  if (!drag || drag.pointerId !== e.pointerId) return
  try { drag.targetEl.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  if (drag.rafId !== null) cancelAnimationFrame(drag.rafId)

  if (drag.moved) {
    // 放手時再做網格吸附，拖曳體感更平順
    const t = tablesStore.tables.find((tt) => tt.id === drag!.tableId)
    if (t) {
      t.x = Math.max(0, Math.min(SVG_W - TABLE_SIZE, snap(t.x)))
      t.y = Math.max(0, Math.min(SVG_H - TABLE_SIZE, snap(t.y)))
    }
    // P3：拖曳結束後 enqueue bulk-coords（store 端 debounce 500ms 合併）
    const eventId = eventsStore.currentEvent?.id
    if (eventId && drag.tableId) {
      tablesStore.queueBulkCoords(eventId, drag.tableId)
    }
  } else {
    // 沒達拖曳門檻 → 視為點選桌位
    selectedTableId.value = drag.tableId
  }

  drag = null
  draggingTableId.value = null
}

// ── P2：wheel zoom（以滑鼠位置為中心） ─────────────────────
const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  // 滾輪向上 → 放大；向下 → 縮小
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const oldW = viewBox.value.w
  const newW = oldW / factor
  // 縮放範圍限制
  if (newW < SVG_W / ZOOM_MAX || newW > SVG_W / ZOOM_MIN) return
  const newH = viewBox.value.h / factor
  // 滑鼠所在的 SVG 座標
  const p = screenToSvg(e.clientX, e.clientY)
  // 縮放後讓滑鼠仍對應同一個 SVG 點（zoom-to-cursor）
  viewBox.value.x = p.x - (p.x - viewBox.value.x) * (newW / oldW)
  viewBox.value.y = p.y - (p.y - viewBox.value.y) * (newW / oldW)
  viewBox.value.w = newW
  viewBox.value.h = newH
}

// ── P2：pan（中鍵或空白鍵 + 左鍵拖曳） ─────────────────────
const isSpaceDown = ref(false)
const isPanning = ref(false)
let panState: {
  startClientX: number
  startClientY: number
  vbStartX: number
  vbStartY: number
  pointerId: number
} | null = null

const onSvgPointerDown = (e: PointerEvent) => {
  // 直接點背景就能拖移視角（左鍵 / 中鍵 / 觸控都接受）
  // 桌位 / 賓客 / seat dot 各自有 stopPropagation，不會冒泡到這裡
  // 右鍵跳過保留瀏覽器 contextmenu
  if (e.button === 2) return
  e.preventDefault()
  selectedTableId.value = null
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  panState = {
    startClientX: e.clientX,
    startClientY: e.clientY,
    vbStartX: viewBox.value.x,
    vbStartY: viewBox.value.y,
    pointerId: e.pointerId,
  }
  isPanning.value = true
}

const onSvgPointerMove = (e: PointerEvent) => {
  if (!panState || panState.pointerId !== e.pointerId) return
  const svg = svgRef.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  // 螢幕位移 → SVG 位移（依當前 viewBox 比例換算）
  const dxSvg = (e.clientX - panState.startClientX) * (viewBox.value.w / rect.width)
  const dySvg = (e.clientY - panState.startClientY) * (viewBox.value.h / rect.height)
  // 滑鼠往右拖 → viewBox 往左走（讓內容跟著手指走）
  viewBox.value.x = panState.vbStartX - dxSvg
  viewBox.value.y = panState.vbStartY - dySvg
}

const onSvgPointerUp = (e: PointerEvent) => {
  if (!panState || panState.pointerId !== e.pointerId) return
  try {
    (e.currentTarget as Element).releasePointerCapture(e.pointerId)
  } catch { /* ignore */ }
  panState = null
  isPanning.value = false
}

// 空白鍵狀態（按住期間切換 cursor 並啟用左鍵 pan）
const onKeyDown = (e: KeyboardEvent) => {
  if (e.code === 'Space' && !isSpaceDown.value) {
    // 只在 SVG / VenueMap 範圍內按空白才響應，避免影響其他輸入框
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
    isSpaceDown.value = true
  }
}
const onKeyUp = (e: KeyboardEvent) => {
  if (e.code === 'Space') isSpaceDown.value = false
}
onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

// 重置視角到初始狀態
const resetView = () => {
  viewBox.value = { x: 0, y: 0, w: SVG_W, h: SVG_H }
}
const zoomToFit = resetView  // alias 給 UI 用

// SVG 背景 cursor：預設 grab（暗示可拖）；拖曳中 grabbing
// 注意：桌位 / seat dot 自己 cursor 會覆蓋（grab / pointer），這個只在背景生效
const svgCursor = computed(() => {
  if (isPanning.value) return 'grabbing'
  return 'grab'
})

// ── 加 / 刪桌（接後端 API） ──────────────────────────────────
const addRoundTable = async () => {
  const eventId = eventsStore.currentEvent?.id
  if (!eventId) return
  await tablesStore.createTable(eventId, {
    x: snap(SVG_W / 2 - TABLE_SIZE / 2),
    y: snap(SVG_H / 2 - TABLE_SIZE / 2),
    label: `T${tables.value.length + 1}`,
    capacity: 10,
    shape: 'round',
  })
}
const removeTable = async (id: number) => {
  const eventId = eventsStore.currentEvent?.id
  if (!eventId) return
  const ok = await confirm({
    title: '刪除桌位',
    message: '刪除後無法復原，且此桌的座位分配將一併失效。是否繼續？',
    confirmText: '刪除',
    cancelText: '取消',
    danger: true,
  })
  if (!ok) return
  try {
    const result = await tablesStore.deleteTable(eventId, id)
    if (selectedTableId.value === id) selectedTableId.value = null
    // 確保前端 seatAssignments map 與後端一致（store 已自清，再 fetch 一次保險）
    await tablesStore.fetchAssignments(eventId)
    const cleared = (result as { clearedCount?: number } | undefined)?.clearedCount ?? 0
    toastInfo(cleared > 0 ? `已刪除桌位（同時釋放 ${cleared} 位賓客）` : '已刪除桌位')
  } catch (err) {
    console.error('removeTable failed', err)
    toastWarning('刪除桌位失敗，請稍後再試')
  }
}

// ── 顯示文字 ─────────────────────────────────────────────────
const tableCount = computed(() => tables.value.length)

// ── P4 視覺：圓桌座位點位（sin/cos 算 N 個座位環圈） ───────
// 給定桌的 capacity，回傳 N 個 (sx, sy) 相對桌中心的座位點
function getSeatPositions(t: VenueTable): Array<{ x: number; y: number }> {
  if (t.shape !== 'round') return []
  const n = t.capacity
  const cx = TABLE_SIZE / 2
  const cy = TABLE_SIZE / 2
  // 座位點距離桌中心：桌半徑 + 偏移
  const r = TABLE_SIZE / 2 + SEAT_OFFSET
  const positions: Array<{ x: number; y: number }> = []
  for (let i = 0; i < n; i++) {
    // 從正上方（-π/2）順時針排
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    positions.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    })
  }
  return positions
}

// ════════════════════════════════════════════════════════════════════
// Phase B：未分配賓客 panel + drag-to-seat
// ════════════════════════════════════════════════════════════════════

// 已分配 participants 的 set（給 unassigned 計算用）
const assignedParticipantIds = computed(() => {
  return new Set(Object.values(tablesStore.seatAssignments))
})

// 未分配賓客（該活動 participants 中尚未在任何 seat）
const unassignedParticipants = computed<Participant[]>(() => {
  const assigned = assignedParticipantIds.value
  return participantsStore.participants.filter((p) => !assigned.has(p.id))
})

// Panel 分頁：VIP / 民眾（預設民眾，因為通常人數較多）
const panelTab = ref<'vip' | 'general'>('general')
const unassignedVip = computed(() =>
  unassignedParticipants.value.filter((p) => p.type === 'VIP'),
)
const unassignedGeneral = computed(() =>
  unassignedParticipants.value.filter((p) => p.type !== 'VIP'),
)
const displayedUnassigned = computed(() =>
  panelTab.value === 'vip' ? unassignedVip.value : unassignedGeneral.value,
)
const panelEmptyMessage = computed(() => {
  if (unassignedParticipants.value.length === 0) return '全部已分配 ✓'
  if (panelTab.value === 'vip') return 'VIP 都已分配 ✓'
  return '民眾都已分配 ✓'
})

// 已分配人數 / 容量總和（用於 status bar）
const totalCapacity = computed(() =>
  tables.value.reduce((sum, t) => sum + (t.shape === 'round' ? t.capacity : 0), 0),
)
const assignedCount = computed(() => Object.keys(tablesStore.seatAssignments).length)

// participant id → name 對照（給座位點 hover 顯示用）
const participantById = computed(() => {
  const map = new Map<number, Participant>()
  for (const p of participantsStore.participants) map.set(p.id, p)
  return map
})

// seat_index → participant 對照（template 每個 seat 會查 4-5 次，computed 化避免重複 reactive lookup）
const seatToParticipant = computed(() => {
  const map = new Map<number, Participant>()
  const byId = participantById.value
  for (const [si, pid] of Object.entries(tablesStore.seatAssignments)) {
    const p = byId.get(pid)
    if (p) map.set(Number(si), p)
  }
  return map
})

// 找某 seat_index 對應的 participant（沒分配 = null）
function getSeatParticipant(seatIndex: number): Participant | null {
  return seatToParticipant.value.get(seatIndex) ?? null
}

// ── 拖曳 ghost 狀態（從 panel 拖到 SVG seat） ────────────────
const dragGhost = ref<{
  participant: Participant
  x: number
  y: number
} | null>(null)
let personDragState: {
  participant: Participant
  pointerId: number
  el: Element
} | null = null
const hoveredSeatIndex = ref<number | null>(null)
let personDragRaf: number | null = null
let pendingGhostX = 0
let pendingGhostY = 0
let pendingHoveredSeatIndex: number | null = null

// drop 成功的瞬間，標記哪個 seat 剛被分配 → 觸發 1 秒 bounce 動畫
const justAssignedSeatIndex = ref<number | null>(null)
let justAssignedTimer: ReturnType<typeof setTimeout> | null = null
function flashJustAssigned(seatIndex: number) {
  justAssignedSeatIndex.value = seatIndex
  if (justAssignedTimer) clearTimeout(justAssignedTimer)
  justAssignedTimer = setTimeout(() => {
    justAssignedSeatIndex.value = null
    justAssignedTimer = null
  }, 1000)
}

// ════════════════════════════════════════════════════════════════════
// 智能建議路徑（拖曳時顯示 Top 3 建議桌位）
// ════════════════════════════════════════════════════════════════════
//
// 評分公式（缺欄位回 0 分影響，不報錯）：
//   同公司配對 +4 / pair
//   VIP 在主桌（label 含 VIP 或「主」）+20 / 位
//   同桌飲食衝突 -3 / 不同種類
//   硬性違反 -10000（目前未使用）
interface Suggestion {
  tableId: number
  targetX: number
  targetY: number
  delta: number
}
const cursorPos = ref<{ x: number; y: number } | null>(null)  // SVG 座標
const suggestions = ref<Suggestion[]>([])
let suggestionsDebounce: ReturnType<typeof setTimeout> | null = null

// 從 store 拿目前的 seat → participant 對照（直接 reuse computed cache，模擬時 simulateAddGuest 會自行淺拷貝）
function getCurrentSeating(): Map<number, Participant> {
  return seatToParticipant.value
}

function getTableGuests(tableId: number, seating: Map<number, Participant>): Participant[] {
  const guests: Participant[] = []
  for (const [si, g] of seating) {
    if (Math.floor(si / 100) === tableId) guests.push(g)
  }
  return guests
}

function isMainTable(t: VenueTable): boolean {
  const label = (t.label || '').toUpperCase()
  return label.includes('VIP') || label.includes('主')
}

function getDietary(g: Participant): string {
  const fa = (g.formAnswers ?? {}) as Record<string, unknown>
  const v = fa.dietary ?? fa.diet
  return v ? String(v).trim() : ''
}

function scoreTable(tableId: number, seating: Map<number, Participant>): number {
  const guests = getTableGuests(tableId, seating)
  if (guests.length === 0) return 0
  let s = 0
  // 同公司配對：每對 +4
  for (let i = 0; i < guests.length; i++) {
    for (let j = i + 1; j < guests.length; j++) {
      const ci = (guests[i].company || '').trim()
      const cj = (guests[j].company || '').trim()
      if (ci && ci === cj) s += 4
    }
  }
  // VIP 在主桌（label 含 'VIP' 或 '主' 才算）
  const t = tables.value.find((tt) => tt.id === tableId)
  if (t && isMainTable(t)) {
    for (const g of guests) {
      if (g.type === 'VIP') s += 20
    }
  }
  // 同桌飲食衝突：N 種不同 dietary → -(N-1) * 3
  const diets = new Set<string>()
  for (const g of guests) {
    const d = getDietary(g)
    if (d) diets.add(d)
  }
  if (diets.size > 1) s -= (diets.size - 1) * 3
  return s
}

function computeTotalScore(seating: Map<number, Participant>): number {
  let s = 0
  for (const t of tables.value) s += scoreTable(t.id, seating)
  return s
}

function hasEmptySeat(t: VenueTable, seating: Map<number, Participant>): boolean {
  let count = 0
  for (const si of seating.keys()) {
    if (Math.floor(si / 100) === t.id) count++
  }
  return count < t.capacity
}

function violatesHardConstraints(_guest: Participant, _t: VenueTable, _seating: Map<number, Participant>): boolean {
  // 目前未定義硬性約束（性別 / 部門隔離等）—— 保留 hook 給未來
  return false
}

function simulateAddGuest(guest: Participant, t: VenueTable, seating: Map<number, Participant>): number {
  // 找該桌第一個空 seat
  let nextSeatNo = 1
  for (let s = 1; s <= t.capacity; s++) {
    const si = t.id * 100 + s
    if (!seating.has(si)) { nextSeatNo = s; break }
  }
  const newSeating = new Map(seating)
  newSeating.set(t.id * 100 + nextSeatNo, guest)
  return computeTotalScore(newSeating)
}

function calculateSuggestions(guestId: number): Suggestion[] {
  const guest = participantById.value.get(guestId)
  if (!guest) return []
  const seating = getCurrentSeating()
  const baseScore = computeTotalScore(seating)
  return tables.value
    .filter((t) => t.shape === 'round' && hasEmptySeat(t, seating))
    .filter((t) => !violatesHardConstraints(guest, t, seating))
    .map((t) => ({
      tableId: t.id,
      targetX: t.x + TABLE_SIZE / 2,
      targetY: t.y + TABLE_SIZE / 2,
      delta: simulateAddGuest(guest, t, seating) - baseScore,
    }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3)
}

function queueRecalcSuggestions(guestId: number) {
  if (suggestionsDebounce) clearTimeout(suggestionsDebounce)
  suggestionsDebounce = setTimeout(() => {
    suggestions.value = calculateSuggestions(guestId)
    suggestionsDebounce = null
  }, 50)
}

// 桌即時分數徽章（順帶實作）：每張桌目前分數
const tableScores = computed<Map<number, number>>(() => {
  const seating = getCurrentSeating()
  const map = new Map<number, number>()
  for (const t of tables.value) map.set(t.id, scoreTable(t.id, seating))
  return map
})

// SVG 二次貝茲曲線：游標 → 桌中心
function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  const ctrlY = my - Math.abs(to.x - from.x) * 0.3
  return `M ${from.x} ${from.y} Q ${mx} ${ctrlY} ${to.x} ${to.y}`
}

const onPersonPointerDown = (e: PointerEvent, p: Participant) => {
  e.preventDefault()
  const el = e.currentTarget as Element
  el.setPointerCapture(e.pointerId)
  personDragState = { participant: p, pointerId: e.pointerId, el }
  dragGhost.value = { participant: p, x: e.clientX, y: e.clientY }
  hoveredSeatIndex.value = null
  // 智能建議：開拖時 reset，第一次 move 時才算
  suggestions.value = []
  cursorPos.value = screenToSvg(e.clientX, e.clientY)
}

const onPersonPointerMove = (e: PointerEvent) => {
  if (!personDragState || personDragState.pointerId !== e.pointerId) return
  pendingGhostX = e.clientX
  pendingGhostY = e.clientY

  // vm-drag-ghost 已是 pointer-events: none，不會擋 elementFromPoint
  const under = document.elementFromPoint(e.clientX, e.clientY) as Element | null
  const seatEl = under?.closest('.vm-seat') as SVGElement | null
  if (seatEl?.dataset.seatIndex) {
    pendingHoveredSeatIndex = Number(seatEl.dataset.seatIndex)
  } else {
    pendingHoveredSeatIndex = null
  }

  // 拖曳更新節流：每 frame 最多更新一次 reactive 狀態
  if (personDragRaf !== null) return
  personDragRaf = requestAnimationFrame(() => {
    if (dragGhost.value) {
      dragGhost.value.x = pendingGhostX
      dragGhost.value.y = pendingGhostY
    }
    hoveredSeatIndex.value = pendingHoveredSeatIndex
    // 智能建議：cursorPos 更新（每 frame 一次）+ debounce 重算 suggestions
    cursorPos.value = screenToSvg(pendingGhostX, pendingGhostY)
    if (personDragState) {
      queueRecalcSuggestions(personDragState.participant.id)
    }
    personDragRaf = null
  })
}

const onPersonPointerUp = (e: PointerEvent) => {
  if (!personDragState || personDragState.pointerId !== e.pointerId) return
  try { personDragState.el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  if (personDragRaf !== null) {
    cancelAnimationFrame(personDragRaf)
    personDragRaf = null
  }
  // 智能建議：清掉 debounce + 路徑
  if (suggestionsDebounce) {
    clearTimeout(suggestionsDebounce)
    suggestionsDebounce = null
  }
  suggestions.value = []
  cursorPos.value = null

  const target = hoveredSeatIndex.value
  const p = personDragState.participant
  personDragState = null
  dragGhost.value = null
  hoveredSeatIndex.value = null

  if (target === null) return  // 沒拖到 seat，取消

  // 衝突規則處理 → store
  const result = tablesStore.assignSeat(target, p.id)
  if (result.overwroteParticipant) {
    const oldP = participantById.value.get(result.overwroteParticipant)
    toastWarning(`「${oldP?.name ?? '某人'}」原本的座位被覆蓋`)
  }
  if (result.movedFromSeat !== null) {
    toastInfo(`「${p.name}」從原座位移過來`)
  } else {
    toastSuccess(`「${p.name}」已分配座位`)
  }
  // 觸發 seat dot bounce + 綠閃動畫（1 秒）
  flashJustAssigned(target)

  // 同步後端
  const eventId = eventsStore.currentEvent?.id
  if (eventId) tablesStore.saveAssignments(eventId)
}

// 從 seat 拿掉某參與者（點 seat dot 上的 participant 圓圈）
const onSeatClick = (seatIndex: number) => {
  if (!tablesStore.seatAssignments[seatIndex]) return
  tablesStore.unassignSeat(seatIndex)
  const eventId = eventsStore.currentEvent?.id
  if (eventId) tablesStore.saveAssignments(eventId)
  toastInfo('已移除該座位的分配')
}

// ════════════════════════════════════════════════════════════════════
// Phase C：自動排位（按姓名 round-robin）
// ════════════════════════════════════════════════════════════════════
const lastSnapshot = ref<Record<number, number> | null>(null)  // 上次自動排位前的 assignments，給回滾用

async function autoAssignSeats() {
  const eventId = eventsStore.currentEvent?.id
  if (!eventId) return
  const unassigned = [...unassignedParticipants.value]
  if (unassigned.length === 0) {
    toastInfo('沒有待分配的賓客')
    return
  }
  // 收集所有未被分配的座位（依桌 id 排序，每桌依 seatNo 1..capacity）
  const allSeats: number[] = []
  for (const t of tables.value) {
    if (t.shape !== 'round') continue
    for (let s = 1; s <= t.capacity; s++) {
      const si = tablesStore.tableSeatIndex(t.id, s)
      if (!tablesStore.seatAssignments[si]) allSeats.push(si)
    }
  }
  if (allSeats.length === 0) {
    toastWarning('沒有可用座位（所有圓桌都坐滿了）')
    return
  }
  // 按姓名排序賓客
  const sorted = unassigned.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
  // 預覽：能分配的人數 = min(unassigned, allSeats)
  const willAssign = Math.min(sorted.length, allSeats.length)
  const overflow = sorted.length - willAssign

  const ok = await confirm({
    title: '自動排位預覽',
    message:
      `將按姓名排序，依順序填入 ${willAssign} 位賓客到 ${allSeats.length} 個空位。\n\n` +
      (overflow > 0
        ? `⚠️ 有 ${overflow} 位賓客無位可坐（需新增桌位或擴容）。\n\n`
        : '') +
      `現有手動分配的座位不會被動到，按下確認後可用「⤺ 還原自動排位」一鍵回滾。`,
    confirmText: '執行自動排位',
    cancelText: '取消',
    danger: false,
  })
  if (!ok) return

  // 暫存快照（淺 copy 即可，value 都是 number）
  lastSnapshot.value = { ...tablesStore.seatAssignments }

  // round-robin 寫入
  for (let i = 0; i < willAssign; i++) {
    tablesStore.assignSeat(allSeats[i], sorted[i].id)
  }
  await tablesStore.saveAssignments(eventId)
  toastSuccess(`已自動分配 ${willAssign} 位賓客${overflow > 0 ? `，${overflow} 位無位` : ''}`)
}

async function rollbackAutoAssign() {
  if (!lastSnapshot.value) return
  const eventId = eventsStore.currentEvent?.id
  if (!eventId) return
  const ok = await confirm({
    title: '還原自動排位',
    message: '會把座位分配還原到自動排位前的狀態，已做的所有自動排位變更都會復原。',
    confirmText: '確認還原',
    cancelText: '取消',
    danger: true,
  })
  if (!ok) return
  tablesStore.seatAssignments = { ...lastSnapshot.value }
  lastSnapshot.value = null
  await tablesStore.saveAssignments(eventId)
  toastSuccess('已還原到自動排位前的狀態')
}

// ── Lifecycle：fetch tables / participants / assignments；切活動時重 fetch；卸載前 flush dirty ──
async function reloadAllForEvent(eid: number) {
  await Promise.all([
    tablesStore.fetchTables(eid),
    tablesStore.fetchAssignments(eid),
    participantsStore.fetchParticipants({ event: String(eid) }),
  ])
}

onMounted(async () => {
  const eid = eventsStore.currentEvent?.id
  if (eid) await reloadAllForEvent(eid)
})

watch(() => eventsStore.currentEvent?.id, async (newId, oldId) => {
  // 切活動前先把 pending 寫入送出（保護資料）
  if (oldId) await tablesStore.flushNow(oldId)
  tablesStore.clear()
  lastSnapshot.value = null
  // P1：清掉舊活動的選中桌號，避免 status bar 顯示舊活動的桌
  selectedTableId.value = null
  if (newId) await reloadAllForEvent(newId)
})

onBeforeUnmount(() => {
  // 元件卸載前確保 pending bulk-coords 立即送出，不要靠 timer
  const eid = eventsStore.currentEvent?.id
  if (eid) tablesStore.flushNow(eid)
})
</script>

<template>
  <div class="venue-map">
    <header class="vm-header">
      <div class="vm-title">
        <h2>會場桌位佈局</h2>
        <span class="vm-tag">beta</span>
      </div>
      <p class="vm-hint">
        <span v-if="!eventsStore.currentEvent" class="vm-warn">⚠️ 請先選擇活動</span>
        <span v-else-if="loading">載入中...</span>
        <span v-else>滾輪縮放 / 直接拖背景平移視角 / 拖桌位移動 / 拖賓客到座位點分配</span>
      </p>
      <div class="vm-actions">
        <button
          class="vm-btn primary"
          :disabled="!eventsStore.currentEvent"
          @click="addRoundTable"
        >+ 新增圓桌</button>
        <button class="vm-btn" @click="zoomToFit" title="重置視角到 100%">⤢ 重置視角</button>
        <button
          class="vm-btn auto-assign"
          :disabled="!eventsStore.currentEvent || unassignedParticipants.length === 0"
          @click="autoAssignSeats"
          title="按姓名 round-robin 把未分配的賓客自動填入空座位"
        >⚡ 自動排位</button>
        <button
          v-if="lastSnapshot"
          class="vm-btn rollback"
          @click="rollbackAutoAssign"
          title="還原到自動排位前的狀態"
        >⤺ 還原自動排位</button>
      </div>
    </header>

    <div class="vm-body">
    <div class="vm-canvas-wrap">
      <svg
        ref="svgRef"
        :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
        class="vm-svg"
        :style="{ cursor: svgCursor }"
        preserveAspectRatio="xMidYMid meet"
        @wheel="onWheel"
        @pointerdown="onSvgPointerDown"
        @pointermove="onSvgPointerMove"
        @pointerup="onSvgPointerUp"
        @pointercancel="onSvgPointerUp"
      >
        <!-- 網格背景 -->
        <defs>
          <pattern id="vm-grid" :width="GRID" :height="GRID" patternUnits="userSpaceOnUse">
            <path :d="`M ${GRID} 0 L 0 0 0 ${GRID}`" fill="none" stroke="#e2e8f0" stroke-width="1" />
          </pattern>
          <pattern id="vm-grid-major" :width="GRID * 4" :height="GRID * 4" patternUnits="userSpaceOnUse">
            <path :d="`M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`" fill="none" stroke="#cbd5e1" stroke-width="1" />
          </pattern>
        </defs>
        <rect :width="SVG_W" :height="SVG_H" fill="url(#vm-grid)" />
        <rect :width="SVG_W" :height="SVG_H" fill="url(#vm-grid-major)" />

        <!-- 桌位 -->
        <g
          v-for="t in tables"
          :key="t.id"
          class="vm-table"
          :class="{
            dragging: draggingTableId === t.id,
            rect: t.shape === 'rect',
            selected: selectedTableId === t.id,
          }"
          :transform="`translate(${t.x},${t.y})`"
          @pointerdown="(e) => onPointerDown(e, t)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <!-- 圓桌 -->
          <circle
            v-if="t.shape === 'round'"
            :cx="TABLE_SIZE / 2"
            :cy="TABLE_SIZE / 2"
            :r="TABLE_SIZE / 2"
            class="vm-table-shape"
          />
          <!-- 方桌 / VIP -->
          <rect
            v-else
            x="0" y="0"
            :width="TABLE_SIZE * 1.5" :height="TABLE_SIZE"
            rx="8"
            class="vm-table-shape"
          />
          <text
            :x="(t.shape === 'rect' ? TABLE_SIZE * 1.5 : TABLE_SIZE) / 2"
            :y="TABLE_SIZE / 2 - 2"
            text-anchor="middle" font-weight="700" font-size="16" class="vm-table-label"
          >{{ t.label }}</text>
          <text
            :x="(t.shape === 'rect' ? TABLE_SIZE * 1.5 : TABLE_SIZE) / 2"
            :y="TABLE_SIZE / 2 + 16"
            text-anchor="middle" font-size="11" class="vm-table-cap"
          >{{ t.capacity }} 位</text>

          <!-- 點選桌位後顯示右上角刪除 X（不需再去 header 點按鈕） -->
          <g
            v-if="selectedTableId === t.id"
            class="vm-table-delete"
            :transform="`translate(${(t.shape === 'rect' ? TABLE_SIZE * 1.5 : TABLE_SIZE) + 12}, -6)`"
            @pointerdown.stop.prevent
            @click.stop="removeTable(t.id)"
          >
            <circle cx="0" cy="0" r="12" />
            <text x="0" y="1" text-anchor="middle" dominant-baseline="middle">×</text>
          </g>

          <!-- 桌即時分數徽章（右上角，0 不顯示） -->
          <g
            v-if="(tableScores.get(t.id) ?? 0) !== 0"
            class="vm-table-score"
            :class="{
              positive: (tableScores.get(t.id) ?? 0) > 0,
              negative: (tableScores.get(t.id) ?? 0) < 0,
            }"
            :transform="`translate(${(t.shape === 'rect' ? TABLE_SIZE * 1.5 : TABLE_SIZE) - 4}, 4)`"
          >
            <rect x="-22" y="-2" width="28" height="16" rx="8" />
            <text x="-8" y="9" text-anchor="middle" font-size="10" font-weight="700">
              {{ (tableScores.get(t.id) ?? 0) > 0 ? `+${tableScores.get(t.id)}` : tableScores.get(t.id) }}
            </text>
          </g>

          <!-- P4 視覺：圓桌座位點位（sin/cos 環圈） + Phase B 已分配狀態 + drop target -->
          <g
            v-for="(seat, i) in getSeatPositions(t)"
            :key="`seat-${t.id}-${i}`"
            class="vm-seat-slot"
          >
            <circle
              :cx="seat.x"
              :cy="seat.y"
              :r="SEAT_RADIUS + 2"
              :data-seat-index="tablesStore.tableSeatIndex(t.id, i + 1)"
              class="vm-seat"
              :class="{
                assigned: !!getSeatParticipant(tablesStore.tableSeatIndex(t.id, i + 1)),
                hovered: hoveredSeatIndex === tablesStore.tableSeatIndex(t.id, i + 1),
                'drop-ready': !!dragGhost && !getSeatParticipant(tablesStore.tableSeatIndex(t.id, i + 1)),
                'drop-warn': !!dragGhost && !!getSeatParticipant(tablesStore.tableSeatIndex(t.id, i + 1)),
                'just-assigned': justAssignedSeatIndex === tablesStore.tableSeatIndex(t.id, i + 1),
              }"
              @pointerdown.stop
              @click.stop="onSeatClick(tablesStore.tableSeatIndex(t.id, i + 1))"
            />
            <!-- 已分配 → 顯示姓氏 -->
            <text
              v-if="getSeatParticipant(tablesStore.tableSeatIndex(t.id, i + 1))"
              :x="seat.x"
              :y="seat.y + 3"
              text-anchor="middle"
              font-size="9"
              font-weight="700"
              class="vm-seat-name"
            >{{ getSeatParticipant(tablesStore.tableSeatIndex(t.id, i + 1))!.name.charAt(0) }}</text>
          </g>
        </g>

        <!-- 智能建議路徑層（拖曳中且有建議才顯示） -->
        <g v-if="dragGhost && cursorPos && suggestions.length > 0" class="vm-suggestions-layer">
          <g v-for="(s, idx) in suggestions" :key="`sug-${s.tableId}`">
            <!-- 二次貝茲虛線：游標 → 桌中心 -->
            <path
              :d="bezierPath(cursorPos, { x: s.targetX, y: s.targetY })"
              class="vm-suggest-path"
              :class="{
                positive: s.delta > 0,
                negative: s.delta < 0,
                neutral: s.delta === 0,
                top: idx === 0,
              }"
            />
            <!-- 中點徽章：+N / -N / 0 -->
            <g
              :transform="`translate(${(cursorPos.x + s.targetX) / 2}, ${(cursorPos.y + s.targetY) / 2 - 22})`"
              class="vm-suggest-badge"
              :class="{
                positive: s.delta > 0,
                negative: s.delta < 0,
                neutral: s.delta === 0,
                top: idx === 0,
              }"
            >
              <rect x="-22" y="-12" width="44" height="22" rx="11" />
              <text text-anchor="middle" y="4" font-size="12" font-weight="700">
                {{ s.delta > 0 ? `+${s.delta}` : s.delta }}
              </text>
            </g>
          </g>
        </g>
      </svg>
    </div>

    <!-- 右側未分配賓客 panel -->
    <aside class="vm-panel">
      <div class="vm-panel-head">
        <h3>未分配賓客</h3>
        <span class="vm-panel-count">{{ unassignedParticipants.length }}</span>
      </div>
      <!-- VIP / 民眾 分頁籤 -->
      <div class="vm-panel-tabs">
        <button
          type="button"
          class="vm-panel-tab"
          :class="{ active: panelTab === 'vip', vip: true }"
          @click="panelTab = 'vip'"
        >
          VIP <span class="cnt">{{ unassignedVip.length }}</span>
        </button>
        <button
          type="button"
          class="vm-panel-tab"
          :class="{ active: panelTab === 'general' }"
          @click="panelTab = 'general'"
        >
          民眾 <span class="cnt">{{ unassignedGeneral.length }}</span>
        </button>
      </div>
      <p class="vm-panel-hint">拖曳賓客到圓桌的座位點上分配</p>
      <div v-if="displayedUnassigned.length === 0" class="vm-panel-empty">
        {{ panelEmptyMessage }}
      </div>
      <div class="vm-panel-list">
        <div
          v-for="p in displayedUnassigned"
          :key="p.id"
          class="vm-person"
          :class="{ dragging: dragGhost?.participant.id === p.id }"
          @pointerdown="onPersonPointerDown($event, p)"
          @pointermove="onPersonPointerMove"
          @pointerup="onPersonPointerUp"
          @pointercancel="onPersonPointerUp"
        >
          <span class="vm-person-avatar" :class="{ vip: p.type === 'VIP' }">
            {{ p.name.charAt(0) }}
          </span>
          <div class="vm-person-info">
            <div class="vm-person-name">{{ p.name }}</div>
            <div class="vm-person-sub">{{ p.company || p.type }}</div>
          </div>
        </div>
      </div>
    </aside>
    </div>

    <!-- Drag ghost：隨指針浮動，標示「正在拖曳」-->
    <div
      v-if="dragGhost"
      class="vm-drag-ghost"
      :style="{ left: dragGhost.x + 'px', top: dragGhost.y + 'px' }"
    >
      {{ dragGhost.participant.name }}
    </div>

    <div class="vm-status">
      <span class="vm-zoom-info">縮放 {{ zoomPercent }}% · 視角 ({{ Math.round(viewBox.x) }}, {{ Math.round(viewBox.y) }})</span>
      <span class="vm-divider">|</span>
      <span class="vm-assign-info">{{ tableCount }} 桌 · 容量 {{ totalCapacity }} · 已分配 {{ assignedCount }}</span>
      <span class="vm-divider">|</span>
      <span v-if="dragGhost" class="vm-mode-drop">拖曳賓客到座位點放開即可分配</span>
      <span v-else-if="isPanning" class="vm-mode-pan">平移視角中…</span>
      <span v-else-if="draggingTableId">拖曳桌 {{ draggingTableId }}：
        ({{ tables.find((t) => t.id === draggingTableId)?.x ?? 0 }},
         {{ tables.find((t) => t.id === draggingTableId)?.y ?? 0 }})</span>
      <span v-else-if="selectedTableId" class="vm-mode-selected">已選中桌 {{ selectedTableId }}（可點右上角 × 刪除）</span>
      <span v-else class="muted">滾輪縮放 / 拖背景平移視角 / 拖桌位定位 / 拖賓客分配 / 點座位移除分配</span>
    </div>
  </div>
</template>

<style scoped>
.venue-map {
  padding: 16px;
  background: var(--bg-primary);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.vm-header {
  margin-bottom: 12px;
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 12px;
}
.vm-title { display: flex; align-items: center; gap: 8px; }
.vm-title h2 {
  font-size: 1.15rem; font-weight: 700;
  margin: 0; color: var(--text-main);
}
.vm-tag {
  background: #fef3c7; color: #92400e;
  font-size: 0.7rem; font-weight: 700;
  padding: 2px 8px; border-radius: 999px;
}
.vm-hint {
  font-size: 0.8rem; color: var(--text-muted);
  margin: 0; flex: 1;
}
.vm-hint .vm-warn { color: #d97706; font-weight: 600; }
.vm-actions { display: flex; gap: 8px; }
.vm-btn {
  padding: 6px 14px; border-radius: 8px;
  font-size: 0.84rem; font-weight: 600;
  cursor: pointer; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-secondary);
  transition: .15s;
}
.vm-btn:hover:not(:disabled) { background: var(--bg-hover); }
.vm-btn:disabled { opacity: .5; cursor: not-allowed; }
.vm-btn.primary {
  background: #167A67; color: #fff; border-color: #167A67;
}
.vm-btn.primary:hover { background: #0f5d4e; }

.vm-canvas-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  flex: 1;
  min-height: 400px;
}
.vm-svg {
  display: block; width: 100%; height: 100%;
  /* 規格：禁止瀏覽器接管 touch / 文字選取 */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: #fafbfc;
}

/* 桌位 */
.vm-table { cursor: grab; }
.vm-table.dragging { cursor: grabbing; }
.vm-table.dragging .vm-table-shape {
  filter: drop-shadow(0 4px 12px rgba(22, 122, 103, 0.35));
}
.vm-table.selected .vm-table-shape {
  stroke-width: 3;
  filter: drop-shadow(0 0 0 rgba(22, 122, 103, 0.25)) drop-shadow(0 4px 10px rgba(22, 122, 103, 0.25));
}
.vm-table-shape {
  fill: #fff;
  stroke: #337168;
  stroke-width: 2;
  transition: fill .15s;
}
.vm-table:hover .vm-table-shape { fill: #ecfdf5; }
.vm-table.rect .vm-table-shape { fill: #fffbeb; stroke: #d97706; }
.vm-table.rect:hover .vm-table-shape { fill: #fef3c7; }
.vm-table-label { fill: #337168; pointer-events: none; }
.vm-table.rect .vm-table-label { fill: #92400e; }
.vm-table-cap { fill: #64748b; pointer-events: none; }

/* 點選桌位後出現的 X 刪除鍵 */
.vm-table-delete {
  cursor: pointer;
}
.vm-table-delete circle {
  fill: #ef4444;
  stroke: #fff;
  stroke-width: 2;
  transition: transform .12s ease, filter .12s ease, fill .12s ease;
  filter: drop-shadow(0 2px 6px rgba(239, 68, 68, 0.45));
}
.vm-table-delete text {
  fill: #fff;
  font-size: 16px;
  font-weight: 800;
  pointer-events: none;
  user-select: none;
}
.vm-table-delete:hover circle {
  fill: #dc2626;
  transform: scale(1.08);
}

/* P4 視覺：座位點位 + Phase B drop target */
.vm-seat {
  fill: #fff;
  stroke: #94a3b8;
  stroke-width: 1.5;
  cursor: pointer;
  /* transform-origin 設在自己中心，scale 才會以 cx/cy 為基準 */
  transform-box: fill-box;
  transform-origin: center;
  transition: fill .18s ease, stroke .18s ease, stroke-width .18s ease, transform .18s ease, filter .18s ease;
}
.vm-table:hover .vm-seat { stroke: #337168; }
.vm-table.rect .vm-seat,
.vm-table.rect:hover .vm-seat { display: none; }
.vm-seat.assigned {
  fill: #337168;
  stroke: #1e3a8a;
}

/* 拖曳中：未分配 seat 脈動發光，提示「可投放」 */
.vm-seat.drop-ready {
  stroke: #10b981;
  stroke-width: 2;
  animation: vm-seat-pulse 1.4s ease-in-out infinite;
}
@keyframes vm-seat-pulse {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(16, 185, 129, 0)); }
  50%      { transform: scale(1.25); filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.7)); }
}
/* 拖曳中：已分配 seat 顯示「會覆蓋」警告 — 紅色虛線 */
.vm-seat.drop-warn {
  stroke: #ef4444;
  stroke-width: 2;
  stroke-dasharray: 3 2;
  animation: vm-seat-warn 1.4s ease-in-out infinite;
}
@keyframes vm-seat-warn {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.15); }
}

/* hover 在 seat 上（被拖曳對象指向）→ 強化版：放大 + 黃光暈 + 蓋過 pulse 動畫 */
.vm-seat.hovered {
  fill: #fbbf24;
  stroke: #d97706;
  stroke-width: 3;
  transform: scale(1.6);
  filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.85));
  animation: none;  /* 蓋過 drop-ready / drop-warn 的 pulse */
}

/* drop 成功瞬間 → 1 秒彈跳 + 綠色光暈 */
.vm-seat.just-assigned {
  animation: vm-seat-bounce 0.65s cubic-bezier(.34, 1.56, .64, 1) 1;
}
@keyframes vm-seat-bounce {
  0%   { transform: scale(0.4); filter: drop-shadow(0 0 0 rgba(16, 185, 129, 0)); }
  60%  { transform: scale(1.6); filter: drop-shadow(0 0 12px rgba(16, 185, 129, 0.9)); }
  100% { transform: scale(1);   filter: drop-shadow(0 0 0 rgba(16, 185, 129, 0)); }
}

.vm-seat-name {
  fill: #fff;
  pointer-events: none;
  user-select: none;
}

/* 桌即時分數徽章（右上角） */
.vm-table-score { pointer-events: none; }
.vm-table-score rect { fill: #f1f5f9; stroke: #cbd5e1; stroke-width: 1; }
.vm-table-score text { fill: #475569; }
.vm-table-score.positive rect { fill: #d1fae5; stroke: #10b981; }
.vm-table-score.positive text { fill: #047857; }
.vm-table-score.negative rect { fill: #fee2e2; stroke: #ef4444; }
.vm-table-score.negative text { fill: #b91c1c; }

/* 智能建議路徑層 */
.vm-suggestions-layer { pointer-events: none; }

.vm-suggest-path {
  fill: none;
  stroke: #94a3b8;
  stroke-width: 2;
  stroke-dasharray: 6 4;
  opacity: 0.6;
  animation: vm-suggest-dash 0.8s linear infinite;
}
.vm-suggest-path.positive { stroke: #10b981; opacity: 0.8; }
.vm-suggest-path.negative { stroke: #ef4444; opacity: 0.55; }
.vm-suggest-path.top {
  stroke-width: 3;
  opacity: 1;
  filter: drop-shadow(0 0 4px currentColor);
}
@keyframes vm-suggest-dash {
  to { stroke-dashoffset: -10; }
}

.vm-suggest-badge rect {
  fill: #f1f5f9;
  stroke: #94a3b8;
  stroke-width: 1.5;
}
.vm-suggest-badge text { fill: #475569; }
.vm-suggest-badge.positive rect { fill: #d1fae5; stroke: #10b981; }
.vm-suggest-badge.positive text { fill: #047857; }
.vm-suggest-badge.negative rect { fill: #fee2e2; stroke: #ef4444; }
.vm-suggest-badge.negative text { fill: #b91c1c; }
.vm-suggest-badge.top rect {
  stroke-width: 2.5;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2));
}

/* 兩欄 layout：左主畫面 + 右側 panel */
.vm-body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 400px;
}

/* 右側未分配賓客 panel */
.vm-panel {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 220px);
}
.vm-panel-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
.vm-panel-head h3 {
  margin: 0; font-size: 0.92rem; font-weight: 700; color: var(--text-main);
}
.vm-panel-count {
  background: #167A67; color: #fff;
  font-size: 0.72rem; font-weight: 700;
  padding: 2px 10px; border-radius: 999px;
}
.vm-panel-hint {
  margin: 0 0 10px; font-size: 0.72rem; color: var(--text-muted);
}

/* VIP / 民眾 分頁籤 */
.vm-panel-tabs {
  display: flex;
  gap: 4px;
  margin: 6px 0 8px;
  padding: 3px;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.vm-panel-tab {
  flex: 1;
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background .15s, color .15s;
}
.vm-panel-tab .cnt {
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  min-width: 20px;
  text-align: center;
}
.vm-panel-tab:hover { color: var(--text-main); }
/* 民眾 tab active：綠色 */
.vm-panel-tab.active {
  background: #fff;
  color: #167A67;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.vm-panel-tab.active .cnt {
  background: #167A67;
  color: #fff;
}
/* VIP tab active：橙色（跟頭像 vip 顏色一致）*/
.vm-panel-tab.vip.active {
  color: #d97706;
}
.vm-panel-tab.vip.active .cnt {
  background: #d97706;
}
.vm-panel-empty {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  color: #167A67; font-weight: 600; font-size: 0.86rem;
}
.vm-panel-list {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px;
  /* 拖曳期間禁止選取文字 */
  user-select: none;
  -webkit-user-select: none;
}
.vm-person {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: grab;
  touch-action: none;
  transition: background .15s, border-color .15s, opacity .2s, transform .2s, filter .2s;
}
.vm-person:hover { border-color: #167A67; background: #ecfdf5; }
.vm-person:active { cursor: grabbing; }
/* 該位賓客正在被拖曳 → panel 內視覺上「拿走了」：半透明 + 內凹 */
.vm-person.dragging {
  opacity: 0.35;
  transform: scale(0.96);
  filter: grayscale(0.6);
  cursor: grabbing;
}
.vm-person-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: #337168; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem; font-weight: 700;
  flex-shrink: 0;
}
.vm-person-avatar.vip { background: #d97706; }
.vm-person-info { flex: 1; min-width: 0; }
.vm-person-name {
  font-size: 0.84rem; font-weight: 600; color: var(--text-main);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vm-person-sub {
  font-size: 0.7rem; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Drag ghost：浮在頁面最上層跟著指針走 */
.vm-drag-ghost {
  position: fixed;
  z-index: 10000;
  transform: translate(-50%, -120%);
  background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
  color: #fff;
  padding: 7px 16px; border-radius: 999px;
  font-size: 0.82rem; font-weight: 700;
  box-shadow: 0 8px 24px rgba(22, 122, 103, .55), 0 0 0 3px rgba(22, 122, 103, .15);
  pointer-events: none;
  white-space: nowrap; max-width: 200px;
  overflow: hidden; text-overflow: ellipsis;
  /* 出現時的微跳入動畫 */
  animation: vm-ghost-in 0.18s ease-out;
}
@keyframes vm-ghost-in {
  from { opacity: 0; transform: translate(-50%, -120%) scale(0.7); }
  to   { opacity: 1; transform: translate(-50%, -120%) scale(1); }
}

/* 自動排位 / 還原按鈕 */
.vm-btn.auto-assign {
  background: #fbbf24; color: #78350f; border-color: #fbbf24;
}
.vm-btn.auto-assign:hover:not(:disabled) { background: #f59e0b; }
.vm-btn.rollback {
  background: #fef2f2; color: #b91c1c; border-color: #fecaca;
}
.vm-btn.rollback:hover { background: #fee2e2; }

@media (max-width: 768px) {
  .vm-body { flex-direction: column; }
  .vm-panel { width: 100%; max-height: 30vh; }
}

.vm-status {
  margin-top: 8px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-family: monospace;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.vm-status .muted { color: var(--text-muted); }
.vm-status .vm-divider { color: var(--text-muted); opacity: 0.5; }
.vm-status .vm-zoom-info { color: #337168; font-weight: 600; }
.vm-status .vm-mode-pan { color: #d97706; font-weight: 600; }
.vm-status .vm-mode-selected { color: #dc2626; font-weight: 600; }
.vm-status .vm-assign-info { color: #1e40af; font-weight: 600; }
.vm-status .vm-mode-drop { color: #b91c1c; font-weight: 600; }
</style>
