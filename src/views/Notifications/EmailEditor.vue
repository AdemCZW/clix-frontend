<script setup>
import { reactive, ref, onMounted, computed } from "vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import { useToast } from "@/composables/useToast";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";

const { success, warning } = useToast();
const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();

// 1. 通知信資料模型
const mailSettings = reactive({
  subject: "【報名成功通知】感謝您參與本次活動",
  senderName: "活動小辦公室",
  content:
    "<h1>親愛的 {name} 您好：</h1><p>感謝您報名參加 <strong>{event_name}</strong>。</p><p>您的專屬報名序號為：{order_id}</p><p>期待您的蒞臨！</p>",
});

const myQuill = ref(null);
const showTemplateDrawer = ref(false);
const savedTemplates = ref([]);

// 參與者資料（從 participantsStore 載入）
const participants = computed(() => participantsStore.participants);

const selectedParticipants = ref([]);
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
const toggleParticipantSelection = (participant) => {
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

const isParticipantSelected = (participant) => {
  return selectedIdSet.value.has(participant.id);
};

// 智慧插入變數
const insertTag = (tag) => {
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

const deleteTemplate = (index) => {
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

const applyTemplate = (template) => {
  mailSettings.subject = template.subject;
  mailSettings.senderName = template.senderName;
  mailSettings.content = template.content;
  closeTemplateDrawer();
};

const sendTestEmail = () => {
  if (selectedParticipants.value.length === 0) {
    warning("請先選擇要發送的收件人！");
    return;
  }
  const recipientList = selectedParticipants.value.map((p) => `${p.name} (${p.email})`).join("\n");
  const confirmSend = confirm(
    `確定要發送測試郵件嗎？\n\n主旨：${mailSettings.subject}\n收件人數：${selectedParticipants.value.length} 人\n\n列表：\n${recipientList}`,
  );
  if (confirmSend) {
    success("測試發送成功！");
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
  try {
    const eventId = eventsStore.currentEvent?.id;
    await participantsStore.fetchParticipants(eventId ? { event: eventId } : {});
  } catch {
    warning("載入參與者資料失敗");
  }
});
</script>

<template>
  <div class="email-editor-view">
    <div class="page-header">
      <div class="header-actions">
        <button class="btn-send" @click="sendTestEmail">發送信件</button>
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

  </div>
</template>

<style scoped>
/* ===========================================
   📧 Email Editor 樣式
   =========================================== */

.email-editor-view {
  background: #f8fafc;
  min-height: 100vh;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --primary-blue: #3b82f6;
  --deep-dark: #0f172a;
  --text-gray: #475569;
  --bg-soft: #f8fafc;
  --border-light: #e2e8f0;
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
}

/* ===========================================
   🔘 按鈕樣式
   =========================================== */

.btn-send,
.btn-save {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.btn-send {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 0.95rem;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-send:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.btn-save {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 0.95rem;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-save:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.btn-view-templates {
  background: white;
  color: #475569;
  padding: 12px 24px;
  border-radius: 10px;
  border: 2px solid #e2e8f0;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.btn-view-templates:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.btn-secondary {
  padding: 8px 16px;
  font-size: 0.85rem;
  border: 2px solid #e2e8f0;
  background: white;
  color: #475569;
  cursor: pointer;
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.btn-secondary:hover {
  background: #f8fafc;
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
}

.panel {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s;
}

.panel:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--deep-dark);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 2px solid #f1f5f9;
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
  transition: 0.3s;
}

.custom-input:hover {
  border-color: #cbd5e1;
}

.custom-input:focus {
  border-color: var(--primary-blue);
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
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
}

.tag-item:hover {
  background: var(--primary-blue);
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
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
  min-height: 450px;
  font-family: inherit;
  font-size: 0.95rem;
}

.quill-container-fixed :deep(.ql-toolbar) {
  border: none;
  background: #f8fafc;
  border-bottom: 1px solid var(--border-light);
}

.quill-container-fixed:focus-within {
  border-color: var(--primary-blue);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

/* ===========================================
   👥 參與者選擇區域
   =========================================== */

.participants-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.selection-info {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--primary-blue);
  background: #eff6ff;
  padding: 4px 10px;
  border-radius: 8px;
}

.participants-controls {
  margin-bottom: 16px;
}

.filter-row {
  margin-bottom: 12px;
}

.filter-select {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  font-weight: 600;
  transition: 0.3s;
  cursor: pointer;
}

.filter-select:hover {
  border-color: #cbd5e1;
}

.filter-select:focus {
  outline: none;
  border-color: var(--primary-blue);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  font-weight: 600;
  transition: 0.3s;
  margin-bottom: 12px;
}

.search-input:hover {
  border-color: #cbd5e1;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-blue);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.participants-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  background: #fafbfc;
}

.participant-item {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.participant-item:last-child {
  border-bottom: none;
}

.participant-item:hover {
  background: #f1f5f9;
}

.participant-item.selected {
  background: #eff6ff;
  border-left: 3px solid var(--primary-blue);
}

.participant-info {
  flex: 1;
  cursor: pointer;
}

.participant-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1e293b;
  margin-bottom: 2px;
}

.participant-email {
  font-size: 0.8rem;
  color: #475569;
}

.participant-detail {
  font-size: 0.78rem;
  color: #64748b;
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
  background: #f1f5f9;
  color: #64748b;
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
  background: white;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  border-left: 1px solid #f1f5f9;
}

.drawer-header {
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  position: sticky;
  top: 0;
  z-index: 1;
}

.drawer-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #1e293b;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #475569;
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
  color: #1e293b;
  background: #e2e8f0;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.template-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.2s ease;
  background: white;
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
  color: #1e293b;
  margin-bottom: 4px;
  flex: 1;
}

.template-date {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
  white-space: nowrap;
  margin-left: 12px;
}

.btn-delete-template {
  background: none;
  border: none;
  color: #94a3b8;
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

@media (max-width: 1200px) {
  .editor-layout {
    grid-template-columns: 1fr 300px;
    gap: 20px;
  }

  .template-drawer {
    width: 340px;
  }
}

@media (max-width: 1024px) {
  .email-editor-view {
    padding: 20px;
  }

  .editor-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .participants-side {
    order: -1;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
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

@media (max-width: 768px) {
  .email-editor-view {
    padding: 16px;
  }

  .panel {
    padding: 16px;
  }

  .participants-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .filter-row {
    margin-bottom: 8px;
  }

  .action-buttons {
    flex-direction: column;
  }

  .participant-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .template-info {
    flex-direction: column;
    gap: 8px;
  }

  .template-date {
    margin-left: 0;
    align-self: flex-end;
  }
}

@media (max-width: 480px) {
  .email-editor-view {
    padding: 12px;
  }

  .page-header {
    padding: 16px;
  }

  .header-actions {
    flex-direction: column;
    gap: 8px;
  }

  .btn-send,
  .btn-save,
  .btn-view-templates {
    width: 100%;
    padding: 12px;
  }

  .editor-layout {
    gap: 16px;
  }

  .participants-list {
    max-height: 300px;
  }

  .template-drawer {
    width: 100%;
    max-width: none;
  }
}

/* ===========================================
   🛠️ 工具類
   =========================================== */

.mt-10 {
  margin-top: 10px;
}
</style>
