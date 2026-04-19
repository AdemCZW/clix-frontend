<script setup>
defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  isFull: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['open-form'])

const openForm = () => emit('open-form')
</script>

<template>
  <div class="mobile-sticky-bar">
    <div class="msb-info">
      <div v-for="row in rows" :key="`mobile-${row.key}`" class="msb-row" :class="{ 'msb-addr': row.kind === 'address' }">
        <svg v-if="row.kind === 'date'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <svg v-else-if="row.kind === 'location'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>{{ row.text }}</span>
      </div>
    </div>
    <div class="msb-btns">
      <button class="msb-btn outline">聯絡主辦單位</button>
      <button class="msb-btn primary" @click="openForm" :disabled="isFull">{{ isFull ? '已額滿' : '立即報名' }}</button>
    </div>
  </div>
</template>

<style scoped>
.mobile-sticky-bar { display: none; }

@media (max-width: 768px) {
  .mobile-sticky-bar {
    display: block;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: #fff;
    border-top: 1px solid #e2e8f0;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
  }

  .msb-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .msb-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: .8rem;
    color: #334155;
    line-height: 1.3;
  }

  .msb-row svg {
    flex-shrink: 0;
    color: #337168;
  }

  .msb-addr {
    padding-left: 19px;
    font-size: .75rem;
    color: #94a3b8;
  }

  .msb-btns {
    display: flex;
    gap: 8px;
  }

  .msb-btn {
    flex: 1;
    padding: 12px 0;
    border-radius: 10px;
    font-size: .9rem;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    transition: .15s;
    border: none;
  }

  .msb-btn.outline {
    background: #fff;
    color: #334155;
    border: 1.5px solid #d1d5db;
  }

  .msb-btn.primary {
    background: #337168;
    color: #fff;
  }

  .msb-btn.primary:hover {
    background: #2a5c54;
  }

  .msb-btn:disabled {
    opacity: .5;
    cursor: not-allowed;
  }
}
</style>
