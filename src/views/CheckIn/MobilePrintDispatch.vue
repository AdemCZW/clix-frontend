<script setup>
import { ref, computed, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import jsQR from "jsqr";
import { apiRequest } from "@/utils/api";

const route = useRoute();
const eventId = computed(() => String(route.query.event || ""));

// ===== 相機掃描 =====
const isScanning   = ref(false);
const videoElement = ref(null);
let stream      = null;
let animationId = null;
let canvas      = null;
let canvasCtx   = null;

const startScanning = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    isScanning.value = true;
    await new Promise((r) => setTimeout(r, 100));
    if (videoElement.value) {
      videoElement.value.srcObject = stream;
      await new Promise((r) => { videoElement.value.onloadedmetadata = () => { videoElement.value.play(); r(); }; });
      canvas    = document.createElement("canvas");
      canvasCtx = canvas.getContext("2d");
      tick();
    }
  } catch (err) {
    scanError.value = err.name === "NotAllowedError" ? "請允許相機權限" : (err.message || "無法啟動相機");
  }
};

const tick = () => {
  if (!isScanning.value || !videoElement.value || !canvas || !canvasCtx) return;
  if (videoElement.value.readyState === videoElement.value.HAVE_ENOUGH_DATA) {
    canvas.width  = videoElement.value.videoWidth;
    canvas.height = videoElement.value.videoHeight;
    canvasCtx.drawImage(videoElement.value, 0, 0, canvas.width, canvas.height);
    const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (code) { onScanSuccess(code.data); return; }
  }
  animationId = requestAnimationFrame(tick);
};

const stopScanning = () => {
  isScanning.value = false;
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (videoElement.value) videoElement.value.srcObject = null;
};

// ===== 狀態 =====
// phase: 'scan' | 'loading' | 'result' | 'sending' | 'sent' | 'error'
const phase           = ref("scan");
const scanError       = ref("");
const currentParticipant = ref(null); // raw API response participant object
const apiError        = ref("");
const sendingStation  = ref(null);
const sendError       = ref("");

const onScanSuccess = async (rawToken) => {
  stopScanning();
  phase.value = "loading";
  apiError.value = "";

  // 嘗試解析 JSON 格式（相容舊版 QR），否則直接當 token
  let token = rawToken;
  try {
    const parsed = JSON.parse(rawToken);
    if (parsed.token) token = parsed.token;
    else if (parsed.check_in_token) token = parsed.check_in_token;
  } catch { /* 純字串 token */ }

  try {
    const res = await apiRequest("/api/participants/checkin_by_token/", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => null);
      throw new Error(e?.detail || e?.message || `報到失敗 (${res.status})`);
    }
    const data = await res.json();
    currentParticipant.value = data.participant || data;
    phase.value = "result";
  } catch (err) {
    apiError.value = err.message;
    phase.value = "error";
  }
};

// ===== 傳送到站台 =====
const sendToStation = async (slot) => {
  if (!currentParticipant.value) return;
  sendingStation.value = slot;
  sendError.value = "";
  phase.value = "sending";

  const stationSession = `print-${eventId.value}-station-${slot}`;
  const wsBase = (import.meta.env.VITE_API_BASE_URL || window.location.origin)
    .replace(/^https/, "wss")
    .replace(/^http/, "ws");

  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsBase}/ws/print/${stationSession}/`);
      const timeout = setTimeout(() => { ws.close(); reject(new Error("連線超時（5秒）")); }, 5000);
      ws.onopen = () => {
        clearTimeout(timeout);
        ws.send(JSON.stringify({ type: "print", data: currentParticipant.value }));
        setTimeout(() => { ws.close(); resolve(); }, 400);
      };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error(`無法連接站台 ${slot}`)); };
    });
    phase.value = "sent";
  } catch (err) {
    sendError.value = err.message;
    phase.value = "error";
  }
};

// 繼續掃描
const reset = () => {
  currentParticipant.value = null;
  sendingStation.value = null;
  apiError.value = "";
  sendError.value = "";
  phase.value = "scan";
  setTimeout(() => startScanning(), 300);
};

onUnmounted(() => stopScanning());
</script>

<template>
  <div class="dispatch-view">

    <!-- ===== Header ===== -->
    <div class="dispatch-header">
      <h1 class="dispatch-title">掃描 & 選擇列印站</h1>
      <div class="event-badge" v-if="eventId">活動 #{{ eventId }}</div>
    </div>

    <!-- ===== 掃描畫面 ===== -->
    <div class="phase-scan" v-if="phase === 'scan'">
      <div class="scan-start" v-if="!isScanning">
        <div class="scan-icon">📷</div>
        <p class="scan-desc">掃描參與者識別碼</p>
        <p class="scan-error" v-if="scanError">{{ scanError }}</p>
        <button class="btn-start" @click="startScanning">啟動掃描器</button>
      </div>

      <div class="camera-box" v-else>
        <video ref="videoElement" class="camera-feed" autoplay playsinline muted></video>
        <div class="scan-overlay">
          <div class="scan-frame"></div>
        </div>
        <p class="scan-hint">將 QR Code 對準掃描框</p>
        <button class="btn-stop" @click="stopScanning">停止</button>
      </div>
    </div>

    <!-- ===== 載入中 ===== -->
    <div class="phase-loading" v-else-if="phase === 'loading'">
      <div class="spinner"></div>
      <p>驗證中...</p>
    </div>

    <!-- ===== 報到成功 → 選站台 ===== -->
    <div class="phase-result" v-else-if="phase === 'result'">
      <div class="check-badge">✓</div>
      <h2 class="result-title">報到成功</h2>

      <div class="participant-card">
        <div class="p-row">
          <span class="p-label">姓名</span>
          <span class="p-value name">{{ currentParticipant.name }}</span>
        </div>
        <div class="p-row">
          <span class="p-label">單位</span>
          <span class="p-value">{{ currentParticipant.company }}</span>
        </div>
        <div class="p-row" v-if="currentParticipant.title">
          <span class="p-label">職稱</span>
          <span class="p-value">{{ currentParticipant.title }}</span>
        </div>
        <div class="p-row">
          <span class="p-label">類型</span>
          <span class="p-value">{{ currentParticipant.type }}</span>
        </div>
      </div>

      <p class="station-prompt">選擇列印站台：</p>
      <div class="station-buttons">
        <button
          v-for="s in [1, 2, 3]"
          :key="s"
          class="btn-station"
          @click="sendToStation(s)"
        >
          <span class="station-icon">🖨️</span>
          <span class="station-label">站台 {{ s }}</span>
        </button>
      </div>

      <button class="btn-rescan" @click="reset">↩ 重新掃描</button>
    </div>

    <!-- ===== 傳送中 ===== -->
    <div class="phase-sending" v-else-if="phase === 'sending'">
      <div class="spinner"></div>
      <p>傳送到站台 {{ sendingStation }}...</p>
    </div>

    <!-- ===== 傳送成功 ===== -->
    <div class="phase-sent" v-else-if="phase === 'sent'">
      <div class="sent-icon">✓</div>
      <h2>已傳送至站台 {{ sendingStation }}</h2>
      <p class="sent-name">{{ currentParticipant?.name }} — 識別證列印中</p>
      <button class="btn-next" @click="reset">繼續掃描下一位</button>
    </div>

    <!-- ===== 錯誤 ===== -->
    <div class="phase-error" v-else-if="phase === 'error'">
      <div class="error-icon">✕</div>
      <h2>發生錯誤</h2>
      <p class="error-msg">{{ apiError || sendError }}</p>
      <button class="btn-retry" @click="reset">重試</button>
    </div>

  </div>
</template>

<style scoped>
.dispatch-view {
  min-height: 100vh;
  background: #0f172a;
  color: white;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.dispatch-header {
  padding: 20px 24px 16px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dispatch-title {
  font-size: 1.2rem;
  font-weight: 800;
  margin: 0;
}
.event-badge {
  font-size: 0.8rem;
  background: #334155;
  color: #94a3b8;
  padding: 4px 12px;
  border-radius: 20px;
}

/* 各 phase 共用容器 */
.phase-scan,
.phase-loading,
.phase-result,
.phase-sending,
.phase-sent,
.phase-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
}

/* 掃描起始畫面 */
.scan-icon { font-size: 4rem; margin-bottom: 16px; }
.scan-desc { color: #94a3b8; font-size: 1rem; margin-bottom: 8px; }
.scan-error { color: #f87171; font-size: 0.9rem; margin-bottom: 12px; }
.btn-start {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white; border: none; padding: 14px 40px;
  border-radius: 12px; font-size: 1rem; font-weight: 700;
  cursor: pointer; margin-top: 8px;
}
.btn-start:hover { opacity: 0.9; transform: translateY(-1px); }

/* 相機畫面 */
.camera-box {
  width: 100%;
  max-width: 480px;
  position: relative;
  text-align: center;
}
.camera-feed {
  width: 100%;
  border-radius: 16px;
  background: #000;
  max-height: 60vh;
  object-fit: cover;
  display: block;
}
.scan-overlay {
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translate(-50%, -20%);
  width: 220px;
  height: 220px;
  pointer-events: none;
}
.scan-frame {
  width: 100%;
  height: 100%;
  border: 3px solid #3b82f6;
  border-radius: 16px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  animation: pulse-frame 2s ease-in-out infinite;
}
@keyframes pulse-frame {
  0%, 100% { border-color: #3b82f6; }
  50% { border-color: #60a5fa; }
}
.scan-hint { color: #cbd5e1; margin: 16px 0 12px; }
.btn-stop {
  background: #ef4444; color: white; border: none;
  padding: 10px 28px; border-radius: 8px; font-weight: 600; cursor: pointer;
}

/* 載入/傳送 spinner */
.spinner {
  width: 48px; height: 48px;
  border: 4px solid #334155;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 20px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* 報到結果 */
.check-badge {
  width: 80px; height: 80px; border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  font-size: 2.5rem; font-weight: 900; color: white;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3);
}
.result-title { font-size: 1.6rem; font-weight: 800; margin: 0 0 20px; }

.participant-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 16px;
  padding: 20px 24px;
  width: 100%;
  max-width: 380px;
  margin-bottom: 24px;
  text-align: left;
}
.p-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #334155;
}
.p-row:last-child { border-bottom: none; }
.p-label { font-size: 0.85rem; color: #64748b; font-weight: 600; }
.p-value { font-size: 0.95rem; color: #e2e8f0; font-weight: 500; }
.p-value.name { font-size: 1.1rem; font-weight: 800; color: white; }

/* 站台選擇 */
.station-prompt {
  font-size: 0.95rem;
  color: #94a3b8;
  margin-bottom: 16px;
  font-weight: 600;
}
.station-buttons {
  display: flex;
  gap: 16px;
  margin-bottom: 28px;
}
.btn-station {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 28px;
  border-radius: 16px;
  background: #1e293b;
  border: 2px solid #334155;
  color: white;
  cursor: pointer;
  font-weight: 700;
  transition: all 0.2s;
  min-width: 90px;
}
.btn-station:hover {
  border-color: #3b82f6;
  background: #1e3a5f;
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.2);
}
.btn-station:active { transform: translateY(0); }
.station-icon { font-size: 2rem; }
.station-label { font-size: 0.9rem; }
.btn-rescan {
  background: transparent; color: #64748b;
  border: 1px solid #334155; padding: 10px 24px;
  border-radius: 8px; cursor: pointer; font-size: 0.9rem;
  transition: all 0.2s;
}
.btn-rescan:hover { color: #94a3b8; border-color: #475569; }

/* 傳送成功 */
.sent-icon {
  width: 80px; height: 80px; border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  font-size: 2.5rem; font-weight: 900; color: white;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
}
.sent-name { color: #94a3b8; font-size: 0.95rem; margin: 8px 0 28px; }
.btn-next {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white; border: none; padding: 14px 36px;
  border-radius: 12px; font-size: 1rem; font-weight: 700;
  cursor: pointer;
}
.btn-next:hover { opacity: 0.9; transform: translateY(-1px); }

/* 錯誤 */
.error-icon {
  width: 80px; height: 80px; border-radius: 50%;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  font-size: 2.5rem; font-weight: 900; color: white;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
}
.error-msg { color: #f87171; font-size: 0.95rem; margin: 8px 0 24px; line-height: 1.6; }
.btn-retry {
  background: #ef4444; color: white; border: none;
  padding: 12px 32px; border-radius: 10px; font-weight: 700;
  font-size: 0.95rem; cursor: pointer;
}
.btn-retry:hover { background: #dc2626; }

/* RWD */
@media (max-width: 480px) {
  .station-buttons { flex-direction: row; justify-content: center; }
  .btn-station { padding: 16px 20px; min-width: 80px; }
}
</style>
