<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
// XLSX lazy import — 只在匯出時才載入（省 420KB 初始 bundle）
const loadXLSX = () => import("xlsx");
import { useToast } from "@/composables/useToast";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import PageLoader from "@/components/shared/PageLoader.vue";
import type { Participant } from "@/types";

const { success, warning, error: showError } = useToast();
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

  const exportList = dataToExport.map((p) => ({
    編號: p.id,
    姓名: p.name,
    單位: p.company,
    職稱: p.title,
    電話: p.phone,
    Email: p.email,
    身分: p.type,
    報到狀態: p.status,
  }));

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
const handleImport = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const data = new Uint8Array((event.target as FileReader).result as ArrayBuffer);
    const XLSX = await loadXLSX();
    const workbook = XLSX.read(data, { type: "array" });
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    const sanitizedData = rawData.map((item: Record<string, unknown>) => ({
      name: (item["姓名"] as string) || (item["Name"] as string) || "",
      company: (item["單位"] as string) || (item["公司"] as string) || "",
      title: (item["職稱"] as string) || "",
      phone: (item["電話"] as string) || "",
      email: (item["Email"] as string) || "",
      type: (item["身分"] as string) || "一般民眾",
      status: (item["報到狀態"] as string) || "未報到",
    }));

    try {
      const result = await participantsStore.importParticipants(sanitizedData, eventsStore.currentEvent?.id ?? 0);

      // 根據匯入模式顯示不同訊息
      if (result.mode === "bulk") {
        // 全部成功
        success(`✅ ${result.message || `批量匯入成功！共 ${result.success} 筆`}`);
      } else if (result.mode === "partial") {
        // 部分成功
        if (result.success > 0) {
          warning(
            `⚠️ ${result.message || `部分匯入成功：成功 ${result.success} 筆，失敗 ${result.failed} 筆`}`,
          );

          // 顯示錯誤詳情
          if (result.errors && result.errors.length > 0) {
            console.error("匯入錯誤詳情:", result.errors);

            // 格式化錯誤訊息
            const errorDetails = result.errors
              .slice(0, 5)
              .map((err: Record<string, unknown>) => {
                const errorMsg = Object.entries(err.errors as Record<string, string[]>)
                  .map(([field, messages]: [string, string[]]) => `${field}: ${messages.join(", ")}`)
                  .join("; ");
                return `第 ${err.index} 筆 - ${errorMsg}`;
              })
              .join("\n");

            console.warn("錯誤詳情（前 5 筆）：\n" + errorDetails);

            // 顯示彈窗（可選）
            if (
              confirm(
                `發現 ${result.errors.length} 筆錯誤。\n\n${errorDetails}\n\n是否查看完整錯誤？`,
              )
            ) {
              console.table(result.errors);
            }
          }
        } else {
          showError(`❌ 匯入失敗：全部 ${result.failed} 筆都有錯誤，請檢查資料格式`);
        }
      } else {
        success(`成功匯入 ${result.success} 筆，失敗 ${result.failed} 筆`);
      }
    } catch (err: unknown) {
      console.error("匯入異常:", err);
      showError("匯入失敗：" + ((err as Error).message || "請檢查檔案格式或網路連線"));
    } finally {
      (e.target as HTMLInputElement).value = "";
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

const closeEditPanel = () => {
  if (hasUnsavedParticipant.value && !confirm("尚未儲存變更，確定要離開嗎？")) return;
  editingParticipant.value = null;
};
// 確認刪除 dialog
const confirmDialog = ref<{ show: boolean; participant: Participant | null }>({ show: false, participant: null });

const deleteParticipant = (participant: Participant | null) => {
  if (!participant) return;
  confirmDialog.value = { show: true, participant };
};

const confirmDelete = async () => {
  const participant = confirmDialog.value.participant;
  confirmDialog.value = { show: false, participant: null };
  if (!participant) return;
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
  try {
    const updated = await participantsStore.updateParticipant(id, {
      name, company, title, phone, email, type, status,
    });
    // 更新 editingParticipant 以反映後端最新資料（含 qrCodeUrl）
    editingParticipant.value = { ...editingParticipant.value, ...(updated as Participant) };
    success("更新成功");
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
      <div class="loading-spinner"></div>
      <p>載入中...</p>
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
        <button class="tb primary" @click="addParticipant">＋ 新增</button>
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
                v-for="p in filteredList" :key="p.id"
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
        </div>
      </div>

      <!-- 右欄：編輯面板 -->
      <div class="col-right">
        <div v-if="!editingParticipant" class="empty-panel">
          <p>點擊左側名單查看 / 編輯詳細資訊</p>
        </div>
        <template v-else>
          <div class="panel-header">
            <h3>{{ editingParticipant.name }}</h3>
            <button class="panel-close" @click="editingParticipant = null">✕</button>
          </div>
          <div class="panel-body">
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
          <div class="panel-footer">
            <button class="tb danger" @click.stop="deleteParticipant(editingParticipant)">刪除</button>
            <button class="tb primary" @click="saveParticipant">儲存</button>
          </div>
        </template>
      </div>
    </div>

    <!-- 手機底部操作列 -->
    <div class="mobile-bottom-bar">
      <button class="mb-import" @click="triggerImport">匯入</button>
      <button class="mb-export" @click="handleExport">匯出</button>
      <button class="mb-add" @click="addParticipant">＋ 新增</button>
    </div>

    <ConfirmDialog
      :show="confirmDialog.show"
      title="刪除參與者"
      :message="`確定要刪除「${confirmDialog.participant?.name}」嗎？此操作無法復原。`"
      confirmText="確認刪除"
      @confirm="confirmDelete"
      @cancel="confirmDialog.show = false"
    />
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
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
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
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
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
    color: #6366f1;
    border-color: var(--border-color);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
    z-index: 1;

    &::before {
      opacity: 1;
      background: var(--bg-card);
    }

    .tab-count {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
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
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
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
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
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
    color: #6366f1;
    text-decoration: none;
    border: 1px solid #6366f1;
    padding: 6px 16px;
    border-radius: 8px;

    &:hover {
      background: rgba(99, 102, 241, 0.08);
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
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
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
  border-top-color: #6366f1;
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
    position:fixed; bottom:0; left:0; right:0; z-index:60;
    background:var(--bg-card); border-top:1px solid var(--border-color);
    padding:8px 12px calc(8px + env(safe-area-inset-bottom, 12px));
    gap:8px; box-shadow:0 -2px 10px rgba(0,0,0,.06);
  }
  .mobile-bottom-bar button {
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
    background:#6366f1; color:#fff;
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
.tb.primary { background:#6366f1; color:#fff; }
.tb.primary:hover { background:#4f46e5; }
.tb.danger { background:transparent; color:#ef4444; border:1px solid #fecaca; }
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
.tab.active { color:#6366f1; box-shadow:inset 0 -2px 0 #6366f1; }
.tab:hover:not(.active) { color:var(--text-secondary); }
.cnt {
  display:inline-flex; align-items:center; justify-content:center;
  min-width:18px; height:18px; padding:0 5px;
  background:var(--bg-hover); border-radius:9px;
  font-size:.68rem; font-weight:700; margin-left:4px;
}
.tab.active .cnt { background:#6366f1; color:#fff; }

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
.data-table tbody tr.active { background:rgba(99,102,241,.08); }
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
.panel-body { padding:14px 16px; overflow-y:auto; flex:1; }
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
.fi:focus { border-color:#6366f1; box-shadow:0 0 0 2px rgba(99,102,241,.1); }
select.fi { cursor:pointer; }
.fi-ro {
  padding:7px 10px; background:var(--bg-primary); border:1px solid var(--border-color);
  border-radius:7px; font-size:.84rem; color:var(--text-muted);
}
.qr-block { text-align:center; padding:12px 0; }
.qr-img { width:140px; height:140px; border:1px solid var(--border-color); border-radius:8px; padding:6px; background:var(--bg-card); }
.qr-dl { display:inline-block; margin-top:8px; font-size:.78rem; color:#6366f1; text-decoration:none; }
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
.export-option:hover { background:#6366f1; color:#fff; }
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
  border-top-color:#6366f1; border-radius:50%; animation:spin .8s linear infinite;
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
}
</style>
