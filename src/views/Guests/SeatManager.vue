<script setup>
import { reactive, ref, computed, watch, onMounted } from "vue";
import draggable from "vuedraggable";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";

const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();

// 當前專案和活動資訊
const currentProject = computed(() => eventsStore.currentEvent?.name || "—");
const currentActivity = computed(() => eventsStore.currentEvent?.name || "—");
const currentActivityId = ref("act_01");

// 賓客名單（從 store 載入）
const allParticipants = computed(() =>
  participantsStore.participants.map((p, i) => ({
    id: p.id,
    serial: String(i + 1).padStart(3, "0"),
    name: p.name,
    company: p.company || "",
    type: p.type || "一般民眾",
  })),
);

// 設定初始行列數 (Row 為排，Col 為每排幾人)
const layout = reactive({ rows: 3, cols: 5 });

// 動態生成座位資料
const activitySeats = reactive({
  act_01: Array.from({ length: 15 }, (_, i) => ({
    id: `s-${i}`,
    label: `座-${i + 1}`,
    attendee: [],
  })),
});

// 新增座位邏輯
const addRow = () => {
  layout.rows++;
  const newCount = layout.rows * layout.cols;
  const currentSeats = activitySeats[currentActivityId.value];
  while (currentSeats.length < newCount) {
    const i = currentSeats.length;
    currentSeats.push({ id: `s-${Date.now()}-${i}`, label: `座-${i + 1}`, attendee: [] });
  }
};

const addCol = () => {
  layout.cols++;
  const newCount = layout.rows * layout.cols;
  const currentSeats = activitySeats[currentActivityId.value];
  while (currentSeats.length < newCount) {
    const i = currentSeats.length;
    currentSeats.push({ id: `s-${Date.now()}-${i}`, label: `座-${i + 1}`, attendee: [] });
  }
};

// 待分配名單連動
const unassignedList = ref([]);
const updateUnassignedList = () => {
  const currentSeats = activitySeats[currentActivityId.value];
  const seatedIds = currentSeats.filter((s) => s.attendee.length > 0).map((s) => s.attendee[0].id);
  unassignedList.value = allParticipants.value.filter((p) => !seatedIds.includes(p.id));
};

// 分離貴賓和一般民眾
const vipList = computed(() => unassignedList.value.filter((p) => p.type === "VIP"));
const attendeeList = computed(() =>
  unassignedList.value.filter((p) => p.type !== "VIP"),
);

// 切換顯示類型
const guestViewType = ref("VIP"); // 'VIP' 或 'Attendee'
const currentGuestList = computed(() => {
  return guestViewType.value === "VIP" ? vipList.value : attendeeList.value;
});

watch(currentActivityId, () => updateUnassignedList(), { immediate: true });
watch(allParticipants, () => updateUnassignedList());

onMounted(async () => {
  const event = eventsStore.currentEvent;
  if (event?.id) {
    await participantsStore.fetchParticipants({ event: event.id });
    updateUnassignedList();
  }
});

// 換位歷史紀錄
const swapHistory = ref([]);
const showHistory = ref(false);

const addToHistory = (record) => {
  const timestamp = new Date();
  swapHistory.value.unshift({
    id: Date.now(),
    timestamp,
    time: timestamp.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    ...record,
  });
  // 只保留最近50筆記錄
  if (swapHistory.value.length > 50) {
    swapHistory.value = swapHistory.value.slice(0, 50);
  }
};

// 取得人員類型（用於歷史記錄）
const getPersonType = (personName) => {
  const person = allParticipants.find((p) => p.name === personName);
  return person ? person.type : null;
};

// 從左側拖曳到座位的邏輯
const onSeatAdd = (evt, targetSeat) => {
  // 如果座位已有人，將原本的人放回待分配名單
  if (targetSeat.attendee.length > 1) {
    const oldPerson = targetSeat.attendee[0];
    targetSeat.attendee.splice(0, 1);
    unassignedList.value.push(oldPerson);

    // 記錄到歷史
    const newPerson = targetSeat.attendee[0];
    addToHistory({
      type: "assign",
      person: newPerson.name,
      personType: newPerson.type,
      seat: targetSeat.label,
      description: `${newPerson.name} 分配至 ${targetSeat.label}（${oldPerson.name} 移回待分配）`,
    });
  } else if (targetSeat.attendee.length === 1) {
    // 新分配
    const newPerson = targetSeat.attendee[0];
    addToHistory({
      type: "assign",
      person: newPerson.name,
      personType: newPerson.type,
      seat: targetSeat.label,
      description: `${newPerson.name} 分配至 ${targetSeat.label}`,
    });
  }
  updateUnassignedList();
};

// 點選換位邏輯（只用於座位之間的換位）
const selectedSeat = ref(null);

const selectSeat = (seat) => {
  // 如果點選同一個座位，取消選取
  if (selectedSeat.value === seat) {
    selectedSeat.value = null;
    return;
  }

  // 如果沒有已選座位，選取這個座位
  if (!selectedSeat.value) {
    // 只能選取有人的座位
    if (seat.attendee.length > 0) {
      selectedSeat.value = seat;
    }
    return;
  }

  // 如果已有選取的座位，執行換位
  const fromSeat = selectedSeat.value;
  const toSeat = seat;

  // 取得兩個座位的人員
  const fromPerson = fromSeat.attendee[0];
  const toPerson = toSeat.attendee.length > 0 ? toSeat.attendee[0] : null;

  // 互換
  fromSeat.attendee = toPerson ? [toPerson] : [];
  toSeat.attendee = [fromPerson];

  // 記錄到歷史
  if (toPerson) {
    addToHistory({
      type: "swap",
      person1: fromPerson.name,
      person2: toPerson.name,
      person1Type: fromPerson.type,
      person2Type: toPerson.type,
      seat1: fromSeat.label,
      seat2: toSeat.label,
      description: `${fromPerson.name}（${fromSeat.label}）⇄ ${toPerson.name}（${toSeat.label}）`,
    });
  } else {
    addToHistory({
      type: "move",
      person: fromPerson.name,
      personType: fromPerson.type,
      fromSeat: fromSeat.label,
      toSeat: toSeat.label,
      description: `${fromPerson.name} 從 ${fromSeat.label} 移至 ${toSeat.label}`,
    });
  }

  // 清除選取
  selectedSeat.value = null;
  updateUnassignedList();
};

const handleRemove = (seat) => {
  if (seat.attendee.length > 0) {
    const person = seat.attendee[0];
    seat.attendee.splice(0, 1);
    unassignedList.value.push(person);

    // 記錄到歷史
    addToHistory({
      type: "remove",
      person: person.name,
      personType: person.type,
      seat: seat.label,
      description: `${person.name} 從 ${seat.label} 移除`,
    });

    updateUnassignedList();
  }
  selectedSeat.value = null;
};

// 座位地圖拖曳平移功能
const mapContainer = ref(null);
const isDraggingMap = ref(false);
const mapStartPos = ref({ x: 0, y: 0 });
const mapScrollPos = ref({ left: 0, top: 0 });

const onMapMouseDown = (e) => {
  // 只在直接點擊地圖容器時啟動拖曳，不包括座位元素
  if (e.target.closest(".seat-item") || e.target.closest(".stage-banner")) {
    return;
  }
  isDraggingMap.value = true;
  mapStartPos.value = { x: e.clientX, y: e.clientY };
  mapScrollPos.value = {
    left: mapContainer.value.scrollLeft,
    top: mapContainer.value.scrollTop,
  };
  mapContainer.value.style.cursor = "grabbing";
};

const onMapMouseMove = (e) => {
  if (!isDraggingMap.value) return;
  e.preventDefault();
  const dx = e.clientX - mapStartPos.value.x;
  const dy = e.clientY - mapStartPos.value.y;
  mapContainer.value.scrollLeft = mapScrollPos.value.left - dx;
  mapContainer.value.scrollTop = mapScrollPos.value.top - dy;
};

const onMapMouseUp = () => {
  isDraggingMap.value = false;
  if (mapContainer.value) {
    mapContainer.value.style.cursor = "grab";
  }
};

const onMapMouseLeave = () => {
  if (isDraggingMap.value) {
    isDraggingMap.value = false;
    if (mapContainer.value) {
      mapContainer.value.style.cursor = "grab";
    }
  }
};

// 動態計算座位尺寸，確保不超出螢幕
const seatSize = computed(() => {
  const cols = layout.cols;
  // 基於欄位數量動態調整座位大小
  if (cols <= 5) return { width: 95, height: 80 };
  if (cols <= 8) return { width: 80, height: 70 };
  if (cols <= 12) return { width: 65, height: 58 };
  return { width: 55, height: 48 };
});
</script>

<template>
  <div class="registration-view">
    <div class="activity-selector-section">
      <div class="tech-card">
        <div class="activity-info">
          <div class="info-item">
            <span class="info-label">專案名稱：</span>
            <span class="info-value">{{ currentProject }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">活動場次：</span>
            <span class="info-value">{{ currentActivity }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="seating-layout-grid">
      <div class="tech-card guest-list-card">
        <div class="card-header-flex">
          <h3 class="card-subtitle">賓客名單</h3>
          <div class="badge-count">{{ unassignedList.length }} 位待安排</div>
        </div>

        <!-- 切換按鈕 -->
        <div class="guest-type-tabs">
          <button
            class="type-tab"
            :class="{ active: guestViewType === 'VIP' }"
            @click="guestViewType = 'VIP'"
          >
            貴賓 VIP <span class="tab-count">{{ vipList.length }}</span>
          </button>
          <button
            class="type-tab"
            :class="{ active: guestViewType === 'Attendee' }"
            @click="guestViewType = 'Attendee'"
          >
            一般民眾 <span class="tab-count">{{ attendeeList.length }}</span>
          </button>
        </div>

        <!-- 賓客列表 -->
        <draggable
          v-model="currentGuestList"
          group="seatingGroup"
          item-key="id"
          class="drag-area"
          ghost-class="my-ghost"
          drag-class="my-drag"
          :animation="300"
        >
          <template #item="{ element }">
            <div class="person-card" :class="{ 'vip-card': element.type === 'VIP' }">
              <div class="card-main">
                <span class="p-serial">#{{ element.serial }}</span>
                <span class="p-name">{{ element.name }}</span>
              </div>
              <div class="p-company">{{ element.company }}</div>
            </div>
          </template>
        </draggable>
      </div>

      <div class="tech-card seat-map-card">
        <div class="card-header-flex">
          <h3 class="card-subtitle">座位配置圖</h3>
          <div class="grid-controls">
            <button @click="showHistory = !showHistory" class="btn-mini-tag history-btn">
              📋 歷史紀錄 <span class="history-count">{{ swapHistory.length }}</span>
            </button>
            <button @click="addRow" class="btn-mini-tag">+ 新增一排</button>
            <button @click="addCol" class="btn-mini-tag">+ 新增一列</button>
            <div class="grid-info">{{ layout.rows }} × {{ layout.cols }}</div>
          </div>
        </div>

        <div
          ref="mapContainer"
          class="seat-map-container"
          @mousedown="onMapMouseDown"
          @mousemove="onMapMouseMove"
          @mouseup="onMapMouseUp"
          @mouseleave="onMapMouseLeave"
        >
          <div class="stage-banner">舞台 STAGE</div>
          <div
            class="seats-grid"
            :style="{ gridTemplateColumns: `repeat(${layout.cols}, ${seatSize.width}px)` }"
          >
            <div
              v-for="seat in activitySeats[currentActivityId]"
              :key="seat.id"
              class="seat-item"
              :style="{ width: `${seatSize.width}px` }"
            >
              <div class="seat-label">{{ seat.label }}</div>
              <draggable
                v-model="seat.attendee"
                group="seatingGroup"
                item-key="id"
                class="drop-zone"
                :class="{
                  'is-filled': seat.attendee.length > 0,
                  'is-vip': seat.attendee.length > 0 && seat.attendee[0].type === 'VIP',
                  'is-selected': selectedSeat === seat,
                }"
                :style="{ width: `${seatSize.width}px`, height: `${seatSize.height}px` }"
                ghost-class="my-ghost"
                drag-class="my-drag"
                :animation="300"
                @add="(evt) => onSeatAdd(evt, seat)"
                @click.native="selectSeat(seat)"
              >
                <template #item="{ element }">
                  <div class="seated-card" :class="{ 'vip-seated': element.type === 'VIP' }">
                    <div class="s-serial">{{ element.serial }}</div>
                    <div class="s-name">{{ element.name }}</div>
                    <button class="s-remove" @click.stop="handleRemove(seat)">✕</button>
                  </div>
                </template>
                <template #header v-if="seat.attendee.length === 0">
                  <div class="s-empty">空</div>
                </template>
              </draggable>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 歷史紀錄側邊欄 -->
    <Transition name="slide-in">
      <div v-if="showHistory" class="history-sidebar">
        <div class="history-sidebar-content">
          <div class="history-header">
            <h4>📋 換位歷史紀錄</h4>
            <button @click="showHistory = false" class="close-btn">✕</button>
          </div>
          <div class="history-list">
            <div v-if="swapHistory.length === 0" class="empty-history">尚無換位紀錄</div>
            <div
              v-for="record in swapHistory"
              :key="record.id"
              class="history-item"
              :class="[
                `history-${record.type}`,
                {
                  'has-vip':
                    record.personType === 'VIP' ||
                    record.person1Type === 'VIP' ||
                    record.person2Type === 'VIP',
                },
              ]"
            >
              <div class="history-time">{{ record.time }}</div>
              <div class="history-content">
                <span class="history-icon">
                  {{
                    record.type === "swap"
                      ? "⇄"
                      : record.type === "move"
                        ? "→"
                        : record.type === "assign"
                          ? "✓"
                          : "✕"
                  }}
                </span>
                <div class="history-desc">
                  <template v-if="record.type === 'swap'">
                    <span
                      class="person-name"
                      :class="{ 'vip-name': record.person1Type === 'VIP' }"
                      >{{ record.person1 }}</span
                    >
                    <span class="seat-info">（{{ record.seat1 }}）</span>
                    <span class="swap-arrow">⇄</span>
                    <span
                      class="person-name"
                      :class="{ 'vip-name': record.person2Type === 'VIP' }"
                      >{{ record.person2 }}</span
                    >
                    <span class="seat-info">（{{ record.seat2 }}）</span>
                  </template>
                  <template v-else-if="record.type === 'move'">
                    <span
                      class="person-name"
                      :class="{ 'vip-name': record.personType === 'VIP' }"
                      >{{ record.person }}</span
                    >
                    <span class="action-text"> 從 </span>
                    <span class="seat-info">{{ record.fromSeat }}</span>
                    <span class="action-text"> 移至 </span>
                    <span class="seat-info">{{ record.toSeat }}</span>
                  </template>
                  <template v-else-if="record.type === 'assign'">
                    <span
                      class="person-name"
                      :class="{ 'vip-name': record.personType === 'VIP' }"
                      >{{ record.person }}</span
                    >
                    <span class="action-text"> 分配至 </span>
                    <span class="seat-info">{{ record.seat }}</span>
                  </template>
                  <template v-else-if="record.type === 'remove'">
                    <span
                      class="person-name"
                      :class="{ 'vip-name': record.personType === 'VIP' }"
                      >{{ record.person }}</span
                    >
                    <span class="action-text"> 從 </span>
                    <span class="seat-info">{{ record.seat }}</span>
                    <span class="action-text"> 移除</span>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 遮罩層 -->
    <Transition name="fade">
      <div v-if="showHistory" class="overlay" @click="showHistory = false"></div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
/* CSS Variables - 統一設計系統 */
:root {
  --primary-blue: #3b82f6;
  --deep-dark: #0f172a;
  --text-gray: #64748b;
  --bg-soft: #f8fafc;
  --border-light: #e2e8f0;
}

.registration-view {
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  min-height: 100vh;
}

.activity-selector-section {
  margin-bottom: 16px;
}

.tech-card {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .card-subtitle {
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid #f1f5f9;
  }
}

.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0 !important;
    padding-bottom: 0 !important;
    border-bottom: none !important;
  }
}

.activity-info {
  display: flex;
  gap: 32px;

  .info-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: var(--bg-soft);
    border-radius: 12px;
    border: 1px solid var(--border-light);

    .info-label {
      font-size: 0.9rem;
      color: var(--text-gray);
      font-weight: 600;
    }

    .info-value {
      font-size: 1rem;
      color: var(--deep-dark);
      font-weight: 800;
    }
  }
}

.badge-count {
  background: #eff6ff;
  border: 1px solid #dbeafe;
  color: var(--primary-blue);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
}

.grid-controls {
  display: flex;
  align-items: center;
  gap: 8px;

  .grid-info {
    font-size: 0.85rem;
    color: var(--text-gray);
    font-weight: 700;
    padding: 6px 14px;
    background: var(--bg-soft);
    border-radius: 8px;
    border: 1px solid var(--border-light);
  }
}

.btn-mini-tag {
  background: #eff6ff;
  border: 1px solid #dbeafe;
  color: var(--primary-blue);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: var(--primary-blue);
    color: white;
    border-color: var(--primary-blue);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }
}

.seating-layout-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  align-items: start;
}

.guest-list-card {
  .card-subtitle {
    margin-bottom: 16px;
  }
}

.guest-type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;

  .type-tab {
    flex: 1;
    padding: 10px 16px;
    background: var(--bg-soft);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    color: var(--text-gray);
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    &:hover {
      border-color: var(--primary-blue);
      color: var(--primary-blue);
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(59, 130, 246, 0.15);
    }

    &.active {
      background: var(--primary-blue);
      color: var(--deep-dark);
      border-color: var(--primary-blue);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);

      .tab-count {
        background: white;
        color: var(--deep-dark);
      }
    }

    .tab-count {
      font-size: 0.75rem;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.2);
    }
  }
}

.guest-section {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-soft);
  border-radius: 8px;
  margin-bottom: 12px;
  border: 1px solid var(--border-light);

  .section-title {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--deep-dark);
  }

  .section-count {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--primary-blue);
    background: white;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #dbeafe;
  }
}

.drag-area {
  max-height: 420px;
  overflow-y: auto;
  padding-right: 8px;
  min-height: 80px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-soft);
    border-radius: 10px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;

    &:hover {
      background: #94a3b8;
    }
  }
}

.person-card {
  background: var(--bg-soft);
  border: 1px solid var(--border-light);
  padding: 12px 14px;
  border-radius: 12px;
  margin-bottom: 10px;
  cursor: grab;
  transition: all 0.3s;

  &:hover {
    border-color: var(--primary-blue);
    background: white;
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
  }

  &:active {
    cursor: grabbing;
  }

  &.vip-card {
    background: linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%);
    border-color: #fbbf24;

    .p-serial {
      background: #fbbf24;
      color: white;
      border-color: #f59e0b;
    }

    &:hover {
      background: linear-gradient(135deg, #fde68a 0%, #fef3c7 100%);
      border-color: #f59e0b;
      box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
    }
  }

  .card-main {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .p-serial {
    font-size: 0.7rem;
    color: var(--primary-blue);
    font-weight: 800;
    background: white;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid #dbeafe;
  }

  .p-name {
    font-weight: 700;
    color: var(--deep-dark);
    font-size: 0.95rem;
  }

  .p-company {
    font-size: 0.8rem;
    color: var(--text-gray);
    padding-left: 4px;
  }
}

.seat-map-card {
  min-height: 600px;
}

.seat-map-container {
  padding: 16px;
  background: var(--bg-soft);
  border-radius: 12px;
  border: 1px solid var(--border-light);
  overflow: auto;
  max-height: calc(100vh - 280px);
  cursor: grab;
  user-select: none;

  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-soft);
    border-radius: 10px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;

    &:hover {
      background: #94a3b8;
    }
  }

  &::-webkit-scrollbar-corner {
    background: var(--bg-soft);
  }
}

.stage-banner {
  background: linear-gradient(135deg, var(--deep-dark) 0%, #1e293b 100%);
  color: white;
  text-align: center;
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 24px;
  font-weight: 800;
  font-size: 1rem;
  letter-spacing: 0.15em;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.3);
}

.seats-grid {
  display: grid;
  gap: 12px;
  justify-content: center;
  padding: 12px;
  max-width: 100%;
  width: fit-content;
  margin: 0 auto;
}

.seat-item {
  text-align: center;
}

.seat-label {
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 700;
  margin-bottom: 8px;
  letter-spacing: 0.05em;
}

.drop-zone {
  min-width: 55px;
  min-height: 48px;
  background: white;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.3s;
  cursor: pointer;

  &:hover {
    border-color: var(--primary-blue);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
  }

  &.is-selected {
    border: 3px solid var(--primary-blue);
    background: #ebf5ff;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    transform: scale(1.05);
  }

  &.is-filled {
    border: 2px solid var(--primary-blue);
    background: #f0f7ff;
    border-style: solid;

    &.is-selected {
      border: 3px solid var(--primary-blue);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
    }
  }

  &.is-vip {
    border: 2px solid #f59e0b;
    background: linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%);
    border-style: solid;

    &:hover {
      border-color: #f59e0b;
      box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
    }

    &.is-selected {
      border: 3px solid #f59e0b;
      box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.3);
    }
  }
}

.s-empty {
  color: #cbd5e1;
  font-size: 0.85rem;
  font-weight: 600;
}

.seated-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;

  &.vip-seated {
    .s-serial {
      background: #fbbf24;
      color: white;
      border-color: #f59e0b;
    }
  }

  .s-serial {
    font-size: clamp(0.55rem, 0.65rem, 0.7rem);
    color: var(--primary-blue);
    font-weight: 800;
    background: white;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .s-name {
    font-size: clamp(0.75rem, 0.85rem, 0.9rem);
    font-weight: 800;
    color: var(--deep-dark);
    line-height: 1.2;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .s-remove {
    position: absolute;
    top: -10px;
    right: -10px;
    background: #ef4444;
    color: white;
    border-radius: 50%;
    width: 26px;
    height: 26px;
    border: 3px solid white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 800;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.5);

    &:hover {
      background: #dc2626;
      transform: scale(1.15) rotate(90deg);
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.7);
    }

    &:active {
      transform: scale(0.95);
    }
  }
}

/* 拖曳特效 CSS */
.my-ghost {
  opacity: 0.5;
  background: #ebf5ff !important;
  border: 2px dashed var(--primary-blue) !important;
  border-radius: 12px;
  transform: rotate(2deg);

  * {
    opacity: 0;
  }
}

.my-drag {
  cursor: grabbing;
  background: var(--primary-blue) !important;
  border-color: var(--primary-blue) !important;
  transform: rotate(3deg) scale(1.05);
  box-shadow: 0 20px 25px -5px rgba(59, 130, 246, 0.5);

  * {
    color: white !important;
  }
}

/* 歷史紀錄樣式 */
.history-btn {
  position: relative;

  .history-count {
    background: white;
    color: var(--primary-blue);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 800;
    margin-left: 4px;
  }
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
}

.history-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  height: 100vh;
  background: white;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  z-index: 999;
  overflow: hidden;
}

.history-sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 2px solid var(--border-light);
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);

  h4 {
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin: 0;
  }

  .close-btn {
    background: #fee2e2;
    border: 1px solid #fecaca;
    color: #dc2626;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    font-weight: 800;
    transition: all 0.2s;

    &:hover {
      background: #dc2626;
      color: white;
      transform: rotate(90deg);
    }
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-soft);
    border-radius: 10px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;

    &:hover {
      background: #94a3b8;
    }
  }
}

.empty-history {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-gray);
  font-size: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  &::before {
    content: "📝";
    font-size: 3rem;
    opacity: 0.3;
  }
}

.history-item {
  background: var(--bg-soft);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
  border-left: 4px solid #cbd5e1;
  transition: all 0.2s;

  &:hover {
    transform: translateX(-4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &.history-swap {
    border-left-color: var(--primary-blue);
    background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  }

  &.history-move {
    border-left-color: #8b5cf6;
    background: linear-gradient(135deg, #f5f3ff 0%, #f8fafc 100%);
  }

  &.history-assign {
    border-left-color: #10b981;
    background: linear-gradient(135deg, #ecfdf5 0%, #f8fafc 100%);
  }

  &.history-remove {
    border-left-color: #ef4444;
    background: linear-gradient(135deg, #fef2f2 0%, #f8fafc 100%);
  }

  &.has-vip {
    border-left-width: 5px;
    box-shadow: 0 2px 8px rgba(251, 191, 36, 0.15);
  }
}

.history-time {
  font-size: 0.75rem;
  color: var(--text-gray);
  font-weight: 700;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.history-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;

  .history-icon {
    font-size: 1.2rem;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border-radius: 8px;
    flex-shrink: 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .history-desc {
    font-size: 0.95rem;
    color: var(--deep-dark);
    font-weight: 600;
    line-height: 1.5;
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;

    .person-name {
      font-weight: 800;
      color: var(--primary-blue);
      padding: 2px 8px;
      background: #eff6ff;
      border-radius: 6px;
      border: 1px solid #dbeafe;

      &.vip-name {
        color: #f59e0b;
        background: linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%);
        border: 1px solid #fbbf24;
        font-weight: 900;
        box-shadow: 0 2px 4px rgba(251, 191, 36, 0.2);
      }
    }

    .seat-info {
      font-weight: 700;
      color: var(--text-gray);
      font-size: 0.85rem;
    }

    .action-text {
      color: var(--text-gray);
      font-weight: 500;
    }

    .swap-arrow {
      color: var(--primary-blue);
      font-weight: 800;
      font-size: 1.1rem;
    }
  }
}

/* 過渡動畫 */
.slide-in-enter-active,
.slide-in-leave-active {
  transition: transform 0.3s ease;
}

.slide-in-enter-from {
  transform: translateX(100%);
}

.slide-in-leave-to {
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
