<template>
  <div class="events-view">
    <!-- 標題列 -->
    <header class="page-head">
      <h1 class="page-title">活動列表</h1>
      <button v-if="userStore.isSuperAdmin" class="btn-create" @click="showCreateModal = true">
        建立新活動
      </button>
    </header>

    <!-- 分頁 Tabs -->
    <nav class="tabs">
      <button
        v-for="tab in filterTabs"
        :key="tab.value"
        class="tab"
        :class="{ active: activeFilter === tab.value }"
        @click="activeFilter = tab.value"
      >
        {{ tab.label }}
        <span v-if="tabCount(tab.value) !== null" class="tab-count">({{ tabCount(tab.value) }})</span>
      </button>
    </nav>

    <!-- Loading 骨架 -->
    <div v-if="loadingEvents" class="events-list">
      <div v-for="n in 4" :key="n" class="event-row skeleton-row">
        <div class="skeleton-thumb"></div>
        <div class="skeleton-body">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-line w40"></div>
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
        </svg>
      </div>
      <h3>{{ searchQuery ? '找不到符合的活動' : '尚無活動' }}</h3>
      <p>{{ searchQuery ? '請嘗試其他關鍵字或清除篩選條件' : '點擊「建立新活動」開始規劃您的第一個活動' }}</p>
      <button v-if="!searchQuery && userStore.isSuperAdmin" class="btn-create" @click="showCreateModal = true">建立新活動</button>
    </div>

    <!-- 活動列表（橫向 row 布局） -->
    <div v-else class="events-list">
      <article
        v-for="event in filteredEvents"
        :key="event.id"
        class="event-row"
      >
        <!-- 縮圖 -->
        <div class="row-thumb">
          <img
            v-if="event.banner"
            :src="event.banner"
            alt=""
            loading="lazy"
            decoding="async"
            class="thumb-img"
          />
          <div v-else class="thumb-placeholder">CLIX</div>
        </div>

        <!-- 標題 + 建立日期 -->
        <div class="row-title-block">
          <h3 class="row-title">{{ event.name }}</h3>
          <p class="row-meta">{{ formatCreatedAt(event) }} 建立</p>
        </div>

        <!-- 中間分隔線 -->
        <div class="row-vline"></div>

        <!-- 時間 + 報名人數 -->
        <div class="row-info">
          <div class="info-line">
            <svg class="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            <span>{{ formatDateRange(event) }}</span>
          </div>
          <div class="info-line">
            <svg class="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>
            <span>{{ event.participantsCount || 0 }} 人報名</span>
          </div>
        </div>

        <!-- 動作連結 -->
        <div class="row-actions">
          <a v-if="userStore.isSuperAdmin" class="row-link" @click.stop="openEditPanel(event)">編輯活動</a>
          <a class="row-link" @click.stop="selectEvent(event)">報名頁面</a>
          <a class="row-link" @click.stop="selectEventForFormFields(event)">報名表欄位</a>
          <a class="row-link" @click.stop="previewEvent(event)">預覽</a>
        </div>

        <!-- 狀態標籤（右上） -->
        <div class="row-status" :class="statusClass(event)">{{ statusLabel(event) }}</div>
      </article>
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
      <div class="form-group">
        <label>聯絡主辦單位連結（選填）</label>
        <input
          type="text"
          v-model="newEvent.contactLink"
          placeholder="mailto:host@example.com / tel:0912345678 / https://..."
          @blur="newEventContactLinkError = validateContactLink(newEvent.contactLink)"
          @focus="newEventContactLinkError = ''"
        />
        <small v-if="newEventContactLinkError" style="color: #dc2626; font-size: 0.78rem;">{{ newEventContactLinkError }}</small>
        <small v-else style="color: #94a3b8; font-size: 0.78rem;">手機版報名頁的「聯絡主辦單位」按鈕會用此連結；空白則不顯示按鈕</small>
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
        <div class="form-group">
          <label>聯絡主辦單位連結（選填）</label>
          <input
            type="text"
            v-model="editingEvent.contactLink"
            placeholder="mailto:host@example.com / tel:0912345678 / https://..."
            @blur="editEventContactLinkError = validateContactLink(editingEvent.contactLink)"
            @focus="editEventContactLinkError = ''"
          />
          <small v-if="editEventContactLinkError" style="color: #dc2626; font-size: 0.78rem;">{{ editEventContactLinkError }}</small>
          <small v-else style="color: #94a3b8; font-size: 0.78rem;">手機版報名頁的「聯絡主辦單位」按鈕會用此連結；空白則不顯示按鈕</small>
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
import { useConfirm } from "@/composables/useConfirm";
import { useEventSwitcher } from "@/composables/useEventSwitcher";
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
  contactLink: string;
}

const router = useRouter();
const userStore = useUserStore();
const eventsStore = useEventsStore();
const { success, error } = useToast();
const { confirm } = useConfirm();
const { switchEvent } = useEventSwitcher();

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
    if (!v) closeEditPanel();
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
    maxParticipants: event.maxParticipants || 500,
    contactLink: event.contactLink || '',
  };
  editingEvent.value = data;
  originalEditSnapshot.value = JSON.stringify(data);
};

const closeEditPanel = async () => {
  if (hasUnsavedChanges.value && !(await confirm({ message: '尚未儲存變更，確定要離開嗎？', confirmText: '離開', danger: false }))) return;
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
      contact_link:     editingEvent.value.contactLink || '',
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
  { label: "草稿", value: "draft" },
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
  contactLink: "",
});

// contact_link 即時驗證（@blur 顯示提示，不擋 submit；後端為單一真實來源）
// 規則跟後端 EventSerializer.validate_contact_link 一致
const newEventContactLinkError = ref("");
const editEventContactLinkError = ref("");
const validateContactLink = (value: string): string => {
  const v = (value || "").trim();
  if (!v) return ""; // 空字串視為清除
  const allowed = ["http://", "https://", "mailto:", "tel:"];
  if (!allowed.some((p) => v.toLowerCase().startsWith(p))) {
    return "只允許 http://、https://、mailto:、tel: 開頭的連結";
  }
  return "";
};

// 從 store 取得活動列表
const filteredEvents = computed(() => {
  let result = eventsStore.events;

  if (searchQuery.value) {
    result = result.filter((event) =>
      event.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
    );
  }

  if (activeFilter.value !== "all") {
    result = result.filter((event) => matchTab(event, activeFilter.value));
  }

  return result;
});

// 分頁判斷
const matchTab = (event: Event, tab: string): boolean => {
  if (tab === "draft") return !event.isPublished;
  if (tab === "completed") return event.status === "completed" || isEventExpired(event);
  if (tab === "active") return event.status === "active" && !isEventExpired(event);
  if (tab === "upcoming") return event.status === "upcoming" && !isEventExpired(event);
  return true;
};

const tabCount = (tab: string): number | null => {
  if (tab === "all") return eventsStore.events.length;
  if (tab === "draft" || tab === "completed") {
    return eventsStore.events.filter((e) => matchTab(e, tab)).length;
  }
  return null; // 進行中、即將開始不顯示計數
};

// 狀態顯示
const statusLabel = (event: Event): string => {
  if (isEventExpired(event)) return "已結束";
  if (!event.isPublished) return "草稿";
  if (event.status === "active") return "活動進行中";
  if (event.status === "upcoming") return "即將開始";
  return event.statusText || "已結束";
};

const statusClass = (event: Event): string => {
  if (isEventExpired(event)) return "ended";
  if (!event.isPublished) return "draft";
  if (event.status === "active") return "active";
  if (event.status === "upcoming") return "upcoming";
  return "ended";
};

// 日期格式化
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const formatDateWithWeek = (dateStr: string, time?: string): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const wd = WEEKDAYS[d.getDay()];
  return `${dateStr}(${wd})${time ? ` ${time}` : ""}`;
};

const formatDateRange = (event: Event): string => {
  const start = formatDateWithWeek(event.date, event.time);
  const endDate = event.endDate || event.date;
  const endTime = (event as Event & { endTime?: string }).endTime || event.time;
  const end = formatDateWithWeek(endDate, endTime);
  if (!start) return "";
  if (start === end) return `${start} (GMT+8)`;
  return `${start} ~ ${end} (GMT+8)`;
};

const formatCreatedAt = (event: Event): string => {
  const created = (event as Event & { createdAt?: string }).createdAt;
  if (created) return created.slice(0, 10);
  return event.date || "";
};

const previewEvent = (event: Event) => {
  const slug = (event as Event & { shortLink?: string }).shortLink;
  if (slug) window.open(slug.startsWith("http") ? slug : `/#/page/${slug}`, "_blank");
  else selectEvent(event);
};

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

const selectEvent = (event: Event) => switchEvent(event, "/admin/registration-setting");

const selectEventForFormFields = (event: Event) =>
  switchEvent(event, { path: "/admin/form-fields", query: { eventId: event.id } });

const editEvent = (event: Event) => switchEvent(event, "/admin/registration-setting");

const viewDetails = (event: Event) => switchEvent(event, "/admin/registration-setting");

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
      contact_link:     newEvent.value.contactLink || '',
    });
    success("活動已建立");
    showCreateModal.value = false;
    newEvent.value = { name: "", date: "", endDate: "", time: "", location: "", address: "", maxParticipants: 500, contactLink: "" };
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
  padding: 24px 32px;
  max-width: 1500px;
  margin: 0 auto;
  background: #fff;
  min-height: 100%;
  border-radius: 16px;
}

/* ── 標題列 ── */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #1e293b;
  margin: 0;
  letter-spacing: -0.01em;
}

.btn-create {
  background: #167A67;
  color: #fff;
  border: none;
  padding: 10px 22px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;

  &:hover { background: #0f5d4e; }
}

/* ── Tabs ── */
.tabs {
  display: flex;
  gap: 32px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 20px;
}

.tab {
  background: transparent;
  border: none;
  padding: 12px 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
  position: relative;
  transition: color 0.15s;

  .tab-count {
    margin-left: 4px;
    font-weight: 600;
  }

  &:hover { color: #475569; }

  &.active {
    color: #167A67;

    &::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 3px;
      background: #167A67;
      border-radius: 2px 2px 0 0;
    }
  }
}

/* ── 空狀態 ── */
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
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #cbd5e1;
    margin-bottom: 8px;
  }

  h3 {
    font-size: 1.2rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
  }

  p {
    font-size: 0.9rem;
    color: #94a3b8;
    margin: 0 0 8px 0;
  }
}

/* ── Events List ── */
.events-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-row {
  display: grid;
  grid-template-columns: 130px minmax(180px, 1.3fr) 1px minmax(220px, 1.4fr) auto auto;
  gap: 24px;
  align-items: center;
  padding: 18px 22px 18px 18px;
  background: #f9fafb;
  border-radius: 12px;
  border: 1px solid #f3f4f6;
  position: relative;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: #f3f4f6;
    border-color: #e5e7eb;
  }
}

.row-thumb {
  width: 130px;
  height: 88px;
  border-radius: 8px;
  background-color: #cad2c5;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;

  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-placeholder {
    color: rgba(255, 255, 255, 0.7);
    font-weight: 700;
    font-size: 1.15rem;
    letter-spacing: 0.1em;
  }
}

.row-title-block {
  min-width: 0;
}

.row-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.row-meta {
  font-size: 0.82rem;
  color: #94a3b8;
  margin: 0;
}

.row-vline {
  width: 1px;
  height: 56px;
  background: #e5e7eb;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.info-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  color: #475569;

  .info-icon {
    flex-shrink: 0;
    color: #94a3b8;
  }
}

.row-actions {
  display: flex;
  gap: 24px;
  align-items: center;
  margin-right: 12px;
}

.row-link {
  font-size: 0.88rem;
  font-weight: 600;
  color: #167A67;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s;

  &:hover {
    color: #0f5d4e;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}

.row-status {
  position: absolute;
  top: 14px;
  right: 18px;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;

  &.active {
    background: #e8f5f1;
    color: #167A67;
    border: 1px solid #b9dcd2;
  }

  &.upcoming {
    background: #eef2ff;
    color: #4338ca;
    border: 1px solid #c7d2fe;
  }

  &.draft {
    background: #f3f4f6;
    color: #64748b;
    border: 1px solid #e5e7eb;
  }

  &.ended {
    background: #f3f4f6;
    color: #94a3b8;
    border: 1px solid #e5e7eb;
  }
}

/* ── 骨架屏 ── */
.skeleton-row {
  pointer-events: none;
  background: #f9fafb;

  .skeleton-thumb {
    width: 130px;
    height: 88px;
    border-radius: 8px;
    background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-line {
    height: 14px;
    background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
    &.w60 { width: 60%; }
    &.w40 { width: 40%; }
  }
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── RWD ── */
@media (max-width: 1100px) {
  .event-row {
    display: flex;
    flex-wrap: wrap;
    grid-template-columns: none;
    gap: 14px;
    padding: 16px;
  }

  .row-thumb { width: 110px; height: 75px; }

  .row-title-block {
    flex: 1;
    min-width: 0;
    align-self: center;
  }

  .row-vline { display: none; }

  .row-info {
    width: 100%;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px dashed #e5e7eb;
  }

  .row-actions {
    width: 100%;
    gap: 22px;
    flex-wrap: wrap;
    padding-top: 4px;
    margin-right: 0;
  }

  .row-status {
    position: static;
    align-self: flex-start;
    order: 99;
  }
}

@media (max-width: 768px) {
  .events-view {
    padding: 16px;
    border-radius: 12px;
  }

  .page-title { font-size: 1.5rem; }

  .btn-create {
    padding: 9px 16px;
    font-size: 0.88rem;
  }

  .tabs {
    gap: 22px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }

  .tab {
    white-space: nowrap;
    font-size: 0.95rem;
    padding: 10px 0;
  }

  .event-row {
    padding: 14px;
    gap: 12px;
  }

  .row-thumb { width: 100px; height: 70px; }

  .row-title {
    font-size: 1rem;
    -webkit-line-clamp: 3;
  }

  .row-meta { font-size: 0.85rem; }

  .info-line {
    font-size: 0.88rem;
    .info-icon { width: 16px; height: 16px; }
  }

  .row-link { font-size: 0.92rem; }

  .row-status {
    font-size: 0.8rem;
    padding: 4px 12px;
  }
}

@media (max-width: 480px) {
  .events-view {
    padding: 14px 12px;
    border-radius: 10px;
  }

  .page-title { font-size: 1.3rem; }

  .btn-create {
    padding: 8px 14px;
    font-size: 0.82rem;
  }

  .tabs {
    gap: 18px;
  }

  .tab { font-size: 0.9rem; }

  .row-thumb { width: 90px; height: 64px; }

  .row-title { font-size: 0.95rem; }
  .row-meta { font-size: 0.8rem; }
  .info-line { font-size: 0.84rem; }

  .row-actions {
    gap: 14px;
  }

  .row-link { font-size: 0.86rem; }
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
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(22, 122, 103, 0.1);
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
  padding: 8px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  background: #167A67;
  border: none;
  color: white;
  transition: all 0.15s;

  &:hover { background: #0f5d4e; }
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
  background: var(--bg-card) !important;
  color: var(--text-secondary) !important;
  border-color: var(--border-color) !important;

  &:hover {
    background: var(--bg-hover) !important;
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
  padding: 8px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  background: #167A67;
  border: none;
  color: white;
  transition: all 0.15s;

  &:hover { background: #0f5d4e; }
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
  height: 120px;
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--border-color) 50%, var(--bg-hover) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: 10px 10px 0 0;
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
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--border-color) 50%, var(--bg-hover) 75%);
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
