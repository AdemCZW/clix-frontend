<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { useSeatsStore } from "@/stores/seats";
import { useUserStore } from "@/stores/user";
import { useCheckinStats } from "@/composables/useCheckinStats";

defineProps({ /* kept for backward compat */ });
const emit = defineEmits(["close"]);

const seatsStore = useSeatsStore();

const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();
const userStore = useUserStore();
const { stats, checkInRate } = useCheckinStats();

const mobileTab = ref('seats');

const now = ref(new Date());
const refreshing = ref(false);
let clockTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

// 即時時鐘
onMounted(async () => {
  // 新分頁開啟時，從 localStorage 恢復當前活動
  if (!eventsStore.currentEvent) {
    userStore.checkAuth();
    const userId = userStore.user?.id;
    if (userId) {
      eventsStore.initFromStorage(userId);
    }
  }

  // 確保座位資料存在（從 localStorage 載入，不打後端）
  const eventId = eventsStore.currentEvent?.id;
  const actId = eventId ? `event_${eventId}` : "act_01";
  seatsStore.ensureActivity(actId);

  clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
  // 每 10 秒刷新參與者報到狀態
  await doRefresh();
  refreshTimer = setInterval(doRefresh, 10000);
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
  if (refreshTimer) clearInterval(refreshTimer);
});

const timeStr = computed(() =>
  now.value.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
);
const dateStr = computed(() =>
  now.value.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
);

// 刷新參與者報到狀態（座位透過 localStorage 跨分頁即時同步，不需打 API）
const doRefresh = async () => {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    const eventId = eventsStore.currentEvent?.id;
    if (eventId) {
      await participantsStore.fetchParticipants({ event: String(eventId) });
    }
  } finally {
    refreshing.value = false;
  }
};

// 根據座位上的人查找報到狀態
const getSeatStatus = (seat) => {
  if (!seat.attendee || seat.attendee.length === 0) return "empty";
  const person = seat.attendee[0];
  if (!person || !person.id) return "empty";
  const p = participantsStore.participants.find((x) => x.id === person.id);
  if (!p) return "assigned";
  return p.status === "已報到" ? "checked" : "assigned";
};

const getSeatPerson = (seat) => {
  if (!seat.attendee || seat.attendee.length === 0) return null;
  const person = seat.attendee[0];
  if (!person) return null;
  return participantsStore.participants.find((x) => x.id === person.id) || person;
};

// 從 store 取得當前活動座位（與編輯頁一致）
const currentActivityId = computed(() => {
  const eventId = eventsStore.currentEvent?.id;
  return eventId ? `event_${eventId}` : "act_01";
});
const currentSeats = computed(() => seatsStore.activitySeats[currentActivityId.value] || []);
const currentLayout = computed(() => seatsStore.layout);

// 座位統計
const seatStats = computed(() => {
  const seats = currentSeats.value;
  const empty = seats.filter((s) => getSeatStatus(s) === "empty").length;
  const assigned = seats.filter((s) => getSeatStatus(s) === "assigned").length;
  const checked = seats.filter((s) => getSeatStatus(s) === "checked").length;
  return { total: seats.length, empty, assigned, checked };
});

// 最近報到歷史（按 updatedAt 排序）
const recentCheckins = computed(() =>
  [...participantsStore.participants]
    .filter((p) => p.status === "已報到" && p.updatedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 30)
);

const formatTime = (isoStr: string) => {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const formatRelative = (isoStr: string) => {
  if (!isoStr) return "";
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  return `${Math.floor(diff / 3600)} 小時前`;
};
</script>

<template>
  <Teleport to="body">
    <div class="monitor-overlay">
      <!-- 頂部標題列 -->
      <header class="monitor-header">
        <div class="header-left">
          <div class="live-badge">
            <span class="pulse-dot"></span> LIVE
          </div>
          <div class="header-title">
            <h1>即時座位監控</h1>
            <span class="event-name">{{ eventsStore.currentEvent?.name || "未選擇活動" }}</span>
          </div>
        </div>
        <div class="header-center">
          <div class="clock">
            <span class="time">{{ timeStr }}</span>
            <span class="date">{{ dateStr }}</span>
          </div>
        </div>
        <div class="header-right">
          <button class="btn-refresh" :class="{ spinning: refreshing }" @click="doRefresh" title="刷新資料">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button class="btn-close" @click="emit('close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- 手機版分頁切換 -->
      <div class="mobile-tabs">
        <button :class="{ active: mobileTab === 'stats' }" @click="mobileTab = 'stats'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          統計
        </button>
        <button :class="{ active: mobileTab === 'seats' }" @click="mobileTab = 'seats'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z"/></svg>
          座位圖
        </button>
        <button :class="{ active: mobileTab === 'history' }" @click="mobileTab = 'history'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          報到紀錄
        </button>
      </div>

      <div class="monitor-body">
        <!-- 左側邊欄 -->
        <aside class="monitor-sidebar" :class="{ 'mobile-hidden': mobileTab !== 'stats' }">
          <!-- 報到統計 -->
          <div class="sidebar-section">
            <h3 class="section-label">報到統計</h3>
            <div class="stat-ring">
              <svg viewBox="0 0 80 80" width="80" height="80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
                <circle cx="40" cy="40" r="34" fill="none" stroke="#10b981" stroke-width="8"
                  stroke-dasharray="213.6"
                  :stroke-dashoffset="213.6 * (1 - checkInRate / 100)"
                  stroke-linecap="round" transform="rotate(-90 40 40)"
                  style="transition: stroke-dashoffset 0.8s ease"
                />
                <text x="40" y="44" text-anchor="middle" fill="white" font-size="16" font-weight="700">{{ checkInRate }}%</text>
              </svg>
              <div class="ring-labels">
                <div class="ring-label">
                  <span class="dot green"></span>已報到 {{ stats.checkedIn }}
                </div>
                <div class="ring-label">
                  <span class="dot gray"></span>未報到 {{ stats.pending }}
                </div>
                <div class="ring-label total">總計 {{ stats.total }} 人</div>
              </div>
            </div>
          </div>

          <!-- 身分分佈 -->
          <div class="sidebar-section">
            <h3 class="section-label">身分分佈</h3>
            <div class="stat-bar-item">
              <div class="bar-label"><span class="dot yellow"></span>VIP</div>
              <div class="bar-track">
                <div class="bar-fill yellow" :style="{ width: stats.total ? (stats.vip / stats.total * 100) + '%' : '0%' }"></div>
              </div>
              <span class="bar-count">{{ stats.vip }}</span>
            </div>
            <div class="stat-bar-item">
              <div class="bar-label"><span class="dot blue"></span>一般民眾</div>
              <div class="bar-track">
                <div class="bar-fill blue" :style="{ width: stats.total ? (stats.general / stats.total * 100) + '%' : '0%' }"></div>
              </div>
              <span class="bar-count">{{ stats.general }}</span>
            </div>
          </div>

          <!-- 座位統計 -->
          <div class="sidebar-section">
            <h3 class="section-label">座位狀況</h3>
            <div class="seat-stat-grid">
              <div class="seat-stat-card total">
                <span class="seat-stat-num">{{ seatStats.total }}</span>
                <span class="seat-stat-lbl">總座位</span>
              </div>
              <div class="seat-stat-card green">
                <span class="seat-stat-num">{{ seatStats.checked }}</span>
                <span class="seat-stat-lbl">已報到</span>
              </div>
              <div class="seat-stat-card blue">
                <span class="seat-stat-num">{{ seatStats.assigned }}</span>
                <span class="seat-stat-lbl">已分配</span>
              </div>
              <div class="seat-stat-card gray">
                <span class="seat-stat-num">{{ seatStats.empty }}</span>
                <span class="seat-stat-lbl">空位</span>
              </div>
            </div>
          </div>

          <!-- 圖例 -->
          <div class="sidebar-section">
            <h3 class="section-label">圖例說明</h3>
            <div class="legend-list">
              <div class="legend-item">
                <div class="legend-box green"></div>
                <span>已報到入座</span>
              </div>
              <div class="legend-item">
                <div class="legend-box blue"></div>
                <span>已分配未到</span>
              </div>
              <div class="legend-item">
                <div class="legend-box empty"></div>
                <span>空位</span>
              </div>
            </div>
          </div>
        </aside>

        <!-- 中央座位圖 -->
        <main class="monitor-main" :class="{ 'mobile-hidden': mobileTab !== 'seats' }">
          <div class="stage-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            舞台 / 講台
          </div>

          <div v-if="currentSeats.length === 0" class="no-seats">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z"/></svg>
            <p>尚未設置座位配置</p>
            <span>請先在座位管理頁面設置座位</span>
          </div>

          <div v-else class="seat-grid" :style="{ '--cols': currentLayout.cols }">
            <div
              v-for="seat in currentSeats"
              :key="seat.id"
              class="seat-cell"
              :class="getSeatStatus(seat)"
            >
              <div class="seat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z"/>
                </svg>
              </div>
              <div class="seat-label">{{ seat.label }}</div>
              <div v-if="getSeatPerson(seat)" class="seat-person">
                {{ getSeatPerson(seat)?.name || "—" }}
              </div>
              <div v-if="getSeatStatus(seat) === 'checked'" class="seat-check">✓</div>
            </div>
          </div>
        </main>

        <!-- 右側歷史 -->
        <aside class="monitor-history" :class="{ 'mobile-hidden': mobileTab !== 'history' }">
          <div class="history-header">
            <h3>最近報到</h3>
            <span class="history-count">{{ recentCheckins.length }} 筆</span>
          </div>
          <div class="history-list">
            <div v-if="recentCheckins.length === 0" class="history-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <p>尚無報到紀錄</p>
            </div>
            <div
              v-for="(p, idx) in recentCheckins"
              :key="p.id"
              class="history-item"
              :class="{ fresh: idx === 0 }"
            >
              <div class="history-avatar" :class="p.type === 'VIP' ? 'vip' : 'general'">
                {{ p.name?.charAt(0) || "?" }}
              </div>
              <div class="history-info">
                <div class="history-name">{{ p.name }}</div>
                <div class="history-meta">
                  <span class="history-company">{{ p.company || "—" }}</span>
                  <span class="history-type" :class="p.type === 'VIP' ? 'vip' : 'general'">{{ p.type }}</span>
                </div>
                <div class="history-time">
                  <span class="time-abs">{{ formatTime(p.updatedAt) }}</span>
                  <span class="time-rel">{{ formatRelative(p.updatedAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.monitor-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: #0a0f1e;
  display: flex;
  flex-direction: column;
  color: white;
  font-family: inherit;
}

/* ===== Header ===== */
.monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 64px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.live-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 0.75rem;
  font-weight: 800;
  color: #10b981;
  letter-spacing: 1px;
  flex-shrink: 0;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse-anim 1.5s ease-in-out infinite;
}

@keyframes pulse-anim {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

.header-title {
  h1 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    color: white;
  }
  .event-name {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.5);
  }
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.clock {
  text-align: center;
  .time {
    display: block;
    font-size: 1.5rem;
    font-weight: 300;
    letter-spacing: 2px;
    color: white;
    font-variant-numeric: tabular-nums;
  }
  .date {
    display: block;
    font-size: 0.75rem;
    color: rgba(255,255,255,0.45);
    margin-top: 2px;
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  justify-content: flex-end;
}

.btn-refresh {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  &:hover { background: rgba(255,255,255,0.12); color: white; }
  &.spinning svg { animation: spin 0.8s linear infinite; }
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn-close {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #f87171;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  &:hover { background: rgba(239, 68, 68, 0.25); color: #fca5a5; }
}

/* ===== Body ===== */
.monitor-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ===== Sidebar ===== */
.monitor-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.03);
  border-right: 1px solid rgba(255,255,255,0.06);
  overflow-y: auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
  margin: 0;
}

/* 圓環 */
.stat-ring {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ring-labels {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ring-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.7);
  &.total {
    font-weight: 700;
    color: white;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  &.green { background: #10b981; }
  &.gray { background: rgba(255,255,255,0.25); }
  &.yellow { background: #f59e0b; }
  &.blue { background: #38bdf8; }
}

/* 條形統計 */
.stat-bar-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: rgba(255,255,255,0.6);
  width: 56px;
  flex-shrink: 0;
}

.bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.8s ease;
  &.yellow { background: #f59e0b; }
  &.blue { background: #38bdf8; }
}

.bar-count {
  font-size: 0.78rem;
  font-weight: 700;
  color: white;
  width: 20px;
  text-align: right;
  flex-shrink: 0;
}

/* 座位統計格 */
.seat-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.seat-stat-card {
  background: rgba(255,255,255,0.05);
  border-radius: 10px;
  padding: 10px 8px;
  text-align: center;
  border: 1px solid rgba(255,255,255,0.06);
  &.green { border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.08); }
  &.blue { border-color: rgba(56, 189, 248, 0.3); background: rgba(56, 189, 248, 0.08); }
  &.gray { border-color: rgba(255,255,255,0.1); }
  &.total { border-color: rgba(102, 126, 234, 0.3); background: rgba(102, 126, 234, 0.08); }
}

.seat-stat-num {
  display: block;
  font-size: 1.4rem;
  font-weight: 800;
  color: white;
  line-height: 1;
}

.seat-stat-lbl {
  display: block;
  font-size: 0.65rem;
  color: rgba(255,255,255,0.45);
  margin-top: 4px;
}

/* 圖例 */
.legend-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.6);
}

.legend-box {
  width: 20px;
  height: 14px;
  border-radius: 4px;
  flex-shrink: 0;
  &.green { background: rgba(16, 185, 129, 0.5); border: 1px solid #10b981; }
  &.blue { background: rgba(56, 189, 248, 0.3); border: 1px solid rgba(56, 189, 248, 0.6); }
  &.empty { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); }
}

/* ===== Main (Seat Grid) ===== */
.monitor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 24px;
  gap: 20px;
}

.stage-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.04);
  border: 1px dashed rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 8px 32px;
  letter-spacing: 4px;
  text-transform: uppercase;
  align-self: stretch;
  justify-content: center;
}

.no-seats {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: rgba(255,255,255,0.3);
  svg { opacity: 0.4; }
  p { font-size: 1rem; font-weight: 600; margin: 0; }
  span { font-size: 0.85rem; }
}

.seat-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols, 5), 1fr);
  gap: 10px;
  width: 100%;
  max-width: 800px;
}

.seat-cell {
  position: relative;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 10px 8px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.3s;
  cursor: default;
  min-width: 0;

  &.checked {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.5);
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.2);
    .seat-icon { color: #10b981; }
    .seat-label { color: rgba(255,255,255,0.7); }
  }

  &.assigned {
    background: rgba(56, 189, 248, 0.08);
    border-color: rgba(56, 189, 248, 0.35);
    .seat-icon { color: #38bdf8; }
    .seat-label { color: rgba(255,255,255,0.6); }
  }

  &.empty {
    .seat-icon { color: rgba(255,255,255,0.15); }
    .seat-label { color: rgba(255,255,255,0.25); }
  }
}

.seat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.2);
}

.seat-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: rgba(255,255,255,0.3);
  text-align: center;
}

.seat-person {
  font-size: 0.62rem;
  color: rgba(255,255,255,0.55);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  max-width: 72px;
}

.seat-check {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 0.65rem;
  font-weight: 800;
  color: #10b981;
}

/* ===== History ===== */
.monitor-history {
  width: 240px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.03);
  border-left: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;

  h3 {
    font-size: 0.8rem;
    font-weight: 700;
    color: rgba(255,255,255,0.7);
    margin: 0;
    letter-spacing: 0.5px;
  }

  .history-count {
    font-size: 0.7rem;
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;

  &::-webkit-scrollbar {
    width: 3px;
  }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  color: rgba(255,255,255,0.2);
  p { font-size: 0.8rem; margin: 0; }
}

.history-item {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.2s;

  &:hover { background: rgba(255,255,255,0.03); }

  &.fresh {
    background: rgba(16, 185, 129, 0.07);
    border-bottom-color: rgba(16, 185, 129, 0.1);
    .history-name { color: #a7f3d0; }
  }
}

.history-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  flex-shrink: 0;
  &.vip { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
  &.general { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.25); }
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: white;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.history-company {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.history-type {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  &.vip { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
  &.general { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
}

.history-time {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.time-abs {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.3);
  font-variant-numeric: tabular-nums;
}

.time-rel {
  font-size: 0.65rem;
  color: rgba(255,255,255,0.2);
}

/* ===== 手機版 RWD ===== */
.mobile-tabs {
  display: none;
}

@media (max-width: 768px) {
  .monitor-header {
    padding: 0 12px;
    height: 52px;
    gap: 8px;

    .header-center {
      display: none;
    }

    .header-title h1 {
      font-size: 0.85rem;
    }

    .header-title .event-name {
      display: none;
    }
  }

  .live-badge {
    padding: 3px 8px;
    font-size: 0.7rem;
  }

  .mobile-tabs {
    display: flex;
    background: rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;

    button {
      flex: 1;
      padding: 10px 8px;
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.45);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.2s;
      border-bottom: 2px solid transparent;

      &.active {
        color: #38bdf8;
        border-bottom-color: #38bdf8;
        background: rgba(56, 189, 248, 0.06);
      }
    }
  }

  .monitor-body {
    flex-direction: column;
    overflow: auto;
  }

  .mobile-hidden {
    display: none !important;
  }

  .monitor-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    padding: 16px;
    overflow-y: auto;
    flex-direction: column;
    gap: 16px;
  }

  .stat-ring {
    justify-content: center;
  }

  .seat-stat-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .seat-stat-num {
    font-size: 1.1rem;
  }

  .monitor-main {
    padding: 12px;
    gap: 12px;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }

  .seat-grid {
    gap: 6px;
    max-width: 100%;
  }

  .seat-cell {
    padding: 6px 4px 5px;
    border-radius: 7px;

    .seat-icon svg {
      width: 14px;
      height: 14px;
    }

    .seat-label {
      font-size: 0.55rem;
    }

    .seat-person {
      font-size: 0.5rem;
      max-width: 52px;
    }
  }

  .monitor-history {
    width: 100%;
    border-left: none;
    border-top: 1px solid rgba(255,255,255,0.06);
    max-height: unset;
    flex: 1;
    min-height: 0;
  }
}
</style>
