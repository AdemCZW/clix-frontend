<template>
  <div class="filter-bar">
    <div class="search-box">
      <input
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
        type="text"
        :placeholder="placeholder"
        class="search-input"
      />
    </div>
    <div v-if="$slots.default" class="filter-controls">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "搜尋..." },
});

defineEmits(["update:modelValue"]);
</script>

<style lang="scss" scoped>
.filter-bar {
  background: white;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #e5e7eb;
  display: flex;
  gap: 16px;
  align-items: center;
}

.search-box {
  flex: 1;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: all 0.3s;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
}

.filter-controls {
  display: flex;
  gap: 12px;
}

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .filter-controls {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
