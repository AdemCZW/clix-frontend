<template>
  <div class="lottery-winners">
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/>
          <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>
        </svg>
      </div>
      <h3>中獎名單管理</h3>
      <p>此功能尚未開放，敬請期待</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LotteryWinners'
}
</script>

<style scoped>
.lottery-winners { padding: 16px; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  gap: 12px;
  text-align: center;
}
.empty-icon {
  width: 96px;
  height: 96px;
  border-radius: 24px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  margin-bottom: 8px;
}
.empty-state h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main, #1e293b);
  margin: 0;
}
.empty-state p {
  font-size: 0.9rem;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}
</style>
