<script setup>
import { reactive, ref, computed } from "vue";
import draggable from "vuedraggable";

// --- 資料與邏輯 ---
const fields = reactive([
  { id: 1, label: "姓名", type: "text", required: true, isFixed: true, isHidden: false },
  {
    id: 3,
    label: "接送車次",
    type: "select",
    required: false,
    isFixed: false,
    isHidden: false,
    options: [
      { id: 101, text: "第一車 08:00" },
      { id: 102, text: "第二車 09:00" },
    ],
  },
]);

const newFieldLabel = ref("");
const newFieldType = ref("text");

const addField = () => {
  if (!newFieldLabel.value) return;
  fields.push({
    id: Date.now(),
    label: newFieldLabel.value,
    type: newFieldType.value,
    required: false,
    isFixed: false,
    isHidden: false,
    options: newFieldType.value === "select" ? [{ id: Date.now() + 1, text: "新選項 1" }] : [],
  });
  newFieldLabel.value = "";
};

const removeField = (index) => fields.splice(index, 1);
const addOption = (field) =>
  field.options.push({ id: Date.now(), text: `新選項 ${field.options.length + 1}` });
const removeOption = (field, optIndex) => field.options.splice(optIndex, 1);
const visibleFields = computed(() => fields.filter((f) => !f.isHidden));
</script>

<template>
  <div class="fields-config">
    <div class="page-header">
      <h2 class="title">3. 報名表欄位設定</h2>
      <div class="header-actions">
        <span class="status-tag">自動儲存中</span>
      </div>
    </div>

    <div class="config-layout">
      <div class="edit-panel">
        <div class="section-title">自定義欄位 (可拖拽排序)</div>

        <draggable
          :list="fields"
          item-key="id"
          handle=".drag-icon-main"
          ghost-class="ghost-card"
          chosen-class="chosen-card"
          animation="200"
          class="field-list"
        >
          <template #item="{ element: field, index }">
            <div class="field-card-container" :class="{ 'is-hidden-field': field.isHidden }">
              <div class="field-card-main">
                <div class="field-info">
                  <span class="drag-icon-main"></span>
                  <input
                    v-model="field.label"
                    :disabled="field.isFixed"
                    class="field-label-input"
                    placeholder="欄位名稱"
                  />
                  <span class="type-badge">{{ field.type }}</span>
                  <span v-if="field.isHidden" class="hidden-badge">隱藏中</span>
                </div>

                <div class="field-ctrl">
                  <label class="toggle-btn" :class="{ 'is-active': field.isHidden }">
                    <input type="checkbox" v-model="field.isHidden" />
                    <span>{{ field.isHidden ? "隱藏" : "顯示" }}</span>
                  </label>

                  <label v-if="!field.isHidden" class="req-toggle">
                    <input type="checkbox" v-model="field.required" />
                    <span>必填</span>
                  </label>

                  <button v-if="!field.isFixed" @click="removeField(index)" class="delete-btn">
                    ✕
                  </button>
                </div>
              </div>

              <div v-if="field.type === 'select'" class="options-editor">
                <div class="options-header">選項內容設定</div>
                <draggable
                  :list="field.options"
                  item-key="id"
                  handle=".drag-handle"
                  ghost-class="ghost-option"
                  animation="150"
                  class="options-list-wrapper"
                >
                  <template #item="{ element: opt, index: optIdx }">
                    <div class="opt-item">
                      <span class="drag-handle"></span>
                      <input v-model="opt.text" placeholder="選項名稱" class="opt-input" />
                      <button @click="removeOption(field, optIdx)" class="opt-del">✕</button>
                    </div>
                  </template>
                </draggable>
                <button @click="addOption(field)" class="btn-add-opt">+ 新增選項</button>
              </div>
            </div>
          </template>
        </draggable>

        <div class="add-control">
          <input
            v-model="newFieldLabel"
            @keyup.enter="addField"
            placeholder="新增欄位..."
            class="add-input"
          />
          <select v-model="newFieldType" class="add-select">
            <option value="text">純文字</option>
            <option value="tel">電話號碼</option>
            <option value="select">下拉選單</option>
          </select>
          <button @click="addField" class="btn-add-field">+</button>
        </div>
      </div>

      <div class="preview-panel">
        <div class="phone-frame">
          <div class="phone-screen">
            <div class="phone-header">活動報名表</div>
            <div class="phone-content">
              <div v-for="field in visibleFields" :key="field.id" class="preview-item">
                <label class="preview-label">
                  {{ field.label }}
                  <span v-if="field.required" class="star">*</span>
                </label>
                <select v-if="field.type === 'select'" class="dummy-select">
                  <option v-for="opt in field.options" :key="opt.id">{{ opt.text }}</option>
                </select>
                <div v-else class="dummy-input"></div>
              </div>
              <div v-if="visibleFields.length === 0" class="empty-hint">尚未設定顯示欄位</div>
              <button class="dummy-submit">確認報名</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 佈局重設 */
.fields-config {
  font-family: -apple-system, "Noto Sans TC", sans-serif;
  padding: 20px;
  background-color: #fcfcfc;
  min-height: 100vh;
}
.config-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 30px;
}

/* 拖曳樣式強化 - 這是防止位置跳動的關鍵 */
.chosen-card {
  background-color: #f0f9ff !important;
  border: 1px solid #0ea5e9 !important;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1) !important;
  opacity: 1 !important;
}
.ghost-card {
  opacity: 0.3 !important;
  background: #e0f2fe !important;
  border: 2px dashed #0ea5e9 !important;
}
.ghost-option {
  opacity: 0.3 !important;
  background: #cbd5e1 !important;
}

/* 卡片主體 */
.field-card-container {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 15px;
  transition: all 0.2s;
}
.is-hidden-field {
  background-color: #f8fafc !important;
  border-style: dashed !important;
  opacity: 0.8;
}
.is-hidden-field .field-label-input {
  color: #94a3b8;
}

.field-card-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
}
.field-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 拖曳手把樣式 */
.drag-icon-main,
.drag-handle {
  cursor: grab;
  color: #cbd5e1;
  font-size: 1.2rem;
  user-select: none;
  display: inline-block;
  width: 20px;
}
.drag-icon-main:active,
.drag-handle:active {
  cursor: grabbing;
}

.field-label-input {
  border: 1px solid transparent;
  font-weight: 600;
  font-size: 1rem;
  width: 160px;
  padding: 4px;
  background: transparent;
}
.field-label-input:focus {
  outline: none;
  border-bottom: 1px solid #0ea5e9;
}

.type-badge {
  font-size: 0.7rem;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}
.hidden-badge {
  background: #f59e0b;
  color: white;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
}

/* 按鈕與控制 */
.field-ctrl {
  display: flex;
  align-items: center;
  gap: 15px;
}
.toggle-btn {
  font-size: 0.75rem;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  background: white;
  transition: 0.3s;
}
.toggle-btn.is-active {
  background: #334155;
  color: white;
  border-color: #334155;
}
.toggle-btn input {
  display: none;
}
.req-toggle {
  font-size: 0.85rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.delete-btn {
  border: none;
  background: none;
  color: #fca5a5;
  font-size: 1.1rem;
  cursor: pointer;
  transition: 0.2s;
}
.delete-btn:hover {
  color: #f87171;
}

/* 下拉選項編輯區 - 強制固定樣式 */
.options-editor {
  background: #f8fafc;
  padding: 15px 15px 15px 50px;
  border-top: 1px solid #f1f5f9;
}
.options-header {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 10px;
  font-weight: bold;
}
.opt-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #ffffff;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  margin-bottom: 8px;
}
.opt-input {
  border: none;
  flex: 1;
  font-size: 0.85rem;
  outline: none;
  background: transparent;
}
.opt-del {
  border: none;
  background: none;
  color: #cbd5e1;
  cursor: pointer;
  font-size: 0.9rem;
}
.btn-add-opt {
  width: 100%;
  border: 1px dashed #cbd5e1;
  background: #ffffff;
  padding: 8px;
  border-radius: 8px;
  color: #64748b;
  font-size: 0.8rem;
  cursor: pointer;
}

/* 手機預覽 */
.phone-frame {
  background: #0f172a;
  padding: 12px;
  border-radius: 35px;
  height: 580px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
}
.phone-screen {
  background: white;
  height: 100%;
  border-radius: 25px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.phone-header {
  padding: 18px;
  text-align: center;
  font-weight: bold;
  border-bottom: 1px solid #f1f5f9;
  font-size: 1rem;
}
.phone-content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}
.preview-item {
  margin-bottom: 18px;
}
.preview-label {
  font-size: 0.8rem;
  font-weight: 600;
  display: block;
  margin-bottom: 6px;
}
.dummy-input,
.dummy-select {
  width: 100%;
  height: 40px;
  background: #f1f5f9;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.dummy-submit {
  width: 100%;
  padding: 14px;
  background: #0ea5e9;
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: bold;
  margin-top: 10px;
}
.star {
  color: #ef4444;
  margin-left: 2px;
}
.empty-hint {
  text-align: center;
  color: #cbd5e1;
  margin-top: 60px;
  font-size: 0.85rem;
}

/* 下方新增欄位區 */
.add-control {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 2px dashed #e2e8f0;
  display: flex;
  gap: 10px;
}
.add-input {
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}
.add-select {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: white;
}
.btn-add-field {
  background: #0ea5e9;
  color: white;
  width: 48px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 1.5rem;
}
</style>
