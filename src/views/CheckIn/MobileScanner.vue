<template>
  <div class="mobile-scanner-view">
    <div class="scanner-header">
      <h1 class="title">現場報到掃描器</h1>
      <div class="event-info">
        <span class="event-name">{{ eventsStore.currentEvent?.name || '現場報到' }}</span>
        <span class="event-date">{{ eventsStore.currentEvent?.date || '' }}</span>
      </div>
    </div>

    <div class="scanner-container">
      <div v-if="!isScanning" class="start-screen">
        <div class="camera-icon">📷</div>
        <h2>準備開始掃描</h2>
        <p>點擊下方按鈕啟動相機</p>
        <div class="help-tips">
          <p class="tip-item">💡 請使用 Chrome 或 Safari 瀏覽器</p>
          <p class="tip-item">🔒 首次使用需允許相機權限</p>
          <p class="tip-item">📱 建議使用手機後置鏡頭</p>
        </div>
        <button class="btn-start-scan" @click="startScanning">
          <span class="icon">📱</span>
          啟動掃描器
        </button>
        <button class="btn-test-camera" @click="testCamera">🔍 測試相機權限</button>
      </div>

      <div v-else class="camera-view">
        <video ref="videoElement" class="camera-preview" autoplay playsinline muted></video>
        <div class="scan-overlay">
          <div class="scan-box"></div>
        </div>
        <p class="scan-hint">請將 QR Code 對準掃描框</p>
        <button class="btn-stop-scan" @click="stopScanning">停止掃描</button>
      </div>
    </div>

    <!-- 報到成功提示 -->
    <Transition name="result">
      <div v-if="showResult" class="result-overlay" @click="closeResult">
        <div class="result-card" :class="resultType" @click.stop>
          <div class="result-icon">
            {{ resultType === "success" ? "✓" : "✕" }}
          </div>
          <h2 class="result-title">
            {{ resultType === "success" ? "報到成功" : "報到失敗" }}
          </h2>

          <!-- 成功：顯示人員資訊 + 列印站台選擇 -->
          <template v-if="resultType === 'success' && scannedData">
            <div class="participant-info">
              <div class="info-row">
                <span class="label">姓名</span>
                <span class="value">{{ scannedData.name }}</span>
              </div>
              <div class="info-row">
                <span class="label">公司</span>
                <span class="value">{{ scannedData.company }}</span>
              </div>
              <div class="info-row" v-if="scannedData.title">
                <span class="label">職稱</span>
                <span class="value">{{ scannedData.title }}</span>
              </div>
              <div class="info-row">
                <span class="label">報到時間</span>
                <span class="value">{{ scannedData.checkinTime }}</span>
              </div>
            </div>

            <!-- 列印站台 -->
            <div v-if="sendPhase === 'idle'" class="station-section">
              <p class="station-prompt">選擇列印站台：</p>
              <div class="station-buttons">
                <button v-for="s in [1, 2, 3]" :key="s" class="btn-station" @click="sendToStation(s)">
                  <span class="station-icon">🖨️</span>
                  <span>站台 {{ s }}</span>
                </button>
              </div>
            </div>
            <div v-else-if="sendPhase === 'sending'" class="send-status">
              傳送到站台 {{ sendingStation }}...
            </div>
            <div v-else-if="sendPhase === 'sent'" class="send-status success-text">
              ✓ 已傳送至站台 {{ sendingStation }}，識別證列印中
            </div>
            <div v-else-if="sendPhase === 'error'" class="send-status error-text">
              {{ sendError }}
            </div>
          </template>

          <!-- 失敗：顯示錯誤訊息 -->
          <div v-else class="error-message">
            {{ errorMessage }}
          </div>

          <button class="btn-continue" @click="closeResult">繼續掃描</button>
        </div>
      </div>
    </Transition>

    <!-- 統計資訊 -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-label">今日報到</span>
        <span class="stat-value">{{ todayCheckins }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">累計報到</span>
        <span class="stat-value">{{ totalCheckins }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from "vue";
import jsQR from "jsqr";
import { apiRequest } from "@/utils/api";
import { useEventsStore } from "@/stores/events";

const eventsStore = useEventsStore();
const isScanning = ref(false);
const videoElement = ref(null);
const showResult = ref(false);
const resultType = ref("success"); // 'success' | 'error'
const scannedData = ref(null);       // 顯示用
const currentParticipant = ref(null); // 原始 API 資料（傳送給站台用）
const errorMessage = ref("");
const todayCheckins = ref(0);
const totalCheckins = ref(0);
const sendingStation = ref(null);
const sendPhase = ref("idle"); // 'idle' | 'sending' | 'sent' | 'error'
const sendError = ref("");

let stream = null;
let animationId = null;
let canvas = null;
let canvasContext = null;

const startScanning = async () => {
  try {
    // 檢查是否支援相機 API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("您的瀏覽器不支援相機功能，請使用 Chrome 或 Safari 開啟");
    }

    // 請求相機權限並取得串流
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    console.log("相機串流取得成功", stream);

    // 先設定為 scanning 狀態以顯示 video 元素
    isScanning.value = true;

    // 等待下一個 tick 確保 DOM 已更新
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 將串流綁定到 video 元素
    if (videoElement.value) {
      console.log("綁定串流到 video 元素", videoElement.value);
      videoElement.value.srcObject = stream;

      // 等待 video 載入
      await new Promise((resolve) => {
        videoElement.value.onloadedmetadata = () => {
          console.log("Video metadata 已載入");
          videoElement.value.play();
          resolve();
        };
      });

      // 建立 canvas 用於讀取影格
      canvas = document.createElement("canvas");
      canvasContext = canvas.getContext("2d");

      console.log("開始掃描");
      // 開始掃描
      tick();
    } else {
      console.error("videoElement.value 是 null");
      throw new Error("無法找到 video 元素");
    }
  } catch (error) {
    console.error("無法啟動相機:", error);

    let errorMsg = "無法啟動相機";
    let helpText = "";

    if (error.name === "NotAllowedError") {
      errorMsg = "相機權限被拒絕";
      helpText = "請在手機設定中開啟瀏覽器的相機權限，或點擊網址列的鎖頭圖示允許相機存取";
    } else if (error.name === "NotFoundError") {
      errorMsg = "找不到相機設備";
      helpText = "請確認您的裝置有相機功能";
    } else if (error.name === "NotReadableError") {
      errorMsg = "相機正被其他應用程式使用";
      helpText = "請關閉其他使用相機的 App 後重試";
    } else if (error.name === "SecurityError") {
      errorMsg = "安全性錯誤";
      helpText = "請確認使用 HTTPS 連線開啟此頁面";
    } else if (error.message) {
      errorMsg = error.message;
      helpText = "建議使用 Chrome 或 Safari 瀏覽器開啟\n\n詳細錯誤：" + error.toString();
    }

    errorMessage.value = helpText ? `${errorMsg}\n\n${helpText}` : errorMsg;
    resultType.value = "error";
    showResult.value = true;
  }
};

const tick = () => {
  if (!isScanning.value || !videoElement.value || !canvas || !canvasContext) {
    return;
  }

  if (videoElement.value.readyState === videoElement.value.HAVE_ENOUGH_DATA) {
    canvas.width = videoElement.value.videoWidth;
    canvas.height = videoElement.value.videoHeight;
    canvasContext.drawImage(videoElement.value, 0, 0, canvas.width, canvas.height);

    const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code) {
      onScanSuccess(code.data);
      return; // 找到 QR code，停止掃描
    }
  }

  animationId = requestAnimationFrame(tick);
};

const onScanSuccess = (decodedText) => {
  // 停止掃描後呼叫後端驗證（check_in_token 是純字串，不需 JSON.parse）
  stopScanning();
  validateCheckin(decodedText.trim());
};

const stopScanning = () => {
  isScanning.value = false;

  // 停止動畫循環
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // 停止視訊串流
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  // 清除 video 元素
  if (videoElement.value) {
    videoElement.value.srcObject = null;
  }
};

const validateCheckin = async (token) => {
  try {
    const res = await apiRequest("/api/participants/checkin_by_token/", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    const data = await res.json();

    if (res.ok) {
      // API 可能回傳 { participant: {...} } 或直接 {...}
      const p = data.participant || data;
      currentParticipant.value = p;
      scannedData.value = {
        name: p.name || "",
        company: p.company || "",
        title: p.title || "",
        checkinTime: new Date().toLocaleString("zh-TW", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      resultType.value = "success";
      sendPhase.value = "idle";
      todayCheckins.value++;
      totalCheckins.value++;
    } else {
      errorMessage.value = data.detail || data.error || "報到失敗，請確認 QR Code 是否正確";
      resultType.value = "error";
    }
  } catch {
    errorMessage.value = "網路錯誤，請檢查連線後重試";
    resultType.value = "error";
  }

  showResult.value = true;
};

const sendToStation = async (slot) => {
  if (!currentParticipant.value) return;
  sendingStation.value = slot;
  sendPhase.value = "sending";
  sendError.value = "";

  const eid = eventsStore.currentEvent?.id || "";
  const stationSession = `print-${eid}-station-${slot}`;
  const wsBase = (import.meta.env.VITE_API_BASE_URL || window.location.origin)
    .replace(/\/$/, "")
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
    sendPhase.value = "sent";
  } catch (err) {
    sendError.value = err.message;
    sendPhase.value = "error";
  }
};

const closeResult = () => {
  showResult.value = false;
  scannedData.value = null;
  errorMessage.value = "";

  // 繼續掃描
  setTimeout(() => {
    startScanning();
  }, 300);
};

const testCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");

    stream.getTracks().forEach((track) => track.stop());

    errorMessage.value = `✅ 相機權限正常！\n\n找到 ${videoDevices.length} 個相機設備\n\n${videoDevices.map((d, i) => `相機 ${i + 1}: ${d.label || "未命名"}`).join("\n")}\n\n請點擊「啟動掃描器」開始使用`;
    resultType.value = "success";
    showResult.value = true;
  } catch (error) {
    errorMessage.value = `❌ 相機測試失敗\n\n錯誤類型: ${error.name}\n錯誤訊息: ${error.message}\n\n請確認：\n1. 已允許相機權限\n2. 使用 Chrome 或 Safari\n3. 相機未被其他 App 占用`;
    resultType.value = "error";
    showResult.value = true;
  }
};

onUnmounted(() => {
  stopScanning();
});
</script>

<style scoped>
.mobile-scanner-view {
  min-height: 100vh;
  background: #0f172a;
  color: white;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.scanner-header {
  padding: 20px;
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  text-align: center;
}

.title {
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0 0 12px 0;
}

.event-info {
  display: flex;
  justify-content: center;
  gap: 16px;
  font-size: 0.9rem;
  color: #94a3b8;
}

.event-name {
  font-weight: 600;
}

.scanner-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

/* 開始畫面 */
.start-screen {
  text-align: center;
  max-width: 400px;
}

.camera-icon {
  font-size: 5rem;
  margin-bottom: 24px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

.start-screen h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 12px 0;
}

.start-screen p {
  font-size: 1rem;
  color: #94a3b8;
  margin: 0 0 32px 0;
}

.help-tips {
  background: rgba(59, 130, 246, 0.08);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 32px;
  text-align: left;
}

.tip-item {
  font-size: 0.9rem;
  color: #475569;
  margin: 8px 0 !important;
  line-height: 1.6;
}

.btn-start-scan {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  padding: 16px 40px;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
  transition: all 0.3s ease;
  margin-bottom: 12px;
}

.btn-start-scan:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(59, 130, 246, 0.5);
}

.btn-start-scan .icon {
  font-size: 1.5rem;
}

.btn-test-camera {
  background: transparent;
  color: #64748b;
  border: 2px solid #e2e8f0;
  padding: 12px 32px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-test-camera:hover {
  border-color: #cbd5e1;
  color: #475569;
  background: rgba(148, 163, 184, 0.05);
}

/* 相機視圖 */
.camera-view {
  position: relative;
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
  text-align: center;
}

.camera-preview {
  display: block;
  width: 100%;
  max-height: 70vh;
  border-radius: 16px;
  background: #000;
  object-fit: cover;
}

.scan-overlay {
  position: absolute;
  top: 30%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 250px;
  height: 250px;
  pointer-events: none;
  z-index: 10;
}

.scan-box {
  width: 100%;
  height: 100%;
  border: 3px solid #3b82f6;
  border-radius: 16px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    border-color: #3b82f6;
    box-shadow:
      0 0 0 9999px rgba(0, 0, 0, 0.5),
      0 0 20px rgba(59, 130, 246, 0.5);
  }
  50% {
    border-color: #60a5fa;
    box-shadow:
      0 0 0 9999px rgba(0, 0, 0, 0.5),
      0 0 30px rgba(96, 165, 250, 0.8);
  }
}

.scan-hint {
  font-size: 1rem;
  color: #cbd5e1;
  margin: 20px 0 16px 0;
}

.btn-stop-scan {
  background: #ef4444;
  color: white;
  border: none;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-stop-scan:hover {
  background: #dc2626;
  transform: translateY(-1px);
}

/* 報到結果彈窗 */
.result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.result-card {
  background: white;
  border-radius: 20px;
  padding: 40px 32px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  color: #0f172a;
}

.result-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  font-weight: 800;
}

.result-card.success .result-icon {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.result-card.error .result-icon {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.result-title {
  font-size: 1.75rem;
  font-weight: 800;
  margin: 0 0 24px 0;
}

.participant-info {
  background: #f8fafc;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  text-align: left;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #e2e8f0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  font-size: 0.9rem;
  color: #64748b;
  font-weight: 600;
}

.info-row .value {
  font-size: 0.95rem;
  color: #0f172a;
  font-weight: 700;
}

.error-message {
  color: #ef4444;
  font-size: 1rem;
  margin-bottom: 24px;
  font-weight: 600;
  white-space: pre-line;
  line-height: 1.6;
}

.station-section { width: 100%; margin-bottom: 16px; }
.station-prompt { font-size: 0.9rem; color: #64748b; font-weight: 600; margin-bottom: 12px; }
.station-buttons { display: flex; gap: 12px; justify-content: center; }
.btn-station {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 16px 20px; border-radius: 12px;
  background: #f1f5f9; border: 2px solid #e2e8f0;
  color: #0f172a; cursor: pointer; font-weight: 700; font-size: 0.85rem;
  transition: all 0.2s; min-width: 80px;
}
.btn-station:hover { border-color: #3b82f6; background: #eff6ff; transform: translateY(-2px); }
.station-icon { font-size: 1.6rem; }
.send-status { font-size: 0.95rem; color: #475569; margin-bottom: 12px; font-weight: 600; }
.success-text { color: #059669; }
.error-text { color: #ef4444; }

.btn-continue {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  padding: 14px 40px;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.btn-continue:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
}

/* 統計欄 */
.stats-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: #1e293b;
}

.stat-item {
  background: #0f172a;
  padding: 16px;
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 0.85rem;
  color: #94a3b8;
  margin-bottom: 6px;
  font-weight: 600;
}

.stat-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 800;
  color: #3b82f6;
}

/* 動畫 */
.result-enter-active,
.result-leave-active {
  transition: all 0.3s ease;
}

.result-enter-from,
.result-leave-to {
  opacity: 0;
}

.result-enter-from .result-card,
.result-leave-to .result-card {
  transform: scale(0.8) translateY(40px);
}

/* 響應式 */
@media (max-width: 768px) {
  .scanner-header {
    padding: 16px;
  }

  .title {
    font-size: 1.25rem;
  }

  .event-info {
    flex-direction: column;
    gap: 8px;
  }

  .camera-frame {
    border-radius: 12px;
  }

  .result-card {
    padding: 32px 24px;
  }
}
</style>
