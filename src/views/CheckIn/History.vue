<script setup>
import { ref, computed, watch } from "vue";
import { useToast } from "@/composables/useToast";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { useCheckinStats } from "@/composables/useCheckinStats";
import BaseModal from "@/components/shared/BaseModal.vue";

const { success, warning } = useToast();
const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();
const { stats, checkInRate } = useCheckinStats();

const showManualModal = ref(false);
const searchName = ref("");

// 篩選條件
const filterType = ref("all");
const filterName = ref("");
const filterDateFrom = ref("");
const filterDateTo = ref("");
const activeTab = ref("all");

// 隨活動切換載入報到資料
watch(
  () => eventsStore.currentEvent,
  async (event) => {
    if (!event?.id) {
      participantsStore.clear();
      return;
    }
    try {
      await participantsStore.fetchParticipants({ event: event.id });
    } catch { /* silent */ }
  },
  { immediate: true }
);

// 活動日期相關
const currentEvent = computed(() => eventsStore.currentEvent);

const eventDateDisplay = computed(() => {
  const e = currentEvent.value;
  if (!e?.date) return "—";
  if (e.endDate && e.endDate !== e.date) return `${e.date} ～ ${e.endDate}`;
  return e.date;
});

const isMultiDayEvent = computed(() => {
  const e = currentEvent.value;
  return !!(e?.endDate && e.endDate !== e.date);
});

const eventDateOptions = computed(() => {
  const e = currentEvent.value;
  if (!e?.date) return [];
  const start = new Date(e.date);
  const end = e.endDate && e.endDate !== e.date ? new Date(e.endDate) : new Date(e.date);
  const dates = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
});

// 從已報到的參與者衍生報到紀錄（依時間降序）
const allCheckInLogs = computed(() =>
  participantsStore.participants
    .filter((p) => p.status === "已報到")
    .map((p) => {
      const ts = p.updatedAt ? new Date(p.updatedAt) : null;
      return {
        id: p.id,
        name: p.name,
        type: p.type || "一般民眾",
        method: "QR Scan",
        time: ts
          ? ts.toLocaleString("zh-TW", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "--",
        dateStr: ts ? ts.toISOString().slice(0, 10) : "",
        timestamp: ts ? ts.getTime() : 0,
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp)
);

// 篩選後的報到紀錄
const logs = computed(() => {
  let filtered = [...allCheckInLogs.value];

  if (activeTab.value === "qr") {
    filtered = filtered.filter((log) => log.method === "QR Scan");
  } else if (activeTab.value === "manual") {
    filtered = filtered.filter((log) => log.method === "Manual");
  }

  if (filterDateFrom.value || filterDateTo.value) {
    filtered = filtered.filter((log) => {
      if (!log.dateStr) return false;
      if (filterDateFrom.value && log.dateStr < filterDateFrom.value) return false;
      if (filterDateTo.value && log.dateStr > filterDateTo.value) return false;
      return true;
    });
  }

  if (filterType.value !== "all") {
    filtered = filtered.filter((log) => log.type === filterType.value);
  }

  if (filterName.value) {
    filtered = filtered.filter((log) => log.name.includes(filterName.value));
  }

  return filtered;
});

// 搜尋與建議邏輯
const searchResult = computed(() => {
  if (!searchName.value) return [];
  return participantsStore.participants.filter(
    (p) => p.status !== "已報到" && p.name.includes(searchName.value),
  );
});

const pendingList = computed(() => {
  return participantsStore.participants.filter((p) => p.status !== "已報到").slice(0, 5);
});

const processCheckIn = async (person) => {
  if (person.status === "已報到") {
    warning(`${person.name} 已經報到過了`);
    return;
  }
  try {
    await participantsStore.checkIn(person.id);
    showManualModal.value = false;
    searchName.value = "";
    success(`${person.name} 報到成功！`);
  } catch {
    warning(`${person.name} 報到失敗，請重試`);
  }
};

// 取消報到
const cancelTarget = ref(null);
const showCancelDialog = ref(false);

const askCancelCheckIn = (log) => {
  cancelTarget.value = log;
  showCancelDialog.value = true;
};

const confirmCancel = async () => {
  if (!cancelTarget.value) return;
  try {
    await participantsStore.checkOut(cancelTarget.value.id);
    success(`已取消 ${cancelTarget.value.name} 的報到`);
  } catch {
    warning("取消報到失敗，請重試");
  } finally {
    showCancelDialog.value = false;
    cancelTarget.value = null;
  }
};

const resetFilters = () => {
  activeTab.value = "all";
  filterType.value = "all";
  filterName.value = "";
  filterDateFrom.value = "";
  filterDateTo.value = "";
};

const hasActiveFilters = computed(() =>
  activeTab.value !== "all" || filterType.value !== "all" || !!filterName.value || !!filterDateFrom.value || !!filterDateTo.value
);
</script>

<template>
  <div class="checkin-view">
    <!-- 頂部統計列 -->
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">📅 {{ eventDateDisplay }}</div>
      </div>
      <div class="stat-group">
        <div class="stat-item">
          <span class="stat-value primary">{{ checkInRate }}%</span>
          <span class="stat-label">報到率</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-value">{{ stats.total }}</span>
          <span class="stat-label">應到</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-value accent">{{ stats.checkedIn }}</span>
          <span class="stat-label">已報到</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-value warn">{{ stats.pending }}</span>
          <span class="stat-label">未報到</span>
        </div>
      </div>
      <button class="btn-manual" @click="showManualModal = true">手動報到</button>
    </div>

    <!-- 主要內容：篩選 + 報到紀錄 -->
    <div class="main-card">
      <!-- 篩選列 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="method-tabs">
            <button :class="['tab-btn', activeTab === 'all' && 'active']" @click="activeTab = 'all'">全部</button>
            <button :class="['tab-btn', activeTab === 'qr' && 'active']" @click="activeTab = 'qr'">QR 掃描</button>
            <button :class="['tab-btn', activeTab === 'manual' && 'active']" @click="activeTab = 'manual'">手動補錄</button>
          </div>
          <span class="record-count">{{ logs.length }} 筆</span>
        </div>
        <div class="toolbar-right">
          <input v-model="filterName" class="filter-input" placeholder="搜尋姓名..." />
          <select v-model="filterType" class="filter-select">
            <option value="all">全部類型</option>
            <option value="VIP">VIP</option>
            <option value="一般民眾">一般民眾</option>
          </select>
          <!-- 多天活動日期篩選 -->
          <template v-if="isMultiDayEvent">
            <input
              type="date"
              v-model="filterDateFrom"
              class="filter-input date-input"
              :min="eventDateOptions[0]"
              :max="filterDateTo || eventDateOptions[eventDateOptions.length - 1]"
            />
            <span class="date-sep">～</span>
            <input
              type="date"
              v-model="filterDateTo"
              class="filter-input date-input"
              :min="filterDateFrom || eventDateOptions[0]"
              :max="eventDateOptions[eventDateOptions.length - 1]"
            />
          </template>
          <button v-if="hasActiveFilters" class="btn-reset" @click="resetFilters">清除</button>
        </div>
      </div>

      <!-- 報到紀錄列表 -->
      <div class="log-list">
        <transition-group name="list">
          <div v-for="log in logs" :key="log.id" class="log-item">
            <div class="log-left">
              <div class="log-name">
                {{ log.name }}
                <span :class="['type-badge', log.type === 'VIP' ? 'type-vip' : 'type-general']">
                  {{ log.type }}
                </span>
              </div>
              <div class="log-meta">
                <span class="log-time">{{ log.time }}</span>
                <span class="log-separator">·</span>
                <span :class="['log-method', log.method === 'QR Scan' ? 'method-qr' : 'method-manual']">
                  {{ log.method === "QR Scan" ? "QR" : "手動" }}
                </span>
              </div>
            </div>
            <button class="btn-cancel-checkin" @click="askCancelCheckIn(log)">取消報到</button>
          </div>
        </transition-group>
        <div v-if="logs.length === 0" class="empty-state">等待報到數據中...</div>
      </div>
    </div>

    <!-- 手動報到 Modal -->
    <BaseModal v-model="showManualModal" title="手動報到" max-width="480px">
      <div class="search-wrapper">
        <input
          v-model="searchName"
          class="search-input"
          placeholder="輸入姓名搜尋..."
          autofocus
        />
      </div>
      <p class="list-label">{{ searchName ? "搜尋結果" : "待報到名單（前5筆）" }}</p>
      <div class="person-list">
        <div
          v-for="p in searchName ? searchResult : pendingList"
          :key="p.id"
          class="person-row"
        >
          <div class="person-info">
            <span class="p-name">{{ p.name }}</span>
            <span class="p-detail">{{ p.company }}{{ p.phone ? ` · ${p.phone}` : '' }}</span>
          </div>
          <button class="btn-check-action" @click="processCheckIn(p)">報到</button>
        </div>
        <div v-if="searchName && searchResult.length === 0" class="no-result">
          查無未報到名單
        </div>
      </div>
    </BaseModal>

    <!-- 取消報到確認 -->
    <BaseModal v-model="showCancelDialog" title="確認取消報到？" max-width="380px">
      <p class="dialog-msg">
        即將取消 <strong>{{ cancelTarget?.name }}</strong> 的報到紀錄，此操作將把狀態還原為「未報到」。
      </p>
      <template #footer>
        <button class="btn-dialog cancel" @click="showCancelDialog = false">返回</button>
        <button class="btn-dialog confirm" @click="confirmCancel">確認取消</button>
      </template>
    </BaseModal>
  </div>
</template>

<style lang="scss" scoped>
.checkin-view {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: calc(100vh - 48px);
}

/* ── 頂部統計列 ── */
.stats-bar {
  background: white;
  border-radius: 16px;
  padding: 16px 24px;
  border: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.stat-group {
  display: flex;
  align-items: center;
  gap: 20px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;

  .stat-label {
    font-size: 0.82rem;
    color: #64748b;
    font-weight: 600;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1;

    &.primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    &.accent { color: #10b981; }
    &.warn { color: #f59e0b; }
  }
}

.stat-divider {
  width: 1px;
  height: 28px;
  background: #e5e7eb;
}

.btn-manual {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }
}

/* ── 主卡片 ── */
.main-card {
  background: white;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 工具列 ── */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #f1f5f9;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.method-tabs {
  display: flex;
  gap: 3px;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 3px;

  .tab-btn {
    padding: 5px 14px;
    border-radius: 6px;
    border: none;
    background: transparent;
    font-size: 0.82rem;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;

    &.active {
      background: white;
      color: #0f172a;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }

    &:hover:not(.active) { color: #334155; }
  }
}

.record-count {
  font-size: 0.82rem;
  color: #64748b;
  font-weight: 600;
  background: #f8fafc;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  white-space: nowrap;
}

.filter-input,
.filter-select {
  padding: 6px 12px;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.85rem;
  outline: none;
  transition: all 0.2s;
  background: white;

  &:focus {
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
}

.filter-input { width: 140px; }
.filter-select { cursor: pointer; }
.date-input { width: 130px; }
.date-sep { color: #94a3b8; font-size: 0.85rem; }

.btn-reset {
  padding: 6px 14px;
  background: #f1f5f9;
  color: #64748b;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: #e2e8f0;
    color: #475569;
  }
}

/* ── 報到紀錄列表 ── */
.log-list {
  flex: 1;
  overflow-y: auto;

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: #f8fafc; }
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
    &:hover { background: #94a3b8; }
  }
}

.log-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #f8fafc;
  transition: background 0.15s;

  &:hover { background: #fafbfc; }
}

.log-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 5px;

  &.type-vip {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
  }

  &.type-general {
    background: #e0e7ff;
    color: #3730a3;
    border: 1px solid #a5b4fc;
  }
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: #64748b;
}

.log-time {
  font-family: "Courier New", monospace;
  font-weight: 600;
}

.log-separator { color: #cbd5e1; }

.log-method {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;

  &.method-qr {
    background: #dbeafe;
    color: #0284c7;
  }

  &.method-manual {
    background: #f1f5f9;
    color: #475569;
  }
}

.btn-cancel-checkin {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #ef4444;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: #fee2e2;
    border-color: #fca5a5;
  }
}

.empty-state {
  padding: 60px;
  text-align: center;
  color: #cbd5e1;
  font-weight: 600;
  font-size: 0.95rem;
}

/* ── 手動報到 Modal 內容 ── */
.search-wrapper {
  margin-bottom: 16px;

  .search-input {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    font-size: 0.95rem;
    outline: none;
    transition: all 0.2s;

    &:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
  }
}

.list-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px;
}

.person-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.person-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 2px solid transparent;
  transition: all 0.2s;

  &:hover {
    background: white;
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.12);
  }
}

.person-info {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .p-name {
    font-weight: 700;
    color: #0f172a;
    font-size: 0.95rem;
  }

  .p-detail {
    font-size: 0.78rem;
    color: #64748b;
  }
}

.btn-check-action {
  padding: 7px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }
}

.no-result {
  padding: 30px;
  text-align: center;
  color: #cbd5e1;
  font-weight: 600;
}

/* ── 取消報到確認 ── */
.dialog-msg {
  font-size: 0.9rem;
  color: #64748b;
  line-height: 1.6;
  margin: 0;
  text-align: center;

  strong { color: #0f172a; }
}

.btn-dialog {
  flex: 1;
  padding: 10px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: all 0.2s;

  &.cancel {
    background: #f1f5f9;
    color: #475569;
    &:hover { background: #e2e8f0; }
  }

  &.confirm {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    &:hover { box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4); }
  }
}

/* ── 動畫 ── */
.list-enter-active { transition: all 0.4s ease; }
.list-enter-from { opacity: 0; transform: translateX(-20px); }

/* ── RWD ── */
@media (max-width: 768px) {
  .checkin-view { padding: 12px; }

  .stats-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 16px;
  }

  .stat-group {
    justify-content: space-around;
  }

  .btn-manual { width: 100%; text-align: center; }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .toolbar-left { justify-content: space-between; }

  .toolbar-right {
    flex-wrap: wrap;
    gap: 6px;
  }

  .filter-input { flex: 1; min-width: 0; width: auto; }
  .filter-select { flex: 1; min-width: 0; }
  .date-input { flex: 1; min-width: 100px; width: auto; }

  .log-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .btn-cancel-checkin { align-self: flex-end; }
}
</style>
