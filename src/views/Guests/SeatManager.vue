<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { useSeatsStore } from "@/stores/seats";
import { useToast } from "@/composables/useToast";
import { apiRequest } from "@/utils/api";
import PageLoader from "@/components/shared/PageLoader.vue";
import type { ParticipantType, Seat, SeatAttendee } from "@/types";

interface SeatPerson { id: number; serial: string; name: string; company: string; type: ParticipantType; }

const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();
const seatsStore = useSeatsStore();
const { success: toastSuccess, error: toastError } = useToast();

const panelOpen = ref(false);
const mobileToolsOpen = ref(false);
const getActivityKey = (eventId?: number) => eventId ? `event_${eventId}` : "act_01";
const currentActivityId = ref(getActivityKey(eventsStore.currentEvent?.id));
const layout = seatsStore.layout;
const activitySeats = seatsStore.activitySeats;
const cols = computed(() => layout.cols);
const rows = computed(() => layout.rows);
const colHeaders = computed(() => Array.from({ length: cols.value }, (_, i) => String.fromCharCode(65 + i)));
const getSeatLabel = (r: number, c: number) => `${String.fromCharCode(65 + c)}${r + 1}`;
const getSeat = (r: number, c: number): Seat | null => {
  const s = activitySeats[currentActivityId.value];
  return s ? s[r * cols.value + c] || null : null;
};
const getIdx = (r: number, c: number) => r * cols.value + c;

// ── 參與者 ──
const allParticipants = computed<SeatPerson[]>(() =>
  participantsStore.participants.map((p, i) => ({
    id: p.id, serial: String(i + 1).padStart(4, "0"),
    name: p.name, company: p.company || "",
    type: (p.type || "一般民眾") as ParticipantType,
  }))
);

const searchQuery = ref("");
const onlyUnassigned = ref(true);
const unassignedList = ref<SeatPerson[]>([]);

const updateUnassignedList = () => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) { unassignedList.value = [...allParticipants.value]; return; }
  const ids = new Set(seats.filter((s: Seat) => s.attendee.length > 0).map((s: Seat) => (s.attendee[0] as unknown as SeatPerson).id));
  unassignedList.value = allParticipants.value.filter(p => !ids.has(p.id));
};

const filteredList = (type: "VIP" | "general") => {
  let list = onlyUnassigned.value ? unassignedList.value : allParticipants.value;
  list = type === "VIP" ? list.filter(p => p.type === "VIP") : list.filter(p => p.type !== "VIP");
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || p.company.toLowerCase().includes(q));
  }
  return list;
};

const vipList = computed(() => filteredList("VIP"));
const generalList = computed(() => filteredList("general"));

// ── 標籤頁 ──
const activeTab = ref<"VIP" | "general">("VIP");

// ── 座位狀態（從 store 讀取，支援持久化）──
type SeatStatus = "empty" | "assigned" | "aisle" | "reserved";

const getSeatStatus = (r: number, c: number): SeatStatus => {
  const idx = getIdx(r, c);
  const meta = seatsStore.getSeatMeta(currentActivityId.value, idx);
  if (meta === "aisle" || meta === "reserved") return meta as SeatStatus;
  const seat = getSeat(r, c);
  if (seat && seat.attendee.length > 0) return "assigned";
  return "empty";
};

// ── 選取（點擊選取，跟拖曳共存）──
const selectedSeats = ref<Set<number>>(new Set());
const isSeatSelected = (r: number, c: number) => selectedSeats.value.has(getIdx(r, c));

const toggleSeatSelect = (r: number, c: number) => {
  const idx = getIdx(r, c);
  if (selectedSeats.value.has(idx)) selectedSeats.value.delete(idx);
  else selectedSeats.value.add(idx);
  selectedSeats.value = new Set(selectedSeats.value);
};

const clearSelection = () => { selectedSeats.value = new Set(); };

// 整排選取
const selectRow = (r: number) => {
  for (let c = 0; c < cols.value; c++) {
    selectedSeats.value.add(getIdx(r, c));
  }
  selectedSeats.value = new Set(selectedSeats.value);
};

const selectCol = (c: number) => {
  for (let r = 0; r < rows.value; r++) {
    selectedSeats.value.add(getIdx(r, c));
  }
  selectedSeats.value = new Set(selectedSeats.value);
};

// 設定選取座位狀態（走道/保留座時，已有來賓放回未分配）
const setSelectedAs = (status: SeatStatus) => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  for (const idx of selectedSeats.value) {
    // 如果設為走道或保留座，且座位上有人，先移除
    if ((status === "aisle" || status === "reserved") && seats[idx] && seats[idx].attendee.length > 0) {
      seats[idx].attendee = [];
    }
    if (status === "empty") {
      seatsStore.setSeatMeta(currentActivityId.value, idx, null);
    } else {
      seatsStore.setSeatMeta(currentActivityId.value, idx, status);
    }
  }
  updateUnassignedList();
  clearSelection();
};

// ── 分配/移除 ──
const assignPerson = (person: SeatPerson, r: number, c: number) => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  const idx = getIdx(r, c);
  if (!seats[idx]) return;
  seats[idx].attendee = [person as unknown as SeatAttendee];
  seats[idx].label = getSeatLabel(r, c);
  updateUnassignedList();
};

const removePerson = (r: number, c: number) => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  seats[getIdx(r, c)].attendee = [];
  updateUnassignedList();
};

// ── 拖曳（從左側面板或座位上拖曳）──
const dragPerson = ref<SeatPerson | null>(null);
const dragFrom = ref<{ r: number; c: number } | null>(null);
const dragOverIdx = ref<number | null>(null);

const onDragStartPerson = (p: SeatPerson, e: DragEvent) => {
  dragPerson.value = p;
  dragFrom.value = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", p.name);
  }
};

const onDragStartSeat = (r: number, c: number, e: DragEvent) => {
  const seat = getSeat(r, c);
  if (!seat || seat.attendee.length === 0) return;
  dragPerson.value = seat.attendee[0] as unknown as SeatPerson;
  dragFrom.value = { r, c };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragPerson.value.name);
  }
};

const onDragOver = (r: number, c: number, e: DragEvent) => {
  e.preventDefault();
  const status = getSeatStatus(r, c);
  if (status === "aisle" || status === "reserved") return;
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dragOverIdx.value = getIdx(r, c);
};

const onDragLeave = () => { dragOverIdx.value = null; };

const onDrop = (r: number, c: number) => {
  dragOverIdx.value = null;
  if (!dragPerson.value) return;
  const status = getSeatStatus(r, c);
  if (status === "aisle" || status === "reserved") return;

  if (dragFrom.value) {
    const { r: fr, c: fc } = dragFrom.value;
    const target = getSeat(r, c);
    if (target && target.attendee.length > 0) {
      const tp = target.attendee[0] as unknown as SeatPerson;
      removePerson(r, c);
      assignPerson(tp, fr, fc);
    } else {
      removePerson(fr, fc);
    }
  } else {
    const seat = getSeat(r, c);
    if (seat && seat.attendee.length > 0) removePerson(r, c);
  }
  assignPerson(dragPerson.value, r, c);
  dragPerson.value = null;
  dragFrom.value = null;
};

const onDragEnd = () => {
  dragPerson.value = null;
  dragFrom.value = null;
  dragOverIdx.value = null;
};

// ── 縮放 ──
const zoom = ref(100);
const zoomIn = () => { if (zoom.value < 150) zoom.value += 10; };
const zoomOut = () => { if (zoom.value > 50) zoom.value -= 10; };
// ── 增加/刪除行列 ──
const addRowBottom = () => seatsStore.addRow(currentActivityId.value);
const addColRight = () => seatsStore.addCol(currentActivityId.value);

const addRowTop = () => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  const newSeats: Seat[] = Array.from({ length: cols.value }, (_, i) => ({
    id: `s-top-${Date.now()}-${i}`, label: '', attendee: [],
  }));
  seats.unshift(...newSeats);
  layout.rows++;
  // 更新所有 label
  seats.forEach((s, idx) => { s.label = getSeatLabel(Math.floor(idx / cols.value), idx % cols.value); });
  updateUnassignedList();
};

const addColLeft = () => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  const newCols = cols.value + 1;
  const newSeats: Seat[] = [];
  for (let r = 0; r < rows.value; r++) {
    newSeats.push({ id: `s-left-${Date.now()}-${r}`, label: '', attendee: [] });
    for (let c = 0; c < cols.value; c++) {
      newSeats.push(seats[r * cols.value + c]);
    }
  }
  layout.cols = newCols;
  activitySeats[currentActivityId.value] = newSeats;
  newSeats.forEach((s, idx) => { s.label = getSeatLabel(Math.floor(idx / newCols), idx % newCols); });
  updateUnassignedList();
};

const hasGuestsInLastRow = () => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return false;
  const start = (rows.value - 1) * cols.value;
  return seats.slice(start, start + cols.value).some(s => s.attendee.length > 0);
};

const hasGuestsInLastCol = () => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return false;
  for (let r = 0; r < rows.value; r++) {
    const idx = r * cols.value + (cols.value - 1);
    if (seats[idx] && seats[idx].attendee.length > 0) return true;
  }
  return false;
};

const hasGuestsInFirstRow = () => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return false;
  return seats.slice(0, cols.value).some(s => s.attendee.length > 0);
};

const hasGuestsInFirstCol = () => {
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return false;
  for (let r = 0; r < rows.value; r++) {
    if (seats[r * cols.value] && seats[r * cols.value].attendee.length > 0) return true;
  }
  return false;
};

const removeRowBottom = () => {
  if (rows.value <= 1) return;
  if (hasGuestsInLastRow() && !confirm('最後一列有來賓，確定要刪除嗎？來賓將被移回未分配名單。')) return;
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  seats.splice((rows.value - 1) * cols.value, cols.value);
  layout.rows--;
  updateUnassignedList();
};

const removeRowTop = () => {
  if (rows.value <= 1) return;
  if (hasGuestsInFirstRow() && !confirm('第一列有來賓，確定要刪除嗎？來賓將被移回未分配名單。')) return;
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  seats.splice(0, cols.value);
  layout.rows--;
  seats.forEach((s, idx) => { s.label = getSeatLabel(Math.floor(idx / cols.value), idx % cols.value); });
  updateUnassignedList();
};

const removeColRight = () => {
  if (cols.value <= 1) return;
  if (hasGuestsInLastCol() && !confirm('最右欄有來賓，確定要刪除嗎？來賓將被移回未分配名單。')) return;
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  const newSeats: Seat[] = [];
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c < cols.value - 1; c++) {
      newSeats.push(seats[r * cols.value + c]);
    }
  }
  layout.cols--;
  activitySeats[currentActivityId.value] = newSeats;
  newSeats.forEach((s, idx) => { s.label = getSeatLabel(Math.floor(idx / layout.cols), idx % layout.cols); });
  updateUnassignedList();
};

const removeColLeft = () => {
  if (cols.value <= 1) return;
  if (hasGuestsInFirstCol() && !confirm('最左欄有來賓，確定要刪除嗎？來賓將被移回未分配名單。')) return;
  const seats = activitySeats[currentActivityId.value];
  if (!seats) return;
  const newSeats: Seat[] = [];
  for (let r = 0; r < rows.value; r++) {
    for (let c = 1; c < cols.value; c++) {
      newSeats.push(seats[r * cols.value + c]);
    }
  }
  layout.cols--;
  activitySeats[currentActivityId.value] = newSeats;
  newSeats.forEach((s, idx) => { s.label = getSeatLabel(Math.floor(idx / layout.cols), idx % layout.cols); });
  updateUnassignedList();
};

// ── 監控 ──
const openMonitor = () => {
  window.open(window.location.href.replace(/#.*$/, "") + "#/seat-monitor", "seat-monitor", "noopener");
};

// ── 儲存 ──
const savingSeats = ref(false);
const saveSeats = async () => {
  const eventId = eventsStore.currentEvent?.id;
  if (!eventId) return;
  savingSeats.value = true;
  try {
    await apiRequest(`/api/seats/layout/${eventId}/`, { method: "PATCH", body: JSON.stringify({ rows: layout.rows, cols: layout.cols }) });
    const seats = activitySeats[currentActivityId.value] || [];
    const assignments = seats.map((s: Seat, i: number) => s.attendee.length === 0 ? null : { seat_index: i, seat_label: s.label, participant_id: (s.attendee[0] as SeatAttendee).id }).filter(Boolean);
    // 收集座位狀態
    const seat_metas: Array<{ seat_index: number; status: string }> = [];
    const actId = currentActivityId.value;
    for (const key of Object.keys(seatsStore.seatMetasMap)) {
      if (key.startsWith(actId + '_')) {
        const idx = parseInt(key.replace(actId + '_', ''));
        seat_metas.push({ seat_index: idx, status: seatsStore.seatMetasMap[key] });
      }
    }
    await apiRequest(`/api/seats/assignments/${eventId}/bulk/`, { method: "POST", body: JSON.stringify({ assignments, seat_metas }) });
    toastSuccess("座位分配已儲存");
  } catch { toastError("儲存失敗"); }
  finally { savingSeats.value = false; }
};

// ── 初始化 ──
watch(() => eventsStore.currentEvent?.id, (id) => {
  currentActivityId.value = getActivityKey(id);
  seatsStore.ensureActivity(currentActivityId.value);
  updateUnassignedList();
});

const initialized = ref(false);
const pageLoading = ref(true);

onMounted(async () => {
  const event = eventsStore.currentEvent;
  seatsStore.ensureActivity(currentActivityId.value);
  if (event?.id) {
    await seatsStore.loadFromBackend(event.id);
    await participantsStore.fetchParticipants({ event: String(event.id) });
  }
  updateUnassignedList();
  initialized.value = true;
  pageLoading.value = false;
});

// participants 載入完成後重算一次（只在初始化階段）
watch(() => participantsStore.participants.length, () => {
  if (initialized.value) return; // 初始化完成後不再自動重算
  updateUnassignedList();
});
</script>

<template>
  <div class="sp" :class="{ 'sp-loading': pageLoading }">
    <PageLoader v-if="pageLoading" text="載入座位配置..." />

    <template v-else>
    <!-- 左側標籤 + 面板 -->
    <div class="sp-side">
      <!-- 標籤（收合時顯示） -->
      <button v-if="!panelOpen" class="sp-side-tab" @click="panelOpen = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span class="side-tab-text">來賓名單</span>
        <span class="side-tab-count">{{ vipList.length + generalList.length }}</span>
      </button>

      <!-- 面板（展開時顯示） -->
      <aside v-if="panelOpen" class="sp-left">
      <div class="sp-left-header">
        <span class="sp-left-title">來賓名單</span>
        <button class="sp-left-close" @click="panelOpen = false">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- 標籤頁 -->
      <div class="sp-tabs">
        <button class="sp-tab" :class="{ active: activeTab === 'VIP' }" @click="activeTab = 'VIP'">VIP ({{ vipList.length }})</button>
        <button class="sp-tab" :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">民眾 ({{ generalList.length }})</button>
      </div>

      <label class="sp-toggle">
        <span>僅顯示未分配</span>
        <input type="checkbox" v-model="onlyUnassigned" />
        <i></i>
      </label>
      <div class="sp-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchQuery" placeholder="搜尋..." />
      </div>

      <div class="sp-group">
        <div v-for="p in (activeTab === 'VIP' ? vipList : generalList)" :key="p.id" class="sp-person" draggable="true" @dragstart="onDragStartPerson(p, $event)" @dragend="onDragEnd">
          <div class="sp-person-l"><b>{{ p.name }}</b><small>{{ p.company }}</small></div>
          <div class="sp-person-r"><code>#{{ p.serial }}</code><span class="sp-badge">未分配</span></div>
        </div>
        <div v-if="(activeTab === 'VIP' ? vipList : generalList).length === 0" class="sp-empty">無資料</div>
      </div>
    </aside>
    </div>

    <!-- 主區域 -->
    <main class="sp-main">
      <!-- 工具列（桌機） -->
      <div class="sp-toolbar sp-toolbar-desktop">
        <div class="sp-grid-btns">
          <button class="sp-tb sm" @click="addRowTop" title="上方新增一列">↑+</button>
          <button class="sp-tb sm" @click="addRowBottom" title="下方新增一列">↓+</button>
          <button class="sp-tb sm" @click="addColLeft" title="左側新增一欄">←+</button>
          <button class="sp-tb sm" @click="addColRight" title="右側新增一欄">→+</button>
          <span class="sp-tb-divider"></span>
          <button class="sp-tb sm del" @click="removeRowTop" title="刪除第一列">↑−</button>
          <button class="sp-tb sm del" @click="removeRowBottom" title="刪除最後一列">↓−</button>
          <button class="sp-tb sm del" @click="removeColLeft" title="刪除最左欄">←−</button>
          <button class="sp-tb sm del" @click="removeColRight" title="刪除最右欄">→−</button>
        </div>
        <span class="sp-tb-divider"></span>
        <span class="sp-grid-info">{{ rows }} × {{ cols }}</span>
        <button class="sp-tb" @click="openMonitor">即時監控</button>
        <div style="flex:1"></div>
        <button class="sp-tb save" :disabled="savingSeats" @click="saveSeats">{{ savingSeats ? '儲存中...' : '儲存座位' }}</button>
      </div>

      <!-- 工具列（手機） -->
      <div class="sp-toolbar sp-toolbar-mobile">
        <span class="sp-grid-info">{{ rows }} × {{ cols }}</span>
        <button class="sp-tb sm" @click="mobileToolsOpen = !mobileToolsOpen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
        <div style="flex:1"></div>
        <button class="sp-tb save" :disabled="savingSeats" @click="saveSeats">{{ savingSeats ? '儲存中...' : '儲存' }}</button>
      </div>

      <!-- 手機展開工具面板 -->
      <Transition name="tb-slide-down">
        <div v-if="mobileToolsOpen" class="sp-mobile-tools">
          <div class="sp-mt-section">
            <span class="sp-mt-label">增加</span>
            <div class="sp-mt-btns">
              <button @click="addRowTop">↑ 列</button>
              <button @click="addRowBottom">↓ 列</button>
              <button @click="addColLeft">← 欄</button>
              <button @click="addColRight">→ 欄</button>
            </div>
          </div>
          <div class="sp-mt-section">
            <span class="sp-mt-label">刪除</span>
            <div class="sp-mt-btns">
              <button class="del" @click="removeRowTop">↑ 列</button>
              <button class="del" @click="removeRowBottom">↓ 列</button>
              <button class="del" @click="removeColLeft">← 欄</button>
              <button class="del" @click="removeColRight">→ 欄</button>
            </div>
          </div>
          <button class="sp-mt-link" @click="openMonitor">即時監控</button>
        </div>
      </Transition>

      <!-- 舞台+座位 -->
      <div class="sp-stage-wrap" :style="{ '--z': zoom / 100 }">
        <div class="sp-stage-lbl">舞台</div>
        <div class="sp-stage-bar"></div>

        <div class="sp-grid">
          <!-- 欄標頭 -->
          <div class="sp-grid-head" :style="{ gridTemplateColumns: `calc(var(--hdr-w) * var(--z)) repeat(${cols}, calc(var(--seat-base) * var(--z)))` }">
            <div></div>
            <div v-for="h in colHeaders" :key="h" class="sp-hdr" @click="selectCol(colHeaders.indexOf(h))">{{ h }}</div>
          </div>
          <!-- 行 -->
          <div v-for="r in rows" :key="r" class="sp-grid-row" :style="{ gridTemplateColumns: `calc(var(--hdr-w) * var(--z)) repeat(${cols}, calc(var(--seat-base) * var(--z)))` }">
            <div class="sp-hdr row-hdr" @click="selectRow(r - 1)">{{ r }}</div>
            <div
              v-for="c in cols" :key="c"
              class="sp-seat"
              :class="{
                sel: isSeatSelected(r-1, c-1),
                filled: getSeatStatus(r-1, c-1) === 'assigned',
                'vip-seat': getSeatStatus(r-1, c-1) === 'assigned' && (getSeat(r-1, c-1)?.attendee[0] as any)?.type === 'VIP',
                aisle: getSeatStatus(r-1, c-1) === 'aisle',
                reserved: getSeatStatus(r-1, c-1) === 'reserved',
                'drag-over': dragOverIdx === getIdx(r-1, c-1),
              }"
              @click="toggleSeatSelect(r-1, c-1)"
              @dragover="onDragOver(r-1, c-1, $event)"
              @dragleave="onDragLeave"
              @drop="onDrop(r-1, c-1)"
            >
              <!-- 走道 -->
              <template v-if="getSeatStatus(r-1,c-1)==='aisle'"></template>
              <!-- 有人 -->
              <template v-else-if="getSeatStatus(r-1,c-1)==='assigned'">
                <div
                  class="sp-avatar"
                  :class="{ vip: (getSeat(r-1,c-1)?.attendee[0] as any)?.type === 'VIP' }"
                  draggable="true"
                  @dragstart.stop="onDragStartSeat(r-1,c-1,$event)"
                  @dragend="onDragEnd"
                >
                  {{ (getSeat(r-1,c-1)?.attendee[0] as any)?.name?.charAt(0) || '?' }}
                </div>
                <span class="sp-seat-name">{{ (getSeat(r-1,c-1)?.attendee[0] as any)?.name || '' }}</span>
                <button class="sp-x" @click.stop="removePerson(r-1,c-1)">×</button>
              </template>
              <!-- 空位 -->
              <template v-else>
                <span class="sp-seat-lbl">{{ getSeatLabel(r-1, c-1) }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 選取工具列 -->
      <Transition name="tb-slide">
        <div v-if="selectedSeats.size > 0" class="sp-sel-bar">
          <span class="sp-sel-count">已選取 {{ selectedSeats.size }} 個座位</span>
          <button @click="setSelectedAs('empty')"><i class="dot dot-e"></i>恢復為空位</button>
          <button @click="setSelectedAs('aisle')"><i class="dot dot-a"></i>設定為走道</button>
          <button @click="setSelectedAs('reserved')"><i class="dot dot-r"></i>設定為保留座</button>
          <button class="cancel" @click="clearSelection">取消選取</button>
        </div>
      </Transition>

      <!-- 縮放（桌機） -->
      <div class="sp-zoom">
        <button @click="zoomIn">+</button>
        <span>{{ zoom }}%</span>
        <button @click="zoomOut">−</button>
      </div>
    </main>

    <!-- 手機底部導覽列 -->
    <div class="sp-mobile-nav">
      <button @click="panelOpen = !panelOpen" :class="{ active: panelOpen }">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>名單</span>
      </button>
      <button @click="zoomOut">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        <span>縮小</span>
      </button>
      <span class="sp-mobile-zoom">{{ zoom }}%</span>
      <button @click="zoomIn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        <span>放大</span>
      </button>
      <button :disabled="savingSeats" @click="saveSeats" class="save-nav">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        <span>{{ savingSeats ? '...' : '儲存' }}</span>
      </button>
    </div>

    <!-- 手機面板遮罩 -->
    <div v-if="panelOpen" class="sp-mobile-overlay" @click="panelOpen = false"></div>
    </template>
  </div>
</template>

<style scoped>
.sp { display:flex; height:100%; min-height:calc(100vh - 64px); background:var(--bg-primary); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.sp.sp-loading { align-items:center; justify-content:center; }

/* ── 左側標籤 + 面板容器 ── */
.sp-side {
  display:flex; flex-shrink:0; height:100%;
}

/* 側邊標籤（垂直文字） */
.sp-side-tab {
  width:36px; height:auto; align-self:flex-start; margin-top:16px;
  background:var(--bg-card); border:1px solid var(--border-color); border-left:none;
  border-radius:0 10px 10px 0;
  display:flex; flex-direction:column; align-items:center; gap:8px;
  padding:12px 0; cursor:pointer; color:var(--text-muted);
  box-shadow:2px 2px 8px rgba(0,0,0,.06);
  transition:all .2s;
}
.sp-side-tab:hover { color:var(--accent); background:var(--bg-hover); }
.side-tab-text {
  writing-mode:vertical-rl; text-orientation:mixed;
  font-size:.75rem; font-weight:600; letter-spacing:1px;
}
.side-tab-count {
  font-size:.65rem; font-weight:700; color:var(--accent);
  background:var(--accent-light); border-radius:6px; padding:2px 4px;
}

/* ── 左側面板 ── */
.sp-left {
  width:220px; background:var(--bg-card);
  border-right:1px solid var(--border-color);
  overflow-y:auto; padding:10px; flex-shrink:0;
}

.sp-left-header {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:12px; padding-bottom:10px;
  border-bottom:1px solid var(--border-color);
}
.sp-left-title { font-size:1rem; font-weight:700; color:var(--text-main); }
.sp-left-close {
  background:none; border:none; cursor:pointer; color:var(--text-muted);
  padding:4px; border-radius:6px; display:flex; transition:.15s;
}
.sp-left-close:hover { background:var(--bg-hover); color:var(--text-main); }
.sp-toggle { display:flex; align-items:center; justify-content:space-between; cursor:pointer; margin-bottom:10px; font-size:.86rem; font-weight:600; color:var(--text-secondary); }
.sp-toggle input { display:none; }
.sp-toggle i { width:38px; height:20px; background:#cbd5e1; border-radius:10px; position:relative; transition:.2s; display:block; }
.sp-toggle i::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; background:var(--bg-card); border-radius:50%; transition:.2s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
.sp-toggle input:checked+i { background:#6366f1; }
.sp-toggle input:checked+i::after { transform:translateX(18px); }
.sp-search { display:flex; align-items:center; gap:6px; background:var(--bg-primary); border:1px solid var(--border-color); border-radius:8px; padding:7px 10px; margin-bottom:14px; }
.sp-search input { border:none; background:transparent; outline:none; font-size:.84rem; color:var(--text-main); width:100%; }
/* ── 標籤頁 ── */
.sp-tabs { display:flex; gap:0; margin-bottom:10px; border-radius:8px; overflow:hidden; border:1px solid var(--border-color); }
.sp-tab { flex:1; padding:6px 0; border:none; background:var(--bg-primary); cursor:pointer; font-size:.76rem; font-weight:600; color:var(--text-muted); transition:.15s; }
.sp-tab:first-child { border-right:1px solid var(--border-color); }
.sp-tab.active { background:#6366f1; color:#fff; }
.sp-tab:not(.active):hover { background:var(--bg-hover); }

.sp-group { margin-bottom:12px; }
.sp-empty { font-size:.78rem; color:var(--text-muted); text-align:center; padding:20px 0; }
.sp-person { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border:1px solid var(--border-color); border-radius:10px; margin-bottom:5px; cursor:grab; transition:.15s; background:var(--bg-card); }
.sp-person:hover { border-color:#c7d2fe; box-shadow:0 2px 6px rgba(99,102,241,.1); }
.sp-person:active { cursor:grabbing; opacity:.7; }
.sp-person-l b { display:block; font-size:.86rem; color:var(--text-main); }
.sp-person-l small { font-size:.72rem; color:var(--text-muted); }
.sp-person-r { text-align:right; }
.sp-person-r code { font-size:.72rem; color:var(--text-muted); display:block; }
.sp-badge { font-size:.62rem; font-weight:700; padding:2px 7px; border-radius:5px; background:#dbeafe; color:#1e40af; }

/* ── 主區域 ── */
.sp-main { flex:1; display:flex; flex-direction:column; position:relative; overflow:auto; padding:14px; }
.sp-toolbar { display:flex; align-items:center; gap:6px; margin-bottom:12px; background:var(--bg-card); padding:6px 10px; border-radius:10px; border:1px solid var(--border-color); }
.sp-tb { padding:7px 12px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:.82rem; font-weight:500; color:var(--text-muted); transition:.15s; }
.sp-tb:hover { background:var(--bg-hover); color:var(--text-secondary); }
.sp-tb.sm { padding:5px 8px; font-size:.75rem; font-weight:700; min-width:32px; text-align:center; }
.sp-tb.del { color:var(--danger, #ef4444); }
.sp-tb.del:hover { background:rgba(239,68,68,.08); color:#dc2626; }
.sp-tb.save { background:#6366f1; color:#fff; font-weight:600; }
.sp-tb.save:hover { background:#4f46e5; }
.sp-tb.save:disabled { opacity:.5; cursor:not-allowed; }
.sp-grid-btns { display:flex; align-items:center; gap:2px; }
.sp-tb-divider { width:1px; height:20px; background:var(--border-color); margin:0 6px; flex-shrink:0; }
.sp-grid-info { font-size:.78rem; font-weight:600; color:var(--text-muted); padding:0 4px; }

.sp { --seat-base:72px; --hdr-w:36px; --z:1; }
.sp-stage-wrap { flex:1; display:flex; flex-direction:column; align-items:center; }
.sp-stage-lbl { font-size:.82rem; font-weight:700; color:var(--text-muted); letter-spacing:2px; margin-bottom:6px; }
.sp-stage-bar { width:min(480px,55%); height:10px; background:linear-gradient(135deg,#334155,#1e293b); border-radius:5px; margin-bottom:20px; }

/* ── 座位表 ── */
.sp-grid { display:flex; flex-direction:column; gap:calc(4px * var(--z)); }
.sp-grid-head,.sp-grid-row { display:grid; gap:calc(6px * var(--z)); }
.sp-hdr { display:flex; align-items:center; justify-content:center; font-size:.72rem; font-weight:700; color:var(--text-muted); cursor:pointer; user-select:none; border-radius:6px; transition:.15s; }
.sp-hdr:hover { background:#eef2ff; color:#6366f1; }
.row-hdr { width:calc(var(--hdr-w) * var(--z)); }

/* 座位圓形 */
.sp-seat {
  width:calc(var(--seat-base) * var(--z)); height:calc(var(--seat-base) * var(--z));
  border:2px solid var(--border-color);
  border-radius:50%;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  cursor:pointer; transition:all .15s; position:relative; background:var(--bg-card);
  gap:1px;
}
.sp-seat:hover { border-color:#c7d2fe; box-shadow:0 2px 8px rgba(99,102,241,.12); }
.sp-seat.sel { border-color: var(--accent); box-shadow:0 0 0 3px rgba(99,102,241,.2); }
.sp-seat.filled { background:#f5f3ff; border-color:#c7d2fe; }
.sp-seat.filled.vip-seat { background:#fffbeb; border-color:#fde68a; }
.sp-seat.aisle { background:transparent; border:2px dashed #d1d5db; cursor:default; border-radius:8px; }
.sp-seat.aisle:hover { box-shadow:none; border-color:#d1d5db; }
.sp-seat.reserved { background:#fef2f2; border-color:#fca5a5; }
.sp-seat.drag-over { border-color: var(--accent); background:#eef2ff; box-shadow:0 0 0 4px rgba(99,102,241,.25); transform:scale(1.05); }

.sp-seat-lbl { font-size:.78rem; font-weight:600; color:var(--text-muted); }

/* 已分配：頭像 */
.sp-avatar {
  width:32px; height:32px; border-radius:50%;
  background:linear-gradient(135deg,#6366f1,#4f46e5);
  color:#fff; font-size:.82rem; font-weight:700;
  display:flex; align-items:center; justify-content:center;
  cursor:grab; transition:.15s;
}
.sp-avatar.vip { background:linear-gradient(135deg,#f59e0b,#d97706); }
.sp-avatar:active { cursor:grabbing; opacity:.6; transform:scale(.9); }
.sp-seat-name { font-size:.62rem; font-weight:600; color:var(--text-secondary); max-width:56px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.1; }
.sp-x { position:absolute; top:-4px; right:-4px; width:16px; height:16px; border-radius:50%; background:#ef4444; color:#fff; border:2px solid #fff; font-size:.6rem; cursor:pointer; display:none; align-items:center; justify-content:center; line-height:1; }
.sp-seat:hover .sp-x { display:flex; }

/* ── 選取工具列 ── */
.sp-sel-bar { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:10px; background:var(--bg-card); padding:10px 18px; border-radius:14px; box-shadow:0 8px 28px rgba(0,0,0,.12); border:1px solid var(--border-color); z-index:50; }
.sp-sel-count { font-size:.84rem; font-weight:700; color:var(--text-main); padding-right:8px; border-right:1px solid var(--border-color); white-space:nowrap; }
.sp-sel-bar button { display:flex; align-items:center; gap:5px; padding:7px 12px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:.8rem; font-weight:600; color: var(--text-secondary); transition:.15s; white-space:nowrap; }
.sp-sel-bar button:hover { background:var(--bg-hover); }
.sp-sel-bar button.cancel { color:#ef4444; }
.sp-sel-bar button.cancel:hover { background:#fef2f2; }
.dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
.dot-e { background:#e2e8f0; border:1px solid #cbd5e1; }
.dot-a { background:#ef4444; }
.dot-r { background:#f59e0b; }
.tb-slide-enter-active,.tb-slide-leave-active { transition:all .3s ease; }
.tb-slide-enter-from,.tb-slide-leave-to { opacity:0; transform:translateX(-50%) translateY(16px); }

/* ── 縮放 ── */
.sp-zoom { position:fixed; right:28px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; align-items:center; gap:2px; background:var(--bg-card); padding:6px; border-radius:10px; border:1px solid var(--border-color); box-shadow:0 2px 6px rgba(0,0,0,.06); z-index:20; }
.sp-zoom button { width:30px; height:30px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:1rem; font-weight:700; color: var(--text-secondary); transition:.15s; }
.sp-zoom button:hover { background:var(--bg-hover); }
.sp-zoom span { font-size:.68rem; font-weight:600; color:var(--text-muted); }

/* ── 手機工具面板 ── */
.sp-toolbar-mobile { display:none; }
.sp-mobile-tools { display:none; }
.sp-mobile-nav { display:none; }
.sp-mobile-overlay { display:none; }

.tb-slide-down-enter-active,.tb-slide-down-leave-active { transition:all .2s ease; }
.tb-slide-down-enter-from,.tb-slide-down-leave-to { opacity:0; max-height:0; margin-top:0; }

/* ── RWD ── */
@media(max-width:768px) {
  .sp { flex-direction:column; padding-bottom:60px; }

  /* 隱藏桌機元素 */
  .sp-toolbar-desktop { display:none; }
  .sp-zoom { display:none; }
  .sp-side { height:auto; }
  .sp-side-tab { display:none; }

  /* 手機工具列 */
  .sp-toolbar-mobile {
    display:flex; align-items:center; gap:6px;
    background:var(--bg-card); padding:6px 10px; border-radius:10px;
    border:1px solid var(--border-color); margin-bottom:8px;
  }

  /* 手機展開工具面板 */
  .sp-mobile-tools {
    display:flex; flex-direction:column; gap:8px;
    background:var(--bg-card); padding:10px 12px; border-radius:10px;
    border:1px solid var(--border-color); margin-bottom:8px; overflow:hidden;
  }
  .sp-mt-section { display:flex; align-items:center; gap:6px; }
  .sp-mt-label { font-size:.72rem; font-weight:700; color:var(--text-muted); min-width:28px; }
  .sp-mt-btns { display:flex; gap:4px; flex-wrap:wrap; }
  .sp-mt-btns button {
    padding:5px 10px; border:1px solid var(--border-color); background:var(--bg-primary);
    border-radius:6px; font-size:.74rem; font-weight:600; color:var(--text-secondary);
    cursor:pointer; transition:.15s;
  }
  .sp-mt-btns button:active { background:var(--bg-hover); }
  .sp-mt-btns button.del { color:#ef4444; border-color:#fecaca; }
  .sp-mt-btns button.del:active { background:#fef2f2; }
  .sp-mt-link {
    padding:6px; border:none; background:transparent; color:#6366f1;
    font-size:.8rem; font-weight:600; cursor:pointer; text-align:left;
  }

  /* 手機底部導覽 */
  .sp-mobile-nav {
    display:flex; position:fixed; bottom:0; left:0; right:0; z-index:60;
    background:var(--bg-card); border-top:1px solid var(--border-color);
    padding:4px 8px calc(4px + env(safe-area-inset-bottom, 0px));
    align-items:center; justify-content:space-around;
    box-shadow:0 -2px 10px rgba(0,0,0,.06);
  }
  .sp-mobile-nav button {
    display:flex; flex-direction:column; align-items:center; gap:1px;
    border:none; background:transparent; color:var(--text-muted);
    font-size:.62rem; font-weight:600; padding:4px 8px; border-radius:8px;
    cursor:pointer; transition:.15s;
  }
  .sp-mobile-nav button:active { background:var(--bg-hover); }
  .sp-mobile-nav button.active { color:#6366f1; }
  .sp-mobile-nav button.save-nav { color:#6366f1; }
  .sp-mobile-nav button:disabled { opacity:.4; }
  .sp-mobile-zoom { font-size:.68rem; font-weight:700; color:var(--text-muted); }

  /* 手機面板遮罩 */
  .sp-mobile-overlay {
    display:block; position:fixed; inset:0; z-index:29;
    background:rgba(0,0,0,.3); backdrop-filter:blur(2px);
  }

  /* 手機側邊面板 */
  .sp-left {
    position:fixed; left:0; top:0; bottom:0; z-index:30;
    width:280px; max-width:80vw;
    box-shadow:4px 0 20px rgba(0,0,0,.12);
    padding-bottom:calc(60px + env(safe-area-inset-bottom, 0px));
  }

  /* 座位縮小 */
  .sp { --seat-base:52px; --hdr-w:24px; }
  .row-hdr { font-size:.64rem; }
  .sp-hdr { font-size:.62rem; }
  .sp-avatar { width:24px; height:24px; font-size:.68rem; }
  .sp-seat-name { font-size:.52rem; max-width:40px; }
  .sp-seat-lbl { font-size:.64rem; }
  .sp-x { width:14px; height:14px; font-size:.5rem; top:-3px; right:-3px; }
  .sp-stage-bar { height:6px; margin-bottom:12px; }
  .sp-stage-lbl { font-size:.72rem; margin-bottom:4px; }
  .sp-main { padding:8px; }

  /* 選取工具列 */
  .sp-sel-bar {
    left:8px; right:8px; bottom:68px; transform:none;
    flex-wrap:wrap; justify-content:center; gap:6px;
    padding:8px 12px; border-radius:12px;
  }
  .sp-sel-count { font-size:.76rem; padding-right:6px; }
  .sp-sel-bar button { padding:5px 8px; font-size:.72rem; }
}
</style>
