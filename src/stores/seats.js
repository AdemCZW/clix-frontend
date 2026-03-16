import { defineStore } from "pinia";
import { reactive, watch, onUnmounted } from "vue";

const LS_LAYOUT = "seatMgr_layout";
const LS_SEATS = "seatMgr_seats";

const loadLayout = () => {
  try { return JSON.parse(localStorage.getItem(LS_LAYOUT)); } catch { return null; }
};
const loadSeats = () => {
  try { return JSON.parse(localStorage.getItem(LS_SEATS)); } catch { return null; }
};

// 深層合併，保留 reactive 物件的代理
const applySeats = (target, source) => {
  for (const key of Object.keys(source)) {
    target[key] = source[key];
  }
  // 移除已不存在的 key
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
};

export const useSeatsStore = defineStore("seats", () => {
  const layout = reactive(loadLayout() || { rows: 3, cols: 5 });

  const activitySeats = reactive(loadSeats() || {
    act_01: Array.from({ length: 15 }, (_, i) => ({
      id: `s-${i}`,
      label: `座-${i + 1}`,
      attendee: [],
    })),
  });

  // 寫入 localStorage（只在本分頁修改時）
  watch(layout, (val) => localStorage.setItem(LS_LAYOUT, JSON.stringify(val)), { deep: true });
  watch(activitySeats, (val) => localStorage.setItem(LS_SEATS, JSON.stringify(val)), { deep: true });

  // 跨分頁同步：監聽其他分頁寫入 localStorage 的 storage 事件
  const onStorage = (e) => {
    if (e.key === LS_SEATS && e.newValue) {
      try {
        const incoming = JSON.parse(e.newValue);
        applySeats(activitySeats, incoming);
      } catch { /* 忽略解析錯誤 */ }
    }
    if (e.key === LS_LAYOUT && e.newValue) {
      try {
        const incoming = JSON.parse(e.newValue);
        Object.assign(layout, incoming);
      } catch { /* 忽略解析錯誤 */ }
    }
  };
  window.addEventListener("storage", onStorage);

  const ensureActivity = (actId) => {
    if (!activitySeats[actId]) {
      activitySeats[actId] = Array.from({ length: layout.rows * layout.cols }, (_, i) => ({
        id: `s-${Date.now()}-${i}`,
        label: `座-${i + 1}`,
        attendee: [],
      }));
    }
  };

  const addRow = (actId) => {
    layout.rows++;
    const seats = activitySeats[actId];
    const newCount = layout.rows * layout.cols;
    while (seats.length < newCount) {
      const i = seats.length;
      seats.push({ id: `s-${Date.now()}-${i}`, label: `座-${i + 1}`, attendee: [] });
    }
  };

  const addCol = (actId) => {
    layout.cols++;
    const seats = activitySeats[actId];
    const newCount = layout.rows * layout.cols;
    while (seats.length < newCount) {
      const i = seats.length;
      seats.push({ id: `s-${Date.now()}-${i}`, label: `座-${i + 1}`, attendee: [] });
    }
  };

  return { layout, activitySeats, ensureActivity, addRow, addCol };
});
