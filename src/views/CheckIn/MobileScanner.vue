<template>
  <div class="mobile-scanner-view">
    <div class="scanner-header">
      <h1 class="title">現場報到掃描器</h1>
      <div class="event-info">
        <span class="event-name">2026 科技創新論壇</span>
        <span class="event-date">2026/02/15</span>
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
      </div>

      <div v-else class="camera-view">
        <div id="qr-reader" class="camera-frame"></div>
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
          <div v-if="resultType === 'success' && scannedData" class="participant-info">
            <div class="info-row">
              <span class="label">姓名</span>
              <span class="value">{{ scannedData.name }}</span>
            </div>
            <div class="info-row">
              <span class="label">公司</span>
              <span class="value">{{ scannedData.company }}</span>
            </div>
            <div class="info-row">
              <span class="label">職稱</span>
              <span class="value">{{ scannedData.title }}</span>
            </div>
            <div class="info-row">
              <span class="label">報到時間</span>
              <span class="value">{{ scannedData.checkinTime }}</span>
            </div>
          </div>
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
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { Html5Qrcode } from "html5-qrcode";

const router = useRouter();
const isScanning = ref(false);
const videoElement = ref(null);
const showResult = ref(false);
const resultType = ref("success"); // 'success' | 'error'
const scannedData = ref(null);
const errorMessage = ref("");
const todayCheckins = ref(127);
const totalCheckins = ref(642);

let html5QrCode = null;

const startScanning = async () => {
  try {
    // 檢查是否支援相機 API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('您的瀏覽器不支援相機功能，請使用 Chrome 或 Safari 開啟');
    }

    // 先請求相機權限
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "environment" } 
    });
    
    // 權限獲取成功後立即停止預覽流，讓 html5-qrcode 接管
    stream.getTracks().forEach(track => track.stop());

    // 初始化 QR Code 掃描器
    html5QrCode = new Html5Qrcode("qr-reader");

    const config = {
      fps: 10, // 每秒掃描幀數
      qrbox: { width: 250, height: 250 }, // 掃描框大小
      aspectRatio: 1.0,
    };

    await html5QrCode.start(
      { facingMode: "environment" }, // 使用後置鏡頭
      config,
      onScanSuccess,
      onScanError,
    );

    isScanning.value = true;
  } catch (error) {
    console.error("無法啟動相機:", error);
    
    let errorMsg = "無法啟動相機";
    let helpText = "";
    
    if (error.name === 'NotAllowedError') {
      errorMsg = "相機權限被拒絕";
      helpText = "請在手機設定中開啟瀏覽器的相機權限，或點擊網址列的鎖頭圖示允許相機存取";
    } else if (error.name === 'NotFoundError') {
      errorMsg = "找不到相機設備";
      helpText = "請確認您的裝置有相機功能";
    } else if (error.name === 'NotReadableError') {
      errorMsg = "相機正被其他應用程式使用";
      helpText = "請關閉其他使用相機的 App 後重試";
    } else if (error.name === 'SecurityError') {
      errorMsg = "安全性錯誤";
      helpText = "請確認使用 HTTPS 連線開啟此頁面";
    } else if (error.message) {
      errorMsg = error.message;
      helpText = "建議使用 Chrome 或 Safari 瀏覽器開啟";
    }
    
    errorMessage.value = helpText ? `${errorMsg}\n\n${helpText}` : errorMsg;
    resultType.value = "error";
    showResult.value = true;
  }
};

const stopScanning = async () => {
  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (error) {
      console.error("停止掃描時發生錯誤:", error);
    }
  }
  isScanning.value = false;
};

const onScanSuccess = (decodedText, decodedResult) => {
  console.log("掃描成功:", decodedText);

  // 停止掃描
  stopScanning();

  // 解析 QR Code 內容
  try {
    const data = JSON.parse(decodedText);

    // 模擬 API 驗證報到
    validateCheckin(data);
  } catch (error) {
    // 如果不是 JSON 格式，直接顯示內容
    errorMessage.value = "無效的 QR Code 格式";
    resultType.value = "error";
    showResult.value = true;
  }
};

const onScanError = (errorMessage) => {
  // 掃描錯誤（正常情況，持續掃描中）
  // console.log('掃描中...', errorMessage);
};

const validateCheckin = async (qrData) => {
  // 這裡應該呼叫後端 API 驗證
  // 目前為模擬功能

  // 模擬 API 延遲
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 模擬驗證成功
  if (qrData.participantId) {
    scannedData.value = {
      name: qrData.name || "張小明",
      company: qrData.company || "文靜科技",
      title: qrData.title || "CTO",
      checkinTime: new Date().toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    resultType.value = "success";
    todayCheckins.value++;
    totalCheckins.value++;
  } else {
    errorMessage.value = "查無此參與者資料";
    resultType.value = "error";
  }

  showResult.value = true;
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
}

.btn-start-scan:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(59, 130, 246, 0.5);
}

.btn-start-scan .icon {
  font-size: 1.5rem;
}

/* 相機視圖 */
.camera-view {
  width: 100%;
  max-width: 500px;
  text-align: center;
}

.camera-frame {
  position: relative;
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
}

#qr-reader {
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 20px;
}

/* 覆蓋 html5-qrcode 預設樣式 */
#qr-reader video {
  border-radius: 16px;
}

#qr-reader__dashboard {
  display: none !important;
}

#qr-reader__scan_region {
  border-radius: 16px !important;
}

.scan-hint {
  font-size: 1rem;
  color: #cbd5e1;
  margin: 0 0 16px 0;
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
