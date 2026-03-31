<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { useSeatsStore } from "@/stores/seats";
import { useToast } from "@/composables/useToast";
import { apiRequest } from "@/utils/api";
import type { ParticipantType, Seat, SeatAttendee } from "@/types";

interface SeatPerson {
  id: number;
  serial: string;
  name: string;
  company: string;
  type: ParticipantType;
}

const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();
const seatsStore = useSeatsStore();
const { success: toastSuccess, error: toastError } = useToast();

// ── 活動與座位 key ──
const getActivityKey = (eventId?: number) => eventId ? `event_${eventId}` : "act_01";
const currentActivityId = ref(getActivityKey(eventsStore.currentEvent?.id));

// ── 座位資料 ──
const layout = seatsStore.layout;
const activitySeats = seatsStore.activitySeats;
const cols = computed(() => layout.cols);
const rows = computed(() => layout.rows);

// 欄位字母標頭 A B C D...
const colHeaders = computed(() =>
  Array.from({ length: cols.value }, (_, i) => String.fromCharCode(65 + i))
);

// 取得座位 label（A1, B2...）
const getSeatLabel = (row: number, col: number) =>
  `${String.fromCharCode(65 + col)}${row + 1}`;

// 取得座位物件
const getSeat = (row: number, col: number): Seat | null => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return null;
  const idx = row * cols.value + col;
  return seats[idx] || null;
};

// ── 參與者 ──
const allParticipants = computed<SeatPerson[]>(() =>
  participantsStore.participants.map((p, i) => ({
    id: p.id,
    serial: String(i + 1).padStart(4, "0"),
    name: p.name,
    company: p.company || "",
    type: (p.type || "一般民眾") as ParticipantType,
  }))
);

// 未分配名單
const searchQuery = ref("");
const onlyUnassigned = ref(true);

const unassignedList = ref<SeatPerson[]>([]);
const updateUnassignedList = () => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) {
    unassignedList.value = [...allParticipants.value];
    return;
  }
  const seatedIds = new Set(
    seats.filter((s: Seat) => s.attendee.length > 0)
      .map((s: Seat) => (s.attendee[0] as unknown as SeatPerson).id)
  );
  unassignedList.value = allParticipants.value.filter((p) => !seatedIds.has(p.id));
};

const vipList = computed(() => {
  let list = onlyUnassigned.value ? unassignedList.value : allParticipants.value;
  list = list.filter((p) => p.type === "VIP");
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.company.toLowerCase().includes(q));
  }
  return list;
});

const generalList = computed(() => {
  let list = onlyUnassigned.value ? unassignedList.value : allParticipants.value;
  list = list.filter((p) => p.type !== "VIP");
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.company.toLowerCase().includes(q));
  }
  return list;
});

// ── 選取座位 ──
const selectedSeats = ref<Set<number>>(new Set());
const toolMode = ref<"select" | "drag">("select");

const toggleSeatSelect = (row: number, col: number) => {
  if (toolMode.value !== "select") return;
  const idx = row * cols.value + col;
  if (selectedSeats.value.has(idx)) {
    selectedSeats.value.delete(idx);
  } else {
    selectedSeats.value.add(idx);
  }
  // 強制 reactivity
  selectedSeats.value = new Set(selectedSeats.value);
};

const clearSelection = () => {
  selectedSeats.value = new Set();
};

const isSeatSelected = (row: number, col: number) => {
  return selectedSeats.value.has(row * cols.value + col);
};

// ── 座位狀態 ──
type SeatStatus = "empty" | "assigned" | "aisle" | "reserved";

const seatStatuses = ref<Record<number, SeatStatus>>({});

const getSeatStatus = (row: number, col: number): SeatStatus => {
  const idx = row * cols.value + col;
  if (seatStatuses.value[idx]) return seatStatuses.value[idx];
  const seat = getSeat(row, col);
  if (seat && seat.attendee.length > 0) return "assigned";
  return "empty";
};

const setSelectedAs = (status: SeatStatus) => {
  for (const idx of selectedSeats.value) {
    if (status === "empty") {
      delete seatStatuses.value[idx];
    } else {
      seatStatuses.value[idx] = status;
    }
  }
  clearSelection();
};

// ── 分配人員到座位 ──
const assignPerson = (person: SeatPerson, row: number, col: number) => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  const idx = row * cols.value + col;
  if (!seats[idx]) return;
  seats[idx].attendee = [person as unknown as SeatAttendee];
  seats[idx].label = getSeatLabel(row, col);
  updateUnassignedList();
};

const removePerson = (row: number, col: number) => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  const idx = row * cols.value + col;
  if (!seats[idx]) return;
  seats[idx].attendee = [];
  updateUnassignedList();
};

// 拖曳分配
const dragPerson = ref<SeatPerson | null>(null);
const dragFromSeat = ref<{ row: number; col: number } | null>(null);

const onDragStart = (person: SeatPerson, fromSeat?: { row: number; col: number }) => {
  dragPerson.value = person;
  dragFromSeat.value = fromSeat || null;
};

const onDrop = (row: number, col: number) => {
  if (!dragPerson.value) return;
  const status = getSeatStatus(row, col);
  if (status === "aisle" || status === "reserved") return;

  // 如果是從另一個座位拖過來，先清除原座位
  if (dragFromSeat.value) {
    const { row: fromRow, col: fromCol } = dragFromSeat.value;
    // 如果目標座位已有人，做互換
    const targetSeat = getSeat(row, col);
    if (targetSeat && targetSeat.attendee.length > 0) {
      const targetPerson = targetSeat.attendee[0] as unknown as SeatPerson;
      removePerson(row, col);
      assignPerson(targetPerson, fromRow, fromCol);
    } else {
      removePerson(fromRow, fromCol);
    }
  } else {
    // 從左側面板拖入，如果目標已有人先移除
    const seat = getSeat(row, col);
    if (seat && seat.attendee.length > 0) {
      removePerson(row, col);
    }
  }

  assignPerson(dragPerson.value, row, col);
  dragPerson.value = null;
  dragFromSeat.value = null;
};

// ── 縮放 ──
const zoom = ref(100);
const zoomIn = () => { if (zoom.value < 150) zoom.value += 10; };
const zoomOut = () => { if (zoom.value > 50) zoom.value -= 10; };

// ── 增加行列 ──
const addRow = () => seatsStore.addRow(currentActivityId.value);
const addCol = () => seatsStore.addCol(currentActivityId.value);

// ── 監控頁 ──
const openMonitor = () => {
  const url = window.location.href.replace(/#.*$/, "") + "#/seat-monitor";
  window.open(url, "seat-monitor", "noopener");
};

// ── 儲存 ──
const savingSeats = ref(false);
const saveSeats = async () => {
  const eventId = eventsStore.currentEvent?.id;
  if (!eventId) return;
  savingSeats.value = true;
  try {
    await apiRequest(`/api/seats/layout/${eventId}/`, {
      method: "PATCH",
      body: JSON.stringify({ rows: layout.rows, cols: layout.cols }),
    });
    const seats = activitySeats[currentActivityId.value] || [];
    const assignments = seats
      .map((seat: Seat, index: number) => {
        if (seat.attendee.length === 0) return null;
        return { seat_index: index, seat_label: seat.label, participant_id: (seat.attendee[0] as SeatAttendee).id };
      })
      .filter(Boolean);
    await apiRequest(`/api/seats/assignments/${eventId}/bulk/`, {
      method: "POST",
      body: JSON.stringify({ assignments }),
    });
    toastSuccess("座位分配已儲存");
  } catch {
    toastError("儲存失敗");
  } finally {
    savingSeats.value = false;
  }
};

// ── 初始化 ──
watch(() => eventsStore.currentEvent?.id, (newId) => {
  currentActivityId.value = getActivityKey(newId);
  seatsStore.ensureActivity(currentActivityId.value);
  updateUnassignedList();
});

onMounted(async () => {
  const event = eventsStore.currentEvent;
  if (event?.id) {
    await seatsStore.loadFromBackend(event.id);
    await participantsStore.fetchParticipants({ event: String(event.id) });
  }
  seatsStore.ensureActivity(currentActivityId.value);
  updateUnassignedList();
});
</script>

<template>
  <div class="seat-page">
    <!-- 左側面板 -->
    <aside class="left-panel">
      <div class="panel-toggle">
        <label class="toggle-row">
          <span class="toggle-label">僅顯示未分配</span>
          <input type="checkbox" v-model="onlyUnassigned" class="toggle-input" />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>

      <div class="panel-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchQuery" placeholder="搜尋..." />
      </div>

      <!-- VIP -->
      <div class="person-section">
        <div class="section-title vip">VIP ({{ vipList.length }})</div>
        <div
          v-for="p in vipList"
          :key="'v-' + p.id"
          class="person-card"
          draggable="true"
          @dragstart="onDragStart(p)"
        >
          <div class="person-info">
            <div class="person-name">{{ p.name }}</div>
            <div class="person-company">{{ p.company }}</div>
          </div>
          <div class="person-meta">
            <span class="person-serial">#{{ p.serial }}</span>
            <span class="badge badge-unassigned">未分配</span>
          </div>
        </div>
      </div>

      <!-- 參加者 -->
      <div class="person-section">
        <div class="section-title general">參加者 ({{ generalList.length }})</div>
        <div
          v-for="p in generalList"
          :key="'g-' + p.id"
          class="person-card"
          draggable="true"
          @dragstart="onDragStart(p)"
        >
          <div class="person-info">
            <div class="person-name">{{ p.name }}</div>
            <div class="person-company">{{ p.company }}</div>
          </div>
          <div class="person-meta">
            <span class="person-serial">#{{ p.serial }}</span>
            <span class="badge badge-unassigned">未分配</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- 主區域 -->
    <main class="main-area">
      <!-- 頂部工具列 -->
      <div class="top-bar">
        <div class="top-bar-left">
          <button class="tool-btn" :class="{ active: toolMode === 'select' }" @click="toolMode = 'select'" title="選取模式">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
          </button>
          <button class="tool-btn" :class="{ active: toolMode === 'drag' }" @click="toolMode = 'drag'" title="拖曳模式">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 13"/></svg>
          </button>
          <div class="tool-divider"></div>
          <button class="tool-btn" @click="addCol" title="新增欄">→|</button>
          <button class="tool-btn" @click="addRow" title="新增列">↓</button>
          <div class="tool-divider"></div>
          <button class="tool-btn" @click="openMonitor" title="即時監控">📡</button>
          <button class="tool-btn save-tool" :disabled="savingSeats" @click="saveSeats">
            {{ savingSeats ? '儲存中...' : '💾 儲存' }}
          </button>
        </div>
      </div>

      <!-- 舞台 -->
      <div class="stage-area" :style="{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }">
        <div class="stage-label">舞台</div>
        <div class="stage-bar"></div>

        <!-- 座位表 -->
        <div class="seat-grid-wrapper">
          <!-- 欄位標頭 -->
          <div class="grid-header" :style="{ gridTemplateColumns: `40px repeat(${cols}, 1fr)` }">
            <div></div>
            <div v-for="h in colHeaders" :key="h" class="col-header">{{ h }}</div>
          </div>

          <!-- 座位行 -->
          <div
            v-for="r in rows"
            :key="'row-' + r"
            class="grid-row"
            :style="{ gridTemplateColumns: `40px repeat(${cols}, 1fr)` }"
          >
            <div class="row-header">{{ r }}</div>
            <div
              v-for="c in cols"
              :key="'seat-' + r + '-' + c"
              class="seat-cell"
              :class="{
                selected: isSeatSelected(r - 1, c - 1),
                assigned: getSeatStatus(r - 1, c - 1) === 'assigned',
                aisle: getSeatStatus(r - 1, c - 1) === 'aisle',
                reserved: getSeatStatus(r - 1, c - 1) === 'reserved',
              }"
              @click="toggleSeatSelect(r - 1, c - 1)"
              @dragover.prevent
              @drop="onDrop(r - 1, c - 1)"
            >
              <template v-if="getSeatStatus(r - 1, c - 1) === 'aisle'">
                <div class="seat-aisle"></div>
              </template>
              <template v-else-if="getSeatStatus(r - 1, c - 1) === 'assigned'">
                <div
                  class="seat-content assigned-content"
                  draggable="true"
                  @dragstart.stop="onDragStart(
                    getSeat(r - 1, c - 1)?.attendee[0] as any,
                    { row: r - 1, col: c - 1 }
                  )"
                >
                  <span class="seat-serial">#{{ (getSeat(r - 1, c - 1)?.attendee[0] as any)?.serial || '' }}</span>
                  <span class="seat-person-name">{{ (getSeat(r - 1, c - 1)?.attendee[0] as any)?.name || '' }}</span>
                </div>
                <button class="seat-remove" @click.stop="removePerson(r - 1, c - 1)">×</button>
              </template>
              <template v-else>
                <div class="seat-content">
                  <span class="seat-label-text">{{ getSeatLabel(r - 1, c - 1) }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部選取工具列 -->
      <Transition name="toolbar-slide">
        <div v-if="selectedSeats.size > 0" class="selection-toolbar">
          <span class="sel-count">已選取 {{ selectedSeats.size }} 個座位</span>
          <button class="sel-btn" @click="setSelectedAs('empty')">
            <span class="sel-dot empty-dot"></span> 恢復為空位
          </button>
          <button class="sel-btn" @click="setSelectedAs('aisle')">
            <span class="sel-dot aisle-dot"></span> 設定為走道
          </button>
          <button class="sel-btn" @click="setSelectedAs('reserved')">
            <span class="sel-dot reserved-dot"></span> 設定為保留座
          </button>
          <button class="sel-btn cancel" @click="clearSelection">取消選取</button>
        </div>
      </Transition>

      <!-- 縮放控制 -->
      <div class="zoom-controls">
        <button class="zoom-btn" @click="zoomIn">+</button>
        <span class="zoom-label">{{ zoom }}%</span>
        <button class="zoom-btn" @click="zoomOut">−</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.seat-page {
  display: flex;
  height: 100%;
  min-height: calc(100vh - 64px);
  background: #f8f9fb;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* ===== 左側面板 ===== */
.left-panel {
  width: 280px;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 16px;
}

.panel-toggle {
  margin-bottom: 12px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.toggle-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: #334155;
}

.toggle-input { display: none; }

.toggle-track {
  width: 40px;
  height: 22px;
  background: #cbd5e1;
  border-radius: 11px;
  position: relative;
  transition: background 0.2s;
}

.toggle-input:checked + .toggle-track {
  background: #6366f1;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.toggle-input:checked + .toggle-track .toggle-thumb {
  transform: translateX(18px);
}

.panel-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 16px;
}

.panel-search input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.85rem;
  color: #1e293b;
  width: 100%;
}

.person-section { margin-bottom: 16px; }

.section-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 4px 0 8px;
}

.section-title.vip { color: #6366f1; }
.section-title.general { color: #f59e0b; }

.person-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  margin-bottom: 6px;
  cursor: grab;
  transition: all 0.15s;
  background: #fff;
}

.person-card:hover {
  border-color: #c7d2fe;
  box-shadow: 0 2px 8px rgba(99,102,241,0.1);
}

.person-card:active { cursor: grabbing; }

.person-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #1e293b;
}

.person-company {
  font-size: 0.75rem;
  color: #94a3b8;
}

.person-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.person-serial {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  font-family: monospace;
}

.badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}

.badge-unassigned {
  background: #dbeafe;
  color: #1e40af;
}

/* ===== 主區域 ===== */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: auto;
  padding: 16px;
}

/* 頂部工具列 */
.top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  background: #fff;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-btn {
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #64748b;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-btn:hover { background: #f1f5f9; color: #334155; }
.tool-btn.active { background: #eef2ff; color: #4f46e5; }
.tool-btn.save-tool {
  background: #6366f1;
  color: #fff;
  font-weight: 600;
  padding: 8px 16px;
}
.tool-btn.save-tool:hover { background: #4f46e5; }
.tool-btn.save-tool:disabled { opacity: 0.6; cursor: not-allowed; }

.tool-divider {
  width: 1px;
  height: 20px;
  background: #e2e8f0;
  margin: 0 4px;
}

/* 舞台 */
.stage-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.2s;
}

.stage-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.stage-bar {
  width: min(500px, 60%);
  height: 12px;
  background: linear-gradient(135deg, #334155, #1e293b);
  border-radius: 6px;
  margin-bottom: 24px;
}

/* 座位表 */
.seat-grid-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.grid-header, .grid-row {
  display: grid;
  gap: 6px;
}

.col-header, .row-header {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #94a3b8;
}

.row-header {
  width: 40px;
}

/* 座位格 */
.seat-cell {
  width: 72px;
  height: 72px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  background: #fff;
}

.seat-cell:hover {
  border-color: #c7d2fe;
  box-shadow: 0 2px 8px rgba(99,102,241,0.15);
}

.seat-cell.selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
}

.seat-cell.assigned {
  background: #fefce8;
  border-color: #fde68a;
}

.seat-cell.aisle {
  background: transparent;
  border: 2px dashed #e2e8f0;
  cursor: default;
}

.seat-cell.reserved {
  background: #fef2f2;
  border-color: #fca5a5;
}

.seat-cell.assigned .assigned-content {
  cursor: grab;
}

.seat-cell.assigned .assigned-content:active {
  cursor: grabbing;
  opacity: 0.6;
}

.seat-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.seat-label-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
}

.assigned-content {
  text-align: center;
}

.seat-serial {
  font-size: 0.65rem;
  color: #94a3b8;
  font-family: monospace;
}

.seat-person-name {
  font-size: 0.72rem;
  font-weight: 700;
  color: #1e293b;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.seat-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ef4444;
  color: #fff;
  border: 2px solid #fff;
  font-size: 0.7rem;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.seat-cell:hover .seat-remove { display: flex; }

.seat-aisle {
  width: 100%;
  height: 100%;
}

/* 底部選取工具列 */
.selection-toolbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  padding: 12px 20px;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  border: 1px solid #e5e7eb;
  z-index: 50;
}

.sel-count {
  font-size: 0.85rem;
  font-weight: 700;
  color: #1e293b;
  padding-right: 8px;
  border-right: 1px solid #e5e7eb;
}

.sel-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
  transition: background 0.15s;
}

.sel-btn:hover { background: #f1f5f9; }
.sel-btn.cancel { color: #ef4444; }
.sel-btn.cancel:hover { background: #fef2f2; }

.sel-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.empty-dot { background: #e2e8f0; border: 1px solid #cbd5e1; }
.aisle-dot { background: #ef4444; }
.reserved-dot { background: #f59e0b; }

.toolbar-slide-enter-active, .toolbar-slide-leave-active { transition: all 0.3s ease; }
.toolbar-slide-enter-from, .toolbar-slide-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

/* 縮放 */
.zoom-controls {
  position: fixed;
  right: 32px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: #fff;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  z-index: 20;
}

.zoom-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 700;
  color: #475569;
  transition: background 0.15s;
}

.zoom-btn:hover { background: #f1f5f9; }

.zoom-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #94a3b8;
}

/* ===== RWD ===== */
@media (max-width: 768px) {
  .seat-page { flex-direction: column; }
  .left-panel {
    width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    overflow-x: auto;
  }
  .person-section { min-width: 200px; }
  .zoom-controls { display: none; }
  .selection-toolbar { left: 16px; right: 16px; transform: none; }
}
</style>
