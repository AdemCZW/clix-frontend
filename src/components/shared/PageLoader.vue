<template>
  <div class="page-loader">
    <div class="loader-ring">
      <div class="ring-outer"></div>
      <div class="ring-inner"></div>
      <div class="ring-dot"></div>
    </div>
    <div class="loader-brand">
      <span v-for="(ch, i) in brandChars" :key="i" class="brand-char" :style="{ animationDelay: `${i * 0.08}s` }">{{ ch }}</span>
    </div>
    <p v-if="text" class="loader-text">{{ text }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ text?: string }>();
const brandChars = 'Dabang'.split('');
</script>

<style scoped>
.page-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 20px;
  gap: 20px;
}

/* 三層環形動畫 */
.loader-ring {
  position: relative;
  width: 56px;
  height: 56px;
}

.ring-outer {
  position: absolute;
  inset: 0;
  border: 3px solid #eef2ff;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.ring-inner {
  position: absolute;
  inset: 8px;
  border: 3px solid #eef2ff;
  border-bottom-color: #a5b4fc;
  border-radius: 50%;
  animation: spin-reverse 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.ring-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  background: #6366f1;
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes spin-reverse {
  to { transform: rotate(-360deg); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.6); opacity: 0.4; }
}

/* 品牌文字逐字淡入 */
.loader-brand {
  display: flex;
  gap: 2px;
}

.brand-char {
  font-size: 1.2rem;
  font-weight: 800;
  color: #6366f1;
  opacity: 0;
  animation: char-in 0.4s ease forwards, char-pulse 2s ease-in-out 0.6s infinite;
}

@keyframes char-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes char-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.loader-text {
  font-size: 0.82rem;
  color: var(--text-muted);
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.5px;
  animation: text-fade 1.5s ease-in-out infinite;
}

@keyframes text-fade {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
