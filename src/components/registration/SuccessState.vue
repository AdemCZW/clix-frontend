<script setup>
import { computed } from 'vue'
import LogoSpinner from '@/components/shared/LogoSpinner.vue'

const props = defineProps({
  participantName: {
    type: String,
    default: '',
  },
  qrCodeUrl: {
    type: String,
    default: '',
  },
  checkInToken: {
    type: String,
    default: '',
  },
  rows: {
    type: Array,
    default: () => [],
  },
  ticketInfo: {
    type: String,
    default: '',
  },
})

const hasQrCode = computed(() => Boolean(props.qrCodeUrl))
</script>

<template>
  <div class="success-screen">
    <div class="logo-wrap success-burst">
      <LogoSpinner :size="80" />
    </div>
    <h2 class="success-title">報名成功！</h2>
    <p class="success-sub">{{ participantName }}，感謝您的報名，期待與您相見！</p>

    <div v-if="hasQrCode" class="qr-card">
      <p class="qr-hint">現場出示此 QR Code 掃描報到</p>
      <div class="qr-img-wrap">
        <img :src="qrCodeUrl" alt="QR Code" />
      </div>
      <p v-if="checkInToken" class="qr-token">{{ checkInToken }}</p>
    </div>

    <div v-if="ticketInfo" class="ticket-time-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>{{ ticketInfo }}</span>
    </div>

    <div v-if="rows.length" class="reminder-box">
      <div v-for="row in rows" :key="`success-${row.key}`" class="reminder-row">
        <span class="r-icon">
          <svg v-if="row.kind === 'date'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <svg v-else-if="row.kind === 'location'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
        </span>
        <span>{{ row.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.success-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px 24px;
  text-align: center;
  background: var(--bg-card);
}

.logo-wrap {
  margin-bottom: 4px;
}

.success-burst { animation: burst 0.5s ease-out; }

@keyframes burst {
  0%   { transform: scale(0.5); opacity: 0; }
  70%  { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.success-title {
  font-size: 2rem;
  font-weight: 900;
  background: linear-gradient(135deg, #337168 0%, #2a5c54 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
}

.success-sub {
  font-size: 1rem;
  color: var(--text-secondary);
  margin: 0;
  max-width: 360px;
}

.qr-card {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: 20px;
  padding: 28px 32px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: 8px 0;
}

.qr-hint {
  font-size: 0.88rem;
  color: var(--text-muted);
  margin: 0;
}

.qr-img-wrap {
  width: 200px;
  height: 200px;
  padding: 12px;
  border: 2px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.qr-img-wrap img {
  width: 100%;
  height: 100%;
  display: block;
}

.qr-token {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-family: monospace;
  letter-spacing: 1.5px;
}

.reminder-box {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 420px;
}

.reminder-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.95rem;
  color: var(--text-secondary);
}

.r-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.ticket-time-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  padding: 12px 20px;
  font-size: 0.9rem;
  color: #92400e;
  width: 100%;
  max-width: 420px;
}

.ticket-time-box svg {
  flex-shrink: 0;
  stroke: #d97706;
}
</style>