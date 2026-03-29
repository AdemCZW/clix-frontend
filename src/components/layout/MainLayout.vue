<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "@/stores/user";
import { useEventsStore } from "@/stores/events";
import { useToast } from "@/composables/useToast";
import OnboardingModal from "@/components/onboarding/OnboardingModal.vue";

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const eventsStore = useEventsStore();
const { success } = useToast();

const sidebarOpen = ref(false);
const globalSearch = ref("");

userStore.checkAuth();
if (userStore.user?.id) eventsStore.initFromStorage(userStore.user.id);

onMounted(async () => {
  try {
    await eventsStore.fetchEvents({
      userId: userStore.user?.id,
      isSuperAdmin: userStore.isSuperAdmin,
    });
  } catch { /* silent */ }
});

const showOnboarding = ref(!eventsStore.currentEvent);
const onboardingMode = ref("select");

const mainMenuItems = computed(() => [
  { id: 1, name: "主辦中心", icon: "📊", path: "/admin/dashboard" },
  { id: 2, name: "總人員名單", icon: "👥", path: "/admin/all-participants" },
  { id: 3, name: "活動列表", icon: "📅", path: "/admin/events" },
  ...(userStore.isSuperAdmin ? [{ id: 4, name: "帳戶權限", icon: "🔐", path: "/admin/account" }] : []),
]);

const eventMenuItems = [
  { id: 1, name: "報名頁面設定", icon: "⚙️", path: "/admin/registration-setting" },
  { id: 6, name: "參與者資訊", icon: "👤", path: "/admin/participants" },
  { id: 3, name: "座次劃位管理", icon: "💺", path: "/admin/seating-plan" },
  { id: 4, name: "報名表欄位", icon: "📝", path: "/admin/form-fields" },
  { id: 5, name: "通知信設定", icon: "✉️", path: "/admin/notifications" },
  { id: 7, name: "現場報到紀錄", icon: "📋", path: "/admin/checkin-history" },
  { id: 8, name: "識別證列印", icon: "🪪", path: "/admin/badge-printing" },
  { id: 9, name: "中獎名單管理", icon: "🎯", path: "/admin/lottery-winners" },
  { id: 10, name: "主辦單位資訊", icon: "🏢", path: "/admin/organizer-info" },
  { id: 11, name: "AI客服設定", icon: "🤖", path: "/admin/ai-service" },
];

const navigateTo = (path: string) => {
  if (path === "/admin/form-fields" && eventsStore.currentEvent?.id) {
    router.push({ path, query: { eventId: eventsStore.currentEvent.id } });
  } else {
    router.push(path);
  }
  sidebarOpen.value = false;
};

const handleOnboardingComplete = (data: any) => {
  eventsStore.setCurrentEvent(data.event, userStore.user?.id);
  showOnboarding.value = false;
};

const handleOnboardingClose = () => {};

const handleLogout = async () => {
  await userStore.logout();
  success("已成功登出");
  router.push("/login");
};

// 活動切換下拉
const showEventDropdown = ref(false);
const selectEvent = (event: any) => {
  eventsStore.setCurrentEvent(event, userStore.user?.id);
  showEventDropdown.value = false;
};
</script>

<template>
  <div class="admin-layout">
    <!-- 手機版遮罩 -->
    <Transition name="overlay-fade">
      <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>
    </Transition>

    <!-- ===== SIDEBAR ===== -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <div class="logo-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="#6366f1"/>
            <path d="M7 12l3 3 7-7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="brand-name">Dabang</span>
      </div>

      <nav class="menu">
        <!-- 主選單 -->
        <div class="menu-section">
          <div
            v-for="item in mainMenuItems"
            :key="'main-' + item.id"
            class="menu-item"
            :class="{ active: route.path === item.path }"
            @click="navigateTo(item.path)"
          >
            <span class="menu-icon">{{ item.icon }}</span>
            <span class="menu-label">{{ item.name }}</span>
          </div>
        </div>

        <!-- 活動管理選單 -->
        <div class="menu-section" v-if="eventsStore.currentEvent">
          <div class="section-divider">
            <span class="divider-text">{{ eventsStore.currentEvent.name }}</span>
          </div>
          <div
            v-for="item in eventMenuItems"
            :key="'event-' + item.id"
            class="menu-item"
            :class="{ active: route.path === item.path }"
            @click="navigateTo(item.path)"
          >
            <span class="menu-icon">{{ item.icon }}</span>
            <span class="menu-label">{{ item.name }}</span>
          </div>
        </div>
      </nav>

      <div class="sidebar-footer">
        <button class="logout-btn" @click="handleLogout">
          <span>🚪</span> 登出
        </button>
      </div>
    </aside>

    <!-- ===== MAIN CONTENT ===== -->
    <main class="content-area">
      <!-- NAVBAR -->
      <header class="content-header">
        <button class="hamburger-btn" @click="sidebarOpen = !sidebarOpen" aria-label="選單">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>

        <!-- 活動切換器 -->
        <div class="event-switcher" v-if="eventsStore.currentEvent">
          <div class="event-chip" @click="showEventDropdown = !showEventDropdown">
            <div class="chip-dot"></div>
            <span class="chip-name">{{ eventsStore.currentEvent.name }}</span>
            <svg class="chip-arrow" :class="{ flipped: showEventDropdown }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <Transition name="dropdown-fade">
            <div v-if="showEventDropdown" class="event-dropdown">
              <div
                v-for="ev in eventsStore.events"
                :key="ev.id"
                class="dropdown-item"
                :class="{ current: ev.id === eventsStore.currentEvent?.id }"
                @click="selectEvent(ev)"
              >
                {{ ev.name }}
                <span v-if="ev.id === eventsStore.currentEvent?.id" class="check-mark">✓</span>
              </div>
            </div>
          </Transition>
        </div>

        <div class="header-spacer"></div>

        <!-- 搜尋框 -->
        <div class="header-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="globalSearch" type="text" placeholder="搜尋名字、票號、電話..." />
        </div>

        <!-- 使用者區域 -->
        <div class="header-user" v-if="userStore.user">
          <span v-if="userStore.isSuperAdmin" class="role-badge">Super Admin</span>
          <div class="user-avatar">{{ (userStore.user.username || userStore.user.email || '?')[0].toUpperCase() }}</div>
        </div>
      </header>

      <!-- 頁面內容 -->
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
.admin-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: #f0f2f5;
}

/* ===== SIDEBAR ===== */
.sidebar {
  width: 240px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 24px 20px;
  display: flex;
  align-items: center;
  gap: 10px;

  .logo-icon {
    display: flex;
    align-items: center;
  }

  .brand-name {
    font-size: 1.25rem;
    font-weight: 800;
    color: #1f2937;
    letter-spacing: -0.5px;
  }
}

.menu {
  flex: 1;
  padding: 0 12px;
  overflow-y: auto;
}

.menu-section {
  margin-bottom: 8px;
}

.section-divider {
  padding: 16px 12px 8px;
  display: flex;
  align-items: center;

  .divider-text {
    font-size: 0.75rem;
    font-weight: 700;
    color: #6366f1;
    background: #eef2ff;
    padding: 4px 12px;
    border-radius: 12px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.menu-item {
  padding: 10px 12px;
  margin-bottom: 2px;
  border-radius: 10px;
  cursor: pointer;
  color: #64748b;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
  font-weight: 500;

  .menu-icon {
    font-size: 1.1rem;
    width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .menu-label {
    flex: 1;
  }

  &:hover {
    background: #f8fafc;
    color: #334155;
  }

  &.active {
    background: #eef2ff;
    color: #4f46e5;
    font-weight: 600;

    .menu-icon {
      filter: none;
    }
  }
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #f1f5f9;

  .logout-btn {
    width: 100%;
    padding: 10px;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    color: #64748b;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s;

    &:hover {
      border-color: #f87171;
      color: #ef4444;
      background: #fef2f2;
    }
  }
}

/* ===== HEADER / NAVBAR ===== */
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
  align-items: center;
  gap: 16px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.event-switcher {
  position: relative;
}

.event-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 160px;

  &:hover {
    border-color: #cbd5e1;
    background: #f1f5f9;
  }

  .chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
  }

  .chip-name {
    font-size: 0.88rem;
    font-weight: 600;
    color: #1e293b;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-arrow {
    color: #94a3b8;
    transition: transform 0.2s;
    flex-shrink: 0;
    &.flipped { transform: rotate(180deg); }
  }
}

.event-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 220px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  z-index: 100;
  padding: 6px;
  max-height: 300px;
  overflow-y: auto;

  .dropdown-item {
    padding: 10px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.88rem;
    color: #334155;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background 0.15s;

    &:hover { background: #f8fafc; }
    &.current { background: #eef2ff; color: #4f46e5; font-weight: 600; }
    .check-mark { color: #4f46e5; font-weight: 700; }
  }
}

.dropdown-fade-enter-active, .dropdown-fade-leave-active { transition: all 0.2s ease; }
.dropdown-fade-enter-from, .dropdown-fade-leave-to { opacity: 0; transform: translateY(-6px); }

.header-spacer { flex: 1; }

.header-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 14px;
  min-width: 240px;
  transition: all 0.2s;

  &:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 0.88rem;
    color: #1e293b;
    width: 100%;
    &::placeholder { color: #94a3b8; }
  }
}

.header-user {
  display: flex;
  align-items: center;
  gap: 10px;

  .role-badge {
    font-size: 0.72rem;
    background: #ef4444;
    color: white;
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    font-weight: 700;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* ===== VIEW PORT ===== */
.view-port {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background: #f0f2f5;
}

/* ===== HAMBURGER ===== */
.hamburger-btn {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  flex-direction: column;
  gap: 5px;

  .hamburger-line {
    display: block;
    width: 22px;
    height: 2px;
    background: #334155;
    border-radius: 2px;
  }
}

.sidebar-overlay { display: none; }
.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.3s ease; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }

/* ===== MOBILE ===== */
@media (max-width: 768px) {
  .hamburger-btn { display: flex; }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    height: 100vh;
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;

    &.open {
      transform: translateX(0);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
    }
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 999;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(2px);
  }

  .content-header {
    justify-content: space-between;
    padding: 0 16px;
    gap: 8px;
  }

  .header-search {
    min-width: 0;
    flex: 1;
  }

  .event-switcher { display: none; }

  .view-port {
    padding: 16px;
  }
}

@media (max-width: 480px) {
  .header-search { display: none; }
  .role-badge { display: none; }
}
</style>
