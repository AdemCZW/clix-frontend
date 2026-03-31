<script setup lang="ts">
import { reactive, ref, onMounted, computed } from "vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import { useToast } from "@/composables/useToast";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { apiRequest } from "@/utils/api";
import { setupQuillImageUpload } from "@/composables/useQuillImageUpload";
import PageLoader from "@/components/shared/PageLoader.vue";
import type { Participant } from "@/types";

interface EmailTemplate {
  subject: string;
  senderName: string;
  content: string;
  date: string;
}

const { success, warning } = useToast();
const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();

const pageLoading = ref(true);

// 1. 通知信資料模型
const mailSettings = reactive({
  subject: "【報名成功通知】感謝您參與本次活動",
  senderName: "活動小辦公室",
  content:
    "<h1>親愛的 {name} 您好：</h1><p>感謝您報名參加 <strong>{event_name}</strong>。</p><p>您的專屬報名序號為：{order_id}</p><p>期待您的蒞臨！</p>",
});

const myQuill = ref<InstanceType<typeof QuillEditor> | null>(null);
const showTemplateDrawer = ref(false);
const savedTemplates = ref<EmailTemplate[]>([]);

// 參與者資料（從 participantsStore 載入）
const participants = computed(() => participantsStore.participants);

const selectedParticipants = ref<Participant[]>([]);
const searchQuery = ref("");
const selectedActivity = ref("所有活動");

// 從參與者資料動態產生活動選項
const activityOptions = computed(() => {
  const names = new Set(participants.value.map((p) => p.eventName).filter(Boolean));
  return ["所有活動", ...names];
});

// 修正後的過濾邏輯
const getFilteredParticipants = computed(() => {
  let result = participants.value;
  if (selectedActivity.value !== "所有活動") {
    result = result.filter((p) => p.eventName === selectedActivity.value);
  }
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.company || "").toLowerCase().includes(query) ||
        p.email.toLowerCase().includes(query),
    );
  }
  return result;
});

// 選擇邏輯修正
const toggleParticipantSelection = (participant: Participant) => {
  const index = selectedParticipants.value.findIndex((p) => p.id === participant.id);
  if (index > -1) {
    selectedParticipants.value.splice(index, 1);
  } else {
    selectedParticipants.value.push(participant);
  }
};

const selectAllParticipants = () => {
  selectedParticipants.value = [...getFilteredParticipants.value];
};

const clearSelection = () => {
  selectedParticipants.value = [];
};

const selectedIdSet = computed(() => new Set(selectedParticipants.value.map((p) => p.id)));

const isParticipantSelected = (participant: Participant) => {
  return selectedIdSet.value.has(participant.id);
};

// 智慧插入變數
const insertTag = (tag: string) => {
  if (!myQuill.value) return;
  const quill = myQuill.value.getQuill();
  const range = quill.getSelection(true);
  if (range) {
    quill.insertText(range.index, tag);
    quill.setSelection(range.index + tag.length);
  } else {
    const length = quill.getLength();
    quill.insertText(length - 1, tag);
  }
};

// 樣板邏輯修正
const loadTemplates = () => {
  try {
    const data = localStorage.getItem("email_templates");
    savedTemplates.value = data ? JSON.parse(data) : [];
  } catch {
    savedTemplates.value = [];
    localStorage.removeItem("email_templates");
  }
};

const deleteTemplate = (index: number) => {
  savedTemplates.value.splice(index, 1);
  localStorage.setItem("email_templates", JSON.stringify(savedTemplates.value));
};

const openTemplateDrawer = () => {
  loadTemplates();
  showTemplateDrawer.value = true;
};

const closeTemplateDrawer = () => {
  showTemplateDrawer.value = false;
};

const saveSettings = () => {
  const newTemplate = {
    subject: mailSettings.subject,
    senderName: mailSettings.senderName,
    content: mailSettings.content,
    date: new Date().toISOString(),
  };
  const data = localStorage.getItem("email_templates");
  const arr = data ? JSON.parse(data) : [];
  arr.unshift(newTemplate);
  localStorage.setItem("email_templates", JSON.stringify(arr));
  loadTemplates();
  success("通知信樣板已成功儲存！");
};

const applyTemplate = (template: EmailTemplate) => {
  mailSettings.subject = template.subject;
  mailSettings.senderName = template.senderName;
  mailSettings.content = template.content;
  closeTemplateDrawer();
};

const sending = ref(false);
const cooldown = ref(0);
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

const sendBtnText = computed(() => {
  if (sending.value) return "發送中...";
  if (cooldown.value > 0) return `${cooldown.value}s 後可再次發送`;
  return "發送信件";
});

const startCooldown = (seconds = 30) => {
  cooldown.value = seconds;
  cooldownTimer = setInterval(() => {
    cooldown.value--;
    if (cooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
};

const sendEmail = async () => {
  if (sending.value || cooldown.value > 0) return;

  if (selectedParticipants.value.length === 0) {
    warning("請先選擇要發送的收件人！");
    return;
  }

  const withEmail = selectedParticipants.value.filter((p) => p.email);
  const noEmail = selectedParticipants.value.length - withEmail.length;
  if (withEmail.length === 0) {
    warning("所選參與者都沒有 Email，無法發送！");
    return;
  }

  const confirmMsg = [
    `確定要發送郵件嗎？`,
    ``,
    `主旨：${mailSettings.subject}`,
    `收件人數：${withEmail.length} 人`,
    noEmail > 0 ? `（${noEmail} 人無 Email 將被略過）` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!confirm(confirmMsg)) return;

  sending.value = true;
  try {
    const res = await apiRequest("/api/send-email/", {
      method: "POST",
      body: JSON.stringify({
        subject: mailSettings.subject,
        sender_name: mailSettings.senderName,
        content: mailSettings.content,
        participant_ids: withEmail.map((p) => p.id),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `發送失敗 (${res.status})`);
    }

    const data = await res.json();
    success(data.message || "郵件發送成功！");

    if (data.skipped_count > 0) {
      warning(`${data.skipped_count} 位參與者因無 Email 被略過`);
    }

    // 發送成功後啟動 30 秒冷卻，防止重複發送
    startCooldown(30);
  } catch (err) {
    warning((err as Error).message || "郵件發送失敗，請稍後再試");
  } finally {
    sending.value = false;
  }
};

const editorOptions = {
  modules: {
    toolbar: [
      ["bold", "italic", "underline"],
      [{ header: [1, 2, false] }],
      [{ color: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["image", "clean"],
    ],
  },
  placeholder: "請在此輸入郵件內文...",
  theme: "snow",
};

onMounted(async () => {
  loadTemplates();
  // Quill 圖片上傳（取代 base64）
  setTimeout(() => {
    if (myQuill.value) setupQuillImageUpload(myQuill.value);
  }, 100);
  try {
    const eventId = eventsStore.currentEvent?.id;
    await participantsStore.fetchParticipants(eventId ? { event: String(eventId) } : {});
  } catch {
    warning("載入參與者資料失敗");
  } finally {
    pageLoading.value = false;
  }
});
</script>

<template>
  <div class="email-editor-view">
    <PageLoader v-if="pageLoading" text="載入中..." />

    <template v-else>
    <div class="page-header">
      <div class="header-actions">
        <button class="btn-send" :disabled="sending || cooldown > 0" @click="sendEmail">{{ sendBtnText }}</button>
        <button class="btn-save" @click="saveSettings">儲存目前樣板</button>
        <button class="btn-view-templates" @click="openTemplateDrawer">查看樣板庫</button>
      </div>
    </div>

    <div class="editor-layout">
      <div class="left-section">
        <div class="panel config-side">
          <h3 class="panel-title">發送參數設定</h3>
          <div class="config-grid">
            <div class="input-group">
              <label>郵件主旨</label>
              <input v-model="mailSettings.subject" class="custom-input" />
            </div>
            <div class="input-group">
              <label>寄件者名稱</label>
              <input v-model="mailSettings.senderName" class="custom-input" />
            </div>
          </div>
        </div>

        <div class="panel editor-side">
          <h3 class="panel-title">郵件內文編輯</h3>
          <div class="variable-bar">
            <div class="tag-list">
              <button class="tag-item" @click="insertTag('{name}')">
                <span>{name}</span> 姓名
              </button>
              <button class="tag-item" @click="insertTag('{event_name}')">
                <span>{event_name}</span> 活動名
              </button>
              <button class="tag-item" @click="insertTag('{order_id}')">
                <span>{order_id}</span> 序號
              </button>
            </div>
          </div>
          <div class="quill-container-fixed">
            <QuillEditor
              ref="myQuill"
              v-model:content="mailSettings.content"
              contentType="html"
              :options="editorOptions"
            />
          </div>
        </div>
      </div>

      <div class="panel participants-side">
        <div class="participants-header">
          <h3 class="panel-title">選擇收件人</h3>
          <div class="selection-info">已選 {{ selectedParticipants.length }} / {{ participants.length }} 人</div>
        </div>
        <div class="participants-controls">
          <div class="filter-row">
            <select v-model="selectedActivity" class="filter-select">
              <option v-for="act in activityOptions" :key="act" :value="act">{{ act }}</option>
            </select>
          </div>
          <input v-model="searchQuery" class="search-input" placeholder="搜尋姓名..." />
          <div class="action-buttons mt-10">
            <button class="btn-secondary" @click="selectAllParticipants">全選</button>
            <button class="btn-secondary" @click="clearSelection">清除</button>
          </div>
        </div>
        <div class="participants-list">
          <div
            v-for="p in getFilteredParticipants"
            :key="p.id"
            class="participant-item"
            :class="{ selected: isParticipantSelected(p) }"
          >
            <div class="participant-info" @click="toggleParticipantSelection(p)">
              <div class="participant-name">{{ p.name }}</div>
              <div class="participant-detail">{{ p.company }}<span v-if="p.title"> · {{ p.title }}</span></div>
              <div class="participant-email">{{ p.email }}</div>
              <div class="participant-meta">
                <span v-if="p.phone" class="meta-tag">{{ p.phone }}</span>
                <span class="meta-tag" :class="p.status === '已報到' ? 'checked-in' : ''">{{ p.status || '未報到' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="showTemplateDrawer" class="drawer-overlay" @click="closeTemplateDrawer">
          <div class="template-drawer" @click.stop>
            <div class="drawer-header">
              <h3>樣板庫</h3>
              <button class="btn-close" @click="closeTemplateDrawer">✕</button>
            </div>
            <div class="drawer-content">
              <div
                v-for="(template, index) in savedTemplates"
                :key="index"
                class="template-item"
              >
                <div class="template-info" @click="applyTemplate(template)">
                  <div class="template-subject">{{ template.subject }}</div>
                  <div class="template-date">
                    {{ new Date(template.date).toLocaleDateString() }}
                  </div>
                </div>
                <button class="btn-delete-template" @click="deleteTemplate(index)" title="刪除樣板">✕</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    </template>
  </div>
</template>

<style scoped>
/* ===========================================
   📧 Email Editor 樣式
   =========================================== */

.email-editor-view {
  background: var(--bg-primary);
  min-height: 100vh;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --primary: #6366f1;
  --deep-dark: #0f172a;
  --text-gray: #475569;
  --bg-soft: #f8fafc;
  --border-light: #e2e8f0;
}

.email-editor-view *,
.email-editor-view *::before,
.email-editor-view *::after {
  box-sizing: border-box;
}

/* ===========================================
   📋 頁面標題區域
   =========================================== */

.page-header {
  padding: 0 0 20px 0;
  margin-bottom: 20px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

/* ===========================================
   🔘 按鈕樣式
   =========================================== */

.btn-send,
.btn-save {
  padding: 12px 24px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  color: white;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-send {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-send:hover:not(:disabled) {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.btn-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-save {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-save:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}

.btn-view-templates {
  background: var(--bg-card);
  color: var(--text-secondary);
  padding: 12px 24px;
  border-radius: 10px;
  border: 2px solid var(--border-color);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  white-space: nowrap;
}

.btn-view-templates:hover {
  background: var(--bg-primary);
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.btn-secondary {
  padding: 8px 16px;
  font-size: 0.85rem;
  border: 2px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.btn-secondary:hover {
  background: var(--bg-primary);
  border-color: #cbd5e1;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
}

/* ===========================================
   📐 主要佈局
   =========================================== */

.editor-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 20px;
  align-items: start;
}

.left-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.panel {
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-light);
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s;
  min-width: 0;
}

.panel:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--deep-dark);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--border-light);
}

/* ===========================================
   ⚙️ 配置面板
   =========================================== */

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.input-group {
  margin-bottom: 0;
}

.input-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--deep-dark);
  margin-bottom: 8px;
}

.custom-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  font-weight: 600;
  font-size: 0.9rem;
  transition: 0.3s;
}

.custom-input:hover {
  border-color: #cbd5e1;
}

.custom-input:focus {
  border-color: #6366f1;
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

/* ===========================================
   ✏️ 編輯器區域
   =========================================== */

.variable-bar {
  margin-bottom: 16px;
}

.tag-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag-item {
  background: #eef2ff;
  border: 1px solid #e0e7ff;
  color: #6366f1;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s;
}

.tag-item:hover {
  background: #6366f1;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.tag-item span {
  color: inherit;
  font-weight: inherit;
  margin-right: 4px;
}

.quill-container-fixed {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: hidden;
}

.quill-container-fixed :deep(.ql-container) {
  min-height: 400px;
  font-family: inherit;
  font-size: 0.95rem;
}

.quill-container-fixed :deep(.ql-toolbar) {
  border: none;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-light);
}

.quill-container-fixed :deep(.ql-editor) {
  min-height: 400px;
}

.quill-container-fixed:focus-within {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

/* ===========================================
   👥 參與者選擇區域
   =========================================== */

.participants-side {
  position: sticky;
  top: 20px;
}

.participants-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 8px;
}

.selection-info {
  font-size: 0.85rem;
  font-weight: 700;
  color: #6366f1;
  background: #eef2ff;
  padding: 4px 10px;
  border-radius: 8px;
  white-space: nowrap;
}

.participants-controls {
  margin-bottom: 16px;
}

.filter-row {
  margin-bottom: 12px;
}

.filter-select {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  font-weight: 600;
  font-size: 0.85rem;
  transition: 0.3s;
  cursor: pointer;
}

.filter-select:hover {
  border-color: #cbd5e1;
}

.filter-select:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  font-weight: 600;
  font-size: 0.85rem;
  transition: 0.3s;
  margin-bottom: 12px;
}

.search-input:hover {
  border-color: #cbd5e1;
}

.search-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.participants-list {
  max-height: 500px;
  overflow-y: auto;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  background: #fafbfc;
}

.participant-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: all 0.2s ease;
}

.participant-item:last-child {
  border-bottom: none;
}

.participant-item:hover {
  background: var(--bg-hover);
}

.participant-item.selected {
  background: #eef2ff;
  border-left: 3px solid #6366f1;
}

.participant-info {
  cursor: pointer;
}

.participant-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-main);
  margin-bottom: 2px;
}

.participant-email {
  font-size: 0.8rem;
  color: var(--text-secondary);
  word-break: break-all;
}

.participant-detail {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.participant-meta {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.meta-tag {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--text-muted);
}

.meta-tag.checked-in {
  background: #d1fae5;
  color: #065f46;
}

/* ===========================================
   🎨 抽屜式側邊欄
   =========================================== */

.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(2px);
  z-index: 9999;
  display: flex;
  justify-content: flex-end;
}

.template-drawer {
  width: 380px;
  height: 100vh;
  background: var(--bg-card);
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  border-left: 1px solid #f1f5f9;
}

.drawer-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-primary);
  position: sticky;
  top: 0;
  z-index: 1;
}

.drawer-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.btn-close:hover {
  color: var(--text-main);
  background: #e2e8f0;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.template-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.2s ease;
  background: var(--bg-card);
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-item .template-info {
  flex: 1;
  cursor: pointer;
}

.template-item:hover {
  border-color: #0ea5e9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.template-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.template-subject {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-main);
  margin-bottom: 4px;
  flex: 1;
}

.template-date {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 500;
  white-space: nowrap;
  margin-left: 12px;
}

.btn-delete-template {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.btn-delete-template:hover {
  color: #ef4444;
  background: #fef2f2;
}

/* ===========================================
   🎭 動畫效果
   =========================================== */

.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* ===========================================
   📱 響應式設計
   =========================================== */

/* 大平板 / 小桌面 */
@media (max-width: 1200px) {
  .editor-layout {
    grid-template-columns: 1fr 300px;
  }

  .template-drawer {
    width: 340px;
  }
}

/* 平板 — 單欄佈局 */
@media (max-width: 1024px) {
  .email-editor-view {
    padding: 16px;
  }

  .editor-layout {
    grid-template-columns: 1fr;
  }

  .participants-side {
    position: static;
    order: -1;
  }

  .participants-list {
    max-height: 280px;
  }

  .quill-container-fixed :deep(.ql-container),
  .quill-container-fixed :deep(.ql-editor) {
    min-height: 300px;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .template-drawer {
    width: 100%;
    max-width: 400px;
  }
}

/* 手機橫屏 */
@media (max-width: 768px) {
  .email-editor-view {
    padding: 12px;
  }

  .page-header {
    padding: 0 0 12px 0;
    margin-bottom: 12px;
  }

  .panel {
    padding: 14px;
    border-radius: 12px;
  }

  .config-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .participants-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .participants-list {
    max-height: 240px;
  }

  .quill-container-fixed :deep(.ql-container),
  .quill-container-fixed :deep(.ql-editor) {
    min-height: 250px;
  }

  .template-info {
    flex-direction: column;
    gap: 4px;
  }

  .template-date {
    margin-left: 0;
  }
}

/* 手機直屏 */
@media (max-width: 480px) {
  .email-editor-view {
    padding: 8px;
  }

  .header-actions {
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .btn-send,
  .btn-save,
  .btn-view-templates {
    width: 100%;
    text-align: center;
    padding: 12px;
  }

  .editor-layout {
    gap: 12px;
  }

  .panel {
    padding: 12px;
    border-radius: 10px;
  }

  .tag-item {
    font-size: 0.75rem;
    padding: 4px 8px;
  }

  .participants-list {
    max-height: 200px;
  }

  .quill-container-fixed :deep(.ql-container),
  .quill-container-fixed :deep(.ql-editor) {
    min-height: 200px;
  }

  .template-drawer {
    width: 100%;
    max-width: none;
  }

  .action-buttons {
    flex-direction: column;
  }
}

/* ===========================================
   🛠️ 工具類
   =========================================== */

.mt-10 {
  margin-top: 10px;
}
</style>
