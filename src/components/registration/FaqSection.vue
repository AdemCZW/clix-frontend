<script setup>
defineProps({
  faqs: {
    type: Array,
    default: () => [],
  },
  openIndex: {
    type: Number,
    default: null,
  },
})

const emit = defineEmits(['toggle'])

const toggleFaq = (index) => emit('toggle', index)
</script>

<template>
  <div v-if="faqs.length" class="faq-section">
    <h2 class="section-heading">常見問答 (FAQ)</h2>
    <div v-for="(f, i) in faqs" :key="i" class="faq-item" :class="{ open: openIndex === i }">
      <button type="button" class="faq-q" @click="toggleFaq(i)">
        <span class="faq-bar"></span>
        <span class="faq-text">{{ f.question }}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="faq-arrow"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div v-if="openIndex === i" class="faq-a">{{ f.answer }}</div>
    </div>
  </div>
</template>

<style scoped>
.faq-section { margin: 48px 0 0; }

.section-heading {
  font-size: 1.3rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 16px;
}

.faq-item {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 8px;
  overflow: hidden;
  background: #fafaf8;
}

.faq-q {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: .9rem;
  font-weight: 600;
  color: #0f172a;
}

.faq-bar {
  width: 3px;
  height: 18px;
  background: #337168;
  border-radius: 2px;
  flex-shrink: 0;
}

.faq-text { flex: 1; }

.faq-arrow {
  flex-shrink: 0;
  transition: transform .2s;
  color: #94a3b8;
}

.faq-item.open .faq-arrow { transform: rotate(180deg); }

.faq-a {
  padding: 0 16px 16px 29px;
  font-size: .88rem;
  color: #475569;
  line-height: 1.7;
}
</style>