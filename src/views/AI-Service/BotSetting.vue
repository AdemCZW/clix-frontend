<template>
  <div class="bot-setting-page">
    <div class="page-container">
      <div class="page-header">
        <h1 class="page-title">AI 客服設定</h1>
        <p class="page-description">設定您的智能客服機器人</p>
      </div>

      <div class="content-panel">
        <form @submit.prevent="saveBotSettings" class="bot-form">
          <div class="form-section">
            <h3 class="section-title">基本設定</h3>

            <div class="form-group">
              <label>機器人名稱 *</label>
              <input
                v-model="botSettings.name"
                type="text"
                placeholder="請輸入機器人名稱"
                required
              />
            </div>

            <div class="form-group">
              <label>歡迎訊息</label>
              <textarea
                v-model="botSettings.welcomeMessage"
                rows="3"
                placeholder="請輸入歡迎訊息..."
              ></textarea>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input v-model="botSettings.enabled" type="checkbox" />
                <span>啟用 AI 客服</span>
              </label>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">回應設定</h3>

            <div class="form-group">
              <label>回應語氣</label>
              <select v-model="botSettings.tone">
                <option value="formal">正式</option>
                <option value="casual">輕鬆</option>
                <option value="friendly">友善</option>
                <option value="professional">專業</option>
              </select>
            </div>

            <div class="form-group">
              <label>回應速度</label>
              <div class="radio-group">
                <label class="radio-label">
                  <input v-model="botSettings.responseSpeed" type="radio" value="fast" />
                  <span>快速</span>
                </label>
                <label class="radio-label">
                  <input v-model="botSettings.responseSpeed" type="radio" value="normal" />
                  <span>正常</span>
                </label>
                <label class="radio-label">
                  <input v-model="botSettings.responseSpeed" type="radio" value="detailed" />
                  <span>詳細</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label>最大回應長度</label>
              <input
                v-model.number="botSettings.maxResponseLength"
                type="number"
                min="50"
                max="500"
                placeholder="200"
              />
              <small>字元數：50-500</small>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">知識庫</h3>

            <div class="form-group">
              <label>常見問題</label>
              <div class="faq-list">
                <div v-for="(faq, index) in botSettings.faqs" :key="index" class="faq-item">
                  <input
                    v-model="faq.question"
                    type="text"
                    placeholder="問題"
                    class="faq-question"
                  />
                  <textarea
                    v-model="faq.answer"
                    placeholder="回答"
                    rows="2"
                    class="faq-answer"
                  ></textarea>
                  <button type="button" @click="removeFaq(index)" class="btn-remove">✕</button>
                </div>
              </div>
              <button type="button" @click="addFaq" class="btn-add">+ 新增常見問題</button>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">進階設定</h3>

            <div class="form-group">
              <label class="checkbox-label">
                <input v-model="botSettings.autoLearn" type="checkbox" />
                <span>自動學習用戶問題</span>
              </label>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input v-model="botSettings.logConversations" type="checkbox" />
                <span>記錄對話內容</span>
              </label>
            </div>

            <div class="form-group">
              <label>無法回答時的訊息</label>
              <textarea
                v-model="botSettings.fallbackMessage"
                rows="3"
                placeholder="抱歉，我無法回答這個問題..."
              ></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-secondary">測試機器人</button>
            <button type="submit" class="btn-primary">儲存設定</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from "vue";

const botSettings = reactive({
  name: "AI 助手",
  welcomeMessage: "您好！我是智能客服，有什麼可以幫助您的嗎？",
  enabled: true,
  tone: "friendly",
  responseSpeed: "normal",
  maxResponseLength: 200,
  faqs: [{ question: "", answer: "" }],
  autoLearn: false,
  logConversations: true,
  fallbackMessage: "抱歉，我目前無法回答這個問題。請聯繫人工客服。",
});

const addFaq = () => {
  botSettings.faqs.push({ question: "", answer: "" });
};

const removeFaq = (index) => {
  if (botSettings.faqs.length > 1) {
    botSettings.faqs.splice(index, 1);
  }
};

const saveBotSettings = () => {
  console.log("保存 AI 客服設定:", botSettings);
  // 這裡可以添加 API 呼叫
  alert("AI 客服設定已儲存！");
};
</script>

<style lang="scss" scoped>
.bot-setting-page {
  min-height: 100%;
  background: var(--bg-primary, #f8f9fa);
}

.page-container {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;

  .page-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-main, #1f2937);
    margin: 0 0 8px 0;
  }

  .page-description {
    color: var(--text-muted, #6b7280);
    margin: 0;
    font-size: 0.95rem;
  }
}

.content-panel {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.bot-form {
  .form-section {
    margin-bottom: 32px;

    &:last-child {
      margin-bottom: 0;
    }

    .section-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-main, #1f2937);
      margin: 0 0 20px 0;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--border-light, #e5e7eb);
    }
  }

  .form-group {
    margin-bottom: 20px;

    &:last-child {
      margin-bottom: 0;
    }

    label:not(.checkbox-label):not(.radio-label) {
      display: block;
      font-weight: 600;
      color: var(--text-main, #374151);
      margin-bottom: 8px;
      font-size: 0.9rem;
    }

    input[type="text"],
    input[type="number"],
    select,
    textarea {
      width: 100%;
      padding: 10px 14px;
      border: 2px solid var(--border-light, #e5e7eb);
      border-radius: 8px;
      font-size: 0.95rem;
      transition: all 0.2s ease;
      font-family: inherit;

      &:focus {
        outline: none;
        border-color: var(--primary-blue, #3b82f6);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      &::placeholder {
        color: #9ca3af;
      }
    }

    textarea {
      resize: vertical;
      min-height: 80px;
    }

    small {
      display: block;
      margin-top: 6px;
      color: #6b7280;
      font-size: 0.85rem;
    }
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 500;
  color: var(--text-main, #374151);

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
}

.radio-group {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
  color: var(--text-main, #374151);

  input[type="radio"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.faq-item {
  position: relative;
  padding: 16px;
  border: 2px solid var(--border-light, #e5e7eb);
  border-radius: 8px;
  background: #f9fafb;

  .faq-question {
    margin-bottom: 12px;
  }

  .faq-answer {
    margin-bottom: 0;
  }

  .btn-remove {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    background: #ef4444;
    color: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    transition: all 0.2s ease;

    &:hover {
      background: #dc2626;
      transform: scale(1.1);
    }
  }
}

.btn-add {
  width: 100%;
  padding: 10px 16px;
  border: 2px dashed var(--border-light, #d1d5db);
  background: transparent;
  color: var(--primary-blue, #3b82f6);
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--primary-blue, #3b82f6);
    background: #eff6ff;
  }
}

.form-actions {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid var(--border-light, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-primary {
  background: var(--primary-blue, #3b82f6);
  color: white;
  border: none;
  padding: 12px 28px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
}

.btn-secondary {
  background: white;
  color: var(--text-main, #374151);
  border: 2px solid var(--border-light, #e5e7eb);
  padding: 12px 28px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #d1d5db;
    background: #f9fafb;
  }
}
</style>
