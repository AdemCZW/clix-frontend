<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="onboarding-overlay" @click.self="close">
        <div class="onboarding-modal">
          <!-- 步驟指示器 -->
          <div class="step-indicator">
            <div
              v-for="step in steps"
              :key="step.id"
              class="step-dot"
              :class="{ active: currentStep === step.id, completed: step.id < currentStep }"
            >
              <span v-if="step.id < currentStep">✓</span>
              <span v-else>{{ step.id }}</span>
            </div>
          </div>

          <!-- 步驟內容 -->
          <div class="step-content">
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

          <!-- 按鈕區域 -->
          <div class="modal-footer">
            <button v-if="currentStep > 1" class="btn-secondary" @click="prevStep">上一步</button>

            <button
              v-if="currentStep < 3"
              class="btn-primary"
              :disabled="!canProceed"
              @click="nextStep"
            >
              下一步
            </button>

            <button v-if="currentStep === 3" class="btn-primary" @click="complete">
              開始使用系統
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "complete"]);

const currentStep = ref(1);
const steps = [
  { id: 1, title: "建立系列" },
  { id: 2, title: "建立活動" },
  { id: 3, title: "完成設定" },
];

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

const canProceed = computed(() => {
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
  // 這裡可以發送 API 請求保存資料
  console.log("Series:", seriesForm.value);
  console.log("Event:", eventForm.value);

  emit("complete", {
    series: seriesForm.value,
    event: eventForm.value,
  });
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
    }
  },
);
</script>

<style lang="scss" scoped>
.onboarding-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.onboarding-modal {
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.step-indicator {
  display: flex;
  justify-content: center;
  padding: 30px 20px 20px;
  gap: 20px;

  .step-dot {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #e5e7eb;
    color: #6b7280;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    transition: all 0.3s ease;

    &.active {
      background: #3b82f6;
      color: white;
    }

    &.completed {
      background: #10b981;
      color: white;
    }
  }
}

.step-content {
  padding: 0 40px 20px;
  flex: 1;
}

.step-section {
  .step-header {
    text-align: center;
    margin-bottom: 30px;

    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 10px 0;
    }

    p {
      color: #6b7280;
      margin: 0;
      font-size: 0.95rem;
    }
  }
}

.form-group {
  margin-bottom: 20px;

  label {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
    font-size: 0.9rem;
  }

  .input-field {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 1rem;
    transition: border-color 0.2s ease;

    &:focus {
      outline: none;
      border-color: #3b82f6;
    }

    &.textarea {
      resize: vertical;
      min-height: 80px;
    }
  }
}

.form-row {
  display: flex;
  gap: 15px;

  .form-group {
    flex: 1;
  }
}

.summary-card {
  background: #f8fafc;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  border: 1px solid #e5e7eb;

  h3 {
    color: #1f2937;
    margin: 0 0 15px 0;
    font-size: 1.1rem;
  }

  .event-summary {
    h4 {
      color: #374151;
      margin: 0 0 10px 0;
      font-size: 1rem;
    }

    p {
      margin: 5px 0;
      color: #6b7280;
      font-size: 0.9rem;
    }
  }
}

.welcome-message {
  text-align: center;
  margin: 20px 0;

  p {
    color: #10b981;
    font-weight: 600;
    margin: 0;
  }
}

.modal-footer {
  padding: 20px 40px 30px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  gap: 15px;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background: #2563eb;
  }

  &:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }
}

.btn-secondary {
  background: white;
  color: #6b7280;
  border: 2px solid #e5e7eb;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #d1d5db;
    background: #f9fafb;
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
</style>
