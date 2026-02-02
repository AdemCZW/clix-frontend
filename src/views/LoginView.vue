<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const loginForm = reactive({
  email: "",
  password: "",
});

const handleLogin = () => {
  // 清除當前選擇的活動，強制用戶重新選擇
  localStorage.removeItem("current_event");
  router.push("/admin/registration-setting");
};
</script>

<template>
  <div class="login-container">
    <div class="login-card shadow-soft">
      <div class="logo-area">
        <div class="tech-logo"></div>
        <span class="brand-name">系統建置案</span>
      </div>

      <h1 class="login-title">LOGIN</h1>

      <form @submit.prevent="handleLogin">
        <div class="input-group">
          <label>E-mail</label>
          <input v-model="loginForm.email" type="email" placeholder="請輸入電子信箱" required />
        </div>

        <div class="input-group">
          <label>PASSWORD</label>
          <input v-model="loginForm.password" type="password" placeholder="請輸入密碼" required />
        </div>

        <button type="submit" class="login-btn-rounded">ENTER SYSTEM</button>
      </form>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f8fafc; /* 改為明亮的淺灰色底 */
  background-image: radial-gradient(
    circle at 10% 20%,
    rgba(56, 189, 248, 0.05) 0%,
    transparent 90%
  );
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 50px 40px;
  background: #ffffff; /* 純白背景 */
  border-radius: 24px; /* 卡片也變得圓潤 */
  text-align: center;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

.shadow-soft {
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.05),
    0 8px 10px -6px rgba(0, 0, 0, 0.05);
}

.logo-area {
  margin-bottom: 28px;
  .tech-logo {
    width: 44px;
    height: 44px;
    background: #0ea5e9; /* 更鮮亮的藍色 */
    margin: 0 auto 12px;
    border-radius: 12px; /* Logo 改為圓角矩形 */
  }
  .brand-name {
    color: #64748b;
    font-size: 0.85rem;
    letter-spacing: 3px;
    font-weight: 500;
  }
}

.login-title {
  font-weight: 600;
  letter-spacing: 4px;
  margin-bottom: 40px;
  color: #1e293b;
  font-size: 1.8rem;
}

.input-group {
  text-align: left;
  margin-bottom: 24px;
  label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 8px;
    padding-left: 4px;
  }
  input {
    width: 100%;
    background: #f1f5f9;
    border: 2px solid transparent;
    padding: 14px 18px;
    color: #1e293b;
    border-radius: 14px; /* 欄位也圓潤化 */
    transition: all 0.2s ease;
    &::placeholder {
      color: #cbd5e1;
    }
    &:focus {
      outline: none;
      background: #ffffff;
      border-color: #0ea5e9;
      box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.1);
    }
  }
}

/* 核心修改：圓滑按鈕 */
.login-btn-rounded {
  width: 100%;
  margin-top: 16px;
  padding: 14px;
  background: #0ea5e9;
  color: #ffffff;
  border: none;
  border-radius: 50px; /* 完全圓滑的外觀 */
  font-weight: 600;
  letter-spacing: 1.5px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2);

  &:hover {
    background: #0284c7;
    transform: translateY(-2px);
    box-shadow: 0 6px 15px rgba(14, 165, 233, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
}
</style>
