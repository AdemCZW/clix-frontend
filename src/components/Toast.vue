<template>
  <Teleport to="body">
    <TransitionGroup name="toast-fade" tag="div" class="toast-stack">
      <div
        v-for="toast in queue"
        :key="toast.id"
        class="toast-container"
        :class="toast.type"
        @click="dismiss(toast.id)"
      >
        <div class="toast-content">
          <div class="toast-icon">
            <span v-if="toast.type === 'success'">✓</span>
            <span v-else-if="toast.type === 'error'">✕</span>
            <span v-else-if="toast.type === 'warning'">⚠</span>
            <span v-else>ℹ</span>
          </div>
          <div class="toast-message">{{ toast.message }}</div>
        </div>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from "@/composables/useToast";

const { queue, dismiss } = useToast();
</script>

<style scoped lang="scss">
.toast-stack {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.toast-container {
  min-width: 320px;
  max-width: 500px;
  pointer-events: auto;
  cursor: pointer;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  border-left: 4px solid;
  backdrop-filter: blur(10px);
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 16px;
  font-weight: bold;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-main);
  line-height: 1.5;
}

// Success
.toast-container.success {
  .toast-content { border-left-color: #10b981; }
  .toast-icon { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; }
}

// Error
.toast-container.error {
  .toast-content { border-left-color: var(--danger); }
  .toast-icon { background: linear-gradient(135deg, var(--danger) 0%, #dc2626 100%); color: white; }
}

// Warning
.toast-container.warning {
  .toast-content { border-left-color: #f59e0b; }
  .toast-icon { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
}

// Info
.toast-container.info {
  .toast-content { border-left-color: var(--accent); }
  .toast-icon { background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%); color: white; }
}

// TransitionGroup 動畫
.toast-fade-enter-active {
  animation: toast-slide-down 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-fade-leave-active {
  animation: toast-fade-out 0.3s ease-out;
  position: absolute;
}

.toast-fade-move {
  transition: transform 0.3s ease;
}

@keyframes toast-slide-down {
  0% { opacity: 0; transform: translateY(-20px) scale(0.95); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes toast-fade-out {
  0% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-10px) scale(0.95); }
}
</style>
