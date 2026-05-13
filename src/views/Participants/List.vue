<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
// XLSX lazy import — 只在匯出時才載入（省 420KB 初始 bundle）
const loadXLSX = () => import("xlsx");
import { useToast } from "@/composables/useToast";
import { useConfirm } from "@/composables/useConfirm";
import { ImportValidationError, useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { useRegistrationPagesStore } from "@/stores/registrationPages";
import PageLoader from "@/components/shared/PageLoader.vue";
import LogoSpinner from '@/components/shared/LogoSpinner.vue';
import type { Participant } from "@/types";
import { normalizeImportRow } from "@/utils/normalizeImportRow";

const { success, warning, error: showError } = useToast();
const { confirm } = useConfirm();
const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();

const pageLoading = ref(true);

// 頁面載入時獲取資料
onMounted(async () => {
  const eventId = eventsStore.currentEvent?.id;
  try {
    await participantsStore.fetchParticipants(eventId ? { event: String(eventId) } : {});
  } catch (err) {
    showError("無法載入參與者資料");
  } finally {
    pageLoading.value = false;
  }

  // 監聽點擊外部關閉選單
  document.addEventListener("click", handleClickOutside);

  // 瀏覽器 idle 時預載 xlsx vendor chunk（~425 KB），讓第一次匯入不用等下載
  const prefetchXlsx = () => { loadXLSX().catch(() => {}); };
  if (typeof (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback === "function") {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(prefetchXlsx);
  } else {
    setTimeout(prefetchXlsx, 1500);
  }
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

// 切換活動時自動重新載入參與者
watch(
  () => eventsStore.currentEvent,
  async (newEvent) => {
    if (newEvent?.id) {
      try {
        await participantsStore.fetchParticipants({ event: String(newEvent.id) });
      } catch {
        showError("無法載入參與者資料");
      }
    } else {
      participantsStore.clear();
    }
  }
);

// 點擊外部關閉匯出選單
const handleClickOutside = (event: MouseEvent) => {
  const exportDropdown = (event.target as HTMLElement).closest(".export-dropdown");
  if (!exportDropdown && showExportMenu.value) {
    showExportMenu.value = false;
  }
};

import { useDebouncedRef } from "@/composables/useDebounce";

// 搜尋與過濾狀態
const searchQuery = ref("");
const debouncedSearch = useDebouncedRef(searchQuery, 300);
const activeTab = ref("VIP"); // 標籤切換：VIP 或 一般民眾
const filterStatus = ref("All"); // 狀態過濾

// 【動態產生選項】自動從資料中抓取不重複的值
const allStatuses = computed(() => [
  "All",
  ...new Set(participantsStore.participants.map((p) => p.status)),
]);

// 統計數量
const vipCount = computed(
  () => participantsStore.participants.filter((p) => p.type === "VIP").length,
);
const generalCount = computed(
  () => participantsStore.participants.filter((p) => p.type === "一般民眾").length,
);

// 編輯面板狀態
const editingParticipant = ref<Participant | null>(null);
const editTab = ref<"basic" | "custom">("basic");

// 自訂欄位顯示用 — 從當前活動的 RegistrationFormField 抓 label
// 跟匯出 Excel 用同一份資料，避免重複 fetch
const pagesStore = useRegistrationPagesStore();
type FormFieldDef = { field_key?: string | null; label?: string; is_hidden?: boolean };
const eventFormFields = ref<FormFieldDef[]>([]);
async function loadEventFormFields() {
  eventFormFields.value = [];
  const eventId = eventsStore.currentEvent?.id;
  if (!eventId) return;
  try {
    const page = await pagesStore.fetchByEvent(eventId);
    eventFormFields.value = (page?.formFields as FormFieldDef[]) || [];
  } catch {
    eventFormFields.value = [];
  }
}
watch(() => eventsStore.currentEvent?.id, loadEventFormFields, { immediate: true });

// SYSTEM_FIELD_KEYS 在 export 段已定義同名常數；這裡為避免 hoisting 重複，inline 使用
const SYSTEM_FIELD_KEYS_SET = new Set([
  "name", "email", "phone",
  "buyer_name", "buyer_email", "buyer_phone",
  "note", "promo_code",
]);

// 切換 participant 時重置回基本 tab
watch(editingParticipant, () => { editTab.value = "basic"; });

interface CustomAnswerRow { key: string; label: string; value: string; deprecated: boolean }
const customAnswerRows = computed<CustomAnswerRow[]>(() => {
  const fa = (editingParticipant.value?.formAnswers || {}) as Record<string, unknown>;
  // 建 label 查表：field_key 或 label 都 → 顯示用 label
  const labelMap = new Map<string, string>();
  eventFormFields.value.forEach((f) => {
    const k = f.field_key || f.label;
    if (k) labelMap.set(k, f.label || k);
  });
  return Object.entries(fa)
    .filter(([key]) => !SYSTEM_FIELD_KEYS_SET.has(key))
    .filter(([key]) => key !== "__extra_import")  // __extra_import 獨立區塊顯示
    .map(([key, value]) => ({
      key,
      label: labelMap.get(key) || key,
      value: value == null ? "" : String(value),
      deprecated: !labelMap.has(key),  // 該 key 不在當前活動的 form_fields 內
    }));
});

// 匯入 loading 進度（第 40 次）
type ImportStage = "" | "reading" | "validating" | "uploading";
const importStage = ref<ImportStage>("");
const importProgress = ref<{ current: number; total: number }>({ current: 0, total: 0 });
const isImporting = computed(() => importStage.value !== "");
const importStageLabel = computed(() => {
  switch (importStage.value) {
    case "reading": return "讀取 Excel 檔案…";
    case "validating": return "驗證資料中…";
    case "uploading": return "上傳到伺服器…";
    default: return "";
  }
});
const importProgressPct = computed(() => {
  const { current, total } = importProgress.value;
  if (importStage.value !== "validating" || total === 0) return null;
  return Math.min(100, Math.round((current / total) * 100));
});

// Excel 額外資料（P1.8 第 39 次：改存到 Participant.extra_import_data 直屬欄位）
// 相容舊資料：若新欄位空但 formAnswers.__extra_import 有，仍能讀出來
const extraImportRows = computed<Array<{ key: string; value: string }>>(() => {
  const p = editingParticipant.value;
  if (!p) return [];
  // 優先讀新欄位（store normalize 後應為 camelCase）
  let extra: unknown = (p as Participant & { extraImportData?: unknown }).extraImportData;
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
    // fallback：第 36 次留下的歷史資料（form_answers.__extra_import）
    const fa = (p.formAnswers || {}) as Record<string, unknown>;
    extra = fa.__extra_import;
  }
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return [];
  return Object.entries(extra as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: value == null ? "" : String(value),
  }));
});

// 【核心過濾邏輯】依據標籤 + 搜尋 + 狀態
const filteredList = computed(() => {
  return participantsStore.participants.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(debouncedSearch.value.toLowerCase()) ||
      p.company.toLowerCase().includes(debouncedSearch.value.toLowerCase());
    const matchTab = p.type === activeTab.value;
    const matchStatus = filterStatus.value === "All" || p.status === filterStatus.value;
    return matchSearch && matchTab && matchStatus;
  });
});

// 分頁（10 筆 / 頁）— client-side slice，搜尋/篩選/tab 變動會 reset 回第 1 頁
const PAGE_SIZE = 10;
const currentPage = ref(1);
const totalPages = computed(() => Math.max(1, Math.ceil(filteredList.value.length / PAGE_SIZE)));
const pagedList = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredList.value.slice(start, start + PAGE_SIZE);
});
// 任一 filter 變化 → 重置到第 1 頁
watch([debouncedSearch, activeTab, filterStatus, () => participantsStore.participants.length], () => {
  currentPage.value = 1;
});
// 當前頁超出範圍時（例如刪 record 後）自動 clamp
watch(totalPages, (n) => {
  if (currentPage.value > n) currentPage.value = n;
});
function goToPage(p: number) {
  currentPage.value = Math.max(1, Math.min(totalPages.value, p));
}
const pageRangeText = computed(() => {
  const total = filteredList.value.length;
  if (total === 0) return "0";
  const start = (currentPage.value - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage.value * PAGE_SIZE, total);
  return `${start}–${end} / ${total}`;
});

// 匯出 Excel 邏輯
const isExporting = ref(false);
const showExportMenu = ref(false);

// 匯出指定範圍的資料
const exportData = async (exportType: string) => {
  let dataToExport: Participant[] = [];
  let fileName = "";

  switch (exportType) {
    case "current":
      // 匯出當前篩選的資料
      dataToExport = filteredList.value;
      fileName = `參與者名單_當前篩選_${new Date().getTime()}.xlsx`;
      break;
    case "all":
      // 匯出全部資料
      dataToExport = participantsStore.participants;
      fileName = `參與者名單_全部_${new Date().getTime()}.xlsx`;
      break;
    case "vip":
      // 只匯出 VIP
      dataToExport = participantsStore.participants.filter((p) => p.type === "VIP");
      fileName = `參與者名單_VIP_${new Date().getTime()}.xlsx`;
      break;
    case "general":
      // 只匯出一般民眾
      dataToExport = participantsStore.participants.filter((p) => p.type === "一般民眾");
      fileName = `參與者名單_一般民眾_${new Date().getTime()}.xlsx`;
      break;
    case "checked":
      // 只匯出已報到
      dataToExport = participantsStore.participants.filter((p) => p.status === "已報到");
      fileName = `參與者名單_已報到_${new Date().getTime()}.xlsx`;
      break;
    case "unchecked":
      // 只匯出未報到
      dataToExport = participantsStore.participants.filter((p) => p.status === "未報到");
      fileName = `參與者名單_未報到_${new Date().getTime()}.xlsx`;
      break;
  }

  if (dataToExport.length === 0) {
    warning("目前沒有資料可匯出");
    return;
  }

  isExporting.value = true;

  // ── 取當前活動的「報名表欄位」當動態 column header ──
  // formFields 拿不到（沒 page / 失敗）就 fallback 用 form_answers 內出現過的所有 key 聯集
  let formFields: Array<{ field_key?: string | null; label?: string; is_hidden?: boolean }> = [];
  const eventId = eventsStore.currentEvent?.id;
  if (eventId) {
    try {
      const { useRegistrationPagesStore } = await import("@/stores/registrationPages");
      const pagesStore = useRegistrationPagesStore();
      const page = await pagesStore.fetchByEvent(eventId);
      formFields = (page?.formFields as Array<{ field_key?: string | null; label?: string; is_hidden?: boolean }>) || [];
    } catch {
      formFields = [];
    }
  }

  // 自訂欄位 column 規則：
  // 1. 優先用 RegistrationFormField（field_key + label，is_hidden=true 跳過，且不重複系統欄位）
  // 2. 如果 page 拿不到，用所有 participant.formAnswers 的 key 聯集
  const SYSTEM_FIELD_KEYS = new Set([
    "name", "email", "phone",
    "buyer_name", "buyer_email", "buyer_phone",
    "note", "promo_code",
  ]);
  type CustomCol = { key: string; label: string };
  let customCols: CustomCol[] = [];
  if (formFields.length > 0) {
    customCols = formFields
      .filter((f) => !f.is_hidden)
      .filter((f) => !(f.field_key && SYSTEM_FIELD_KEYS.has(f.field_key)))
      .map((f) => ({
        key: f.field_key || f.label || "",
        label: f.label || f.field_key || "",
      }))
      .filter((c) => c.key);
  } else {
    const seen = new Map<string, string>();
    for (const p of dataToExport) {
      const fa = (p.formAnswers || {}) as Record<string, unknown>;
      for (const k of Object.keys(fa)) {
        if (!seen.has(k)) seen.set(k, k);
      }
    }
    customCols = Array.from(seen.entries()).map(([k, l]) => ({ key: k, label: l }));
  }

  // 把 ISO datetime 簡化成「YYYY-MM-DD HH:mm」，空值回空字串
  const fmtDateTime = (s: string | null | undefined) => {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(s);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const exportList = dataToExport.map((p) => {
    const fa = (p.formAnswers || {}) as Record<string, unknown>;
    const row: Record<string, unknown> = {
      // ── 基本 ──
      編號: p.id,
      姓名: p.name,
      單位: p.company,
      職稱: p.title,
      電話: p.phone,
      Email: p.email,
      身分: p.type,
      報到狀態: p.status,
      // ── 訂單 ──
      訂單編號: p.orderNumber || "",
      訂購人姓名: p.buyerName || "",
      "訂購人 Email": p.buyerEmail || "",
      訂購人電話: p.buyerPhone || "",
      訂單備註: p.note || "",
      優惠代碼: p.promoCode || "",
      // ── 票券 ──
      票種: p.ticketName || "",
      票號: p.ticketNumber || "",
      票價: p.ticketPrice ?? "",
      "票券有效時間（起）": fmtDateTime(p.validFrom),
      "票券有效時間（迄）": fmtDateTime(p.validTo),
      // ── 付款 ──
      付款方式: p.paymentMethod || "",
      付款狀態: p.paymentStatus || "",
      付款時間: fmtDateTime(p.paidAt),
      信用卡末四碼: p.cardLast4 || "",
      // ── 系統 ──
      建立時間: fmtDateTime(p.createdAt),
    };
    // ── 自訂欄位（form_answers）──
    for (const col of customCols) {
      const v = fa[col.key];
      row[col.label] = v === undefined || v === null ? "" : String(v);
    }
    return row;
  });

  // P0.11 第 41 次稽核：Excel 公式注入防護
  // 任何儲存格值若以 = + - @ 開頭，Excel/Numbers 開啟時會嘗試當公式執行
  // 例：`=cmd|' /C calc'!A0` 可觸發外部執行（CVE 級風險）
  // 修法：對字串型 cell 統一加單引號前綴（Excel 會視為文字不執行）
  const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];
  const sanitizeCell = (v: unknown) => {
    if (typeof v !== 'string') return v;
    if (v.length === 0) return v;
    return FORMULA_PREFIXES.includes(v[0]) ? "'" + v : v;
  };
  for (const row of exportList) {
    for (const k of Object.keys(row)) {
      row[k] = sanitizeCell(row[k]);
    }
  }

  const XLSX = await loadXLSX();
  const worksheet = XLSX.utils.json_to_sheet(exportList);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "參與者");
  XLSX.writeFile(workbook, fileName);

  isExporting.value = false;
  showExportMenu.value = false;
  success(`成功匯出 ${dataToExport.length} 筆資料！`);
};

// 舊的匯出函數（向後相容）
const handleExport = () => {
  showExportMenu.value = !showExportMenu.value;
};

// 匯入 Excel 邏輯
const fileInput = ref<HTMLInputElement | null>(null);
const triggerImport = () => fileInput.value!.click();

// 批次清除當前活動全部參與者（給「匯入錯了要重來」場景）
const bulkClearCurrentEvent = async () => {
  const eventId = eventsStore.currentEvent?.id;
  if (!eventId) {
    showError("請先選擇活動");
    return;
  }
  const count = participantsStore.participants.length;
  if (count === 0) {
    warning("目前沒有可清除的參與者");
    return;
  }
  const ok = await confirm({
    title: "⚠️ 清除全部參與者",
    message:
      `將永久刪除「${eventsStore.currentEvent?.name}」內全部 ${count} 筆參與者。\n\n` +
      `此操作無法復原（包含他們的 QR Code / 座位分配等資料）。\n\n` +
      `常見場景：剛匯入有錯，要刪光重匯。\n\n` +
      `確定要繼續？`,
    confirmText: "確認清除",
    cancelText: "取消",
    danger: true,
  });
  if (!ok) return;
  try {
    const result = await participantsStore.bulkDeleteByEvent(eventId);
    success(`✅ ${result.message}`);
    await participantsStore.fetchParticipants({ event: String(eventId) });
  } catch (err: unknown) {
    showError((err as Error).message || "批次刪除失敗");
  }
};

const formatImportErrorDetails = (errors: Array<Record<string, unknown>>, maxRows = 8) => {
  const preview = errors.slice(0, maxRows).map((err) => {
    const errorMap = (err.errors || {}) as Record<string, string[] | string>;
    const detail = Object.entries(errorMap)
      .map(([field, messages]) => {
        const text = Array.isArray(messages) ? messages.join(", ") : String(messages);
        return `${field}: ${text}`;
      })
      .join("；");
    return `第 ${err.index} 筆：${detail || "資料格式不正確"}`;
  });
  const more = errors.length > maxRows ? `\n…另外還有 ${errors.length - maxRows} 筆錯誤` : "";
  return `${preview.join("\n")}${more}`;
};

const showImportBlockedDialog = async (title: string, sections: string[]) => {
  await confirm({
    title,
    message: `${sections.join("\n\n")}\n\n本次未送出任何資料，請修正後重新上傳。`,
    confirmText: "我知道了",
    cancelText: "關閉",
    danger: true,
  });
};

const handleImport = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  if (!eventsStore.currentEvent?.id) {
    await showImportBlockedDialog("無法匯入", ["請先選擇活動，再進行 Excel 匯入。"]);
    (e.target as HTMLInputElement).value = "";
    return;
  }

  importStage.value = "reading";
  importProgress.value = { current: 0, total: 0 };

  const reader = new FileReader();
  reader.onload = async (event) => {
    const data = new Uint8Array((event.target as FileReader).result as ArrayBuffer);
    const XLSX = await loadXLSX();
    const workbook = XLSX.read(data, { type: "array" });
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    // 嘗試取當前活動的 RegistrationFormField，給 helper 做 form_answers 自動映射
    // 拿不到（無 page / fetch 失敗）就 fallback 用原始 header 當 form_answers 的 key（不丟資料）
    let formFields: Array<{ field_key?: string | null; label?: string; is_hidden?: boolean }> = [];
    const eventId = eventsStore.currentEvent?.id;
    if (eventId) {
      try {
        const { useRegistrationPagesStore } = await import("@/stores/registrationPages");
        const pagesStore = useRegistrationPagesStore();
        const page = await pagesStore.fetchByEvent(eventId);
        formFields = (page?.formFields as Array<{ field_key?: string | null; label?: string; is_hidden?: boolean }>) || [];
      } catch {
        // 讀不到 form fields 不該擋住匯入流程
        formFields = [];
      }
    }

    // 切到「驗證資料」階段，顯示真實 row count 進度（chunked + yield 讓 UI 能更新）
    importStage.value = "validating";
    const rows = rawData as Record<string, unknown>[];
    importProgress.value = { current: 0, total: rows.length };

    const normalized: ReturnType<typeof normalizeImportRow>[] = [];
    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK).map((item) => normalizeImportRow(item, formFields));
      normalized.push(...slice);
      importProgress.value = { current: normalized.length, total: rows.length };
      // 讓給瀏覽器 repaint progress bar（不 yield 的話 JS single-thread 看不到更新）
      await new Promise((r) => setTimeout(r, 0));
    }

    // ── 未知欄位預覽（B 階段防呆）──
    // 聯集所有 row 的 unknown_columns header（過濾全空欄位 — 全空通常是 Excel 多餘欄位，不需要警告）
    const unknownHeaderToCount = new Map<string, number>();
    for (const row of normalized) {
      for (const [header, value] of Object.entries(row.unknown_columns || {})) {
        if (String(value || "").trim()) {
          unknownHeaderToCount.set(header, (unknownHeaderToCount.get(header) ?? 0) + 1);
        }
      }
    }

    // 收集所有 row 的 validation_issues（例：ticket 給了非數字字串）
    // 同樣訊息只列一次，旁邊累計筆數
    const issueToCount = new Map<string, number>();
    for (const row of normalized) {
      for (const issue of row.validation_issues || []) {
        issueToCount.set(issue, (issueToCount.get(issue) ?? 0) + 1);
      }
    }

    // ── 值格式錯（type 非法 / ticket 非數字 etc.）維持 strict 擋下 ──
    if (issueToCount.size > 0) {
      const issueLines = Array.from(issueToCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([msg, n]) => `• (${n} 筆) ${msg}`);
      const sections = [
        `🔸 偵測到值的格式問題：\n${issueLines.join("\n")}\n` +
          `請先修正這些資料值，否則本次匯入會被中止。`,
      ];
      await showImportBlockedDialog("匯入已中止", sections);
      warning("匯入已中止，請先修正 Excel 內容");
      (e.target as HTMLInputElement).value = "";
      return;
    }

    // ── P1.8 B+：未知欄位改成「使用者確認後保留」（不直接擋下） ──
    // 風險控管：每 row unknown 欄位數量上限 30、key trim 過長截 100 char
    const EXTRA_IMPORT_MAX_KEYS = 30;
    const EXTRA_IMPORT_KEY_MAX_LEN = 100;
    let keepExtra = false;
    if (unknownHeaderToCount.size > 0) {
      // sanity check：若任一 row 超過 30 個 unknown 欄位 → 仍直接擋（防止欄位爆量）
      const overflowRow = normalized.findIndex(
        (row) => Object.keys(row.unknown_columns || {}).length > EXTRA_IMPORT_MAX_KEYS,
      );
      if (overflowRow !== -1) {
        await showImportBlockedDialog("匯入已中止", [
          `第 ${overflowRow + 1} 列偵測到超過 ${EXTRA_IMPORT_MAX_KEYS} 個未知欄位，已超過保留上限。\n` +
            `請先簡化 Excel 欄位後再匯入。`,
        ]);
        warning("匯入已中止：單列未知欄位過多");
        (e.target as HTMLInputElement).value = "";
        return;
      }

      const sortedHeaders = Array.from(unknownHeaderToCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([h, n]) => `「${h}」(${n} 筆有值)`);
      const headerPreview = sortedHeaders.slice(0, 8).join("、");
      const more = sortedHeaders.length > 8 ? `…等 ${sortedHeaders.length} 個欄位` : "";

      keepExtra = await confirm({
        title: "Excel 含未知欄位",
        message:
          `偵測到 ${unknownHeaderToCount.size} 個系統不認識的欄位：\n` +
          `${headerPreview}${more}\n\n` +
          `按「繼續匯入並保留」會把這些欄位的資料存到「Excel 額外資料」區，\n` +
          `日後可在參與者詳情頁的「自訂欄位」分頁查看。\n\n` +
          `按「取消」可先修正 Excel 欄位名稱後重試。`,
        confirmText: "繼續匯入並保留",
        cancelText: "取消",
        danger: false,
      });
      if (!keepExtra) {
        (e.target as HTMLInputElement).value = "";
        return;
      }
    }

    // sanitize：未知欄位若使用者選擇保留，存到獨立的 extra_import_data 欄位（P1.8 第 39 次）
    // 從第 36 次的 form_answers.__extra_import 改成 Participant 直屬 JSONField，schema 更乾淨
    const sanitizedData = normalized.map((row) => {
      const { unknown_columns: _unknown, validation_issues: _issues, form_answers, ...rest } = row;
      const payload: Record<string, unknown> = { ...rest, form_answers: { ...form_answers } };
      if (keepExtra && _unknown && Object.keys(_unknown).length > 0) {
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(_unknown)) {
          if (String(v ?? "").trim() === "") continue;  // 空值不收
          // key trim + 截斷，避免 noise
          const safeKey = String(k).trim().slice(0, EXTRA_IMPORT_KEY_MAX_LEN);
          if (safeKey) extra[safeKey] = v;
        }
        if (Object.keys(extra).length > 0) payload.extra_import_data = extra;
      }
      return payload;
    });

    importStage.value = "uploading";
    try {
      const result = await participantsStore.importParticipants(sanitizedData, eventsStore.currentEvent?.id ?? 0);

      // 根據匯入模式顯示不同訊息
      if (result.mode === "bulk") {
        // 全部成功
        success(`✅ ${result.message || `批量匯入成功！共 ${result.success} 筆`}`);
      } else if (result.mode === "partial") {
        await showImportBlockedDialog("匯入未完成", [
          result.message || `匯入結果異常：成功 ${result.success} 筆，失敗 ${result.failed} 筆。`,
          result.errors?.length
            ? formatImportErrorDetails(result.errors as Array<Record<string, unknown>>, 5)
            : "請檢查資料格式後重新上傳。",
        ]);
        warning("系統回傳部分成功結果，請確認 strict 匯入規則是否已生效");
      } else {
        success(`成功匯入 ${result.success} 筆，失敗 ${result.failed} 筆`);
      }
    } catch (err: unknown) {
      if (err instanceof ImportValidationError) {
        const payload = err.payload;
        const errors = Array.isArray(payload.errors)
          ? (payload.errors as Array<Record<string, unknown>>)
          : [];
        await showImportBlockedDialog("匯入已中止", [
          String(payload.message || "發現不符合規則的資料，未建立任何參與者。"),
          errors.length ? formatImportErrorDetails(errors) : "請檢查檔案格式後重試。",
        ]);
        warning("匯入已中止，請依彈窗內容修正後再重試");
      } else {
        console.error("匯入異常:", err);
        showError("匯入失敗：" + ((err as Error).message || "請檢查檔案格式或網路連線"));
      }
      // store 端 useStoreRequest.run 會把 err.message 寫進 error.value，
      // 我們已用彈窗處理過，清掉避免後續 UI 殘留
      participantsStore.clearError();
    } finally {
      (e.target as HTMLInputElement).value = "";
      // 重置匯入 loading 狀態
      importStage.value = "";
      importProgress.value = { current: 0, total: 0 };
    }
  };
  reader.readAsArrayBuffer(file);
};

const originalParticipantSnapshot = ref("");

const hasUnsavedParticipant = computed(() => {
  if (!editingParticipant.value) return false;
  return JSON.stringify(editingParticipant.value) !== originalParticipantSnapshot.value;
});

const openEditPanel = (participant: Participant) => {
  editingParticipant.value = { ...participant };
  originalParticipantSnapshot.value = JSON.stringify(editingParticipant.value);
};

const closeEditPanel = async () => {
  if (hasUnsavedParticipant.value && !(await confirm({ message: '尚未儲存變更，確定要離開嗎？', confirmText: '離開', danger: false }))) return;
  editingParticipant.value = null;
};
const deleteParticipant = async (participant: Participant | null) => {
  if (!participant) return;

  if (!(await confirm({
    title: '刪除參與者',
    message: `確定要刪除「${participant.name}」嗎？此操作無法復原。`,
    confirmText: '確認刪除',
  }))) return;

  try {
    await participantsStore.deleteParticipant(participant.id);
    success("刪除成功");
    if (editingParticipant.value?.id === participant.id) {
      editingParticipant.value = null;
    }
  } catch (err) {
    showError("刪除失敗");
  }
};

// 儲存編輯
const saveParticipant = async () => {
  if (!editingParticipant.value) return;
  const { id, name, company, title, phone, email, type, status } = editingParticipant.value;
  // 紀錄改之前的 type（用 store 既有資料對照，editingParticipant 是 copy）
  const previousType = participantsStore.participants.find((p) => p.id === id)?.type;
  try {
    const updated = await participantsStore.updateParticipant(id, {
      name, company, title, phone, email, type, status,
    });
    // 更新 editingParticipant 以反映後端最新資料（含 qrCodeUrl）
    editingParticipant.value = { ...editingParticipant.value, ...(updated as Participant) };
    success("更新成功");
    // 身分被改動 → 自動跳到對應 tab，避免使用者在「VIP」分頁卻看不到剛改成「一般民眾」的人
    if (previousType && previousType !== type && (type === "VIP" || type === "一般民眾")) {
      activeTab.value = type;
    }
  } catch (err: unknown) {
    showError("更新失敗");
  }
};

// 新增參與者
const addParticipant = async () => {
  const eventId = eventsStore.currentEvent?.id;
  if (!eventId) { showError("請先選擇活動"); return; }
  const newParticipant = {
    name: "新參與者",
    company: "",
    title: "",
    phone: "",
    email: "",
    type: "一般民眾",
    status: "未報到",
    event: eventId,
  };
  try {
    const created = await participantsStore.createParticipant(newParticipant);
    editingParticipant.value = { ...(created as Participant) };
    success("新增成功，請編輯詳細資料");
  } catch (err: unknown) {
    showError("新增失敗: " + ((err as Error).message || "未知錯誤"));
  }
};

// 格式化建立時間
const formatDate = (isoString: string) => {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

</script>

<template>
  <div class="participants-view">
    <PageLoader v-if="pageLoading" text="載入中..." />

    <template v-else>
    <!-- 加載遮罩 -->
    <div v-if="participantsStore.loading" class="loading-overlay">
      <LogoSpinner :size="40" />
      <p>載入中...</p>
    </div>

    <!-- 匯入 Loading 進度遮罩（第 40 次）-->
    <div v-if="isImporting" class="import-overlay">
      <div class="import-card">
        <div class="import-spinner" :class="{ 'pct-mode': importProgressPct !== null }">
          <svg v-if="importProgressPct === null" viewBox="0 0 50 50" class="spin">
            <circle cx="25" cy="25" r="20" fill="none" stroke="#167A67" stroke-width="4" stroke-linecap="round" stroke-dasharray="80 200" />
          </svg>
          <div v-else class="pct-text">{{ importProgressPct }}%</div>
        </div>
        <div class="import-stage-text">{{ importStageLabel }}</div>
        <div v-if="importProgress.total > 0" class="import-count">
          {{ importProgress.current }} / {{ importProgress.total }} 筆
        </div>
        <div v-if="importProgressPct !== null" class="import-bar">
          <div class="import-bar-fill" :style="{ width: importProgressPct + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 頂部操作列 -->
    <div class="top-bar">
      <input type="file" ref="fileInput" style="display:none" accept=".xlsx,.xls" @change="handleImport" />
      <div class="top-bar-left">
        <div class="search-compact">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="searchQuery" placeholder="搜尋..." />
        </div>
        <select v-model="filterStatus" class="filter-select">
          <option v-for="s in allStatuses" :key="s" :value="s">{{ s === "All" ? "所有狀態" : s }}</option>
        </select>
      </div>
      <div class="top-bar-right">
        <button
          class="tb outline danger-outline"
          :disabled="participantsStore.participants.length === 0"
          @click="bulkClearCurrentEvent"
          title="清除當前活動全部參與者（不可復原）"
        >⚠️ 全部清除</button>
        <button class="tb outline" @click="triggerImport">匯入</button>
        <div class="export-dropdown">
          <button class="tb outline" :disabled="isExporting" @click="handleExport">匯出</button>
          <Transition name="dropdown-fade">
            <div v-if="showExportMenu" class="export-menu">
              <button @click="exportData('all')" class="export-option">全部 ({{ participantsStore.participants.length }})</button>
              <button @click="exportData('current')" class="export-option">當前篩選 ({{ filteredList.length }})</button>
              <button @click="exportData('vip')" class="export-option">VIP</button>
              <button @click="exportData('general')" class="export-option">一般民眾</button>
              <button @click="exportData('checked')" class="export-option">已報到</button>
              <button @click="exportData('unchecked')" class="export-option">未報到</button>
            </div>
          </Transition>
        </div>
        <button class="tb primary" @click="addParticipant">+ 新增</button>
      </div>
    </div>

    <!-- 左右兩欄 -->
    <div class="two-col">
      <!-- 左欄：表格 -->
      <div class="col-left">
        <div class="tab-bar">
          <button :class="['tab', { active: activeTab === 'VIP' }]" @click="activeTab = 'VIP'">VIP <span class="cnt">{{ vipCount }}</span></button>
          <button :class="['tab', { active: activeTab === '一般民眾' }]" @click="activeTab = '一般民眾'">民眾 <span class="cnt">{{ generalCount }}</span></button>
        </div>
        <div class="list-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>公司 / 職稱</th>
                <th class="hide-sm">電話</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in pagedList" :key="p.id"
                :class="{ active: editingParticipant?.id === p.id }"
                @click="openEditPanel(p)"
              >
                <td>
                  <div class="name-cell">
                    <span class="avatar">{{ p.name.charAt(0) }}</span>
                    <div>
                      <div class="name">{{ p.name }}</div>
                      <div class="sub">{{ p.email }}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="name">{{ p.company }}</div>
                  <div class="sub">{{ p.title }}</div>
                </td>
                <td class="hide-sm">{{ p.phone }}</td>
                <td>
                  <span :class="['dot', p.status === '已報到' ? 'check' : '']">{{ p.status }}</span>
                </td>
              </tr>
              <tr v-if="filteredList.length === 0">
                <td colspan="4" class="empty-state">查無符合條件的參與者</td>
              </tr>
            </tbody>
          </table>
          <!-- 分頁列：每 10 筆一頁，首頁 / 上一頁 / 頁碼 / 下一頁 / 末頁 -->
          <div v-if="filteredList.length > 0" class="pager">
            <button class="pager-btn" :disabled="currentPage === 1" @click="goToPage(1)" title="首頁">«</button>
            <button class="pager-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)" title="上一頁">‹</button>
            <span class="pager-info">
              第 <strong>{{ currentPage }}</strong> / {{ totalPages }} 頁
              <span class="pager-range">（{{ pageRangeText }}）</span>
            </span>
            <button class="pager-btn" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)" title="下一頁">›</button>
            <button class="pager-btn" :disabled="currentPage >= totalPages" @click="goToPage(totalPages)" title="末頁">»</button>
          </div>
        </div>
      </div>

      <!-- 右欄：編輯面板（手機版開啟時變底部 drawer，儲存/刪除永遠可見）-->
      <div class="col-right" :class="{ 'mobile-drawer': editingParticipant }">
        <div v-if="!editingParticipant" class="empty-panel">
          <p>點擊左側名單查看 / 編輯詳細資訊</p>
        </div>
        <template v-else>
          <div class="panel-header">
            <h3>{{ editingParticipant.name }}</h3>
            <button class="panel-close" @click="editingParticipant = null">✕</button>
          </div>
          <!-- Tab 切換：基本資料 / 自訂欄位（form_answers）-->
          <div class="panel-tabs">
            <button
              type="button"
              class="panel-tab"
              :class="{ active: editTab === 'basic' }"
              @click="editTab = 'basic'"
            >基本資料</button>
            <button
              type="button"
              class="panel-tab"
              :class="{ active: editTab === 'custom' }"
              @click="editTab = 'custom'"
            >
              自訂欄位
              <span v-if="customAnswerRows.length" class="tab-count">{{ customAnswerRows.length }}</span>
            </button>
          </div>
          <div v-show="editTab === 'basic'" class="panel-body">
            <div class="fg"><label>姓名</label><input v-model="editingParticipant.name" class="fi" /></div>
            <div class="fg"><label>公司</label><input v-model="editingParticipant.company" class="fi" /></div>
            <div class="fg"><label>職稱</label><input v-model="editingParticipant.title" class="fi" /></div>
            <div class="fg">
              <label>身分</label>
              <select v-model="editingParticipant.type" class="fi">
                <option value="VIP">VIP</option>
                <option value="一般民眾">一般民眾</option>
              </select>
            </div>
            <div class="fg"><label>Email</label><input v-model="editingParticipant.email" type="email" class="fi" /></div>
            <div class="fg"><label>電話</label><input v-model="editingParticipant.phone" type="tel" class="fi" /></div>
            <div class="fg">
              <label>報到狀態</label>
              <select v-model="editingParticipant.status" class="fi">
                <option value="已報到">已報到</option>
                <option value="未報到">未報到</option>
              </select>
            </div>
            <div class="fg readonly" v-if="editingParticipant.eventName">
              <label>所屬活動</label><div class="fi-ro">{{ editingParticipant.eventName }}</div>
            </div>
            <div class="fg readonly">
              <label>建立時間</label><div class="fi-ro">{{ formatDate(editingParticipant.createdAt) }}</div>
            </div>
            <div v-if="editingParticipant.qrCodeUrl" class="qr-block">
              <img :src="editingParticipant.qrCodeUrl" alt="QR" class="qr-img" />
              <a :href="editingParticipant.qrCodeUrl" download="qrcode.png" class="qr-dl">下載 QR Code</a>
            </div>
          </div>
          <!-- 自訂欄位 tab：read-only 顯示 form_answers + Excel 額外資料隔離區 -->
          <div v-show="editTab === 'custom'" class="panel-body">
            <div v-if="customAnswerRows.length === 0 && extraImportRows.length === 0" class="custom-empty">
              此參與者沒有自訂欄位資料
              <span class="custom-empty-hint">（若報名表有自訂欄位但這裡空白，可能此參與者是後台手動建立或匯入時未填）</span>
            </div>
            <template v-else>
              <!-- 正規自訂欄位（field_key 對應 RegistrationFormField） -->
              <div v-for="row in customAnswerRows" :key="row.key" class="fg readonly">
                <label>
                  {{ row.label }}
                  <span v-if="row.deprecated" class="deprecated-tag" title="此欄位已不在當前報名表設定中">已下架</span>
                </label>
                <div class="fi-ro custom-value">{{ row.value || "（空白）" }}</div>
              </div>

              <!-- P1.8 B+：Excel 匯入時保留的額外欄位（不在系統 / form_fields 內） -->
              <div v-if="extraImportRows.length > 0" class="extra-import-block">
                <div class="extra-import-header">
                  <span class="extra-import-title">📎 Excel 額外資料</span>
                  <span class="extra-import-hint">匯入時保留的非系統欄位（{{ extraImportRows.length }} 項）</span>
                </div>
                <div v-for="row in extraImportRows" :key="`extra-${row.key}`" class="fg readonly">
                  <label>{{ row.key }}</label>
                  <div class="fi-ro custom-value">{{ row.value || "（空白）" }}</div>
                </div>
              </div>
            </template>
          </div>
          <div class="panel-footer">
            <button class="tb danger" @click.stop="deleteParticipant(editingParticipant)">刪除</button>
            <button class="tb primary" @click="saveParticipant">儲存</button>
          </div>
        </template>
      </div>
    </div>

    <!-- 手機編輯 panel 的 backdrop（手機版專用，桌機隱藏）-->
    <div v-if="editingParticipant" class="col-right-backdrop" @click="closeEditPanel"></div>

    <!-- 手機底部操作列 -->
    <div class="mobile-bottom-bar">
      <!-- 活動 + 篩選摘要（上半部）— 讓使用者單手操作時隨時知道目前在哪個活動、看到哪些資料 -->
      <div class="mb-context">
        <span class="mb-ctx-event">{{ eventsStore.currentEvent?.name || '尚未選擇活動' }}</span>
        <span class="mb-ctx-meta">
          {{ activeTab }} · {{ filterStatus === 'All' ? '全部' : filterStatus }} · {{ filteredList.length }} 筆
        </span>
      </div>
      <div class="mb-actions">
        <button class="mb-import" @click="triggerImport">匯入</button>
        <button class="mb-export" @click="handleExport">匯出</button>
        <button class="mb-add" @click="addParticipant">+ 新增</button>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.participants-view {
  padding: 12px;
  background: var(--bg-primary);
  min-height: 100vh;
}

/* old styles removed — see new layout below */
._placeholder_removed {
  display: none;
  align-items: center;
  margin-bottom: 14px;
}

.header-left {
  display: flex;
  gap: 16px;
  align-items: center;
  flex: 1;

  .search-wrapper {
    max-width: 320px;
    position: relative;

    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-secondary);
    }

    .search-input {
      width: 100%;
      padding: 10px 42px;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      background: var(--bg-card);
      outline: none;

      &:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }
    }
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 10px;

    label {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-secondary);
      white-space: nowrap;
    }
  }

  .select-rounded {
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    font-size: 0.85rem;
    outline: none;
    cursor: pointer;
    min-width: 140px;

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
  }
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* 按鈕樣式 - 統一設計風格 */
.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
}

.btn-primary {
  background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);

  &:hover {
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
  }
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 2px solid var(--border-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

  &:hover {
    border-color: #cbd5e1;
    background: var(--bg-primary);
  }
}

/* 匯出下拉選單 */
.export-dropdown {
  position: relative;
  display: inline-block;
}

.export-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  min-width: 280px;
  z-index: 1000;
  overflow: hidden;
}

.export-option {
  width: 100%;
  padding: 12px 20px;
  border: none;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
    color: white;
  }

  &:active {
    transform: scale(0.98);
  }
}

.menu-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 4px 0;
}

/* 下拉選單動畫 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 標籤導航 - 資料夾標籤頁樣式 */
.tab-navigation {
  display: flex;
  gap: 4px;
  padding: 12px 12px 0 12px;
  background: transparent;
}

.tab-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: 12px 12px 0 0;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-muted);
  position: relative;
  margin-bottom: -1px;

  &::before {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--bg-hover);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .tab-icon {
    font-size: 1.1rem;
  }

  .tab-label {
    font-size: 0.95rem;
  }

  .tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 7px;
    background: #cbd5e1;
    color: var(--text-muted);
    border-radius: 11px;
    font-size: 0.7rem;
    font-weight: 700;
  }

  &:hover:not(.active) {
    background: #e2e8f0;
    color: var(--text-secondary);
    transform: translateY(-2px);
  }

  &.active {
    background: var(--bg-card);
    color: #167A67;
    border-color: var(--border-color);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
    z-index: 1;

    &::before {
      opacity: 1;
      background: var(--bg-card);
    }

    .tab-count {
      background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
      color: white;
      box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
    }
  }
}

/* 表格樣式 */
.table-container {
  background: var(--bg-card);
  border-radius: 20px;
  border: 1px solid var(--border-color);
  overflow: visible;
  padding: 0;
}
.table-scroll-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.data-table {
  width: 100%;
  min-width: 700px;
  border-collapse: collapse;

  th {
    background: var(--bg-primary);
    padding: 16px 24px;
    text-align: left;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  td {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-light);
  }

  tr.selected {
    background: rgba(102, 126, 234, 0.05);
  }
}

/* Checkbox 樣式 */
.checkbox-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  user-select: none;

  input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;

    &:checked ~ .checkmark {
      background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
      border-color: var(--accent);

      &::after {
        display: block;
      }
    }
  }

  .checkmark {
    position: relative;
    height: 22px;
    width: 22px;
    background-color: white;
    border: 2.5px solid #cbd5e1;
    border-radius: 7px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      border-color: var(--accent);
      transform: scale(1.1);
    }

    &::after {
      content: "";
      display: none;
      width: 5px;
      height: 10px;
      border: solid white;
      border-width: 0 2.5px 2.5px 0;
      transform: rotate(45deg);
      margin-bottom: 2px;
    }
  }
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  .avatar {
    width: 34px;
    height: 34px;
    background: #e0f2fe;
    color: #0369a1;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.9rem;
  }
  .name {
    font-weight: 700;
    color: var(--text-main);
  }
  .email-sub {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
}

.title-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.tag {
  font-size: 0.7rem;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 800;
  &.vip {
    background: #fef3c7;
    color: #d97706;
  }
  &.一般民眾 {
    background: #e0f2fe;
    color: #0369a1;
  }
}

.status-dot {
  position: relative;
  padding-left: 15px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    background: #cbd5e1;
    border-radius: 50%;
  }
  &.check {
    color: #10b981;
    font-weight: 600;
    &::before {
      background: #10b981;
    }
  }
}

.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;

  svg {
    flex-shrink: 0;
  }

  &.edit {
    background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25);

    &:hover {
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.35);
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.delete {
    background: var(--bg-card);
    color: #ef4444;
    border: 1.5px solid #fee2e2;
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.1);

    &:hover {
      background: #fef2f2;
      border-color: #fecaca;
      box-shadow: 0 4px 8px rgba(239, 68, 68, 0.15);
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  font-style: italic;
}

/* 編輯面板內容樣式 */
.form-section {
  margin-bottom: 32px;

  &:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--border-color);
  }
}

.form-field {
  margin-bottom: 20px;

  label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .input-styled,
  .select-styled {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    font-size: 0.95rem;
    outline: none;
    transition: all 0.2s;
    background: var(--bg-card);

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
  }

  .select-styled {
    cursor: pointer;
  }

  .readonly-value {
    padding: 10px 14px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    font-size: 0.9rem;
    color: var(--text-muted);
    min-height: 42px;
    display: flex;
    align-items: center;
  }
}

.qr-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 0;

  .qr-image {
    width: 180px;
    height: 180px;
    border: 2px solid var(--border-color);
    border-radius: 12px;
    padding: 8px;
    background: var(--bg-card);
  }

  .qr-token {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: monospace;
    letter-spacing: 1px;
    margin: 0;
  }

  .btn-download-qr {
    font-size: 0.82rem;
    color: #167A67;
    text-decoration: none;
    border: 1px solid #167A67;
    padding: 6px 16px;
    border-radius: 8px;

    &:hover {
      background: rgba(22, 122, 103, 0.08);
    }
  }
}

.btn-delete-participant {
  flex: 1;
  padding: 12px 20px;
  background: var(--bg-card);
  border: 2px solid #ef4444;
  color: #ef4444;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #ef4444;
    color: white;
  }
}

.btn-save {
  flex: 1;
  padding: 12px 20px;
  background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
  border: none;
  color: white;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }
}

/* 加載狀態 */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2000;

  p {
    margin-top: 16px;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--border-color);
  border-top-color: #167A67;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 手機版 ── */
@media (max-width: 768px) {
  .participants-view { padding:12px 12px 80px; }

  /* 搜尋列：搜尋+篩選上方，按鈕移到底部 */
  .page-header {
    flex-direction:column; gap:10px; margin-bottom:16px;
  }
  .header-left {
    flex-direction:column; gap:8px; width:100%;
    .search-wrapper { max-width:100%; }
    .filter-item { width:100%; }
    .select-rounded { flex:1; width:100%; }
  }

  /* 隱藏桌機版按鈕 */
  .header-actions { display:none; }

  /* 手機底部操作列 */
  .mobile-bottom-bar {
    display:flex !important;
    flex-direction:column;
    position:fixed; bottom:0; left:0; right:0; z-index:60;
    background:var(--bg-card); border-top:1px solid var(--border-color);
    padding:6px 12px calc(8px + env(safe-area-inset-bottom, 12px));
    gap:6px; box-shadow:0 -2px 10px rgba(0,0,0,.06);
  }
  /* 上半：活動名稱 + 篩選摘要 */
  .mobile-bottom-bar .mb-context {
    display:flex; justify-content:space-between; align-items:center;
    gap:8px; min-height:18px;
    font-size:.7rem; line-height:1.2;
  }
  .mobile-bottom-bar .mb-ctx-event {
    font-weight:700; color:var(--text-main);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    max-width:60%;
  }
  .mobile-bottom-bar .mb-ctx-meta {
    color:var(--text-muted);
    font-size:.66rem;
    flex-shrink:0;
  }
  /* 下半：按鈕列 */
  .mobile-bottom-bar .mb-actions {
    display:flex; gap:8px;
  }
  .mobile-bottom-bar .mb-actions button {
    flex:1; padding:10px 0; border-radius:10px;
    font-size:.78rem; font-weight:600; cursor:pointer; border:none;
    transition:.15s;
  }
  .mobile-bottom-bar .mb-import {
    background:var(--bg-hover); color:var(--text-secondary);
    border:1px solid var(--border-color);
  }
  .mobile-bottom-bar .mb-export {
    background:var(--bg-hover); color:var(--text-secondary);
    border:1px solid var(--border-color);
  }
  .mobile-bottom-bar .mb-add {
    background:#167A67; color:#fff;
  }

  /* 標籤頁緊湊 */
  .tab-navigation { padding:8px 8px 0; }
  .tab-button {
    padding:8px 14px; font-size:.82rem;
    .tab-label { font-size:.82rem; }
    .tab-count { min-width:18px; height:18px; font-size:.62rem; padding:0 5px; }
  }

  /* 表格：隱藏部分欄位 */
  .data-table {
    min-width:0;
    th:nth-child(4), td:nth-child(4),  /* 電話 */
    th:nth-child(5), td:nth-child(5),  /* 身分 */
    th:nth-child(7), td:nth-child(7) { display:none; }  /* 操作 */

    th, td { padding:10px 12px; font-size:.82rem; }
  }

  /* 點擊整列可編輯 */
  .data-table tbody tr { cursor:pointer; }
  .data-table tbody tr:active { background:var(--bg-hover); }

  .name-cell {
    gap:8px;
    .avatar { width:28px; height:28px; font-size:.78rem; }
    .name { font-size:.84rem; }
    .email-sub { font-size:.68rem; }
  }

  .comp { font-size:.82rem; }
  .title-sub { font-size:.68rem; }

  /* 匯出選單在手機上居中 */
  .export-menu { right:auto; left:50%; transform:translateX(-50%); min-width:260px; }
}

/* 桌機隱藏手機元素 */
.mobile-bottom-bar { display:none; }

/* ══ 新版兩欄佈局 ══ */
.top-bar {
  display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap;
}
.top-bar-left { display:flex; align-items:center; gap:8px; flex:1; min-width:0; }
.top-bar-right { display:flex; align-items:center; gap:6px; }
.search-compact {
  display:flex; align-items:center; gap:6px;
  background:var(--bg-card); border:1px solid var(--border-color);
  border-radius:8px; padding:6px 10px; min-width:140px; max-width:220px;
}
.search-compact input {
  border:none; background:transparent; outline:none;
  font-size:.84rem; color:var(--text-main); width:100%;
}
.search-compact svg { color:var(--text-muted); flex-shrink:0; }
.filter-select {
  padding:6px 10px; border:1px solid var(--border-color);
  border-radius:8px; background:var(--bg-card); font-size:.84rem;
  color:var(--text-secondary); outline:none; cursor:pointer;
}
.tb {
  padding:6px 14px; border-radius:8px; font-size:.82rem; font-weight:600;
  cursor:pointer; transition:.15s; border:none; white-space:nowrap;
}
.tb.outline { background:var(--bg-card); color:var(--text-secondary); border:1px solid var(--border-color); }
.tb.outline:hover { background:var(--bg-hover); }
.tb.primary { background:#167A67; color:#fff; }
.tb.primary:hover { background:#0f5d4e; }
.tb.danger { background:transparent; color:#ef4444; border:1px solid #fecaca; }
.tb.danger-outline {
  background: #fff;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
.tb.danger-outline:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #ef4444;
}
.tb.danger-outline:disabled { opacity: 0.4; cursor: not-allowed; }
.tb.danger:hover { background:#fef2f2; }
.tb:disabled { opacity:.5; cursor:not-allowed; }

/* 兩欄 */
.two-col { display:grid; grid-template-columns:1fr 340px; gap:12px; align-items:start; }
.col-left {
  background:var(--bg-card); border:1px solid var(--border-color);
  border-radius:10px; overflow:hidden;
}
.col-right {
  background:var(--bg-card); border:1px solid var(--border-color);
  border-radius:10px; position:sticky; top:76px;
  display:flex; flex-direction:column; max-height:calc(100vh - 90px);
}

/* Tabs */
.tab-bar { display:flex; border-bottom:1px solid var(--border-color); }
.tab {
  flex:1; padding:8px 0; border:none; background:transparent;
  font-size:.84rem; font-weight:600; color:var(--text-muted);
  cursor:pointer; transition:.15s; text-align:center;
}
.tab.active { color:#167A67; box-shadow:inset 0 -2px 0 #167A67; }
.tab:hover:not(.active) { color:var(--text-secondary); }
.cnt {
  display:inline-flex; align-items:center; justify-content:center;
  min-width:18px; height:18px; padding:0 5px;
  background:var(--bg-hover); border-radius:9px;
  font-size:.68rem; font-weight:700; margin-left:4px;
}
.tab.active .cnt { background:#167A67; color:#fff; }

/* 表格 */
.list-scroll { overflow-y:auto; max-height:calc(100vh - 160px); }
.data-table { width:100%; border-collapse:collapse; }
.data-table th {
  padding:8px 12px; text-align:left; font-size:.76rem; font-weight:700;
  color:var(--text-muted); border-bottom:1px solid var(--border-color);
  background:var(--bg-primary); position:sticky; top:0; z-index:1;
}
.data-table td { padding:8px 12px; border-bottom:1px solid var(--border-color); font-size:.84rem; }
.data-table tr { cursor:pointer; transition:.1s; }
.data-table tbody tr:hover { background:var(--bg-hover); }
.data-table tbody tr.active { background:rgba(22,122,103,.08); }
.name-cell { display:flex; align-items:center; gap:8px; }
.avatar {
  width:28px; height:28px; background:#e0f2fe; color:#0369a1;
  border-radius:7px; display:flex; align-items:center; justify-content:center;
  font-weight:800; font-size:.8rem; flex-shrink:0;
}
.name { font-weight:600; color:var(--text-main); font-size:.84rem; }
.sub { font-size:.72rem; color:var(--text-muted); }
.dot {
  font-size:.8rem; color:var(--text-muted); padding-left:12px; position:relative;
}
.dot::before {
  content:''; position:absolute; left:0; top:50%; transform:translateY(-50%);
  width:6px; height:6px; background:var(--border-color); border-radius:50%;
}
.dot.check { color:#10b981; font-weight:600; }
.dot.check::before { background:#10b981; }
.empty-state { text-align:center; padding:32px; color:var(--text-muted); }

/* 右欄面板 */
.empty-panel {
  display:flex; align-items:center; justify-content:center;
  min-height:300px; color:var(--text-muted); font-size:.88rem;
}
.panel-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; border-bottom:1px solid var(--border-color);
}
.panel-header h3 { margin:0; font-size:1rem; font-weight:700; color:var(--text-main); }
.panel-close {
  border:none; background:transparent; font-size:1rem; cursor:pointer;
  color:var(--text-muted); padding:4px 8px; border-radius:6px;
}
.panel-close:hover { background:var(--bg-hover); }

/* Tab 切換（基本資料 / 自訂欄位） */
.panel-tabs {
  display: flex;
  gap: 2px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
}
.panel-tab {
  position: relative;
  padding: 10px 14px;
  border: none;
  background: transparent;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: color .15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.panel-tab:hover { color: var(--text-main); }
.panel-tab.active {
  color: #167A67;
  &::after {
    content: '';
    position: absolute;
    left: 0; right: 0; bottom: -1px;
    height: 2px;
    background: #167A67;
  }
}
.tab-count {
  background: #167A67;
  color: #fff;
  font-size: 0.66rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  min-width: 18px;
  text-align: center;
}
.panel-tab:not(.active) .tab-count {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.panel-body { padding:14px 16px; overflow-y:auto; flex:1; }

/* 自訂欄位 tab 空狀態 */
.custom-empty {
  text-align: center;
  padding: 40px 16px 20px;
  color: var(--text-muted);
  font-size: 0.88rem;
  font-weight: 600;
}
.custom-empty-hint {
  display: block;
  margin-top: 8px;
  font-size: 0.76rem;
  font-weight: 400;
  color: var(--text-muted);
  opacity: 0.75;
}
.custom-value {
  white-space: pre-wrap;
  word-break: break-word;
}
.deprecated-tag {
  display: inline-block;
  margin-left: 6px;
  font-size: 0.66rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: #fef3c7;
  color: #92400e;
  font-weight: 700;
}

/* 分頁列（每 10 筆一頁） */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
  flex-wrap: wrap;
}
.pager-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  background: #fff;
  border-radius: 6px;
  font-size: 0.92rem;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  transition: all .15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pager-btn:hover:not(:disabled) {
  background: #e8f5f1;
  color: #167A67;
  border-color: #167A67;
}
.pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pager-info {
  margin: 0 8px;
  font-size: 0.82rem;
  color: var(--text-secondary);
}
.pager-info strong {
  color: #167A67;
  font-variant-numeric: tabular-nums;
}
.pager-range {
  color: var(--text-muted);
  font-size: 0.78rem;
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
}

/* 匯入 loading 遮罩（第 40 次） */
.import-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: io-fade-in 0.18s ease-out;
}
@keyframes io-fade-in { from { opacity: 0; } to { opacity: 1; } }
.import-card {
  background: #fff;
  border-radius: 14px;
  padding: 28px 36px;
  min-width: 320px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.import-spinner {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.import-spinner.pct-mode {
  background: #e8f5f1;
  border-radius: 50%;
  border: 3px solid #167A67;
}
.import-spinner .spin {
  width: 100%;
  height: 100%;
  animation: io-spin 1s linear infinite;
}
@keyframes io-spin { to { transform: rotate(360deg); } }
.pct-text {
  font-size: 1rem;
  font-weight: 800;
  color: #167A67;
  font-variant-numeric: tabular-nums;
}
.import-stage-text {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}
.import-count {
  font-size: 0.82rem;
  color: #475569;
  font-variant-numeric: tabular-nums;
}
.import-bar {
  width: 240px;
  height: 6px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.import-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #167A67 0%, #0f5d4e 100%);
  transition: width 0.15s ease;
}

/* P1.8 B+：Excel 額外資料隔離區 */
.extra-import-block {
  margin-top: 18px;
  padding: 12px;
  border-radius: 8px;
  background: #fefce8;            /* 品牌黃淺底，跟 buyer 區同色系，視覺暗示「非系統」 */
  border: 1px dashed #fde68a;
}
.extra-import-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #fde68a;
  flex-wrap: wrap;
}
.extra-import-title {
  font-size: 0.84rem;
  font-weight: 700;
  color: #92400e;
}
.extra-import-hint {
  font-size: 0.7rem;
  color: #a16207;
}
.extra-import-block .fg label {
  color: #92400e;
}
.fg { margin-bottom:12px; }
.fg label {
  display:block; font-size:.78rem; font-weight:600;
  color:var(--text-muted); margin-bottom:4px;
}
.fi {
  width:100%; padding:7px 10px; border:1px solid var(--border-color);
  border-radius:7px; font-size:.88rem; outline:none; background:var(--bg-card);
  color:var(--text-main); transition:.15s;
}
.fi:focus { border-color:#167A67; box-shadow:0 0 0 2px rgba(22,122,103,.1); }
select.fi { cursor:pointer; }
.fi-ro {
  padding:7px 10px; background:var(--bg-primary); border:1px solid var(--border-color);
  border-radius:7px; font-size:.84rem; color:var(--text-muted);
}
.qr-block { text-align:center; padding:12px 0; }
.qr-img { width:140px; height:140px; border:1px solid var(--border-color); border-radius:8px; padding:6px; background:var(--bg-card); }
.qr-dl { display:inline-block; margin-top:8px; font-size:.78rem; color:#167A67; text-decoration:none; }
.panel-footer {
  display:flex; gap:8px; padding:12px 16px;
  border-top:1px solid var(--border-color);
}
.panel-footer .tb { flex:1; padding:8px 0; text-align:center; }

/* 匯出 */
.export-dropdown { position:relative; }
.export-menu {
  position:absolute; top:calc(100% + 4px); right:0; z-index:100;
  background:var(--bg-card); border:1px solid var(--border-color);
  border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,.1);
  min-width:160px; overflow:hidden;
}
.export-option {
  width:100%; padding:8px 14px; border:none; background:transparent;
  color:var(--text-secondary); font-size:.82rem; text-align:left;
  cursor:pointer; transition:.15s;
}
.export-option:hover { background:#167A67; color:#fff; }
.dropdown-fade-enter-active,.dropdown-fade-leave-active { transition:all .15s; }
.dropdown-fade-enter-from,.dropdown-fade-leave-to { opacity:0; transform:translateY(-6px); }

/* Loading */
.loading-overlay {
  position:fixed; inset:0; background:rgba(255,255,255,.9);
  display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:2000;
}
.loading-overlay p { margin-top:12px; font-size:.9rem; color:var(--text-secondary); }
.loading-spinner {
  width:40px; height:40px; border:3px solid var(--border-color);
  border-top-color:#167A67; border-radius:50%; animation:spin .8s linear infinite;
}
@keyframes spin { to { transform:rotate(360deg); } }

/* ── RWD ── */
@media(max-width:1024px) {
  .two-col { grid-template-columns:1fr; }
  .col-right { position:static; max-height:none; }
}
@media(max-width:768px) {
  .participants-view { padding:8px 8px 72px; }
  .top-bar-right { display:none; }
  .top-bar-left { flex:1; }
  .search-compact { max-width:none; flex:1; }
  .hide-sm { display:none; }
  .mobile-bottom-bar { display:flex !important; }
  .data-table th, .data-table td { padding:6px 8px; font-size:.78rem; }

  /* 編輯 panel 改為底部 drawer：儲存 / 刪除永遠在底部可見
     col-right 本身是 flex column，panel-body flex:1 + overflow-y:auto，
     panel-footer 在 flex 末端 → fixed drawer + max-height 即自動讓 footer 黏底 */
  .col-right.mobile-drawer {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    max-height: 85vh;
    z-index: 80;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.18);
    border: none;
    animation: col-right-slide-up .25s ease-out;
  }
  .col-right.mobile-drawer .panel-footer {
    background: var(--bg-card);
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .col-right-backdrop {
    display: block;
    position: fixed; inset: 0;
    z-index: 70;
    background: rgba(15, 23, 42, .5);
    animation: backdrop-fade .15s ease-out;
  }
}

/* drawer 動畫（桌機版 col-right-backdrop 永遠隱藏）*/
.col-right-backdrop { display: none; }
@keyframes col-right-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@keyframes backdrop-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
