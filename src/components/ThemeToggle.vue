<template>
  <button class="theme-toggle" @click="toggle" :title="theme === 'light' ? '切換深色模式' : '切換淺色模式'">
    <Transition name="icon-flip" mode="out-in">
      <!-- 太陽（亮色模式） -->
      <svg v-if="theme === 'light'" key="sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <!-- 月亮（深色模式） -->
      <svg v-else key="moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </Transition>
  </button>
</template>

<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';
const { theme, toggle } = useTheme();
</script>

<style scoped>
.theme-toggle {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  background: transparent;
  color: var(--text-muted);
}

.theme-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.theme-toggle:active {
  transform: scale(0.9);
}

.icon-flip-enter-active, .icon-flip-leave-active {
  transition: all 0.25s ease;
}
.icon-flip-enter-from {
  opacity: 0;
  transform: rotate(-90deg) scale(0.5);
}
.icon-flip-leave-to {
  opacity: 0;
  transform: rotate(90deg) scale(0.5);
}
</style>
