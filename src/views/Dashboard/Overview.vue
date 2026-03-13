<template>
  <div class="dashboard-view">
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">活動總數</div>
        <div class="stat-value">{{ eventStats.total }}</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-label">進行中</div>
        <div class="stat-value">{{ eventStats.active }}</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-label">總參與人數</div>
        <div class="stat-value">{{ eventStats.participants }}</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-label">已報到</div>
        <div class="stat-value">{{ eventStats.checkedIn }}</div>
      </div>
    </div>

    <!-- 報到趨勢圖 -->
    <div class="chart-card">
      <div class="chart-header">
        <div>
          <h2 class="chart-title">報到趨勢</h2>
          <p class="chart-subtitle">每日報到人數統計</p>
        </div>
        <div class="range-tabs">
          <button
            v-for="r in ranges"
            :key="r.value"
            class="range-tab"
            :class="{ active: selectedRange === r.value }"
            @click="selectedRange = r.value"
          >{{ r.label }}</button>
        </div>
      </div>

      <div class="chart-area" ref="chartWrap">
        <svg
          v-if="chartPoints.length"
          :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
          preserveAspectRatio="none"
          class="chart-svg"
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#667eea" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#667eea" stop-opacity="0.02" />
            </linearGradient>
          </defs>

          <!-- 水平格線 -->
          <g class="grid-lines">
            <line
              v-for="(y, i) in yGridLines"
              :key="i"
              :x1="PADDING_L"
              :y1="y"
              :x2="SVG_W - PADDING_R"
              :y2="y"
              stroke="#f1f5f9"
              stroke-width="1"
            />
          </g>

          <!-- Y 軸標籤 -->
          <g>
            <text
              v-for="(item, i) in yLabels"
              :key="i"
              :x="PADDING_L - 8"
              :y="item.y + 4"
              text-anchor="end"
              font-size="11"
              fill="#94a3b8"
            >{{ item.label }}</text>
          </g>

          <!-- X 軸標籤 -->
          <g>
            <text
              v-for="(item, i) in xLabels"
              :key="i"
              :x="item.x"
              :y="SVG_H - PADDING_B + 16"
              text-anchor="middle"
              font-size="11"
              fill="#94a3b8"
            >{{ item.label }}</text>
          </g>

          <!-- 面積填充 -->
          <path
            :d="areaPath"
            fill="url(#areaGrad)"
          />

          <!-- 折線 -->
          <path
            :d="linePath"
            fill="none"
            stroke="url(#lineGrad)"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#667eea" />
              <stop offset="100%" stop-color="#764ba2" />
            </linearGradient>
          </defs>

          <!-- 資料點 -->
          <g v-for="(pt, i) in chartPoints" :key="i">
            <circle
              :cx="pt.x"
              :cy="pt.y"
              r="4"
              fill="white"
              stroke="#667eea"
              stroke-width="2"
              class="data-dot"
              @mouseenter="showTooltip(pt, i, $event)"
              @mouseleave="hideTooltip"
            />
          </g>
        </svg>

        <!-- Tooltip -->
        <div
          v-if="tooltip.visible"
          class="chart-tooltip"
          :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
          <div class="tt-date">{{ tooltip.date }}</div>
          <div class="tt-value">{{ tooltip.value }} 人</div>
        </div>
      </div>

      <!-- 圖表底部摘要 -->
      <div class="chart-summary">
        <div class="summary-item">
          <span class="s-label">期間總報到</span>
          <span class="s-value">{{ periodTotal }} 人</span>
        </div>
        <div class="summary-item">
          <span class="s-label">日均報到</span>
          <span class="s-value">{{ dailyAvg }} 人</span>
        </div>
        <div class="summary-item">
          <span class="s-label">最高單日</span>
          <span class="s-value">{{ peakDay }} 人</span>
        </div>
      </div>
    </div>

    <div class="recent-events-section">
      <h2 class="section-title">最近活動</h2>
      <div class="events-list">
        <div
          v-for="event in recentEvents"
          :key="event.id"
          class="event-item"
          @click="selectEvent(event)"
        >
          <div class="event-date">
            <div class="month">{{ event.month }}</div>
            <div class="day">{{ event.day }}</div>
          </div>
          <div class="event-info">
            <h3 class="event-name">{{ event.name }}</h3>
            <p class="event-meta">{{ event.location }} · {{ event.participants }} 人</p>
          </div>
          <div class="event-status" :class="event.status">
            {{ event.statusText }}
          </div>
        </div>
        <div v-if="recentEvents.length === 0 && !eventsStore.isLoading" class="no-events">
          目前沒有活動，請先建立活動
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useParticipantsStore } from "@/stores/participants";
import { useEventsStore } from "@/stores/events";
import { useUserStore } from "@/stores/user";
import { useCheckinStats } from "@/composables/useCheckinStats";

const router = useRouter();
const participantsStore = useParticipantsStore();
const eventsStore = useEventsStore();
const userStore = useUserStore();
const { stats: checkinStats, dailyTrend, trendSummary } = useCheckinStats();

const eventStats = computed(() => ({
  total: eventsStore.events.length,
  active: eventsStore.events.filter((e) => e.status === "active").length,
  participants: checkinStats.value.total,
  checkedIn: checkinStats.value.checkedIn,
}));

const recentEvents = computed(() => {
  return [...eventsStore.events]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 5)
    .map((e) => {
      const d = e.date ? new Date(e.date) : null;
      return {
        id: e.id,
        name: e.name,
        month: d ? `${d.getMonth() + 1}月` : "--",
        day: d ? d.getDate() : "--",
        location: e.location || "未設定地點",
        participants: e.participantsCount || 0,
        status: e.status || "upcoming",
        statusText: e.statusText || "即將開始",
      };
    });
});

// ── 圖表設定 ───────────────────────────────────────────────
const SVG_W = 800;
const SVG_H = 220;
const PADDING_L = 44;
const PADDING_R = 16;
const PADDING_T = 16;
const PADDING_B = 28;

const ranges = [
  { label: "7天", value: 7 },
  { label: "30天", value: 30 },
  { label: "90天", value: 90 },
];
const selectedRange = ref(7);

const chartData = dailyTrend(selectedRange);
const summary = trendSummary(chartData, selectedRange);
const periodTotal = computed(() => summary.value.periodTotal);
const dailyAvg = computed(() => summary.value.dailyAvg);
const peakDay = computed(() => summary.value.peakDay);

// ── SVG 計算 ──────────────────────────────────────────────
const maxVal = computed(() => Math.max(...chartData.value.map((p) => p.value), 1));

const toX = (i) => {
  const n = chartData.value.length - 1 || 1;
  return PADDING_L + (i / n) * (SVG_W - PADDING_L - PADDING_R);
};
const toY = (v) => PADDING_T + (1 - v / maxVal.value) * (SVG_H - PADDING_T - PADDING_B);

const chartPoints = computed(() =>
  chartData.value.map((p, i) => ({ x: toX(i), y: toY(p.value), ...p })),
);

// 貝塞爾曲線
const smooth = (pts) => {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const cp1x = prev.x + (cur.x - prev.x) * 0.4;
    const cp1y = prev.y;
    const cp2x = cur.x - (cur.x - prev.x) * 0.4;
    const cp2y = cur.y;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${cur.x} ${cur.y}`;
  }
  return d;
};

const linePath = computed(() => smooth(chartPoints.value));
const areaPath = computed(() => {
  const pts = chartPoints.value;
  if (!pts.length) return "";
  const bottom = SVG_H - PADDING_B;
  return `${smooth(pts)} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`;
});

// 格線
const yGridLines = computed(() => {
  return [0, 0.25, 0.5, 0.75, 1].map((r) => toY(maxVal.value * r));
});
const yLabels = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: toY(maxVal.value * r),
    label: Math.round(maxVal.value * r),
  })),
);

// X 軸標籤（抽樣顯示）
const xLabels = computed(() => {
  const pts = chartPoints.value;
  const step = selectedRange.value <= 7 ? 1 : selectedRange.value <= 30 ? 5 : 15;
  return pts
    .filter((_, i) => i % step === 0 || i === pts.length - 1)
    .map((pt) => ({
      x: pt.x,
      label: `${pt.date.getMonth() + 1}/${pt.date.getDate()}`,
    }));
});

// Tooltip
const tooltip = ref({ visible: false, x: 0, y: 0, date: "", value: 0 });
const chartWrap = ref(null);

const showTooltip = (pt, _i, evt) => {
  const rect = chartWrap.value?.getBoundingClientRect();
  if (!rect) return;
  const svgEl = chartWrap.value.querySelector("svg");
  const svgRect = svgEl.getBoundingClientRect();
  const scaleX = svgRect.width / SVG_W;
  const scaleY = svgRect.height / SVG_H;
  tooltip.value = {
    visible: true,
    x: pt.x * scaleX - 40,
    y: pt.y * scaleY - 52,
    date: `${pt.date.getMonth() + 1}/${pt.date.getDate()}`,
    value: pt.value,
  };
};
const hideTooltip = () => { tooltip.value.visible = false; };

// ── 資料載入 ──────────────────────────────────────────────
onMounted(async () => {
  const user = userStore.user;
  await Promise.all([
    eventsStore.fetchEvents({
      userId: user?.id,
      isSuperAdmin: userStore.isSuperAdmin,
    }),
    participantsStore.fetchParticipants({}),
  ]);
});

const selectEvent = (displayEvent) => {
  const storeEvent = eventsStore.events.find((e) => e.id === displayEvent.id);
  if (storeEvent) {
    eventsStore.setCurrentEvent(storeEvent, userStore.user?.id);
  }
  router.push("/admin/checkin-history");
};
</script>

<style lang="scss" scoped>
.dashboard-view {
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
}

// Stats Bar
.stats-bar {
  background: white;
  border-radius: 16px;
  padding: 28px 32px;
  border: 1px solid #e5e7eb;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;

  .stat-label {
    font-size: 0.85rem;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 2.25rem;
    font-weight: 800;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1;
  }
}

.stat-divider {
  width: 1px;
  height: 50px;
  background: linear-gradient(to bottom, transparent, #e5e7eb 20%, #e5e7eb 80%, transparent);
}

// Chart Card
.chart-card {
  background: white;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  padding: 28px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;

  .chart-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px 0;
  }

  .chart-subtitle {
    font-size: 0.85rem;
    color: #64748b;
    margin: 0;
  }
}

.range-tabs {
  display: flex;
  gap: 6px;
  background: #f8fafc;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}

.range-tab {
  padding: 6px 14px;
  border: none;
  border-radius: 7px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;

  &.active {
    background: white;
    color: #667eea;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }

  &:hover:not(.active) {
    color: #334155;
  }
}

.chart-area {
  position: relative;
  height: 220px;
}

.chart-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.data-dot {
  cursor: pointer;
  transition: r 0.15s;

  &:hover {
    r: 6;
  }
}

.chart-tooltip {
  position: absolute;
  background: #0f172a;
  color: white;
  border-radius: 8px;
  padding: 8px 12px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 10;

  .tt-date {
    font-size: 0.75rem;
    color: #94a3b8;
    margin-bottom: 2px;
  }

  .tt-value {
    font-size: 0.95rem;
    font-weight: 700;
  }

  &::after {
    content: "";
    position: absolute;
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-bottom: none;
    border-top-color: #0f172a;
  }
}

.chart-summary {
  display: flex;
  gap: 24px;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
  margin-top: 16px;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;

  .s-label {
    font-size: 0.85rem;
    color: #64748b;
    font-weight: 500;
  }

  .s-value {
    font-size: 0.95rem;
    font-weight: 700;
    color: #0f172a;
  }
}

// Recent Events
.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 20px 0;
}

.recent-events-section {
  background: white;
  border-radius: 16px;
  padding: 28px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    border-color: #3b82f6;
    background: #f8fafc;
    transform: translateX(4px);
  }

  .event-date {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;

    .month { font-size: 0.75rem; font-weight: 600; opacity: 0.9; }
    .day { font-size: 1.5rem; font-weight: 800; line-height: 1; }
  }

  .event-info {
    flex: 1;

    .event-name {
      font-size: 1rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 4px 0;
    }

    .event-meta {
      font-size: 0.85rem;
      color: #475569;
      margin: 0;
    }
  }

  .event-status {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    flex-shrink: 0;

    &.active { background: #d1fae5; color: #065f46; }
    &.upcoming { background: #dbeafe; color: #1e40af; }
    &.completed { background: #f3f4f6; color: #374151; }
  }
}

.no-events {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
  font-size: 0.95rem;
}

/* ====== RWD ====== */
@media (max-width: 768px) {
  .dashboard-view {
    padding: 16px;
  }

  .stats-bar {
    flex-wrap: wrap;
    padding: 20px;
    gap: 16px;
  }

  .stat-divider {
    display: none;
  }

  .stat-item {
    flex: 1 1 40%;
    min-width: 0;

    .stat-value {
      font-size: 1.6rem;
    }
  }

  .chart-card {
    padding: 16px;
  }

  .chart-header {
    flex-direction: column;
    gap: 12px;
  }

  .chart-summary {
    flex-direction: column;
    gap: 12px;
  }

  .recent-events-section {
    padding: 16px;
  }

  .event-item {
    .event-date {
      width: 48px;
      height: 48px;

      .day { font-size: 1.2rem; }
      .month { font-size: 0.7rem; }
    }

    .event-status {
      display: none;
    }
  }
}

@media (max-width: 480px) {
  .stat-item {
    flex: 1 1 100%;
  }
}
</style>
