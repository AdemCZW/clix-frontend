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
      <button class="btn-create" @click="showCreateModal = true">
        <span class="icon">➕</span>
        建立新活動
      </button>
    </div>

    <div class="events-grid">
      <div
        v-for="event in filteredEvents"
        :key="event.id"
        class="event-card"
        @click="selectEvent(event)"
      >
        <div class="card-banner" :style="{ backgroundImage: `url(${event.banner})` }">
          <div class="event-status-badge" :class="event.status">
            {{ event.statusText }}
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
            <button class="btn-action" @click.stop="selectEvent(event)">設定報名頁面</button>
            <button class="btn-action" @click.stop="selectEventForFormFields(event)">報名表欄位</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 建立活動彈窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
          <div class="modal-card">
            <div class="modal-header">
              <h3>建立新活動</h3>
              <button class="btn-close" @click="showCreateModal = false">✕</button>
            </div>
            <div class="modal-body">
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
            </div>
            <div class="modal-footer">
              <button class="btn-cancel" @click="showCreateModal = false">取消</button>
              <button class="btn-confirm" @click="createEvent">建立活動</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { useEventsStore } from "@/stores/events";
import { useToast } from "@/composables/useToast";

const router = useRouter();
const userStore = useUserStore();
const eventsStore = useEventsStore();
const { success, error } = useToast();

const searchQuery = ref("");
const activeFilter = ref("all");
const showCreateModal = ref(false);

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

// 進入頁面時載入活動列表
onMounted(async () => {
  try {
    await eventsStore.fetchEvents({
      userId: userStore.user?.id,
      isSuperAdmin: userStore.isSuperAdmin,
    });
  } catch (err) {
    error(err.message || "載入活動列表失敗");
  }
});

const selectEvent = (event) => {
  eventsStore.setCurrentEvent(event, userStore.user?.id);
  router.push("/admin/registration-setting");
};

const selectEventForFormFields = (event) => {
  eventsStore.setCurrentEvent(event, userStore.user?.id);
  router.push({ path: "/admin/form-fields", query: { eventId: event.id } });
};

const editEvent = (event) => {
  eventsStore.setCurrentEvent(event, userStore.user?.id);
  router.push("/admin/registration-setting");
};

const viewDetails = (event) => {
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
      name:      newEvent.value.name,
      date:      newEvent.value.date,
      end_date:  newEvent.value.endDate || newEvent.value.date,
      time:      newEvent.value.time + ':00',
      location:  newEvent.value.location,
      address:   newEvent.value.address || "",
    });
    success("活動已建立");
    showCreateModal.value = false;
    newEvent.value = { name: "", date: "", endDate: "", time: "", location: "", address: "" };
    // 切換到新活動並前往設定頁
    eventsStore.setCurrentEvent(created, userStore.user?.id);
    router.push("/admin/registration-setting");
  } catch (err) {
    error(err.message || "建立活動失敗");
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
      color: #0f172a;
      margin: 0 0 8px 0;
    }

    .subtitle {
      font-size: 0.95rem;
      color: #475569;
      margin: 0;
    }
  }

  .btn-create {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
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
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
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
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
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
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
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
    border: 2px solid #e2e8f0;
    background: white;
    padding: 12px 18px;
    font-size: 0.95rem;
    border-radius: 10px;
    transition: all 0.3s;
    font-weight: 500;

    &:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
    }

    &::placeholder {
      color: #64748b;
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
  border: 1px solid #e5e7eb;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: #475569;
  transition: all 0.3s;

  &:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  &.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.event-card {
  background: white;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
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
        color: #1e40af;
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
      color: #0f172a;
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
        color: #475569;

        .meta-icon {
          font-size: 1rem;
        }
      }
    }

    .card-actions {
      display: flex;
      gap: 8px;
      padding-top: 16px;
      border-top: 1px solid #f1f5f9;
      align-items: center;

      .reg-page-badge {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 20px;
        background: #f1f5f9;
        color: #94a3b8;
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
        border: 1px solid #3b82f6;
        background: #3b82f6;
        color: white;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.3s;

        &:hover {
          background: #2563eb;
        }

        &.secondary {
          background: white;
          color: #3b82f6;

          &:hover {
            background: #eff6ff;
          }
        }
      }
    }
  }
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 500px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  padding: 24px 28px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    font-size: 1.3rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  .btn-close {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      color: #0f172a;
      transform: rotate(90deg);
    }
  }
}

.modal-body {
  padding: 28px;

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
      color: #0f172a;
      margin-bottom: 8px;
    }

    input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      font-size: 0.95rem;
      transition: all 0.3s;

      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    }
  }
}

.modal-footer {
  padding: 20px 28px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 12px;
  justify-content: flex-end;

  button {
    padding: 10px 24px;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
  }

  .btn-cancel {
    background: white;
    border: 1px solid #e5e7eb;
    color: #475569;

    &:hover {
      background: #f8fafc;
    }
  }

  .btn-confirm {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    border: none;
    color: white;

    &:hover {
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
  }
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

@media (max-width: 1200px) {
  .events-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .events-grid {
    grid-template-columns: 1fr;
  }
}
</style>
