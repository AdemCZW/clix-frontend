<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { usePublicRegisterStore } from '@/stores/participants'
import LogoSpinner from '@/components/shared/LogoSpinner.vue'
import FaqSection from '@/components/registration/FaqSection.vue'
import MobileStickyBar from '@/components/registration/MobileStickyBar.vue'
import SuccessState from '@/components/registration/SuccessState.vue'
import TicketSection from '@/components/registration/TicketSection.vue'

const route = useRoute()
const store = usePublicRegisterStore()
const shortLink = String(route.params.shortLink || '')

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
const bookButtonRef = ref<HTMLElement | null>(null)
const showMobileStickyBar = ref(true)
const draftConsent = ref(false)
const hasSavedDraft = ref(false)
const draftRestored = ref(false)
const draftUpdatedAt = ref('')
let mobileStickyBarRafId: number | null = null

const getElementPageTop = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  return rect.top + window.scrollY
}

const getDraftStorageKey = () => `public-registration-draft:${shortLink}`

const formatDraftTime = (value: string) => {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const hasDraftContent = () => {
  const baseFields = [form.name, form.email, form.phone, form.company, form.title]
  const hasBaseValue = baseFields.some((value) => String(value || '').trim())
  const hasCustomValue = Object.values(dynamicValues).some((value) => String(value || '').trim())
  const hasCustomType = form.type !== '一般民眾'

  return hasBaseValue || hasCustomValue || hasCustomType
}

const removeSavedDraft = () => {
  if (typeof window === 'undefined') return

  window.sessionStorage.removeItem(getDraftStorageKey())
  hasSavedDraft.value = false
  draftRestored.value = false
  draftUpdatedAt.value = ''
}

const applyDraft = (draft: any) => {
  if (!draft || typeof draft !== 'object') return

  const savedForm = draft.form || {}
  form.name = typeof savedForm.name === 'string' ? savedForm.name : ''
  form.email = typeof savedForm.email === 'string' ? savedForm.email : ''
  form.phone = typeof savedForm.phone === 'string' ? savedForm.phone : ''
  form.company = typeof savedForm.company === 'string' ? savedForm.company : ''
  form.title = typeof savedForm.title === 'string' ? savedForm.title : ''
  form.type = typeof savedForm.type === 'string' ? savedForm.type : '一般民眾'

  const savedDynamicValues = draft.dynamicValues || {}
  Object.keys(dynamicValues).forEach((key) => {
    dynamicValues[key] = typeof savedDynamicValues[key] === 'string' ? savedDynamicValues[key] : ''
  })

  Object.keys(savedDynamicValues).forEach((key) => {
    if (typeof savedDynamicValues[key] === 'string') {
      dynamicValues[key] = savedDynamicValues[key]
    }
  })

  draftConsent.value = true
  draftRestored.value = true
  hasSavedDraft.value = true
  draftUpdatedAt.value = formatDraftTime(draft.updatedAt || '')
}

const loadSavedDraft = () => {
  if (typeof window === 'undefined') return null

  const rawDraft = window.sessionStorage.getItem(getDraftStorageKey())
  if (!rawDraft) return null

  try {
    const parsedDraft = JSON.parse(rawDraft)
    if (!parsedDraft || typeof parsedDraft !== 'object') return null
    return parsedDraft
  } catch {
    window.sessionStorage.removeItem(getDraftStorageKey())
    return null
  }
}

const refreshDraftState = () => {
  const draft = loadSavedDraft()

  if (!draft) {
    hasSavedDraft.value = false
    draftUpdatedAt.value = ''
    return
  }

  hasSavedDraft.value = true
  draftUpdatedAt.value = formatDraftTime(draft.updatedAt || '')
}

const restoreSavedDraft = () => {
  const draft = loadSavedDraft()
  if (!draft) return
  applyDraft(draft)
}

const saveDraftToSession = () => {
  if (typeof window === 'undefined') return

  if (!draftConsent.value || !hasDraftContent()) {
    removeSavedDraft()
    return
  }

  const updatedAt = new Date().toISOString()
  const payload = {
    form: {
      name: form.name,
      email: form.email,
      phone: form.phone,
      company: form.company,
      title: form.title,
      type: form.type,
    },
    dynamicValues: { ...dynamicValues },
    updatedAt,
  }

  window.sessionStorage.setItem(getDraftStorageKey(), JSON.stringify(payload))
  hasSavedDraft.value = true
  draftUpdatedAt.value = formatDraftTime(updatedAt)
}

// pageData 必須在 customFields 之前定義
const pageData = computed(() => (store.page as {
  eventName?: string
  eventDate?: string
  eventEndDate?: string
  eventTime?: string
  eventLocation?: string
  eventAddress?: string
  mainContent?: string
  banner?: string
  banner_orientation?: string
  bannerOrientation?: string
  formFields?: Array<{
    id?: number | string
    label: string
    field_type?: string
    is_required?: boolean
    is_hidden?: boolean
    is_fixed?: boolean
    options?: Array<{ order: number; text: string }>
  }>
  guests?: Array<{
    id: number
    name: string
    title: string
    company: string
    avatar: string
  }>
  tickets?: Array<{
    id: number
    name: string
    description: string
    price: number
    start_date?: string
    start_time?: string
    end_date?: string
    end_time?: string
  }>
  faqs?: Array<{
    question: string
    answer: string
  }>
  participants_count?: number
  max_participants?: number
  event_status_text?: string
} | null) ?? null)

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

const isMobile = ref(typeof window !== 'undefined' && window.innerWidth <= 768)

// Banner 方向（從後端 API 取得，不再前端偵測）
const bannerOrientation = computed(() =>
  pageData.value?.banner_orientation
  || pageData.value?.bannerOrientation
  || 'portrait'
)

onMounted(() => {
  loadCookieConsent()
  store.reset()
  store.fetchPage(shortLink).then(() => {
    if (store.page?.eventName) {
      document.title = `${store.page.eventName} — 活動報名`
      const metaDesc = document.querySelector('meta[name="description"]')
      if (metaDesc) metaDesc.setAttribute('content', `${store.page.eventName} 線上報名`)
      const ogTitle = document.querySelector('meta[property="og:title"]')
      if (ogTitle) ogTitle.setAttribute('content', store.page.eventName)
    }
    nextTick(() => {
      refreshDraftState()
      updateMobileStickyBarVisibility()
    })
  }).catch(() => {})

  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', queueMobileStickyBarVisibilityCheck, { passive: true })
    window.addEventListener('resize', queueMobileStickyBarVisibilityCheck)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', queueMobileStickyBarVisibilityCheck)
    window.removeEventListener('resize', queueMobileStickyBarVisibilityCheck)
  }

  if (mobileStickyBarRafId !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(mobileStickyBarRafId)
    mobileStickyBarRafId = null
  }
})

const updateMobileStickyBarVisibility = () => {
  if (typeof window === 'undefined') {
    showMobileStickyBar.value = true
    return
  }

  isMobile.value = window.innerWidth <= 768

  if (window.innerWidth > 768) {
    showMobileStickyBar.value = false
    return
  }

  if (!bookButtonRef.value || showForm.value) {
    showMobileStickyBar.value = false
    return
  }

  const buttonTop = getElementPageTop(bookButtonRef.value)
  const viewportBottom = window.scrollY + window.innerHeight

  // 畫面底部碰到按鈕位置 → 隱藏底部浮動列
  showMobileStickyBar.value = viewportBottom < buttonTop
}

const queueMobileStickyBarVisibilityCheck = () => {
  if (typeof window === 'undefined') return

  if (mobileStickyBarRafId !== null) {
    window.cancelAnimationFrame(mobileStickyBarRafId)
  }

  mobileStickyBarRafId = window.requestAnimationFrame(() => {
    updateMobileStickyBarVisibility()
    mobileStickyBarRafId = null
  })
}

watch(bookButtonRef, async (el) => {
  if (!el || showForm.value) return
  await nextTick()
  updateMobileStickyBarVisibility()
})

watch(showForm, (formVisible) => {
  if (formVisible) {
    showMobileStickyBar.value = false
  } else {
    nextTick(() => updateMobileStickyBarVisibility())
  }
})

watch([form, dynamicValues, draftConsent, showForm], () => {
  if (!showForm.value) return
  saveDraftToSession()
}, { deep: true })

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
    removeSavedDraft()
  } catch {
    // error displayed via store.error
  } finally {
    submitting.value = false
  }
}

// 報名狀態（從後端公開頁面 API 取得）
const participantsCount = computed(() => pageData.value?.participants_count ?? 0)
const maxParticipants = computed(() => pageData.value?.max_participants ?? '∞')
const isFull = computed(() => {
  const max = pageData.value?.max_participants
  const count = pageData.value?.participants_count
  if (max && count !== undefined) return count >= max
  return false
})
const statusText = computed(() => {
  if (isFull.value) return '已額滿'
  return pageData.value?.event_status_text || '報名中'
})

const openForm = () => { showForm.value = true }
const backToInfo = () => { showForm.value = false }

// Cookie Consent
const cookieConsent = ref<'accepted' | 'declined' | null>(null)
const showCookieBanner = computed(() => cookieConsent.value === null)

const loadCookieConsent = () => {
  if (typeof window === 'undefined') return
  const saved = localStorage.getItem('cookie-consent')
  if (saved === 'accepted' || saved === 'declined') {
    cookieConsent.value = saved
  }
}

const acceptCookies = () => {
  cookieConsent.value = 'accepted'
  localStorage.setItem('cookie-consent', 'accepted')
}

const declineCookies = () => {
  cookieConsent.value = 'declined'
  localStorage.setItem('cookie-consent', 'declined')
}

const formatDate = (date: string, endDate: string, time: string) => {
  if (!date) return ''
  let str = date
  if (endDate && endDate !== date) str += ` ～ ${endDate}`
  if (time) str += ` ${time}`
  return str
}

const eventDateText = computed(() => formatDate(
  pageData.value?.eventDate || '',
  pageData.value?.eventEndDate || '',
  pageData.value?.eventTime || ''
))

const eventDateRangeText = computed(() => formatDate(
  pageData.value?.eventDate || '',
  pageData.value?.eventEndDate || '',
  ''
))

const eventMetaRows = computed(() => {
  const rows: Array<{ key: string; kind: string; text: string; subtext?: string }> = []

  if (pageData.value?.eventDate) {
    rows.push({
      key: 'date',
      kind: 'date',
      text: eventDateRangeText.value,
      subtext: pageData.value.eventTime || '',
    })
  }

  if (pageData.value?.eventLocation) {
    rows.push({
      key: 'location',
      kind: 'location',
      text: pageData.value.eventLocation,
      subtext: pageData.value.eventAddress || '',
    })
  }

  return rows
})

const eventReminderRows = computed(() => {
  const rows: Array<{ key: string; kind: string; text: string }> = []

  if (pageData.value?.eventDate) {
    rows.push({ key: 'date', kind: 'date', text: eventDateText.value })
  }

  if (pageData.value?.eventLocation) {
    rows.push({ key: 'location', kind: 'location', text: pageData.value.eventLocation })
  }

  if (pageData.value?.eventAddress) {
    rows.push({ key: 'address', kind: 'address', text: pageData.value.eventAddress })
  }

  return rows
})

const ticketTimeInfo = computed(() => {
  const t = tickets.value?.[0]
  if (!t) return ''
  const sd = t.start_date || ''
  const st = t.start_time ? String(t.start_time).slice(0, 5) : ''
  const ed = t.end_date || ''
  const et = t.end_time ? String(t.end_time).slice(0, 5) : ''
  if (!sd && !ed) return ''
  let text = '票券可使用時間：'
  if (sd) {
    text += sd
    if (st) text += ` ${st}`
  }
  if (ed && ed !== sd) {
    text += ` ～ ${ed}`
    if (et) text += ` ${et}`
  } else if (ed === sd && et) {
    text += ` ～ ${et}`
  }
  return text
})

const landscapeSummaryItems = computed(() => {
  const items: string[] = []

  if (eventDateRangeText.value) items.push(eventDateRangeText.value)
  if (pageData.value?.eventLocation) items.push(pageData.value.eventLocation)

  return items
})

const submittedQrCodeUrl = computed(() => {
  const participant = store.submittedParticipant as any
  return participant?.qr_code_url || participant?.qrCodeUrl || ''
})

const submittedCheckInToken = computed(() => {
  const participant = store.submittedParticipant as any
  return participant?.check_in_token || participant?.checkInToken || ''
})

// 貴賓列表
const guests = computed(() => pageData.value?.guests || [])

// 票券（之後從後端取，目前先用 pageData 中的資料或空陣列）
const tickets = computed(() => pageData.value?.tickets || [])
const ticketQty = reactive<Record<number, number>>({})
const changeQty = (id: number, delta: number) => {
  const cur = ticketQty[id] || 1
  ticketQty[id] = Math.max(0, cur + delta)
}
const getQty = (id: number) => ticketQty[id] ?? 1

// FAQ（之後從後端取）
const faqs = computed(() => pageData.value?.faqs || [])
const faqOpen = ref<number | null>(null)
const toggleFaq = (i: number) => { faqOpen.value = faqOpen.value === i ? null : i }
</script>

<template>
  <div class="public-page">

    <!-- Loading -->
    <div v-if="store.loading && !pageData" class="state-screen">
      <LogoSpinner :size="48" />
      <p>載入頁面中...</p>
    </div>

    <!-- Error -->
    <div v-else-if="store.error && !pageData" class="state-screen error-screen">
      <div class="state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <h2>無法開啟報名頁面</h2>
      <p>{{ store.error }}</p>
    </div>

    <!-- Success -->
    <SuccessState
      v-else-if="store.submitted && store.submittedParticipant"
      :participant-name="store.submittedParticipant.name"
      :qr-code-url="submittedQrCodeUrl"
      :check-in-token="submittedCheckInToken"
      :rows="eventReminderRows"
      :ticket-info="ticketTimeInfo"
    />

    <!-- Info Page -->
    <template v-else-if="pageData && !showForm">

      <!-- 橫式 Banner：全寬頂部 -->
      <div v-if="bannerOrientation === 'landscape' && pageData.banner" class="hero-banner">
        <img :src="pageData.banner" :alt="pageData.eventName" />
      </div>

      <div class="info-layout" :class="{ 'layout-landscape': bannerOrientation === 'landscape' }">

        <!-- 直式：左側欄有 Banner + 資訊 -->
        <!-- 橫式：右側欄只有資訊（用 CSS order 調到右邊） -->
        <aside class="info-sidebar">
          <div class="sidebar-sticky">
            <!-- 直式 Banner -->
            <div class="sidebar-banner" v-if="bannerOrientation === 'portrait' && pageData.banner">
              <img :src="pageData.banner" :alt="pageData.eventName" />
            </div>

            <!-- 活動資訊 -->
            <div class="sidebar-meta">
              <div v-for="row in eventMetaRows" :key="`sidebar-${row.key}`" class="meta-row">
                <svg v-if="row.kind === 'date'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div v-if="row.kind === 'location'">
                  <span>{{ row.text }}</span>
                  <p v-if="row.subtext" class="meta-sub">{{ row.subtext }}</p>
                </div>
                <span v-else>
                  {{ row.text }}<br v-if="row.subtext"/><template v-if="row.subtext">{{ row.subtext }}</template>
                </span>
              </div>
            </div>

            <!-- 按鈕 -->
            <div class="sidebar-actions">
              <button class="sb-btn primary" @click="openForm" :disabled="isFull">立即報名</button>
              <button class="sb-btn outline">聯絡主辦單位</button>
            </div>

            <!-- 橫式：來賓頭像放在右側欄底部 -->
            <div v-if="bannerOrientation === 'landscape' && guests.length" class="sidebar-guests">
              <div v-for="g in guests" :key="g.id" class="sg-item">
                <div class="sg-avatar">
                  <img v-if="g.avatar" :src="g.avatar" :alt="g.name" />
                  <span v-else>{{ g.name?.charAt(0) }}</span>
                </div>
                <div class="sg-name">{{ g.name }}</div>
                <div class="sg-role">{{ g.company }}</div>
              </div>
            </div>
          </div>
        </aside>

        <!-- ===== 主內容 ===== -->
        <main class="info-main">
          <span v-if="bannerOrientation === 'portrait'" class="p-tag">UPCOMING EVENT</span>
          <h1 class="p-title">{{ pageData.eventName }}</h1>
          <!-- 橫式：標題下方小字標籤 -->
          <div v-if="bannerOrientation === 'landscape' && landscapeSummaryItems.length" class="p-sub-tags">
            <span v-for="item in landscapeSummaryItems" :key="item">{{ item }}</span>
          </div>

          <div v-if="isFull" class="full-alert">報名已截止，名額已滿</div>

          <!-- 活動內文 -->
          <div v-if="pageData.mainContent" class="p-main-body-render" v-html="pageData.mainContent"></div>

          <!-- 貴賓列表（直式顯示在內文區，橫式桌面版在右側欄、手機版也在此處） -->
          <div v-if="guests.length && (bannerOrientation === 'portrait' || isMobile)" class="guests-section">
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

          <!-- 手機版立即報名按鈕：放在貴賓區下方 -->
          <button ref="bookButtonRef" class="btn-book-full mobile-only" @click="openForm" :disabled="isFull">
            {{ isFull ? '已額滿' : '立即報名' }}
          </button>

          <!-- 票券選擇 -->
          <TicketSection :tickets="tickets" :get-qty="getQty" @change-qty="changeQty" />

          <!-- 立即報名按鈕 -->
          <button class="btn-book-full desktop-only" @click="openForm" :disabled="isFull">
            {{ isFull ? '已額滿' : '立即報名' }}
          </button>

          <!-- 常見問答 FAQ -->
          <FaqSection :faqs="faqs" :open-index="faqOpen ?? undefined" @toggle="toggleFaq" />

          <!-- 活動地點 -->
          <div v-if="pageData.eventAddress || pageData.eventLocation" class="venue-section">
            <h2 class="section-heading">活動地點</h2>
            <div class="venue-map">
              <iframe
                :src="`https://maps.google.com/maps?q=${encodeURIComponent((pageData.eventAddress || '') + ' ' + (pageData.eventLocation || ''))}&output=embed&z=16`"
                width="100%" height="220" style="border:0; border-radius:10px;" allowfullscreen loading="lazy"
              ></iframe>
            </div>
            <div class="venue-info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#337168" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
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

      <MobileStickyBar :rows="eventReminderRows" :is-full="isFull" :visible="showMobileStickyBar" @open-form="openForm" />

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
        <div v-if="hasSavedDraft && !draftRestored" class="draft-banner">
          <div>
            <strong>偵測到上次暫存資料</strong>
            <p>{{ draftUpdatedAt ? `上次保存時間：${draftUpdatedAt}` : '可選擇恢復剛才尚未送出的資料。' }}</p>
          </div>
          <div class="draft-banner-actions">
            <button type="button" class="draft-action primary" @click="restoreSavedDraft">恢復資料</button>
            <button type="button" class="draft-action" @click="removeSavedDraft">清除草稿</button>
          </div>
        </div>
        <div v-else-if="draftRestored" class="draft-banner restored">
          <div>
            <strong>已恢復暫存資料</strong>
            <p>你可以繼續填寫，送出後系統會自動清除本次暫存。</p>
          </div>
          <div class="draft-banner-actions">
            <button type="button" class="draft-action" @click="removeSavedDraft">清除草稿</button>
          </div>
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

          <div class="draft-consent" :class="{ checked: draftConsent }">
            <label class="draft-consent-label">
              <input v-model="draftConsent" type="checkbox" />
              <span>
                我同意系統於此瀏覽分頁中暫存已填寫的報名資料，方便稍後回來繼續填寫。
              </span>
            </label>
            <p class="draft-consent-note">
              僅暫存在目前瀏覽器分頁中，送出報名或手動清除後會移除。
              <span v-if="draftConsent && draftUpdatedAt">最近保存：{{ draftUpdatedAt }}</span>
            </p>
          </div>

          <button type="submit" class="btn-submit" :disabled="submitting">
            <span v-if="submitting" class="btn-spinner"></span>
            <span>{{ submitting ? '送出中...' : '確認報名' }}</span>
          </button>

        </form>
      </div>
    </div>

    <!-- Cookie Consent Banner -->
    <Transition name="cookie-banner">
      <div v-if="showCookieBanner" class="cookie-banner">
        <div class="cookie-content">
          <p class="cookie-text">
            本網站使用 Cookie 及相關技術來改善您的瀏覽體驗，並用於暫存您的報名資料。繼續使用本網站即表示您同意我們使用 Cookie。
          </p>
          <div class="cookie-actions">
            <button class="cookie-btn decline" @click="declineCookies">拒絕</button>
            <button class="cookie-btn accept" @click="acceptCookies">接受所有 Cookie</button>
          </div>
        </div>
      </div>
    </Transition>

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
  border-top-color: #337168;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 4rem; line-height: 1; }
.error-screen h2 { color: #ef4444; margin: 0; font-size: 1.6rem; }
.error-screen p  { color: var(--text-muted); margin: 0; }

/* ─── 頁面底色 ─── */
.public-page { background: #f5f5f0; min-height: 100vh; }

/* ─── Banner ─── */
/* ─── 橫式 Banner 全寬（sticky 視差效果） ─── */
.hero-banner {
  width: 100%; max-height: 420px; overflow: hidden;
  position: sticky; top: 0; z-index: 1;
}
.hero-banner img {
  width: 100%; height: auto; display: block; object-fit: cover; max-height: 420px;
}

/* ─── Info Layout（左右兩欄，合併成一個白色卡片） ─── */
.info-layout {
  margin: -28px auto 0;
  position: relative; z-index: 2;
  padding: 0 0 60px;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 0;
  align-items: start;
  background: #f5f5f0;
  border-radius: 14px 14px 0 0;
  border: 1px solid #e8e8e4;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
/* 橫式佈局：內文在左，資訊卡在右 */
.layout-landscape { grid-template-columns: 1fr 320px; }
.layout-landscape .info-sidebar { order: 2; }
.layout-landscape .info-main { order: 1; }

/* 直式佈局：圖片+資訊在左，內文在右 */
.info-layout:not(.layout-landscape) { grid-template-columns: 280px 1fr; }
.info-layout:not(.layout-landscape) .info-sidebar { order: 1; }
.info-layout:not(.layout-landscape) .info-main { order: 2; }

/* 側欄（活動資訊卡） */
.info-sidebar { min-width: 0; border-left: 1px solid #e8e8e4; }
.info-layout:not(.layout-landscape) .info-sidebar { border-left: none; border-right: 1px solid #e8e8e4; }
.sidebar-sticky { position: sticky; top: 24px; padding: 24px; }
.sidebar-banner img {
  width: 100%; border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}
.sidebar-meta {
  margin-top: 16px; display: flex; flex-direction: column; gap: 10px;
  padding: 14px; background: #fff; border-radius: 10px;
  border: 1px solid #e8e8e4;
}
.meta-row {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: .86rem; color: #334155; line-height: 1.4;
}
.meta-row svg { flex-shrink: 0; margin-top: 2px; color: #337168; }
.meta-sub { margin: 2px 0 0; font-size: .78rem; color: #94a3b8; line-height: 1.3; }
.sidebar-actions {
  margin-top: 14px; display: flex; flex-direction: column; gap: 8px;
}
.sb-btn {
  width: 100%; padding: 12px 0; border-radius: 10px;
  font-size: .9rem; font-weight: 600; cursor: pointer;
  transition: .15s; text-align: center; border: none;
}
.sb-btn.primary { background: #337168; color: #fff; }
.sb-btn.primary:hover { background: #2a5c54; }
.sb-btn.outline {
  background: #fff; color: #334155;
  border: 1.5px solid #d1d5db;
}
.sb-btn.outline:hover { background: #f9fafb; }
.sb-btn:disabled { opacity: .5; cursor: not-allowed; }

/* 主內容區域 */
.info-main {
  min-width: 0; padding: 28px 32px;
}

.p-tag {
  display: inline-block;
  background: #337168; color: #fff;
  padding: 5px 14px; border-radius: 4px;
  font-size: 0.68rem; font-weight: 800;
  letter-spacing: 0.1em; text-transform: uppercase;
  margin-bottom: 12px;
}
.p-title {
  font-size: clamp(1.3rem, 2.5vw, 1.6rem);
  font-weight: 800;
  margin: 0 0 16px;
  color: #0f172a;
  line-height: 1.35;
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
.p-main-body-render :deep(h3) { border-left: 3px solid #337168; padding-left: 10px; }
.p-main-body-render :deep(img) { max-width: 100%; border-radius: 8px; }
.p-main-body-render :deep(a) { color: #337168; font-weight: 600; }
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
  padding: 16px 24px;
  display: flex; justify-content: space-between;
  font-size: .75rem;
  background: #3D3B3B; color: #ccc;
  border-radius: 0 0 14px 14px;
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

/* 立即報名全寬按鈕 */
.btn-book-full {
  display: block; width: 100%; padding: 16px;
  background: #337168; color: #fff; border: none;
  border-radius: 10px; font-size: 1rem; font-weight: 700;
  cursor: pointer; transition: .15s; margin: 32px 0;
}
.btn-book-full:hover:not(:disabled) { background: #2a5c54; }
.btn-book-full:disabled { opacity: .5; cursor: not-allowed; }

.mobile-only { display: none; }
.desktop-only { display: block; }

/* 活動地點 */
.venue-map { margin-bottom: 12px; border-radius: 10px; overflow: hidden; }
.venue-addr { margin: 4px 0 0; font-size: .88rem; color: #64748b; }
.venue-map {
  margin-top: 12px; border-radius: 12px; overflow: hidden;
  border: 1px solid #e2e8f0; height: 200px;
}
.venue-map iframe { width: 100%; height: 100%; border: none; }

/* 報名截止 */
.full-alert {
  background: #fef2f2; color: #dc2626;
  padding: 12px 16px; border-radius: 8px;
  font-size: .88rem; font-weight: 600;
  margin-bottom: 20px; border: 1px solid #fecaca;
}

/* 橫式佈局：左邊內文（寬）+ 右邊資訊卡片（窄） */
.layout-landscape {
  grid-template-columns: 1fr 280px;
}
.layout-landscape .info-main { order: -1; }  /* 內文排左邊 */
.layout-landscape .info-sidebar { order: 1; }  /* 資訊排右邊 */
.layout-landscape .sidebar-meta { margin-top: 0; }
.layout-landscape .sidebar-sticky { top: 24px; }

/* 橫式右欄來賓 */
.sidebar-guests {
  display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px;
  justify-content: center;
}
.sg-item { text-align: center; width: 56px; }
.sg-avatar {
  width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 4px;
  background: #2A3A39; display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.sg-avatar img { width: 100%; height: 100%; object-fit: cover; }
.sg-avatar span { color: #fff; font-size: .9rem; font-weight: 700; }
.sg-name { font-size: .68rem; font-weight: 600; color: #0f172a; }
.sg-role { font-size: .58rem; color: #94a3b8; }

/* 橫式標題下方標籤列 */
.p-sub-tags {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;
  font-size: .82rem; color: #64748b;
}
.p-sub-tags span {
  display: inline-flex; align-items: center; gap: 4px;
}
.p-sub-tags span::before {
  content: '·'; margin-right: 2px; color: #94a3b8;
}
.p-sub-tags span:first-child::before { display: none; }

/* RWD */
@media (max-width: 768px) {
  .hero-banner { max-height: 240px; }
  .hero-banner img { max-height: 240px; }
  .info-layout {
    grid-template-columns: 1fr;
    padding: 16px 16px 220px;
    gap: 0;
  }
  .info-sidebar { display: none; }
  .sidebar-sticky { position: static; }
  .sidebar-banner img { max-height: 240px; object-fit: cover; }
  .page-footer { flex-direction: column; gap: 4px; text-align: center; }
  .mobile-only { display: block; }
  .desktop-only { display: none; }
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

.draft-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid #dbeafe;
  background: #eff6ff;
  border-radius: 12px;
}

.draft-banner strong {
  display: block;
  font-size: 0.92rem;
  color: #0f172a;
  margin-bottom: 4px;
}

.draft-banner p {
  margin: 0;
  font-size: 0.82rem;
  color: #475569;
}

.draft-banner.restored {
  border-color: #d1fae5;
  background: #ecfdf5;
}

.draft-banner-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.draft-action {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.draft-action.primary {
  background: #337168;
  border-color: #337168;
  color: #fff;
}

.draft-consent {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fafaf8;
}

.draft-consent.checked {
  border-color: #bfded8;
  background: #f4fbf9;
}

.draft-consent-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}

.draft-consent-label input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
}

.draft-consent-note {
  margin: 8px 0 0 28px;
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.6;
}

.reg-form { display: flex; flex-direction: column; gap: 20px; }
.form-row.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 520px) { .form-row.two-col { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .draft-banner {
    flex-direction: column;
  }

  .draft-banner-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .draft-action {
    flex: 1;
  }

  .draft-consent-note {
    margin-left: 0;
  }
}

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
  background: linear-gradient(135deg, #337168, #2a5c54);
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
  background: linear-gradient(135deg, #337168 0%, #2a5c54 100%);
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

/* ─── Cookie Consent Banner ─── */
.cookie-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: rgba(30, 41, 59, 0.97);
  backdrop-filter: blur(8px);
  padding: 20px 24px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
}

.cookie-content {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 24px;
}

.cookie-text {
  flex: 1;
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.6;
  color: #cbd5e1;
}

.cookie-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.cookie-btn {
  padding: 10px 22px;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
  white-space: nowrap;
}

.cookie-btn.accept {
  background: #337168;
  color: #fff;
}
.cookie-btn.accept:hover {
  background: #2a5c54;
}

.cookie-btn.decline {
  background: transparent;
  color: #94a3b8;
  border: 1px solid #475569;
}
.cookie-btn.decline:hover {
  background: #334155;
  color: #e2e8f0;
}

.cookie-banner-enter-active,
.cookie-banner-leave-active {
  transition: transform 0.35s ease, opacity 0.35s ease;
}
.cookie-banner-enter-from,
.cookie-banner-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

@media (max-width: 768px) {
  .cookie-content {
    flex-direction: column;
    gap: 16px;
  }
  .cookie-actions {
    width: 100%;
  }
  .cookie-btn {
    flex: 1;
    text-align: center;
  }
}
</style>
