<script setup>
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "@/stores/user";
import OnboardingModal from "@/components/onboarding/OnboardingModal.vue";
import EventSwitcher from "@/components/EventSwitcher.vue";

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

// 初始化用戶狀態
userStore.initFromStorage();

// 如果有系列/活動資料，但未選擇當前活動，則顯示選擇視窗
const showOnboarding = ref(!userStore.isOnboarded || !userStore.currentEvent);

// 決定模態視窗的模式：如果已經有資料就用選擇模式，否則用建立模式
const onboardingMode = ref(userStore.isOnboarded ? "select" : "create");

// 依據功能邏輯重新整理的選單 (加入座次管理)
const menuItems = [
  { id: 1, name: "報名頁面設定", path: "/admin/registration-setting", icon: "" },
  { id: 2, name: "參與貴賓", path: "/admin/guests", icon: "" },
  { id: 3, name: "座次劃位管理", path: "/admin/seating-plan", icon: "" },
  { id: 4, name: "報名表欄位", path: "/admin/form-fields", icon: "" },
  { id: 5, name: "通知信設定", path: "/admin/notifications", icon: "" },
  { id: 6, name: "參與者資訊", path: "/admin/participants", icon: "" },
  { id: 7, name: "現場報到紀錄", path: "/admin/checkin-history", icon: "" },
  { id: 8, name: "識別證列印", path: "/admin/badge-printing", icon: "" },
  { id: 9, name: "中獎名單管理", path: "/admin/lottery-winners", icon: "" },
  { id: 10, name: "主辦單位資訊", path: "/admin/organizer-info", icon: "" },
  { id: 11, name: "AI客服設定", path: "/admin/ai-service", icon: "" },
];

const navigateTo = (path) => {
  router.push(path);
};

const handleOnboardingComplete = (data) => {
  if (onboardingMode.value === "select") {
    // 選擇模式：切換到選中的活動
    userStore.switchEvent(data.event);
    userStore.switchSeries(data.series);
  } else {
    // 建立模式：完成引導並保存新資料
    userStore.completeOnboarding(data);
  }
  showOnboarding.value = false;
};

const handleOnboardingClose = () => {
  // 可以選擇不允許關閉，或提供跳過選項
  // showOnboarding.value = false;
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
        <div
          v-for="item in menuItems"
          :key="item.id"
          class="menu-item"
          :class="{ active: route.path === item.path }"
          @click="navigateTo(item.path)"
        >
          <span class="index">{{ item.id }}.</span>
          <span class="label">{{ item.name }}</span>
        </div>
      </nav>

      <div class="sidebar-footer">
        <button class="logout-btn" @click="navigateTo('/login')">LOGOUT</button>
      </div>
    </aside>

    <main class="content-area">
      <header class="content-header">
        <div class="header-actions">
          <EventSwitcher />
        </div>
      </header>

      <section class="view-port">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
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
  overflow-y: auto; // 防止選單過長

  .menu-item {
    padding: 14px 16px;
    margin-bottom: 4px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;

    .index {
      font-family: "Monaco", monospace;
      margin-right: 8px;
      font-size: 0.8rem;
      opacity: 0.5;
      width: 20px;
    }

    .icon-span {
      margin-right: 10px;
      font-size: 1.1rem;
    }

    .label {
      font-size: 0.95rem;
      letter-spacing: 0.5px;
    }

    &:hover {
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-main);
    }

    &.active {
      background: rgba(56, 189, 248, 0.1);
      color: var(--accent-blue);
      box-shadow: inset 3px 0 0 var(--accent-blue);
      font-weight: 500;
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
