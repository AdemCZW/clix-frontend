<script setup>
import { ref, computed } from "vue";
import { useToast } from "@/composables/useToast";
import { useParticipantsStore } from "@/stores/participants";

const { success, warning } = useToast();
const participantsStore = useParticipantsStore();

const showModal = ref(false);
const searchName = ref("");

// 篩選條件
const filterMethod = ref("all"); // all, QR Scan, Manual
const filterType = ref("all"); // all, VIP, 一般民眾
const filterName = ref("");

// 使用 store 的統計數據和報到紀錄
const stats = computed(() => participantsStore.stats);

// 篩選後的報到紀錄
const logs = computed(() => {
  let filtered = [...participantsStore.checkInLogs];

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
const processCheckIn = (person, method) => {
  const success_result = participantsStore.checkIn(person.id, method);
  if (success_result) {
    showModal.value = false;
    searchName.value = "";
    success(`${person.name} 報到成功！`);
  } else {
    warning(`${person.name} 已經報到過了`);
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
          <div class="main-stat-row">
            <div class="stat-label">當前報到率</div>
            <div class="stat-value-large">{{ checkInRate }}%</div>
          </div>
          <div class="progress-container">
            <div class="progress-bar" :style="{ width: checkInRate + '%' }"></div>
          </div>
          <div class="mini-stats-row">
            <div class="mini-stat-item">
              <div class="mini-label">應到人數</div>
              <div class="mini-value">{{ stats.total }}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="mini-stat-item accent">
              <div class="mini-label">已報到</div>
              <div class="mini-value">{{ stats.checkedIn }}</div>
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
                "
                :disabled="filterMethod === 'all' && filterType === 'all' && !filterName"
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
  padding: 24px;

  .main-stat-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 16px;

    .stat-label {
      font-size: 0.9rem;
      color: #64748b;
      font-weight: 600;
    }

    .stat-value-large {
      font-size: 3rem;
      font-weight: 800;
      color: #0ea5e9;
      line-height: 1;
    }
  }

  .progress-container {
    height: 12px;
    background: #f1f5f9;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 20px;

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #38bdf8, #0ea5e9);
      transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  }

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
        font-size: 0.75rem;
        color: #94a3b8;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }

      .mini-value {
        font-size: 1.75rem;
        font-weight: 800;
        color: #1e293b;
      }

      &.accent .mini-value {
        color: #10b981;
      }
    }

    .stat-divider {
      width: 1px;
      height: 40px;
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
