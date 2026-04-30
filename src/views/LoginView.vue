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
    <!-- 幾何背景 -->
    <div class="geo-bg">
      <div class="geo-base"></div>
      <div class="geo-green-left"></div>
      <div class="geo-green-center"></div>
      <div class="geo-gold-right"></div>
      <div class="geo-gold-top"></div>
      <div class="geo-dark-bottom"></div>
    </div>

    <!-- 內容層 -->
    <div class="login-content">
      <!-- 左側文案 -->
      <div class="login-hero">
        <h1 class="hero-title">一鍵啟動<br/>開啟您的全方位活動管理</h1>
        <p class="hero-desc">專業的自動化流程管理，從建立到售票，助您輕鬆應對每一場挑戰</p>
      </div>

      <!-- 右側登入卡 -->
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
            <span v-if="!loading">登 入</span>
            <span v-else class="loading-text">
              <span class="spinner"></span>
              登入中...
            </span>
          </button>

          <p class="signup-hint">還沒有帳號嗎？去問 Shawn</p>
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
  z-index: 0;
}

.geo-base {
  position: absolute;
  inset: 0;
  background: #4a7c6f;
}

/* 左側深綠三角 */
.geo-green-left {
  position: absolute;
  top: 0;
  left: 0;
  width: 55%;
  height: 100%;
  background: #3d6b5e;
  clip-path: polygon(0 0, 100% 0, 60% 100%, 0 100%);
}

/* 中央綠色三角（交疊） */
.geo-green-center {
  position: absolute;
  top: 0;
  left: 15%;
  width: 50%;
  height: 100%;
  background: #2f5a4e;
  clip-path: polygon(30% 0, 100% 0, 50% 100%, 0 100%);
}

/* 右側金色三角 */
.geo-gold-right {
  position: absolute;
  top: 0;
  right: 0;
  width: 50%;
  height: 100%;
  background: #d4a843;
  clip-path: polygon(40% 0, 100% 0, 100% 100%, 10% 100%);
}

/* 右上角較深的金色 */
.geo-gold-top {
  position: absolute;
  top: 0;
  right: 0;
  width: 35%;
  height: 60%;
  background: #c49a38;
  clip-path: polygon(30% 0, 100% 0, 100% 100%);
}

/* 底部暗色三角 */
.geo-dark-bottom {
  position: absolute;
  bottom: 0;
  left: 20%;
  width: 60%;
  height: 40%;
  background: #2a4f44;
  clip-path: polygon(0 100%, 50% 20%, 100% 100%);
  opacity: 0.4;
}

/* ─── 內容層 ─── */
.login-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 80px;
  width: 100%;
  max-width: 1100px;
  padding: 40px;
}

/* ─── 左側文案 ─── */
.login-hero {
  flex: 1;
  max-width: 480px;
}

.hero-title {
  font-size: 2.8rem;
  font-weight: 900;
  color: #fff;
  line-height: 1.3;
  margin: 0 0 20px;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.hero-desc {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.7;
  margin: 0;
  max-width: 380px;
}

/* ─── 右側登入卡 ─── */
.login-card {
  width: 400px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 16px;
  padding: 40px 36px 32px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
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
  height: 44px;
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
  font-size: 0.88rem;
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

  &::placeholder { color: #94a3b8; }

  &:focus {
    outline: none;
    border-color: #167A67;
    box-shadow: 0 0 0 3px rgba(22, 122, 103, 0.1);
  }

  &:disabled { opacity: 0.6; cursor: not-allowed; }
}

/* 記住我 */
.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  cursor: pointer;
  font-size: 0.88rem;
  color: #334155;
  font-weight: 500;
  user-select: none;
}

.remember-check {
  width: 18px;
  height: 18px;
  accent-color: #167A67;
  cursor: pointer;
}

/* 登入按鈕 */
.btn-login {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 8px;
  background: #1e293b;
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.15em;
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
  color: #64748b;
  margin: 16px 0 0;

  a { color: #167A67; font-weight: 600; text-decoration: none; }
  a:hover { text-decoration: underline; }
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

  .hero-title { font-size: 1.8rem; }
  .hero-desc { max-width: 100%; margin: 0 auto; font-size: 0.9rem; }

  .login-card {
    width: 100%;
    max-width: 400px;
  }

  /* 手機版背景微調 — 金色區域縮小避免壓過文字 */
  .geo-gold-right { clip-path: polygon(55% 0, 100% 0, 100% 100%, 25% 100%); }
  .geo-gold-top { width: 40%; height: 50%; }
}

@media (max-width: 480px) {
  .login-content {
    gap: 24px;
    padding: 48px 16px 32px;
  }

  .login-hero { margin-bottom: 0; }
  .hero-title { font-size: 1.5rem; margin-bottom: 12px; }
  .hero-desc { font-size: 0.82rem; line-height: 1.6; }

  .login-card {
    padding: 28px 20px 24px;
    border-radius: 14px;
    max-width: 100%;
  }

  .card-logo { margin-bottom: 24px; }
  .clix-logo { height: 36px; }

  .form-group { margin-bottom: 16px; }
  .form-label { font-size: 0.82rem; margin-bottom: 6px; }
  .form-input { padding: 11px 12px; font-size: 0.9rem; }
  .remember-row { margin-bottom: 20px; font-size: 0.82rem; }
  .btn-login { padding: 13px; font-size: 0.95rem; }
  .signup-hint { font-size: 0.78rem; margin-top: 14px; }
}
</style>
