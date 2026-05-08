<script setup lang="ts">
// ════════════════════════════════════════════════════════════════════
// 會場桌位佈局 — P1 MVP
// ════════════════════════════════════════════════════════════════════
//
// 設計目標（依 REMAINING_ISSUES「會場圖拖曳新規劃」P1）：
// - 純 SVG + Pointer Events，無第三方拖曳套件
// - 單一 <svg> 用 viewBox 控縮放／平移（P2 才接 zoom/pan）
// - 每張桌用 <g transform="translate(x,y)">，只改 x/y
// - 座標吸附網格 50px
// - touch-action: none + user-select: none
// - 拖曳走 requestAnimationFrame 節流
// - 桌位資料目前是 local state（mock）；P3 才接後端 API
//
// 不在 P1 範圍：
// - viewBox zoom / pan（P2）
// - 後端持久化（P3）
// - 圓桌座位點 + drop 賓客（P4）
import { computed, ref } from 'vue'

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

// 螢幕 → SVG 內部座標（依目前 viewBox 比例換算）
const screenToSvg = (clientX: number, clientY: number) => {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const rect = svg.getBoundingClientRect()
  return {
    x: ((clientX - rect.left) / rect.width) * SVG_W,
    y: ((clientY - rect.top) / rect.height) * SVG_H,
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
      <p class="vm-hint">拖曳桌位移動，自動吸附 {{ GRID }}px 網格 — 共 {{ tableCount }} 張桌</p>
      <div class="vm-actions">
        <button class="vm-btn primary" @click="addRoundTable">+ 新增圓桌</button>
        <button
          class="vm-btn"
          :disabled="!draggingTableId"
          @click="draggingTableId && removeTable(draggingTableId)"
        >刪除選中</button>
      </div>
    </header>

    <div class="vm-canvas-wrap">
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
        class="vm-svg"
        preserveAspectRatio="xMidYMid meet"
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
      <span v-if="draggingTableId">拖曳中 — 桌 {{ draggingTableId }} 位置：
        ({{ tables.find((t) => t.id === draggingTableId)?.x ?? 0 }},
        {{ tables.find((t) => t.id === draggingTableId)?.y ?? 0 }})</span>
      <span v-else class="muted">點擊桌位拖曳；放開後座標會自動對齊網格</span>
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
}
.vm-status .muted { color: var(--text-muted); }
</style>
