<script setup lang="ts">
defineProps({
  show: Boolean,
  title: { type: String, default: "確認操作" },
  message: { type: String, default: "" },
  confirmText: { type: String, default: "確認刪除" },
  cancelText: { type: String, default: "取消" },
  danger: { type: Boolean, default: true },
});
const emit = defineEmits(["confirm", "cancel"]);
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="show" class="confirm-overlay" @click.self="emit('cancel')">
        <div class="confirm-modal">
          <div class="confirm-icon" :class="danger ? 'danger' : 'info'">
            <svg v-if="danger" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 class="confirm-title">{{ title }}</h3>
          <p class="confirm-message">{{ message }}</p>
          <div class="confirm-actions">
            <button class="btn-cancel" @click="emit('cancel')">{{ cancelText }}</button>
            <button class="btn-confirm" :class="danger ? 'danger' : 'primary'" @click="emit('confirm')">{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  backdrop-filter: blur(4px);
  padding: 16px;
}

.confirm-modal {
  background: white;
  border-radius: 20px;
  padding: 32px 28px 24px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.confirm-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;

  &.danger {
    background: #fef2f2;
    color: #ef4444;
  }
  &.info {
    background: #eff6ff;
    color: #3b82f6;
  }
}

.confirm-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}

.confirm-message {
  font-size: 0.9rem;
  color: #64748b;
  margin: 0;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: 8px;

  button {
    flex: 1;
    padding: 12px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-cancel {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #475569;
    &:hover { background: #f1f5f9; }
  }

  .btn-confirm {
    &.danger {
      background: #ef4444;
      color: white;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
      &:hover { background: #dc2626; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(239, 68, 68, 0.35); }
    }
    &.primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      &:hover { transform: translateY(-1px); }
    }
  }
}

.confirm-fade-enter-active, .confirm-fade-leave-active { transition: all 0.2s ease; }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; .confirm-modal { transform: scale(0.92); } }
</style>
