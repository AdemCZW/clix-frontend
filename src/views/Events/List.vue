<template>
  <div class="events-view">
    <div class="filter-bar">
      <div class="search-box">
        <input type="text" placeholder="搜尋活動名稱" v-model="searchQuery" />
      </div>
      <div class="filter-tabs">
        <button
          v-for="tab in filterTabs"
          :key="tab.value"
          class="filter-tab"
          :class="{ active: activeFilter === tab.value }"
          @click="activeFilter = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
      <button v-if="userStore.isSuperAdmin" class="btn-create" @click="showCreateModal = true">
        <span class="icon">➕</span>
        建立新活動
      </button>
    </div>

    <!-- Loading 骨架屏 -->
    <div v-if="loadingEvents" class="events-grid">
      <div v-for="n in 4" :key="n" class="event-card skeleton-card">
        <div class="skeleton-banner"></div>
        <div class="skeleton-body">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-line w40"></div>
          <div class="skeleton-line w80"></div>
        </div>
      </div>
    </div>

    <!-- 載入失敗 + 重試 -->
    <div v-else-if="loadError" class="empty-state">
      <div class="empty-icon" style="color: #ef4444;">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3>載入失敗</h3>
      <p>{{ loadError }}</p>
      <button class="btn-create" @click="loadEvents">重新載入</button>
    </div>

    <!-- 空狀態 -->
    <div v-else-if="filteredEvents.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
        </svg>
      </div>
      <h3>{{ searchQuery ? '找不到符合的活動' : '尚無活動' }}</h3>
      <p>{{ searchQuery ? '請嘗試其他關鍵字或清除篩選條件' : '點擊「建立新活動」開始規劃您的第一個活動' }}</p>
      <button v-if="!searchQuery && userStore.isSuperAdmin" class="btn-create" @click="showCreateModal = true">
        <span class="icon">➕</span> 建立新活動
      </button>
    </div>

    <div v-else class="events-grid">
      <div
        v-for="event in filteredEvents"
        :key="event.id"
        class="event-card"
        :class="{ expired: isEventExpired(event) }"
        @click="selectEvent(event)"
      >
        <div class="card-banner" :style="{ backgroundImage: `url(${event.banner})` }">
          <div class="event-status-badge" :class="isEventExpired(event) ? 'expired' : event.status">
            {{ isEventExpired(event) ? '已過期' : event.statusText }}
          </div>
        </div>
        <div class="card-content">
          <h3 class="event-title">{{ event.name }}</h3>
          <div class="event-meta">
            <div class="meta-item">
              <span class="meta-icon">📅</span>
              <span class="meta-text">{{ event.date }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-icon">📍</span>
              <span class="meta-text">{{ event.location }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-icon">👥</span>
              <span class="meta-text">{{ event.participantsCount }} 人報名</span>
            </div>
          </div>
          <div class="card-actions">
            <span class="reg-page-badge" :class="{ has: event.hasRegistrationPage }">
              {{ event.hasRegistrationPage ? '已建立報名頁' : '尚無報名頁' }}
            </span>
            <button v-if="userStore.isSuperAdmin" class="btn-action btn-edit-event" @click.stop="openEditPanel(event)">編輯活動</button>
            <button class="btn-action" @click.stop="selectEvent(event)">設定報名頁面</button>
            <button class="btn-action" @click.stop="selectEventForFormFields(event)">報名表欄位</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 建立活動彈窗 -->
    <BaseModal v-model="showCreateModal" title="建立新活動">
      <div class="form-group">
        <label>活動名稱 *</label>
        <input type="text" v-model="newEvent.name" placeholder="請輸入活動名稱" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>開始日期 *</label>
          <input type="date" v-model="newEvent.date" />
        </div>
        <div class="form-group">
          <label>結束日期</label>
          <input type="date" v-model="newEvent.endDate" />
        </div>
      </div>
      <div class="form-group">
        <label>活動時間 *</label>
        <input type="time" v-model="newEvent.time" />
      </div>
      <div class="form-group">
        <label>活動地點 *</label>
        <input type="text" v-model="newEvent.location" placeholder="請輸入活動地點" />
      </div>
      <div class="form-group">
        <label>詳細地址</label>
        <input type="text" v-model="newEvent.address" placeholder="請輸入詳細地址（選填）" />
      </div>
      <div class="form-group">
        <label>報名人數上限 *</label>
        <input type="number" v-model="newEvent.maxParticipants" min="1" max="9999" placeholder="預設500，可自訂" />
      </div>
      <template #footer>
        <button class="btn-cancel" @click="showCreateModal = false">取消</button>
        <button class="btn-confirm" @click="createEvent">建立活動</button>
      </template>
    </BaseModal>

    <!-- 右側編輯活動面板 -->
    <BasePanel v-model="editPanelOpen" title="編輯活動資訊">
      <template v-if="editingEvent">
        <div class="form-group">
          <label>活動名稱 *</label>
          <input type="text" v-model="editingEvent.name" placeholder="請輸入活動名稱" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>開始日期 *</label>
            <input type="date" v-model="editingEvent.date" />
          </div>
          <div class="form-group">
            <label>結束日期</label>
            <input type="date" v-model="editingEvent.endDate" />
          </div>
        </div>
        <div class="form-group">
          <label>活動時間 *</label>
          <input type="time" v-model="editingEvent.time" />
        </div>
        <div class="form-group">
          <label>活動地點 *</label>
          <input type="text" v-model="editingEvent.location" placeholder="請輸入活動地點" />
        </div>
        <div class="form-group">
          <label>詳細地址</label>
          <input type="text" v-model="editingEvent.address" placeholder="請輸入詳細地址（選填）" />
        </div>
        <div class="form-group">
          <label>報名人數上限 *</label>
          <input type="number" v-model="editingEvent.maxParticipants" min="1" max="9999" placeholder="預設500，可自訂" />
        </div>
      </template>
      <template #footer>
        <button class="btn-panel-cancel" @click="closeEditPanel">取消</button>
        <button class="btn-panel-save" @click="saveEditEvent">儲存變更</button>
      </template>
    </BasePanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { useEventsStore } from "@/stores/events";
import { useToast } from "@/composables/useToast";
import { apiRequest } from "@/utils/api";
import BaseModal from "@/components/shared/BaseModal.vue";
import BasePanel from "@/components/shared/BasePanel.vue";
import type { Event } from "@/types";

interface EventEditForm {
  id: number;
  name: string;
  date: string;
  endDate: string;
  time: string;
  location: string;
  address: string;
  maxParticipants: number;
}

const router = useRouter();
const userStore = useUserStore();
const eventsStore = useEventsStore();
const { success, error } = useToast();

const searchQuery = ref("");
const activeFilter = ref("all");
const showCreateModal = ref(false);
const loadingEvents = ref(true);
const loadError = ref("");

// 活動過期判斷
const today = new Date().toISOString().slice(0, 10);
const isEventExpired = (event: Event) => {
  const endDate = event.endDate || event.date;
  return !!endDate && endDate < today;
};

// 右側編輯面板
const editingEvent = ref<EventEditForm | null>(null);
const originalEditSnapshot = ref("");
const editPanelOpen = computed({
  get: () => !!editingEvent.value,
  set: (v) => {
    if (!v) {
      if (hasUnsavedChanges.value && !confirm("尚未儲存變更，確定要離開嗎？")) return;
      editingEvent.value = null;
    }
  },
});

const hasUnsavedChanges = computed(() => {
  if (!editingEvent.value) return false;
  return JSON.stringify(editingEvent.value) !== originalEditSnapshot.value;
});

const openEditPanel = (event: Event) => {
  const data = {
    id: event.id,
    name: event.name,
    date: event.date,
    endDate: event.endDate || "",
    time: event.time || "",
    location: event.location || "",
    address: event.address || "",
    maxParticipants: (event as Event & { maxParticipants?: number }).maxParticipants || 500,
  };
  editingEvent.value = data;
  originalEditSnapshot.value = JSON.stringify(data);
};

const closeEditPanel = () => {
  if (hasUnsavedChanges.value && !confirm("尚未儲存變更，確定要離開嗎？")) return;
  editingEvent.value = null;
};

const saveEditEvent = async () => {
  if (!editingEvent.value) return;
  try {
    const updated = await eventsStore.updateEvent(editingEvent.value.id, {
      name:             editingEvent.value.name,
      date:             editingEvent.value.date,
      end_date:         editingEvent.value.endDate || editingEvent.value.date,
      time:             editingEvent.value.time + ":00",
      location:         editingEvent.value.location,
      address:          editingEvent.value.address || "",
      max_participants: editingEvent.value.maxParticipants || 500,
    });
    if (eventsStore.currentEvent?.id === updated.id) {
      eventsStore.setCurrentEvent(updated, userStore.user?.id);
    }
    success("活動已更新");
    closeEditPanel();
  } catch (err: unknown) {
    error((err as Error).message || "更新失敗");
  }
};

const filterTabs = [
  { label: "全部", value: "all" },
  { label: "進行中", value: "active" },
  { label: "即將開始", value: "upcoming" },
  { label: "已結束", value: "completed" },
];

const newEvent = ref({
  name: "",
  date: "",
  endDate: "",
  time: "",
  location: "",
  address: "",
  maxParticipants: 500,
});

// 從 store 取得活動列表
const filteredEvents = computed(() => {
  let result = eventsStore.events;

  if (searchQuery.value) {
    result = result.filter((event) =>
      event.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
    );
  }

  if (activeFilter.value !== "all") {
    result = result.filter((event) => event.status === activeFilter.value);
  }

  return result;
});

// 載入活動列表
const loadEvents = async () => {
  loadingEvents.value = true;
  loadError.value = "";
  try {
    await eventsStore.fetchEvents({
      userId: userStore.user?.id,
      isSuperAdmin: userStore.isSuperAdmin,
    });
    // 自動取消發佈已過期活動的報名連結（背景靜默執行）
    const expiredPublished = eventsStore.events.filter(
      (e) => isEventExpired(e) && e.isPublished && e.hasRegistrationPage
    );
    for (const event of expiredPublished) {
      try {
        const pageRes = await apiRequest(`/api/registration-pages/by_event/${event.id}/`);
        if (pageRes.ok) {
          const pageData = await pageRes.json();
          if (pageData.is_published) {
            await apiRequest(`/api/registration-pages/${pageData.id}/unpublish/`, {
              method: "POST",
              body: JSON.stringify({}),
            });
          }
        }
      } catch { /* silent */ }
    }
  } catch (err: unknown) {
    const msg = (err as Error).message || "";
    if (msg.includes("401") || msg.includes("Authentication")) {
      loadError.value = "登入已過期，請重新登入";
    } else if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")) {
      loadError.value = "網路連線失敗，請檢查網路後重試";
    } else {
      loadError.value = msg || "載入活動列表失敗";
    }
  } finally {
    loadingEvents.value = false;
  }
};

onMounted(loadEvents);

const selectEvent = (event: Event) => {
  eventsStore.setCurrentEvent(event, userStore.user?.id);
  router.push("/admin/registration-setting");
};

const selectEventForFormFields = (event: Event) => {
  eventsStore.setCurrentEvent(event, userStore.user?.id);
  router.push({ path: "/admin/form-fields", query: { eventId: event.id } });
};

const editEvent = (event: Event) => {
  eventsStore.setCurrentEvent(event, userStore.user?.id);
  router.push("/admin/registration-setting");
};

const viewDetails = (event: Event) => {
  eventsStore.setCurrentEvent(event, userStore.user?.id);
  router.push("/admin/registration-setting");
};

const createEvent = async () => {
  if (!newEvent.value.name || !newEvent.value.date || !newEvent.value.time || !newEvent.value.location) {
    error("請填寫活動名稱、日期、時間與地點");
    return;
  }
  try {
    const created = await eventsStore.createEvent({
      name:             newEvent.value.name,
      date:             newEvent.value.date,
      end_date:         newEvent.value.endDate || newEvent.value.date,
      time:             newEvent.value.time + ':00',
      location:         newEvent.value.location,
      address:          newEvent.value.address || "",
      max_participants: newEvent.value.maxParticipants || 500,
    });
    success("活動已建立");
    showCreateModal.value = false;
    newEvent.value = { name: "", date: "", endDate: "", time: "", location: "", address: "", maxParticipants: 500 };
    // 切換到新活動並前往設定頁
    eventsStore.setCurrentEvent(created, userStore.user?.id);
    router.push("/admin/registration-setting");
  } catch (err: unknown) {
    error((err as Error).message || "建立活動失敗");
  }
};
</script>

<style lang="scss" scoped>
.events-view {
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;

  .header-left {
    .title {
      font-size: 2rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0 0 8px 0;
    }

    .subtitle {
      font-size: 0.95rem;
      color: var(--text-secondary);
      margin: 0;
    }
  }

  .btn-create {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s;

    &:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
      transform: translateY(-2px);
    }

    .icon {
      font-size: 1.2rem;
    }
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  justify-content: space-between;

  .btn-create {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s;
    white-space: nowrap;

    &:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
      transform: translateY(-2px);
    }

    .icon {
      font-size: 1.2rem;
    }
  }
}

.search-box {
  flex: 1;
  max-width: 400px;

  input {
    width: 100%;
    border: 2px solid var(--border-color);
    background: var(--bg-card);
    padding: 12px 18px;
    font-size: 0.95rem;
    border-radius: 10px;
    transition: all 0.3s;
    font-weight: 500;

    &:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
    }

    &::placeholder {
      color: var(--text-muted);
      font-weight: 400;
    }
  }
}

.filter-tabs {
  display: flex;
  gap: 8px;
}

.filter-tab {
  background: transparent;
  border: 1px solid var(--border-color);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.3s;

  &:hover {
    border-color: #6366f1;
    color: #6366f1;
  }

  &.active {
    background: #6366f1;
    color: white;
    border-color: #6366f1;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  gap: 12px;
  text-align: center;

  .empty-icon {
    width: 96px;
    height: 96px;
    border-radius: 24px;
    background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #a5b4fc;
    margin-bottom: 8px;
  }

  h3 {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0;
  }

  p {
    font-size: 0.9rem;
    color: var(--text-muted);
    margin: 0 0 8px 0;
  }
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.event-card {
  background: var(--bg-card);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    transform: translateY(-4px);
  }

  .card-banner {
    height: 160px;
    background-size: cover;
    background-position: center;
    background-color: #e5e7eb;
    position: relative;

    .event-status-badge {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      backdrop-filter: blur(8px);

      &.active {
        background: rgba(209, 250, 229, 0.95);
        color: #065f46;
      }

      &.upcoming {
        background: rgba(219, 234, 254, 0.95);
        color: #3730a3;
      }

      &.completed {
        background: rgba(243, 244, 246, 0.95);
        color: #374151;
      }
    }
  }

  .card-content {
    padding: 20px;

    .event-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0 0 16px 0;
    }

    .event-meta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;

      .meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        color: var(--text-secondary);

        .meta-icon {
          font-size: 1rem;
        }
      }
    }

    .card-actions {
      display: flex;
      gap: 8px;
      padding-top: 16px;
      border-top: 1px solid var(--border-light);
      align-items: center;

      .reg-page-badge {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 20px;
        background: var(--bg-hover);
        color: var(--text-muted);
        flex-shrink: 0;
        &.has {
          background: #d1fae5;
          color: #059669;
        }
      }

      .btn-action {
        flex: 1;
        padding: 8px 16px;
        border-radius: 8px;
        border: 1px solid #6366f1;
        background: #6366f1;
        color: white;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.3s;

        &:hover {
          background: #4f46e5;
        }

        &.secondary {
          background: var(--bg-card);
          color: #6366f1;

          &:hover {
            background: #eef2ff;
          }
        }
      }
    }
  }
}

// 表單共用樣式
.form-row {
  display: flex;
  gap: 12px;

  .form-group {
    flex: 1;
  }
}

.form-group {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-main);
    margin-bottom: 8px;
  }

  input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    font-size: 0.95rem;
    transition: all 0.3s;

    &:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
  }
}

.btn-cancel {
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  transition: all 0.3s;

  &:hover {
    background: var(--bg-primary);
  }
}

.btn-confirm {
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border: none;
  color: white;
  transition: all 0.3s;

  &:hover {
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }
}

/* 過期活動卡片樣式 */
.event-card.expired {
  opacity: 0.65;
  filter: grayscale(0.4);

  .event-status-badge.expired {
    background: rgba(148, 163, 184, 0.95);
    color: white;
  }
}

/* 編輯活動按鈕 */
.btn-edit-event {
  background: white !important;
  color: #475569 !important;
  border-color: #e2e8f0 !important;

  &:hover {
    background: #f8fafc !important;
    border-color: #cbd5e1 !important;
  }
}

.btn-panel-cancel {
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  transition: all 0.2s;

  &:hover {
    background: var(--bg-primary);
  }
}

.btn-panel-save {
  padding: 10px 24px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border: none;
  color: white;
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }
}

@media (max-width: 1200px) {
  .events-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .events-view {
    padding: 16px;
  }

  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .search-box {
    max-width: none;
  }

  .filter-tabs {
    flex-wrap: wrap;
  }

  .events-grid {
    grid-template-columns: 1fr;
  }

  .event-card .card-content .card-actions {
    flex-wrap: wrap;

    .btn-action {
      flex: 1 1 calc(50% - 4px);
      min-width: 0;
      text-align: center;
      padding: 8px 8px;
      font-size: 0.8rem;
    }
  }
}

/* Skeleton loading */
.skeleton-card {
  pointer-events: none;
}
.skeleton-banner {
  height: 140px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: 16px 16px 0 0;
}
.skeleton-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-line {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
}
.skeleton-line.w60 { width: 60%; }
.skeleton-line.w40 { width: 40%; }
.skeleton-line.w80 { width: 80%; }

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
