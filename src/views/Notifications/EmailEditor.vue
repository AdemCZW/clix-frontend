<script setup>
import { reactive, ref, onMounted, computed } from "vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";

// 1. 通知信資料模型
const mailSettings = reactive({
  subject: "【報名成功通知】感謝您參與本次活動",
  senderName: "活動小辦公室",
  content:
    "<h1>親愛的 {name} 您好：</h1><p>感謝您報名參加 <strong>{event_name}</strong>。</p><p>您的專屬報名序號為：{order_id}</p><p>期待您的蒞臨！</p>",
  enableAutoSend: true,
});

const myQuill = ref(null);
const showTemplateDrawer = ref(false);
const savedTemplates = ref([]);

// 參與者資料
const participants = ref([
  {
    id: 1,
    name: "張小明",
    company: "文靜科技",
    title: "CTO",
    activity: "2025 技術峰會",
    email: "zhang@example.com",
    createdAt: "2025-12-29 14:00",
  },
  {
    id: 2,
    name: "李小華",
    company: "創新有限公司",
    title: "PM",
    activity: "2025 技術峰會",
    email: "li@example.com",
    createdAt: "2025-12-29 15:30",
  },
  {
    id: 3,
    name: "王小美",
    company: "設計工作室",
    title: "UI Designer",
    activity: "AI 產業論壇",
    email: "wang@example.com",
    createdAt: "2025-12-29 16:00",
  },
  {
    id: 4,
    name: "陳大華",
    company: "數據分析公司",
    title: "Data Scientist",
    activity: "2025 技術峰會",
    email: "chen@example.com",
    createdAt: "2025-12-29 17:15",
  },
]);

const selectedParticipants = ref([]);
const searchQuery = ref("");
const selectedActivity = ref("所有活動");
const activityOptions = ref(["所有活動", "2025 技術峰會", "AI 產業論壇"]);

// 修正後的過濾邏輯
const getFilteredParticipants = computed(() => {
  let result = participants.value;
  if (selectedActivity.value !== "所有活動") {
    result = result.filter((p) => p.activity === selectedActivity.value);
  }
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.company.toLowerCase().includes(query) ||
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

const isParticipantSelected = (participant) => {
  return selectedParticipants.value.some((p) => p.id === participant.id);
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
  const data = localStorage.getItem("email_templates");
  savedTemplates.value = data ? JSON.parse(data) : [];
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
  alert("通知信樣板已成功儲存！");
};

const applyTemplate = (template) => {
  mailSettings.subject = template.subject;
  mailSettings.senderName = template.senderName;
  mailSettings.content = template.content;
  closeTemplateDrawer();
};

const sendTestEmail = () => {
  if (selectedParticipants.value.length === 0) {
    alert("請先選擇要發送的收件人！");
    return;
  }
  const recipientList = selectedParticipants.value.map((p) => `${p.name} (${p.email})`).join("\n");
  const confirmSend = confirm(
    `確定要發送測試郵件嗎？\n\n主旨：${mailSettings.subject}\n收件人數：${selectedParticipants.value.length} 人\n\n列表：\n${recipientList}`,
  );
  if (confirmSend) {
    alert("測試發送成功！");
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

onMounted(() => {
  loadTemplates();
});
</script>

<template>
  <div class="email-editor-view">
    <div class="page-header">
      <div class="header-text">
        <h2 class="title">4. 通知信設定</h2>
        <p class="subtitle">管理您的參與者名單並發送 HTML 郵件</p>
      </div>
      <div class="header-actions">
        <button class="btn-send" @click="sendTestEmail">發送信件</button>
        <button class="btn-save" @click="saveSettings">儲存目前樣板</button>
        <button class="btn-view-templates" @click="openTemplateDrawer">查看樣板庫</button>
      </div>
    </div>

    <div class="editor-layout">
      <div class="panel config-side">
        <h3 class="panel-title">發送參數設定</h3>
        <div class="input-group">
          <label>郵件主旨</label>
          <input v-model="mailSettings.subject" class="custom-input" />
        </div>
        <div class="input-group">
          <label>寄件者名稱</label>
          <input v-model="mailSettings.senderName" class="custom-input" />
        </div>
        <div class="auto-send-card">
          <div class="card-info">
            <span class="label">報名完成即刻發送</span>
          </div>
          <label class="switch-container">
            <input type="checkbox" v-model="mailSettings.enableAutoSend" />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <div class="panel editor-side">
        <h3 class="panel-title">郵件內文編輯</h3>
        <div class="variable-bar">
          <div class="tag-list">
            <button class="tag-item" @click="insertTag('{name}')"><span>{name}</span> 姓名</button>
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

      <div class="panel participants-side">
        <div class="participants-header">
          <h3 class="panel-title">選擇收件人</h3>
          <div class="selection-info">已選 {{ selectedParticipants.length }} 人</div>
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
            @click="toggleParticipantSelection(p)"
          >
            <div class="participant-info">
              <div class="participant-name">{{ p.name }}</div>
              <div class="participant-email">{{ p.email }}</div>
            </div>
            <div class="participant-activity">{{ p.activity }}</div>
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
                @click="applyTemplate(template)"
              >
                <div class="template-info">
                  <div class="template-subject">{{ template.subject }}</div>
                  <div class="template-date">
                    {{ new Date(template.date).toLocaleDateString() }}
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

<style scoped>
/* ===========================================
   📧 Email Editor 樣式
   =========================================== */

.email-editor-view {
  background-color: #f8fafc;
  min-height: 100vh;
  padding: 30px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* ===========================================
   📋 頁面標題區域
   =========================================== */

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header-text {
  flex: 1;
}

.title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 4px 0;
}

.subtitle {
  font-size: 0.9rem;
  color: #64748b;
  margin: 0;
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
  background: #10b981;
}

.btn-send:hover {
  background: #059669;
  transform: translateY(-1px);
}

.btn-save {
  background: #0ea5e9;
}

.btn-save:hover {
  background: #0284c7;
  transform: translateY(-1px);
}

.btn-view-templates {
  background: #e2e8f0;
  color: #475569;
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.btn-view-templates:hover {
  background: #cbd5e1;
  transform: translateY(-1px);
}

.btn-secondary {
  padding: 6px 12px;
  font-size: 0.8rem;
  border: 1px solid #d1d5db;
  background: white;
  color: #374151;
  cursor: pointer;
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

/* ===========================================
   📐 主要佈局
   =========================================== */

.editor-layout {
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  gap: 24px;
  align-items: start;
}

.panel {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.panel-title {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 16px;
  color: #1e293b;
  border-left: 4px solid #0ea5e9;
  padding-left: 12px;
}

/* ===========================================
   ⚙️ 配置面板
   =========================================== */

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.custom-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.custom-input:focus {
  outline: none;
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
}

.auto-send-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  margin-top: 16px;
}

.card-info .label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
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
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: white;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  color: #475569;
  transition: all 0.2s ease;
}

.tag-item:hover {
  border-color: #0ea5e9;
  background: #f0f9ff;
}

.tag-item span {
  color: #0ea5e9;
  font-weight: 700;
  margin-right: 4px;
}

.quill-container-fixed {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  overflow: hidden;
}

.quill-container-fixed:focus-within {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
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
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 500;
}

.participants-controls {
  margin-bottom: 16px;
}

.filter-row {
  margin-bottom: 12px;
}

.filter-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.9rem;
  background: white;
}

.filter-select:focus {
  outline: none;
  border-color: #0ea5e9;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.9rem;
  margin-bottom: 12px;
}

.search-input:focus {
  outline: none;
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
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
  border-left: 3px solid #0ea5e9;
}

.participant-info {
  flex: 1;
}

.participant-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1e293b;
  margin-bottom: 2px;
}

.participant-email {
  font-size: 0.8rem;
  color: #64748b;
}

.participant-activity {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
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
  color: #64748b;
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
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
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

/* ===========================================
   🔄 Switch 組件
   =========================================== */

.switch-container {
  position: relative;
  width: 44px;
  height: 24px;
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
  background: #cbd5e1;
  border-radius: 24px;
  transition: all 0.3s ease;
}

.switch-slider:before {
  content: "";
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

input:checked + .switch-slider {
  background: #0ea5e9;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
}

input:checked + .switch-slider:before {
  transform: translateX(20px);
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
    grid-template-columns: 260px 1fr 300px;
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

  .title {
    font-size: 1.25rem;
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
