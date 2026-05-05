<script setup lang="ts">
import { computed } from 'vue'
import LogoSpinner from '@/components/shared/LogoSpinner.vue'

interface ParticipantLike {
  name?: string
  qr_code_url?: string
  qrCodeUrl?: string
  check_in_token?: string
  checkInToken?: string
  ticket_name?: string
  ticketName?: string
  ticket_number?: string
  ticketNumber?: string
}

interface OrderLike {
  order_number?: string
  buyer_name?: string
  buyer_email?: string
  total_amount?: number
  payment_status?: string
}

interface ReminderRow { key: string; kind?: string; text: string }

const props = defineProps<{
  // 新版（多人）— 推薦使用
  participants?: ParticipantLike[]
  order?: OrderLike | null

  // 舊版單人（向下相容，仍會被前頁傳入）
  participantName?: string
  qrCodeUrl?: string
  checkInToken?: string

  rows?: ReminderRow[]
  ticketInfo?: string
}>()

// 統一資料源：若 props.participants 有資料就用新版，否則 fall back 到舊版單筆
const displayParticipants = computed<ParticipantLike[]>(() => {
  if (props.participants && props.participants.length > 0) return props.participants
  // Fallback：舊單人介面
  if (props.participantName || props.qrCodeUrl) {
    return [{
      name: props.participantName,
      qr_code_url: props.qrCodeUrl,
      check_in_token: props.checkInToken,
    }]
  }
  return []
})

const isMultiAttendee = computed(() => displayParticipants.value.length > 1)
const hasOrder = computed(() => !!(props.order && props.order.order_number))

const getQrUrl = (p: ParticipantLike) => p.qr_code_url || p.qrCodeUrl || ''
const getToken = (p: ParticipantLike) => p.check_in_token || p.checkInToken || ''
const getTicketName = (p: ParticipantLike) => p.ticket_name || p.ticketName || ''
const getTicketNumber = (p: ParticipantLike) => p.ticket_number || p.ticketNumber || ''
</script>

<template>
  <div class="success-screen">
    <div class="logo-wrap success-burst">
      <LogoSpinner :size="80" />
    </div>
    <h2 class="success-title">報名成功！</h2>

    <!-- 訂單資訊（有訂單時顯示）-->
    <div v-if="hasOrder" class="order-summary">
      <p class="order-line">
        <span class="order-label">訂單編號</span>
        <span class="order-value">{{ order!.order_number }}</span>
      </p>
      <p v-if="order!.buyer_name" class="order-line">
        <span class="order-label">訂購人</span>
        <span class="order-value">{{ order!.buyer_name }}</span>
      </p>
      <p v-if="(order!.total_amount ?? 0) > 0" class="order-line">
        <span class="order-label">總金額</span>
        <span class="order-value amount">NT$ {{ order!.total_amount }}</span>
      </p>
      <p class="order-hint">
        感謝您的報名{{ isMultiAttendee ? `，本訂單共 ${displayParticipants.length} 位參加人` : '' }}！
      </p>
    </div>
    <p v-else class="success-sub">
      {{ displayParticipants[0]?.name || '參加人' }}，感謝您的報名，期待與您相見！
    </p>

    <!-- 票券有效時間（活動共用，所以放在訂單 / 參加人之間）-->
    <div v-if="ticketInfo" class="ticket-time-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>{{ ticketInfo }}</span>
    </div>

    <!-- 參加人 QR 卡片清單 -->
    <div v-if="displayParticipants.length" class="qr-list" :class="{ 'multi': isMultiAttendee }">
      <div
        v-for="(p, idx) in displayParticipants"
        :key="getToken(p) || `p_${idx}`"
        class="qr-card"
      >
        <div class="qr-card-head">
          <span class="qr-card-idx">{{ isMultiAttendee ? `參加人 ${idx + 1}` : '報到 QR Code' }}</span>
          <span v-if="getTicketName(p)" class="qr-card-ticket">{{ getTicketName(p) }}</span>
        </div>

        <div v-if="p.name" class="qr-card-name">{{ p.name }}</div>

        <div v-if="getQrUrl(p)" class="qr-img-wrap">
          <img :src="getQrUrl(p)" alt="QR Code" />
        </div>

        <p class="qr-hint">現場出示此 QR Code 掃描報到</p>

        <p v-if="getTicketNumber(p)" class="qr-ticket-no">票號 {{ getTicketNumber(p) }}</p>
        <p v-else-if="getToken(p)" class="qr-token">{{ getToken(p) }}</p>
      </div>
    </div>

    <!-- 活動提醒（時間 / 地點）-->
    <div v-if="rows && rows.length" class="reminder-box">
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

.logo-wrap { margin-bottom: 4px; }
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

/* 訂單摘要 */
.order-summary {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 420px;
}
.order-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0;
  font-size: 0.92rem;
}
.order-label {
  color: var(--text-muted);
  font-weight: 600;
}
.order-value {
  color: var(--text-main);
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 0.5px;
}
.order-value.amount {
  color: #337168;
  font-size: 1.05rem;
  font-family: inherit;
  letter-spacing: 0;
}
.order-hint {
  margin: 8px 0 0;
  font-size: 0.86rem;
  color: var(--text-secondary);
  text-align: center;
}

/* QR 卡片清單 */
.qr-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 420px;
  margin: 8px 0;
}

.qr-card {
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: 20px;
  padding: 24px 28px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.qr-card-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
.qr-card-idx {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-main);
}
.qr-card-ticket {
  font-size: 0.78rem;
  color: #337168;
  background: #e8f5f1;
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 600;
}
.qr-card-name {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-main);
}
.qr-img-wrap {
  width: 200px;
  height: 200px;
  padding: 12px;
  border: 2px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}
.qr-img-wrap img { width: 100%; height: 100%; display: block; }
.qr-hint {
  font-size: 0.86rem;
  color: var(--text-muted);
  margin: 0;
}
.qr-ticket-no, .qr-token {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-family: monospace;
  letter-spacing: 1.5px;
  margin: 0;
}

/* 活動提醒 */
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
.r-icon { font-size: 1.1rem; flex-shrink: 0; }

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
.ticket-time-box svg { flex-shrink: 0; stroke: #d97706; }
</style>
