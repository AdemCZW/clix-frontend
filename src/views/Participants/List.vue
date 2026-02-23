<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import * as XLSX from "xlsx";
import { useToast } from "@/composables/useToast";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";

const { success, warning, error: showError } = useToast();
const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();

// 頁面載入時獲取資料
onMounted(async () => {
  const eventId = eventsStore.currentEvent?.id;
  try {
    await participantsStore.fetchParticipants(eventId ? { event: eventId } : {});
  } catch (err) {
    showError("無法載入參與者資料");
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
        await participantsStore.fetchParticipants({ event: newEvent.id });
      } catch {
        showError("無法載入參與者資料");
      }
    } else {
      participantsStore.clear();
    }
  }
);

// 點擊外部關閉匯出選單
const handleClickOutside = (event) => {
  const exportDropdown = event.target.closest(".export-dropdown");
  if (!exportDropdown && showExportMenu.value) {
    showExportMenu.value = false;
  }
};

// 搜尋與過濾狀態
const searchQuery = ref("");
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
const editingParticipant = ref(null);

// 【核心過濾邏輯】依據標籤 + 搜尋 + 狀態
const filteredList = computed(() => {
  return participantsStore.participants.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      p.company.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchTab = p.type === activeTab.value;
    const matchStatus = filterStatus.value === "All" || p.status === filterStatus.value;
    return matchSearch && matchTab && matchStatus;
  });
});

// 匯出 Excel 邏輯
const isExporting = ref(false);
const showExportMenu = ref(false);

// 匯出指定範圍的資料
const exportData = (exportType) => {
  let dataToExport = [];
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
const fileInput = ref(null);
const triggerImport = () => fileInput.value.click();
const handleImport = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    const sanitizedData = rawData.map((item) => ({
      name: item["姓名"] || item["Name"] || "", // 空字串讓後端驗證
      company: item["單位"] || item["公司"] || "",
      title: item["職稱"] || "",
      phone: item["電話"] || "",
      email: item["Email"] || "",
      type: item["身分"] || "一般民眾",
      status: item["報到狀態"] || "未報到",
    }));

    try {
      const result = await participantsStore.importParticipants(sanitizedData);

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
              .map((err) => {
                const errorMsg = Object.entries(err.errors)
                  .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
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
    } catch (err) {
      console.error("匯入異常:", err);
      showError("匯入失敗：" + (err.message || "請檢查檔案格式或網路連線"));
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
};

const openEditPanel = (participant) => {
  editingParticipant.value = { ...participant };
};

const closeEditPanel = () => {
  editingParticipant.value = null;
};
const deleteParticipant = async (participant) => {
  if (!confirm("確定要刪除這位參與者嗎？")) return;

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
    editingParticipant.value = { ...editingParticipant.value, ...updated };
    success("更新成功");
  } catch (err) {
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
    editingParticipant.value = { ...created };
    success("新增成功，請編輯詳細資料");
  } catch (err) {
    showError("新增失敗: " + (err.message || "未知錯誤"));
  }
};

// VIP 勾選管理（本地狀態）
const selectedVIPIds = ref(new Set());
const isVIPSelected = (id) => selectedVIPIds.value.has(id);
const toggleVIP = (participant) => {
  const s = new Set(selectedVIPIds.value);
  if (s.has(participant.id)) {
    s.delete(participant.id);
  } else {
    s.add(participant.id);
  }
  selectedVIPIds.value = s;
};
</script>

<template>
  <div class="participants-view">
    <!-- 加載遮罩 -->
    <div v-if="participantsStore.loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>載入中...</p>
    </div>

    <div class="page-header">
      <div class="header-left">
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input v-model="searchQuery" placeholder="搜尋姓名、公司..." class="search-input" />
        </div>

        <div class="filter-item">
          <label>報到狀態</label>
          <select v-model="filterStatus" class="select-rounded">
            <option v-for="s in allStatuses" :key="s" :value="s">
              {{ s === "All" ? "所有狀態" : s }}
            </option>
          </select>
        </div>
      </div>

      <div class="header-actions">
        <input
          type="file"
          ref="fileInput"
          style="display: none"
          accept=".xlsx, .xls"
          @change="handleImport"
        />
        <button class="btn-secondary" @click="triggerImport">匯入名單</button>

        <!-- 匯出選單 -->
        <div class="export-dropdown">
          <button class="btn-secondary" :disabled="isExporting" @click="handleExport">
            {{ isExporting ? "處理中..." : "匯出 Excel" }}
          </button>

          <Transition name="dropdown-fade">
            <div v-if="showExportMenu" class="export-menu">
              <button @click="exportData('all')" class="export-option">
                📊 匯出全部 ({{ participantsStore.participants.length }} 筆)
              </button>
              <button @click="exportData('current')" class="export-option">
                🔍 匯出當前篩選 ({{ filteredList.length }} 筆)
              </button>
              <div class="menu-divider"></div>
              <button @click="exportData('vip')" class="export-option">
                ⭐ 只匯出 VIP ({{
                  participantsStore.participants.filter((p) => p.type === "VIP").length
                }}
                筆)
              </button>
              <button @click="exportData('general')" class="export-option">
                👥 只匯出一般民眾 ({{
                  participantsStore.participants.filter((p) => p.type === "一般民眾").length
                }}
                筆)
              </button>
              <div class="menu-divider"></div>
              <button @click="exportData('checked')" class="export-option">
                ✅ 只匯出已報到 ({{
                  participantsStore.participants.filter((p) => p.status === "已報到").length
                }}
                筆)
              </button>
              <button @click="exportData('unchecked')" class="export-option">
                ⏳ 只匯出未報到 ({{
                  participantsStore.participants.filter((p) => p.status === "未報到").length
                }}
                筆)
              </button>
            </div>
          </Transition>
        </div>

        <button class="btn-primary" @click="addParticipant">新增</button>
      </div>
    </div>

    <div class="tech-card table-container">
      <!-- 標籤切換 -->
      <div class="tab-navigation">
        <button :class="['tab-button', { active: activeTab === 'VIP' }]" @click="activeTab = 'VIP'">
          <span class="tab-icon">⭐</span>
          <span class="tab-label">貴賓 VIP</span>
          <span class="tab-count">{{ vipCount }}</span>
        </button>
        <button
          :class="['tab-button', { active: activeTab === '一般民眾' }]"
          @click="activeTab = '一般民眾'"
        >
          <span class="tab-icon">👥</span>
          <span class="tab-label">一般民眾</span>
          <span class="tab-count">{{ generalCount }}</span>
        </button>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th v-if="activeTab === 'VIP'" style="width: 60px; text-align: center"></th>
            <th>姓名 / Email</th>
            <th>公司單位 / 職稱</th>
            <th>聯絡電話</th>
            <th>身分</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in filteredList"
            :key="p.id"
            :class="{ selected: activeTab === 'VIP' && isVIPSelected(p.id) }"
          >
            <td v-if="activeTab === 'VIP'" style="text-align: center">
              <label class="checkbox-wrapper" @click.stop>
                <input
                  type="checkbox"
                  :checked="isVIPSelected(p.id)"
                  @change="toggleVIP(p)"
                />
                <span class="checkmark"></span>
              </label>
            </td>
            <td>
              <div class="name-cell">
                <span class="avatar">{{ p.name.charAt(0) }}</span>
                <div>
                  <div class="name">{{ p.name }}</div>
                  <div class="email-sub">{{ p.email }}</div>
                </div>
              </div>
            </td>
            <td>
              <div class="comp">{{ p.company }}</div>
              <div class="title-sub">{{ p.title }}</div>
            </td>
            <td>{{ p.phone }}</td>
            <td>
              <span :class="['tag', p.type.toLowerCase()]">{{ p.type }}</span>
            </td>
            <td>
              <span :class="['status-dot', p.status === '已報到' ? 'check' : '']">{{
                p.status
              }}</span>
            </td>
            <td>
              <div class="action-buttons">
                <button class="btn-action edit" @click="openEditPanel(p)">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  編輯
                </button>
                <button class="btn-action delete" @click="deleteParticipant(p)">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    ></path>
                  </svg>
                  刪除
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredList.length === 0">
            <td colspan="6" class="empty-state">查無符合條件的參與者</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 右側滑出編輯面板 -->
    <Teleport to="body">
      <Transition name="panel-slide">
        <div v-if="editingParticipant" class="edit-panel-overlay" @click.self="closeEditPanel">
          <div class="edit-panel">
            <div class="panel-header">
              <h3>編輯參與者資訊</h3>
              <button class="btn-close" @click="closeEditPanel">✕</button>
            </div>

            <div class="panel-body">
              <div class="form-section">
                <h4 class="section-title">基本資訊</h4>

                <div class="form-field">
                  <label>姓名 *</label>
                  <input
                    v-model="editingParticipant.name"
                    placeholder="請輸入姓名"
                    class="input-styled"
                  />
                </div>

                <div class="form-field">
                  <label>公司單位</label>
                  <input
                    v-model="editingParticipant.company"
                    placeholder="請輸入公司名稱"
                    class="input-styled"
                  />
                </div>

                <div class="form-field">
                  <label>職稱</label>
                  <input
                    v-model="editingParticipant.title"
                    placeholder="請輸入職稱"
                    class="input-styled"
                  />
                </div>

                <div class="form-field">
                  <label>身分</label>
                  <select v-model="editingParticipant.type" class="select-styled">
                    <option value="VIP">貴賓 VIP</option>
                    <option value="一般民眾">一般民眾</option>
                  </select>
                </div>
              </div>

              <div class="form-section">
                <h4 class="section-title">聯絡資訊</h4>

                <div class="form-field">
                  <label>電子信箱</label>
                  <input
                    v-model="editingParticipant.email"
                    type="email"
                    placeholder="請輸入信箱"
                    class="input-styled"
                  />
                </div>

                <div class="form-field">
                  <label>聯絡電話</label>
                  <input
                    v-model="editingParticipant.phone"
                    type="tel"
                    placeholder="請輸入電話"
                    class="input-styled"
                  />
                </div>
              </div>

              <div class="form-section">
                <h4 class="section-title">報到狀態</h4>

                <div class="form-field">
                  <label>狀態</label>
                  <select v-model="editingParticipant.status" class="select-styled">
                    <option value="已報到">已報到</option>
                    <option value="未報到">未報到</option>
                  </select>
                </div>
              </div>

              <!-- QR Code 區塊 -->
              <div class="form-section" v-if="editingParticipant.qrCodeUrl">
                <h4 class="section-title">專屬報到 QR Code</h4>
                <div class="qr-display">
                  <img :src="editingParticipant.qrCodeUrl" alt="QR Code" class="qr-image" />
                  <p class="qr-token">{{ editingParticipant.checkInToken }}</p>
                  <a :href="editingParticipant.qrCodeUrl" download="qrcode.png" class="btn-download-qr">
                    ⬇ 下載 QR Code
                  </a>
                </div>
              </div>
            </div>

            <div class="panel-footer">
              <button class="btn-delete-participant" @click="deleteParticipant(editingParticipant)">
                刪除參與者
              </button>
              <button class="btn-save" @click="saveParticipant">儲存</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.participants-view {
  padding: 30px;
  background: #f8fafc;
  min-height: 100vh;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
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
      color: #475569;
    }

    .search-input {
      width: 100%;
      padding: 10px 42px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: white;
      outline: none;

      &:focus {
        border-color: #667eea;
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
      color: #475569;
      white-space: nowrap;
    }
  }

  .select-rounded {
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    background: white;
    font-size: 0.85rem;
    outline: none;
    cursor: pointer;
    min-width: 140px;

    &:focus {
      border-color: #667eea;
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);

  &:hover {
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
  }
}

.btn-secondary {
  background: white;
  color: #475569;
  border: 2px solid #e2e8f0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

  &:hover {
    border-color: #cbd5e1;
    background: #f8fafc;
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
  background: white;
  border: 2px solid #e2e8f0;
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
  background: white;
  color: #475569;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-bottom: none;
  border-radius: 12px 12px 0 0;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.95rem;
  font-weight: 600;
  color: #64748b;
  position: relative;
  margin-bottom: -1px;

  &::before {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: #f1f5f9;
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
    color: #64748b;
    border-radius: 11px;
    font-size: 0.7rem;
    font-weight: 700;
  }

  &:hover:not(.active) {
    background: #e2e8f0;
    color: #475569;
    transform: translateY(-2px);
  }

  &.active {
    background: white;
    color: #667eea;
    border-color: #e2e8f0;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
    z-index: 1;

    &::before {
      opacity: 1;
      background: white;
    }

    .tab-count {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
    }
  }
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
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-bottom: none;
  border-radius: 12px 12px 0 0;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.95rem;
  font-weight: 600;
  color: #64748b;
  position: relative;
  margin-bottom: -1px;

  &::before {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: #f1f5f9;
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
    color: #64748b;
    border-radius: 11px;
    font-size: 0.7rem;
    font-weight: 700;
  }

  &:hover:not(.active) {
    background: #e2e8f0;
    color: #475569;
    transform: translateY(-2px);
  }

  &.active {
    background: white;
    color: #667eea;
    border-color: #e2e8f0;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
    z-index: 1;

    &::before {
      opacity: 1;
      background: white;
    }

    .tab-count {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
    }
  }
}

/* 表格樣式 */
.table-container {
  background: white;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  overflow: visible;
  padding: 0;
}
.data-table {
  width: 100%;
  border-collapse: collapse;

  th {
    background: #f8fafc;
    padding: 16px 24px;
    text-align: left;
    font-size: 0.85rem;
    color: #475569;
  }

  td {
    padding: 16px 24px;
    border-bottom: 1px solid #f1f5f9;
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-color: #667eea;

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
      border-color: #667eea;
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
    color: #1e293b;
  }
  .email-sub {
    font-size: 0.75rem;
    color: #94a3b8;
  }
}

.title-sub {
  font-size: 0.75rem;
  color: #94a3b8;
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
  color: #475569;
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
    background: white;
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
  color: #94a3b8;
  font-style: italic;
}

/* 右側編輯面板樣式 */
.edit-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.edit-panel {
  width: 480px;
  max-width: 90vw;
  background: white;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
}

.panel-header {
  padding: 24px 28px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;

  h3 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #64748b;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: all 0.2s;

    &:hover {
      background: #e2e8f0;
      color: #1e293b;
    }
  }
}

.panel-body {
  flex: 1;
  padding: 28px;
  overflow-y: auto;
}

.form-section {
  margin-bottom: 32px;

  &:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid #e2e8f0;
  }
}

.form-field {
  margin-bottom: 20px;

  label {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: #475569;
    margin-bottom: 8px;
  }

  .input-styled,
  .select-styled {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 0.95rem;
    outline: none;
    transition: all 0.2s;
    background: white;

    &:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
  }

  .select-styled {
    cursor: pointer;
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
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    padding: 8px;
    background: #fff;
  }

  .qr-token {
    font-size: 0.75rem;
    color: #94a3b8;
    font-family: monospace;
    letter-spacing: 1px;
    margin: 0;
  }

  .btn-download-qr {
    font-size: 0.82rem;
    color: #3b82f6;
    text-decoration: none;
    border: 1px solid #3b82f6;
    padding: 6px 16px;
    border-radius: 8px;

    &:hover {
      background: rgba(59, 130, 246, 0.08);
    }
  }
}

.panel-footer {
  padding: 20px 28px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 12px;
  background: #f8fafc;

  .btn-delete-participant {
    flex: 1;
    padding: 12px 20px;
    background: white;
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
}

/* 面板滑動動畫 */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.3s ease;
}

.panel-slide-enter-from {
  opacity: 0;

  .edit-panel {
    transform: translateX(100%);
  }
}

.panel-slide-leave-to {
  opacity: 0;

  .edit-panel {
    transform: translateX(100%);
  }
}

.panel-slide-enter-active .edit-panel,
.panel-slide-leave-active .edit-panel {
  transition: transform 0.3s ease;
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
    color: #475569;
  }
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e2e8f0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
