<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { useToast } from "@/composables/useToast";

const router = useRouter();
const userStore = useUserStore();
const { success, error } = useToast();

const loginForm = reactive({
  username: "",
  password: "",
});

const loading = ref(false);

const handleLogin = async () => {
  if (!loginForm.username || !loginForm.password) {
    error("請填寫完整的登入資訊");
    return;
  }

  loading.value = true;

  try {
    const result = await userStore.login(loginForm.username, loginForm.password);

    if (result.success) {
      success("登入成功！");
      localStorage.removeItem("current_event");
      const redirect = router.currentRoute.value.query.redirect as string | undefined;
      router.push(redirect || "/admin/dashboard");
    }
  } catch (err: unknown) {
    error((err as Error).message || "登入失敗，請檢查您的帳號密碼");
  } finally {
    loading.value = false;
  }
};

</script>

<template>
  <div class="login-container">
    <!-- 背景裝飾 -->
    <div class="bg-decoration">
      <div class="circle circle-1"></div>
      <div class="circle circle-2"></div>
      <div class="circle circle-3"></div>
    </div>

    <div class="login-wrapper">
      <div class="login-card">
      <div class="card-header">
        <div class="logo">
          <div class="logo-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="12" fill="url(#gradient)" />
              <path
                d="M20 12L28 16V24C28 28 24 30 20 32C16 30 12 28 12 24V16L20 12Z"
                fill="white"
                opacity="0.9"
              />
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="40" y2="40">
                  <stop offset="0%" stop-color="#6366f1" />
                  <stop offset="100%" stop-color="#4f46e5" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 class="system-title">活動報到系統</h1>
          <p class="system-subtitle">Event Check-in System</p>
        </div>
      </div>

      <div class="card-body">
        <form @submit.prevent="handleLogin">
          <div class="form-group">
            <input
              v-model="loginForm.username"
              type="text"
              class="form-input"
              placeholder="請輸入帳號（Email / ST帳號 / 使用者名稱）"
              required
              :disabled="loading"
            />
          </div>

          <div class="form-group">
            <input
              v-model="loginForm.password"
              type="password"
              class="form-input"
              placeholder="請輸入您的密碼"
              required
              :disabled="loading"
            />
          </div>

          <button type="submit" class="btn-login" :disabled="loading">
            <span v-if="!loading">立即登入</span>
            <span v-else class="loading-text">
              <span class="spinner"></span>
              登入中...
            </span>
          </button>
        </form>
      </div>

      <div class="card-footer">
        <p class="footer-text">© 2026 Event System. All rights reserved.</p>
      </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  position: relative;
  overflow: hidden;
  padding: 20px;
}

/* 背景裝飾圓圈 */
.bg-decoration {
  position: absolute;
  width: 100%;
  height: 100%;
  overflow: hidden;
  opacity: 0.1;

  .circle {
    position: absolute;
    border-radius: 50%;
    background: var(--bg-card);
    animation: float 20s infinite ease-in-out;
  }

  .circle-1 {
    width: 300px;
    height: 300px;
    top: -100px;
    left: -100px;
    animation-delay: 0s;
  }

  .circle-2 {
    width: 200px;
    height: 200px;
    bottom: -50px;
    right: -50px;
    animation-delay: 5s;
  }

  .circle-3 {
    width: 150px;
    height: 150px;
    top: 50%;
    right: 10%;
    animation-delay: 10s;
  }
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-30px) scale(1.1);
  }
}

.login-wrapper {
  position: relative;
  z-index: 1;
  animation: slideUp 0.6s ease-out;
}

/* 登入卡片 */
.login-card {
  width: 100%;
  max-width: 460px;
  background: var(--bg-card);
  border-radius: 24px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 卡片頭部 */
.card-header {
  padding: 48px 40px 32px;
  text-align: center;
  background: linear-gradient(180deg, #f8fafc 0%, white 100%);
  border-bottom: 1px solid var(--border-light);
}

.logo {
  .logo-icon {
    margin: 0 auto 20px;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pulse 2s infinite;
  }

  .system-title {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--text-main);
    margin: 0 0 8px 0;
    letter-spacing: -0.02em;
  }

  .system-subtitle {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin: 0;
    font-weight: 500;
    letter-spacing: 0.5px;
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

/* 卡片內容 */
.card-body {
  padding: 40px 40px 32px;
}

.form-group {
  margin-bottom: 24px;

  &:last-of-type {
    margin-bottom: 32px;
  }
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;

  .label-icon {
    font-size: 1rem;
  }
}

.form-input {
  width: 100%;
  padding: 14px 18px;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  font-size: 0.95rem;
  color: var(--text-main);
  background: var(--bg-primary);
  transition: all 0.3s ease;

  &::placeholder {
    color: var(--text-muted);
  }

  &:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-card);
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

/* 登入按鈕 */
.btn-login {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  position: relative;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.5);

    &::before {
      left: 100%;
    }
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }
}

.loading-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 卡片底部 */
.card-footer {
  padding: 20px 40px 32px;
  text-align: center;
  border-top: 1px solid var(--border-light);
}

.footer-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
}

/* 響應式設計 */
@media (max-width: 640px) {
  .login-card {
    max-width: 100%;
  }

  .card-header,
  .card-body,
  .card-footer {
    padding-left: 24px;
    padding-right: 24px;
  }

  .logo .system-title {
    font-size: 1.5rem;
  }
}
</style>
