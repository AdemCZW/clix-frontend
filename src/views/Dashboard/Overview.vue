<template>
  <div class="dashboard-view">
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">活動總數</div>
        <div class="stat-value">{{ eventStats.total }}</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-label">進行中</div>
        <div class="stat-value">{{ eventStats.active }}</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-label">總參與人數</div>
        <div class="stat-value">{{ eventStats.participants }}</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-label">已報到</div>
        <div class="stat-value">{{ eventStats.checkedIn }}</div>
      </div>
    </div>

    <div class="quick-action-section">
      <button class="btn-qr-link" @click="showQRLinkModal = true">開啟報到掃描器</button>
    </div>

    <div class="recent-events-section">
      <h2 class="section-title">最近活動</h2>
      <div class="events-list">
        <div
          v-for="event in recentEvents"
          :key="event.id"
          class="event-item"
          @click="selectEvent(event)"
        >
          <div class="event-date">
            <div class="month">{{ event.month }}</div>
            <div class="day">{{ event.day }}</div>
          </div>
          <div class="event-info">
            <h3 class="event-name">{{ event.name }}</h3>
            <p class="event-meta">{{ event.location }} · {{ event.participants }} 人</p>
          </div>
          <div class="event-status" :class="event.status">
            {{ event.statusText }}
          </div>
        </div>
      </div>
    </div>

    <!-- QR Code 連結彈窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showQRLinkModal" class="modal-overlay" @click="showQRLinkModal = false">
          <div class="modal-content qr-modal" @click.stop>
            <div class="modal-header">
              <h3>手機報到掃描器</h3>
              <button class="btn-close" @click="showQRLinkModal = false">✕</button>
            </div>
            <div class="modal-body">
              <div class="qr-code-container">
                <div class="qr-placeholder">
                  <div class="qr-icon">📱</div>
                  <p>掃描器 QR Code</p>
                </div>
              </div>
              <div class="link-section">
                <label>掃描器連結</label>
                <div class="link-input-group">
                  <input
                    type="text"
                    :value="checkinUrl"
                    readonly
                    class="link-input"
                    ref="linkInput"
                  />
                  <button class="btn-copy" @click="copyLink">
                    {{ linkCopied ? "✓ 已複製" : "複製" }}
                  </button>
                </div>
                <p class="link-hint">
                  將此連結分享給現場工作人員，用手機開啟後即可掃描參與者的報到 QR Code
                </p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useParticipantsStore } from "@/stores/participants";

const router = useRouter();
const participantsStore = useParticipantsStore();
const showQRLinkModal = ref(false);
const linkCopied = ref(false);
const linkInput = ref(null);

const eventStats = ref({
  total: 0,
  active: 0,
  participants: 0,
  checkedIn: 0,
});

onMounted(async () => {
  const stats = await participantsStore.fetchStatistics();
  if (stats) {
    eventStats.value = {
      total: stats.total ?? 0,
      active: 0,
      participants: stats.total ?? 0,
      checkedIn: stats.checked_in ?? 0,
    };
  }
});

// 生成報到掃描連結
const checkinUrl = computed(() => {
  // 使用當前頁面的完整路徑（包含 /check_system/）
  const baseUrl = window.location.origin;
  const basePath = import.meta.env.BASE_URL;
  return `${baseUrl}${basePath}#/mobile/checkin`;
});

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(checkinUrl.value);
    linkCopied.value = true;
    setTimeout(() => {
      linkCopied.value = false;
    }, 2000);
  } catch {
    // 備用方案
    linkInput.value?.select();
    document.execCommand("copy");
    linkCopied.value = true;
    setTimeout(() => {
      linkCopied.value = false;
    }, 2000);
  }
};

const recentEvents = ref([]);

const selectEvent = () => {
  router.push("/admin/registration-setting");
};
</script>

<style lang="scss" scoped>
.dashboard-view {
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 32px;

  .title {
    font-size: 2rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 8px 0;
  }

  .subtitle {
    font-size: 0.95rem;
    color: #475569;
    margin: 0;
  }
}

.stats-bar {
  background: white;
  border-radius: 16px;
  padding: 28px 32px;
  border: 1px solid #e5e7eb;
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;

  .stat-label {
    font-size: 0.85rem;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 2.25rem;
    font-weight: 800;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1;
  }
}

.stat-divider {
  width: 1px;
  height: 50px;
  background: linear-gradient(to bottom, transparent, #e5e7eb 20%, #e5e7eb 80%, transparent);
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 24px;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 20px 0;
}

.quick-actions-section {
  background: white;
  border-radius: 16px;
  padding: 28px;
  border: 1px solid #e5e7eb;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-btn {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;

  &:hover {
    border-color: #3b82f6;
    background: #eff6ff;
    transform: translateX(4px);
  }

  &.primary {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    border-color: transparent;

    &:hover {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
  }

  .btn-icon {
    font-size: 1.3rem;
  }
}

.quick-action-section {
  margin-bottom: 32px;
  display: flex;
  justify-content: center;
}

.btn-qr-link {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 18px 40px;
  border-radius: 16px;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s;
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 32px rgba(102, 126, 234, 0.5);

    &::before {
      left: 100%;
    }
  }

  &:active {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
  }
}

.recent-events-section {
  background: white;
  border-radius: 16px;
  padding: 28px;
  border: 1px solid #e5e7eb;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    border-color: #3b82f6;
    background: #f8fafc;
    transform: translateX(4px);
  }

  .event-date {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    flex-shrink: 0;

    .month {
      font-size: 0.75rem;
      font-weight: 600;
      opacity: 0.9;
    }

    .day {
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1;
    }
  }

  .event-info {
    flex: 1;

    .event-name {
      font-size: 1rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 4px 0;
    }

    .event-meta {
      font-size: 0.85rem;
      color: #475569;
      margin: 0;
    }
  }

  .event-status {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    flex-shrink: 0;

    &.active {
      background: #d1fae5;
      color: #065f46;
    }

    &.upcoming {
      background: #dbeafe;
      color: #1e40af;
    }

    &.completed {
      background: #f3f4f6;
      color: #374151;
    }
  }
}

/* QR Code 連結彈窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.qr-modal {
  .modal-header {
    padding: 24px 28px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;

    h3 {
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: #6b7280;
      cursor: pointer;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.2s;

      &:hover {
        background: #f3f4f6;
        color: #0f172a;
      }
    }
  }

  .modal-body {
    padding: 28px;
  }
}

.qr-code-container {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.qr-placeholder {
  width: 200px;
  height: 200px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;

  .qr-icon {
    font-size: 3rem;
  }

  p {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7280;
    font-weight: 600;
  }
}

.link-section {
  label {
    display: block;
    font-size: 0.9rem;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 8px;
  }
}

.link-input-group {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.link-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: monospace;
  background: #f8fafc;
  color: #475569;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
}

.btn-copy {
  padding: 10px 20px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
}

.link-hint {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
}

/* 彈窗動畫 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9) translateY(20px);
}

@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
