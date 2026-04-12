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
  store.fetchPage(shortLink).then(() => {
    // 動態設定頁面標題和 SEO meta
    if (store.page?.eventName) {
      document.title = `${store.page.eventName} — 活動報名`
      const metaDesc = document.querySelector('meta[name="description"]')
      if (metaDesc) metaDesc.setAttribute('content', `${store.page.eventName} 線上報名`)
      const ogTitle = document.querySelector('meta[property="og:title"]')
      if (ogTitle) ogTitle.setAttribute('content', store.page.eventName)
    }
  }).catch(() => {})
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

// 報名狀態（從後端公開頁面 API 取得）
const participantsCount = computed(() => (pageData.value as Record<string, unknown>)?.participants_count ?? 0)
const maxParticipants = computed(() => (pageData.value as Record<string, unknown>)?.max_participants ?? '∞')
const isFull = computed(() => {
  const max = (pageData.value as Record<string, unknown>)?.max_participants as number | undefined
  const count = (pageData.value as Record<string, unknown>)?.participants_count as number | undefined
  if (max && count !== undefined) return count >= max
  return false
})
const statusText = computed(() => {
  if (isFull.value) return '已額滿'
  return ((pageData.value as Record<string, unknown>)?.event_status_text as string) || '報名中'
})

const openForm = () => { showForm.value = true }
const backToInfo = () => { showForm.value = false }

const formatDate = (date: string, endDate: string, time: string) => {
  if (!date) return ''
  let str = date
  if (endDate && endDate !== date) str += ` ～ ${endDate}`
  if (time) str += ` ${time}`
  return str
}

// 貴賓列表
const guests = computed(() => (pageData.value as Record<string, unknown>)?.guests as Array<{id:number;name:string;title:string;company:string;avatar:string}> || [])

// FAQ 手風琴（暫時用靜態資料，之後可從後端取）
const faqOpen = ref<number | null>(null)
const toggleFaq = (i: number) => { faqOpen.value = faqOpen.value === i ? null : i }
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
      <div class="state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <h2>無法開啟報名頁面</h2>
      <p>{{ store.error }}</p>
    </div>

    <!-- Success -->
    <div v-else-if="store.submitted && store.submittedParticipant" class="state-screen success-screen">
      <div class="state-icon success-burst"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
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
          <span class="r-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
          <span>{{ formatDate(pageData.eventDate, pageData.eventEndDate, pageData.eventTime) }}</span>
        </div>
        <div class="reminder-row" v-if="pageData.eventLocation">
          <span class="r-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
          <span>{{ pageData.eventLocation }}</span>
        </div>
        <div class="reminder-row" v-if="pageData.eventAddress">
          <span class="r-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg></span>
          <span>{{ pageData.eventAddress }}</span>
        </div>
      </div>
    </div>

    <!-- Info Page（設計稿版面：左側欄 + 右側內容） -->
    <template v-else-if="pageData && !showForm">
      <div class="info-layout">

        <!-- 左側欄：Banner + 活動資訊 + 按鈕 -->
        <aside class="info-sidebar">
          <div class="sidebar-sticky">
            <!-- Banner 圖片 -->
            <div class="sidebar-banner" v-if="pageData.banner">
              <img :src="pageData.banner" :alt="pageData.eventName" />
            </div>

            <!-- 活動資訊 -->
            <div class="sidebar-meta">
              <div class="meta-row" v-if="pageData.eventDate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>{{ formatDate(pageData.eventDate, pageData.eventEndDate, null) }}</span>
              </div>
              <div class="meta-row" v-if="pageData.eventTime">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>{{ pageData.eventTime }}</span>
              </div>
              <div class="meta-row" v-if="pageData.eventLocation">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div>
                  <span>{{ pageData.eventLocation }}</span>
                  <p v-if="pageData.eventAddress" class="meta-sub">{{ pageData.eventAddress }}</p>
                </div>
              </div>
            </div>

            <!-- 按鈕 -->
            <div class="sidebar-actions">
              <button class="sb-btn outline" @click="openForm" :disabled="isFull">聯絡主辦單位</button>
              <button class="sb-btn primary" @click="openForm" :disabled="isFull">立即預約</button>
            </div>
          </div>
        </aside>

        <!-- ===== 右側主內容 ===== -->
        <main class="info-main">
          <span class="p-tag">UPCOMING EVENT</span>
          <h1 class="p-title">{{ pageData.eventName }}</h1>

          <div v-if="isFull" class="full-alert">報名已截止，名額已滿</div>

          <!-- 活動內文 -->
          <div v-if="pageData.mainContent" class="p-main-body-render" v-html="pageData.mainContent"></div>

          <!-- 貴賓列表 -->
          <div v-if="guests.length" class="guests-section">
            <div class="guests-grid">
              <div v-for="g in guests" :key="g.id" class="guest-card">
                <div class="guest-avatar">
                  <img v-if="g.avatar" :src="g.avatar" :alt="g.name" />
                  <span v-else>{{ g.name?.charAt(0) }}</span>
                </div>
                <div class="guest-name">{{ g.name }}</div>
                <div class="guest-role">{{ g.company }}<template v-if="g.title"><br/>{{ g.title }}</template></div>
              </div>
            </div>
          </div>

          <!-- 立即預約按鈕 -->
          <button class="btn-book-full" @click="openForm" :disabled="isFull">
            {{ isFull ? '已額滿' : '立即預約' }}
          </button>

          <!-- 活動地點 -->
          <div v-if="pageData.eventAddress || pageData.eventLocation" class="venue-section">
            <h2 class="section-heading">活動地點</h2>
            <div class="venue-info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#167A67" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <div>
                <strong>{{ pageData.eventLocation }}</strong>
                <p v-if="pageData.eventAddress" class="venue-addr">{{ pageData.eventAddress }}</p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- 底部版權 -->
      <footer class="page-footer">
        <span>&copy; CLIX 活動報到系統</span>
        <span>WEBSITE DESIGNED BY CLIX</span>
      </footer>

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
                <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> VIP</span>
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
  background: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', sans-serif;
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
  background: var(--bg-card);
}
.spinner {
  width: 44px;
  height: 44px;
  border: 3px solid var(--border-color);
  border-top-color: #167A67;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 4rem; line-height: 1; }
.error-screen h2 { color: #ef4444; margin: 0; font-size: 1.6rem; }
.error-screen p  { color: var(--text-muted); margin: 0; }

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
  background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
}
.success-sub { font-size: 1rem; color: var(--text-secondary); margin: 0; max-width: 360px; }

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
.qr-hint  { font-size: 0.88rem; color: var(--text-muted); margin: 0; }
.qr-img-wrap {
  width: 200px;
  height: 200px;
  padding: 12px;
  border: 2px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}
.qr-img-wrap img { width: 100%; height: 100%; display: block; }
.qr-token { font-size: 0.78rem; color: var(--text-muted); font-family: monospace; letter-spacing: 1.5px; }

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
.reminder-row { display: flex; align-items: center; gap: 10px; font-size: 0.95rem; color: var(--text-secondary); }
.r-icon { font-size: 1.1rem; flex-shrink: 0; }

/* ─── Banner ─── */
/* ─── Info Layout（左右兩欄） ─── */
.info-layout {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 24px 60px;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 40px;
  align-items: start;
}

/* 左側欄 */
.info-sidebar { min-width: 0; }
.sidebar-sticky { position: sticky; top: 24px; }
.sidebar-banner img {
  width: 100%; border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}
.sidebar-meta {
  margin-top: 16px; display: flex; flex-direction: column; gap: 10px;
  padding: 14px; background: #f8fafc; border-radius: 10px;
  border: 1px solid #e2e8f0;
}
.meta-row {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: .86rem; color: #334155; line-height: 1.4;
}
.meta-row svg { flex-shrink: 0; margin-top: 2px; color: #167A67; }
.meta-sub { margin: 2px 0 0; font-size: .78rem; color: #94a3b8; line-height: 1.3; }
.sidebar-actions {
  margin-top: 14px; display: flex; flex-direction: column; gap: 8px;
}
.sb-btn {
  width: 100%; padding: 10px 0; border-radius: 8px;
  font-size: .88rem; font-weight: 600; cursor: pointer;
  transition: .15s; text-align: center; border: none;
}
.sb-btn.outline {
  background: #fff; color: #334155;
  border: 1px solid #d1d5db;
}
.sb-btn.outline:hover { background: #f9fafb; }
.sb-btn.primary { background: #167A67; color: #fff; }
.sb-btn.primary:hover { background: #0f5d4e; }
.sb-btn:disabled { opacity: .5; cursor: not-allowed; }

/* 右側主內容 */
.info-main { min-width: 0; }

.p-tag {
  display: inline-block;
  background: #167A67; color: #fff;
  padding: 5px 14px; border-radius: 4px;
  font-size: 0.68rem; font-weight: 800;
  letter-spacing: 0.1em; text-transform: uppercase;
  margin-bottom: 12px;
}
.p-title {
  font-size: clamp(1.6rem, 3.5vw, 2.2rem);
  font-weight: 900;
  margin: 0 0 24px;
  color: #0f172a;
  line-height: 1.3;
  word-break: break-word;
}

/* Rich Text */
.p-main-body-render {
  color: #334155;
  font-size: .95rem;
  line-height: 1.85;
  margin-bottom: 32px;
}
.p-main-body-render :deep(h1),
.p-main-body-render :deep(h2),
.p-main-body-render :deep(h3) { color: #0f172a; font-weight: 800; margin-top: 1.4em; }
.p-main-body-render :deep(h3) { border-left: 3px solid #167A67; padding-left: 10px; }
.p-main-body-render :deep(img) { max-width: 100%; border-radius: 8px; }
.p-main-body-render :deep(a) { color: #167A67; font-weight: 600; }
.p-main-body-render :deep(ul),
.p-main-body-render :deep(ol) { padding-left: 20px; }
.p-main-body-render :deep(li) { margin-bottom: 6px; }

/* 活動地點 */
.venue-section { margin-top: 40px; padding-top: 32px; border-top: 1px solid #e2e8f0; }
.section-heading { font-size: 1.3rem; font-weight: 800; color: #0f172a; margin: 0 0 16px; }
.venue-info { display: flex; gap: 10px; align-items: flex-start; }
.venue-info svg { flex-shrink: 0; margin-top: 3px; }
.venue-info strong { font-size: .92rem; color: #0f172a; }

/* 底部版權 */
.page-footer {
  max-width: 1100px; margin: 0 auto;
  padding: 20px 24px;
  display: flex; justify-content: space-between;
  font-size: .75rem; color: #94a3b8;
  border-top: 1px solid #e2e8f0;
}

/* 貴賓列表 */
.guests-section { margin: 32px 0; }
.guests-grid {
  display: flex; flex-wrap: wrap; gap: 20px;
}
.guest-card { text-align: center; width: 90px; }
.guest-avatar {
  width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 8px;
  background: #2A3A39; display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.guest-avatar img { width: 100%; height: 100%; object-fit: cover; }
.guest-avatar span { color: #fff; font-size: 1.2rem; font-weight: 700; }
.guest-name { font-size: .82rem; font-weight: 700; color: #0f172a; }
.guest-role { font-size: .72rem; color: #64748b; line-height: 1.3; }

/* 立即預約全寬按鈕 */
.btn-book-full {
  display: block; width: 100%; padding: 16px;
  background: #167A67; color: #fff; border: none;
  border-radius: 10px; font-size: 1rem; font-weight: 700;
  cursor: pointer; transition: .15s; margin: 32px 0;
}
.btn-book-full:hover:not(:disabled) { background: #0f5d4e; }
.btn-book-full:disabled { opacity: .5; cursor: not-allowed; }

/* 活動地點 */
.venue-addr { margin: 4px 0 0; font-size: .88rem; color: #64748b; }

/* 報名截止 */
.full-alert {
  background: #fef2f2; color: #dc2626;
  padding: 12px 16px; border-radius: 8px;
  font-size: .88rem; font-weight: 600;
  margin-bottom: 20px; border: 1px solid #fecaca;
}

/* RWD */
@media (max-width: 768px) {
  .info-layout {
    grid-template-columns: 1fr;
    padding: 16px 16px 60px;
    gap: 20px;
  }
  .sidebar-sticky { position: static; }
  .sidebar-banner img { max-height: 240px; object-fit: cover; }
  .sidebar-actions { flex-direction: row; }
  .sb-btn { flex: 1; }
  .page-footer { flex-direction: column; gap: 4px; text-align: center; }
}

/* ─── Form View ─── */
.form-view {
  min-height: 100vh;
  background: var(--bg-primary);
  padding-bottom: 60px;
}
.form-view-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,0.96);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-color);
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
  border: 1.5px solid var(--border-color);
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
  white-space: nowrap;
}
.back-btn:hover { border-color: var(--accent); color: #4338ca; background: rgba(102,126,234,0.06); }
.form-view-ename {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.form-wrap {
  max-width: 680px;
  width: calc(100% - 32px);
  margin: 32px auto 0;
  background: var(--bg-card);
  border-radius: 20px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.07);
  padding: 36px clamp(16px, 5vw, 48px) 48px;
}
.form-wrap-header { margin-bottom: 28px; }
.form-embed-title { font-size: 1.4rem; font-weight: 900; color: var(--text-main); margin: 0 0 6px; }
.form-embed-sub   { font-size: 0.88rem; color: var(--text-muted); margin: 0; }

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
.field-group label { font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); }
.required { color: #ef4444; }
.optional  { font-weight: 400; color: var(--text-muted); font-size: 0.8rem; }

.custom-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  font-size: 0.95rem;
  color: var(--text-main);
  background: var(--bg-primary);
  outline: none;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
  &:focus {
    border-color: var(--accent);
    background: var(--bg-card);
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.14);
  }
}

.custom-select {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  font-size: 0.95rem;
  color: var(--text-main);
  background: var(--bg-primary);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  cursor: pointer;
  &:focus {
    border-color: var(--accent);
    background: var(--bg-card);
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.14);
  }
}

.field-group input {
  padding: 12px 16px;
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  font-size: 0.95rem;
  color: var(--text-main);
  background: var(--bg-primary);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.field-group input:focus {
  border-color: var(--accent);
  background: var(--bg-card);
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
  border: 1.5px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--text-secondary);
  font-weight: 600;
  background: var(--bg-primary);
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.radio-item:hover { border-color: var(--accent); background: #f0f0ff; }
.radio-item.checked {
  border-color: var(--accent);
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
  border-color: var(--accent);
  background: linear-gradient(135deg, #167A67, #0f5d4e);
  box-shadow: 0 0 0 3px rgba(102,126,234,0.2);
}
.radio-item.checked .radio-mark::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--bg-card);
}

/* Submit button */
.btn-submit {
  margin-top: 4px;
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #167A67 0%, #0f5d4e 100%);
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

/* (sticky-footer removed — replaced by sidebar buttons) */
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
