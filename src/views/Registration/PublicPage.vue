<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePublicRegisterStore } from '@/stores/participants'

const route = useRoute()
const store = usePublicRegisterStore()
const shortLink = route.params.shortLink as string

const form = reactive({
  name: '',
  email: '',
  phone: '',
  company: '',
  title: '',
  type: '一般民眾',
})

// 動態自定義欄位的值，key 為欄位 id
const dynamicValues = reactive<Record<string, string>>({})
const formErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const showForm = ref(false)

// pageData 必須在 customFields 之前定義
const pageData = computed(() => store.page)

// 取得非隱藏、非固定的自定義欄位（相容 snake_case 與 camelCase）
const customFields = computed(() => {
  const fields = pageData.value?.formFields || []
  return fields.filter((f) => {
    const hidden = f.is_hidden ?? false
    const fixed  = f.is_fixed  ?? false
    return !hidden && !fixed
  })
})

// 當自定義欄位載入後，初始化 dynamicValues
watch(customFields, (fields) => {
  fields.forEach((f) => {
    const key = String(f.id ?? f.label)
    if (dynamicValues[key] === undefined) dynamicValues[key] = ''
  })
}, { immediate: true })

onMounted(() => {
  store.reset()
  store.fetchPage(shortLink).catch(() => {})
})

const validate = () => {
  const errs: Record<string, string> = {}
  if (!form.name.trim()) errs.name = '請填寫姓名'
  if (!form.email.trim()) errs.email = '請填寫電子郵件'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = '電子郵件格式不正確'
  if (!form.phone.trim()) errs.phone = '請填寫聯絡電話'
  // 驗證自定義必填欄位
  customFields.value.forEach((f) => {
    const required = f.is_required ?? false
    const key = String(f.id ?? f.label)
    if (required && !String(dynamicValues[key] ?? '').trim()) {
      errs[`custom_${key}`] = `請填寫${f.label}`
    }
  })
  formErrors.value = errs
  return Object.keys(errs).length === 0
}

const handleSubmit = async () => {
  if (!validate()) return
  submitting.value = true
  try {
    // 組合自定義欄位值
    const customData: Record<string, string> = {}
    customFields.value.forEach((f) => {
      const key = String(f.id ?? f.label)
      if (dynamicValues[key] !== undefined && dynamicValues[key] !== '') {
        customData[f.label] = dynamicValues[key]
      }
    })
    await store.submitRegistration(shortLink, {
      name: form.name,
      email: form.email,
      phone: form.phone,
      company: form.company || undefined,
      title: form.title || undefined,
      type: form.type,
      ...Object.keys(customData).length > 0 ? { custom_fields: customData } : {},
    })
  } catch {
    // error displayed via store.error
  } finally {
    submitting.value = false
  }
}

// 報名狀態（目前為佔位實作，可接入後端資料）
const participantsCount = computed(() => 0)
const maxParticipants = computed(() => '∞')
const isFull = computed(() => false)
const statusText = computed(() => '報名中')

const openForm = () => { showForm.value = true }
const backToInfo = () => { showForm.value = false }

const formatDate = (date, endDate, time) => {
  if (!date) return ''
  let str = date
  if (endDate && endDate !== date) str += ` ～ ${endDate}`
  if (time) str += ` ${time}`
  return str
}
</script>

<template>
  <div class="public-page">

    <!-- Loading -->
    <div v-if="store.loading && !pageData" class="state-screen">
      <div class="spinner"></div>
      <p>載入頁面中...</p>
    </div>

    <!-- Error -->
    <div v-else-if="store.error && !pageData" class="state-screen error-screen">
      <div class="state-icon">⚠️</div>
      <h2>無法開啟報名頁面</h2>
      <p>{{ store.error }}</p>
    </div>

    <!-- Success -->
    <div v-else-if="store.submitted && store.submittedParticipant" class="state-screen success-screen">
      <div class="state-icon success-burst">🎉</div>
      <h2 class="success-title">報名成功！</h2>
      <p class="success-sub">{{ store.submittedParticipant.name }}，感謝您的報名，期待與您相見！</p>

      <div v-if="store.submittedParticipant.qr_code_url || store.submittedParticipant.qrCodeUrl" class="qr-card">
        <p class="qr-hint">現場出示此 QR Code 掃描報到</p>
        <div class="qr-img-wrap">
          <img :src="store.submittedParticipant.qr_code_url || store.submittedParticipant.qrCodeUrl" alt="QR Code" />
        </div>
        <p class="qr-token">{{ store.submittedParticipant.check_in_token || store.submittedParticipant.checkInToken }}</p>
      </div>

      <div class="reminder-box" v-if="pageData">
        <div class="reminder-row" v-if="pageData.eventDate">
          <span class="r-icon">📅</span>
          <span>{{ formatDate(pageData.eventDate, pageData.eventEndDate, pageData.eventTime) }}</span>
        </div>
        <div class="reminder-row" v-if="pageData.eventLocation">
          <span class="r-icon">📍</span>
          <span>{{ pageData.eventLocation }}</span>
        </div>
        <div class="reminder-row" v-if="pageData.eventAddress">
          <span class="r-icon">🗺️</span>
          <span>{{ pageData.eventAddress }}</span>
        </div>
      </div>
    </div>

    <!-- Info Page -->
    <template v-else-if="pageData && !showForm">

      <!-- Banner -->
      <div
        class="page-banner"
        :style="pageData.banner ? { backgroundImage: `url(${pageData.banner})` } : {}"
      ></div>

      <!-- Floating white card (overlaps banner) -->
      <div class="float-card">

        <!-- Event Header -->
        <div class="event-header">
          <span class="p-tag">UPCOMING EVENT</span>
          <h1 class="p-title">{{ pageData.eventName }}</h1>
          <div class="p-badges">
            <span v-if="pageData.eventDate">
              📅 {{ formatDate(pageData.eventDate, pageData.eventEndDate, pageData.eventTime) }}
            </span>
            <span v-if="pageData.eventLocation">📍 {{ pageData.eventLocation }}</span>
            <span v-if="pageData.eventAddress">🗺️ {{ pageData.eventAddress }}</span>
            <span class="badge-count">
              👥 {{ participantsCount }} / {{ maxParticipants }}
            </span>
            <span class="badge-status">{{ statusText }}</span>
          </div>
        </div>

        <!-- 報名截止提示 -->
        <div v-if="isFull" class="full-alert">
          <span>報名已截止，名額已滿</span>
        </div>

        <!-- Rich text content -->
        <div v-if="pageData.mainContent" class="p-main-body-render" v-html="pageData.mainContent"></div>

      </div><!-- /.float-card -->

      <!-- Sticky Footer -->
      <div class="sticky-footer">
        <div class="footer-inner">
          <div class="footer-info">
            <span class="f-title">立即報名參加</span>
            <span class="f-date">
              <template v-if="pageData.eventDate">📅 {{ formatDate(pageData.eventDate, pageData.eventEndDate, pageData.eventTime) }}</template>
              <template v-if="pageData.eventLocation">　📍 {{ pageData.eventLocation }}</template>
            </span>
          </div>
          <button class="btn-apply" @click="openForm" :disabled="isFull">
            <span>立即報名</span>
          </button>
        </div>
      </div>

    </template>

    <!-- Registration Form Page -->
    <div v-else-if="pageData && showForm" class="form-view">
      <div class="form-view-header">
        <button class="back-btn" @click="backToInfo">← 返回活動介紹</button>
        <span class="form-view-ename">{{ pageData.eventName }}</span>
      </div>
      <div class="form-wrap">
        <div class="form-wrap-header">
          <h2 class="form-embed-title">線上報名</h2>
          <p class="form-embed-sub">填寫以下資料，完成後將自動產生您的專屬 QR Code</p>
        </div>
        <div v-if="isFull" class="full-alert">
          <span>報名已截止，名額已滿</span>
        </div>
        <form v-if="!isFull" @submit.prevent="handleSubmit" class="reg-form" novalidate>

          <div class="form-row two-col">
            <div class="field-group" :class="{ 'has-error': formErrors.name }">
              <label>姓名 <span class="required">*</span></label>
              <input v-model="form.name" type="text" placeholder="請輸入您的姓名" />
              <span class="field-error">{{ formErrors.name }}</span>
            </div>
            <div class="field-group" :class="{ 'has-error': formErrors.phone }">
              <label>聯絡電話 <span class="required">*</span></label>
              <input v-model="form.phone" type="tel" placeholder="例：0912-345-678" />
              <span class="field-error">{{ formErrors.phone }}</span>
            </div>
          </div>

          <div class="field-group" :class="{ 'has-error': formErrors.email }">
            <label>電子郵件 <span class="required">*</span></label>
            <input v-model="form.email" type="email" placeholder="example@mail.com" />
            <span class="field-error">{{ formErrors.email }}</span>
          </div>

          <div class="form-row two-col">
            <div class="field-group">
              <label>公司／單位 <span class="optional">（選填）</span></label>
              <input v-model="form.company" type="text" placeholder="請輸入公司名稱" />
            </div>
            <div class="field-group">
              <label>職稱 <span class="optional">（選填）</span></label>
              <input v-model="form.title" type="text" placeholder="請輸入職稱" />
            </div>
          </div>

          <!-- 自定義欄位 -->
          <template v-for="field in customFields" :key="field.id ?? field.label">
            <div class="field-group" :class="{ 'has-error': formErrors[`custom_${String(field.id ?? field.label)}`] }">
              <label>
                {{ field.label }}
                <span v-if="field.is_required" class="required">*</span>
              </label>
              <select
                v-if="field.field_type === 'select' || field.field_type === 'radio'"
                v-model="dynamicValues[String(field.id ?? field.label)]"
                class="custom-select"
              >
                <option value="">請選擇...</option>
                <option v-for="opt in (field.options || [])" :key="opt.order" :value="opt.text">
                  {{ opt.text }}
                </option>
              </select>
              <textarea
                v-else-if="field.field_type === 'textarea'"
                v-model="dynamicValues[String(field.id ?? field.label)]"
                :placeholder="`請輸入${field.label}`"
                class="custom-textarea"
                rows="3"
              ></textarea>
              <input
                v-else
                v-model="dynamicValues[String(field.id ?? field.label)]"
                :type="field.field_type || 'text'"
                :placeholder="`請輸入${field.label}`"
              />
              <span class="field-error">{{ formErrors[`custom_${String(field.id ?? field.label)}`] }}</span>
            </div>
          </template>

          <div class="field-group">
            <label>身份類別</label>
            <div class="radio-group">
              <label class="radio-item" :class="{ checked: form.type === '一般民眾' }">
                <input v-model="form.type" type="radio" value="一般民眾" hidden />
                <span class="radio-mark"></span>
                <span>一般民眾</span>
              </label>
              <label class="radio-item" :class="{ checked: form.type === 'VIP' }">
                <input v-model="form.type" type="radio" value="VIP" hidden />
                <span class="radio-mark"></span>
                <span>⭐ 貴賓 VIP</span>
              </label>
            </div>
          </div>

          <button type="submit" class="btn-submit" :disabled="submitting">
            <span v-if="submitting" class="btn-spinner"></span>
            <span>{{ submitting ? '送出中...' : '確認報名' }}</span>
          </button>

        </form>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ─── Base ─── */
.public-page {
  min-height: 100vh;
  background: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', sans-serif;
  padding-bottom: 90px;
}

/* ─── State Screens ─── */
.state-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px 24px;
  text-align: center;
  background: #fff;
}
.spinner {
  width: 44px;
  height: 44px;
  border: 3px solid #e2e8f0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 4rem; line-height: 1; }
.error-screen h2 { color: #ef4444; margin: 0; font-size: 1.6rem; }
.error-screen p  { color: #64748b; margin: 0; }

/* Success */
.success-burst { animation: burst 0.5s ease-out; }
@keyframes burst {
  0%   { transform: scale(0.5); opacity: 0; }
  70%  { transform: scale(1.2); }
  100% { transform: scale(1);   opacity: 1; }
}
.success-title {
  font-size: 2rem;
  font-weight: 900;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
}
.success-sub { font-size: 1rem; color: #475569; margin: 0; max-width: 360px; }

.qr-card {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 20px;
  padding: 28px 32px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: 8px 0;
}
.qr-hint  { font-size: 0.88rem; color: #64748b; margin: 0; }
.qr-img-wrap {
  width: 200px;
  height: 200px;
  padding: 12px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}
.qr-img-wrap img { width: 100%; height: 100%; display: block; }
.qr-token { font-size: 0.78rem; color: #94a3b8; font-family: monospace; letter-spacing: 1.5px; }

.reminder-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 420px;
}
.reminder-row { display: flex; align-items: center; gap: 10px; font-size: 0.95rem; color: #334155; }
.r-icon { font-size: 1.1rem; flex-shrink: 0; }

/* ─── Banner ─── */
.page-banner {
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 540px;
  background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 50%, #1e293b 100%);
  background-size: cover;
  background-position: center;
  position: relative;
}
.page-banner::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 50%;
  background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.45));
}

/* ─── Float Card ─── */
.float-card {
  background: rgba(255,255,255,0.98);
  margin-top: -36px;
  border-radius: 28px 28px 0 0;
  position: relative;
  z-index: 2;
  box-shadow: 0 -12px 40px rgba(0,0,0,0.1);
  width: 100%;
  /* RWD: fluid padding scales with viewport, no fixed max-width */
  padding: clamp(24px, 4vw, 52px) clamp(16px, 7vw, 96px) 60px;
}
@media (max-width: 640px) {
  .float-card { padding: 24px 16px 48px; margin-top: -20px; }
}

/* ─── Event Header ─── */
.event-header { margin-bottom: 32px; }
.p-tag {
  display: inline-block;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  padding: 7px 20px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 16px;
  box-shadow: 0 4px 14px rgba(102,126,234,0.3);
}
.p-title {
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  font-weight: 900;
  margin: 0 0 24px;
  background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.2;
  letter-spacing: -0.02em;
  word-break: break-word;
}
.p-badges { display: flex; flex-wrap: wrap; gap: 12px; }
.p-badges span {
  background: linear-gradient(135deg, rgba(59,130,246,0.09) 0%, rgba(37,99,235,0.14) 100%);
  color: #1e40af;
  padding: 10px 18px;
  border-radius: 14px;
  font-size: 0.92rem;
  font-weight: 700;
  white-space: nowrap;
  border: 1.5px solid rgba(59,130,246,0.28);
  box-shadow: 0 3px 10px rgba(59,130,246,0.12);
  transition: transform 0.2s, box-shadow 0.2s;
}
.p-badges span:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59,130,246,0.22);
}

/* ─── Rich Text ─── */
.p-main-body-render {
  color: #475569;
  font-size: 1rem;
  line-height: 1.9;
  margin-bottom: 40px;
  padding-bottom: 40px;
  border-bottom: 1px solid #f1f5f9;
}
.p-main-body-render :deep(h1),
.p-main-body-render :deep(h2),
.p-main-body-render :deep(h3) { color: #0f172a; font-weight: 800; margin-top: 1.4em; }
.p-main-body-render :deep(img) { max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.p-main-body-render :deep(a)   { color: #3b82f6; font-weight: 600; }

/* ─── Form View ─── */
.form-view {
  min-height: 100vh;
  background: #f8fafc;
  padding-bottom: 60px;
}
.form-view-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,0.96);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #e2e8f0;
  padding: 14px clamp(16px, 5vw, 48px);
  display: flex;
  align-items: center;
  gap: 16px;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1.5px solid #e2e8f0;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
  white-space: nowrap;
}
.back-btn:hover { border-color: #667eea; color: #4338ca; background: rgba(102,126,234,0.06); }
.form-view-ename {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.form-wrap {
  max-width: 680px;
  width: calc(100% - 32px);
  margin: 32px auto 0;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.07);
  padding: 36px clamp(16px, 5vw, 48px) 48px;
}
.form-wrap-header { margin-bottom: 28px; }
.form-embed-title { font-size: 1.4rem; font-weight: 900; color: #0f172a; margin: 0 0 6px; }
.form-embed-sub   { font-size: 0.88rem; color: #64748b; margin: 0; }

.form-error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 0.9rem;
  margin-bottom: 20px;
}

.reg-form { display: flex; flex-direction: column; gap: 20px; }
.form-row.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 520px) { .form-row.two-col { grid-template-columns: 1fr; } }

.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-group label { font-size: 0.85rem; font-weight: 700; color: #374151; }
.required { color: #ef4444; }
.optional  { font-weight: 400; color: #94a3b8; font-size: 0.8rem; }

.custom-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
  &:focus {
    border-color: #667eea;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.14);
  }
}

.custom-select {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  cursor: pointer;
  &:focus {
    border-color: #667eea;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.14);
  }
}

.field-group input {
  padding: 12px 16px;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.field-group input:focus {
  border-color: #667eea;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102,126,234,0.14);
}
.field-group.has-error input { border-color: #ef4444; background: #fff5f5; }
.field-error { font-size: 0.78rem; color: #ef4444; min-height: 16px; }

/* Radio */
.radio-group { display: flex; gap: 12px; flex-wrap: wrap; padding-top: 4px; }
.radio-item {
  flex: 1;
  min-width: 120px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  font-size: 0.95rem;
  color: #374151;
  font-weight: 600;
  background: #f8fafc;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.radio-item:hover { border-color: #667eea; background: #f0f0ff; }
.radio-item.checked {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102,126,234,0.08) 0%, rgba(118,75,162,0.1) 100%);
  color: #4338ca;
}
.radio-mark {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  flex-shrink: 0;
  transition: all 0.2s;
  position: relative;
}
.radio-item.checked .radio-mark {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea, #764ba2);
  box-shadow: 0 0 0 3px rgba(102,126,234,0.2);
}
.radio-item.checked .radio-mark::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #fff;
}

/* Submit button */
.btn-submit {
  margin-top: 4px;
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 14px;
  font-size: 1.05rem;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
  box-shadow: 0 8px 20px rgba(102,126,234,0.35);
}
.btn-submit:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(102,126,234,0.45);
}
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* ─── Sticky Footer ─── */
.sticky-footer {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(to top, rgba(255,255,255,0.98), rgba(255,255,255,0.95));
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(226,232,240,0.8);
  box-shadow: 0 -4px 24px rgba(0,0,0,0.1);
  padding: 16px 24px;
  z-index: 100;
}
.footer-inner {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.footer-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.f-title {
  font-size: 1.1rem;
  font-weight: 800;
  background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.f-date {
  font-size: 0.82rem;
  color: #64748b;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-apply {
  position: relative;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  padding: 14px 40px;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 8px 20px rgba(102,126,234,0.35);
  transition: transform 0.3s, box-shadow 0.3s;
}
.btn-apply::after {
  content: '';
  position: absolute;
  top: -50%; left: -60%;
  width: 20%; height: 200%;
  background: rgba(255,255,255,0.3);
  transform: rotate(30deg);
  transition: left 0.5s ease-in-out;
}
.btn-apply:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 12px 28px rgba(102,126,234,0.45);
}
.btn-apply:hover::after { left: 150%; }
.btn-apply span { position: relative; z-index: 1; }

@media (max-width: 480px) {
  .f-title { font-size: 0.95rem; }
  .btn-apply { padding: 12px 24px; font-size: 0.9rem; }
}
</style>
