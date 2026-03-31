<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import vPrint from "vue3-print-nb";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import QRCodeLib from "qrcode";
import jsQR from "jsqr";
import PageLoader from "@/components/shared/PageLoader.vue";

const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();

const logoUrl = ref("");
const logoFile = ref<File | null>(null);
function handleLogoUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  logoFile.value = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    logoUrl.value = (ev.target as FileReader).result as string;
  };
  reader.readAsDataURL(file);
}

// 使用 store 的參與者數據
const allParticipants = computed(() => participantsStore.participants);

const searchQuery = ref("");
const selectedIds = ref<number[]>([]);
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
interface BadgeElement {
  id: string;
  key: string;
  label: string;
  x: number;
  y: number;
  style: { fontSize: number; fontWeight: string; color: string };
}

const dragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

function startDrag(el: BadgeElement, evt: MouseEvent) {
  activeElement.value = el;
  dragging.value = true;
  dragOffset.value = {
    x: evt.clientX - el.x,
    y: evt.clientY - el.y,
  };
}
function onDrag(evt: MouseEvent) {
  if (!dragging.value || !activeElement.value) return;
  activeElement.value.x = evt.clientX - dragOffset.value.x;
  activeElement.value.y = evt.clientY - dragOffset.value.y;
}
function stopDrag() {
  dragging.value = false;
}

const activeElement = ref<BadgeElement | null>(null);

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
const templateElements = ref<BadgeElement[]>(_savedTemplate?.length ? _savedTemplate : defaultElements);

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
      await participantsStore.fetchParticipants({ event: String(newEvent.id) });
    } else {
      participantsStore.clear();
    }
  },
  { immediate: true }
);

const toggleSelection = (id: number) => {
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
const qrDataUrls = ref<Record<string, string>>({});
async function ensureQr(token: string) {
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

// ===== QR 掃描 → 報到 → 選台列印 =====
const scanModalOpen = ref(false);
const scanVideo = ref<HTMLVideoElement | null>(null);
const scanCanvas = ref<HTMLCanvasElement | null>(null);
const scanStream = ref<MediaStream | null>(null);
// phase: 'scanning' | 'loading' | 'checkedin' | 'sending' | 'sent' | 'error'
const scanPhase = ref("scanning");
const scannedParticipant = ref<Record<string, unknown> | null>(null); // raw API response
const scanError = ref("");
const sendingStation = ref<number | null>(null);
let scanAnimFrame: number | null = null;

async function openScanModal() {
  scanPhase.value = "scanning";
  scannedParticipant.value = null;
  scanError.value = "";
  scanModalOpen.value = true;
  await new Promise<void>((r) => setTimeout(r, 80));
  try {
    scanStream.value = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    scanVideo.value!.srcObject = scanStream.value;
    scanVideo.value!.play();
    scanFrame();
  } catch {
    scanError.value = "無法開啟相機，請確認相機權限";
    scanPhase.value = "error";
  }
}

function scanFrame() {
  const video = scanVideo.value;
  const canvas = scanCanvas.value;
  if (!video || !canvas || !scanModalOpen.value) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      handleScannedToken(code.data);
      return;
    }
  }
  scanAnimFrame = requestAnimationFrame(scanFrame);
}

async function handleScannedToken(rawToken: string) {
  stopScanCamera();
  scanPhase.value = "loading";

  // 解析 token（相容 JSON 格式或純字串）
  let token = rawToken;
  try {
    const parsed = JSON.parse(rawToken);
    if (parsed.token) token = parsed.token;
    else if (parsed.check_in_token) token = parsed.check_in_token;
  } catch { /* 純字串 */ }

  try {
    const { apiRequest } = await import("@/utils/api");
    const res = await apiRequest("/api/participants/checkin_by_token/", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => null);
      throw new Error(e?.detail || e?.message || `報到失敗 (${res.status})`);
    }
    const data = await res.json();
    const p = data.participant || data;
    scannedParticipant.value = p;

    // 同步加入本地選取清單（用 checkInToken 或 check_in_token 比對）
    const matched = allParticipants.value.find(
      (ap) => ap.checkInToken === (p.check_in_token || p.checkInToken),
    );
    if (matched && !selectedIds.value.includes(matched.id)) {
      selectedIds.value.push(matched.id);
    }

    scanPhase.value = "checkedin";
  } catch (err: unknown) {
    scanError.value = (err as Error).message || "報到失敗，請重試";
    scanPhase.value = "error";
  }
}

async function sendToStation(slot: number) {
  if (!scannedParticipant.value) return;
  sendingStation.value = slot;
  scanPhase.value = "sending";

  const eid = eventsStore.currentEvent?.id;
  const stationSession = `print-${eid}-station-${slot}`;
  const wsBase = (import.meta.env.VITE_API_BASE_URL || window.location.origin)
    .replace(/\/$/, "")
    .replace(/^https/, "wss")
    .replace(/^http/, "ws");
  const participantSnapshot = { ...(scannedParticipant.value as Record<string, unknown>) };

  try {
    await new Promise<void>((resolve, reject) => {
      const accessToken = localStorage.getItem("access_token") || "";
      const tokenParam = accessToken ? `?token=${accessToken}` : "";
      const ws = new WebSocket(`${wsBase}/ws/print/${stationSession}/${tokenParam}`);

      let settled = false;
      let connectTimeout: ReturnType<typeof setTimeout> | null = null;
      let ackTimeout: ReturnType<typeof setTimeout> | null = null;
      const settle = (ok: boolean, err?: Error) => {
        if (settled) return;
        settled = true;
        if (connectTimeout) clearTimeout(connectTimeout);
        if (ackTimeout) clearTimeout(ackTimeout);
        try { ws.close(); } catch { /* ignore */ }
        ok ? resolve() : reject(err);
      };

      connectTimeout = setTimeout(() => settle(false, new Error("連線超時（5秒）")), 5000);

      ws.onopen = () => {
        if (connectTimeout) clearTimeout(connectTimeout);
        ws.send(JSON.stringify({ type: "print", data: participantSnapshot }));
        ackTimeout = setTimeout(() => settle(true), 6000);
      };
      ws.onmessage = ({ data }) => {
        try {
          const msg = JSON.parse(data);
          if (["ack", "print_queued", "print_received", "ok"].includes(msg.type)) settle(true);
        } catch { /* ignore */ }
      };
      ws.onerror = () => settle(false, new Error("WebSocket 連線錯誤"));
      ws.onclose = () => settle(true); // 降級視為成功
    });
    scanPhase.value = "sent";
  } catch (err: unknown) {
    scanError.value = `傳送到站台 ${slot} 失敗：${(err as Error).message}`;
    scanPhase.value = "error";
  }
}

function stopScanCamera() {
  if (scanAnimFrame) { cancelAnimationFrame(scanAnimFrame); scanAnimFrame = null; }
  if (scanStream.value) {
    scanStream.value.getTracks().forEach((t) => t.stop());
    scanStream.value = null;
  }
}

function closeScanModal() {
  stopScanCamera();
  scanModalOpen.value = false;
  scanPhase.value = "scanning";
  scannedParticipant.value = null;
  scanError.value = "";
}

function scanAgain() {
  scannedParticipant.value = null;
  scanError.value = "";
  openScanModal();
}


// ===== 外部列印站台連線測試 =====
// stationTestStatus: 'idle' | 'testing' | 'online' | 'offline'
const stationTestStatus = ref<Record<number, string>>({ 1: "idle", 2: "idle", 3: "idle" });

async function testStation(slot: number) {
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
    await new Promise<void>((resolve, reject) => {
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

function openStation(slot: number) {
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          確認列印 ({{ selectedIds.length }})
        </button>
      </div>
    </div>

    <!-- 站台管理（可展開） -->
    <Transition name="slide-down">
      <div class="station-mgmt no-print" v-if="showStations && eventsStore.currentEvent">
        <div class="mgmt-left">
          <span class="mgmt-title">外部列印站台</span>
          <div class="station-btns">
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
        </div>
        <div class="mgmt-right" v-if="mobileQrDataUrl">
          <div class="qr-wrap">
            <img :src="mobileQrDataUrl" class="qr-img" alt="手機派送頁 QR" />
            <span class="qr-label">手機派送</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 主區塊：人員選擇 + 設計畫布 -->
    <div class="main-layout">
      <!-- 左側：人員選擇 -->
      <div class="tech-card selection-panel no-print">
        <h3 class="card-subtitle">人員選擇</h3>
        <div class="search-row">
          <input
            v-model="searchQuery"
            class="input-styled search-input"
            placeholder="搜尋姓名或單位..."
          />
          <button class="btn-scan" @click="openScanModal" title="掃描 QR 選人">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/>
              <rect x="3" y="16" width="5" height="5" rx="1"/>
              <path d="M16 16h5v5h-5z" fill="currentColor" stroke="none"/>
              <path d="M16 11h5M11 3v5M11 16v5M11 11h5"/>
            </svg>
          </button>
        </div>
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

    <!-- QR 掃描選人 Modal -->
    <div v-if="scanModalOpen" class="scan-overlay" @click.self="closeScanModal">
      <div class="scan-modal">
        <div class="scan-modal-header">
          <h3>{{ scanPhase === 'scanning' ? '掃描 QR 報到' : scanPhase === 'checkedin' ? '報到成功' : scanPhase === 'sent' ? '已送出列印' : scanPhase === 'error' ? '操作失敗' : '處理中...' }}</h3>
          <button class="btn-close-scan" @click="closeScanModal">✕</button>
        </div>
        <div class="scan-body">

          <!-- 掃描畫面 -->
          <template v-if="scanPhase === 'scanning'">
            <div class="video-wrap">
              <video ref="scanVideo" class="scan-video" playsinline muted></video>
              <canvas ref="scanCanvas" style="display:none"></canvas>
              <div class="scan-frame">
                <div class="corner tl"></div><div class="corner tr"></div>
                <div class="corner bl"></div><div class="corner br"></div>
              </div>
            </div>
            <p class="scan-hint">將 QR Code 對準框內，掃描後自動報到</p>
          </template>

          <!-- 報到中 -->
          <template v-else-if="scanPhase === 'loading'">
            <div class="scan-spinner-wrap">
              <div class="scan-spinner"></div>
              <p class="scan-hint">報到中...</p>
            </div>
          </template>

          <!-- 報到成功 → 選站台 -->
          <template v-else-if="scanPhase === 'checkedin'">
            <div class="scan-result success">
              <div class="result-icon">✓</div>
              <div class="result-name">{{ scannedParticipant?.name }}</div>
              <div class="result-msg">{{ scannedParticipant?.company || '' }}</div>
              <div class="result-tag">報到成功</div>
            </div>
            <p class="scan-hint" style="margin-top:4px">選擇列印站台</p>
            <div class="station-select-row">
              <button
                v-for="s in [1, 2, 3]"
                :key="s"
                class="btn-station-select"
                :class="{ active: stationTestStatus[s] === 'online' }"
                @click="sendToStation(s)"
              >
                🖨️ 站台 {{ s }}
                <span v-if="stationTestStatus[s] === 'online'" class="dot-online"></span>
              </button>
            </div>
            <div class="scan-result-actions">
              <button class="btn-scan-again" @click="scanAgain">再掃一張</button>
              <button class="btn-scan-done" @click="closeScanModal">完成</button>
            </div>
          </template>

          <!-- 傳送中 -->
          <template v-else-if="scanPhase === 'sending'">
            <div class="scan-spinner-wrap">
              <div class="scan-spinner"></div>
              <p class="scan-hint">傳送到站台 {{ sendingStation }}...</p>
            </div>
          </template>

          <!-- 傳送成功 -->
          <template v-else-if="scanPhase === 'sent'">
            <div class="scan-result success">
              <div class="result-icon">✓</div>
              <div class="result-name">{{ scannedParticipant?.name }}</div>
              <div class="result-tag">已傳送到站台 {{ sendingStation }}</div>
            </div>
            <div class="scan-result-actions">
              <button class="btn-scan-again" @click="scanAgain">再掃一張</button>
              <button class="btn-scan-done" @click="closeScanModal">完成</button>
            </div>
          </template>

          <!-- 錯誤 -->
          <template v-else-if="scanPhase === 'error'">
            <div class="scan-result error">
              <div class="result-icon">✕</div>
              <div class="result-name">{{ scanError }}</div>
            </div>
            <div class="scan-result-actions">
              <button class="btn-scan-again" @click="scanAgain">重新掃描</button>
              <button class="btn-scan-done" @click="closeScanModal">關閉</button>
            </div>
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
    .highlight { color: #6366f1; font-size: 1.1rem; }
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
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
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

  &:hover, &.active { border-color: #6366f1; color: #6366f1; background: #f5f3ff; }
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
  &:hover { background: #eef2ff; border-color: #6366f1; color: #4f46e5; }
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
  &:hover:not(:disabled) { border-color: #6366f1; color: #4f46e5; }
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
    &:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
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
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    border-color: #6366f1;
    color: white;
  }

  &:hover { color: #6366f1; }
  &:hover .toggle-icon { border-color: #6366f1; }
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
    background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
    border-color: #6366f1;

    .name { color: #6366f1; }
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
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
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
  &:hover { border-color: #6366f1; color: #4f46e5; background: #eef2ff; }
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

  &:hover { background: rgba(99, 102, 241, 0.05); border-color: #cbd5e1; }

  &.active {
    border: 2px dashed #6366f1;
    background: rgba(99, 102, 241, 0.08);

    .drag-handle {
      position: absolute;
      bottom: -6px;
      right: -6px;
      width: 12px;
      height: 12px;
      background: #6366f1;
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
      background: #6366f1;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(99, 102, 241, 0.4);
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
    &:focus { border-color: #6366f1; outline: none; }
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
.search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;

  .search-input {
    flex: 1;
    margin-bottom: 0;
  }
}

.btn-scan {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    border-color: #6366f1;
    background: #eef2ff;
    color: #6366f1;
  }
}

/* QR 掃描 Modal */
.scan-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.scan-modal {
  background: white;
  border-radius: 20px;
  width: 360px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

  .scan-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid #f1f5f9;

    h3 {
      font-size: 1rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }

    .btn-close-scan {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #64748b;
      cursor: pointer;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;

      &:hover { background: #fee2e2; border-color: #fca5a5; color: #ef4444; }
    }
  }

  .scan-body {
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
}

.video-wrap {
  position: relative;
  width: 280px;
  height: 280px;
  border-radius: 16px;
  overflow: hidden;
  background: #0f172a;

  .scan-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .scan-frame {
    position: absolute;
    inset: 20px;
    pointer-events: none;

    .corner {
      position: absolute;
      width: 24px;
      height: 24px;
      border-color: white;
      border-style: solid;
      border-width: 0;

      &.tl { top: 0; left: 0; border-top-width: 3px; border-left-width: 3px; border-radius: 4px 0 0 0; }
      &.tr { top: 0; right: 0; border-top-width: 3px; border-right-width: 3px; border-radius: 0 4px 0 0; }
      &.bl { bottom: 0; left: 0; border-bottom-width: 3px; border-left-width: 3px; border-radius: 0 0 0 4px; }
      &.br { bottom: 0; right: 0; border-bottom-width: 3px; border-right-width: 3px; border-radius: 0 0 4px 0; }
    }
  }
}

.scan-hint {
  font-size: 0.85rem;
  color: #64748b;
  margin: 0;
  text-align: center;
}

.scan-spinner-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 0;
}

.scan-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.scan-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px 24px;
  border-radius: 16px;
  width: 100%;

  .result-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    font-size: 1.5rem;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }

  .result-name {
    font-size: 1.15rem;
    font-weight: 700;
    color: #0f172a;
    text-align: center;
  }

  .result-msg {
    font-size: 0.85rem;
    color: #64748b;
  }

  .result-tag {
    font-size: 0.8rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 20px;
    margin-top: 4px;
  }

  &.success {
    background: #f0fdf4;
    .result-icon { background: #22c55e; color: white; }
    .result-tag { background: #dcfce7; color: #16a34a; }
  }

  &.error {
    background: #fef2f2;
    .result-icon { background: #ef4444; color: white; }
  }
}

.station-select-row {
  display: flex;
  gap: 8px;
  width: 100%;

  .btn-station-select {
    flex: 1;
    padding: 12px 8px;
    border-radius: 10px;
    border: 2px solid #e2e8f0;
    background: #f8fafc;
    color: #374151;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    position: relative;

    &:hover {
      border-color: #6366f1;
      background: #eef2ff;
      color: #4338ca;
    }

    &.active {
      border-color: #22c55e;
      background: #f0fdf4;
      color: #15803d;
    }

    .dot-online {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22c55e;
      flex-shrink: 0;
    }
  }
}

.scan-result-actions {
  display: flex;
  gap: 10px;
  width: 100%;

  button {
    flex: 1;
    padding: 12px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .btn-scan-again {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #475569;
    &:hover { background: #f1f5f9; }
  }

  .btn-scan-done {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    &:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4); }
  }
}

/* 列印專用區域 - 平時隱藏 */
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
