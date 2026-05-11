<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "@/stores/user";
import { useEventsStore } from "@/stores/events";
import { useToast } from "@/composables/useToast";
import { useEventSwitcher } from "@/composables/useEventSwitcher";
import OnboardingModal from "@/components/onboarding/OnboardingModal.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const eventsStore = useEventsStore();
const { success } = useToast();
const { switchEvent } = useEventSwitcher();

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

// SVG icon paths (Lucide style)
const icons = {
  dashboard: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  badge: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};

const mainMenuItems = computed(() => [
  { id: 1, name: "主辦中心", icon: icons.dashboard, path: "/admin/dashboard" },
  { id: 2, name: "總人員名單", icon: icons.users, path: "/admin/all-participants" },
  { id: 3, name: "活動列表", icon: icons.calendar, path: "/admin/events" },
  ...(userStore.isSuperAdmin ? [{ id: 4, name: "帳戶權限", icon: icons.lock, path: "/admin/account" }] : []),
]);

const eventMenuItems = [
  { id: 1, name: "報名頁面設定", icon: icons.settings, path: "/admin/registration-setting" },
  { id: 6, name: "參與者資訊", icon: icons.user, path: "/admin/participants" },
  { id: 3, name: "座次劃位管理", icon: icons.grid, path: "/admin/seating-plan" },
  { id: 12, name: "會場桌位佈局 (beta)", icon: icons.grid, path: "/admin/venue-map" },
  { id: 4, name: "報名表欄位", icon: icons.list, path: "/admin/form-fields" },
  { id: 5, name: "通知信設定", icon: icons.mail, path: "/admin/notifications" },
  { id: 7, name: "現場報到紀錄", icon: icons.clipboard, path: "/admin/checkin-history" },
  { id: 8, name: "識別證列印", icon: icons.badge, path: "/admin/badge-printing" },
  { id: 9, name: "中獎名單管理", icon: icons.award, path: "/admin/lottery-winners" },
  { id: 10, name: "主辦單位資訊", icon: icons.building, path: "/admin/organizer-info" },
  { id: 11, name: "AI客服設定", icon: icons.bot, path: "/admin/ai-service" },
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
  switchEvent(data.event);
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
  switchEvent(event);
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
        <svg class="brand-logo-img" viewBox="636 180 167 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="clix">
          <path d="M667.166 195.01C667.166 189.444 671.706 184.918 677.289 184.918H751.521C757.104 184.918 761.644 189.444 761.644 195.01V200.906H766.577V195.01C766.577 186.721 759.835 180 751.521 180H677.289C668.975 180 662.233 186.721 662.233 195.01V200.906H667.166V195.01Z" fill="#fff"/>
          <path d="M658.952 274.486C650.133 274.486 636 270.702 636 248.485C636 226.267 650.133 222.484 658.952 222.484C666.066 222.484 671.566 224.848 675.738 229.007L665.209 239.503C663.219 237.518 661.51 236.479 658.952 236.479C656.866 236.479 655.443 237.139 654.114 238.463C652.31 240.357 651.552 243.666 651.552 248.485C651.552 253.304 652.31 256.617 654.114 258.506C655.443 259.831 656.862 260.491 658.952 260.491C661.514 260.491 663.219 259.451 665.209 257.467L675.738 267.963C671.566 272.122 666.066 274.486 658.952 274.486Z" fill="#167A67"/>
          <path d="M699.377 273.916C688.091 273.916 683.539 265.879 683.539 258.882V206.595H699.091V257.747C699.091 259.732 700.134 260.866 702.22 260.866H707.625V273.912H699.373L699.377 273.916Z" fill="#167A67"/>
          <path d="M717.723 217.85V206.03H733.275V217.85H717.723ZM717.723 273.916V225.034H733.275V273.916H717.723Z" fill="#167A67"/>
          <path d="M773.749 273.916L765.973 261.056L758.387 273.916H739.702L757.436 247.915L742.947 224.831L758.499 225.817L765.973 235.344L774.424 224.831L787.878 224.464L774.701 247.92L792.435 273.921H773.749V273.916Z" fill="#167A67"/>
          <path d="M740.368 223.049L765.973 261.056L803 206.133H783.098L765.973 235.34L759.049 223.049H740.368Z" fill="#E0A800"/>
          <path d="M765.973 261.056L774.697 247.915L778.04 252.817L765.973 261.056Z" fill="#167A67"/>
          <path d="M761.644 284.99C761.644 290.556 757.104 295.082 751.521 295.082H677.289C671.706 295.082 667.166 290.556 667.166 284.99V279.094H662.233V284.99C662.233 293.279 668.975 300 677.289 300H751.521C759.835 300 766.577 293.279 766.577 284.99V279.094H761.644V284.99Z" fill="#fff"/>
        </svg>
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
            <svg class="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="item.icon"></svg>
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
            <svg class="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="item.icon"></svg>
            <span class="menu-label">{{ item.name }}</span>
          </div>
        </div>
      </nav>

      <div class="sidebar-footer">
        <button class="logout-btn" @click="handleLogout">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="icons.logout"></svg>
          登出
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

        <div class="header-divider"></div>

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

        <!-- 通知鈴鐺 + 使用者區域 -->
        <div class="header-user" v-if="userStore.user">
          <button class="notify-btn" aria-label="通知">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <span v-if="userStore.isSuperAdmin" class="role-badge">Super Admin</span>
          <div class="user-avatar">{{ (userStore.user.username || userStore.user.email || '?')[0].toUpperCase() }}</div>
          <ThemeToggle />
        </div>
      </header>

      <!-- 頁面內容 -->
      <section class="view-port">
        <router-view v-slot="{ Component }" :key="route.fullPath">
          <Transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </Transition>
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
.admin-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg-primary);
}

/* ===== SIDEBAR (深色) ===== */
.sidebar {
  width: 240px;
  background: #2a2d33;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  color: #d4d4d8;
}

.sidebar-header {
  padding: 18px 20px;
  display: flex;
  align-items: center;
  height: 64px;
  box-sizing: border-box;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  .brand-logo-img {
    height: 30px;
    width: auto;
    display: block;
  }
}

.menu {
  flex: 1;
  padding: 16px 16px 0;
  overflow-y: auto;
}

.menu-section {
  margin-bottom: 4px;

  & + .menu-section {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin-top: 12px;
    padding-top: 12px;
  }
}

.section-divider {
  padding: 6px 16px 14px;
  display: flex;
  align-items: center;

  .divider-text {
    font-size: 0.86rem;
    font-weight: 700;
    color: #a0a4ad;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.menu-item {
  padding: 11px 14px;
  margin-bottom: 2px;
  border-radius: 8px;
  cursor: pointer;
  color: #c4c7cf;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.92rem;
  font-weight: 500;

  .menu-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    color: #9ba0a8;
  }

  .menu-label {
    flex: 1;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;

    .menu-icon { color: #c4c7cf; }
  }

  &.active {
    background: #3b3f47;
    color: #fff;
    font-weight: 600;

    .menu-icon { color: #fff; }
  }
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);

  .logout-btn {
    width: 100%;
    padding: 10px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #9ba0a8;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s;

    &:hover {
      border-color: rgba(248, 113, 113, 0.5);
      color: #fca5a5;
      background: rgba(239, 68, 68, 0.1);
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
  background: #2a2d33;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-divider {
  width: 1px;
  height: 28px;
  background: rgba(255, 255, 255, 0.15);
  margin-right: 4px;
}

.event-switcher {
  position: relative;
}

.event-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: #383a40;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 220px;

  &:hover {
    border-color: rgba(255, 255, 255, 0.2);
    background: #3f4248;
  }

  .chip-dot {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    flex-shrink: 0;
  }

  .chip-name {
    font-size: 0.92rem;
    font-weight: 600;
    color: #fff;
    flex: 1;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-arrow {
    color: #c4c7cf;
    transition: transform 0.2s;
    flex-shrink: 0;
    &.flipped { transform: rotate(180deg); }
  }
}

.event-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 240px;
  background: #383a40;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  padding: 6px;
  max-height: 300px;
  overflow-y: auto;

  .dropdown-item {
    padding: 10px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.88rem;
    color: #d4d4d8;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background 0.15s;

    &:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
    &.current { background: #167A67; color: #fff; font-weight: 600; }
    .check-mark { color: #fff; font-weight: 700; }
  }
}

.dropdown-fade-enter-active, .dropdown-fade-leave-active { transition: all 0.2s ease; }
.dropdown-fade-enter-from, .dropdown-fade-leave-to { opacity: 0; transform: translateY(-6px); }

.header-spacer { flex: 1; }

.header-search {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 8px;
  background: #383a40;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 8px 14px;
  min-width: 280px;
  transition: all 0.2s;

  &:focus-within {
    border-color: rgba(255, 255, 255, 0.25);
  }

  svg { stroke: #9ba0a8 !important; }

  input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 0.88rem;
    color: #fff;
    width: 100%;
    &::placeholder { color: #9ba0a8; }
  }
}

.notify-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  transition: background 0.15s;
  color: #c4c7cf;

  svg { stroke: #c4c7cf; }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    svg { stroke: #fff; }
  }
}

.header-user {
  display: flex;
  align-items: center;
  gap: 10px;

  .role-badge {
    font-size: 0.78rem;
    background: #c8651c;
    color: white;
    padding: 6px 14px;
    border-radius: 999px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #167A67;
    color: white;
    font-weight: 700;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

/* ===== VIEW PORT ===== */
.view-port {
  flex: 1;
  padding: 0;
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
    background: #d4d4d8;
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
    padding: 0;
  }
}

@media (max-width: 480px) {
  .header-search { display: none; }
  .role-badge { display: none; }
}

/* 頁面切換淡入動畫 */
.page-fade-enter-active {
  transition: opacity .2s ease, transform .2s ease;
}
.page-fade-leave-active {
  transition: opacity .15s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-fade-leave-to {
  opacity: 0;
}
</style>
