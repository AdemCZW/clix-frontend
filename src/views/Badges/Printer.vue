<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import vPrint from "vue3-print-nb";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { useRegistrationPagesStore } from "@/stores/registrationPages";
import { useEventScopedLoader } from "@/composables/useEventScopedLoader";
import { getAccessToken } from "@/utils/authStorage";
import { buildPrintWsUrl } from "@/utils/printWs";
import {
  BASIC_FIELD_OPTIONS,
  buildCustomFieldOptions,
  buildExtraFieldOptions,
  resolveFieldValue,
  type FieldOption,
} from "@/utils/participantFieldResolver";
import QRCodeLib from "qrcode";
import PageLoader from "@/components/shared/PageLoader.vue";
import { useToast } from "@/composables/useToast";
import { apiRequest } from "@/utils/api";

const { success: toastSuccess, error: toastError } = useToast();

const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();
const pagesStore = useRegistrationPagesStore();

const logoUrl = ref("");
const logoFile = ref<File | null>(null);
function handleLogoUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  logoFile.value = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    logoUrl.value = (ev.target as FileReader).result as string;
  };
  reader.readAsDataURL(file);
}

// 使用 store 的參與者數據
const allParticipants = computed(() => participantsStore.participants);

const searchQuery = ref("");
const selectedIds = ref<number[]>([]);
const normalizedSearchQuery = computed(() =>
  typeof searchQuery.value === "string" ? searchQuery.value.trim() : "",
);
const filteredParticipants = computed(() => {
  const keyword = normalizedSearchQuery.value;
  if (!keyword) return allParticipants.value;

  return allParticipants.value.filter((p) => {
    const name = typeof p.name === "string" ? p.name : String(p.name ?? "");
    const company =
      typeof p.company === "string" ? p.company : String(p.company ?? "");
    return name.includes(keyword) || company.includes(keyword);
  });
});
const selectedParticipants = computed(() =>
  allParticipants.value.filter((p) => selectedIds.value.includes(p.id)),
);

// 拖曳範本設定
interface BadgeElement {
  id: string;
  key: string;
  label: string;
  x: number;
  y: number;
  style: { fontSize: number; fontWeight: string; color: string };
}

const dragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

function startDrag(el: BadgeElement, evt: MouseEvent) {
  activeElement.value = el;
  dragging.value = true;
  dragOffset.value = {
    x: evt.clientX - el.x,
    y: evt.clientY - el.y,
  };
}
function onDrag(evt: MouseEvent) {
  if (!dragging.value || !activeElement.value) return;
  activeElement.value.x = evt.clientX - dragOffset.value.x;
  activeElement.value.y = evt.clientY - dragOffset.value.y;
}
function stopDrag() {
  dragging.value = false;
}

const activeElement = ref<BadgeElement | null>(null);

// 自訂欄位來源：form_answers + extra_import_data，由共用 resolver 提供
const customFieldOptions = ref<FieldOption[]>([]);
const loadingCustomFields = ref(false);
const customFieldsError = ref("");

async function loadCustomFields() {
  const eventId = eventsStore.currentEvent?.id;
  if (!eventId) {
    customFieldOptions.value = [];
    return;
  }
  loadingCustomFields.value = true;
  customFieldsError.value = "";

  let formOpts: FieldOption[] = [];
  try {
    const page = await pagesStore.fetchByEvent(eventId);
    formOpts = buildCustomFieldOptions(page?.formFields ?? []);
  } catch {
    // 報名表讀取失敗不擋下匯入額外資料 — 兩個來源是獨立的
    customFieldsError.value = "報名表欄位讀取失敗";
  }

  const extraOpts = buildExtraFieldOptions(
    participantsStore.participants,
    formOpts.map((o) => o.key),
  );
  customFieldOptions.value = [...formOpts, ...extraOpts];
  loadingCustomFields.value = false;
}

// Field resolver：根據 element.key 從 participant 取值（QR 由 template 特例處理）
const getFieldValue = (p: Record<string, unknown>, key: string): string =>
  resolveFieldValue(p, key);

// ── 新增 / 移除項目 ───────────────────────────────
const showAddModal = ref(false);
const addTab = ref<"basic" | "custom">("basic");

function openAddModal() {
  showAddModal.value = true;
  addTab.value = "basic";
  // 開啟時刷新自訂欄位，避免使用者剛改了報名表又回來時看不到新欄位
  loadCustomFields();
}
function closeAddModal() {
  showAddModal.value = false;
}

function nextElementId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function addElement(option: { key: string; label: string }) {
  // canvas 是 90mm × 60mm（約 340×226 px），新項目擺在中段安全區（左上往內錯開）
  // 多個錯開避免完全堆疊；超過 6 個就 mod 重來（user 自行拖開）
  const offsetIndex = templateElements.value.length % 6;
  const newEl: BadgeElement = {
    id: nextElementId(),
    key: option.key,
    label: option.label,
    x: 40 + offsetIndex * 12,
    y: 40 + offsetIndex * 18,
    style: { fontSize: 14, fontWeight: "400", color: "#1e293b" },
  };
  // QR 預設放右上、字大小不重要
  if (option.key === "code") {
    newEl.x = 230;
    newEl.y = 20;
    newEl.style.fontSize = 12;
    newEl.style.color = "#cbd5e1";
  }
  templateElements.value.push(newEl);
  activeElement.value = newEl;
  closeAddModal();
}

function removeActiveElement() {
  if (!activeElement.value) return;
  const id = activeElement.value.id;
  templateElements.value = templateElements.value.filter((el) => el.id !== id);
  activeElement.value = null;
}

// 預設排版
const defaultElements = [
  {
    id: "t1",
    key: "name",
    label: "姓名",
    x: 20,
    y: 80,
    style: { fontSize: 26, fontWeight: "900", color: "#1e293b" },
  },
  {
    id: "t2",
    key: "company",
    label: "單位",
    x: 20,
    y: 120,
    style: { fontSize: 14, fontWeight: "400", color: "#64748b" },
  },
  {
    id: "t3",
    key: "code",
    label: "QR編碼",
    x: 230,
    y: 20,
    style: { fontSize: 12, fontWeight: "400", color: "#cbd5e1" },
  },
];

function loadSavedTemplate() {
  try {
    const saved = localStorage.getItem("badge_template");
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

const _savedTemplate = loadSavedTemplate();
const templateElements = ref<BadgeElement[]>(_savedTemplate?.length ? _savedTemplate : defaultElements);

function resetTemplate() {
  localStorage.removeItem("badge_template");
  templateElements.value = defaultElements.map(el => ({ ...el, style: { ...el.style } }));
}

onMounted(() => {
  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", stopDrag);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", stopDrag);
});

// 隨活動切換載入名單 + 自訂欄位（收斂到 useEventScopedLoader）
useEventScopedLoader(
  async (eventId) => {
    await participantsStore.fetchParticipants({ event: String(eventId) });
    // 切活動 → 重抓自訂欄位（不同活動的報名表自訂欄位可能不同）
    loadCustomFields();
  },
  {
    onNoEvent: () => {
      participantsStore.clear();
      customFieldOptions.value = [];
    },
  }
);

const toggleSelection = (id: number) => {
  const index = selectedIds.value.indexOf(id);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(id);
  }
};

const toggleAll = () => {
  if (selectedIds.value.length === filteredParticipants.value.length) {
    selectedIds.value = [];
  } else {
    selectedIds.value = filteredParticipants.value.map((p) => p.id);
  }
};

// QR Code 圖片生成
// QR 內容優先用外部票號（external_ticket_id，匯入 Excel 的票號），fallback 用內部 check_in_token UUID。
// 注意：checkInToken 仍是參與者「身分比對」用的 stable id，不要替換成 externalTicketId（票號可能重複/可改）。
const qrDataUrls = ref<Record<string, string>>({});
const qrTokenOf = (p: { externalTicketId?: string; checkInToken: string }) =>
  (p.externalTicketId || "").trim() || p.checkInToken;
async function ensureQr(token: string) {
  if (!token || qrDataUrls.value[token]) return;
  qrDataUrls.value[token] = await QRCodeLib.toDataURL(token, { width: 80, margin: 1 });
}
watch(
  selectedParticipants,
  (participants) => participants.forEach((p) => ensureQr(qrTokenOf(p))),
  { immediate: true }
);

const isAllSelected = computed(
  () =>
    filteredParticipants.value.length > 0 &&
    selectedIds.value.length === filteredParticipants.value.length,
);

// ===== 外部列印站台連線測試 =====
// stationTestStatus: 'idle' | 'testing' | 'online' | 'offline'
const stationTestStatus = ref<Record<number, string>>({ 1: "idle", 2: "idle", 3: "idle" });

async function testStation(slot: number) {
  const eid = eventsStore.currentEvent?.id;
  if (!eid) return;
  stationTestStatus.value[slot] = "testing";

  const stationSession = `print-${eid}-station-${slot}`;

  try {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(buildPrintWsUrl(stationSession, { token: getAccessToken() || "" }));
      const timeout = setTimeout(() => { ws.close(); reject(); }, 5000);
      ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(); };
      ws.onerror = () => { clearTimeout(timeout); reject(); };
    });
    stationTestStatus.value[slot] = "online";
  } catch {
    stationTestStatus.value[slot] = "offline";
  }
}

const mobileDispatchUrl = computed(() => {
  const eid = eventsStore.currentEvent?.id;
  if (!eid) return null;
  return `${window.location.origin}${window.location.pathname}#/mobile/print-dispatch?event=${eid}`;
});

const mobileQrDataUrl = ref("");
watch(mobileDispatchUrl, async (url) => {
  mobileQrDataUrl.value = url
    ? await QRCodeLib.toDataURL(url, { width: 160, margin: 1, errorCorrectionLevel: "M" })
    : "";
}, { immediate: true });

function openStation(slot: number) {
  const eid = eventsStore.currentEvent?.id;
  if (!eid) return;
  const url = `${window.location.origin}${window.location.pathname}#/print/station/${slot}?event=${eid}`;
  window.open(url, `_station_${slot}`, "width=960,height=700,menubar=no,toolbar=no,status=no,scrollbars=yes");
}

function copyMobileDispatchUrl() {
  const url = mobileDispatchUrl.value;
  if (!url) {
    toastError("尚未產生派送網址");
    return;
  }
  navigator.clipboard.writeText(url).then(() => {
    toastSuccess("派送網址已複製，貼到手機瀏覽器即可開啟");
  }).catch(() => {
    toastError("複製失敗，請手動長按 QR 或選取網址");
  });
}

// 產生站台啟動檔（含 station_token，站台機免登入）並下載
// platform: "win" → .bat（雙擊即開）；"mac" → .command（首次需 chmod +x）
async function downloadStationLauncher(slot: number, platform: "win" | "mac") {
  const eid = eventsStore.currentEvent?.id;
  if (!eid) {
    toastError("尚未選擇活動");
    return;
  }
  try {
    const res = await apiRequest(`/api/print-station-token/?event=${eid}&slot=${slot}`);
    if (!res.ok) throw new Error();
    const { station_token } = await res.json();
    const url = `${window.location.origin}${window.location.pathname}#/print/station/${slot}?event=${eid}&station_token=${station_token}`;

    let filename: string;
    let content: string;
    if (platform === "win") {
      filename = `clix-station${slot}.bat`;
      content =
        `@echo off\r\n` +
        `rem clix 列印站台 ${slot}（活動 #${eid}）— 雙擊自動開啟列印頁，免登入\r\n` +
        `start "" "${url}"\r\n`;
    } else {
      filename = `clix-station${slot}.command`;
      content =
        `#!/bin/bash\n` +
        `# clix 列印站台 ${slot}（活動 #${eid}）— 雙擊自動開啟列印頁，免登入\n` +
        `# 首次使用：在終端機對本檔執行  chmod +x "${filename}"  後即可雙擊\n` +
        `open "${url}"\n`;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    toastSuccess(
      platform === "win"
        ? `已下載 ${filename}，複製到站台電腦雙擊即可`
        : `已下載 ${filename}，首次需在終端機執行 chmod +x 後雙擊`
    );
  } catch {
    toastError("產生站台連結失敗，請確認已登入且有此活動權限");
  }
}

// 儲存版面設計到 localStorage（拖曳時 deep watch 每個 mousemove 都觸發，
// debounce 300ms：只在停手後寫一次，避免拖曳全程狂寫 localStorage）
let saveTemplateTimer: ReturnType<typeof setTimeout> | null = null;
watch(templateElements, (val) => {
  if (saveTemplateTimer) clearTimeout(saveTemplateTimer);
  saveTemplateTimer = setTimeout(() => {
    localStorage.setItem("badge_template", JSON.stringify(val));
  }, 300);
}, { deep: true });

watch(logoUrl, (val) => {
  if (val) localStorage.setItem("badge_logo", val);
  else localStorage.removeItem("badge_logo");
});
</script>

<template>
  <div class="badge-printer-view" @mousemove="onDrag" @mouseup="stopDrag">
    <!-- 頂部工具列 -->
    <div class="toolbar no-print">
      <div class="toolbar-left">
        <span class="toolbar-stat">
          共 <strong>{{ allParticipants.length }}</strong> 人，已選
          <strong class="highlight">{{ selectedIds.length }}</strong> 人
        </span>
      </div>
      <div class="toolbar-right">
        <button
          class="btn-primary"
          :disabled="selectedIds.length === 0"
          v-print="{ id: 'printBadges', preview: false, popTitle: '識別證列印' }"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          確認列印 ({{ selectedIds.length }})
        </button>
      </div>
    </div>

    <!-- 主區塊：左欄（手機派送 + 人員選擇）+ 右欄（設計畫布） -->
    <div class="main-layout">
      <!-- 左側容器：派送卡 + 人員選擇 -->
      <div class="left-column">

        <!-- 手機派送（正方形卡片） -->
        <section class="dispatch-card no-print" v-if="eventsStore.currentEvent && mobileQrDataUrl">
          <div class="dispatch-head">
            <h3 class="card-title">
              <span class="title-bar yellow"></span>
              手機派送
            </h3>
            <span class="event-pill">#{{ eventsStore.currentEvent?.id }} · {{ eventsStore.currentEvent?.name }}</span>
          </div>

          <div class="dispatch-body">
            <div class="dispatch-qr">
              <img :src="mobileQrDataUrl" class="qr-img" alt="手機派送頁 QR" />
              <button class="btn-copy-url" type="button" @click="copyMobileDispatchUrl">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                複製網址
              </button>
            </div>
            <ol class="step-list">
              <li><span class="step-num">1</span><span class="step-text">開啟掃描頁</span></li>
              <li><span class="step-num">2</span><span class="step-text">掃參加者 QR</span></li>
              <li><span class="step-num">3</span><span class="step-text">送印站台 1</span></li>
            </ol>
          </div>

          <div class="dispatch-note">
            ⚠ 固定送站台 1，多站台請告知後台
          </div>

          <div class="dispatch-foot">
            <span class="station-status" :class="stationTestStatus[1]">
              <span class="status-dot"></span>
              {{ stationTestStatus[1] === 'online' ? '已連線' : stationTestStatus[1] === 'offline' ? '離線' : stationTestStatus[1] === 'testing' ? '測試中' : '尚未測試' }}
            </span>
            <div class="foot-actions">
              <button class="btn-link" @click="downloadStationLauncher(1, 'win')">Win .bat</button>
              <button class="btn-link" @click="downloadStationLauncher(1, 'mac')">Mac .command</button>
              <button class="btn-link" @click="openStation(1)">開啟</button>
              <button
                class="btn-test"
                :class="stationTestStatus[1]"
                :disabled="stationTestStatus[1] === 'testing'"
                @click="testStation(1)"
              >
                {{ stationTestStatus[1] === 'testing' ? '...' : '測試' }}
              </button>
            </div>
          </div>
        </section>

        <!-- 人員選擇 -->
        <div class="tech-card selection-panel no-print">
        <h3 class="card-subtitle">人員選擇</h3>
        <div class="search-row">
          <input
            v-model="searchQuery"
            class="input-styled search-input"
            placeholder="搜尋姓名或單位..."
          />
        </div>
        <div class="list-header">
          <button class="btn-toggle" :class="{ active: isAllSelected }" @click="toggleAll">
            <span class="toggle-icon">{{ isAllSelected ? "✓" : "○" }}</span>
            全選
          </button>
        </div>
        <div class="participant-list">
          <template v-if="filteredParticipants.length">
            <div
              v-for="p in filteredParticipants"
              :key="p.id"
              class="p-item"
              :class="{ selected: selectedIds.includes(p.id) }"
              @click="toggleSelection(p.id)"
            >
              <div class="p-info">
                <span class="name">{{ p.name }}</span>
                <span class="comp">{{ p.company }}</span>
              </div>
              <span v-if="selectedIds.includes(p.id)" class="check-mark">✓</span>
            </div>
          </template>
          <div v-else class="participant-empty">沒有符合搜尋的名單</div>
        </div>
      </div>

      </div>
      <!-- /left-column -->

      <!-- 右側：設計畫布 -->
      <div class="design-area no-print">
        <div class="canvas-toolbar">
          <span class="canvas-title">範本設計</span>
          <div class="canvas-actions">
            <label class="btn-sm">
              <span>{{ logoUrl ? '更換 LOGO' : '上傳 LOGO' }}</span>
              <input type="file" accept="image/*" @change="handleLogoUpload" hidden />
            </label>
            <img v-if="logoUrl" :src="logoUrl" alt="Logo" class="logo-thumb" />
            <button class="btn-sm primary" @click="openAddModal">+ 新增項目</button>
            <button class="btn-sm danger" @click="resetTemplate">重置排版</button>
            <span class="size-label">60 × 90 mm</span>
          </div>
        </div>

        <div class="canvas-box">
          <img v-if="logoUrl" :src="logoUrl" class="canvas-logo" />
          <div
            v-for="el in templateElements"
            :key="el.id"
            class="draggable-element"
            :class="{ active: activeElement?.id === el.id }"
            :style="{
              left: el.x + 'px',
              top: el.y + 'px',
              transform: 'translate(-50%, -50%)',
              fontSize: el.style.fontSize + 'px',
              fontWeight: el.style.fontWeight,
              color: el.style.color,
            }"
            @mousedown="(evt) => startDrag(el, evt)"
          >
            <template v-if="el.key === 'code'">
              <img
                v-if="selectedParticipants[0] && qrDataUrls[qrTokenOf(selectedParticipants[0])]"
                :src="qrDataUrls[qrTokenOf(selectedParticipants[0])]"
                width="80"
                height="80"
              />
              <div v-else class="qr-placeholder"></div>
            </template>
            <template v-else>
              [{{ el.label }}]
            </template>
            <div class="drag-handle" v-if="activeElement?.id === el.id"></div>
          </div>
        </div>

        <!-- 行內樣式編輯器 -->
        <Transition name="fade">
          <div class="style-bar" v-if="activeElement">
            <span class="style-bar-label">{{ activeElement.label }}</span>
            <div class="style-control">
              <label>大小</label>
              <input type="range" v-model="activeElement.style.fontSize" min="12" max="60" />
              <span class="val">{{ activeElement.style.fontSize }}px</span>
            </div>
            <div class="style-control">
              <label>顏色</label>
              <input type="color" v-model="activeElement.style.color" class="color-picker" />
            </div>
            <div class="style-control">
              <label>X</label>
              <input type="number" v-model="activeElement.x" class="num-input" />
            </div>
            <div class="style-control">
              <label>Y</label>
              <input type="number" v-model="activeElement.y" class="num-input" />
            </div>
            <button class="btn-sm danger remove-btn" @click="removeActiveElement">移除</button>
          </div>
        </Transition>
      </div>
    </div>

    <!-- 新增項目 Modal -->
    <div v-if="showAddModal" class="add-modal-overlay no-print" @click.self="closeAddModal">
      <div class="add-modal">
        <div class="add-modal-header">
          <h3>新增項目</h3>
          <button class="btn-close-add" aria-label="關閉" title="關閉" @click="closeAddModal">✕</button>
        </div>
        <div class="add-modal-tabs">
          <button :class="{ active: addTab === 'basic' }" @click="addTab = 'basic'">基本項目</button>
          <button :class="{ active: addTab === 'custom' }" @click="addTab = 'custom'">
            自訂欄位
            <span v-if="customFieldOptions.length" class="tab-count">{{ customFieldOptions.length }}</span>
          </button>
        </div>
        <div class="add-modal-body">
          <template v-if="addTab === 'basic'">
            <button
              v-for="opt in BASIC_FIELD_OPTIONS"
              :key="opt.key"
              class="add-option"
              @click="addElement(opt)"
            >
              <span class="opt-label">{{ opt.label }}</span>
              <span class="opt-key">{{ opt.key }}</span>
            </button>
          </template>
          <template v-else>
            <div v-if="loadingCustomFields" class="add-modal-empty">載入中…</div>
            <div v-else-if="customFieldsError" class="add-modal-empty error">{{ customFieldsError }}</div>
            <div v-else-if="!customFieldOptions.length" class="add-modal-empty">
              此活動沒有可用的自訂欄位。
              <br />
              請先到「報名表欄位」頁面新增非系統預設欄位。
            </div>
            <button
              v-else
              v-for="opt in customFieldOptions"
              :key="opt.key"
              class="add-option"
              @click="addElement(opt)"
            >
              <span class="opt-label">{{ opt.label }}</span>
              <span class="opt-source" :class="opt.source">
                {{ opt.source === "custom" ? "報名表" : "Excel" }}
              </span>
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 列印專用區域 -->
    <div id="printBadges" class="print-only-area">
      <div
        v-for="p in selectedParticipants"
        :key="p.id"
        class="print-badge"
      >
        <img v-if="logoUrl" :src="logoUrl" class="print-logo" />
        <div
          v-for="el in templateElements"
          :key="el.id"
          class="print-element"
          :style="{
            position: 'absolute',
            left: el.x + 'px',
            top: el.y + 'px',
            transform: 'translate(-50%, -50%)',
            fontSize: el.style.fontSize + 'px',
            fontWeight: el.style.fontWeight,
            color: el.style.color,
            whiteSpace: 'nowrap',
          }"
        >
          <template v-if="el.key === 'code'">
            <img
              v-if="qrDataUrls[qrTokenOf(p)]"
              :src="qrDataUrls[qrTokenOf(p)]"
              width="80"
              height="80"
            />
          </template>
          <template v-else>{{ getFieldValue(p, el.key) }}</template>
        </div>
      </div>
    </div>

  </div>
</template>

<style lang="scss" scoped>
.badge-printer-view {
  padding: 16px;
  background: var(--bg-primary);
  min-height: 100vh;
  max-width: 1100px;
  margin: 0 auto;
}

/* ===== 頂部工具列 ===== */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  border-radius: 12px;
  padding: 8px 16px;
  margin-bottom: 10px;
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.toolbar-left {
  .toolbar-stat {
    font-size: 0.9rem;
    color: var(--text-secondary);

    strong { color: var(--text-main); }
    .highlight { color: #167A67; font-size: 1.1rem; }
  }
}

.toolbar-right {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-primary {
  padding: 10px 22px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  transition: all 0.3s;

  &:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4); }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
}

.btn-outline {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  transition: all 0.2s;

  &:hover, &.active { border-color: var(--accent); color: #167A67; background: #f5f3ff; }
}

/* ===== 左欄容器：派送卡 + 人員選擇 ===== */
.left-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== 手機派送（260×260 正方形卡） ===== */
.dispatch-card {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: #fafaf8;
  border: 1px solid #e8e8e4;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.dispatch-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.card-title {
  font-size: 0.92rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;

  .title-bar {
    display: inline-block;
    width: 4px;
    height: 16px;
    background: #167A67;
    border-radius: 2px;
    &.yellow { background: #E0A800; }
  }
}

.event-pill {
  font-size: 0.72rem;
  font-weight: 600;
  color: #337168;
  background: #e8f5f1;
  padding: 3px 10px;
  border-radius: 999px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.station-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: var(--text-secondary);
  border: 1px solid #e2e8f0;
  white-space: nowrap;

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #cbd5e1;
  }

  &.online  { background: #f0fdf4; border-color: #bbf7d0; color: #16a34a;
    .status-dot { background: #22c55e; box-shadow: 0 0 5px rgba(34,197,94,0.5); }
  }
  &.offline { background: #fef2f2; border-color: #fecaca; color: #dc2626;
    .status-dot { background: #ef4444; }
  }
  &.testing { background: #fffbeb; border-color: #fde68a; color: #b45309;
    .status-dot { background: #f59e0b; animation: ws-pulse 1s infinite; }
  }
}

.dispatch-body {
  display: flex;
  gap: 10px;
  align-items: center;
  flex: 1;
  min-height: 0;
}

.dispatch-qr {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;

  .qr-img {
    width: 100px;
    height: 100px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: #fff;
    padding: 3px;
    box-sizing: border-box;
    display: block;
  }
}

.btn-copy-url {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #167A67;
  background: #fff;
  border: 1px solid var(--border-color);
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 6px;
  transition: all 0.15s;
  white-space: nowrap;

  svg { flex-shrink: 0; }

  &:hover {
    background: #e8f5f1;
    border-color: var(--accent);
  }
  &:active {
    transform: translateY(0.5px);
  }
}

.step-list {
  flex: 1;
  min-width: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;

  li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .step-num {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #167A67;
    color: #fff;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 800;
  }
  .step-text {
    font-size: 0.78rem;
    color: var(--text-main);
    line-height: 1.3;
  }
}

.dispatch-note {
  font-size: 0.7rem;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1.3;
}

.dispatch-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.foot-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-link {
  font-size: 0.74rem;
  font-weight: 600;
  color: #167A67;
  background: #fff;
  border: 1px solid var(--border-color);
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  transition: all 0.15s;
  &:hover { background: #e8f5f1; border-color: var(--accent); }
}

.btn-test {
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.74rem;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: #fff;
  color: var(--text-muted);
  transition: all 0.2s;
  &:hover:not(:disabled) { border-color: var(--accent); color: #0f5d4e; }
  &:disabled { opacity: 0.6; cursor: default; }
  &.online  { border-color: #bbf7d0; color: #16a34a; background: #f0fdf4; }
  &.offline { border-color: #fecaca; color: #dc2626; background: #fef2f2; }
}

/* ===== 主區塊 ===== */
.main-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 12px;
  align-items: start;
}

/* 左側人員選擇 */
.selection-panel {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 14px;
  flex: none;
  min-height: 360px;
  height: auto;
  display: flex;
  flex-direction: column;

  .search-input {
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    font-size: 0.9rem;
    margin-bottom: 10px;
    transition: 0.2s;
    &:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
  }
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-primary);
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--border-color);
}

.btn-toggle {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;

  .toggle-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 2px solid #cbd5e1;
    font-size: 12px;
    transition: all 0.2s;
  }

  &.active .toggle-icon {
    background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
    border-color: var(--accent);
    color: white;
  }

  &:hover { color: #167A67; }
  &:hover .toggle-icon { border-color: var(--accent); }
}

.participant-list {
  flex: 0 1 auto;
  min-height: 170px;
  max-height: 380px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-right: 2px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
}

.participant-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  color: var(--text-muted);
  font-size: 0.86rem;
  font-weight: 600;
}

.p-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 4px;
  border: 2px solid transparent;
  background: var(--bg-primary);
  cursor: pointer;
  transition: all 0.2s;

  &:hover { border-color: #a5b4fc; background: #f5f3ff; }

  &.selected {
    background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
    border-color: var(--accent);

    .name { color: #167A67; }
  }

  .p-info {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .name { font-weight: 700; color: var(--text-main); font-size: 0.9rem; }
    .comp { font-size: 0.75rem; color: var(--text-muted); }
  }

  .check-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
    color: white;
    font-size: 12px;
    font-weight: bold;
  }
}

/* ===== 右側設計區域 ===== */
.design-area {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 14px 16px;
}

.canvas-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.canvas-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-main);
}

.canvas-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-sm {
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  &:hover { border-color: var(--accent); color: #0f5d4e; background: #eef2ff; }
  &.danger { border-color: #fca5a5; background: #fff1f2; color: #ef4444; &:hover { background: #fee2e2; } }
  &.primary { border-color: var(--accent); background: #eef9f4; color: #0f5d4e; &:hover { background: #d9f0e6; } }
}

.logo-thumb {
  height: 24px;
  max-width: 60px;
  border-radius: 4px;
  object-fit: contain;
}

.remove-btn {
  margin-left: auto;
}

.add-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.add-modal {
  background: #fff;
  width: 420px;
  max-width: 92vw;
  max-height: 80vh;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.add-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  h3 { margin: 0; font-size: 1rem; }
}
.btn-close-add {
  background: transparent;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--text-muted);
  line-height: 1;
  &:hover { color: var(--text-primary); }
}
.add-modal-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 18px 0;
  border-bottom: 1px solid var(--border-color);
  button {
    flex: 1;
    background: transparent;
    border: none;
    padding: 8px 12px;
    border-bottom: 2px solid transparent;
    font-weight: 600;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    &.active {
      color: #0f5d4e;
      border-bottom-color: var(--accent);
    }
  }
  .tab-count {
    background: #e8f5f1;
    color: #0f5d4e;
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 0.7rem;
  }
}
.add-modal-body {
  padding: 12px 18px 18px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.add-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  &:hover {
    border-color: var(--accent);
    background: #eef9f4;
  }
  .opt-key {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-weight: 400;
  }
  .opt-source {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
    &.custom {
      background: #e8f5f1;
      color: #0f5d4e;
    }
    &.extra {
      background: #fef3c7;
      color: #92400e;
    }
  }
}
.add-modal-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 24px 12px;
  font-size: 0.85rem;
  &.error { color: #ef4444; }
}

.size-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-weight: 700;
  background: var(--bg-primary);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.canvas-box {
  width: 90mm;
  height: 60mm;
  background: var(--bg-card);
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  border-radius: 4px;
  border: 2px solid var(--border-color);
  margin: 0 auto;
}

.canvas-logo {
  position: absolute;
  left: 20px;
  top: 20px;
  height: 40px;
  max-width: 120px;
  z-index: 2;
}

.draggable-element {
  position: absolute;
  cursor: move;
  padding: 4px 8px;
  border: 2px dashed transparent;
  white-space: nowrap;
  border-radius: 4px;
  transition: border-color 0.2s, background 0.2s;

  &:hover { background: rgba(22, 122, 103, 0.05); border-color: #cbd5e1; }

  &.active {
    border: 2px dashed #167A67;
    background: rgba(22, 122, 103, 0.08);

    .drag-handle {
      position: absolute;
      bottom: -6px;
      right: -6px;
      width: 12px;
      height: 12px;
      background: #167A67;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  }
}

.qr-placeholder {
  width: 80px;
  height: 80px;
  background: var(--bg-hover);
  border-radius: 4px;
}

/* ===== 行內樣式編輯器 ===== */
.style-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  padding: 12px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  flex-wrap: wrap;
}

.style-bar-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
}

.style-control {
  display: flex;
  align-items: center;
  gap: 6px;

  label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .val {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
    font-family: monospace;
    min-width: 36px;
  }

  input[type="range"] {
    width: 80px;
    height: 4px;
    border-radius: 10px;
    background: #e2e8f0;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #167A67;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(22, 122, 103, 0.4);
    }
  }

  .color-picker {
    border: none;
    width: 28px;
    height: 28px;
    cursor: pointer;
    background: none;
    border-radius: 6px;
    overflow: hidden;

    &::-webkit-color-swatch-wrapper { padding: 0; }
    &::-webkit-color-swatch { border: 2px solid var(--border-color); border-radius: 6px; }
  }

  .num-input {
    width: 56px;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    &:focus { border-color: var(--accent); outline: none; }
  }
}

/* ===== 動畫 ===== */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 120px;
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

@keyframes ws-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ===== 列印 ===== */
.search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;

  .search-input {
    flex: 1;
    margin-bottom: 0;
  }
}

.btn-scan {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    border-color: var(--accent);
    background: #eef2ff;
    color: #167A67;
  }
}

/* QR 掃描 Modal */
.scan-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.scan-modal {
  background: var(--bg-card);
  border-radius: 20px;
  width: 360px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

  .scan-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border-light);

    h3 {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0;
    }

    .btn-close-scan {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      background: var(--bg-primary);
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;

      &:hover { background: #fee2e2; border-color: #fca5a5; color: #ef4444; }
    }
  }

  .scan-body {
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
}

.video-wrap {
  position: relative;
  width: 280px;
  height: 280px;
  border-radius: 16px;
  overflow: hidden;
  background: #0f172a;

  .scan-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .scan-frame {
    position: absolute;
    inset: 20px;
    pointer-events: none;

    .corner {
      position: absolute;
      width: 24px;
      height: 24px;
      border-color: white;
      border-style: solid;
      border-width: 0;

      &.tl { top: 0; left: 0; border-top-width: 3px; border-left-width: 3px; border-radius: 4px 0 0 0; }
      &.tr { top: 0; right: 0; border-top-width: 3px; border-right-width: 3px; border-radius: 0 4px 0 0; }
      &.bl { bottom: 0; left: 0; border-bottom-width: 3px; border-left-width: 3px; border-radius: 0 0 0 4px; }
      &.br { bottom: 0; right: 0; border-bottom-width: 3px; border-right-width: 3px; border-radius: 0 0 4px 0; }
    }
  }
}

.scan-hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
  text-align: center;
}

.scan-spinner-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 0;
}

.scan-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: #167A67;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.scan-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px 24px;
  border-radius: 16px;
  width: 100%;

  .result-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    font-size: 1.5rem;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }

  .result-name {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-main);
    text-align: center;
  }

  .result-msg {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .result-tag {
    font-size: 0.8rem;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 20px;
    margin-top: 4px;
  }

  &.success {
    background: #f0fdf4;
    .result-icon { background: #22c55e; color: white; }
    .result-tag { background: #dcfce7; color: #16a34a; }
  }

  &.error {
    background: #fef2f2;
    .result-icon { background: #ef4444; color: white; }
  }
}

.station-select-row {
  display: flex;
  gap: 8px;
  width: 100%;

  .btn-station-select {
    flex: 1;
    padding: 12px 8px;
    border-radius: 10px;
    border: 2px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    position: relative;

    &:hover {
      border-color: var(--accent);
      background: #eef2ff;
      color: #4338ca;
    }

    &.active {
      border-color: #22c55e;
      background: #f0fdf4;
      color: #15803d;
    }

    .dot-online {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22c55e;
      flex-shrink: 0;
    }
  }
}

.scan-result-actions {
  display: flex;
  gap: 10px;
  width: 100%;

  button {
    flex: 1;
    padding: 12px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .btn-scan-again {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    &:hover { background: var(--bg-hover); }
  }

  .btn-scan-done {
    background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    &:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4); }
  }
}

/* 列印專用區域 - 平時隱藏 */
.print-only-area {
  display: none;
}

/* ===== RWD ===== */
@media (max-width: 768px) {
  .badge-printer-view { padding: 12px; }

  .toolbar {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
    padding: 12px 16px;
  }

  .toolbar-right { justify-content: flex-end; }

  .station-mgmt {
    flex-direction: column;
    gap: 12px;
  }

  .main-layout {
    grid-template-columns: 1fr;
  }

  .selection-panel {
    height: auto;
    max-height: 300px;
  }

  .canvas-box {
    width: 100%;
    max-width: 90mm;
  }

  .style-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}

@media print {
  .print-only-area {
    display: block !important;
  }

  .badge-printer-view {
    padding: 0;
    background: var(--bg-card);

    .toolbar,
    .station-mgmt,
    .main-layout {
      display: none !important;
    }
  }

  .print-badge {
    position: relative;
    width: 90mm;
    height: 60mm;
    overflow: hidden;
    background: var(--bg-card);
    page-break-after: always;
    margin: 0;

    .print-logo {
      position: absolute;
      left: 20px;
      top: 20px;
      height: 40px;
      max-width: 120px;
      z-index: 2;
    }

    .print-element {
      position: absolute;
    }

    &:last-child {
      page-break-after: auto;
    }
  }

  @page {
    size: 90mm 60mm;
    margin: 0;
  }
}
</style>
