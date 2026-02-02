<script setup>
import { reactive, ref, onMounted, computed } from "vue";
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
  selectedGuests: [],
  // 修改：改為儲存 HTML 格式
  mainContent:
    "<h2>親愛的貴賓您好：</h2><p>感謝您對本次活動的關注。我們準備了豐富的議程與專業講師分享。</p><p><strong>【活動重點】</strong></p><ul><li>專家技術深度解析</li><li>產業創新案例分享</li></ul><p>期待您的蒞臨！</p>",
});

// 貴賓資料（實際應從 API 或 store 獲取）
const availableGuests = reactive([
  {
    id: 1,
    name: "張小明",
    company: "文靜科技",
    title: "CTO",
    bio: "資深技術專家，專注於雲端架構與系統設計",
    avatar: null,
  },
  {
    id: 2,
    name: "李美麗",
    company: "創新科技",
    title: "CEO",
    bio: "企業創新領導者，致力於推動數位轉型",
    avatar: null,
  },
  {
    id: 3,
    name: "王大明",
    company: "智能系統",
    title: "CTO",
    bio: "AI 與機器學習專家，擁有豐富的產業經驗",
    avatar: null,
  },
]);

const toggleGuest = (guestId) => {
  const index = form.selectedGuests.indexOf(guestId);
  if (index > -1) {
    form.selectedGuests.splice(index, 1);
  } else {
    form.selectedGuests.push(guestId);
  }
};

const isGuestSelected = (guestId) => {
  return form.selectedGuests.includes(guestId);
};

const getInitials = (name) => {
  if (!name) return "?";
  return name.charAt(0);
};

const selectedGuestsList = computed(() => {
  return availableGuests.filter((g) => form.selectedGuests.includes(g.id));
});

const isPreviewOpen = ref(false);
const previewMode = ref("desktop");
const showToast = ref(false);
const showRegenerateConfirm = ref(false);
const showGuestDetail = ref(false);
const selectedGuestDetail = ref(null);
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

const confirmPublish = () => {
  // 這裡可以加入實際的發布邏輯
  showToast.value = true;
  setTimeout(() => {
    showToast.value = false;
  }, 2500);
};

const confirmRegenerate = () => {
  showRegenerateConfirm.value = true;
};

const executeRegenerate = () => {
  form.shortLink = generateAutoId();
  showRegenerateConfirm.value = false;
  showToast.value = true;
  setTimeout(() => {
    showToast.value = false;
  }, 2000);
};

const cancelRegenerate = () => {
  showRegenerateConfirm.value = false;
};

const openGuestDetail = (guest) => {
  selectedGuestDetail.value = guest;
  showGuestDetail.value = true;
};

const closeGuestDetail = () => {
  showGuestDetail.value = false;
  selectedGuestDetail.value = null;
};
</script>

<template>
  <div class="registration-view">
    <Teleport to="body">
      <Transition name="slide-down">
        <div v-if="showToast" class="toast-box">
          <span class="icon">✅</span> 報名頁面已成功生產並發布！
        </div>
      </Transition>
    </Teleport>

    <div class="page-header"></div>

    <div class="config-grid-top">
      <div class="tech-card visual-config">
        <h3 class="card-subtitle">視覺風格設定</h3>
        <div class="upload-wrapper">
          <div class="upload-field">
            <label>(1) 活動 Banner</label>
            <label
              class="drop-zone banner-zone"
              :style="{ backgroundImage: `url(${form.bannerPreview})` }"
            >
              <input type="file" @change="onFileChange($event, 'banner')" hidden accept="image/*" />
              <div v-if="!form.bannerPreview" class="placeholder">點擊上傳主視覺圖</div>
            </label>
          </div>
          <div class="upload-field">
            <label>(2) 頁面背景顏色 (預覽將自動淡化 40%)</label>
            <div class="color-picker-wrapper">
              <input type="color" v-model="form.bgColor" class="color-input-styled" />
              <span class="color-code">{{ form.bgColor.toUpperCase() }}</span>
            </div>
          </div>
        </div>
      </div>

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
          <button class="btn-copy-link" @click="isPreviewOpen = true">預覽</button>
        </div>
        <button class="btn-regen" @click="confirmRegenerate">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          重新產生連結
        </button>
        <button class="btn-confirm-publish" @click="confirmPublish">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          確認生產報名頁面
        </button>
      </div>
    </div>

    <div class="content-editor-section">
      <div class="tech-card content-card">
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

    <div class="guest-selection-section">
      <div class="tech-card guest-card">
        <h3 class="card-subtitle">特邀貴賓展示</h3>
        <p class="card-desc">
          選擇要在報名頁面展示的特邀貴賓（已選 {{ form.selectedGuests.length }} 位）
        </p>
        <div class="guest-grid">
          <div
            v-for="guest in availableGuests"
            :key="guest.id"
            class="guest-option"
            :class="{ selected: isGuestSelected(guest.id) }"
            @click="toggleGuest(guest.id)"
          >
            <div class="guest-checkbox">
              <svg
                v-if="isGuestSelected(guest.id)"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div
              class="guest-avatar-mini"
              :style="guest.avatar ? { backgroundImage: `url(${guest.avatar})` } : {}"
            >
              <span v-if="!guest.avatar" class="avatar-initial-mini">{{
                getInitials(guest.name)
              }}</span>
            </div>
            <div class="guest-info-mini">
              <div class="guest-name-mini">{{ guest.name }}</div>
              <div class="guest-title-mini">{{ guest.title }} · {{ guest.company }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 重新產生連結確認彈窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showRegenerateConfirm" class="modal-overlay" @click.self="cancelRegenerate">
          <div class="confirm-modal">
            <div class="confirm-header">
              <div class="warning-icon">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  ></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <h3>確認重新產生連結？</h3>
            </div>
            <div class="confirm-body">
              <p class="warning-text">⚠️ 請注意以下影響：</p>
              <ul class="warning-list">
                <li>舊的報名連結將立即失效</li>
                <li>已發布的報名表單將無法透過舊連結存取</li>
                <li>需要重新分享新的連結給參與者</li>
                <li>此操作無法復原</li>
              </ul>
              <p class="confirm-question">您確定要繼續嗎？</p>
            </div>
            <div class="confirm-actions">
              <button class="btn-cancel" @click="cancelRegenerate">取消</button>
              <button class="btn-confirm-danger" @click="executeRegenerate">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                確認重新產生
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

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

                    <div v-if="selectedGuestsList.length > 0" class="p-guests-section">
                      <h3 class="p-section-title">特邀貴賓</h3>
                      <div class="p-guests-grid">
                        <div
                          v-for="guest in selectedGuestsList"
                          :key="guest.id"
                          class="p-guest-card"
                          @click="openGuestDetail(guest)"
                        >
                          <div
                            class="p-guest-avatar"
                            :style="guest.avatar ? { backgroundImage: `url(${guest.avatar})` } : {}"
                          >
                            <span v-if="!guest.avatar" class="p-avatar-initial">{{
                              getInitials(guest.name)
                            }}</span>
                          </div>
                          <div class="p-guest-name">{{ guest.name }}</div>
                        </div>
                      </div>
                    </div>

                    <div class="p-placeholder-block"></div>
                  </div>
                </div>

                <div class="preview-sticky-footer">
                  <div class="footer-flex">
                    <div class="footer-info">
                      <span class="f-title">立即報名參加</span>
                      <span class="f-date">{{ form.date }}｜{{ form.location }}</span>
                    </div>
                    <button class="btn-apply-blue"><span>立即報名</span></button>
                  </div>
                </div>

                <!-- 貴賓詳情面板（在預覽視窗內） -->
                <Transition name="slide-panel">
                  <div
                    v-if="showGuestDetail && selectedGuestDetail"
                    class="guest-panel-overlay"
                    @click="closeGuestDetail"
                  >
                    <div class="guest-detail-panel" @click.stop>
                      <button class="btn-close-panel" @click="closeGuestDetail">✕</button>
                      <div class="guest-detail-content">
                        <div
                          class="guest-detail-avatar"
                          :style="
                            selectedGuestDetail.avatar
                              ? { backgroundImage: `url(${selectedGuestDetail.avatar})` }
                              : {}
                          "
                        >
                          <span v-if="!selectedGuestDetail.avatar" class="guest-detail-initial">{{
                            getInitials(selectedGuestDetail.name)
                          }}</span>
                        </div>
                        <h2 class="guest-detail-name">{{ selectedGuestDetail.name }}</h2>
                        <div class="guest-detail-meta">
                          <div class="meta-item">
                            <svg
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                              <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <span>{{ selectedGuestDetail.title }}</span>
                          </div>
                          <div class="meta-item">
                            <svg
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                              <polyline points="9 22 9 12 15 12 15 22"></polyline>
                            </svg>
                            <span>{{ selectedGuestDetail.company }}</span>
                          </div>
                        </div>
                        <div v-if="selectedGuestDetail.bio" class="guest-detail-bio">
                          <h4>個人簡介</h4>
                          <p>{{ selectedGuestDetail.bio }}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Transition>
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
  padding: 12px;
  --primary-blue: #3b82f6;
  --deep-dark: #0f172a;
  --text-gray: #64748b;
  --bg-soft: #f8fafc;
  --border-light: #e2e8f0;
}
.page-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
  .title {
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin: 0;
    letter-spacing: -0.02em;
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
.config-grid-top {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 10px;
}
.content-editor-section {
  width: 100%;
}
.tech-card {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s;
  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
  .card-subtitle {
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 2px solid #f1f5f9;
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
  transition: 0.3s;
  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
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
    height: 160px;
  }
  &:hover {
    border-color: var(--primary-blue);
    background: #eff6ff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
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
  &:hover {
    border-color: #cbd5e1;
  }
  &:focus {
    border-color: var(--primary-blue);
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
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
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  margin-left: 6px;
  transition: 0.2s;
  &:hover {
    background: var(--primary-blue);
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
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
  line-height: 1.9;
  color: #475569;
  font-size: 1.05rem;
  margin-top: 10px;
  :deep(h1, h2, h3) {
    color: var(--deep-dark);
    margin: 24px 0 12px 0;
    font-weight: 800;
  }
  :deep(h1) {
    font-size: 1.8rem;
  }
  :deep(h2) {
    font-size: 1.5rem;
  }
  :deep(h3) {
    font-size: 1.2rem;
  }
  :deep(p) {
    margin: 16px 0;
  }
  :deep(ul, ol) {
    padding-left: 24px;
    margin: 16px 0;
  }
  :deep(li) {
    margin: 8px 0;
  }
  :deep(img) {
    max-width: 100%;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    margin: 20px 0;
  }
  :deep(a) {
    color: #3b82f6;
    text-decoration: none;
    font-weight: 600;
    &:hover {
      text-decoration: underline;
    }
  }
  :deep(strong) {
    color: #1e293b;
    font-weight: 800;
  }
}

/* 彈窗與預覽邏輯保持不動 */
.row-flex {
  display: flex;
  gap: 8px;
  .field {
    flex: 1;
  }
}
label {
  display: block;
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 5px;
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
    transition: 0.2s;
    &:hover {
      background: #2563eb;
    }
  }
}
.btn-regen {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 0.85rem;
  font-weight: 600;
  margin-top: 10px;
  padding: 8px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  justify-content: center;
  svg {
    transition: transform 0.3s;
  }
  &:hover {
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    border-color: var(--primary-blue);
    color: var(--primary-blue);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
    svg {
      transform: rotate(180deg);
    }
  }
  &:active {
    transform: scale(0.98);
  }
}
.btn-confirm-publish {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  color: white;
  font-size: 0.9rem;
  font-weight: 700;
  margin-top: 8px;
  padding: 12px 20px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
  &:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
    transform: translateY(-2px);
  }
  &:active {
    transform: translateY(0) scale(0.98);
  }
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
  width: 95%;
  max-width: 1400px;
  height: 90vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3);
  padding: 4px;
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
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #f8fafc 100%);
  padding: 20px;
  display: flex;
  justify-content: center;
  overflow: hidden;
  transition: 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  &.mobile {
    .preview-content-box {
      width: 375px;
      height: 100%;
      border-radius: 42px;
      border: 12px solid #1e293b;
      box-shadow:
        0 30px 80px rgba(0, 0, 0, 0.25),
        inset 0 0 0 1px rgba(255, 255, 255, 0.1);
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
      border-radius: 20px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.2);
    }
  }
}
.preview-content-box {
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 70px rgba(0, 0, 0, 0.15);
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
  position: relative;
  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.5));
  }
}
.preview-text-content {
  padding: 24px;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(10px);
  position: relative;
  z-index: 2;
  margin-top: -30px;
  border-radius: 25px 25px 0 0;
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.08);
  width: 100%;
  box-sizing: border-box;
  .p-tag {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 8px 20px;
    border-radius: 20px;
    font-weight: 900;
    font-size: 0.75rem;
    display: inline-block;
    margin-bottom: 16px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  }
  .p-title {
    font-weight: 900;
    margin: 0 0 24px 0;
    font-size: 2.2rem;
    background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1.2;
    word-break: break-word;
    letter-spacing: -0.02em;
  }
  .p-badges {
    display: flex;
    gap: 12px;
    margin-bottom: 32px;
    flex-wrap: wrap;
    span {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.15) 100%);
      backdrop-filter: blur(10px);
      color: #1e40af;
      padding: 12px 20px;
      border-radius: 16px;
      font-size: 0.95rem;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
      border: 1.5px solid rgba(59, 130, 246, 0.3);
      transition: all 0.3s;
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(59, 130, 246, 0.25);
        background: linear-gradient(
          135deg,
          rgba(59, 130, 246, 0.15) 0%,
          rgba(37, 99, 235, 0.2) 100%
        );
      }
    }
  }
  .p-placeholder-block {
    height: 180px;
    background: linear-gradient(
      135deg,
      rgba(102, 126, 234, 0.05) 0%,
      rgba(118, 75, 162, 0.08) 100%
    );
    margin-top: 40px;
    border-radius: 20px;
    border: 2px dashed rgba(102, 126, 234, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    &::after {
      content: "報名表單區域";
      color: rgba(102, 126, 234, 0.4);
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
  }
}
.preview-sticky-footer {
  padding: 20px 30px;
  background: linear-gradient(to top, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
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
    font-size: 1.2rem;
    background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 4px;
  }
  .f-date {
    font-size: 0.9rem;
    color: var(--text-gray);
    font-weight: 600;
    display: block;
  }
  .btn-apply-blue {
    position: relative;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 16px 50px;
    border-radius: 16px;
    font-weight: 800;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
    &::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
      opacity: 0;
      transition: opacity 0.3s;
    }
    &::after {
      content: "";
      position: absolute;
      top: -50%;
      left: -60%;
      width: 20%;
      height: 200%;
      background: rgba(255, 255, 255, 0.3);
      transform: rotate(30deg);
      transition: 0.6s ease-in-out;
    }
    span {
      position: relative;
      z-index: 1;
    }
    &:hover {
      transform: translateY(-4px) scale(1.02);
      box-shadow: 0 12px 30px rgba(102, 126, 234, 0.4);
      &::before {
        opacity: 1;
      }
      &::after {
        left: 150%;
      }
    }
    &:active {
      transform: translateY(-2px) scale(0.98);
    }
  }
}

/* 重新產生連結確認彈窗 */
.confirm-modal {
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modal-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.confirm-header {
  padding: 24px 24px 16px;
  text-align: center;
  border-bottom: 1px solid #fee2e2;

  .warning-icon {
    width: 60px;
    height: 60px;
    margin: 0 auto 16px;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      stroke: #f59e0b;
    }
  }

  h3 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 800;
    color: #dc2626;
  }
}

.confirm-body {
  padding: 24px;

  .warning-text {
    font-size: 0.95rem;
    font-weight: 700;
    color: #dc2626;
    margin: 0 0 12px 0;
  }

  .warning-list {
    background: #fef2f2;
    border-left: 4px solid #ef4444;
    border-radius: 8px;
    padding: 16px 20px 16px 36px;
    margin: 0 0 20px 0;

    li {
      color: #7f1d1d;
      font-size: 0.9rem;
      line-height: 1.8;
      font-weight: 500;

      &::marker {
        color: #ef4444;
      }
    }
  }

  .confirm-question {
    font-size: 1rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
    text-align: center;
  }
}

.confirm-actions {
  padding: 16px 24px 24px;
  display: flex;
  gap: 12px;

  button {
    flex: 1;
    padding: 12px 20px;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .btn-cancel {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    color: #6b7280;

    &:hover {
      background: #e5e7eb;
      border-color: #9ca3af;
    }
  }

  .btn-confirm-danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    border: none;
    color: white;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);

    &:hover {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
      transform: translateY(-2px);
    }

    &:active {
      transform: translateY(0) scale(0.98);
    }
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

/* Keyframes Animations */
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

/* 貴賓選擇區塊樣式 */
.guest-selection-section {
  margin-top: 24px;
}

.guest-card {
  .card-desc {
    color: var(--text-gray);
    font-size: 0.9rem;
    margin-bottom: 20px;
    font-weight: 500;
  }
}

.guest-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.guest-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid var(--border-light);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  background: white;

  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  &.selected {
    border-color: var(--primary-blue);
    background: #eff6ff;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);

    .guest-checkbox {
      background: var(--primary-blue);
      border-color: var(--primary-blue);
    }
  }
}

.guest-checkbox {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-light);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.3s;
  background: white;

  svg {
    color: white;
  }
}

.guest-avatar-mini {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.avatar-initial-mini {
  font-size: 1.2rem;
  font-weight: 800;
  color: white;
}

.guest-info-mini {
  flex: 1;
  min-width: 0;
}

.guest-name-mini {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--deep-dark);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guest-title-mini {
  font-size: 0.8rem;
  color: var(--text-gray);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 預覽頁面中的貴賓展示樣式 */
.p-guests-section {
  margin-top: 48px;
  padding-top: 32px;
  border-top: 2px solid var(--border-light);
}

.p-section-title {
  font-size: 1.8rem;
  font-weight: 900;
  color: var(--deep-dark);
  margin: 0 0 28px 0;
  text-align: center;
}

.p-guests-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 20px;
}

.p-guest-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  position: relative;

  &::after {
    content: "點擊查看詳情";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(59, 130, 246, 0.95);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    opacity: 0;
    transition: opacity 0.3s;
    font-weight: 700;
    font-size: 0.9rem;
  }

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    transform: translateY(-4px);

    &::after {
      opacity: 1;
    }
  }
}

.p-guest-avatar {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
}

.p-avatar-initial {
  font-size: 2rem;
  font-weight: 800;
  color: white;
}

.p-guest-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--deep-dark);
  line-height: 1.3;
  word-break: break-word;
}

/* 貴賓詳細資訊面板樣式（在預覽視窗內） */
.preview-content-box {
  position: relative;
}

.guest-panel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  backdrop-filter: blur(4px);
}

.guest-detail-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 380px;
  height: 100%;
  background: white;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
  overflow-y: auto;
  z-index: 101;
}

.btn-close-panel {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--bg-soft);
  color: var(--text-gray);
  font-size: 1.3rem;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;

  &:hover {
    background: #e5e7eb;
    color: var(--deep-dark);
    transform: rotate(90deg);
  }
}

.guest-detail-content {
  padding: 80px 32px 40px;
  text-align: center;
}

.guest-detail-avatar {
  width: 160px;
  height: 160px;
  border-radius: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4);
}

.guest-detail-initial {
  font-size: 4rem;
  font-weight: 800;
  color: white;
}

.guest-detail-name {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--deep-dark);
  margin: 0 0 20px 0;
}

.guest-detail-meta {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 28px;
}

.meta-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 20px;
  background: var(--bg-soft);
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-gray);

  svg {
    color: var(--primary-blue);
    flex-shrink: 0;
  }

  span {
    flex: 1;
  }
}

.guest-detail-bio {
  text-align: left;
  padding: 24px;
  background: var(--bg-soft);
  border-radius: 16px;
  border-left: 4px solid var(--primary-blue);

  h4 {
    font-size: 1rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin: 0 0 12px 0;
  }

  p {
    font-size: 0.95rem;
    line-height: 1.8;
    color: #475569;
    margin: 0;
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
@keyframes modal-bounce {
  0% {
    transform: scale(0.7);
    opacity: 0;
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* 右側滑出面板動畫 */
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: opacity 0.3s ease;

  .guest-detail-panel {
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.slide-panel-enter-from,
.slide-panel-leave-to {
  opacity: 0;

  .guest-detail-panel {
    transform: translateX(100%);
  }
}

.slide-panel-enter-to,
.slide-panel-leave-from {
  opacity: 1;

  .guest-detail-panel {
    transform: translateX(0);
  }
}
</style>
