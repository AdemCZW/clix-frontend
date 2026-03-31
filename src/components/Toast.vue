<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <div v-if="show" class="toast-container" :class="type">
        <div class="toast-content">
          <div class="toast-icon">
            <span v-if="type === 'success'">✓</span>
            <span v-else-if="type === 'error'">✕</span>
            <span v-else-if="type === 'warning'">⚠</span>
            <span v-else>ℹ</span>
          </div>
          <div class="toast-message">{{ message }}</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps({
  message: {
    type: String,
    default: "",
  },
  type: {
    type: String,
    default: "info", // success, error, warning, info
    validator: (value: string) => ["success", "error", "warning", "info"].includes(value),
  },
  duration: {
    type: Number,
    default: 3000,
  },
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

const show = ref(props.modelValue);

watch(
  () => props.modelValue,
  (newVal) => {
    show.value = newVal;
    if (newVal) {
      setTimeout(() => {
        show.value = false;
        emit("update:modelValue", false);
      }, props.duration);
    }
  },
);

watch(show, (newVal) => {
  if (!newVal) {
    emit("update:modelValue", false);
  }
});
</script>

<style scoped lang="scss">
.toast-container {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  min-width: 320px;
  max-width: 500px;
  pointer-events: none;
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

// Success 样式
.toast-container.success {
  .toast-content {
    border-left-color: #10b981;
  }

  .toast-icon {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }
}

// Error 样式
.toast-container.error {
  .toast-content {
    border-left-color: #ef4444;
  }

  .toast-icon {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }
}

// Warning 样式
.toast-container.warning {
  .toast-content {
    border-left-color: #f59e0b;
  }

  .toast-icon {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }
}

// Info 样式
.toast-container.info {
  .toast-content {
    border-left-color: #667eea;
  }

  .toast-icon {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }
}

// 动画
.toast-fade-enter-active {
  animation: toast-slide-down 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-fade-leave-active {
  animation: toast-fade-out 0.3s ease-out;
}

@keyframes toast-slide-down {
  0% {
    opacity: 0;
    transform: translate(-50%, -100%);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

@keyframes toast-fade-out {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
