<script setup>
import { ref, computed, watch } from "vue";
import { useToast } from "@/composables/useToast";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";

const { success, warning } = useToast();
const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();

const showModal = ref(false);
const searchName = ref("");

// 篩選條件
const filterMethod = ref("all"); // all, QR Scan, Manual
const filterType = ref("all"); // all, VIP, 一般民眾
const filterName = ref("");
const filterDate = ref(""); // 多天活動日期篩選

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

// 從 participants 衍生統計資料
const stats = computed(() => {
  const all = participantsStore.participants;
  return {
    total: all.length,
    checkedIn: all.filter((p) => p.status === "已報到").length,
    vip: all.filter((p) => p.type === "VIP").length,
    general: all.filter((p) => p.type === "一般民眾").length,
  };
});

// 從已報到的參與者衍生報到紀錄（依時間降序：最新在上）
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
        seat: "--",
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp)
);

// 篩選後的報到紀錄
const logs = computed(() => {
  let filtered = [...allCheckInLogs.value];

  // 按日期篩選（多天活動）
  if (filterDate.value) {
    filtered = filtered.filter((log) => log.dateStr === filterDate.value);
  }

  // 按報到方式篩選
  if (filterMethod.value !== "all") {
    filtered = filtered.filter((log) => log.method === filterMethod.value);
  }

  // 按身份類型篩選
  if (filterType.value !== "all") {
    filtered = filtered.filter((log) => log.type === filterType.value);
  }

  // 按姓名搜尋
  if (filterName.value) {
    filtered = filtered.filter((log) => log.name.includes(filterName.value));
  }

  return filtered;
});

const checkInRate = computed(() =>
  stats.value.total > 0 ? Math.round((stats.value.checkedIn / stats.value.total) * 100) : 0,
);

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

// 通用報到處理邏輯
const processCheckIn = async (person, method) => {
  if (person.status === "已報到") {
    warning(`${person.name} 已經報到過了`);
    return;
  }
  try {
    await participantsStore.checkIn(person.id);
    showModal.value = false;
    searchName.value = "";
    success(`${person.name} 報到成功！`);
  } catch {
    warning(`${person.name} 報到失敗，請重試`);
  }
};

const simulateQRScan = () => {
  const pendingOnes = participantsStore.participants.filter((p) => p.status !== "已報到");
  if (pendingOnes.length === 0) {
    warning("名單已全部報到");
    return;
  }
  const luckyGuest = pendingOnes[Math.floor(Math.random() * pendingOnes.length)];
  processCheckIn(luckyGuest, "QR Scan");
};
</script>

<template>
  <div class="checkin-view">
    <div class="unified-container">
      <!-- 左側：統計與操作區 -->
      <div class="left-panel">
        <!-- 統計儀表板 -->
        <div class="tech-card unified-stats">
          <!-- 活動日期 -->
          <div class="event-date-bar">
            <span class="date-icon">📅</span>
            <span class="date-text">{{ eventDateDisplay }}</span>
          </div>

          <!-- 日期篩選（多天活動才顯示） -->
          <div v-if="isMultiDayEvent" class="date-filter-row">
            <label class="date-filter-label">篩選日期</label>
            <select v-model="filterDate" class="date-filter-select">
              <option value="">全部日期</option>
              <option v-for="d in eventDateOptions" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>

          <!-- 圓形進度環 -->
          <div class="circular-progress-container">
            <svg viewBox="0 0 120 120" class="circular-ring">
              <circle class="ring-bg" cx="60" cy="60" r="50" />
              <circle
                class="ring-fill"
                cx="60" cy="60" r="50"
                transform="rotate(-90 60 60)"
                :stroke-dasharray="`${(checkInRate / 100) * 314.159} 314.159`"
              />
            </svg>
            <div class="ring-center">
              <div class="rate-value">{{ checkInRate }}%</div>
              <div class="rate-label">報到率</div>
            </div>
          </div>

          <!-- 數字統計 -->
          <div class="mini-stats-row">
            <div class="mini-stat-item">
              <div class="mini-label">應到</div>
              <div class="mini-value">{{ stats.total }}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="mini-stat-item accent">
              <div class="mini-label">已報到</div>
              <div class="mini-value">{{ stats.checkedIn }}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="mini-stat-item pending">
              <div class="mini-label">未報到</div>
              <div class="mini-value">{{ stats.total - stats.checkedIn }}</div>
            </div>
          </div>
        </div>

        <!-- 操作按鈕區 -->
        <div class="action-section">
          <button class="btn-primary btn-full" @click="simulateQRScan">模擬 QR 掃描</button>
          <button class="btn-secondary btn-full" @click="showModal = true">手動報到補錄</button>
        </div>

        <!-- 手動報到搜尋區（整合進左側面板） -->
        <div v-if="showModal" class="manual-checkin-panel">
          <div class="panel-header">
            <div class="header-title">
              <h3>手動報到搜尋</h3>
            </div>
            <button class="close-btn" @click="showModal = false">✕</button>
          </div>

          <div class="panel-body">
            <div class="search-wrapper">
              <input
                v-model="searchName"
                class="input-rounded"
                placeholder="輸入姓名或關鍵字..."
                autofocus
              />
            </div>

            <div class="list-container">
              <p class="list-label">{{ searchName ? "搜尋結果" : "待報到建議名單" }}</p>

              <div
                v-for="p in searchName ? searchResult : pendingList"
                :key="p.id"
                class="person-row"
              >
                <div class="person-info">
                  <span class="p-name">{{ p.name }}</span>
                  <span class="p-phone">{{ p.phone }}</span>
                </div>
                <button class="btn-check-action" @click="processCheckIn(p, 'Manual')">
                  點擊報到
                </button>
              </div>

              <div v-if="searchName && searchResult.length === 0" class="no-result">
                查無未報到名單
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右側：即時報到紀錄流 -->
      <div class="right-panel">
        <div class="tech-card logs-container">
          <div class="card-header">
            <h3 class="subtitle">即時報到紀錄</h3>
            <span class="record-count">共 {{ logs.length }} 筆</span>
          </div>

          <!-- 篩選控制區 -->
          <div class="filter-section">
            <div class="filter-row">
              <div class="filter-group">
                <label class="filter-label">搜尋姓名</label>
                <input v-model="filterName" class="filter-input" placeholder="輸入姓名..." />
              </div>

              <div class="filter-group">
                <label class="filter-label">報到方式</label>
                <select v-model="filterMethod" class="filter-select">
                  <option value="all">全部</option>
                  <option value="QR Scan">QR 掃描</option>
                  <option value="Manual">手動補錄</option>
                </select>
              </div>

              <div class="filter-group">
                <label class="filter-label">身份類型</label>
                <select v-model="filterType" class="filter-select">
                  <option value="all">全部</option>
                  <option value="VIP">VIP</option>
                  <option value="一般民眾">一般民眾</option>
                </select>
              </div>

              <button
                class="filter-reset-btn"
                @click="
                  filterMethod = 'all';
                  filterType = 'all';
                  filterName = '';
                  filterDate = '';
                "
                :disabled="filterMethod === 'all' && filterType === 'all' && !filterName && !filterDate"
              >
                清除篩選
              </button>
            </div>
          </div>

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
                    <span class="log-seat">{{ log.seat }}</span>
                  </div>
                </div>
                <div class="log-right">
                  <span
                    :class="[
                      'log-method',
                      log.method === 'QR Scan' ? 'method-qr' : 'method-manual',
                    ]"
                  >
                    {{ log.method === "QR Scan" ? "QR 掃描" : "手動補錄" }}
                  </span>
                </div>
              </div>
            </transition-group>
            <div v-if="logs.length === 0" class="empty-state">等待報到數據中...</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 頁面基本配置 */
.checkin-view {
  padding: 24px;
  background: #f8fafc;
  min-height: 100vh;
}

/* 統一容器 - 左右分欄 */
.unified-container {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 24px;
  height: calc(100vh - 48px);
}

/* 左側面板 */
.left-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 統一統計區塊 */
.unified-stats {
  padding: 20px 24px;

  /* 活動日期列 */
  .event-date-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    padding: 8px 12px;
    background: #f0f9ff;
    border-radius: 10px;
    border: 1px solid #bae6fd;

    .date-icon {
      font-size: 1rem;
      flex-shrink: 0;
    }

    .date-text {
      font-size: 0.88rem;
      font-weight: 700;
      color: #0369a1;
      letter-spacing: 0.3px;
    }
  }

  /* 日期篩選（多天活動） */
  .date-filter-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;

    .date-filter-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #64748b;
      white-space: nowrap;
    }

    .date-filter-select {
      flex: 1;
      padding: 7px 10px;
      border: 1.5px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.85rem;
      outline: none;
      background: white;
      cursor: pointer;

      &:focus {
        border-color: #0ea5e9;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
      }
    }
  }

  /* 圓形進度環 */
  .circular-progress-container {
    position: relative;
    width: 160px;
    height: 160px;
    margin: 0 auto 20px;

    .circular-ring {
      width: 100%;
      height: 100%;
      overflow: visible;

      .ring-bg {
        fill: none;
        stroke: #f1f5f9;
        stroke-width: 12;
      }

      .ring-fill {
        fill: none;
        stroke: url(#ringGradient);
        stroke-width: 12;
        stroke-linecap: round;
        transition: stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
        stroke: #0ea5e9;
      }
    }

    .ring-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;

      .rate-value {
        font-size: 2rem;
        font-weight: 800;
        color: #0ea5e9;
        line-height: 1;
      }

      .rate-label {
        font-size: 0.72rem;
        font-weight: 600;
        color: #94a3b8;
        margin-top: 4px;
        letter-spacing: 0.5px;
      }
    }
  }

  /* 數字統計列 */
  .mini-stats-row {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding-top: 16px;
    border-top: 1px solid #f1f5f9;

    .mini-stat-item {
      flex: 1;
      text-align: center;

      .mini-label {
        font-size: 0.72rem;
        color: #94a3b8;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
      }

      .mini-value {
        font-size: 1.6rem;
        font-weight: 800;
        color: #1e293b;
      }

      &.accent .mini-value {
        color: #10b981;
      }

      &.pending .mini-value {
        color: #f59e0b;
      }
    }

    .stat-divider {
      width: 1px;
      height: 36px;
      background: #e2e8f0;
    }
  }
}

/* 操作按鈕區 */
.action-section {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .btn-full {
    width: 100%;
    justify-content: center;
    gap: 8px;

    .btn-icon {
      font-size: 1.2rem;
    }
  }
}

/* 手動報到面板（嵌入左側） */
.manual-checkin-panel {
  background: white;
  border-radius: 16px;
  border: 2px solid #e2e8f0;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  animation: slideDown 0.3s ease;

  .panel-header {
    padding: 20px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;

      .icon {
        font-size: 1.5rem;
      }

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: #0f172a;
      }
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: #f1f5f9;
      color: #64748b;
      font-size: 1.2rem;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        background: #e2e8f0;
        color: #0f172a;
        transform: rotate(90deg);
      }
    }
  }

  .panel-body {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

/* 右側面板 - 報到紀錄流 */
.right-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .logs-container {
    padding: 0;
    height: 100%;
    display: flex;
    flex-direction: column;

    .card-header {
      padding: 20px 24px;
      border-bottom: 1px solid #f1f5f9;
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;

      h3 {
        font-size: 1.1rem;
        font-weight: 700;
        margin: 0;
        color: #0f172a;
      }

      .record-count {
        font-size: 0.85rem;
        color: #64748b;
        font-weight: 600;
        background: #f8fafc;
        padding: 4px 12px;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
      }
    }

    .filter-section {
      padding: 16px 24px;
      background: #fafbfc;
      border-bottom: 1px solid #f1f5f9;
      flex-shrink: 0;

      .filter-row {
        display: grid;
        grid-template-columns: 1fr 180px 180px auto;
        gap: 12px;
        align-items: end;
      }

      .filter-group {
        display: flex;
        flex-direction: column;
        gap: 6px;

        .filter-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .filter-input,
        .filter-select {
          padding: 8px 12px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.9rem;
          outline: none;
          transition: all 0.2s;
          background: white;

          &:focus {
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          }
        }

        .filter-select {
          cursor: pointer;

          &:hover {
            border-color: #cbd5e1;
          }
        }
      }

      .filter-reset-btn {
        padding: 8px 16px;
        background: white;
        color: #64748b;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;

        &:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #475569;
        }

        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }
    }

    .log-list {
      flex: 1;
      overflow-y: auto;

      &::-webkit-scrollbar {
        width: 8px;
      }

      &::-webkit-scrollbar-track {
        background: #f8fafc;
      }

      &::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 4px;

        &:hover {
          background: #94a3b8;
        }
      }
    }
  }
}

/* 通用卡片樣式 */
.tech-card {
  background: white;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
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

/* 報到紀錄項目 */
.log-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #f8fafc;
  transition: all 0.2s;

  &:hover {
    background: #fafbfc;
  }

  .log-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .log-name {
      font-size: 1rem;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;

      .type-badge {
        display: inline-block;
        font-size: 0.7rem;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 6px;
        letter-spacing: 0.3px;

        &.type-vip {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          color: #92400e;
          border: 1px solid #fcd34d;
        }

        &.type-general {
          background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
          color: #3730a3;
          border: 1px solid #a5b4fc;
        }
      }
    }

    .log-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      color: #64748b;

      .log-time {
        font-family: "Courier New", Courier, monospace;
        font-weight: 600;
      }

      .log-separator {
        color: #cbd5e1;
      }

      .log-seat {
        font-weight: 600;
        color: #475569;
        background: #f1f5f9;
        padding: 2px 8px;
        border-radius: 4px;
      }
    }
  }

  .log-right {
    flex-shrink: 0;

    .log-method {
      display: inline-block;
      font-size: 0.8rem;
      padding: 6px 16px;
      border-radius: 8px;
      font-weight: 600;
      letter-spacing: 0.3px;

      &.method-qr {
        background: linear-gradient(135deg, #dbeafe 0%, #e0f2fe 100%);
        color: #0284c7;
        border: 1px solid #bae6fd;
      }

      &.method-manual {
        background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
        color: #475569;
        border: 1px solid #cbd5e1;
      }
    }
  }
}

.empty-state {
  padding: 60px;
  text-align: center;
  color: #cbd5e1;
  font-weight: 600;
  font-size: 1rem;
}

/* 搜尋與列表樣式 */
.search-wrapper {
  .input-rounded {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    font-size: 0.95rem;
    transition: all 0.2s;
    outline: none;

    &:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    &::placeholder {
      color: #cbd5e1;
    }
  }
}

.list-container {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .list-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }

  .person-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: #f8fafc;
    border-radius: 12px;
    border: 2px solid transparent;
    transition: all 0.2s;

    &:hover {
      background: white;
      border-color: #667eea;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.12);
    }

    .person-info {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .p-name {
        font-weight: 700;
        color: #0f172a;
        font-size: 0.95rem;
      }

      .p-phone {
        font-size: 0.75rem;
        color: #64748b;
      }
    }

    .btn-check-action {
      padding: 8px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      }

      &:active {
        transform: translateY(0);
      }
    }
  }

  .no-result {
    padding: 40px;
    text-align: center;
    color: #cbd5e1;
    font-weight: 600;
  }
}

/* 動畫效果 */
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.list-enter-active {
  transition: all 0.5s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}
</style>
