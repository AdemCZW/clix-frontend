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

// === 依 field_key 分群顯示（對齊公開報名頁的視覺設計）===
// 4 群：attendee（每位參加人）/ buyer（訂購人）/ order（訂單層）/ custom（其他自訂）
const ATTENDEE_KEYS = new Set(["name", "email", "phone"]);
const BUYER_KEYS = new Set(["buyer_name", "buyer_email", "buyer_phone"]);
const ORDER_KEYS = new Set(["note", "promo_code"]);

interface GroupedField { field: FormField; index: number }
const groupedFields = computed(() => {
  const groups: Record<"attendee" | "buyer" | "order" | "custom", GroupedField[]> = {
    attendee: [], buyer: [], order: [], custom: [],
  };
  fields.value.forEach((field, index) => {
    const key = field.field_key as string | undefined;
    if (key && ATTENDEE_KEYS.has(key)) groups.attendee.push({ field, index });
    else if (key && BUYER_KEYS.has(key)) groups.buyer.push({ field, index });
    else if (key && ORDER_KEYS.has(key)) groups.order.push({ field, index });
    else groups.custom.push({ field, index });
  });
  return groups;
});
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
        <div class="section-title">報名表欄位設定</div>

        <div v-show="!pageId" class="loading-placeholder">載入欄位設定中...</div>

        <!-- 4 個分群區塊：對齊公開報名頁的視覺語言（attendee 灰 / buyer 橘 / order 藍灰 / custom 白） -->
        <div v-show="pageId" class="field-groups">
          <template v-for="group in [
            { key: 'attendee', label: '參加人資訊', hint: '每位報名者填寫', items: groupedFields.attendee },
            { key: 'buyer',    label: '訂購人資訊', hint: '代表訂購者；隱藏整組則買家區塊不顯示', items: groupedFields.buyer },
            { key: 'order',    label: '訂單欄位',  hint: '整筆訂單共用（備註 / 優惠碼）', items: groupedFields.order },
            { key: 'custom',   label: '自訂欄位',  hint: '每位參加人各自填寫；下方可新增', items: groupedFields.custom },
          ]" :key="group.key">
            <section
              v-if="group.items.length || group.key === 'custom'"
              class="field-group"
              :class="`g-${group.key}`"
            >
              <header class="group-header">
                <span class="group-bar"></span>
                <h3>{{ group.label }}</h3>
                <span class="group-hint">{{ group.hint }}</span>
              </header>
              <div v-if="group.items.length" class="field-list">
                <div
                  v-for="g in group.items"
                  :key="g.field.id ?? `${group.key}-${g.index}`"
                  class="field-card-container"
                  :class="{ 'is-hidden-field': g.field.is_hidden }"
                >
                  <div class="field-card-main">
                    <div class="field-info">
                      <!-- drag-icon-main 已移除：外層欄位列尚未接 vuedraggable，
                           留圖示會誤導使用者；Phase 2.5 接拖曳後再恢復 -->
                      <input
                        v-model="g.field.label"
                        :disabled="g.field.is_fixed"
                        class="field-label-input"
                      />
                      <span class="type-badge">{{ g.field.field_type }}</span>
                      <span v-if="g.field.is_hidden" class="hidden-badge">隱藏中</span>
                    </div>

                    <div class="field-ctrl">
                      <label class="req-chip" v-if="!g.field.is_hidden" :class="{ active: g.field.is_required }">
                        <input type="checkbox" v-model="g.field.is_required" />
                        <span>{{ g.field.is_required ? '必填' : '選填' }}</span>
                      </label>

                      <label class="visibility-switch" :class="{ off: g.field.is_hidden }">
                        <input type="checkbox" v-model="g.field.is_hidden" />
                        <span class="track"><span class="dot"></span></span>
                        <span class="vs-label">{{ g.field.is_hidden ? '隱藏' : '顯示' }}</span>
                      </label>

                      <button v-if="!g.field.is_fixed" @click="removeField(g.index)" class="delete-btn" title="刪除欄位">
                        ✕
                      </button>
                    </div>
                  </div>

                  <div v-if="g.field.field_type === 'select' || g.field.field_type === 'radio'" class="options-editor">
                    <div class="options-header">選項內容設定</div>
                    <draggable
                      :list="g.field.options"
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
                          <button @click="removeOption(g.field, optIdx)" class="opt-del">✕</button>
                        </div>
                      </template>
                    </draggable>
                    <button @click="addOption(g.field)" class="btn-add-opt">+ 新增選項</button>
                  </div>
                </div>
              </div>
              <div v-else-if="group.key === 'custom'" class="group-empty">
                尚未新增任何自訂欄位 — 用下方表單新增
              </div>
            </section>
          </template>
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
  --primary: #167A67;
  --deep-dark: var(--text-main);
  --text-gray: var(--text-secondary);
  --bg-soft: var(--bg-hover);
  --border-light: var(--border-color);
}

.page-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 12px;

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
    color: var(--text-muted);
    font-weight: 700;
    padding: 6px 14px;
    background: var(--bg-hover);
    border-radius: 20px;
  }

  .btn-save-fields {
    font-size: 0.84rem;
    font-weight: 600;
    color: white;
    padding: 7px 18px;
    background: #167A67;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover:not(:disabled) { background: #0f5d4e; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
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
  grid-template-columns: 1fr 320px;
  gap: 14px;
  align-items: start;
}

.edit-panel {
  background: var(--bg-card);
  border-radius: 10px;
  padding: 14px;
  border: 1px solid var(--border-light);
}

.section-title {
  font-size: .95rem;
  font-weight: 700;
  color: var(--deep-dark);
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--border-light);
}

/* 4 個分群區塊：對齊公開報名頁的視覺語言 */
.field-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field-group {
  border-radius: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
}

/* 配色限定品牌綠 #167A67 + 品牌黃 #E0A800；其他用中性灰 */
.field-group.g-attendee {
  background: #e8f5f1;       /* 品牌綠淺底 */
  border-color: #c8e3da;
}
.field-group.g-attendee .group-bar { background: #167A67; }
.field-group.g-attendee .group-header h3 { color: #0f5d4e; }

.field-group.g-buyer {
  background: #fefce8;       /* 品牌黃淺底 */
  border-color: #fde68a;
}
.field-group.g-buyer .group-bar { background: #E0A800; }
.field-group.g-buyer .group-header h3 { color: #92400e; }

.field-group.g-order {
  background: var(--bg-card);
  border-color: var(--border-light);
}
.field-group.g-order .group-bar { background: #94a3b8; }   /* 中性灰，次要群 */
.field-group.g-order .group-header h3 { color: #475569; }

.field-group.g-custom {
  background: var(--bg-card);
  border-color: var(--border-light);
}
.field-group.g-custom .group-bar { background: #167A67; }

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.group-bar {
  width: 4px;
  height: 18px;
  background: #94a3b8;
  border-radius: 2px;
  flex-shrink: 0;
}
.group-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--deep-dark);
  letter-spacing: -0.01em;
}
.group-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-weight: 500;
}
.group-empty {
  font-size: 0.78rem;
  color: var(--text-muted);
  padding: 14px 4px;
  font-style: italic;
}

.field-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-card-container {
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  transition: border-color .2s, box-shadow .2s, opacity .2s;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    border-color: #cbd5e1;
  }

  &.is-hidden-field {
    opacity: 0.55;

    .field-label-input { color: var(--text-muted); text-decoration: line-through; }
  }
}

.ghost-card {
  opacity: 0.5;
  background: var(--bg-soft);
}

.chosen-card {
  box-shadow: 0 8px 24px rgba(22, 122, 103, 0.2);
  border-color: var(--accent);
}

.field-card-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
}

.field-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
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
    border-bottom-color: #167A67;
    background: var(--bg-soft);
  }

  &:disabled {
    color: var(--text-secondary);
    cursor: not-allowed;
  }
}

/* type-badge 統一中性灰，不再每種類型一個顏色（依品牌色約束） */
.type-badge {
  font-size: 0.66rem;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

/* 隱藏中標籤：用品牌黃 #E0A800 */
.hidden-badge {
  background: #E0A800;
  color: white;
  font-size: 0.66rem;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 700;
}

.field-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 必填 / 選填 chip — 點擊 toggle，active 用品牌黃（強調語意） */
.req-chip {
  font-size: 0.74rem;
  padding: 4px 11px;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
  transition: all .15s;
  border: 1.5px solid #cbd5e1;
  background: #fff;
  color: #64748b;
  user-select: none;

  input { display: none; }

  &:hover { border-color: #94a3b8; }
  &.active {
    background: #fefce8;       /* 品牌黃淺底 */
    color: #92400e;
    border-color: #E0A800;     /* 品牌黃 */
  }
}

/* 顯示 / 隱藏 — iOS 風 switch */
.visibility-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  user-select: none;
  color: #167A67;

  input { display: none; }

  .track {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: #167A67;
    transition: background .2s;
  }
  .dot {
    position: absolute;
    top: 2px;
    left: 18px;       /* 顯示中 = dot 在右 */
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: left .2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }

  &.off {
    color: #94a3b8;
    .track { background: #cbd5e1; }
    .dot   { left: 2px; }
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
  color: var(--text-muted);
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
  background: var(--bg-card);
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
    color: #167A67;
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
    color: #167A67;
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
  background: var(--bg-card);
  padding: 10px;
  border-radius: 8px;
  color: var(--text-gray);
  font-size: 0.85rem;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;

  &:hover {
    border-color: var(--accent);
    color: #167A67;
    background: #eef2ff;
  }
}

.add-control {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--border-light);
  display: flex;
  gap: 8px;
}

.add-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  font-size: .88rem;
  font-weight: 600;
  color: var(--text-main);
  background: var(--bg-card);
  transition: all 0.3s;

  &:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-card);
    box-shadow: 0 0 0 3px rgba(22, 122, 103, 0.1);
  }

  &::placeholder {
    color: var(--text-muted);
  }
}

.add-select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  font-size: .88rem;
  font-weight: 600;
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.3s;

  &:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-card);
    box-shadow: 0 0 0 3px rgba(22, 122, 103, 0.1);
  }
}

.btn-add-field {
  background: #167A67;
  color: white;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: 700;
  flex-shrink: 0;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(22, 122, 103, 0.25);

  &:hover {
    background: #0f5d4e;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(22, 122, 103, 0.35);
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }
}

.preview-panel {
  position: sticky;
  top: 76px;
}

.phone-frame {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  overflow: hidden;
}

.phone-screen {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 140px);
}

.phone-header {
  padding: 12px;
  text-align: center;
  font-weight: 700;
  font-size: .92rem;
  color: var(--text-main);
  border-bottom: 1px solid var(--border-light);
}

.phone-content {
  padding: 14px;
  flex: 1;
  overflow-y: auto;
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
  background: #167A67;
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  margin-top: 12px;
  font-size: 0.95rem;
  box-shadow: 0 4px 12px rgba(22, 122, 103, 0.25);
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
