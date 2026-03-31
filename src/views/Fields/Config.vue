<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import draggable from "vuedraggable";
import { useRegistrationFormFieldsStore } from "@/stores/registrationFormFields";
import { useRegistrationPagesStore } from "@/stores/registrationPages";
import { useEventsStore } from "@/stores/events";
import { useToast } from "@/composables/useToast";
import PageLoader from "@/components/shared/PageLoader.vue";
import type { FormField, FieldType } from "@/types";

const route = useRoute();
const router = useRouter();
const fieldsStore = useRegistrationFormFieldsStore();
const pagesStore = useRegistrationPagesStore();
const eventsStore = useEventsStore();
const { success: toastSuccess, error: toastError } = useToast();

const newFieldLabel = ref("");
const newFieldType = ref<FieldType>("text");
const pageId = ref<number | null>(null);
const isInitializing = ref(false);

// 使用本地 ref 作為 draggable 資料來源，載入完成後明確賦值以確保 Vue 正確更新
const fields = ref<FormField[]>([]);

// --- 取得頁面 ID 並載入欄位 ---
async function loadForEvent(event: { id?: number; name?: string } | null) {
  if (!event?.id) return;
  isInitializing.value = true;
  pageId.value = null;
  fields.value = [];
  try {
    let page = await pagesStore.fetchByEvent(event.id);
    if (!page) page = await pagesStore.createPage(event.id);
    await fieldsStore.fetchFields(page.id);
    pageId.value = page.id;
    const storeFields: FormField[] = Array.isArray(fieldsStore.fields) ? fieldsStore.fields : [];
    fields.value = Array.isArray(storeFields) ? storeFields.map((f) => ({
      ...f,
      options: Array.isArray(f.options) ? f.options.map((o) => ({ ...o })) : [],
    })) : [];
  } catch (err) {
    toastError("載入欄位設定失敗");
  } finally {
    isInitializing.value = false;
  }
}

// 載入欄位：watch + immediate 作為唯一觸發點（router-view :key 確保每次進入皆重新掛載）
watch(
  () => [route.name, route.query.eventId, eventsStore.currentEvent?.id],
  async ([name, queryEventId, storeEventId]) => {
    if (name !== "FormFields") return;
    const eventId = Number(queryEventId) || Number(storeEventId);
    if (!eventId) {
      router.push("/admin/events");
      return;
    }
    await loadForEvent({ id: eventId as number });
  },
  { immediate: true }
);

// --- 儲存（bulk_save）---
const saveFields = async () => {
  if (!pageId.value) { toastError("請先選擇一個活動"); return; }
  try {
    await fieldsStore.bulkSave(pageId.value, [...fields.value]);
    toastSuccess("欄位設定已儲存");
  } catch (err: unknown) {
    toastError((err as Error).message || "儲存失敗");
  }
};

// --- 欄位操作 ---
const addField = () => {
  if (!newFieldLabel.value) return;
  const needsOptions = newFieldType.value === "select" || newFieldType.value === "radio";
  fields.value.push({
    id: null,
    label: newFieldLabel.value,
    field_type: newFieldType.value as FieldType,
    is_required: false,
    is_fixed: false,
    is_hidden: false,
    order: fields.value.length,
    options: needsOptions ? [{ text: "", order: 0 }] : [],
  });
  newFieldLabel.value = "";
};

const removeField = (index: number) => fields.value.splice(index, 1);
const addOption = (field: FormField) => field.options.push({ text: "", order: field.options.length });
const removeOption = (field: FormField, optIndex: number) => field.options.splice(optIndex, 1);
const visibleFields = computed(() => fields.value.filter((f) => !f.is_hidden));
</script>

<template>
  <div class="fields-config">
    <PageLoader v-if="isInitializing" text="載入中..." />

    <template v-else>
    <div class="page-header">
      <div class="header-actions">
        <span v-if="fieldsStore.loading" class="status-tag">載入中...</span>
        <button v-else class="btn-save-fields" :disabled="fieldsStore.saving || !pageId" @click="saveFields">
          {{ fieldsStore.saving ? "儲存中..." : "儲存欄位設定" }}
        </button>
      </div>
    </div>

    <div class="config-layout">
      <div class="edit-panel">
        <div class="section-title">自定義欄位 (可拖拽排序)</div>

        <div v-show="!pageId" class="loading-placeholder">載入欄位設定中...</div>
        <div v-show="pageId" class="field-list">
          <div
            v-for="(field, index) in fields"
            :key="field.id ?? `new-${index}`"
            class="field-card-container"
            :class="{ 'is-hidden-field': field.is_hidden }"
          >
              <div class="field-card-main">
                <div class="field-info">
                  <span class="drag-icon-main"></span>
                  <input
                    v-model="field.label"
                    :disabled="field.is_fixed"
                    class="field-label-input"
                  />
                  <span class="type-badge">{{ field.field_type }}</span>
                  <span v-if="field.is_hidden" class="hidden-badge">隱藏中</span>
                </div>

                <div class="field-ctrl">
                  <label class="toggle-btn" :class="{ 'is-active': field.is_hidden }">
                    <input type="checkbox" v-model="field.is_hidden" />
                    <span>{{ field.is_hidden ? "隱藏" : "顯示" }}</span>
                  </label>

                  <label v-if="!field.is_hidden" class="req-toggle">
                    <input type="checkbox" v-model="field.is_required" />
                    <span>必填</span>
                  </label>

                  <button v-if="!field.is_fixed" @click="removeField(index)" class="delete-btn">
                    ✕
                  </button>
                </div>
              </div>

              <div v-if="field.field_type === 'select' || field.field_type === 'radio'" class="options-editor">
                <div class="options-header">選項內容設定</div>
                <draggable
                  :list="field.options"
                  item-key="order"
                  handle=".drag-handle"
                  ghost-class="ghost-option"
                  animation="150"
                  class="options-list-wrapper"
                >
                  <template #item="{ element: opt, index: optIdx }">
                    <div class="opt-item">
                      <span class="drag-handle"></span>
                      <input v-model="opt.text" class="opt-input" />
                      <button @click="removeOption(field, optIdx)" class="opt-del">✕</button>
                    </div>
                  </template>
                </draggable>
                <button @click="addOption(field)" class="btn-add-opt">+ 新增選項</button>
              </div>
            </div>
        </div>

        <div class="add-control">
          <input
            v-model="newFieldLabel"
            @keyup.enter="addField"
            placeholder="新增欄位名稱"
            class="add-input"
          />
          <select v-model="newFieldType" class="add-select">
            <option value="text">純文字</option>
            <option value="tel">電話號碼</option>
            <option value="email">電子郵件</option>
            <option value="select">下拉選單</option>
            <option value="radio">單選選項</option>
            <option value="textarea">多行文字</option>
          </select>
          <button @click="addField" class="btn-add-field">+</button>
        </div>
      </div>

      <div class="preview-panel">
        <div class="phone-frame">
          <div class="phone-screen">
            <div class="phone-header">活動報名表</div>
            <div class="phone-content">
              <div v-for="field in visibleFields" :key="field.id ?? field.label" class="preview-item">
                <label class="preview-label">
                  {{ field.label }}
                  <span v-if="field.is_required" class="star">*</span>
                </label>
                <select v-if="field.field_type === 'select' || field.field_type === 'radio'" class="dummy-select">
                  <option v-for="opt in field.options" :key="opt.order">{{ opt.text }}</option>
                </select>
                <div v-else-if="field.field_type === 'textarea'" class="dummy-input" style="height:60px;"></div>
                <div v-else class="dummy-input"></div>
              </div>
              <div v-if="visibleFields.length === 0" class="empty-hint">尚未設定顯示欄位</div>
              <button class="dummy-submit">確認報名</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.fields-config {
  padding: 12px;
  --primary: #6366f1;
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
    color: #64748b;
    font-weight: 700;
    padding: 6px 14px;
    background: #f1f5f9;
    border-radius: 20px;
  }

  .btn-save-fields {
    font-size: 0.85rem;
    font-weight: 700;
    color: white;
    padding: 8px 20px;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    border: none;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
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
      color: #64748b;
    }
  }
}

.ghost-card {
  opacity: 0.5;
  background: var(--bg-soft);
}

.chosen-card {
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2);
  border-color: #6366f1;
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
    color: #6366f1;
  }

  &:active {
    cursor: grabbing;
    color: #6366f1;
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
    border-bottom-color: #6366f1;
    background: var(--bg-soft);
  }

  &:disabled {
    color: #475569;
    cursor: not-allowed;
  }
}

.type-badge {
  font-size: 0.7rem;
  color: #6366f1;
  background: #eef2ff;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #e0e7ff;
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
    accent-color: #6366f1;
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
    color: #6366f1;
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
    color: #6366f1;
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
    border-color: #6366f1;
    color: #6366f1;
    background: #eef2ff;
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
    border-color: #6366f1;
    background: white;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
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
    border-color: #6366f1;
    background: white;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
}

.btn-add-field {
  background: #6366f1;
  color: white;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 1.5rem;
  font-weight: 700;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);

  &:hover {
    background: #4f46e5;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
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
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  margin-top: 12px;
  font-size: 0.95rem;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
}

.loading-placeholder {
  text-align: center;
  color: var(--text-gray);
  padding: 40px 20px;
  font-size: 0.9rem;
  font-weight: 500;
}

.empty-hint {
  text-align: center;
  color: #cbd5e1;
  margin-top: 80px;
  font-size: 0.9rem;
  font-weight: 500;
}
</style>
