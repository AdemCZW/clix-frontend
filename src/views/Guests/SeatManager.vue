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
  const status = getSeatStatus(r, c);
  if (status === "aisle") return;
  if (selectedSeats.value.has(idx)) selectedSeats.value.delete(idx);
  else selectedSeats.value.add(idx);
  selectedSeats.value = new Set(selectedSeats.value);
};

const clearSelection = () => { selectedSeats.value = new Set(); };

// 整排選取
const selectRow = (r: number) => {
  for (let c = 0; c < cols.value; c++) {
    const idx = getIdx(r, c);
    if (getSeatStatus(r, c) !== "aisle") selectedSeats.value.add(idx);
  }
  selectedSeats.value = new Set(selectedSeats.value);
};

// 整列選取
const selectCol = (c: number) => {
  for (let r = 0; r < rows.value; r++) {
    const idx = getIdx(r, c);
    if (getSeatStatus(r, c) !== "aisle") selectedSeats.value.add(idx);
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
const addRow = () => seatsStore.addRow(currentActivityId.value);
const addCol = () => seatsStore.addCol(currentActivityId.value);

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
    <!-- 左側 -->
    <aside class="sp-left">
      <label class="sp-toggle">
        <span>僅顯示未分配</span>
        <input type="checkbox" v-model="onlyUnassigned" />
        <i></i>
      </label>
      <div class="sp-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchQuery" placeholder="搜尋..." />
      </div>

      <div class="sp-group" v-if="vipList.length">
        <div class="sp-group-title vip">VIP ({{ vipList.length }})</div>
        <div v-for="p in vipList" :key="p.id" class="sp-person" draggable="true" @dragstart="onDragStartPerson(p, $event)" @dragend="onDragEnd">
          <div class="sp-person-l"><b>{{ p.name }}</b><small>{{ p.company }}</small></div>
          <div class="sp-person-r"><code>#{{ p.serial }}</code><span class="sp-badge">未分配</span></div>
        </div>
      </div>

      <div class="sp-group" v-if="generalList.length">
        <div class="sp-group-title gen">參加者 ({{ generalList.length }})</div>
        <div v-for="p in generalList" :key="p.id" class="sp-person" draggable="true" @dragstart="onDragStartPerson(p, $event)" @dragend="onDragEnd">
          <div class="sp-person-l"><b>{{ p.name }}</b><small>{{ p.company }}</small></div>
          <div class="sp-person-r"><code>#{{ p.serial }}</code><span class="sp-badge">未分配</span></div>
        </div>
      </div>
    </aside>

    <!-- 主區域 -->
    <main class="sp-main">
      <!-- 工具列 -->
      <div class="sp-toolbar">
        <button class="sp-tb" @click="addCol" title="新增欄">+ 欄</button>
        <button class="sp-tb" @click="addRow" title="新增列">+ 列</button>
        <button class="sp-tb" @click="openMonitor">即時監控</button>
        <div style="flex:1"></div>
        <button class="sp-tb save" :disabled="savingSeats" @click="saveSeats">{{ savingSeats ? '儲存中...' : '儲存座位' }}</button>
      </div>

      <!-- 舞台+座位 -->
      <div class="sp-stage-wrap" :style="{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }">
        <div class="sp-stage-lbl">舞台</div>
        <div class="sp-stage-bar"></div>

        <div class="sp-grid">
          <!-- 欄標頭 -->
          <div class="sp-grid-head" :style="{ gridTemplateColumns: `36px repeat(${cols}, 72px)` }">
            <div></div>
            <div v-for="h in colHeaders" :key="h" class="sp-hdr" @click="selectCol(colHeaders.indexOf(h))">{{ h }}</div>
          </div>
          <!-- 行 -->
          <div v-for="r in rows" :key="r" class="sp-grid-row" :style="{ gridTemplateColumns: `36px repeat(${cols}, 72px)` }">
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

      <!-- 縮放 -->
      <div class="sp-zoom">
        <button @click="zoomIn">+</button>
        <span>{{ zoom }}%</span>
        <button @click="zoomOut">−</button>
      </div>
    </main>
    </template>
  </div>
</template>

<style scoped>
.sp { display:flex; height:100%; min-height:calc(100vh - 64px); background:#f8f9fb; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.sp.sp-loading { align-items:center; justify-content:center; }

/* ── 左側 ── */
.sp-left { width:272px; background:#fff; border-right:1px solid #e5e7eb; overflow-y:auto; flex-shrink:0; padding:14px; }
.sp-toggle { display:flex; align-items:center; justify-content:space-between; cursor:pointer; margin-bottom:10px; font-size:.86rem; font-weight:600; color:#334155; }
.sp-toggle input { display:none; }
.sp-toggle i { width:38px; height:20px; background:#cbd5e1; border-radius:10px; position:relative; transition:.2s; display:block; }
.sp-toggle i::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; background:#fff; border-radius:50%; transition:.2s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
.sp-toggle input:checked+i { background:#6366f1; }
.sp-toggle input:checked+i::after { transform:translateX(18px); }
.sp-search { display:flex; align-items:center; gap:6px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px; margin-bottom:14px; }
.sp-search input { border:none; background:transparent; outline:none; font-size:.84rem; color:#1e293b; width:100%; }
.sp-group { margin-bottom:12px; }
.sp-group-title { font-size:.74rem; font-weight:700; letter-spacing:.5px; padding:2px 0 6px; }
.sp-group-title.vip { color:#6366f1; }
.sp-group-title.gen { color:#f59e0b; }
.sp-person { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:5px; cursor:grab; transition:.15s; background:#fff; }
.sp-person:hover { border-color:#c7d2fe; box-shadow:0 2px 6px rgba(99,102,241,.1); }
.sp-person:active { cursor:grabbing; opacity:.7; }
.sp-person-l b { display:block; font-size:.86rem; color:#1e293b; }
.sp-person-l small { font-size:.72rem; color:#94a3b8; }
.sp-person-r { text-align:right; }
.sp-person-r code { font-size:.72rem; color:#64748b; display:block; }
.sp-badge { font-size:.62rem; font-weight:700; padding:2px 7px; border-radius:5px; background:#dbeafe; color:#1e40af; }

/* ── 主區域 ── */
.sp-main { flex:1; display:flex; flex-direction:column; position:relative; overflow:auto; padding:14px; }
.sp-toolbar { display:flex; align-items:center; gap:6px; margin-bottom:12px; background:#fff; padding:6px 10px; border-radius:10px; border:1px solid #e5e7eb; }
.sp-tb { padding:7px 12px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:.82rem; font-weight:500; color:#64748b; transition:.15s; }
.sp-tb:hover { background:#f1f5f9; color:#334155; }
.sp-tb.save { background:#6366f1; color:#fff; font-weight:600; }
.sp-tb.save:hover { background:#4f46e5; }
.sp-tb.save:disabled { opacity:.5; cursor:not-allowed; }

.sp-stage-wrap { flex:1; display:flex; flex-direction:column; align-items:center; transition:transform .2s; }
.sp-stage-lbl { font-size:.82rem; font-weight:700; color:#94a3b8; letter-spacing:2px; margin-bottom:6px; }
.sp-stage-bar { width:min(480px,55%); height:10px; background:linear-gradient(135deg,#334155,#1e293b); border-radius:5px; margin-bottom:20px; }

/* ── 座位表 ── */
.sp-grid { display:flex; flex-direction:column; gap:4px; }
.sp-grid-head,.sp-grid-row { display:grid; gap:6px; }
.sp-hdr { display:flex; align-items:center; justify-content:center; font-size:.72rem; font-weight:700; color:#94a3b8; cursor:pointer; user-select:none; border-radius:6px; transition:.15s; }
.sp-hdr:hover { background:#eef2ff; color:#6366f1; }
.row-hdr { width:36px; }

/* 座位圓形 */
.sp-seat {
  width:72px; height:72px;
  border:2px solid #e2e8f0;
  border-radius:50%;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  cursor:pointer; transition:all .15s; position:relative; background:#fff;
  gap:1px;
}
.sp-seat:hover { border-color:#c7d2fe; box-shadow:0 2px 8px rgba(99,102,241,.12); }
.sp-seat.sel { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.2); }
.sp-seat.filled { background:#f5f3ff; border-color:#c7d2fe; }
.sp-seat.filled.vip-seat { background:#fffbeb; border-color:#fde68a; }
.sp-seat.aisle { background:transparent; border:2px dashed #d1d5db; cursor:default; border-radius:8px; }
.sp-seat.aisle:hover { box-shadow:none; border-color:#d1d5db; }
.sp-seat.reserved { background:#fef2f2; border-color:#fca5a5; }
.sp-seat.drag-over { border-color:#6366f1; background:#eef2ff; box-shadow:0 0 0 4px rgba(99,102,241,.25); transform:scale(1.05); }

.sp-seat-lbl { font-size:.78rem; font-weight:600; color:#94a3b8; }

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
.sp-seat-name { font-size:.62rem; font-weight:600; color:#334155; max-width:56px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.1; }
.sp-x { position:absolute; top:-4px; right:-4px; width:16px; height:16px; border-radius:50%; background:#ef4444; color:#fff; border:2px solid #fff; font-size:.6rem; cursor:pointer; display:none; align-items:center; justify-content:center; line-height:1; }
.sp-seat:hover .sp-x { display:flex; }

/* ── 選取工具列 ── */
.sp-sel-bar { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:10px; background:#fff; padding:10px 18px; border-radius:14px; box-shadow:0 8px 28px rgba(0,0,0,.12); border:1px solid #e5e7eb; z-index:50; }
.sp-sel-count { font-size:.84rem; font-weight:700; color:#1e293b; padding-right:8px; border-right:1px solid #e5e7eb; white-space:nowrap; }
.sp-sel-bar button { display:flex; align-items:center; gap:5px; padding:7px 12px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:.8rem; font-weight:600; color:#475569; transition:.15s; white-space:nowrap; }
.sp-sel-bar button:hover { background:#f1f5f9; }
.sp-sel-bar button.cancel { color:#ef4444; }
.sp-sel-bar button.cancel:hover { background:#fef2f2; }
.dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
.dot-e { background:#e2e8f0; border:1px solid #cbd5e1; }
.dot-a { background:#ef4444; }
.dot-r { background:#f59e0b; }
.tb-slide-enter-active,.tb-slide-leave-active { transition:all .3s ease; }
.tb-slide-enter-from,.tb-slide-leave-to { opacity:0; transform:translateX(-50%) translateY(16px); }

/* ── 縮放 ── */
.sp-zoom { position:fixed; right:28px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; align-items:center; gap:2px; background:#fff; padding:6px; border-radius:10px; border:1px solid #e5e7eb; box-shadow:0 2px 6px rgba(0,0,0,.06); z-index:20; }
.sp-zoom button { width:30px; height:30px; border:none; background:transparent; border-radius:7px; cursor:pointer; font-size:1rem; font-weight:700; color:#475569; transition:.15s; }
.sp-zoom button:hover { background:#f1f5f9; }
.sp-zoom span { font-size:.68rem; font-weight:600; color:#94a3b8; }

/* ── RWD ── */
@media(max-width:768px) {
  .sp { flex-direction:column; }
  .sp-left { width:100%; max-height:180px; border-right:none; border-bottom:1px solid #e5e7eb; overflow-x:auto; }
  .sp-zoom { display:none; }
  .sp-sel-bar { left:12px; right:12px; transform:none; flex-wrap:wrap; justify-content:center; }
}
</style>
