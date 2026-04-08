<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="onboarding-overlay" @click.self="close">
        <div class="onboarding-modal">
          <!-- 步驟內容 -->
          <div class="step-content">
            <!-- 選擇模式：選擇現有活動 或 建立新活動 -->
            <div v-if="mode === 'select'" class="step-section select-mode">

              <!-- 選擇既有活動 -->
              <template v-if="!showCreateForm">
                <div class="form-group">
                  <div v-if="eventsStore.isLoading" class="no-events">
                    <p>載入中...</p>
                  </div>
                  <div v-else-if="eventsStore.events.length === 0" class="no-events">
                    <p>尚無活動，請點擊下方「建立新活動」按鈕建立第一個活動</p>
                  </div>
                  <div v-else class="event-list">
                    <div
                      v-for="event in eventsStore.events"
                      :key="event.id"
                      class="event-item"
                      :class="{ selected: selectedEvent && selectedEvent.id === event.id }"
                      @click="selectedEvent = event"
                    >
                      <div class="event-name">{{ event.name }}</div>
                      <div class="event-details">
                        <span>&#x1F4C5; {{ event.date }}</span>
                        <span v-if="event.location">&#x1F4CD; {{ event.location }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="select-actions">
                  <button v-if="userStore.isSuperAdmin" class="btn-create-new" @click="showCreateForm = true">
                    ＋ 建立新活動
                  </button>
                  <div v-else-if="eventsStore.events.length === 0" class="no-permission-hint">
                    如需建立新活動，請聯絡系統管理員
                  </div>
                  <button
                    class="btn-primary btn-confirm"
                    :disabled="!canProceed"
                    @click="complete"
                  >
                    確認選擇
                  </button>
                </div>
              </template>

              <!-- 建立新活動的表單 -->
              <template v-else>
                <div class="step-header">
                  <h2>建立新活動</h2>
                  <p>填寫基本資訊，儲存後可在報名頁面設定中繼續編輯</p>
                </div>

                <div class="form-group">
                  <label>活動名稱 *</label>
                  <input
                    v-model="createForm.name"
                    type="text"
                    placeholder="例如：2026 新春團拜"
                    class="input-field"
                  />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>開始日期 *</label>
                    <input v-model="createForm.date" type="date" class="input-field" />
                  </div>
                  <div class="form-group">
                    <label>結束日期</label>
                    <input v-model="createForm.endDate" type="date" class="input-field" />
                  </div>
                </div>

                <div class="form-group">
                  <label>活動時間 *</label>
                  <input v-model="createForm.time" type="time" class="input-field" />
                </div>

                <div class="form-group">
                  <label>地點</label>
                  <input
                    v-model="createForm.location"
                    type="text"
                    placeholder="活動舉辦地點（選填）"
                    class="input-field"
                  />
                </div>
              </template>
            </div>

            <!-- 建立模式：原有的步驟 -->
            <div v-if="mode === 'create'">
              <!-- 步驟 1: 創建系列 -->
              <div v-if="currentStep === 1" class="step-section">
                <div class="step-header">
                  <h2>歡迎使用報到系統！</h2>
                  <p>首先，讓我們建立您的活動系列</p>
                </div>

                <div class="form-group">
                  <label>系列名稱 *</label>
                  <input
                    v-model="seriesForm.name"
                    type="text"
                    placeholder="例如：公司年度活動"
                    class="input-field"
                  />
                </div>

                <div class="form-group">
                  <label>系列描述（選填）</label>
                  <textarea
                    v-model="seriesForm.description"
                    placeholder="簡要描述這個系列的用途..."
                    class="input-field textarea"
                    rows="3"
                  ></textarea>
                </div>
              </div>

              <!-- 步驟 2: 創建活動 -->
              <div v-if="currentStep === 2" class="step-section">
                <div class="step-header">
                  <h2>太好了！現在建立您的第一個活動</h2>
                  <p>在「{{ seriesForm.name }}」系列下建立活動</p>
                </div>

                <div class="form-group">
                  <label>活動名稱 *</label>
                  <input
                    v-model="eventForm.name"
                    type="text"
                    placeholder="例如：2026 新春團拜"
                    class="input-field"
                  />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>日期 *</label>
                    <input v-model="eventForm.date" type="date" class="input-field" />
                  </div>
                  <div class="form-group">
                    <label>時間 *</label>
                    <input v-model="eventForm.time" type="time" class="input-field" />
                  </div>
                </div>

                <div class="form-group">
                  <label>地點 *</label>
                  <input
                    v-model="eventForm.location"
                    type="text"
                    placeholder="活動舉辦地點"
                    class="input-field"
                  />
                </div>
              </div>

              <!-- 步驟 3: 完成 -->
              <div v-if="currentStep === 3" class="step-section">
                <div class="step-header">
                  <h2>設定完成！</h2>
                  <p>您的活動已準備就緒</p>
                </div>

                <div class="summary-card">
                  <h3>{{ seriesForm.name }}</h3>
                  <div class="event-summary">
                    <h4>{{ eventForm.name }}</h4>
                    <p>📅 {{ eventForm.date }} {{ eventForm.time }}</p>
                    <p>📍 {{ eventForm.location }}</p>
                  </div>
                </div>

                <div class="welcome-message">
                  <p>🎉 現在您可以開始使用報到系統的所有功能了！</p>
                </div>
              </div>
            </div>
          </div>

          <!-- 按鈕區域 -->
          <div class="modal-footer">
            <button
              v-if="mode === 'create' && currentStep > 1"
              class="btn-secondary"
              @click="prevStep"
            >
              上一步
            </button>

            <button
              v-if="mode === 'create' && currentStep < 3"
              class="btn-primary"
              :disabled="!canProceed"
              @click="nextStep"
            >
              下一步
            </button>

            <button
              v-if="mode === 'create' && currentStep === 3"
              class="btn-primary"
              @click="complete"
            >
              開始使用系統
            </button>

            <!-- select 模式：建立新活動表單時 -->
            <template v-if="mode === 'select' && showCreateForm">
              <button class="btn-secondary" @click="showCreateForm = false">
                ← 返回列表
              </button>
              <button
                class="btn-primary"
                :disabled="!canCreate || isCreating"
                @click="createAndSelect"
              >
                {{ isCreating ? '建立中...' : '建立並進入' }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { useUserStore } from "@/stores/user";
import { useEventsStore } from "@/stores/events";

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String,
    default: "create", // 'create' 或 'select'
  },
});

const emit = defineEmits(["close", "complete"]);

const userStore = useUserStore();
const eventsStore = useEventsStore();

const currentStep = ref(1);

const seriesForm = ref({
  name: "",
  description: "",
});

const eventForm = ref({
  name: "",
  date: "",
  time: "",
  location: "",
});

// 選擇模式的狀態
const selectedEvent = ref<import('@/types').Event | null>(null);

// 建立新活動子表單
const showCreateForm = ref(false);
const isCreating = ref(false);
const createForm = reactive({ name: '', date: '', endDate: '', time: '', location: '' });

const canCreate = computed(() => createForm.name.trim().length > 0 && !!createForm.date && !!createForm.time);

const createAndSelect = async () => {
  if (!canCreate.value) return;
  isCreating.value = true;
  try {
    const created = await eventsStore.createEvent({
      name:      createForm.name,
      date:      createForm.date,
      end_date:  createForm.endDate || createForm.date,
      time:      createForm.time + ':00',
      location:  createForm.location,
    });
    emit('complete', { event: created });
  } catch (err: unknown) {
    alert((err as Error).message || '建立活動失敗');
  } finally {
    isCreating.value = false;
  }
};

const canProceed = computed(() => {
  if (props.mode === "select") {
    return selectedEvent.value !== null;
  }

  if (currentStep.value === 1) {
    return seriesForm.value.name.trim().length > 0;
  }
  if (currentStep.value === 2) {
    return (
      eventForm.value.name.trim().length > 0 &&
      eventForm.value.date &&
      eventForm.value.time &&
      eventForm.value.location.trim().length > 0
    );
  }
  return true;
});

const nextStep = () => {
  if (canProceed.value && currentStep.value < 3) {
    currentStep.value++;
  }
};

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
};

const complete = () => {
  if (props.mode === "select") {
    // 選擇模式：直接切換到選中的活動
    emit("complete", {
      event: selectedEvent.value,
    });
  } else {
    // 建立模式：發送新建的系列和活動

    emit("complete", {
      series: seriesForm.value,
      event: eventForm.value,
    });
  }
};

const close = () => {
  emit("close");
};

// 重置表單
watch(
  () => props.show,
  (newVal) => {
    if (!newVal) {
      currentStep.value = 1;
      seriesForm.value = { name: "", description: "" };
      eventForm.value = { name: "", date: "", time: "", location: "" };
      selectedEvent.value = null;
      showCreateForm.value = false;
      createForm.name = '';
      createForm.date = '';
      createForm.endDate = '';
      createForm.time = '';
      createForm.location = '';
    } else if (props.mode === "select") {
      // 自動選取第一個活動
      if (eventsStore.events.length > 0) {
        selectedEvent.value = eventsStore.events[0];
      }
    }
  },
);
</script>

<style lang="scss" scoped>
.onboarding-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.onboarding-modal {
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  width: 90%;
  max-width: 460px;
  max-height: 85dvh;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}

.step-content {
  padding: 0 20px 16px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.step-section {
  .step-header {
    text-align: center;
    margin-bottom: 20px;

    h2 {
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--text-main);
      margin: 0 0 6px 0;
    }

    p {
      color: var(--text-muted);
      margin: 0;
      font-size: 0.88rem;
    }
  }
}

.select-mode {
  .series-list,
  .event-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 50dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .series-item,
  .event-item {
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      border-color: #6366f1;
      background: rgba(99,102,241,.05);
    }

    &.selected {
      border-color: #6366f1;
      background: rgba(99,102,241,.08);
      box-shadow: 0 0 0 2px rgba(99,102,241,.15);
    }
  }

  .series-item {
    .series-name {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.92rem;
      margin-bottom: 3px;
    }

    .series-desc {
      color: var(--text-muted);
      font-size: 0.82rem;
    }
  }

  .event-item {
    .event-name {
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.88rem;
      margin-bottom: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .event-details {
      display: flex;
      gap: 8px;
      font-size: 0.76rem;
      color: var(--text-muted);

      span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }

  .no-events {
    text-align: center;
    padding: 30px 16px;
    color: var(--text-muted);
    font-size: 0.88rem;
  }

  .select-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-bottom: env(safe-area-inset-bottom, 12px);
  }

  .btn-create-new {
    flex: 1;
    padding: 8px 12px;
    border: 1px dashed #6366f1;
    border-radius: 8px;
    background: transparent;
    color: #6366f1;
    font-weight: 600;
    font-size: 0.84rem;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: rgba(99,102,241,.08);
    }
  }

  .btn-confirm {
    flex: 1;
    padding: 8px 12px;
    font-size: 0.84rem;
  }

  .no-permission-hint {
    width: 100%;
    margin-top: 8px;
    padding: 10px;
    border: 1px dashed var(--border-color);
    border-radius: 8px;
    background: var(--bg-hover);
    color: var(--text-muted);
    font-size: 0.84rem;
    text-align: center;
  }
}

.form-group {
  margin-bottom: 14px;

  label {
    display: block;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 5px;
    font-size: 0.84rem;
  }

  .input-field {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font-size: 0.92rem;
    background: var(--bg-card);
    color: var(--text-main);
    transition: border-color 0.15s;

    &:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 2px rgba(99,102,241,.1);
    }

    &::placeholder { color: var(--text-muted); }

    &.textarea {
      resize: vertical;
      min-height: 70px;
    }
  }
}

.form-row {
  display: flex;
  gap: 12px;

  .form-group {
    flex: 1;
  }
}

.summary-card {
  background: var(--bg-hover);
  border-radius: 10px;
  padding: 14px;
  margin: 14px 0;
  border: 1px solid var(--border-color);

  h3 {
    color: var(--text-main);
    margin: 0 0 10px 0;
    font-size: 1rem;
  }

  .event-summary {
    h4 {
      color: var(--text-secondary);
      margin: 0 0 8px 0;
      font-size: 0.92rem;
    }

    p {
      margin: 4px 0;
      color: var(--text-muted);
      font-size: 0.86rem;
    }
  }
}

.welcome-message {
  text-align: center;
  margin: 14px 0;

  p {
    color: #10b981;
    font-weight: 600;
    margin: 0;
  }
}

.modal-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
}

.btn-primary {
  background: #6366f1;
  color: white;
  border: none;
  padding: 8px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    background: #4f46e5;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-secondary {
  background: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  padding: 8px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--border-color);
  }
}

/* 響應式 */
@media (max-width: 540px) {
  .onboarding-modal {
    width: 92%;
    max-width: 380px;
    max-height: 85dvh;
    border-radius: 12px;
  }

  .step-content {
    padding: 0 14px 10px;
  }

  .modal-footer {
    padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 12px));
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .step-section .step-header h2 {
    font-size: 1.1rem;
  }

  .select-mode .event-list {
    max-height: 50dvh;
  }
}

/* 動畫 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.modal-fade-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(-20px);
}

.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

@media (max-width: 540px) {
  .modal-fade-enter-from {
    opacity: 0;
    transform: scale(0.95);
  }

  .modal-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
  }
}
</style>
