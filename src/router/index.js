import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = createRouter({
    history: createWebHashHistory(
        import.meta.env.BASE_URL),
    routes: [{
            path: '/',
            redirect: '/login'
        },
        {
            path: '/login',
            name: 'login',
            component: () =>
                import ('../views/LoginView.vue'),
            meta: { requiresAuth: false }
        },
        {
            path: '/admin',
            component: () =>
                import ('../components/layout/MainLayout.vue'),
            redirect: '/admin/dashboard',
            meta: { requiresAuth: true },
            children: [
                // ===== 第一層：主要功能 =====
                {
                    path: 'dashboard',
                    name: 'Dashboard',
                    component: () =>
                        import ('../views/Dashboard/Overview.vue')
                },
                {
                    path: 'events',
                    name: 'Events',
                    component: () =>
                        import ('../views/Events/List.vue')
                },
                {
                    path: 'account',
                    name: 'Account',
                    component: () =>
                        import ('../views/Account/Permissions.vue')
                },
                {
                    path: 'all-participants',
                    name: 'AllParticipants',
                    component: () =>
                        import ('../views/AllParticipants/List.vue')
                },
                // ===== 第二層：活動管理功能 =====
                {
                    path: 'registration-setting',
                    name: 'RegistrationSetting',
                    component: () =>
                        import ('../views/Registration/Setting.vue')
                },
                {
                    path: 'guests',
                    name: 'Guests',
                    component: () =>
                        import ('../views/Guests/List.vue')
                },
                {
                    path: 'seating-plan',
                    name: 'SeatingPlan',
                    component: () =>
                        import ('../views/Guests/SeatManager.vue')
                },
                {
                    path: 'form-fields',
                    name: 'FormFields',
                    component: () =>
                        import ('../views/Fields/Config.vue')
                },
                {
                    path: 'notifications',
                    name: 'Notifications',
                    component: () =>
                        import ('../views/Notifications/EmailEditor.vue')
                },
                {
                    path: 'participants',
                    name: 'Participants',
                    component: () =>
                        import ('../views/Participants/List.vue')
                },
                {
                    path: 'checkin-history',
                    name: 'CheckInHistory',
                    component: () =>
                        import ('../views/CheckIn/History.vue')
                },
                {
                    path: 'badge-printing',
                    name: 'BadgePrinting',
                    component: () =>
                        import ('../views/Badges/Printer.vue')
                },
                {
                    path: 'lottery-winners',
                    name: 'LotteryWinners',
                    component: () =>
                        import ('../views/Lottery/Winners.vue')
                },
                {
                    path: 'organizer-info',
                    name: 'OrganizerInfo',
                    component: () =>
                        import ('../views/Organizer/CompanyInfo.vue')
                },
                {
                    path: 'ai-service',
                    name: 'AIService',
                    component: () =>
                        import ('../views/AI-Service/BotSetting.vue')
                }
            ]
        },
        // ===== 手機端：報到掃描器 =====
        {
            path: '/mobile/checkin',
            name: 'MobileScanner',
            component: () =>
                import ('../views/CheckIn/MobileScanner.vue'),
            meta: { requiresAuth: true }
        },
        // ===== 公開報名頁面（不需登入）=====
        {
            path: '/r/:shortLink',
            name: 'PublicRegister',
            component: () =>
                import ('../views/Registration/PublicPage.vue'),
            meta: { requiresAuth: false }
        }
    ]
})

// 路由守衛
router.beforeEach((to, from, next) => {
    const userStore = useUserStore();

    // 檢查是否需要身份驗證
    if (to.meta.requiresAuth) {
        // 檢查是否已登入
        const isAuth = userStore.checkAuth();
        if (!isAuth) {
            // 未登入，重定向到登入頁
            next('/login');
        } else {
            next();
        }
    } else {
        // 不需要驗證的頁面（如登入頁）
        if (to.path === '/login' && userStore.isAuthenticated) {
            // 已登入用戶訪問登入頁，重定向到後台
            next('/admin/dashboard');
        } else {
            next();
        }
    }
});

export default router
