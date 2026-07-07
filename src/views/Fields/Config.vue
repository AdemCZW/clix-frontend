<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
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

// === 依 field_key 分群（對齊公開報名頁的視覺設計）+ Phase 2.5 群內拖曳排序 ===
// 4 群：attendee（每位參加人）/ buyer（訂購人）/ order（訂單層）/ custom（其他自訂）
const ATTENDEE_KEYS = new Set(["name", "email", "phone"]);
const BUYER_KEYS = new Set(["buyer_name", "buyer_email", "buyer_phone"]);
const ORDER_KEYS = new Set(["note", "promo_code"]);

type GroupKey = "attendee" | "buyer" | "order" | "custom";

function groupKeyOf(field: FormField): GroupKey {
  const key = field.field_key as string | undefined;
  if (key && ATTENDEE_KEYS.has(key)) return "attendee";
  if (key && BUYER_KEYS.has(key)) return "buyer";
  if (key && ORDER_KEYS.has(key)) return "order";
  return "custom";
}

// splitFields：fields 拆成 4 個 reactive arrays，給 vuedraggable 各自 v-model
// 每個 element 是 fields 陣列內物件的 reference（mutate label / is_hidden 會雙向反映）
const splitFields = reactive<Record<GroupKey, FormField[]>>({
  attendee: [],
  buyer: [],
  order: [],
  custom: [],
});

let syncingSplit = false;

function rebuildSplit() {
  syncingSplit = true;
  splitFields.attendee = [];
  splitFields.buyer = [];
  splitFields.order = [];
  splitFields.custom = [];
  fields.value.forEach((f) => {
    splitFields[groupKeyOf(f)].push(f);
  });
  syncingSplit = false;
}

// fields → splitFields 同步（fetch 後 / addField / removeField 都會觸發）
watch(fields, () => {
  if (syncingSplit) return;
  rebuildSplit();
}, { immediate: true, deep: false });

// 拖曳結束：把 4 個 split 合併回 fields，重算 order
// 跨群禁止：draggable group prop 設 pull/put false（同 key 才允許），UI 不會發生跨群拖曳
function onGroupReorder() {
  syncingSplit = true;
  const merged = [
    ...splitFields.attendee,
    ...splitFields.buyer,
    ...splitFields.order,
    ...splitFields.custom,
  ];
  merged.forEach((f, idx) => { f.order = idx; });
  fields.value = merged;
  // 下個 tick 再恢復同步監聽
  setTimeout(() => { syncingSplit = false; }, 0);
}

// 預覽用：只顯示未隱藏的欄位、按報名頁實際分群順序 buyer → attendee+custom → order
const previewGroups = computed(() => {
  const visible = (arr: FormField[]) => arr.filter((f) => !f.is_hidden);
  return [
    { key: "buyer",    label: "訂購人資料", fields: visible(splitFields.buyer) },
    { key: "attendee", label: "參加人 1",   fields: [...visible(splitFields.attendee), ...visible(splitFields.custom)] },
    { key: "order",    label: "訂單",       fields: visible(splitFields.order) },
  ];
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

        <!-- 4 個分群區塊：每群獨立 vuedraggable，禁止跨群拖曳（Phase 2.5）-->
        <div v-show="pageId" class="field-groups">
          <template v-for="group in [
            { key: 'attendee' as const, label: '參加人資訊', hint: '每位報名者填寫（群內可拖曳排序）' },
            { key: 'buyer'    as const, label: '訂購人資訊', hint: '代表訂購者；隱藏整組則買家區塊不顯示' },
            { key: 'order'    as const, label: '訂單欄位',  hint: '整筆訂單共用（備註 / 優惠碼）' },
            { key: 'custom'   as const, label: '自訂欄位',  hint: '每位參加人各自填寫；下方可新增' },
          ]" :key="group.key">
            <section
              v-if="splitFields[group.key].length || group.key === 'custom'"
              class="field-group"
              :class="`g-${group.key}`"
            >
              <header class="group-header">
                <span class="group-bar"></span>
                <h3>{{ group.label }}</h3>
                <span class="group-hint">{{ group.hint }}</span>
              </header>
              <draggable
                v-if="splitFields[group.key].length"
                v-model="splitFields[group.key]"
                :group="{ name: group.key, pull: false, put: false }"
                item-key="id"
                handle=".drag-handle-field"
                ghost-class="ghost-field"
                animation="150"
                class="field-list"
                @end="onGroupReorder"
              >
                <template #item="{ element: field }">
                  <div
                    class="field-card-container"
                    :class="{ 'is-hidden-field': field.is_hidden }"
                  >
                    <div class="field-card-main">
                      <div class="field-info">
                        <span class="drag-handle-field" title="拖曳排序" aria-hidden="true"></span>
                        <input
                          v-model="field.label"
                          :disabled="field.is_fixed"
                          class="field-label-input"
                        />
                        <span class="type-badge">{{ field.field_type }}</span>
                        <span v-if="field.is_hidden" class="hidden-badge">隱藏中</span>
                      </div>

                      <div class="field-ctrl">
                        <label class="req-chip" v-if="!field.is_hidden" :class="{ active: field.is_required }">
                          <input type="checkbox" v-model="field.is_required" />
                          <span>{{ field.is_required ? '必填' : '選填' }}</span>
                        </label>

                        <label class="visibility-switch" :class="{ off: field.is_hidden }">
                          <input type="checkbox" v-model="field.is_hidden" />
                          <span class="track"><span class="dot"></span></span>
                          <span class="vs-label">{{ field.is_hidden ? '隱藏' : '顯示' }}</span>
                        </label>

                        <button v-if="!field.is_fixed" @click="removeField(fields.indexOf(field))" class="delete-btn" title="刪除欄位">
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
                            <button @click="removeOption(field, optIdx)" class="opt-del" aria-label="刪除選項" title="刪除選項">✕</button>
                          </div>
                        </template>
                      </draggable>
                      <button @click="addOption(field)" class="btn-add-opt">+ 新增選項</button>
                    </div>
                  </div>
                </template>
              </draggable>
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
              <!-- 預覽用 PublicPage 真實分群結構：buyer 黃 / attendee 灰 / order 藍灰 / 自訂在 attendee 內 -->
              <template v-for="(group, gi) in previewGroups" :key="gi">
                <section v-if="group.fields.length" class="pv-section" :class="`pv-${group.key}`">
                  <h4 class="pv-heading">{{ group.label }}</h4>
                  <div v-for="field in group.fields" :key="field.id ?? field.label" class="pv-item">
                    <label class="pv-label">
                      {{ field.label }}
                      <span v-if="field.is_required" class="star">*</span>
                    </label>
                    <select v-if="field.field_type === 'select' || field.field_type === 'radio'" class="pv-input pv-select">
                      <option v-for="opt in field.options" :key="opt.order">{{ opt.text }}</option>
                    </select>
                    <div v-else-if="field.field_type === 'textarea'" class="pv-input pv-textarea"></div>
                    <div v-else class="pv-input"></div>
                  </div>
                </section>
              </template>
              <div v-if="visibleFields.length === 0" class="empty-hint">尚未設定顯示欄位</div>
              <button v-else class="pv-submit">確認報名</button>
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

    .drag-handle-field { color: #167A67; }
  }

  &.is-hidden-field {
    opacity: 0.55;

    .field-label-input { color: var(--text-muted); text-decoration: line-through; }
  }
}

/* Phase 2.5：每張欄位卡的拖曳 handle（真實接 vuedraggable） */
.drag-handle-field {
  cursor: grab;
  color: #cbd5e1;
  font-size: 1.1rem;
  user-select: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 24px;
  transition: color .15s;

  &::before {
    content: "⋮⋮";
    font-weight: bold;
    letter-spacing: -2px;
  }
  &:active { cursor: grabbing; color: #167A67; }
}

/* 拖曳中的 ghost：半透明 + 邊框強調 */
.ghost-field {
  opacity: 0.5;
  border: 2px dashed #167A67 !important;
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

/* === 預覽：強制 light 主題，模擬 PublicPage 實際畫面 === */
.phone-frame {
  background: #fff;            /* PublicPage 永遠 light */
  border: 1px solid #e2e8f0;
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
  color: #0f172a;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.phone-content {
  padding: 14px;
  background: #fff;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 預覽分群：對應 PublicPage 的 buyer / attendee / order section */
.pv-section {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #e8e8e4;
  background: #fafaf8;        /* 預設 attendee 灰 */
}
.pv-section.pv-buyer {
  background: #fefce8;        /* 品牌黃淺底（跟 PublicPage 一致） */
  border-color: #fde68a;
}
.pv-section.pv-order {
  background: #f8fafc;        /* 訂單藍灰 */
  border-color: #e2e8f0;
}
.pv-heading {
  margin: 0 0 10px;
  font-size: 0.82rem;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  padding-left: 10px;
}
.pv-heading::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: #94a3b8;
}
.pv-section.pv-buyer .pv-heading::before { background: #E0A800; }
.pv-section.pv-attendee .pv-heading::before { background: #167A67; }
.pv-section.pv-order .pv-heading::before { background: #94a3b8; }

.pv-item {
  margin-bottom: 10px;
  &:last-child { margin-bottom: 0; }
}
.pv-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #1e293b;
  display: block;
  margin-bottom: 5px;

  .star { color: #ef4444; margin-left: 2px; }
}
.pv-input {
  width: 100%;
  height: 34px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
}
.pv-input.pv-textarea { height: 54px; }
.pv-input.pv-select {
  appearance: none;
  padding: 0 10px;
  font-size: 0.78rem;
  color: #475569;
}

.pv-submit {
  width: 100%;
  padding: 12px;
  background: #167A67;
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: default;
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
  color: #94a3b8;
  margin-top: 40px;
  font-size: 0.85rem;
}
</style>
