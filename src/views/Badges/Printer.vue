<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import vPrint from "vue3-print-nb";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import QRCodeLib from "qrcode";

const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();

const logoUrl = ref("");
const logoFile = ref(null);
function handleLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  logoFile.value = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    logoUrl.value = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// 使用 store 的參與者數據
const allParticipants = computed(() => participantsStore.participants);

const searchQuery = ref("");
const selectedIds = ref([]);
const filteredParticipants = computed(() =>
  allParticipants.value.filter(
    (p) =>
      (p.name || "").includes(searchQuery.value) ||
      (p.company || "").includes(searchQuery.value),
  ),
);
const selectedParticipants = computed(() =>
  allParticipants.value.filter((p) => selectedIds.value.includes(p.id)),
);

// 拖曳範本設定
const dragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

function startDrag(el, evt) {
  activeElement.value = el;
  dragging.value = true;
  dragOffset.value = {
    x: evt.clientX - el.x,
    y: evt.clientY - el.y,
  };
}
function onDrag(evt) {
  if (!dragging.value || !activeElement.value) return;
  activeElement.value.x = evt.clientX - dragOffset.value.x;
  activeElement.value.y = evt.clientY - dragOffset.value.y;
}
function stopDrag() {
  dragging.value = false;
}

const activeElement = ref(null);

// 預設排版
const defaultElements = [
  {
    id: "t1",
    key: "name",
    label: "姓名",
    x: 20,
    y: 80,
    style: { fontSize: 26, fontWeight: "900", color: "#1e293b" },
  },
  {
    id: "t2",
    key: "company",
    label: "單位",
    x: 20,
    y: 120,
    style: { fontSize: 14, fontWeight: "400", color: "#64748b" },
  },
  {
    id: "t3",
    key: "code",
    label: "QR編碼",
    x: 230,
    y: 20,
    style: { fontSize: 12, fontWeight: "400", color: "#cbd5e1" },
  },
];

function loadSavedTemplate() {
  try {
    const saved = localStorage.getItem("badge_template");
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

const _savedTemplate = loadSavedTemplate();
const templateElements = ref(_savedTemplate?.length ? _savedTemplate : defaultElements);

function resetTemplate() {
  localStorage.removeItem("badge_template");
  templateElements.value = defaultElements.map(el => ({ ...el, style: { ...el.style } }));
}

onMounted(() => {
  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", stopDrag);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", stopDrag);
});

watch(
  () => eventsStore.currentEvent,
  async (newEvent) => {
    if (newEvent?.id) {
      await participantsStore.fetchParticipants({ event: newEvent.id });
    } else {
      participantsStore.clear();
    }
  },
  { immediate: true }
);

const toggleSelection = (id) => {
  const index = selectedIds.value.indexOf(id);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(id);
  }
};

const toggleAll = () => {
  if (selectedIds.value.length === filteredParticipants.value.length) {
    selectedIds.value = [];
  } else {
    selectedIds.value = filteredParticipants.value.map((p) => p.id);
  }
};

// QR Code 圖片生成
const qrDataUrls = ref({});
async function ensureQr(token) {
  if (!token || qrDataUrls.value[token]) return;
  qrDataUrls.value[token] = await QRCodeLib.toDataURL(token, { width: 80, margin: 1 });
}
watch(
  selectedParticipants,
  (participants) => participants.forEach((p) => ensureQr(p.checkInToken)),
  { immediate: true }
);

const isAllSelected = computed(
  () =>
    filteredParticipants.value.length > 0 &&
    selectedIds.value.length === filteredParticipants.value.length,
);

// ===== 站台管理 =====
const showStations = ref(false);
const stationTestStatus = ref({ 1: "idle", 2: "idle", 3: "idle" });

async function testStation(slot) {
  const eid = eventsStore.currentEvent?.id;
  if (!eid) return;
  stationTestStatus.value[slot] = "testing";

  const stationSession = `print-${eid}-station-${slot}`;
  const wsBase = (import.meta.env.VITE_API_BASE_URL || window.location.origin)
    .replace(/\/$/, "")
    .replace(/^https/, "wss")
    .replace(/^http/, "ws");
  const token = localStorage.getItem("access_token") || "";
  const tokenParam = token ? `?token=${token}` : "";

  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsBase}/ws/print/${stationSession}/${tokenParam}`);
      const timeout = setTimeout(() => { ws.close(); reject(); }, 5000);
      ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(); };
      ws.onerror = () => { clearTimeout(timeout); reject(); };
    });
    stationTestStatus.value[slot] = "online";
  } catch {
    stationTestStatus.value[slot] = "offline";
  }
}

const mobileDispatchUrl = computed(() => {
  const eid = eventsStore.currentEvent?.id;
  if (!eid) return null;
  return `${window.location.origin}${window.location.pathname}#/mobile/print-dispatch?event=${eid}`;
});

const mobileQrDataUrl = ref("");
watch(mobileDispatchUrl, async (url) => {
  mobileQrDataUrl.value = url
    ? await QRCodeLib.toDataURL(url, { width: 160, margin: 1, errorCorrectionLevel: "M" })
    : "";
}, { immediate: true });

function openStation(slot) {
  const eid = eventsStore.currentEvent?.id;
  if (!eid) return;
  const url = `${window.location.origin}${window.location.pathname}#/print/station/${slot}?event=${eid}`;
  window.open(url, `_station_${slot}`, "width=960,height=700,menubar=no,toolbar=no,status=no,scrollbars=yes");
}

// 儲存版面設計 & Logo 到 localStorage
watch(templateElements, (val) => {
  localStorage.setItem("badge_template", JSON.stringify(val));
}, { deep: true });

watch(logoUrl, (val) => {
  if (val) localStorage.setItem("badge_logo", val);
  else localStorage.removeItem("badge_logo");
});
</script>

<template>
  <div class="badge-printer-view" @mousemove="onDrag" @mouseup="stopDrag">
    <!-- 頂部工具列 -->
    <div class="toolbar no-print">
      <div class="toolbar-left">
        <span class="toolbar-stat">
          共 <strong>{{ allParticipants.length }}</strong> 人，已選
          <strong class="highlight">{{ selectedIds.length }}</strong> 人
        </span>
      </div>
      <div class="toolbar-right">
        <button
          v-if="eventsStore.currentEvent"
          class="btn-outline"
          :class="{ active: showStations }"
          @click="showStations = !showStations"
        >
          外部站台 {{ showStations ? '▲' : '▼' }}
        </button>
        <button
          class="btn-primary"
          :disabled="selectedIds.length === 0"
          v-print="{ id: 'printBadges', preview: false, popTitle: '識別證列印' }"
        >
          確認列印 ({{ selectedIds.length }})
        </button>
      </div>
    </div>

    <!-- 站台管理（可展開） -->
    <Transition name="slide-down">
      <div class="station-mgmt no-print" v-if="showStations && eventsStore.currentEvent">
        <div class="station-list">
          <div v-for="s in [1, 2, 3]" :key="s" class="station-item">
            <div class="station-test-dot" :class="stationTestStatus[s]"></div>
            <button class="btn-station" @click="openStation(s)">站台 {{ s }}</button>
            <button
              class="btn-test"
              :class="stationTestStatus[s]"
              :disabled="stationTestStatus[s] === 'testing'"
              @click="testStation(s)"
            >
              {{ stationTestStatus[s] === 'testing' ? '測試中...' : stationTestStatus[s] === 'online' ? '已連線' : stationTestStatus[s] === 'offline' ? '離線' : '測試' }}
            </button>
          </div>
        </div>
        <div class="qr-wrap" v-if="mobileQrDataUrl">
          <img :src="mobileQrDataUrl" class="qr-img" alt="手機派送頁 QR" />
          <span class="qr-label">手機派送</span>
        </div>
      </div>
    </Transition>

    <!-- 主區塊：人員選擇 + 設計畫布 -->
    <div class="main-layout">
      <!-- 左側：人員選擇 -->
      <div class="selection-panel no-print">
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="搜尋姓名或單位..."
        />
        <div class="list-header">
          <button class="btn-toggle" :class="{ active: isAllSelected }" @click="toggleAll">
            <span class="toggle-icon">{{ isAllSelected ? "✓" : "○" }}</span>
            全選
          </button>
        </div>
        <div class="participant-list">
          <div
            v-for="p in filteredParticipants"
            :key="p.id"
            class="p-item"
            :class="{ selected: selectedIds.includes(p.id) }"
            @click="toggleSelection(p.id)"
          >
            <div class="p-info">
              <span class="name">{{ p.name }}</span>
              <span class="comp">{{ p.company }}</span>
            </div>
            <span v-if="selectedIds.includes(p.id)" class="check-mark">✓</span>
          </div>
        </div>
      </div>

      <!-- 右側：設計畫布 -->
      <div class="design-area no-print">
        <div class="canvas-toolbar">
          <span class="canvas-title">範本設計</span>
          <div class="canvas-actions">
            <label class="btn-sm">
              <span>{{ logoUrl ? '更換 LOGO' : '上傳 LOGO' }}</span>
              <input type="file" accept="image/*" @change="handleLogoUpload" hidden />
            </label>
            <img v-if="logoUrl" :src="logoUrl" alt="Logo" class="logo-thumb" />
            <button class="btn-sm danger" @click="resetTemplate">重置排版</button>
            <span class="size-label">60 × 90 mm</span>
          </div>
        </div>

        <div class="canvas-box">
          <img v-if="logoUrl" :src="logoUrl" class="canvas-logo" />
          <div
            v-for="el in templateElements"
            :key="el.id"
            class="draggable-element"
            :class="{ active: activeElement?.id === el.id }"
            :style="{
              left: el.x + 'px',
              top: el.y + 'px',
              fontSize: el.style.fontSize + 'px',
              fontWeight: el.style.fontWeight,
              color: el.style.color,
            }"
            @mousedown="(evt) => startDrag(el, evt)"
          >
            <template v-if="el.label === 'QR編碼'">
              <img
                v-if="qrDataUrls[selectedParticipants[0]?.checkInToken]"
                :src="qrDataUrls[selectedParticipants[0]?.checkInToken]"
                width="80"
                height="80"
              />
              <div v-else class="qr-placeholder"></div>
            </template>
            <template v-else>
              [{{ el.label }}]
            </template>
            <div class="drag-handle" v-if="activeElement?.id === el.id"></div>
          </div>
        </div>

        <!-- 行內樣式編輯器 -->
        <Transition name="fade">
          <div class="style-bar" v-if="activeElement">
            <span class="style-bar-label">{{ activeElement.label }}</span>
            <div class="style-control">
              <label>大小</label>
              <input type="range" v-model="activeElement.style.fontSize" min="12" max="60" />
              <span class="val">{{ activeElement.style.fontSize }}px</span>
            </div>
            <div class="style-control">
              <label>顏色</label>
              <input type="color" v-model="activeElement.style.color" class="color-picker" />
            </div>
            <div class="style-control">
              <label>X</label>
              <input type="number" v-model="activeElement.x" class="num-input" />
            </div>
            <div class="style-control">
              <label>Y</label>
              <input type="number" v-model="activeElement.y" class="num-input" />
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- 列印專用區域 -->
    <div id="printBadges" class="print-only-area">
      <div
        v-for="p in selectedParticipants"
        :key="p.id"
        class="print-badge"
      >
        <img v-if="logoUrl" :src="logoUrl" class="print-logo" />
        <div
          v-for="el in templateElements"
          :key="el.id"
          class="print-element"
          :style="{
            position: 'absolute',
            left: el.x + 'px',
            top: el.y + 'px',
            fontSize: el.style.fontSize + 'px',
            fontWeight: el.style.fontWeight,
            color: el.style.color,
            whiteSpace: 'nowrap',
          }"
        >
          <template v-if="el.key === 'name'">{{ p.name }}</template>
          <template v-else-if="el.key === 'company'">{{ p.company }}</template>
          <template v-else-if="el.key === 'code'">
            <img
              v-if="qrDataUrls[p.checkInToken]"
              :src="qrDataUrls[p.checkInToken]"
              width="80"
              height="80"
            />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.badge-printer-view {
  padding: 24px;
  background: #f8fafc;
  min-height: 100vh;
}

/* ===== 頂部工具列 ===== */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border-radius: 14px;
  padding: 14px 24px;
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.toolbar-left {
  .toolbar-stat {
    font-size: 0.9rem;
    color: #475569;

    strong { color: #0f172a; }
    .highlight { color: #667eea; font-size: 1.1rem; }
  }
}

.toolbar-right {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-primary {
  padding: 10px 22px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  transition: all 0.3s;

  &:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4); }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
}

.btn-outline {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: white;
  color: #475569;
  transition: all 0.2s;

  &:hover, &.active { border-color: #667eea; color: #667eea; background: #f5f3ff; }
}

/* ===== 站台管理 ===== */
.station-mgmt {
  display: flex;
  align-items: center;
  gap: 20px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 16px;
}

.station-list {
  display: flex;
  gap: 10px;
  flex: 1;
  flex-wrap: wrap;
}

.station-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 10px;
}

.station-test-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
  transition: background 0.3s;
  &.testing { background: #f59e0b; animation: ws-pulse 1s infinite; }
  &.online  { background: #22c55e; box-shadow: 0 0 5px rgba(34,197,94,0.5); }
  &.offline { background: #ef4444; }
}

.btn-station {
  padding: 6px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: white;
  color: #0f172a;
  transition: all 0.2s;
  &:hover { background: #eff6ff; border-color: #3b82f6; color: #2563eb; }
}

.btn-test {
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: white;
  color: #64748b;
  transition: all 0.2s;
  &:hover:not(:disabled) { border-color: #3b82f6; color: #2563eb; }
  &:disabled { opacity: 0.6; cursor: default; }
  &.online  { border-color: #bbf7d0; color: #16a34a; background: #f0fdf4; }
  &.offline { border-color: #fecaca; color: #dc2626; background: #fef2f2; }
}

.qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;

  .qr-img { width: 64px; height: 64px; border-radius: 6px; border: 1px solid #e2e8f0; }
  .qr-label { font-size: 0.7rem; color: #94a3b8; }
}

/* ===== 主區塊 ===== */
.main-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  align-items: start;
}

/* 左側人員選擇 */
.selection-panel {
  background: white;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  padding: 16px;
  height: calc(100vh - 180px);
  display: flex;
  flex-direction: column;

  .search-input {
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    font-size: 0.9rem;
    margin-bottom: 10px;
    transition: 0.2s;
    &:focus { border-color: #667eea; outline: none; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
  }
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid #e2e8f0;
}

.btn-toggle {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;

  .toggle-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 2px solid #cbd5e1;
    font-size: 12px;
    transition: all 0.2s;
  }

  &.active .toggle-icon {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: #667eea;
    color: white;
  }

  &:hover { color: #667eea; }
  &:hover .toggle-icon { border-color: #667eea; }
}

.participant-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
}

.p-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 4px;
  border: 2px solid transparent;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.2s;

  &:hover { border-color: #a5b4fc; background: #f5f3ff; }

  &.selected {
    background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%);
    border-color: #667eea;

    .name { color: #667eea; }
  }

  .p-info {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .name { font-weight: 700; color: #0f172a; font-size: 0.9rem; }
    .comp { font-size: 0.75rem; color: #64748b; }
  }

  .check-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 12px;
    font-weight: bold;
  }
}

/* ===== 右側設計區域 ===== */
.design-area {
  background: white;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  padding: 20px;
}

.canvas-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.canvas-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.canvas-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-sm {
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  &:hover { border-color: #3b82f6; color: #2563eb; background: #eff6ff; }
  &.danger { border-color: #fca5a5; background: #fff1f2; color: #ef4444; &:hover { background: #fee2e2; } }
}

.logo-thumb {
  height: 24px;
  max-width: 60px;
  border-radius: 4px;
  object-fit: contain;
}

.size-label {
  font-size: 0.72rem;
  color: #64748b;
  font-weight: 700;
  background: #f8fafc;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

.canvas-box {
  width: 90mm;
  height: 60mm;
  background: white;
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  border-radius: 4px;
  border: 2px solid #e2e8f0;
  margin: 0 auto;
}

.canvas-logo {
  position: absolute;
  left: 20px;
  top: 20px;
  height: 40px;
  max-width: 120px;
  z-index: 2;
}

.draggable-element {
  position: absolute;
  cursor: move;
  padding: 4px 8px;
  border: 2px dashed transparent;
  white-space: nowrap;
  border-radius: 4px;
  transition: border-color 0.2s, background 0.2s;

  &:hover { background: rgba(59, 130, 246, 0.05); border-color: #cbd5e1; }

  &.active {
    border: 2px dashed #3b82f6;
    background: rgba(59, 130, 246, 0.08);

    .drag-handle {
      position: absolute;
      bottom: -6px;
      right: -6px;
      width: 12px;
      height: 12px;
      background: #3b82f6;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  }
}

.qr-placeholder {
  width: 80px;
  height: 80px;
  background: #f1f5f9;
  border-radius: 4px;
}

/* ===== 行內樣式編輯器 ===== */
.style-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  flex-wrap: wrap;
}

.style-bar-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
}

.style-control {
  display: flex;
  align-items: center;
  gap: 6px;

  label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #64748b;
    white-space: nowrap;
  }

  .val {
    font-size: 0.75rem;
    font-weight: 700;
    color: #64748b;
    font-family: monospace;
    min-width: 36px;
  }

  input[type="range"] {
    width: 80px;
    height: 4px;
    border-radius: 10px;
    background: #e2e8f0;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #3b82f6;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.4);
    }
  }

  .color-picker {
    border: none;
    width: 28px;
    height: 28px;
    cursor: pointer;
    background: none;
    border-radius: 6px;
    overflow: hidden;

    &::-webkit-color-swatch-wrapper { padding: 0; }
    &::-webkit-color-swatch { border: 2px solid #e2e8f0; border-radius: 6px; }
  }

  .num-input {
    width: 56px;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    &:focus { border-color: #3b82f6; outline: none; }
  }
}

/* ===== 動畫 ===== */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 120px;
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

@keyframes ws-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ===== 列印 ===== */
.print-only-area {
  display: none;
}

/* ===== RWD ===== */
@media (max-width: 768px) {
  .badge-printer-view { padding: 12px; }

  .toolbar {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
    padding: 12px 16px;
  }

  .toolbar-right { justify-content: flex-end; }

  .station-mgmt {
    flex-direction: column;
    gap: 12px;
  }

  .main-layout {
    grid-template-columns: 1fr;
  }

  .selection-panel {
    height: auto;
    max-height: 300px;
  }

  .canvas-box {
    width: 100%;
    max-width: 90mm;
  }

  .style-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}

@media print {
  .print-only-area {
    display: block !important;
  }

  .badge-printer-view {
    padding: 0;
    background: white;

    .toolbar,
    .station-mgmt,
    .main-layout {
      display: none !important;
    }
  }

  .print-badge {
    position: relative;
    width: 90mm;
    height: 60mm;
    overflow: hidden;
    background: white;
    page-break-after: always;
    margin: 0;

    .print-logo {
      position: absolute;
      left: 20px;
      top: 20px;
      height: 40px;
      max-width: 120px;
      z-index: 2;
    }

    .print-element {
      position: absolute;
    }

    &:last-child {
      page-break-after: auto;
    }
  }

  @page {
    size: 90mm 60mm;
    margin: 0;
  }
}
</style>
