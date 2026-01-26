<script setup>
import { reactive, ref, onMounted } from "vue";
// 引入 Quill 編輯器元件與樣式
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";

// 自動編號邏輯
const generateAutoId = () => {
  const now = new Date();
  const dateStr =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0");
  const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `EVT-${randomId}-${dateStr}`;
};

const form = reactive({
  bannerPreview: null,
  bgColor: "#3b82f6",
  date: "2026-01-23",
  time: "14:00",
  location: "台北國際會議中心 (TICC)",
  shortLink: "",
  // 修改：改為儲存 HTML 格式
  mainContent:
    "<h2>親愛的貴賓您好：</h2><p>感謝您對本次活動的關注。我們準備了豐富的議程與專業講師分享。</p><p><strong>【活動重點】</strong></p><ul><li>專家技術深度解析</li><li>產業創新案例分享</li></ul><p>期待您的蒞臨！</p>",
});

const isPreviewOpen = ref(false);
const previewMode = ref("desktop");
const showToast = ref(false);
const myQuill = ref(null); // 綁定編輯器實例

// 編輯器工具列配置
const editorOptions = {
  modules: {
    toolbar: [
      ["bold", "italic", "underline"],
      [{ header: [1, 2, 3, false] }],
      [{ color: [] }, { background: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link", "image", "clean"],
    ],
  },
  placeholder: "輸入詳細活動內容...",
  theme: "snow",
};

// 插入動態標籤函式
const insertTag = (tag) => {
  const quill = myQuill.value.getQuill();
  const range = quill.getSelection(true);
  if (range) {
    quill.insertText(range.index, tag);
    quill.setSelection(range.index + tag.length);
  }
};

onMounted(() => {
  form.shortLink = generateAutoId();
});

const onFileChange = (e, type) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (type === "banner") form.bannerPreview = event.target.result;
    };
    reader.readAsDataURL(file);
  }
};

const copyLink = () => {
  const fullLink = `https://reg.event/${form.shortLink}`;
  navigator.clipboard.writeText(fullLink).then(() => {
    showToast.value = true;
    setTimeout(() => {
      showToast.value = false;
    }, 2000);
  });
};
</script>

<template>
  <div class="registration-view">
    <Teleport to="body">
      <Transition name="slide-down">
        <div v-if="showToast" class="toast-box">
          <span class="icon">✅</span> 報名連結已複製成功
        </div>
      </Transition>
    </Teleport>

    <div class="page-header">
      <div class="title-group">
        <h2 class="title">1. 報名頁面視覺設定</h2>
        <span class="live-indicator">● 系統同步中 (LIVE PREVIEW)</span>
      </div>
      <div class="header-actions">
        <button class="btn-preview-action" @click="isPreviewOpen = true">
          <span class="pulse-ring"></span>
          <div class="btn-inner">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            點擊預覽頁面
          </div>
        </button>
      </div>
    </div>

    <div class="config-grid">
      <div class="left-column">
        <div class="tech-card visual-config">
          <h3 class="card-subtitle">視覺風格設定</h3>
          <div class="upload-wrapper">
            <div class="upload-field">
              <label>(1) 活動 Banner</label>
              <label
                class="drop-zone banner-zone"
                :style="{ backgroundImage: `url(${form.bannerPreview})` }"
              >
                <input
                  type="file"
                  @change="onFileChange($event, 'banner')"
                  hidden
                  accept="image/*"
                />
                <div v-if="!form.bannerPreview" class="placeholder">📸 點擊上傳主視覺圖</div>
              </label>
            </div>
            <div class="upload-field mt-20">
              <label>(2) 頁面背景顏色 (預覽將自動淡化 40%)</label>
              <div class="color-picker-wrapper">
                <input type="color" v-model="form.bgColor" class="color-input-styled" />
                <span class="color-code">{{ form.bgColor.toUpperCase() }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="tech-card content-card mt-24">
          <div class="card-header-flex">
            <h3 class="card-subtitle">活動詳細內容編輯</h3>
            <div class="tag-helper">
              <button class="btn-mini-tag" @click="insertTag('{name}')">+{name}</button>
              <button class="btn-mini-tag" @click="insertTag('{date}')">+{date}</button>
            </div>
          </div>
          <div class="quill-editor-wrapper">
            <QuillEditor
              ref="myQuill"
              v-model:content="form.mainContent"
              contentType="html"
              :options="editorOptions"
            />
          </div>
        </div>
      </div>

      <div class="info-column">
        <div class="tech-card data-card">
          <h3 class="card-subtitle">活動基本資訊</h3>
          <div class="row-flex">
            <div class="field">
              <label>日期</label>
              <input v-model="form.date" type="date" class="input-styled" />
            </div>
            <div class="field">
              <label>時間</label>
              <input v-model="form.time" type="time" class="input-styled" />
            </div>
          </div>
          <div class="field mt-16">
            <label>地點</label>
            <input
              v-model="form.location"
              type="text"
              placeholder="輸入活動場地名稱"
              class="input-styled"
            />
          </div>
        </div>

        <div class="tech-card link-card accent-blue">
          <h3 class="card-subtitle">產出報名連結</h3>
          <div class="link-input-group">
            <span class="url-prefix">reg.event/</span>
            <input v-model="form.shortLink" class="url-input" />
            <button class="btn-copy-link" @click="copyLink">複製</button>
          </div>
          <button class="btn-regen" @click="form.shortLink = generateAutoId()">🔄 重新編號</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="isPreviewOpen" class="modal-overlay" @click.self="isPreviewOpen = false">
          <div class="modal-card">
            <div class="modal-header">
              <div class="device-switcher">
                <button
                  :class="{ active: previewMode === 'mobile' }"
                  @click="previewMode = 'mobile'"
                >
                  📱 手機
                </button>
                <button
                  :class="{ active: previewMode === 'desktop' }"
                  @click="previewMode = 'desktop'"
                >
                  💻 電腦
                </button>
              </div>
              <button class="btn-close-circle" @click="isPreviewOpen = false">✕</button>
            </div>

            <div :class="['preview-viewport', previewMode]">
              <div class="preview-content-box" :style="{ backgroundColor: form.bgColor + '66' }">
                <div class="scroll-area">
                  <div
                    class="preview-banner"
                    :style="{
                      backgroundImage: `url(${form.bannerPreview || 'https://via.placeholder.com/1200x600?text=Banner'})`,
                    }"
                  ></div>
                  <div class="preview-text-content">
                    <span class="p-tag">UPCOMING EVENT</span>
                    <h1 class="p-title">您的活動名稱顯示區</h1>
                    <div class="p-badges">
                      <span>📅 {{ form.date }}</span>
                      <span>📍 {{ form.location }}</span>
                    </div>

                    <div class="p-main-body-render" v-html="form.mainContent"></div>

                    <div class="p-placeholder-block"></div>
                  </div>
                </div>

                <div class="preview-sticky-footer">
                  <div class="footer-flex">
                    <div class="footer-info">
                      <span class="f-title">立即報名參加</span>
                      <span class="f-date">{{ form.date }}｜{{ form.location }}</span>
                    </div>
                    <button class="btn-apply-blue">立即報名</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
/* 原有樣式保持不動 */
.registration-view {
  padding: 20px;
  --primary-blue: #3b82f6;
  --deep-dark: #0f172a;
  --text-gray: #64748b;
  --bg-soft: #f8fafc;
  --border-light: #e2e8f0;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  .title {
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin: 0;
  }
  .live-indicator {
    font-size: 0.75rem;
    color: #10b981;
    font-weight: 700;
    animation: blink 2s infinite;
    display: block;
    margin-top: 4px;
  }
}
.btn-preview-action {
  position: relative;
  background: var(--deep-dark);
  color: white;
  border: none;
  padding: 12px 26px;
  border-radius: 50px;
  cursor: pointer;
  transition: 0.4s;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.2);
  .btn-inner {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
  }
  .pulse-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    background: var(--primary-blue);
    opacity: 0;
    border-radius: 50px;
    z-index: 1;
  }
  &:hover {
    transform: translateY(-4px);
    background: #000;
    .pulse-ring {
      animation: pulse 1.5s infinite;
      opacity: 0.3;
    }
  }
}
.config-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 16px;
}
.tech-card {
  background: white;
  border-radius: 24px;
  border: 1px solid var(--border-light);
  padding: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  .card-subtitle {
    font-size: 1rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin-bottom: 12px;
  }
}
.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 15px;
  background: var(--bg-soft);
  padding: 10px 15px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  .color-input-styled {
    border: none;
    width: 40px;
    height: 40px;
    cursor: pointer;
    background: none;
    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    &::-webkit-color-swatch {
      border: none;
      border-radius: 8px;
    }
  }
  .color-code {
    font-family: monospace;
    font-weight: 700;
    color: var(--deep-dark);
    font-size: 1rem;
  }
}
.drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-soft);
  border: 2px dashed #cbd5e1;
  border-radius: 16px;
  cursor: pointer;
  transition: 0.3s;
  background-size: cover;
  background-position: center;
  &.banner-zone {
    height: 180px;
  }
  &:hover {
    border-color: var(--primary-blue);
    background: #eff6ff;
  }
  .placeholder {
    color: var(--text-gray);
    font-size: 0.85rem;
    font-weight: 600;
  }
}
.input-styled {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  font-weight: 600;
  transition: 0.3s;
  &:focus {
    border-color: var(--primary-blue);
    outline: none;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  }
}

/* 🚀 修正：Quill 編輯器專屬樣式 */
.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
  h3 {
    margin: 0 !important;
  }
}
.btn-mini-tag {
  background: #eff6ff;
  border: 1px solid #dbeafe;
  color: var(--primary-blue);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  margin-left: 6px;
  transition: 0.2s;
  &:hover {
    background: var(--primary-blue);
    color: white;
  }
}
.quill-editor-wrapper {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: hidden;
  :deep(.ql-toolbar) {
    border: none;
    background: #f8fafc;
    border-bottom: 1px solid var(--border-light);
  }
  :deep(.ql-container) {
    border: none;
    min-height: 250px;
    font-family: inherit;
    font-size: 0.95rem;
  }
}

/* 預覽 HTML 渲染 */
.p-main-body-render {
  line-height: 1.8;
  color: #475569;
  margin-top: 10px;
  :deep(h1, h2, h3) {
    color: var(--deep-dark);
    margin: 10px 0;
  }
  :deep(ul, ol) {
    padding-left: 20px;
  }
  :deep(img) {
    max-width: 100%;
    border-radius: 8px;
  }
}

/* 彈窗與預覽邏輯保持不動 */
.row-flex {
  display: flex;
  gap: 12px;
  .field {
    flex: 1;
  }
}
label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-gray);
  margin-bottom: 8px;
}
.mt-24 {
  margin-top: 16px;
}
.mt-20 {
  margin-top: 12px;
}
.mt-16 {
  margin-top: 12px;
}
.link-input-group {
  display: flex;
  background: var(--bg-soft);
  border-radius: 14px;
  border: 1px solid var(--border-light);
  overflow: hidden;
  .url-prefix {
    padding: 12px;
    color: var(--text-gray);
    font-size: 0.9rem;
  }
  .url-input {
    border: none;
    background: transparent;
    flex: 1;
    font-weight: 700;
    color: var(--deep-dark);
    outline: none;
  }
  .btn-copy-link {
    background: var(--primary-blue);
    color: white;
    border: none;
    padding: 0 20px;
    font-weight: 700;
    cursor: pointer;
  }
}
.btn-regen {
  background: none;
  border: none;
  color: var(--primary-blue);
  font-size: 0.75rem;
  font-weight: 700;
  margin-top: 12px;
  cursor: pointer;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.modal-card {
  width: 90%;
  height: 85vh;
  background: white;
  border-radius: 30px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  .device-switcher {
    background: #f1f5f9;
    padding: 4px;
    border-radius: 50px;
    display: flex;
    gap: 4px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
    button {
      border: none;
      background: transparent;
      padding: 8px 24px;
      border-radius: 50px;
      font-weight: 800;
      font-size: 0.85rem;
      color: var(--text-gray);
      cursor: pointer;
      transition: all 0.3s;
      &.active {
        background: #e0e7ff;
        color: var(--primary-blue);
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
        transform: scale(1.02);
      }
    }
  }
  .btn-close-circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: #f1f5f9;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.3s;
    &:hover {
      background: #fee2e2;
      color: #ef4444;
      transform: rotate(90deg);
    }
  }
}
.preview-viewport {
  flex: 1;
  background: #f1f5f9;
  padding: 12px;
  display: flex;
  justify-content: center;
  overflow: hidden;
  transition: 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  &.mobile {
    .preview-content-box {
      width: 375px;
      height: 100%;
      border-radius: 40px;
      border: 10px solid var(--deep-dark);
      .p-title {
        font-size: 1.6rem;
      }
      .p-badges {
        flex-wrap: wrap;
        gap: 8px;
      }
      .preview-text-content {
        padding: 18px;
      }
      .preview-sticky-footer {
        padding: 10px 15px;
        .f-title {
          font-size: 0.95rem;
        }
        .btn-apply-blue {
          padding: 12px 25px;
          font-size: 0.9rem;
        }
      }
    }
  }
  &.desktop {
    .preview-content-box {
      width: 100%;
      height: 100%;
      border-radius: 16px;
    }
  }
}
.preview-content-box {
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
  transition: background-color 0.3s ease;
}
.scroll-area {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
}
.preview-banner {
  width: 100%;
  aspect-ratio: 16 / 9;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.preview-text-content {
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
  .p-tag {
    color: var(--primary-blue);
    font-weight: 800;
    font-size: 0.8rem;
    display: block;
    margin-bottom: 8px;
  }
  .p-title {
    font-weight: 900;
    margin: 10px 0 20px 0;
    color: var(--deep-dark);
    line-height: 1.3;
    word-break: break-word;
  }
  .p-badges {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
    span {
      background: #eff6ff;
      color: var(--primary-blue);
      padding: 6px 14px;
      border-radius: 50px;
      font-size: 0.85rem;
      font-weight: 700;
      white-space: nowrap;
    }
  }
  .p-placeholder-block {
    height: 150px;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.5), transparent);
    margin-top: 30px;
    border-radius: 15px;
  }
}
.preview-sticky-footer {
  padding: 12px 24px;
  background: white;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
  .footer-flex {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 100%;
  }
  .footer-info {
    flex: 1;
    min-width: 0;
  }
  .f-title {
    display: block;
    font-weight: 800;
    font-size: 1.1rem;
    color: var(--deep-dark);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .f-date {
    font-size: 0.85rem;
    color: var(--text-gray);
    font-weight: 600;
  }
  .btn-apply-blue {
    position: relative;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    border: none;
    padding: 14px 45px;
    border-radius: 14px;
    font-weight: 800;
    font-size: 1.05rem;
    cursor: pointer;
    transition: 0.3s;
    overflow: hidden;
    &::after {
      content: "";
      position: absolute;
      top: -50%;
      left: -60%;
      width: 20%;
      height: 200%;
      background: rgba(255, 255, 255, 0.2);
      transform: rotate(30deg);
      transition: 0.6s ease-in-out;
    }
    &:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 15px rgba(37, 99, 235, 0.3);
      &::after {
        left: 150%;
      }
    }
  }
}
@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.4;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}
@keyframes blink {
  50% {
    opacity: 0.4;
  }
}
@keyframes modal-up {
  from {
    transform: translateY(40px) scale(0.95);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
.toast-box {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  color: var(--primary-blue);
  border: 1px solid var(--primary-blue);
  padding: 12px 30px;
  border-radius: 50px;
  z-index: 10001;
  font-weight: 700;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}
</style>
