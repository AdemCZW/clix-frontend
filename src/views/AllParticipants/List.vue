<template>
  <div class="all-participants-view">
    <!-- 篩選工具列 -->
    <div class="filter-bar">
      <div class="search-box">
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="搜尋姓名、Email、公司..."
          class="search-input"
        />
      </div>
      <div class="filter-controls">
        <select v-model="selectedManager" class="filter-select">
          <option value="">所有管理者</option>
          <option v-for="mgr in adminAccounts" :key="mgr.id" :value="mgr.id">
            {{ mgr.email }}
          </option>
        </select>
        <select v-model="selectedEvent" class="filter-select">
          <option value="">所有活動</option>
          <option v-for="event in filteredEvents" :key="event.id" :value="event.id">
            {{ event.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- 按管理者分組顯示 -->
    <div class="manager-groups">
      <div v-for="manager in groupedData" :key="manager.id" class="manager-section">
        <div class="manager-header">
          <div class="manager-info">
            <h2 class="manager-email">{{ manager.email }}</h2>
          </div>
          <span class="manager-stats">
            {{ manager.totalParticipants }} 人 · {{ manager.events.length }} 個活動
          </span>
        </div>

        <!-- 該管理者的活動列表 -->
        <div class="events-list">
          <!-- 如果沒有活動，顯示提示 -->
          <div v-if="manager.events.length === 0" class="no-events-hint">
            <p>該管理者目前沒有活動</p>
          </div>

          <!-- 活動列表 -->
          <div v-for="event in manager.events" :key="event.id" class="event-block">
            <div class="event-header" @click="toggleEvent(event.id)">
              <div class="event-info">
                <h3 class="event-name">{{ event.name }}</h3>
                <span class="event-meta">
                  {{ event.date }} · {{ event.participants.length }} 人報名
                </span>
              </div>
              <div class="event-actions">
                <button class="btn-export" @click.stop="exportEventData(event)">匯出 Excel</button>
                <span class="toggle-icon" :class="{ expanded: expandedEvents.includes(event.id) }">
                  ▼
                </span>
              </div>
            </div>

            <!-- 參與者列表（可折疊） -->
            <Transition name="expand">
              <div v-if="expandedEvents.includes(event.id)" class="participants-table">
                <table>
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>公司</th>
                      <th>職稱</th>
                      <th>Email</th>
                      <th>電話</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="participant in filteredParticipants(event.participants)"
                      :key="participant.id"
                    >
                      <td class="name-cell">{{ participant.name }}</td>
                      <td>{{ participant.company }}</td>
                      <td>{{ participant.title }}</td>
                      <td class="email-cell">{{ participant.email }}</td>
                      <td>{{ participant.phone }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>

    <!-- 無資料提示 -->
    <div v-if="groupedData.length === 0" class="empty-state">
      <div class="empty-icon">📋</div>
      <h3>暫無報名資料</h3>
      <p>目前沒有符合條件的參與者資料</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
const loadXLSX = () => import("xlsx");
import { useAdminAccountsStore } from "@/stores/adminAccounts";
import { useParticipantsStore } from "@/stores/participants";
import { storeToRefs } from "pinia";
import type { Participant } from "@/types";

interface LocalEvent {
  id: number;
  name: string;
  date: string;
  managerId: number;
  participants: (Participant & { checkedIn: boolean; registeredAt: string })[];
}

interface ManagerGroup {
  id: number;
  email: string;
  events: LocalEvent[];
  totalParticipants: number;
}

const adminStore = useAdminAccountsStore();
const participantsStore = useParticipantsStore();
const { adminAccounts } = storeToRefs(adminStore);

import { useDebouncedRef } from "@/composables/useDebounce";

const searchKeyword = ref("");
const debouncedKeyword = useDebouncedRef(searchKeyword, 300);
const selectedManager = ref<number | "">("");
const selectedEvent = ref<number | "">("");
const expandedEvents = ref<number[]>([]);

// 活動資料（從全部參與者資料重建）
const events = ref<LocalEvent[]>([]);

onMounted(async () => {
  // 確保管理者列表已載入
  if (!adminAccounts.value.length) {
    await adminStore.fetchManagers();
  }

  // 拉取全部參與者（不限活動），並重建成以活動為單位的資料結構
  const all = await participantsStore.fetchParticipants({});
  const eventMap: Record<number, LocalEvent> = {};
  all.forEach((p: Participant) => {
    if (!p.eventId) return;
    if (!eventMap[p.eventId]) {
      eventMap[p.eventId] = {
        id: p.eventId,
        name: p.eventName || `活動 #${p.eventId}`,
        date: "",
        managerId: p.managerId,
        participants: [],
      };
    }
    eventMap[p.eventId].participants.push({
      ...p,
      checkedIn: p.status === "已報到",
      registeredAt: p.createdAt,
    });
  });
  events.value = Object.values(eventMap);
});

// 根據選擇的管理者篩選活動
const filteredEvents = computed(() => {
  if (!selectedManager.value) return events.value;
  return events.value.filter((e) => e.managerId === selectedManager.value);
});

// 按管理者分組資料
const groupedData = computed(() => {
  let filteredEventsList = events.value;

  // 篩選管理者
  if (selectedManager.value) {
    filteredEventsList = filteredEventsList.filter((e) => e.managerId === selectedManager.value);
  }

  // 篩選特定活動
  if (selectedEvent.value) {
    filteredEventsList = filteredEventsList.filter((e) => e.id === selectedEvent.value);
  }

  // 初始化所有管理者的分組（即使沒有活動也顯示）
  const grouped: Record<number, ManagerGroup> = {};
  adminAccounts.value.forEach((manager) => {
    grouped[manager.id] = {
      id: manager.id,
      email: manager.email,
      events: [],
      totalParticipants: 0,
    };
  });

  // 將活動分配到對應的管理者
  filteredEventsList.forEach((event) => {
    if (grouped[event.managerId]) {
      grouped[event.managerId].events.push(event);
      grouped[event.managerId].totalParticipants += event.participants.length;
    }
  });

  // 返回所有管理者（包括沒有活動的）
  let result: ManagerGroup[] = Object.values(grouped);

  // 如果有選擇特定管理者，只顯示該管理者
  if (selectedManager.value) {
    result = result.filter((group: ManagerGroup) => group.id === selectedManager.value);
  }

  return result;
});

// 篩選參與者（搜尋關鍵字）
const filteredParticipants = (participants: LocalEvent['participants']) => {
  if (!debouncedKeyword.value) return participants;
  const keyword = debouncedKeyword.value.toLowerCase();
  return participants.filter(
    (p) =>
      p.name.toLowerCase().includes(keyword) ||
      p.email.toLowerCase().includes(keyword) ||
      p.company.toLowerCase().includes(keyword) ||
      p.title.toLowerCase().includes(keyword),
  );
};

// 切換活動展開/收合
const toggleEvent = (eventId: number) => {
  const index = expandedEvents.value.indexOf(eventId);
  if (index > -1) {
    expandedEvents.value.splice(index, 1);
  } else {
    expandedEvents.value.push(eventId);
  }
};

// 格式化日期
const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// 匯出 Excel
const exportEventData = async (event: LocalEvent) => {
  const data = event.participants.map((p) => ({
    姓名: p.name,
    公司: p.company,
    職稱: p.title,
    Email: p.email,
    電話: p.phone,
    報到狀態: p.checkedIn ? "已報到" : "未報到",
    報名時間: formatDate(p.registeredAt),
  }));

  const XLSX = await loadXLSX();
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "參與者名單");
  XLSX.writeFile(wb, `${event.name}_參與者名單.xlsx`);
};
</script>

<style scoped lang="scss">
.all-participants-view {
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
}

// 篩選工具列
.filter-bar {
  background: white;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #e5e7eb;
  display: flex;
  gap: 16px;
  align-items: center;
}

.search-box {
  flex: 1;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: all 0.3s;

  &:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
}

.filter-controls {
  display: flex;
  gap: 12px;
}

.filter-select {
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.95rem;
  background: white;
  cursor: pointer;
  min-width: 180px;

  &:focus {
    outline: none;
    border-color: #6366f1;
  }
}

// 按管理者分組
.manager-groups {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.manager-section {
  background: white;
  border-radius: 16px;
  padding: 28px;
  border: 1px solid #e5e7eb;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #f3f4f6;
}

.manager-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.manager-email {
  font-size: 1.25rem;
  color: #0f172a;
  font-weight: 700;
  margin: 0;
}

.manager-stats {
  font-size: 0.95rem;
  color: #64748b;
  font-weight: 600;
}

// 活動區塊
.event-block {
  background: #f8fafc;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
  width: 100%;
  box-sizing: border-box;
}

// 無活動提示
.no-events-hint {
  background: #f8fafc;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.95rem;
  border: 1px dashed #cbd5e1;

  p {
    margin: 0;
  }
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;

  &:hover {
    .event-name {
      color: #6366f1;
    }
  }
}

.event-info {
  flex: 1;
}

.event-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px 0;
  transition: color 0.3s;
}

.event-meta {
  font-size: 0.9rem;
  color: #64748b;
}

.event-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-export {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }
}

.toggle-icon {
  font-size: 0.8rem;
  color: #64748b;
  transition: transform 0.3s;

  &.expanded {
    transform: rotate(180deg);
  }
}

// 參與者表格
.participants-table {
  margin-top: 16px;
  overflow-x: auto;
  width: 100%;
}

table {
  width: 100%;
  min-width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

thead {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);

  th {
    padding: 10px 12px;
    text-align: left;
    font-size: 0.8rem;
    font-weight: 700;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

tbody {
  tr {
    border-bottom: 1px solid #f3f4f6;
    transition: background 0.2s;

    &:hover {
      background: #f8fafc;
    }

    &.checked-in {
      background: rgba(16, 185, 129, 0.05);
    }
  }

  td {
    padding: 10px 12px;
    font-size: 0.85rem;
    color: #475569;
    word-wrap: break-word;
    overflow-wrap: break-word;
    line-height: 1.4;
  }

  .name-cell {
    font-weight: 600;
    color: #0f172a;
  }

  .email-cell {
    color: #6366f1;
  }
}

// 空狀態
.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: #94a3b8;

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 16px;
  }

  h3 {
    font-size: 1.2rem;
    color: #475569;
    margin: 0 0 8px 0;
  }

  p {
    font-size: 0.95rem;
    margin: 0;
  }
}

// 展開動畫
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 2000px;
}

/* ====== RWD ====== */
@media (max-width: 768px) {
  .all-participants-view {
    padding: 16px;
  }

  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .filter-controls {
    flex-direction: column;
    gap: 8px;
  }

  .filter-select {
    min-width: 0;
    width: 100%;
  }

  .manager-groups {
    grid-template-columns: 1fr;
  }

  .manager-section {
    padding: 16px;
  }

  .manager-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .event-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .event-actions {
    width: 100%;
    justify-content: space-between;
  }

  table {
    table-layout: auto;
    min-width: 500px;
  }
}
</style>
