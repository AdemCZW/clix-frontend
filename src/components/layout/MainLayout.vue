<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "@/stores/user";
import { useEventsStore } from "@/stores/events";
import { useToast } from "@/composables/useToast";
import OnboardingModal from "@/components/onboarding/OnboardingModal.vue";
import EventSwitcher from "@/components/EventSwitcher.vue";

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const eventsStore = useEventsStore();
const { success } = useToast();

// 初始化用戶狀態與上次選擇的活動
userStore.checkAuth();
eventsStore.initFromStorage(userStore.user?.id);

// 進入時載入後端活動列表
onMounted(async () => {
  try {
    await eventsStore.fetchEvents({
      userId: userStore.user?.id,
      isSuperAdmin: userStore.isSuperAdmin,
    });
  } catch { /* silent */ }
});

// 沒有選擇活動時顯示選擇彈窗
const showOnboarding = ref(!eventsStore.currentEvent);
const onboardingMode = ref("select");

// 依據功能邏輯重新整理的選單 (兩層架構)
const mainMenuItems = computed(() => [
  { id: 1, name: "主辦中心", path: "/admin/dashboard" },
  { id: 2, name: "活動列表", path: "/admin/events" },
  { id: 3, name: "總人員名單", path: "/admin/all-participants" },
  ...(userStore.isSuperAdmin ? [{ id: 4, name: "帳戶權限", path: "/admin/account" }] : []),
]);

const eventMenuItems = [
  { id: 1, name: "報名頁面設定", path: "/admin/registration-setting" },
  { id: 6, name: "參與者資訊", path: "/admin/participants" },
  // { id: 2, name: "參與貴賓", path: "/admin/guests" },
  { id: 3, name: "座次劃位管理", path: "/admin/seating-plan" },
  { id: 4, name: "報名表欄位", path: "/admin/form-fields" },
  { id: 5, name: "通知信設定", path: "/admin/notifications" },
  { id: 7, name: "現場報到紀錄", path: "/admin/checkin-history" },
  { id: 8, name: "識別證列印", path: "/admin/badge-printing" },
  { id: 9, name: "中獎名單管理", path: "/admin/lottery-winners" },
  { id: 10, name: "主辦單位資訊", path: "/admin/organizer-info" },
  { id: 11, name: "AI客服設定", path: "/admin/ai-service" },
];

const navigateTo = (path) => {
  if (path === "/admin/form-fields" && eventsStore.currentEvent?.id) {
    router.push({ path, query: { eventId: eventsStore.currentEvent.id } });
  } else {
    router.push(path);
  }
};

const handleOnboardingComplete = (data) => {
  eventsStore.setCurrentEvent(data.event, userStore.user?.id);
  showOnboarding.value = false;
};

const handleOnboardingClose = () => {
  // 可以選擇不允許關閉，或提供跳過選項
  // showOnboarding.value = false;
};

const handleLogout = () => {
  userStore.logout();
  success("已成功登出");
  router.push("/login");
};
</script>

<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-box"></div>
        <h2 class="system-name">報到系統</h2>
      </div>

      <nav class="menu">
        <!-- 主選單 -->
        <div class="menu-section">
          <div class="section-label">主要功能</div>
          <div
            v-for="item in mainMenuItems"
            :key="'main-' + item.id"
            class="menu-item"
            :class="{ active: route.path === item.path }"
            @click="navigateTo(item.path)"
          >
            <span class="label">{{ item.name }}</span>
          </div>
        </div>

        <!-- 活動管理選單 -->
        <div class="menu-section" v-if="eventsStore.currentEvent">
          <div class="section-label">
            活動管理
            <span class="event-badge">{{ eventsStore.currentEvent.name }}</span>
          </div>
          <div
            v-for="item in eventMenuItems"
            :key="'event-' + item.id"
            class="menu-item sub-item"
            :class="{ active: route.path === item.path }"
            @click="navigateTo(item.path)"
          >
            <span class="label">{{ item.name }}</span>
          </div>
        </div>
      </nav>

      <div class="sidebar-footer">
        <button class="logout-btn" @click="handleLogout">LOGOUT</button>
      </div>
    </aside>

    <main class="content-area">
      <header class="content-header">
        <div class="header-actions">
          <!-- <EventSwitcher /> -->
          <div class="current-user" v-if="userStore.user">
            <span class="user-avatar">{{ (userStore.user.username || userStore.user.email || '?')[0].toUpperCase() }}</span>
            <span class="user-name">{{ userStore.user.username || userStore.user.email }}</span>
            <span v-if="userStore.isSuperAdmin" class="user-role-badge">Super Admin</span>
          </div>
        </div>
      </header>

      <section class="view-port">
        <router-view :key="route.fullPath" />
      </section>
    </main>

    <!-- 引導彈跳視窗 -->
    <OnboardingModal
      :show="showOnboarding"
      :mode="onboardingMode"
      @complete="handleOnboardingComplete"
      @close="handleOnboardingClose"
    />
  </div>
</template>

<style lang="scss" scoped>
/* 這裡保留您原本精美的 CSS 樣式，僅微調 icon 顯示 */
.admin-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--bg-primary);
}

.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;

  .sidebar-header {
    padding: 30px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    .logo-box {
      width: 32px;
      height: 32px;
      background: var(--accent-blue);
      clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
    }
    .system-name {
      font-size: 1.1rem;
      letter-spacing: 2px;
      color: var(--text-main);
      margin: 0;
    }
  }
}

.menu {
  flex: 1;
  padding: 0 12px;
  overflow-y: auto;

  .menu-section {
    margin-bottom: 28px;

    &:last-child {
      margin-bottom: 0;
    }

    .section-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      padding: 8px 16px;
      opacity: 0.6;
      display: flex;
      align-items: center;
      justify-content: space-between;

      .event-badge {
        font-size: 0.75rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 4px 12px;
        border-radius: 12px;
        text-transform: none;
        font-weight: 700;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        letter-spacing: 0.5px;
      }
    }
  }

  .menu-item {
    padding: 12px 16px;
    margin-bottom: 4px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;

    &.sub-item {
      padding-left: 20px;
      font-size: 0.9rem;

      .icon-span {
        font-size: 1rem;
      }
    }

    .icon-span {
      margin-right: 12px;
      font-size: 1.2rem;
      min-width: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .label {
      font-size: 0.95rem;
      letter-spacing: 0.3px;
    }

    &:hover {
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-main);
    }

    &.active {
      background: rgba(56, 189, 248, 0.1);
      color: var(--accent-blue);
      box-shadow: inset 3px 0 0 var(--accent-blue);
      font-weight: 600;
    }
  }
}

.sidebar-footer {
  padding: 20px;
  border-top: 1px solid var(--border-color);
  .logout-btn {
    width: 100%;
    padding: 10px;
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.8rem;
    letter-spacing: 2px;
    &:hover {
      border-color: #f87171;
      color: #f87171;
      background: rgba(248, 113, 113, 0.05);
    }
  }
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.content-header {
  height: 64px;
  padding: 0 24px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  .header-actions {
    display: flex;
    align-items: center;
  }
  .current-user {
    display: flex;
    align-items: center;
    gap: 8px;
    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-weight: 700;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-name {
      color: var(--text-main);
      font-size: 0.9rem;
      font-weight: 500;
    }
    .user-role-badge {
      font-size: 0.7rem;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-blue);
      border: 1px solid var(--accent-blue);
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
  }
}

.view-port {
  flex: 1;
  padding: 40px;
  overflow-y: auto;
  background: var(--bg-primary);
}

/* 頁面切換動畫 */
.page-fade-enter-active,
.page-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
