<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
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

// 2. 隨意拖曳範本設定 (核心升級)
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

const activeElement = ref(null); // 當前正在編輯的元件

// 預設排版（60mm≈227px，所有座標需在此範圍內）
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

// 從 localStorage 載入已儲存的排版，否則使用預設值
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
  disconnectWebSocket();
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

// 3. 處理拖曳位置 (簡單實現：透過點擊選中並編輯)
// 移除 selectElement

// 4. 切換選取邏輯
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

// ===== WebSocket 掃描自動列印 =====
const wsStatus = ref("disconnected"); // disconnected | connecting | connected | error
const wsCurrentPrint = ref(null);     // 當前 WS 觸發列印的參與者
const wsPrinting = ref(false);        // 是否正在 WS 列印模式
const wsLog = ref([]);                // 最近列印紀錄
let wsInstance = null;

const sessionId = computed(() =>
  eventsStore.currentEvent?.id ? `print-${eventsStore.currentEvent.id}` : null,
);

const wsStatusText = computed(() => {
  const map = { disconnected: "未連線", connecting: "連線中...", connected: "已連線", error: "連線錯誤" };
  return map[wsStatus.value] || "未知";
});

function connectWebSocket() {
  if (!sessionId.value || wsInstance) return;
  wsStatus.value = "connecting";
  const wsBase = (import.meta.env.VITE_API_BASE_URL || window.location.origin)
    .replace(/\/$/, "")
    .replace(/^https/, "wss")
    .replace(/^http/, "ws");
  const token = localStorage.getItem("access_token") || "";
  const tokenParam = token ? `?token=${token}` : "";
  wsInstance = new WebSocket(`${wsBase}/ws/print/${sessionId.value}/${tokenParam}`);
  wsInstance.onopen = () => { wsStatus.value = "connected"; };
  wsInstance.onclose = () => { wsStatus.value = "disconnected"; wsInstance = null; };
  wsInstance.onerror = () => { wsStatus.value = "error"; };
  wsInstance.onmessage = async ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "print" && msg.data) {
        await handleWsPrint(msg.data);
      }
    } catch { /* ignore */ }
  };
}

function disconnectWebSocket() {
  wsInstance?.close();
  wsInstance = null;
  wsStatus.value = "disconnected";
}

async function handleWsPrint(raw) {
  const p = {
    id: raw.id,
    name: raw.name || "",
    company: raw.company || "",
    title: raw.title || "",
    checkInToken: raw.check_in_token,
  };
  await ensureQr(p.checkInToken);
  wsCurrentPrint.value = p;
  wsLog.value.unshift({
    name: p.name,
    company: p.company,
    time: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  });
  if (wsLog.value.length > 8) wsLog.value.pop();
  wsPrinting.value = true;
  await nextTick();
  window.print();
  setTimeout(() => {
    wsPrinting.value = false;
    wsCurrentPrint.value = null;
  }, 2000);
}

// ===== 外部列印站台管理 =====
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

// 儲存版面設計 & Logo 到 localStorage（供 PrintStation 讀取）
watch(templateElements, (val) => {
  localStorage.setItem("badge_template", JSON.stringify(val));
}, { deep: true });

watch(logoUrl, (val) => {
  if (val) localStorage.setItem("badge_logo", val);
  else localStorage.removeItem("badge_logo");
});
</script>

<template>
  <div class="badge-printer-view" :class="{ 'ws-printing-mode': wsPrinting }" @mousemove="onDrag" @mouseup="stopDrag">
    <div class="page-header no-print">
      <div class="header-actions">
        <button
          class="btn-primary"
          :disabled="selectedIds.length === 0"
          v-print="{ id: 'printBadges', preview: false, popTitle: '識別證列印' }"
        >
          確認列印 ({{ selectedIds.length }})
        </button>
        <label class="logo-upload">
          <span>上傳 LOGO</span>
          <input type="file" accept="image/*" @change="handleLogoUpload" style="display:none" />
        </label>
        <span v-if="logoUrl" class="logo-preview">
          <img :src="logoUrl" alt="Logo" style="height:40px;max-width:120px;border-radius:8px;" />
        </span>
      </div>
    </div>

    <!-- WebSocket 掃描自動印票面板 -->
    <div class="ws-bar no-print" v-if="eventsStore.currentEvent">
      <div class="ws-left">
        <div class="ws-status-dot" :class="wsStatus"></div>
        <span class="ws-label">掃描印票</span>
        <code class="ws-session-id">{{ sessionId }}</code>
        <span class="ws-status-text">{{ wsStatusText }}</span>
      </div>
      <div class="ws-center">
        <button
          v-if="wsStatus === 'disconnected' || wsStatus === 'error'"
          class="btn-ws-connect"
          @click="connectWebSocket"
        >連線</button>
        <button v-else class="btn-ws-disconnect" @click="disconnectWebSocket">中斷連線</button>
      </div>
      <div class="ws-log" v-if="wsLog.length">
        <span class="ws-log-title">最近列印：</span>
        <div v-for="(item, i) in wsLog" :key="i" class="ws-log-item">
          <span class="log-name">{{ item.name }}</span>
          <span class="log-comp">{{ item.company }}</span>
          <span class="log-time">{{ item.time }}</span>
        </div>
      </div>
    </div>

    <!-- 外部列印站台管理 -->
    <div class="station-mgmt no-print" v-if="eventsStore.currentEvent">
      <div class="mgmt-left">
        <span class="mgmt-title">外部列印站台</span>
        <div class="station-btns">
          <button v-for="s in [1, 2, 3]" :key="s" class="btn-open-station" @click="openStation(s)">
            🖨️ 站台 {{ s }}
          </button>
        </div>
      </div>
      <div class="mgmt-right" v-if="mobileQrDataUrl">
        <div class="qr-wrap">
          <img :src="mobileQrDataUrl" class="qr-img" alt="手機派送頁 QR" />
          <div class="qr-label">手機掃碼開啟派送頁</div>
        </div>
      </div>
    </div>

    <div class="main-layout">
      <div class="tech-card selection-panel no-print">
        <h3 class="card-subtitle">人員選擇</h3>
        <input
          v-model="searchQuery"
          class="input-styled search-input"
          placeholder="搜尋姓名或單位..."
        />
        <div class="list-header">
          <button class="btn-toggle-all" :class="{ active: isAllSelected }" @click="toggleAll">
            <span class="toggle-icon">{{ isAllSelected ? "✓" : "○" }}</span>
            全選
          </button>
          <span class="badge-count">已選 {{ selectedIds.length }} 位</span>
        </div>
        <div class="participant-selector">
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
            <div class="check-indicator">
              <span v-if="selectedIds.includes(p.id)" class="check-mark">✓</span>
            </div>
          </div>
        </div>
      </div>

      <div class="design-canvas-area no-print">
        <div class="tech-card badge-canvas">
          <div class="card-header-flex">
            <h3 class="card-subtitle">範本設計預覽</h3>
            <div style="display:flex;gap:8px;align-items:center;">
              <button class="btn-reset-template" @click="resetTemplate">重置排版</button>
              <span class="size-label">60 × 90 mm</span>
            </div>
          </div>
          <div class="canvas-box">
            <img v-if="logoUrl" :src="logoUrl" class="canvas-logo" style="position:absolute;left:20px;top:20px;height:40px;max-width:120px;z-index:2;" />
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
                <div v-else style="width:80px;height:80px;background:#f1f5f9;border-radius:4px;"></div>
              </template>
              <template v-else>
                [{{ el.label }}]
              </template>
              <div class="drag-handle" v-if="activeElement?.id === el.id"></div>
            </div>
          </div>
        </div>

        <div class="tech-card style-editor" v-if="activeElement">
          <h3 class="card-subtitle">編輯：{{ activeElement.label }}</h3>
          <div class="controls">
            <div class="control-item">
              <label class="control-label">大小</label>
              <input
                type="range"
                v-model="activeElement.style.fontSize"
                min="12"
                max="60"
                class="range-input"
              />
              <span class="value-display">{{ activeElement.style.fontSize }}px</span>
            </div>
            <div class="control-item">
              <label class="control-label">顏色</label>
              <input type="color" v-model="activeElement.style.color" class="color-input-styled" />
              <span class="value-display">{{ activeElement.style.color }}</span>
            </div>
            <div class="control-item">
              <label class="control-label">X 位置</label>
              <input type="number" v-model="activeElement.x" class="input-styled number-input" />
            </div>
            <div class="control-item">
              <label class="control-label">Y 位置</label>
              <input type="number" v-model="activeElement.y" class="input-styled number-input" />
            </div>
          </div>
        </div>
      </div>

      <!-- 手動列印專用區域 -->
      <div id="printBadges" class="print-only-area">
        <div
          v-for="p in selectedParticipants"
          :key="p.id"
          class="print-badge"
          style="position:relative;width:90mm;height:60mm;overflow:hidden;background:white;page-break-after:always;"
        >
          <img v-if="logoUrl" :src="logoUrl" class="print-logo" style="position:absolute;left:20px;top:20px;height:40px;max-width:120px;z-index:2;" />
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

    <!-- WebSocket 自動列印專用區域 -->
    <div class="ws-print-area">
      <div v-if="wsCurrentPrint" class="print-badge">
        <img v-if="logoUrl" :src="logoUrl" class="print-logo" style="position:absolute;left:20px;top:20px;height:40px;max-width:120px;z-index:2;" />
        <div
          v-for="el in templateElements"
          :key="el.id"
          class="print-element"
          :style="{
            left: el.x + 'px',
            top: el.y + 'px',
            fontSize: el.style.fontSize + 'px',
            fontWeight: el.style.fontWeight,
            color: el.style.color,
          }"
        >
          <template v-if="el.key === 'name'">{{ wsCurrentPrint.name }}</template>
          <template v-else-if="el.key === 'company'">{{ wsCurrentPrint.company }}</template>
          <template v-else-if="el.key === 'code'">
            <img
              v-if="qrDataUrls[wsCurrentPrint.checkInToken]"
              :src="qrDataUrls[wsCurrentPrint.checkInToken]"
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
  padding: 30px;
  background: #f8fafc;
  min-height: 100vh;
}

.page-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 28px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
}

.main-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  align-items: start;
}

.tech-card {
  background: white;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .card-subtitle {
    font-size: 1.1rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 20px 0;
    padding-bottom: 12px;
    border-bottom: 2px solid #f3f4f6;
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

  .size-label {
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 700;
    background: #f8fafc;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
  }
}

.btn-reset-template {
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #fca5a5;
  background: #fff1f2;
  color: #ef4444;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  &:hover { background: #fee2e2; }
}

/* 左側人員選擇面板 */
.selection-panel {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;

  .search-input {
    margin-bottom: 12px;
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #f8fafc;
    border-radius: 8px;
    margin-bottom: 12px;
    border: 1px solid #e2e8f0;

    .btn-toggle-all {
      font-size: 0.9rem;
      font-weight: 700;
      color: #0f172a;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      padding: 0;
      transition: all 0.2s;

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

      &:hover {
        color: #667eea;
      }

      &:hover .toggle-icon {
        border-color: #667eea;
      }
    }

    .badge-count {
      font-size: 0.8rem;
      font-weight: 700;
      color: #3b82f6;
      background: white;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid #dbeafe;
    }
  }

  .participant-selector {
    flex: 1;
    overflow-y: auto;
    padding-right: 4px;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: #f8fafc;
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

  .p-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    margin-bottom: 8px;
    border: 2px solid transparent;
    background: #f8fafc;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;

    &:hover {
      border-color: #a5b4fc;
      background: #f5f3ff;
      transform: translateX(4px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.12);
    }

    &.selected {
      background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%);
      border-color: #667eea;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.25);

      &:hover {
        border-color: #667eea;
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
      }

      .p-info .name {
        color: #667eea;
      }
    }

    .p-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .name {
        font-weight: 700;
        color: #0f172a;
        font-size: 0.95rem;
        transition: color 0.2s;
      }

      .comp {
        font-size: 0.75rem;
        color: #64748b;
        font-weight: 500;
      }
    }

    .check-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;

      .check-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-size: 14px;
        font-weight: bold;
        animation: checkPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      }
    }
  }

  @keyframes checkPop {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
}

.input-styled {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  font-weight: 600;
  transition: 0.3s;

  &:hover {
    border-color: #cbd5e1;
  }

  &:focus {
    border-color: #3b82f6;
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  &.number-input {
    text-align: center;
  }
}

/* 設計畫布區域 */
.design-canvas-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.badge-canvas {
  display: flex;
  flex-direction: column;
  align-items: center;

  .canvas-box {
    width: 90mm;
    height: 60mm;
    background: white;
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    border: 2px solid #e2e8f0;

    .draggable-element {
      position: absolute;
      cursor: move;
      padding: 6px 10px;
      border: 2px dashed transparent;
      white-space: nowrap;
      border-radius: 6px;
      transition: all 0.2s;

      &:hover {
        background: rgba(59, 130, 246, 0.05);
        border-color: #cbd5e1;
      }

      &.active {
        border: 2px dashed #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);

        .drag-handle {
          position: absolute;
          bottom: -8px;
          right: -8px;
          width: 16px;
          height: 16px;
          background: #3b82f6;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }
      }
    }
  }
}

.style-editor {
  .controls {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;

    .control-item {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .control-label {
        font-size: 0.85rem;
        font-weight: 700;
        color: #0f172a;
      }

      .range-input {
        width: 100%;
        height: 6px;
        border-radius: 10px;
        background: #f8fafc;
        outline: none;
        cursor: pointer;

        &::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);

          &:hover {
            transform: scale(1.2);
          }
        }
      }

      .color-input-styled {
        border: none;
        width: 50px;
        height: 40px;
        cursor: pointer;
        background: none;
        border-radius: 8px;
        overflow: hidden;

        &::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        &::-webkit-color-swatch {
          border: 2px solid var(--border-light);
          border-radius: 8px;
        }
      }

      .value-display {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-gray);
        font-family: monospace;
      }
    }
  }
}

/* 外部列印站台管理列 */
.station-mgmt {
  display: flex;
  align-items: center;
  gap: 24px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 24px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  .mgmt-left {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;

    .mgmt-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: #0f172a;
      white-space: nowrap;
    }

    .station-btns {
      display: flex;
      gap: 10px;

      .btn-open-station {
        padding: 8px 20px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.875rem;
        cursor: pointer;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #0f172a;
        transition: all 0.2s;

        &:hover {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(59, 130, 246, 0.15);
        }
      }
    }
  }

  .mgmt-right {
    .qr-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;

      .qr-img {
        width: 80px;
        height: 80px;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
      }

      .qr-label {
        font-size: 0.72rem;
        color: #94a3b8;
        text-align: center;
        white-space: nowrap;
      }
    }
  }
}

/* WebSocket 掃描印票面板 */
.ws-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  flex-wrap: wrap;

  .ws-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;

    .ws-status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background 0.3s;

      &.connected {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
      }
      &.connecting {
        background: #f59e0b;
        animation: ws-pulse 1s infinite;
      }
      &.disconnected { background: #94a3b8; }
      &.error { background: #ef4444; }
    }

    .ws-label {
      font-weight: 700;
      color: #0f172a;
      font-size: 0.9rem;
    }

    .ws-session-id {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 3px 10px;
      font-size: 0.8rem;
      color: #475569;
      font-family: monospace;
      letter-spacing: 0.5px;
    }

    .ws-status-text {
      font-size: 0.8rem;
      color: #64748b;
    }
  }

  .ws-center {
    .btn-ws-connect {
      padding: 8px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      border: none;
      background: #22c55e;
      color: white;
      transition: all 0.2s;

      &:hover { background: #16a34a; }
    }

    .btn-ws-disconnect {
      padding: 8px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      background: white;
      color: #ef4444;
      border: 1px solid #ef4444;
      transition: all 0.2s;

      &:hover { background: #fef2f2; }
    }
  }

  .ws-log {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;

    .ws-log-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: #94a3b8;
      white-space: nowrap;
    }

    .ws-log-item {
      display: flex;
      align-items: center;
      gap: 4px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 3px 10px;
      font-size: 0.78rem;

      .log-name { font-weight: 700; color: #0f172a; }
      .log-comp { color: #64748b; }
      .log-time { color: #94a3b8; font-family: monospace; margin-left: 4px; }
    }
  }
}

@keyframes ws-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 列印專用區域 / WS 列印區 - 平時隱藏 */
.print-only-area,
.ws-print-area {
  display: none;
}

@media print {
  /* v-print 在獨立 popup 中只含 .print-only-area，需直接顯示 */
  .print-only-area {
    display: block !important;
  }

  .badge-printer-view {
    padding: 0;
    background: white;
  }

  /* 手動列印模式（預設）：顯示 print-only-area，隱藏 ws-print-area */
  .badge-printer-view:not(.ws-printing-mode) {
    .page-header,
    .ws-bar,
    .selection-panel,
    .design-canvas-area,
    .main-layout {
      display: none !important;
    }

    .print-only-area {
      display: block !important;
    }

    .ws-print-area {
      display: none !important;
    }
  }

  /* WebSocket 自動列印模式：顯示 ws-print-area，隱藏其餘 */
  .badge-printer-view.ws-printing-mode {
    .page-header,
    .ws-bar,
    .selection-panel,
    .design-canvas-area,
    .main-layout,
    .print-only-area {
      display: none !important;
    }

    .ws-print-area {
      display: block !important;
    }
  }

  .print-badge {
    width: 90mm;
    height: 60mm;
    position: relative;
    page-break-after: always;
    background: white;
    margin: 0;

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
