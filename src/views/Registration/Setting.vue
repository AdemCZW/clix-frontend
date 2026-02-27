<script setup>
import { reactive, ref, onMounted, computed } from "vue";
// 引入 Quill 編輯器元件與樣式
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
// 引入 stores
import { useGuestsStore } from "@/stores/guests";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { useRegistrationPagesStore } from "@/stores/registrationPages";
import { useUserStore } from "@/stores/user";
import { useToast } from "@/composables/useToast";
import { useRouter } from "vue-router";

// 使用 stores
const guestsStore = useGuestsStore();
const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();
const pagesStore = useRegistrationPagesStore();
const userStore = useUserStore();
const router = useRouter();
const { success: toastSuccess, error: toastError } = useToast();

// 目前報名頁的 ID，以及儲存/載入狀態
const pageId = ref(null);
const saving = ref(false);
const loading = ref(false);

// 合併兩個來源的特邀貴賓資料
const allSelectedGuests = computed(() => {
  const fromGuestsPage = guestsStore.selectedGuests;
  const fromParticipantsPage = participantsStore.selectedVIPs;
  const combined = [...fromGuestsPage, ...fromParticipantsPage];
  return combined.filter(
    (guest, index, self) => index === self.findIndex((g) => g.id === guest.id),
  );
});

// 表單資料（對應報名頁設定欄位）
const form = reactive({
  bannerFile: null,       // File 物件（上傳用）
  bannerPreview: null,    // 預覽 URL（base64 或後端 URL）
  mainContent: "",
  emailSubject: "",
  emailSenderName: "",
  emailContent: "",
  enableAutoSend: true,
});

// 活動基本資訊（唯讀顯示，來自 eventsStore.currentEvent）
const currentEvent = computed(() => eventsStore.currentEvent);

// 短連結與發布狀態
const shortLink = ref("");
const isPublished = ref(false);
const customSlug = ref("");

// 從 shortLink（可能是完整 URL 或純 slug）提取純 slug
const extractSlug = (link) => {
  if (!link) return "";
  if (link.startsWith("http")) {
    const match = link.match(/\/r\/(.+?)(?:\?|$)/);
    return match ? match[1] : link;
  }
  return link;
};

// 活動過期判斷
const isCurrentEventExpired = computed(() => {
  const end = currentEvent.value?.endDate || currentEvent.value?.date;
  return !!end && end < new Date().toISOString().slice(0, 10);
});

// URL 基底（固定顯示部分）
const urlBase = computed(() => {
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  return `${base}/#/r/`;
});

const isPreviewOpen = ref(false);
const previewMode = ref("desktop");
const showToast = ref(false);
const viewingGuest = ref(null);
const myQuill = ref(null);
const emailQuill = ref(null);

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

const emailEditorOptions = {
  modules: {
    toolbar: [
      ["bold", "italic", "underline"],
      [{ header: [1, 2, false] }],
      [{ color: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link", "clean"],
    ],
  },
  placeholder: "請在此輸入郵件內文...",
  theme: "snow",
};

// 插入動態標籤
const insertTag = (tag) => {
  const quill = myQuill.value.getQuill();
  const range = quill.getSelection(true);
  if (range) {
    quill.insertText(range.index, tag);
    quill.setSelection(range.index + tag.length);
  }
};

const insertEmailTag = (tag) => {
  const quill = emailQuill.value.getQuill();
  const range = quill.getSelection(true);
  if (range) {
    quill.insertText(range.index, tag);
    quill.setSelection(range.index + tag.length);
  } else {
    const length = quill.getLength();
    quill.insertText(length - 1, tag);
  }
};

// ── 初始化 ────────────────────────────────────────────────────────────────
onMounted(async () => {
  userStore.checkAuth();
  const event = eventsStore.currentEvent;

  // 沒有選擇活動 → 回到活動列表
  if (!event || !event.id) {
    router.push("/admin/events");
    return;
  }

  loading.value = true;
  try {
    // 嘗試取得該活動的報名頁設定
    let page = await pagesStore.fetchByEvent(event.id);

    // 尚未建立 → 自動建立
    if (!page) {
      page = await pagesStore.createPage(event.id);
    }

    // 用後端資料初始化表單
    pageId.value = page.id;
    shortLink.value = page.shortLink;
    customSlug.value = extractSlug(page.shortLink);
    isPublished.value = page.isPublished;
    form.mainContent      = page.mainContent;
    form.emailSubject     = page.emailSubject;
    form.emailSenderName  = page.emailSenderName;
    form.emailContent     = page.emailContent;
    form.enableAutoSend   = page.enableAutoSend;
    form.bannerPreview    = page.banner || null;
  } catch (err) {
    toastError(err.message || "載入報名頁設定失敗");
  } finally {
    loading.value = false;
  }
});

// ── Banner 選擇 ────────────────────────────────────────────────────────────
const onFileChange = (e, type) => {
  const file = e.target.files[0];
  if (!file) return;
  if (type === "banner") form.bannerFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (type === "banner") form.bannerPreview = ev.target.result;
  };
  reader.readAsDataURL(file);
};

// ── 儲存草稿 ──────────────────────────────────────────────────────────────
const saveDraft = async () => {
  if (!pageId.value) {
    toastError("請先從活動列表選擇一個活動");
    return;
  }
  saving.value = true;
  try {
    const saved = await pagesStore.saveDraft(pageId.value, {
      mainContent:     form.mainContent,
      emailSubject:    form.emailSubject,
      emailSenderName: form.emailSenderName,
      emailContent:    form.emailContent,
      enableAutoSend:  form.enableAutoSend,
      bannerFile:      form.bannerFile,
    });
    form.bannerFile = null; // 上傳後清除，避免重複送出
    // 更新 preview 為後端回傳的正式 URL（確保顯示 server 上的圖片）
    if (saved && saved.banner) {
      form.bannerPreview = saved.banner;
    }
    toastSuccess("活動設定已儲存");
  } catch (err) {
    toastError(err.message || "儲存失敗");
  } finally {
    saving.value = false;
  }
};

// ── 發布 ──────────────────────────────────────────────────────────────────
const confirmPublish = async () => {
  if (!pageId.value) {
    toastError("請先從活動列表選擇一個活動");
    return;
  }
  saving.value = true;
  try {
    // 先儲存最新內容，再發布
    await pagesStore.saveDraft(pageId.value, {
      mainContent:     form.mainContent,
      emailSubject:    form.emailSubject,
      emailSenderName: form.emailSenderName,
      emailContent:    form.emailContent,
      enableAutoSend:  form.enableAutoSend,
      bannerFile:      form.bannerFile,
    });
    form.bannerFile = null;
    const page = await pagesStore.publish(pageId.value);
    isPublished.value = page.isPublished;
    toastSuccess("活動報名頁已發布！");
    showToast.value = true;
    setTimeout(() => { showToast.value = false; }, 2500);
  } catch (err) {
    toastError(err.message || "發布失敗");
  } finally {
    saving.value = false;
  }
};

// ── 取消發布 ──────────────────────────────────────────────────────────────
const handleUnpublish = async () => {
  if (!pageId.value) return;
  saving.value = true;
  try {
    const page = await pagesStore.unpublish(pageId.value);
    isPublished.value = page.isPublished;
    toastSuccess("已取消發布，存為草稿");
  } catch (err) {
    toastError(err.message || "取消發布失敗");
  } finally {
    saving.value = false;
  }
};

// ── 短連結 ────────────────────────────────────────────────────────────────
const saveCustomSlug = async () => {
  if (!pageId.value) return;
  if (!customSlug.value.trim()) { toastError("連結後綴不能為空"); return; }
  try {
    const updated = await pagesStore.saveDraft(pageId.value, {
      shortLink: customSlug.value.trim(),
    });
    shortLink.value = updated.shortLink;
    customSlug.value = extractSlug(updated.shortLink);
    toastSuccess("報名連結已更新");
  } catch (err) {
    toastError(err.message || "更新連結失敗");
  }
};

// 產生完整的報名頁 URL（對應 /r/:shortLink 路由）
const fullRegistrationUrl = computed(() => {
  if (!shortLink.value) return ''
  // 若後端已回傳完整 URL（http 開頭）直接使用
  if (shortLink.value.startsWith('http')) return shortLink.value
  // 否則拼接當前 origin（dev / prod 都適用）
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return `${base}/#/r/${shortLink.value}`
});

const copyLink = () => {
  const urlToCopy = fullRegistrationUrl.value || shortLink.value;
  navigator.clipboard.writeText(urlToCopy).then(() => {
    toastSuccess('連結已複製到剪貼簿');
  }).catch(() => {
    toastError('複製失敗，請手動選取連結複製');
  });
};

// ── 貴賓詳細資訊 ──────────────────────────────────────────────────────────
const openGuestDetail = (guest) => {
  viewingGuest.value = guest;
};

const closeGuestDetail = () => {
  viewingGuest.value = null;
};
</script>

<template>
  <div class="registration-view">
    <Teleport to="body">
      <Transition name="slide-down">
        <div v-if="showToast" class="toast-box">報名頁面已成功生產並發布！</div>
      </Transition>
    </Teleport>

    <div class="page-header"></div>

    <div class="config-grid-top">
      <div class="tech-card visual-config">
        <h3 class="card-subtitle">視覺風格設定</h3>
        <div class="upload-wrapper">
          <div class="upload-field">
            <label>活動 Banner</label>
            <label
              class="drop-zone banner-zone"
              :style="{ backgroundImage: `url(${form.bannerPreview})` }"
            >
              <input type="file" @change="onFileChange($event, 'banner')" hidden accept="image/*" />
              <div v-if="!form.bannerPreview" class="placeholder">點擊上傳主視覺圖</div>
            </label>
          </div>
        </div>
      </div>

      <div class="tech-card data-card">
        <h3 class="card-subtitle">
          活動基本資訊
          <span v-if="isPublished && !isCurrentEventExpired" class="publish-status published" style="margin-left: 8px;">
            <span class="status-dot"></span>
            已發布
          </span>
        </h3>
        <div class="event-info-display">
          <div class="info-row">
            <span class="info-label">活動名稱</span>
            <span class="info-value">{{ currentEvent?.name || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">日期</span>
            <span class="info-value">{{ currentEvent?.date || '—' }} {{ currentEvent?.endDate && currentEvent.endDate !== currentEvent.date ? '→ ' + currentEvent.endDate : '' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">時間</span>
            <span class="info-value">{{ currentEvent?.time || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">地點</span>
            <span class="info-value">{{ currentEvent?.location || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">地址</span>
            <span class="info-value">{{ currentEvent?.address || '—' }}</span>
          </div>
        </div>
        <div class="info-hint">如需修改活動基本資訊，請至<a @click.prevent="$router.push('/admin/events')" href="#" class="link-go">活動列表</a>編輯。</div>
      </div>

      <div class="tech-card link-card accent-blue">
        <h3 class="card-subtitle">產出報名連結</h3>

        <!-- 過期警告 -->
        <div v-if="isCurrentEventExpired" class="expired-warning">
          ⚠️ 此活動已過期，報名已停止接受。如需重新開放，請先至活動列表更新活動日期。
        </div>


        <!-- 已發布狀態移至標題旁，這裡移除 -->

        <div class="link-container">
          <!-- 自訂 URL 編輯器 -->
          <div class="custom-url-editor">
            <span class="url-base-label">{{ urlBase }}</span>
            <input
              v-model="customSlug"
              class="slug-input"
              placeholder="自訂連結後綴"
              @keyup.enter="saveCustomSlug"
            />
            <button class="btn-update-slug" @click="saveCustomSlug">更新</button>
          </div>
          <div class="button-row">
            <button class="btn-copy" @click="copyLink">複製</button>
            <button class="btn-preview" @click="isPreviewOpen = true">預覽</button>
          </div>
        </div>
        <div class="action-buttons">
          <button class="btn-save" :disabled="saving" @click="saveDraft">
            {{ saving ? '儲存中...' : '儲存草稿' }}
          </button>
          <button v-if="!isPublished" class="btn-publish" :disabled="saving || isCurrentEventExpired" @click="confirmPublish">
            {{ saving ? '處理中...' : '發布' }}
          </button>
          <button v-else class="btn-unpublish" :disabled="saving" @click="handleUnpublish">
            {{ saving ? '處理中...' : '取消發布' }}
          </button>
        </div>
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

    <!-- 通知信設定區塊 -->
    <div class="email-notification-section">
      <div class="email-config-grid">
        <!-- 發送參數設定 -->
        <div class="tech-card email-params-card">
          <h3 class="card-subtitle">發送參數設定</h3>
          <div class="field mt-16">
            <label>郵件主旨</label>
            <input
              v-model="form.emailSubject"
              type="text"
              placeholder="輸入郵件主旨"
              class="input-styled"
            />
          </div>
          <div class="field mt-16">
            <label>寄件者名稱</label>
            <input
              v-model="form.emailSenderName"
              type="text"
              placeholder="輸入寄件者名稱"
              class="input-styled"
            />
          </div>
          <div class="auto-send-toggle mt-20">
            <div class="toggle-info">
              <span class="toggle-label">報名完成即刻發送</span>
              <span class="toggle-desc">啟用後將在報名成功時自動發送通知信</span>
            </div>
            <label class="switch-container">
              <input type="checkbox" v-model="form.enableAutoSend" />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- 郵件內容編輯 -->
        <div class="tech-card email-content-card">
          <div class="card-header-flex">
            <h3 class="card-subtitle">郵件內文編輯</h3>
            <div class="tag-helper">
              <button class="btn-mini-tag" @click="insertEmailTag('{name}')">+{name}</button>
              <button class="btn-mini-tag" @click="insertEmailTag('{event_name}')">
                +{event_name}
              </button>
              <button class="btn-mini-tag" @click="insertEmailTag('{order_id}')">
                +{order_id}
              </button>
            </div>
          </div>
          <div class="quill-editor-wrapper">
            <QuillEditor
              ref="emailQuill"
              v-model:content="form.emailContent"
              contentType="html"
              :options="emailEditorOptions"
            />
          </div>
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
              <div class="preview-content-box">
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
                      <span>📅 {{ currentEvent?.date }}</span>
                      <span>📍 {{ currentEvent?.location }}</span>
                    </div>

                    <div class="p-main-body-render" v-html="form.mainContent"></div>

                    <!-- 特邀貴賓區塊 -->
                    <div v-if="allSelectedGuests.length > 0" class="p-guests-section">
                      <h3 class="p-section-title">特邀貴賓</h3>
                      <div class="p-guests-grid">
                        <div
                          v-for="guest in allSelectedGuests"
                          :key="guest.id"
                          class="p-guest-card"
                          @click="openGuestDetail(guest)"
                        >
                          <div class="p-guest-avatar">
                            <span class="p-avatar-initial">{{ guest.name.charAt(0) }}</span>
                          </div>
                          <div class="p-guest-info">
                            <div class="p-guest-name">{{ guest.name }}</div>
                            <div class="p-guest-title">{{ guest.title }}</div>
                            <div class="p-guest-company">{{ guest.company }}</div>
                          </div>
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
                      <span class="f-date">{{ currentEvent?.date }}｜{{ currentEvent?.location }}</span>
                    </div>
                    <button class="btn-apply-blue"><span>立即報名</span></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 貴賓詳細資訊彈窗 -->
    <Teleport to="body">
      <Transition name="slide-panel">
        <div v-if="viewingGuest" class="guest-detail-overlay" @click.self="closeGuestDetail">
          <div class="guest-detail-panel">
            <div class="guest-detail-header">
              <h3>貴賓詳細資訊</h3>
              <button class="btn-close-circle" @click="closeGuestDetail">✕</button>
            </div>
            <div class="guest-detail-body">
              <div class="detail-avatar-section">
                <div class="detail-avatar">
                  <div
                    v-if="viewingGuest.avatar"
                    class="avatar-img"
                    :style="{ backgroundImage: `url(${viewingGuest.avatar})` }"
                  ></div>
                  <span v-else class="avatar-initial-large">{{ viewingGuest.name.charAt(0) }}</span>
                </div>
              </div>
              <div class="detail-info-grid">
                <div class="detail-field">
                  <label>姓名</label>
                  <div class="detail-value">{{ viewingGuest.name }}</div>
                </div>
                <div class="detail-field">
                  <label>職稱</label>
                  <div class="detail-value">{{ viewingGuest.title || "未填寫" }}</div>
                </div>
                <div class="detail-field">
                  <label>公司</label>
                  <div class="detail-value">{{ viewingGuest.company || "未填寫" }}</div>
                </div>
                <div class="detail-field">
                  <label>Email</label>
                  <div class="detail-value">{{ viewingGuest.email || "未填寫" }}</div>
                </div>
                <div class="detail-field">
                  <label>電話</label>
                  <div class="detail-value">{{ viewingGuest.phone || "未填寫" }}</div>
                </div>
                <div class="detail-field full-width">
                  <label>簡介</label>
                  <div class="detail-value">{{ viewingGuest.bio || "未填寫" }}</div>
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
  --text-gray: #475569;
  --text-gray-light: #64748b;
  --bg-soft: #f8fafc;
  --border-light: #e2e8f0;
}

.published-badge {
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  background: #4caf50;
  color: #fff;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.85em;
  font-weight: 500;
  vertical-align: middle;
}
.published-dot {
  width: 8px;
  height: 8px;
  background: #fff;
  border-radius: 50%;
  display: inline-block;
  margin-right: 5px;
}

/* 活動基本資訊唯讀區 */
.event-info-display {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.info-row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  .info-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-gray);
    min-width: 64px;
    flex-shrink: 0;
  }
  .info-value {
    font-size: 0.9rem;
    color: var(--deep-dark);
    font-weight: 500;
  }
}
.info-hint {
  font-size: 0.78rem;
  color: var(--text-gray-light);
  margin-top: 4px;
  .link-go {
    color: var(--primary-blue);
    cursor: pointer;
    text-decoration: underline;
    margin: 0 2px;
  }
}

/* 發布狀態標籤 */
.publish-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 10px;
  padding: 4px 10px;
  background: #f1f5f9;
  border-radius: 20px;
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #94a3b8;
  }
  &.published {
    color: #059669;
    background: #d1fae5;
    .status-dot { background: #10b981; }
  }
}

/* 取消發布按鈕 */
.btn-unpublish {
  flex: 1;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border: none;
  padding: 14px 20px;
  border-radius: 0;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  &:hover {
    background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.page-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 20px;
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
    color: #059669; /* WCAG AA: 對比度 4.7:1 (原 #10b981 僅 3.4:1) */
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
  gap: 20px;
  margin-bottom: 20px;
}
.content-editor-section {
  width: 100%;
}

/* 通知信設定區塊 */
.email-notification-section {
  width: 100%;
  margin-top: 20px;
}

.section-title-bar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 24px 28px;
  border-radius: 16px;
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.25);
}

.section-main-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: white;
  margin: 0 0 6px 0;
}

.section-subtitle {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.95); /* WCAG AA: 提升透明度 */
  margin: 0;
}

.email-config-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 20px;
}

.email-params-card {
  display: flex;
  flex-direction: column;
}

.email-content-card {
  display: flex;
  flex-direction: column;
}

.auto-send-toggle {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.toggle-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--deep-dark);
}

.toggle-desc {
  font-size: 0.85rem; /* 提升字體大小以增強可讀性 */
  color: var(--text-gray); /* 符合 WCAG AA 標準 */
}

.switch-container {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
  flex-shrink: 0;
}

.switch-container input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: 0.3s;
  border-radius: 28px;
}

.switch-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.switch-container input:checked + .switch-slider {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.switch-container input:checked + .switch-slider:before {
  transform: translateX(24px);
}

.tech-card {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  padding: 16px;
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

/* 彩窗與預覽邏輯保持不動 */
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

.link-container {
  background: var(--bg-soft);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.link-input-group {
  display: flex;
  border-bottom: 1px solid var(--border-light);

  .url-prefix {
    padding: 12px 12px 12px 16px;
    color: var(--text-gray);
    font-size: 0.9rem;
    background: rgba(248, 250, 252, 0.5);
  }
  .url-input {
    border: none;
    background: transparent;
    flex: 1;
    font-weight: 700;
    color: var(--deep-dark);
    outline: none;
    padding: 12px 16px 12px 4px;
  }
  &.full-url {
    .url-input {
      padding: 12px 16px;
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--accent-blue);
      letter-spacing: 0.2px;
      cursor: text;
    }
  }
}

.button-row {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-light);

  .btn-copy {
    flex: 1;
    background: linear-gradient(135deg, var(--primary-blue) 0%, #2563eb 100%);
    color: white;
    border: none;
    border-right: 1px solid rgba(255, 255, 255, 0.2);
    padding: 12px 20px;
    border-radius: 0;
    font-weight: 700;
    cursor: pointer;
    transition: 0.2s;
    font-size: 0.9rem;

    &:hover {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.1);
    }
  }

  .btn-preview {
    flex: 1;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 0;
    font-weight: 700;
    cursor: pointer;
    transition: 0.2s;
    font-size: 0.9rem;

    &:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.1);
    }
  }
}

/* 自訂 URL 編輯器 */
.custom-url-editor {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  gap: 6px;
  border-bottom: 1px solid var(--border-light);
  background: white;

  .url-base-label {
    color: #94a3b8;
    font-size: 0.78rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .slug-input {
    flex: 1;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--deep-dark);
    outline: none;
    transition: all 0.2s;
    min-width: 0;

    &:focus {
      border-color: var(--primary-blue);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
  }

  .btn-update-slug {
    padding: 7px 14px;
    background: var(--primary-blue);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;

    &:hover {
      background: #2563eb;
    }
  }
}

/* 過期警告 */
.expired-warning {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.85rem;
  color: #c2410c;
  font-weight: 500;
  margin-bottom: 12px;
  line-height: 1.5;
}

.action-buttons {
  display: flex;
  gap: 0;
  margin-top: 16px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

  .btn-save {
    flex: 1;
    background: linear-gradient(135deg, #64748b 0%, #475569 100%);
    color: white;
    border: none;
    border-right: 1px solid rgba(255, 255, 255, 0.2);
    padding: 14px 20px;
    border-radius: 0;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    justify-content: center;

    &:hover {
      background: linear-gradient(135deg, #475569 0%, #334155 100%);
      box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.1);
    }

    &:active {
      transform: scale(0.98);
    }
  }

  .btn-publish {
    flex: 1;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    padding: 14px 20px;
    border-radius: 0;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    justify-content: center;

    &:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.1);
    }

    &:active {
      transform: scale(0.98);
    }
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
  padding: 5px;
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

  /* 預覽頁面中的貴賓展示樣式 */
  .p-guests-section {
    margin-top: 40px;
    padding-top: 30px;
    border-top: 1px solid #e2e8f0;
  }

  .p-section-title {
    font-size: 1.3rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin: 0 0 24px 0;
    text-align: center;
  }

  .p-guests-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
  }

  .p-guest-card {
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px;
    text-align: center;
    transition: all 0.3s;
    cursor: pointer;

    &:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
      border-color: var(--primary-blue);
    }
  }

  .p-guest-avatar {
    width: 70px;
    height: 70px;
    margin: 0 auto 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  .p-avatar-initial {
    font-size: 1.8rem;
    font-weight: 800;
    color: white;
  }

  .p-guest-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .p-guest-name {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--deep-dark);
  }

  .p-guest-title {
    font-size: 0.9rem;
    color: var(--text-gray);
    font-weight: 600;
  }

  .p-guest-company {
    font-size: 0.85rem;
    color: #475569; /* WCAG AA: 提升對比度到 6.57:1 */
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
    border: 2px dashed rgba(102, 126, 234, 0.3); /* WCAG AA: 提升邊框可見度 */
    display: flex;
    align-items: center;
    justify-content: center;
    &::after {
      content: "報名表單區域";
      color: rgba(102, 126, 234, 0.6); /* WCAG AA: 提升對比度 */
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

/* 貴賓詳細資訊彈窗 */
.guest-detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.guest-detail-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 480px;
  height: 100vh;
  background: white;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.guest-detail-header {
  padding: 24px 28px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: white;
  }

  .btn-close-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.5);
    background: transparent;
    color: white;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: white;
      transform: rotate(90deg);
    }
  }
}

.guest-detail-body {
  padding: 32px 28px;
  overflow-y: auto;
  flex: 1;
}

.detail-avatar-section {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.detail-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 4px solid #667eea;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);

  .avatar-img {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
  }

  .avatar-initial-large {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    font-weight: 600;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }
}

.detail-info-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

.detail-field {
  &.full-width {
    grid-column: 1 / -1;
  }

  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .detail-value {
    padding: 12px 16px;
    background: #f9fafb;
    border-radius: 8px;
    font-size: 15px;
    color: #1f2937;
    border: 1px solid #e5e7eb;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
}

/* 右側滑出動畫 */
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: all 0.3s ease;
}

.slide-panel-enter-from,
.slide-panel-leave-to {
  .guest-detail-overlay {
    background: rgba(0, 0, 0, 0);
  }

  .guest-detail-panel {
    transform: translateX(100%);
  }
}

.slide-panel-enter-to,
.slide-panel-leave-from {
  .guest-detail-overlay {
    background: rgba(0, 0, 0, 0.5);
  }

  .guest-detail-panel {
    transform: translateX(0);
  }
}
</style>
