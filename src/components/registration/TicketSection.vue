<script setup>
defineProps({
  tickets: {
    type: Array,
    default: () => [],
  },
  getQty: {
    type: Function,
    default: () => 1,
  },
})

const emit = defineEmits(['change-qty'])

const changeQty = (id, delta) => emit('change-qty', id, delta)
</script>

<template>
  <div v-if="tickets.length" class="tickets-section">
    <div v-for="t in tickets" :key="t.id" class="ticket-row" :class="{ 'ticket-highlight': t.name === '永續票' }">
      <div class="ticket-info">
        <div class="ticket-name">{{ t.name }}</div>
        <div class="ticket-desc">{{ t.description }}</div>
      </div>
      <div class="ticket-price">${{ t.price }}</div>
      <div class="ticket-qty">
        <button type="button" @click="changeQty(t.id, -1)">-</button>
        <span>{{ getQty(t.id) }}</span>
        <button type="button" @click="changeQty(t.id, 1)">+</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tickets-section { margin: 32px 0 0; }

.ticket-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 10px;
  background: #fafaf8;
  transition: .15s;
}

.ticket-row:hover { border-color: #337168; }

.ticket-highlight { border-left: 3px solid #337168; }

.ticket-info {
  flex: 1;
  min-width: 0;
}

.ticket-name {
  font-size: .95rem;
  font-weight: 700;
  color: #0f172a;
}

.ticket-desc {
  font-size: .78rem;
  color: #94a3b8;
  margin-top: 2px;
}

.ticket-price {
  font-size: 1.2rem;
  font-weight: 800;
  color: #337168;
  white-space: nowrap;
}

.ticket-qty {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ticket-qty button {
  width: 28px;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 1rem;
  cursor: pointer;
  color: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: .1s;
}

.ticket-qty button:hover { background: #f1f5f9; }

.ticket-qty span {
  font-size: .92rem;
  font-weight: 600;
  min-width: 16px;
  text-align: center;
  color: #0f172a;
}
</style>