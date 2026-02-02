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

<style lang="scss" scoped>
.fields-config {
  padding: 12px;
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
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;

  .title {
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--deep-dark);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .status-tag {
    font-size: 0.75rem;
    color: #10b981;
    font-weight: 700;
    padding: 6px 14px;
    background: #d1fae5;
    border-radius: 20px;
    animation: pulse 2s infinite;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.config-layout {
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 24px;
  align-items: start;
}

.edit-panel {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-light);
}

.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--deep-dark);
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--bg-soft);
}

.field-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-card-container {
  background: white;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  transition: all 0.3s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    border-color: #cbd5e1;
  }

  &.is-hidden-field {
    background-color: #f8fafc;
    border-style: dashed;
    opacity: 0.7;

    .field-label-input {
      color: #94a3b8;
    }
  }
}

.ghost-card {
  opacity: 0.5;
  background: var(--bg-soft);
}

.chosen-card {
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.2);
  border-color: var(--primary-blue);
}

.field-card-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
}

.field-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.drag-icon-main {
  cursor: grab;
  color: #94a3b8;
  font-size: 1.2rem;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  transition: color 0.3s;

  &::before {
    content: "⋮⋮";
    font-weight: bold;
    letter-spacing: -2px;
  }

  &:hover {
    color: var(--primary-blue);
  }

  &:active {
    cursor: grabbing;
    color: var(--primary-blue);
  }
}

.field-label-input {
  border: none;
  border-bottom: 2px solid transparent;
  font-weight: 600;
  font-size: 1rem;
  color: var(--deep-dark);
  width: 200px;
  padding: 6px 8px;
  background: transparent;
  transition: all 0.3s;

  &:focus {
    outline: none;
    border-bottom-color: var(--primary-blue);
    background: var(--bg-soft);
  }

  &:disabled {
    color: #64748b;
    cursor: not-allowed;
  }
}

.type-badge {
  font-size: 0.7rem;
  color: var(--primary-blue);
  background: #eff6ff;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #dbeafe;
  font-weight: 700;
  text-transform: uppercase;
}

.hidden-badge {
  background: #f59e0b;
  color: white;
  font-size: 0.7rem;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
}

.field-ctrl {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-btn {
  font-size: 0.8rem;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-light);
  cursor: pointer;
  background: white;
  color: var(--text-gray);
  font-weight: 600;
  transition: all 0.3s;

  input {
    display: none;
  }

  &:hover {
    border-color: #cbd5e1;
    background: var(--bg-soft);
  }

  &.is-active {
    background: var(--deep-dark);
    color: white;
    border-color: var(--deep-dark);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.2);
  }
}

.req-toggle {
  font-size: 0.85rem;
  color: var(--text-gray);
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: color 0.3s;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--primary-blue);
  }

  &:hover {
    color: var(--deep-dark);
  }
}

.delete-btn {
  border: none;
  background: none;
  color: #fca5a5;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.3s;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: #f87171;
    background: #fee2e2;
  }
}

.options-editor {
  background: var(--bg-soft);
  padding: 16px 16px 16px 56px;
  border-top: 1px solid var(--border-light);
}

.options-header {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.options-list-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.opt-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  transition: all 0.3s;

  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  }
}

.ghost-option {
  opacity: 0.5;
  background: #cbd5e1;
}

.drag-handle {
  cursor: grab;
  color: #cbd5e1;
  font-size: 1rem;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;

  &::before {
    content: "⋮⋮";
    font-weight: bold;
    letter-spacing: -2px;
  }

  &:hover {
    color: var(--primary-blue);
  }

  &:active {
    cursor: grabbing;
  }
}

.opt-input {
  border: none;
  flex: 1;
  font-size: 0.9rem;
  outline: none;
  background: transparent;
  color: var(--deep-dark);
  font-weight: 500;

  &:focus {
    color: var(--primary-blue);
  }
}

.opt-del {
  border: none;
  background: none;
  color: #cbd5e1;
  cursor: pointer;
  font-size: 1rem;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;

  &:hover {
    color: #f87171;
    background: #fee2e2;
  }
}

.btn-add-opt {
  width: 100%;
  border: 1px dashed #cbd5e1;
  background: white;
  padding: 10px;
  border-radius: 8px;
  color: var(--text-gray);
  font-size: 0.85rem;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;

  &:hover {
    border-color: var(--primary-blue);
    color: var(--primary-blue);
    background: #eff6ff;
  }
}

.add-control {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px dashed var(--border-light);
  display: flex;
  gap: 12px;
}

.add-input {
  flex: 1;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--deep-dark);
  background: var(--bg-soft);
  transition: all 0.3s;

  &:focus {
    outline: none;
    border-color: var(--primary-blue);
    background: white;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: #94a3b8;
  }
}

.add-select {
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-soft);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--deep-dark);
  cursor: pointer;
  transition: all 0.3s;

  &:focus {
    outline: none;
    border-color: var(--primary-blue);
    background: white;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
}

.btn-add-field {
  background: var(--primary-blue);
  color: white;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 1.5rem;
  font-weight: 700;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);

  &:hover {
    background: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }
}

.preview-panel {
  position: sticky;
  top: 20px;
}

.phone-frame {
  background: var(--deep-dark);
  padding: 16px;
  border-radius: 42px;
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.15),
    inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.phone-screen {
  background: white;
  height: 640px;
  border-radius: 32px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
}

.phone-header {
  padding: 20px;
  text-align: center;
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--deep-dark);
  border-bottom: 1px solid var(--border-light);
  background: linear-gradient(to bottom, #ffffff, #f8fafc);
}

.phone-content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }
}

.preview-item {
  margin-bottom: 20px;
}

.preview-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--deep-dark);
  display: block;
  margin-bottom: 8px;

  .star {
    color: #ef4444;
    margin-left: 2px;
  }
}

.dummy-input,
.dummy-select {
  width: 100%;
  height: 42px;
  background: var(--bg-soft);
  border-radius: 10px;
  border: 1px solid var(--border-light);
}

.dummy-submit {
  width: 100%;
  padding: 14px;
  background: var(--primary-blue);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  margin-top: 12px;
  font-size: 0.95rem;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}

.empty-hint {
  text-align: center;
  color: #cbd5e1;
  margin-top: 80px;
  font-size: 0.9rem;
  font-weight: 500;
}
</style>
