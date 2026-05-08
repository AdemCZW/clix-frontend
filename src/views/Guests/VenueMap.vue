<script setup lang="ts">
// ════════════════════════════════════════════════════════════════════
// 會場桌位佈局 — P1 + P2
// ════════════════════════════════════════════════════════════════════
//
// 設計目標（依 REMAINING_ISSUES「會場圖拖曳新規劃」）：
// P1 ✅ 純 SVG + Pointer Events 桌位拖曳 + 50px 網格吸附
// P2 ✅ wheel zoom（以滑鼠位置為中心）+ 中鍵 / 空白鍵 + 拖曳 pan
//
// 不在範圍：
// - 後端持久化（P3）
// - 圓桌座位點 + drop 賓客（P4）
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface Table {
  id: number
  x: number
  y: number
  label: string
  capacity: number
  shape: 'round' | 'rect'
}

// ── 畫布 / 桌位常數 ──────────────────────────────────────────
const SVG_W = 1600
const SVG_H = 1200
const GRID = 50          // 網格吸附單位
const TABLE_SIZE = 80    // 桌寬高（圓桌直徑、方桌邊長）

// ── Mock 桌位（P3 改為從後端 fetch） ────────────────────────
const tables = ref<Table[]>([
  { id: 1, x: 100, y: 100, label: 'A1', capacity: 10, shape: 'round' },
  { id: 2, x: 300, y: 100, label: 'A2', capacity: 10, shape: 'round' },
  { id: 3, x: 500, y: 100, label: 'A3', capacity: 10, shape: 'round' },
  { id: 4, x: 100, y: 300, label: 'B1', capacity: 8, shape: 'round' },
  { id: 5, x: 300, y: 300, label: 'B2', capacity: 8, shape: 'round' },
  { id: 6, x: 500, y: 300, label: 'B3', capacity: 8, shape: 'round' },
  { id: 7, x: 100, y: 500, label: 'VIP', capacity: 12, shape: 'rect' },
])

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
  offsetX: number
  offsetY: number
  rafId: number | null
  // pending 座標：rafId 觸發時才寫入 tables，避免每次 move 都 re-render
  pendingX: number
  pendingY: number
}
let drag: DragState | null = null

const draggingTableId = ref<number | null>(null)

const onPointerDown = (e: PointerEvent, table: Table) => {
  e.preventDefault()
  e.stopPropagation()
  const target = e.currentTarget as Element
  target.setPointerCapture(e.pointerId)
  const p = screenToSvg(e.clientX, e.clientY)
  drag = {
    tableId: table.id,
    pointerId: e.pointerId,
    offsetX: p.x - table.x,
    offsetY: p.y - table.y,
    rafId: null,
    pendingX: table.x,
    pendingY: table.y,
  }
  draggingTableId.value = table.id
}

const onPointerMove = (e: PointerEvent) => {
  if (!drag || drag.pointerId !== e.pointerId) return
  e.preventDefault()
  const p = screenToSvg(e.clientX, e.clientY)
  drag.pendingX = snap(p.x - drag.offsetX)
  drag.pendingY = snap(p.y - drag.offsetY)
  // requestAnimationFrame 節流：每 frame 最多寫入一次 tables
  if (drag.rafId !== null) return
  drag.rafId = requestAnimationFrame(() => {
    if (!drag) return
    const t = tables.value.find((tt) => tt.id === drag!.tableId)
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
  const target = e.currentTarget as Element
  try { target.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  if (drag.rafId !== null) cancelAnimationFrame(drag.rafId)
  drag = null
  draggingTableId.value = null
  // P3：之後在這裡呼叫後端 PATCH /api/tables/bulk-coords/
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
  // 只接「中鍵」或「空白鍵 + 左鍵」啟動 pan，避免跟桌位拖曳衝突
  const isMiddle = e.button === 1
  const isSpaceLeft = e.button === 0 && isSpaceDown.value
  if (!isMiddle && !isSpaceLeft) return
  e.preventDefault()
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

// SVG 容器 cursor：空白鍵按住變 grab；正在 pan 變 grabbing
const svgCursor = computed(() => {
  if (isPanning.value) return 'grabbing'
  if (isSpaceDown.value) return 'grab'
  return 'default'
})

// ── 加 / 刪桌（簡單 demo 用，P3 接 API 後改 store action） ──
let nextId = 100
const addRoundTable = () => {
  tables.value.push({
    id: nextId++,
    x: snap(SVG_W / 2 - TABLE_SIZE / 2),
    y: snap(SVG_H / 2 - TABLE_SIZE / 2),
    label: `T${tables.value.length + 1}`,
    capacity: 10,
    shape: 'round',
  })
}
const removeTable = (id: number) => {
  tables.value = tables.value.filter((t) => t.id !== id)
}

// ── 顯示文字 ─────────────────────────────────────────────────
const tableCount = computed(() => tables.value.length)
</script>

<template>
  <div class="venue-map">
    <header class="vm-header">
      <div class="vm-title">
        <h2>會場桌位佈局</h2>
        <span class="vm-tag">P1 MVP</span>
      </div>
      <p class="vm-hint">
        拖曳桌位移動 / 滾輪縮放 / 空白鍵 + 拖曳平移 — 共 {{ tableCount }} 張桌
      </p>
      <div class="vm-actions">
        <button class="vm-btn primary" @click="addRoundTable">+ 新增圓桌</button>
        <button
          class="vm-btn"
          :disabled="!draggingTableId"
          @click="draggingTableId && removeTable(draggingTableId)"
        >刪除選中</button>
        <button class="vm-btn" @click="zoomToFit" title="重置視角到 100%">⤢ 重置視角</button>
      </div>
    </header>

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
          :class="{ dragging: draggingTableId === t.id, rect: t.shape === 'rect' }"
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
        </g>
      </svg>
    </div>

    <div class="vm-status">
      <span class="vm-zoom-info">縮放 {{ zoomPercent }}% · 視角 ({{ Math.round(viewBox.x) }}, {{ Math.round(viewBox.y) }})</span>
      <span class="vm-divider">|</span>
      <span v-if="isPanning" class="vm-mode-pan">平移視角中…</span>
      <span v-else-if="isSpaceDown" class="vm-mode-pan">空白鍵按住中（拖曳即可平移視角）</span>
      <span v-else-if="draggingTableId">拖曳桌 {{ draggingTableId }}：
        ({{ tables.find((t) => t.id === draggingTableId)?.x ?? 0 }},
         {{ tables.find((t) => t.id === draggingTableId)?.y ?? 0 }})</span>
      <span v-else class="muted">滾輪縮放 / 空白鍵 + 拖曳平移 / 點擊桌位拖曳吸附網格</span>
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
</style>
