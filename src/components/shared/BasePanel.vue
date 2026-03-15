<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="modelValue" class="panel-overlay" @click.self="close">
        <div class="panel" :style="{ width }">
          <div class="panel-header">
            <h3>{{ title }}</h3>
            <button class="btn-close" @click="close">✕</button>
          </div>
          <div class="panel-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="panel-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, required: true },
  title: { type: String, default: "" },
  width: { type: String, default: "480px" },
});

const emit = defineEmits(["update:modelValue"]);
const close = () => emit("update:modelValue", false);
</script>

<style lang="scss" scoped>
.panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: flex-end;
  z-index: 9999;
}

.panel {
  max-width: 90vw;
  height: 100%;
  background: white;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
}

.panel-header {
  padding: 24px 28px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  h3 {
    font-size: 1.2rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
  }

  .btn-close {
    background: transparent;
    border: none;
    font-size: 1.4rem;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;

    &:hover {
      background: #f1f5f9;
      color: #0f172a;
      transform: rotate(90deg);
    }
  }
}

.panel-body {
  padding: 28px;
  flex: 1;
  overflow-y: auto;
}

.panel-footer {
  padding: 20px 28px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.3s ease;
}

.panel-slide-enter-from {
  opacity: 0;

  .panel {
    transform: translateX(100%);
  }
}

.panel-slide-leave-to {
  opacity: 0;

  .panel {
    transform: translateX(100%);
  }
}

.panel-slide-enter-active .panel,
.panel-slide-leave-active .panel {
  transition: transform 0.3s ease;
}
</style>
