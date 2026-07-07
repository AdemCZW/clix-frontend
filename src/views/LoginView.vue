<script setup lang="ts">
import { reactive, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import { useToast } from "@/composables/useToast";

const router = useRouter();
const userStore = useUserStore();
const { success, error, warning } = useToast();

// P1.7：api.ts 在 401 / refresh 失敗時設這個旗標，這裡接力顯示 toast
// 用 sessionStorage 是因為 api.ts 在 Vue setup context 外無法直接呼 useToast
onMounted(() => {
  try {
    if (sessionStorage.getItem("auth_expired_toast") === "1") {
      warning("登入已過期，請重新登入");
      sessionStorage.removeItem("auth_expired_toast");
    }
  } catch {
    // 隱私模式可能擋下 sessionStorage — 靜默忽略
  }
});

const loginForm = reactive({
  username: "",
  password: "",
  remember: true,
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
  <div class="login-page">
    <!-- 幾何 SVG 背景 -->
    <svg class="geo-bg" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
      <!-- 綠色底 -->
      <rect width="1000" height="700" fill="#167A67"/>
      <!-- 右側黃色色塊（含右下小綠角） -->
      <polygon points="600,0 1000,0 1000,595 880,700 500,700 300,210" fill="#E0A800"/>
      <!-- 左下黃色三角 -->
      <polygon points="0,350 0,700 500,700" fill="#E0A800"/>
    </svg>

    <!-- 內容層 -->
    <div class="login-content">
      <div class="login-hero">
        <h1 class="hero-title">一鍵啟動<br/>開啟您的全方位活動管理</h1>
        <p class="hero-desc">專業的自動化流程管理，從建立到售票，助您輕鬆應對每一場挑戰</p>
      </div>

      <div class="login-card">
        <div class="card-logo">
          <img src="/clix-logo.svg" alt="CLIX" class="clix-logo" />
        </div>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label class="form-label">帳號</label>
            <input
              v-model="loginForm.username"
              type="text"
              class="form-input"
              required
              :disabled="loading"
            />
          </div>

          <div class="form-group">
            <label class="form-label">密碼</label>
            <input
              v-model="loginForm.password"
              type="password"
              class="form-input"
              required
              :disabled="loading"
            />
          </div>

          <label class="remember-row">
            <input type="checkbox" v-model="loginForm.remember" class="remember-check" />
            <span>記住我</span>
          </label>

          <button type="submit" class="btn-login" :disabled="loading">
            <span v-if="!loading">登入</span>
            <span v-else class="loading-text">
              <span class="spinner"></span>
              登入中...
            </span>
          </button>

          <p class="signup-hint">還沒有帳號嗎？<a href="#">去問 Shawn</a></p>
        </form>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ─── 幾何背景 ─── */
.geo-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

/* ─── 內容層 ─── */
.login-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 60px;
  width: 100%;
  max-width: 1200px;
  padding: 60px;
}

/* ─── 左側文案 ─── */
.login-hero {
  flex: 1;
  max-width: 540px;
}

.hero-title {
  font-size: 3rem;
  font-weight: 900;
  color: #fff;
  line-height: 1.3;
  margin: 0 0 24px;
  letter-spacing: -0.01em;
}

.hero-desc {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.7;
  margin: 0;
  max-width: 460px;
  font-weight: 500;
}

/* ─── 右側登入卡 ─── */
.login-card {
  width: 380px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 20px;
  padding: 40px 36px 32px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
  animation: cardIn 0.5s ease-out;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.card-logo {
  text-align: center;
  margin-bottom: 32px;
}

.clix-logo {
  height: 48px;
  width: auto;
}

/* ─── 表單 ─── */
.login-form {
  display: flex;
  flex-direction: column;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 0.92rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95rem;
  color: #0f172a;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(22, 122, 103, 0.12);
  }

  &:disabled { opacity: 0.6; cursor: not-allowed; }
}

/* 記住我 */
.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
  cursor: pointer;
  font-size: 0.92rem;
  color: #334155;
  font-weight: 500;
  user-select: none;
}

.remember-check {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

/* 登入按鈕 */
.btn-login {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 999px;
  background: #1e293b;
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;

  &:hover:not(:disabled) { background: #0f172a; }
  &:active:not(:disabled) { transform: scale(0.99); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}

.loading-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  letter-spacing: 0.05em;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* 底部提示 */
.signup-hint {
  text-align: center;
  font-size: 0.82rem;
  color: #475569;
  margin: 14px 0 0;
  font-weight: 500;

  a {
    color: #475569;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  a:hover { color: var(--accent); }
}

/* ─── RWD ─── */
@media (max-width: 900px) {
  .login-content {
    flex-direction: column;
    gap: 32px;
    padding: 60px 24px 40px;
  }

  .login-hero {
    text-align: center;
    max-width: 100%;
  }

  .hero-title { font-size: 1.9rem; }
  .hero-desc { max-width: 100%; margin: 0 auto; font-size: 0.9rem; }

  .login-card {
    width: 100%;
    max-width: 400px;
  }
}

@media (max-width: 480px) {
  .login-content {
    gap: 24px;
    padding: 48px 16px 32px;
  }

  .hero-title { font-size: 1.55rem; margin-bottom: 12px; }
  .hero-desc { font-size: 0.82rem; line-height: 1.6; }

  .login-card {
    padding: 28px 20px 24px;
    border-radius: 16px;
  }

  .card-logo { margin-bottom: 24px; }
  .clix-logo { height: 38px; }

  .form-group { margin-bottom: 16px; }
  .form-label { font-size: 0.86rem; margin-bottom: 6px; }
  .form-input { padding: 11px 12px; font-size: 0.92rem; }
  .remember-row { margin-bottom: 22px; font-size: 0.86rem; }
  .btn-login { padding: 13px; font-size: 0.95rem; letter-spacing: 0.25em; }
  .signup-hint { font-size: 0.78rem; margin-top: 14px; }
}
</style>
