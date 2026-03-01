<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import QRCodeLib from "qrcode";

const route = useRoute();
const slot = computed(() => String(route.params.slot || "1"));
const eventId = computed(() => String(route.query.event || ""));

// QR Code 圖片生成
const qrDataUrls = ref({});
async function ensureQr(token) {
  if (!token || qrDataUrls.value[token]) return;
  qrDataUrls.value[token] = await QRCodeLib.toDataURL(token, { width: 80, margin: 1 });
}

// 預覽用：保留最後一筆列印資料（列印後不清空，方便確認）
const lastPrint = ref(null);

// 從 localStorage 讀取管理頁面儲存的版面設計
function loadTemplate() {
  try {
    const saved = localStorage.getItem("badge_template");
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

const templateElements = ref(loadTemplate() || [
  { id: "t1", key: "name",    x: 12, y: 80,  style: { fontSize: 26, fontWeight: "900", color: "#1e293b" } },
  { id: "t2", key: "company", x: 12, y: 116, style: { fontSize: 13, fontWeight: "400", color: "#64748b" } },
  { id: "t3", key: "code",    x: 248, y: 10, style: { fontSize: 12, fontWeight: "400", color: "#cbd5e1" } },
]);
const logoUrl = ref(localStorage.getItem("badge_logo") || "");

// ===== WebSocket =====
const wsStatus = ref("disconnected");
const wsCurrentPrint = ref(null);
const wsPrinting = ref(false);
const wsLog = ref([]);
let wsInstance = null;

const sessionId = computed(() =>
  eventId.value ? `print-${eventId.value}-station-${slot.value}` : null,
);

const wsStatusLabel = computed(() => ({
  disconnected: "未連線",
  connecting:   "連線中...",
  connected:    "已連線",
  error:        "連線錯誤",
}[wsStatus.value] || ""));

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
  wsInstance.onopen  = () => { wsStatus.value = "connected"; };
  wsInstance.onclose = () => { wsStatus.value = "disconnected"; wsInstance = null; };
  wsInstance.onerror = () => { wsStatus.value = "error"; };
  wsInstance.onmessage = async ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "print" && msg.data) await handleWsPrint(msg.data);
    } catch { /* ignore */ }
  };
}

function disconnectWebSocket() {
  wsInstance?.close();
  wsInstance = null;
  wsStatus.value = "disconnected";
}

function reconnect() {
  disconnectWebSocket();
  setTimeout(connectWebSocket, 500);
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
  lastPrint.value = p;
  wsCurrentPrint.value = p;
  wsLog.value.unshift({
    name: p.name,
    company: p.company,
    time: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }),
  });
  if (wsLog.value.length > 30) wsLog.value.pop();
  wsPrinting.value = true;
  await nextTick();
  window.print();
  setTimeout(() => {
    wsPrinting.value = false;
    wsCurrentPrint.value = null;
  }, 2000);
}

onMounted(() => connectWebSocket());
onUnmounted(() => disconnectWebSocket());
</script>

<template>
  <div class="station-root" :class="{ 'ws-printing-mode': wsPrinting }">

    <!-- ====== 螢幕顯示區（列印時隱藏）====== -->
    <div class="station-screen no-print">

      <!-- 頂部標題列 -->
      <div class="station-header">
        <div class="header-left">
          <div class="slot-badge">站台 {{ slot }}</div>
          <div class="session-id">{{ sessionId }}</div>
        </div>
        <div class="header-right">
          <span class="status-dot" :class="wsStatus"></span>
          <span class="status-text">{{ wsStatusLabel }}</span>
          <button class="btn-reconnect" @click="reconnect">重新連線</button>
        </div>
      </div>

      <!-- 主內容 -->
      <div class="station-body">

        <!-- 左側：等待中 / 列印紀錄 -->
        <div class="station-left">
          <div class="idle-screen" v-if="!wsLog.length">
            <div class="idle-icon">🖨️</div>
            <div class="idle-title">等待列印指令</div>
            <div class="idle-hint">手機掃描成功後，選擇此站台即可自動列印</div>
            <div class="idle-session">
              <span>Session：</span>
              <code>{{ sessionId }}</code>
            </div>
          </div>

          <div class="print-log" v-else>
            <div class="log-header">
              <span>列印紀錄</span>
              <span class="log-count">共 {{ wsLog.length }} 筆</span>
            </div>
            <div
              v-for="(item, i) in wsLog"
              :key="i"
              class="log-row"
              :class="{ newest: i === 0 }"
            >
              <span class="log-seq">{{ wsLog.length - i }}</span>
              <span class="log-name">{{ item.name }}</span>
              <span class="log-comp">{{ item.company }}</span>
              <span class="log-time">{{ item.time }}</span>
            </div>
          </div>
        </div>

        <!-- 右側：識別證預覽 -->
        <div class="station-preview">
          <div class="preview-label">{{ lastPrint ? '最後列印' : '版型預覽' }}</div>
          <div class="preview-badge-wrap">
            <div class="preview-badge">
              <img v-if="logoUrl" :src="logoUrl"
                style="position:absolute;left:12px;top:12px;height:36px;max-width:100px;z-index:2;" />
              <div
                v-for="el in templateElements"
                :key="el.id"
                class="preview-el"
                :style="{
                  position: 'absolute',
                  left: el.x + 'px',
                  top: el.y + 'px',
                  fontSize: el.style.fontSize + 'px',
                  fontWeight: el.style.fontWeight,
                  color: lastPrint ? el.style.color : '#94a3b8',
                  whiteSpace: 'nowrap',
                }"
              >
                <template v-if="el.key === 'name'">
                  {{ lastPrint ? lastPrint.name : '[姓名]' }}
                </template>
                <template v-else-if="el.key === 'company'">
                  {{ lastPrint ? lastPrint.company : '[單位]' }}
                </template>
                <template v-else-if="el.key === 'code'">
                  <img v-if="lastPrint && qrDataUrls[lastPrint.checkInToken]"
                    :src="qrDataUrls[lastPrint.checkInToken]" width="80" height="80" />
                  <div v-else style="width:80px;height:80px;background:#1e293b;border-radius:4px;border:1px solid #334155;"></div>
                </template>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ====== 列印專用區（只在 window.print() 時顯示）====== -->
    <div class="ws-print-area">
      <div v-if="wsCurrentPrint" class="print-badge">
        <img
          v-if="logoUrl"
          :src="logoUrl"
          style="position:absolute;left:12px;top:12px;height:36px;max-width:100px;z-index:2;"
        />
        <div
          v-for="el in templateElements"
          :key="el.id"
          class="print-el"
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
              width="80" height="80"
            />
          </template>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ===== 整體 ===== */
.station-root {
  min-height: 100vh;
  background: #0f172a;
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  display: flex;
  flex-direction: column;
}

/* ===== Header ===== */
.station-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 32px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.slot-badge {
  font-size: 2rem;
  font-weight: 900;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  padding: 8px 24px;
  border-radius: 12px;
  letter-spacing: 2px;
}

.session-id {
  font-size: 0.82rem;
  color: #64748b;
  font-family: monospace;
  background: #0f172a;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  transition: background 0.3s;
}
.status-dot.connected    { background: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.6); }
.status-dot.connecting   { background: #f59e0b; animation: blink 1s infinite; }
.status-dot.disconnected { background: #475569; }
.status-dot.error        { background: #ef4444; }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.status-text {
  font-size: 0.9rem;
  color: #94a3b8;
  font-weight: 500;
}

.btn-reconnect {
  padding: 8px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  background: transparent;
  color: #64748b;
  border: 1px solid #334155;
  transition: all 0.2s;
}
.btn-reconnect:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

/* ===== Body ===== */
.station-body {
  flex: 1;
  padding: 40px;
  display: flex;
  gap: 40px;
  align-items: flex-start;
  justify-content: center;
}

/* 左右分欄 */
.station-left {
  flex: 1;
  min-width: 0;
}

/* 右側預覽 */
.station-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 20px;
}

.preview-label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #475569;
}

.preview-badge-wrap {
  /* 放大 1.6 倍顯示，讓識別證在螢幕上看得清楚 */
  transform: scale(1.6);
  transform-origin: top center;
  margin-bottom: calc(60mm * 0.6);
}

.preview-badge {
  width: 90mm;
  height: 60mm;
  background: white;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  box-shadow: 0 0 0 2px #334155, 0 20px 60px rgba(0,0,0,0.5);
}

/* Idle */
.idle-screen {
  text-align: center;
  margin-top: 80px;
}
.idle-icon {
  font-size: 5rem;
  margin-bottom: 24px;
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-12px); }
}
.idle-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 12px;
}
.idle-hint {
  font-size: 1rem;
  color: #64748b;
  margin-bottom: 32px;
}
.idle-session {
  font-size: 0.85rem;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.idle-session code {
  background: #1e293b;
  border: 1px solid #334155;
  padding: 4px 12px;
  border-radius: 6px;
  font-family: monospace;
  color: #94a3b8;
}

/* Log */
.print-log {
  width: 100%;
  max-width: 700px;
}
.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #475569;
  padding-bottom: 12px;
  border-bottom: 1px solid #1e293b;
  margin-bottom: 12px;
}
.log-count {
  font-size: 0.8rem;
  background: #1e293b;
  padding: 3px 10px;
  border-radius: 20px;
  color: #64748b;
}
.log-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  margin-bottom: 6px;
  background: #1e293b;
  transition: all 0.3s;
}
.log-row.newest {
  background: linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%);
  border: 1px solid #3b82f6;
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.15);
}
.log-seq {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  flex-shrink: 0;
}
.log-row.newest .log-seq {
  background: #3b82f6;
  color: white;
}
.log-name {
  font-weight: 700;
  font-size: 1rem;
  color: #e2e8f0;
  flex: 1;
}
.log-comp {
  font-size: 0.85rem;
  color: #64748b;
  flex: 1;
}
.log-time {
  font-size: 0.82rem;
  color: #475569;
  font-family: monospace;
  white-space: nowrap;
}

/* ===== 列印區（平時隱藏）===== */
.ws-print-area {
  display: none;
}

/* ===== @media print ===== */
@media print {
  .station-root {
    background: white;
  }

  /* 正常狀態：不印任何東西（不該在這個狀態觸發 print） */
  .station-root:not(.ws-printing-mode) .no-print {
    display: none !important;
  }

  /* WS 列印模式：只顯示 badge */
  .station-root.ws-printing-mode .no-print {
    display: none !important;
  }
  .station-root.ws-printing-mode .ws-print-area {
    display: block !important;
  }

  .print-badge {
    width: 90mm;
    height: 60mm;
    position: relative;
    background: white;
    page-break-after: always;
    margin: 0;

    .print-el {
      position: absolute;
    }
  }

  @page {
    size: 90mm 60mm;
    margin: 0;
  }
}
</style>
