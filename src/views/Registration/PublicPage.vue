<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import DOMPurify from 'dompurify'
import { usePublicRegisterStore } from '@/stores/participants'
import LogoSpinner from '@/components/shared/LogoSpinner.vue'
import FaqSection from '@/components/registration/FaqSection.vue'
import MobileStickyBar from '@/components/registration/MobileStickyBar.vue'
import SuccessState from '@/components/registration/SuccessState.vue'
import TicketSection from '@/components/registration/TicketSection.vue'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const store = usePublicRegisterStore()
const { error: toastError } = useToast()
const shortLink = String(route.params.shortLink || '')

// ─── Buyer / 訂購人（依後端 form_fields 中 buyer_* 是否顯示來決定要不要呈現區塊）───
const buyerForm = reactive({
  name: '',
  email: '',
  phone: '',
})

// ─── Order-level 欄位（note / promo_code）───
const orderExtras = reactive({
  note: '',
  promoCode: '',
})

// ─── Attendee 表單（每張票對應 1 個）───
type AttendeeData = {
  name: string
  email: string
  phone: string
  company: string
  title: string
  type: string
  formAnswers: Record<string, string>
}

interface AttendeeForm {
  uid: string                    // v-for 穩定 key，重 sync 時保留資料
  ticketId: number | null        // null = 此頁完全沒有票券設定
  ticketName: string             // UI 標示用
  data: AttendeeData
}

const attendeeForms = ref<AttendeeForm[]>([])

const formErrors = ref<Record<string, string>>({})
const submitting = ref(false)
const showForm = ref(false)
const bookButtonRef = ref<HTMLElement | null>(null)
const showMobileStickyBar = ref(true)
const draftConsent = ref(false)
const hasSavedDraft = ref(false)
const draftRestored = ref(false)
const draftBannerCollapsed = ref(false)
const toggleDraftBanner = () => { draftBannerCollapsed.value = !draftBannerCollapsed.value }
const draftUpdatedAt = ref('')
let mobileStickyBarRafId: number | null = null

const getElementPageTop = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  return rect.top + window.scrollY
}

const getDraftStorageKey = () => `public-registration-draft:${shortLink}`

// 草稿過期時間：24 小時。超過自動清掉避免「上週的票券設定 + 今天的票券設定」混在一起
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

const isDraftExpired = (updatedAt: unknown): boolean => {
  if (typeof updatedAt !== 'string' || !updatedAt) return false
  const ts = Date.parse(updatedAt)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts > DRAFT_MAX_AGE_MS
}

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
  // Buyer
  const buyerHasValue = !!(buyerForm.name || buyerForm.email || buyerForm.phone)
  // Order extras
  const orderHasValue = !!(orderExtras.note || orderExtras.promoCode)
  // Attendees
  const attendeesHaveValue = attendeeForms.value.some((a) => {
    const d = a.data
    if (d.name || d.email || d.phone || d.company || d.title) return true
    if (d.type !== '一般民眾') return true
    if (Object.values(d.formAnswers).some((v) => String(v || '').trim())) return true
    return false
  })
  return buyerHasValue || orderHasValue || attendeesHaveValue
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

  if (draft.version === 2) {
    // ── 新版（multi-attendee）─────────────────────────────
    if (draft.buyer && typeof draft.buyer === 'object') {
      buyerForm.name = String(draft.buyer.name || '')
      buyerForm.email = String(draft.buyer.email || '')
      buyerForm.phone = String(draft.buyer.phone || '')
    }
    if (draft.orderExtras && typeof draft.orderExtras === 'object') {
      orderExtras.note = String(draft.orderExtras.note || '')
      orderExtras.promoCode = String(draft.orderExtras.promoCode || '')
    }
    if (draft.ticketQty && typeof draft.ticketQty === 'object') {
      // 只套用「目前票券設定中仍存在」的 id，避免後台改過票券後恢復草稿時殘留幽靈 ticketId
      const validTicketIds = new Set(tickets.value.map((t) => t.id))
      Object.entries(draft.ticketQty).forEach(([k, v]) => {
        const id = Number(k)
        if (!Number.isFinite(id) || typeof v !== 'number') return
        if (validTicketIds.size > 0 && !validTicketIds.has(id)) return
        ticketQty[id] = v
      })
    }
    // attendeeForms 會因 ticketQty 變更而被重建，所以等下一個 tick 再填
    nextTick(() => {
      if (Array.isArray(draft.attendees)) {
        draft.attendees.forEach((dAtt: any, idx: number) => {
          const target = attendeeForms.value[idx]
          if (!target || !dAtt?.data) return
          target.data.name = String(dAtt.data.name || '')
          target.data.email = String(dAtt.data.email || '')
          target.data.phone = String(dAtt.data.phone || '')
          target.data.company = String(dAtt.data.company || '')
          target.data.title = String(dAtt.data.title || '')
          target.data.type = String(dAtt.data.type || '一般民眾')
          if (dAtt.data.formAnswers && typeof dAtt.data.formAnswers === 'object') {
            target.data.formAnswers = { ...dAtt.data.formAnswers }
          }
        })
      }
    })
  } else {
    // ── 舊版（v1，單一 attendee）相容載入 ─────────────────
    const savedForm = draft.form || {}
    if (attendeeForms.value.length > 0) {
      const a = attendeeForms.value[0]
      a.data.name = String(savedForm.name || '')
      a.data.email = String(savedForm.email || '')
      a.data.phone = String(savedForm.phone || '')
      a.data.company = String(savedForm.company || '')
      a.data.title = String(savedForm.title || '')
      a.data.type = String(savedForm.type || '一般民眾')
      const savedDV = draft.dynamicValues || {}
      Object.keys(savedDV).forEach((k) => {
        if (typeof savedDV[k] === 'string') a.data.formAnswers[k] = savedDV[k]
      })
    }
  }

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
    if (isDraftExpired(parsedDraft.updatedAt)) {
      window.sessionStorage.removeItem(getDraftStorageKey())
      return null
    }
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
    version: 2,
    buyer: { ...buyerForm },
    orderExtras: { ...orderExtras },
    ticketQty: { ...ticketQty },
    attendees: attendeeForms.value.map((a) => ({
      uid: a.uid,
      ticketId: a.ticketId,
      data: {
        name: a.data.name,
        email: a.data.email,
        phone: a.data.phone,
        company: a.data.company,
        title: a.data.title,
        type: a.data.type,
        formAnswers: { ...a.data.formAnswers },
      },
    })),
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
    field_key?: string
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
  eventContactLink?: string
} | null) ?? null)

// 系統 field_key 分流：每個 key 渲染到不同位置
const HARDCODED_ATTENDEE_KEYS = new Set(['name', 'email', 'phone'])
const BUYER_KEYS = new Set(['buyer_name', 'buyer_email', 'buyer_phone'])
const ORDER_KEYS = new Set(['note', 'promo_code'])

// 訂購人區塊欄位（buyer_*）— 只有未隱藏才出現
const buyerFields = computed(() =>
  (pageData.value?.formFields || []).filter(
    (f) => f.field_key && BUYER_KEYS.has(f.field_key) && !f.is_hidden
  )
)

// 訂單層欄位（note、promo_code）— 表單底部單獨區塊
const orderFields = computed(() =>
  (pageData.value?.formFields || []).filter(
    (f) => f.field_key && ORDER_KEYS.has(f.field_key) && !f.is_hidden
  )
)

// 每位 attendee 都會看到的自訂欄位
//   - 未隱藏
//   - 不是 hardcoded（name/email/phone 有專屬 UI）
//   - 不是 buyer_*（在 buyer 區塊渲染）
//   - 不是 note/promo_code（在訂單區塊渲染）
const attendeeCustomFields = computed(() =>
  (pageData.value?.formFields || []).filter((f) => {
    if (f.is_hidden) return false
    if (!f.field_key) return true                              // 純自訂欄位
    if (HARDCODED_ATTENDEE_KEYS.has(f.field_key)) return false
    if (BUYER_KEYS.has(f.field_key)) return false
    if (ORDER_KEYS.has(f.field_key)) return false
    return true
  })
)

const showBuyerBlock = computed(() => buyerFields.value.length > 0)

// ─── 票券與 attendee 表單同步 ────────────────────────────
const tickets = computed(() => pageData.value?.tickets || [])
const ticketQty = reactive<Record<number, number>>({})

// 決議 3：單一票種預設 1，多票種預設 0
watch(tickets, (list) => {
  if (!list.length) return
  if (list.length === 1) {
    if (ticketQty[list[0].id] === undefined) ticketQty[list[0].id] = 1
  } else {
    list.forEach((t) => {
      if (ticketQty[t.id] === undefined) ticketQty[t.id] = 0
    })
  }
}, { immediate: true })

const changeQty = (id: number, delta: number) => {
  const cur = ticketQty[id] ?? 0
  ticketQty[id] = Math.max(0, cur + delta)
}
const getQty = (id: number) => ticketQty[id] ?? 0

const totalTicketCount = computed(() =>
  Object.values(ticketQty).reduce((sum, q) => sum + (q || 0), 0)
)

// 每張票對應 1 個 slot；無票券活動則永遠 1 個 slot
type TicketSlot = { ticketId: number | null; ticketName: string }

const ticketSlots = computed<TicketSlot[]>(() => {
  if (tickets.value.length === 0) {
    return [{ ticketId: null, ticketName: '' }]
  }
  const slots: TicketSlot[] = []
  for (const t of tickets.value) {
    const q = ticketQty[t.id] ?? 0
    for (let i = 0; i < q; i++) slots.push({ ticketId: t.id, ticketName: t.name })
  }
  return slots
})

const createEmptyAttendee = (ticketId: number | null, ticketName: string): AttendeeForm => ({
  uid: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  ticketId,
  ticketName,
  data: {
    name: '', email: '', phone: '',
    company: '', title: '', type: '一般民眾',
    formAnswers: {},
  },
})

// 同步 attendeeForms：依 (ticketId, position) 重用既有 attendee 資料，避免改 qty 時清空已填內容
watch(ticketSlots, (slots) => {
  const reusableMap = new Map<string, AttendeeForm>()
  const usedCount = new Map<number | null, number>()
  for (const a of attendeeForms.value) {
    const pos = usedCount.get(a.ticketId) ?? 0
    reusableMap.set(`${a.ticketId}_${pos}`, a)
    usedCount.set(a.ticketId, pos + 1)
  }

  const slotPosCount = new Map<number | null, number>()
  attendeeForms.value = slots.map((slot) => {
    const pos = slotPosCount.get(slot.ticketId) ?? 0
    slotPosCount.set(slot.ticketId, pos + 1)
    const reused = reusableMap.get(`${slot.ticketId}_${pos}`)
    if (reused) {
      reused.ticketName = slot.ticketName
      return reused
    }
    return createEmptyAttendee(slot.ticketId, slot.ticketName)
  })
}, { immediate: true })

// ─── 進度條 + attendee 折疊（手機版超長表單 UX 優化） ────────
const PROGRESS_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isAttendeeComplete = (att: AttendeeForm): boolean => {
  if (!att.data.name.trim()) return false
  if (!att.data.email.trim() || !PROGRESS_EMAIL_RE.test(att.data.email)) return false
  if (!att.data.phone.trim()) return false
  for (const f of attendeeCustomFields.value) {
    if (!f.is_required) continue
    const key = String(f.id ?? f.label)
    if (!String(att.data.formAnswers[key] ?? '').trim()) return false
  }
  return true
}

const requiredFieldsTotal = computed(() => {
  let n = 0
  if (showBuyerBlock.value) n += 3
  if (tickets.value.length > 0) n += 1
  attendeeForms.value.forEach(() => {
    n += 3
    attendeeCustomFields.value.forEach((f) => { if (f.is_required) n += 1 })
  })
  return n
})

const requiredFieldsFilled = computed(() => {
  let n = 0
  if (showBuyerBlock.value) {
    if (buyerForm.name.trim()) n++
    if (buyerForm.email.trim() && PROGRESS_EMAIL_RE.test(buyerForm.email)) n++
    if (buyerForm.phone.trim()) n++
  }
  if (tickets.value.length > 0 && totalTicketCount.value > 0) n++
  attendeeForms.value.forEach((att) => {
    if (att.data.name.trim()) n++
    if (att.data.email.trim() && PROGRESS_EMAIL_RE.test(att.data.email)) n++
    if (att.data.phone.trim()) n++
    attendeeCustomFields.value.forEach((f) => {
      if (!f.is_required) return
      const key = String(f.id ?? f.label)
      if (String(att.data.formAnswers[key] ?? '').trim()) n++
    })
  })
  return n
})

const progressPercent = computed(() => {
  if (requiredFieldsTotal.value === 0) return 0
  return Math.min(100, Math.round((requiredFieldsFilled.value / requiredFieldsTotal.value) * 100))
})

// 折疊狀態：半自動 — 使用者可手動 toggle；attendee 從「不完整 → 完整」transition 時自動折疊一次
//
// 規則（依尤達決策）：
// 1. attendee N 從不完整變完整 + 後面還有未完整的 attendee → auto-fold N（讓使用者注意力轉到下一位）
// 2. 使用者手動展開過的 attendee（manuallyExpandedUids）永遠不再 auto-fold（防止干擾「填完想回頭改」）
// 3. mount / reload / fetch 不觸發 auto-fold（用 firstWatchSync flag）
const collapsedAttendeeIds = ref<Set<string>>(new Set())
const manuallyExpandedUids = ref<Set<string>>(new Set())
const attendeePrevComplete = new Map<string, boolean>()
let attendeeAutoFoldReady = false  // 第一次 watch 觸發完才允許 auto-fold（避免 mount/draft 載入時誤折）

const isAttendeeCollapsed = (uid: string) => collapsedAttendeeIds.value.has(uid)
const toggleAttendeeCollapse = (uid: string) => {
  const wasCollapsed = collapsedAttendeeIds.value.has(uid)
  const next = new Set(collapsedAttendeeIds.value)
  if (wasCollapsed) {
    next.delete(uid)
    // 使用者手動展開 → 鎖住，之後 transition 不再 auto-fold
    const expanded = new Set(manuallyExpandedUids.value)
    expanded.add(uid)
    manuallyExpandedUids.value = expanded
  } else {
    next.add(uid)
  }
  collapsedAttendeeIds.value = next
}

// 監聽每位 attendee 的「完成」狀態，做半自動折疊
watch(
  () => attendeeForms.value.map((a) => ({ uid: a.uid, complete: isAttendeeComplete(a) })),
  (curr) => {
    if (!attendeeAutoFoldReady) {
      // 第一次 sync：只記狀態，不 fold（避免 draft 恢復成完整時誤折）
      curr.forEach((c) => attendeePrevComplete.set(c.uid, c.complete))
      attendeeAutoFoldReady = true
      return
    }
    let nextCollapsed: Set<string> | null = null
    curr.forEach((c, idx) => {
      const prev = attendeePrevComplete.get(c.uid) ?? false
      // 不完整 → 完整 transition + 還沒手動展開過 + 後面還有未完成的 attendee
      if (!prev && c.complete && !manuallyExpandedUids.value.has(c.uid)) {
        const hasNextIncomplete = curr.slice(idx + 1).some((cc) => !cc.complete)
        if (hasNextIncomplete && !collapsedAttendeeIds.value.has(c.uid)) {
          if (!nextCollapsed) nextCollapsed = new Set(collapsedAttendeeIds.value)
          nextCollapsed.add(c.uid)
        }
      }
      attendeePrevComplete.set(c.uid, c.complete)
    })
    if (nextCollapsed) collapsedAttendeeIds.value = nextCollapsed
  },
  { deep: false }
)

const isMobile = ref(typeof window !== 'undefined' && window.innerWidth <= 768)

// Banner 方向（從後端 API 取得，不再前端偵測）
const ALLOWED_IFRAME_HOSTS = [
  'www.google.com',       // Google Maps
  'maps.google.com',
  'www.youtube.com',      // YouTube
  'youtube.com',
  'player.vimeo.com',     // Vimeo
  'www.google.com.tw',
]

const sanitizedMainContent = computed(() => {
  const raw = pageData.value?.mainContent || ''
  const clean = DOMPurify.sanitize(raw, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['target', 'allowfullscreen', 'frameborder'],
  })
  // 過濾 iframe src，只允許白名單來源
  const div = document.createElement('div')
  div.innerHTML = clean
  // 過濾 iframe src
  div.querySelectorAll('iframe').forEach((frame) => {
    try {
      const host = new URL(frame.src).hostname
      if (!ALLOWED_IFRAME_HOSTS.includes(host)) {
        frame.remove()
      }
    } catch {
      frame.remove()
    }
  })
  // 所有外連補 rel="noopener noreferrer" 防 tabnabbing
  div.querySelectorAll('a[target="_blank"]').forEach((link) => {
    link.setAttribute('rel', 'noopener noreferrer')
  })
  return div.innerHTML
})

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

  // 卸載時清掉 pending draft save，避免元件已銷毀仍寫入 sessionStorage
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer)
    draftSaveTimer = null
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

let draftSaveTimer: ReturnType<typeof setTimeout> | null = null
watch([buyerForm, attendeeForms, orderExtras, ticketQty, draftConsent, showForm], () => {
  if (!showForm.value) return
  if (draftSaveTimer) clearTimeout(draftSaveTimer)
  draftSaveTimer = setTimeout(() => saveDraftToSession(), 1000)
}, { deep: true })

// ─── 驗證 ───────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validate = () => {
  const errs: Record<string, string> = {}

  // 1) Buyer 區塊（顯示時才驗證）
  if (showBuyerBlock.value) {
    if (!buyerForm.name.trim()) errs.buyer_name = '請填寫訂購人姓名'
    if (!buyerForm.email.trim()) errs.buyer_email = '請填寫訂購人 Email'
    else if (!EMAIL_RE.test(buyerForm.email)) errs.buyer_email = '訂購人 Email 格式不正確'
    if (!buyerForm.phone.trim()) errs.buyer_phone = '請填寫訂購人電話'
  }

  // 2) 至少要選一張票（活動有票券設定時）
  if (tickets.value.length > 0 && totalTicketCount.value === 0) {
    errs.tickets = '請至少選擇一張票券'
  }

  // 3) 每位 attendee 三必填 + 自訂欄位
  attendeeForms.value.forEach((att, idx) => {
    const prefix = `att_${att.uid}`
    const label = `第 ${idx + 1} 位參加人`

    if (!att.data.name.trim()) errs[`${prefix}_name`] = `請填寫${label}姓名`
    if (!att.data.email.trim()) errs[`${prefix}_email`] = `請填寫${label} Email`
    else if (!EMAIL_RE.test(att.data.email)) errs[`${prefix}_email`] = `${label} Email 格式不正確`
    if (!att.data.phone.trim()) errs[`${prefix}_phone`] = `請填寫${label}電話`

    attendeeCustomFields.value.forEach((f) => {
      if (!f.is_required) return
      const key = String(f.id ?? f.label)
      if (!String(att.data.formAnswers[key] ?? '').trim()) {
        errs[`${prefix}_custom_${key}`] = `${label}：請填寫${f.label}`
      }
    })
  })

  formErrors.value = errs
  return Object.keys(errs).length === 0
}

// ─── 送出 ───────────────────────────────────────────────
const handleSubmit = async () => {
  if (!validate()) {
    // 驗證失敗自動捲到第一個錯欄位 + focus（手機版超長表單必要）
    await nextTick()
    const firstError = document.querySelector<HTMLElement>('.has-error, .form-tickets-error')
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const input = firstError.querySelector<HTMLElement>('input, textarea, select')
      // 等 scroll 動畫先跑（300ms 大約是 smooth scroll 完成時間）
      if (input) setTimeout(() => input.focus({ preventScroll: true }), 350)
    }
    return
  }
  submitting.value = true
  try {
    // Buyer 來源：showBuyerBlock 為真用 buyerForm，否則沿用第一位 attendee
    const firstAtt = attendeeForms.value[0]?.data
    const buyer = showBuyerBlock.value
      ? {
          name: buyerForm.name.trim(),
          email: buyerForm.email.trim(),
          phone: buyerForm.phone.trim(),
        }
      : {
          name: firstAtt?.name.trim() ?? '',
          email: firstAtt?.email.trim() ?? '',
          phone: firstAtt?.phone.trim() ?? '',
        }

    // 組 attendees（form_answers 用 label 為 key，與既有 store 慣例一致）
    const attendees = attendeeForms.value.map((att) => {
      const formAnswers: Record<string, string> = {}
      attendeeCustomFields.value.forEach((f) => {
        const key = String(f.id ?? f.label)
        const v = (att.data.formAnswers[key] ?? '').trim()
        if (v) formAnswers[f.label] = v
      })
      const payload: Record<string, unknown> = {
        name: att.data.name.trim(),
        email: att.data.email.trim(),
        phone: att.data.phone.trim(),
        type: att.data.type,
      }
      if (att.data.company) payload.company = att.data.company
      if (att.data.title) payload.title = att.data.title
      if (att.ticketId !== null) payload.ticket = att.ticketId
      if (Object.keys(formAnswers).length > 0) payload.form_answers = formAnswers
      return payload
    })

    // Order-level extras
    const note = orderFields.value.some((f) => f.field_key === 'note')
      ? orderExtras.note.trim()
      : ''
    const promoCode = orderFields.value.some((f) => f.field_key === 'promo_code')
      ? orderExtras.promoCode.trim()
      : ''

    // 決議 6：一律送新格式
    await store.submitRegistration(shortLink, {
      buyer,
      attendees,
      ...(note ? { note } : {}),
      ...(promoCode ? { promo_code: promoCode } : {}),
    })
    removeSavedDraft()
  } catch {
    toastError(store.error || '報名送出失敗，請稍後再試')
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
const openContact = () => { const link = pageData.value?.eventContactLink; if (link) window.open(link, '_blank', 'noopener'); }
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

// store 已將 raw response normalize 為 camelCase PublicSubmittedParticipant，這裡不再雙讀
const submittedQrCodeUrl = computed(() => store.submittedParticipant?.qrCodeUrl ?? '')
const submittedCheckInToken = computed(() => store.submittedParticipant?.checkInToken ?? '')

// 貴賓列表
const guests = computed(() => pageData.value?.guests || [])

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

    <!-- Success（優先讀 submittedParticipants / submittedOrder；舊欄位保留作 fallback）-->
    <SuccessState
      v-else-if="store.submitted && (store.submittedParticipants.length || store.submittedParticipant)"
      :participants="store.submittedParticipants"
      :order="store.submittedOrder"
      :participant-name="store.submittedParticipant?.name"
      :qr-code-url="submittedQrCodeUrl"
      :check-in-token="submittedCheckInToken"
      :rows="eventReminderRows"
      :ticket-info="ticketTimeInfo"
    />

    <!-- Info Page -->
    <template v-else-if="pageData && !showForm">

      <!-- 橫式 Banner：全寬頂部，超過 1440px 左右毛玻璃 -->
      <div v-if="bannerOrientation === 'landscape' && pageData.banner" class="hero-banner-wrap">
        <div class="hero-banner-bg" :style="{ backgroundImage: `url(${pageData.banner})` }"></div>
        <div class="hero-banner">
          <img :src="pageData.banner" :alt="pageData.eventName" />
        </div>
      </div>

      <div class="info-layout-wrap">
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
              <button v-if="pageData.eventContactLink" class="sb-btn outline" @click="openContact">聯絡主辦單位</button>
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
          <div v-if="pageData.mainContent" class="p-main-body-render" v-html="sanitizedMainContent"></div>

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

          <!-- 票券選擇 -->
          <TicketSection :tickets="tickets" :get-qty="getQty" @change-qty="changeQty" />

          <!-- 立即報名按鈕 -->
          <button ref="bookButtonRef" class="btn-book-full" @click="openForm" :disabled="isFull">
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
      </div>

      <!-- 底部版權 -->
      <footer class="page-footer">
        <span>&copy; CLIX 活動報到系統</span>
        <span>WEBSITE DESIGNED BY CLIX</span>
      </footer>

      <MobileStickyBar :rows="eventReminderRows" :is-full="isFull" :visible="showMobileStickyBar && !showCookieBanner" :contact-link="(pageData && pageData.eventContactLink) || ''" @open-form="openForm" />

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
        <div v-if="hasSavedDraft && !draftRestored" class="draft-banner" :class="{ collapsed: draftBannerCollapsed }">
          <div class="draft-banner-main">
            <strong>偵測到上次暫存資料</strong>
            <p v-show="!draftBannerCollapsed">{{ draftUpdatedAt ? `上次保存時間：${draftUpdatedAt}` : '可選擇恢復剛才尚未送出的資料。' }}</p>
          </div>
          <div v-show="!draftBannerCollapsed" class="draft-banner-actions">
            <button type="button" class="draft-action primary" @click="restoreSavedDraft">恢復資料</button>
            <button type="button" class="draft-action" @click="removeSavedDraft">清除草稿</button>
          </div>
          <button type="button" class="draft-collapse-toggle" @click="toggleDraftBanner" :aria-label="draftBannerCollapsed ? '展開草稿訊息' : '收合草稿訊息'">
            {{ draftBannerCollapsed ? '展開 ▼' : '收合 ▲' }}
          </button>
        </div>
        <div v-else-if="draftRestored" class="draft-banner restored" :class="{ collapsed: draftBannerCollapsed }">
          <div class="draft-banner-main">
            <strong>已恢復暫存資料</strong>
            <p v-show="!draftBannerCollapsed">你可以繼續填寫，送出後系統會自動清除本次暫存。</p>
          </div>
          <div v-show="!draftBannerCollapsed" class="draft-banner-actions">
            <button type="button" class="draft-action" @click="removeSavedDraft">清除草稿</button>
          </div>
          <button type="button" class="draft-collapse-toggle" @click="toggleDraftBanner" :aria-label="draftBannerCollapsed ? '展開草稿訊息' : '收合草稿訊息'">
            {{ draftBannerCollapsed ? '展開 ▼' : '收合 ▲' }}
          </button>
        </div>
        <div v-if="isFull" class="full-alert">
          <span>報名已截止，名額已滿</span>
        </div>
        <form v-if="!isFull" @submit.prevent="handleSubmit" class="reg-form" novalidate>

          <!-- 進度條：超長表單填寫進度感（手機版尤其有用）-->
          <div v-if="requiredFieldsTotal > 0" class="form-progress" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
            <div class="form-progress-meta">
              <span class="form-progress-label">已填 {{ requiredFieldsFilled }} / 必填 {{ requiredFieldsTotal }}</span>
              <span class="form-progress-pct">{{ progressPercent }}%</span>
            </div>
            <div class="form-progress-track">
              <div class="form-progress-fill" :style="{ width: progressPercent + '%' }" :class="{ done: progressPercent === 100 }"></div>
            </div>
          </div>

          <!-- 訂購人區塊（依後端 toggle 顯示）-->
          <section v-if="showBuyerBlock" class="form-section buyer-section">
            <h3 class="section-heading">訂購人資料</h3>
            <div class="form-row two-col">
              <div class="field-group" :class="{ 'has-error': formErrors.buyer_name }">
                <label>訂購人姓名 <span class="required">*</span></label>
                <input v-model="buyerForm.name" type="text" placeholder="請輸入訂購人姓名" />
                <span class="field-error">{{ formErrors.buyer_name }}</span>
              </div>
              <div class="field-group" :class="{ 'has-error': formErrors.buyer_phone }">
                <label>訂購人電話 <span class="required">*</span></label>
                <input v-model="buyerForm.phone" type="tel" placeholder="例：0912-345-678" />
                <span class="field-error">{{ formErrors.buyer_phone }}</span>
              </div>
            </div>
            <div class="field-group" :class="{ 'has-error': formErrors.buyer_email }">
              <label>訂購人 Email <span class="required">*</span></label>
              <input v-model="buyerForm.email" type="email" placeholder="example@mail.com" />
              <span class="field-error">{{ formErrors.buyer_email }}</span>
            </div>
          </section>

          <!-- 票券數量錯誤提示 -->
          <div v-if="formErrors.tickets" class="form-tickets-error">
            <span class="field-error">{{ formErrors.tickets }}</span>
          </div>

          <!-- 參加人區塊（每張票對應 1 個；多人時可獨立折疊節省滾動）-->
          <section
            v-for="(att, idx) in attendeeForms"
            :key="att.uid"
            class="form-section attendee-section"
            :class="{ 'is-collapsed': isAttendeeCollapsed(att.uid), 'is-complete': isAttendeeComplete(att) }"
          >
            <button
              type="button"
              class="section-heading attendee-heading"
              @click="toggleAttendeeCollapse(att.uid)"
              :aria-expanded="!isAttendeeCollapsed(att.uid)"
            >
              <span class="attendee-heading-status" :class="{ done: isAttendeeComplete(att) }" aria-hidden="true">
                <svg v-if="isAttendeeComplete(att)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span v-else class="attendee-dot">{{ idx + 1 }}</span>
              </span>
              <span class="attendee-heading-text">
                <span class="attendee-heading-title">
                  參加人 {{ idx + 1 }}
                  <span v-if="att.ticketName" class="attendee-ticket-tag">（{{ att.ticketName }}）</span>
                </span>
                <span v-if="isAttendeeCollapsed(att.uid) && att.data.name" class="attendee-heading-name">{{ att.data.name }}</span>
              </span>
              <span class="attendee-heading-toggle" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </button>

            <div v-show="!isAttendeeCollapsed(att.uid)" class="attendee-body">
            <div class="form-row two-col">
              <div class="field-group" :class="{ 'has-error': formErrors[`att_${att.uid}_name`] }">
                <label>姓名 <span class="required">*</span></label>
                <input v-model="att.data.name" type="text" placeholder="請輸入姓名" />
                <span class="field-error">{{ formErrors[`att_${att.uid}_name`] }}</span>
              </div>
              <div class="field-group" :class="{ 'has-error': formErrors[`att_${att.uid}_phone`] }">
                <label>聯絡電話 <span class="required">*</span></label>
                <input v-model="att.data.phone" type="tel" placeholder="例：0912-345-678" />
                <span class="field-error">{{ formErrors[`att_${att.uid}_phone`] }}</span>
              </div>
            </div>

            <div class="field-group" :class="{ 'has-error': formErrors[`att_${att.uid}_email`] }">
              <label>電子郵件 <span class="required">*</span></label>
              <input v-model="att.data.email" type="email" placeholder="example@mail.com" />
              <span class="field-error">{{ formErrors[`att_${att.uid}_email`] }}</span>
            </div>

            <div class="form-row two-col">
              <div class="field-group">
                <label>公司／單位 <span class="optional">（選填）</span></label>
                <input v-model="att.data.company" type="text" placeholder="請輸入公司名稱" />
              </div>
              <div class="field-group">
                <label>職稱 <span class="optional">（選填）</span></label>
                <input v-model="att.data.title" type="text" placeholder="請輸入職稱" />
              </div>
            </div>

            <!-- 自定義欄位（每位 attendee 各自一份）-->
            <template v-for="field in attendeeCustomFields" :key="`${att.uid}_${field.id ?? field.label}`">
              <div class="field-group" :class="{ 'has-error': formErrors[`att_${att.uid}_custom_${String(field.id ?? field.label)}`] }">
                <label>
                  {{ field.label }}
                  <span v-if="field.is_required" class="required">*</span>
                </label>
                <select
                  v-if="field.field_type === 'select' || field.field_type === 'radio'"
                  v-model="att.data.formAnswers[String(field.id ?? field.label)]"
                  class="custom-select"
                >
                  <option value="">請選擇...</option>
                  <option v-for="opt in (field.options || [])" :key="opt.order" :value="opt.text">
                    {{ opt.text }}
                  </option>
                </select>
                <textarea
                  v-else-if="field.field_type === 'textarea'"
                  v-model="att.data.formAnswers[String(field.id ?? field.label)]"
                  :placeholder="`請輸入${field.label}`"
                  class="custom-textarea"
                  rows="3"
                ></textarea>
                <input
                  v-else
                  v-model="att.data.formAnswers[String(field.id ?? field.label)]"
                  :type="field.field_type || 'text'"
                  :placeholder="`請輸入${field.label}`"
                />
                <span class="field-error">{{ formErrors[`att_${att.uid}_custom_${String(field.id ?? field.label)}`] }}</span>
              </div>
            </template>

            <div class="field-group">
              <label>身份類別</label>
              <div class="radio-group">
                <label class="radio-item" :class="{ checked: att.data.type === '一般民眾' }">
                  <input v-model="att.data.type" type="radio" value="一般民眾" hidden />
                  <span class="radio-mark"></span>
                  <span>一般民眾</span>
                </label>
                <label class="radio-item" :class="{ checked: att.data.type === 'VIP' }">
                  <input v-model="att.data.type" type="radio" value="VIP" hidden />
                  <span class="radio-mark"></span>
                  <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> VIP</span>
                </label>
              </div>
            </div>
            </div>
          </section>

          <!-- 訂單層欄位（note / promo_code）-->
          <section v-if="orderFields.length" class="form-section order-section">
            <template v-for="field in orderFields" :key="field.id ?? field.label">
              <div class="field-group">
                <label>
                  {{ field.label }}
                  <span class="optional">（選填）</span>
                </label>
                <textarea
                  v-if="field.field_key === 'note'"
                  v-model="orderExtras.note"
                  :placeholder="`請輸入${field.label}`"
                  class="custom-textarea"
                  rows="3"
                ></textarea>
                <input
                  v-else
                  v-model="orderExtras.promoCode"
                  type="text"
                  :placeholder="`請輸入${field.label}`"
                />
              </div>
            </template>
          </section>

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
/* 外層：全寬背景，用 banner 圖片做毛玻璃延伸 */
.hero-banner-wrap {
  position: sticky;
  top: 0;
  z-index: 1;
  width: 100%;
  max-height: 420px;
  overflow: hidden;
}

/* 毛玻璃背景層：鋪滿整個寬度 */
.hero-banner-bg {
  position: absolute;
  inset: -20px;
  background-size: cover;
  background-position: center;
  filter: blur(30px) saturate(1.4);
  transform: scale(1.1);
  z-index: 0;
}

/* Banner 主圖：限制 1440px */
.hero-banner {
  position: relative;
  z-index: 1;
  max-width: 1440px;
  margin: 0 auto;
  max-height: 420px;
  overflow: hidden;
}
.hero-banner img {
  width: 100%; height: auto; display: block; object-fit: cover; max-height: 420px;
}

/* ─── Info Layout ─── */
/* 外層：全寬背景 */
.info-layout-wrap {
  margin-top: -28px;
  position: relative; z-index: 2;
  background: #f5f5f0;
  border-radius: 14px 14px 0 0;
  border: 1px solid #e8e8e4;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
/* 內層：grid 限 1440px 置中 */
.info-layout {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 0 60px;
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 0;
  align-items: start;
}
/* 橫式佈局：內文在左，資訊卡在右 */
.layout-landscape { grid-template-columns: 1fr 380px; }
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
  min-width: 0;
  padding: 28px 32px;
}

.p-tag {
  display: inline-block;
  background: #337168; color: #fff;
  padding: 4px 12px; border-radius: 4px;
  font-size: 0.65rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  margin-bottom: 14px;
}
.p-title {
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 900;
  margin: 0 0 20px;
  color: #0f172a;
  line-height: 1.3;
  word-break: break-word;
}

/* Rich Text */
.p-main-body-render {
  color: #334155;
  font-size: .9rem;
  line-height: 1.9;
  margin-bottom: 36px;
}
.p-main-body-render :deep(h1) { font-size: 1.4rem; font-weight: 900; color: #0f172a; margin-top: 1.6em; margin-bottom: 0.6em; }
.p-main-body-render :deep(h2) { font-size: 1.15rem; font-weight: 800; color: #0f172a; margin-top: 1.5em; margin-bottom: 0.5em; }
.p-main-body-render :deep(h3) { font-size: 1rem; font-weight: 700; color: #0f172a; margin-top: 1.4em; margin-bottom: 0.4em; border-left: 3px solid #337168; padding-left: 10px; }
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
  max-width: 1440px; margin: 0 auto;
  padding: 16px 24px;
  display: flex; justify-content: space-between;
  font-size: .75rem;
  background: #3D3B3B; color: #ccc;
  border-radius: 0 0 14px 14px;
}

/* 貴賓列表 */
.guests-section { margin: 32px 0; }
.guests-grid {
  display: flex; flex-wrap: wrap; gap: 20px; justify-content: center;
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
  grid-template-columns: 1fr 380px;
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
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;
  font-size: .78rem; color: #94a3b8;
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
  .hero-banner-wrap { max-height: 240px; }
  .hero-banner { max-height: 240px; }
  .hero-banner img { max-height: 240px; }
  .info-layout {
    grid-template-columns: 1fr;
    padding: 0 0 200px;
    gap: 0;
  }
  .info-main {
    padding: 0;
  }
  .info-sidebar { display: none; }
  .sidebar-sticky { position: static; }
  .sidebar-banner img { max-height: 240px; object-fit: cover; }
  .page-footer { flex-direction: column; gap: 4px; text-align: center; padding: 16px; }
  .mobile-only { display: block; }
  .desktop-only { display: none; }

  /* 手機版字型 */
  .p-tag { font-size: 0.7rem; padding: 5px 14px; margin-bottom: 10px; }
  .p-title { font-size: 1.5rem; margin-bottom: 10px; line-height: 1.35; }
  .p-sub-tags { font-size: .8rem; margin-bottom: 16px; }
  .p-main-body-render { font-size: .95rem; line-height: 1.85; margin-bottom: 24px; }
  .p-main-body-render :deep(h1) { font-size: 1.25rem; }
  .p-main-body-render :deep(h2) { font-size: 1.1rem; }
  .p-main-body-render :deep(h3) { font-size: 1rem; }
  .section-heading { font-size: 1.2rem; margin-bottom: 12px; }
  .venue-section { margin-top: 28px; padding-top: 24px; }
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

.draft-banner-main {
  flex: 1;
  min-width: 0;
}

.draft-banner-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* 收合切換鍵：手機版顯示，桌機版隱藏（桌機空間夠不用收合）*/
.draft-collapse-toggle {
  display: none;
  background: transparent;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 0.72rem;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}
.draft-collapse-toggle:hover { background: rgba(0, 0, 0, 0.04); }

@media (max-width: 768px) {
  .draft-collapse-toggle { display: inline-flex; align-items: center; }
  /* 收合時 banner 變窄、單行：strong 與 toggle 在同一列 */
  .draft-banner.collapsed {
    padding: 8px 12px;
    margin-bottom: 12px;
  }
  .draft-banner.collapsed strong {
    margin-bottom: 0;
    font-size: 0.85rem;
  }
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

/* 進度條（reg-form 第一個區塊；手機版 sticky 浮在頂部） */
.form-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.form-progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.85rem;
  color: #475569;
}
.form-progress-label { font-weight: 600; }
.form-progress-pct { font-weight: 700; color: #337168; font-variant-numeric: tabular-nums; }
.form-progress-track {
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.form-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #337168 0%, #4a8c80 100%);
  border-radius: 999px;
  transition: width 0.25s ease;
}
.form-progress-fill.done {
  background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
}
@media (max-width: 768px) {
  .form-progress {
    position: sticky;
    /* form-view-header 沒 sticky，所以這裡 top: 0 會在使用者捲動時讓進度條替代 header 黏在最頂 */
    top: 0;
    z-index: 5;
    margin: 0 -8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
}

/* Attendee 區塊可折疊（多人報名時節省滾動） */
.attendee-section {
  transition: padding 0.2s ease;
}
.attendee-section.is-collapsed {
  padding: 12px 22px;
  gap: 0;
}
.attendee-section.is-collapsed.is-complete {
  background: #f0fdf4;
  border-color: #bbf7d0;
}
.form-section .attendee-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.attendee-heading-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 700;
  flex-shrink: 0;
}
.attendee-heading-status.done {
  background: #10b981;
  color: #fff;
}
.attendee-heading-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.attendee-heading-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.attendee-heading-name {
  font-size: 0.85rem;
  color: #475569;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.attendee-heading-toggle {
  color: #94a3b8;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}
.attendee-section.is-collapsed .attendee-heading-toggle {
  transform: rotate(-90deg);
}
.attendee-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 表單區塊（買家 / 各 attendee / 訂單 extras） */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 22px;
  background: #fafaf8;
  border: 1px solid #e8e8e4;
  border-radius: 12px;
}
.form-section + .form-section { margin-top: 4px; }
.form-section .section-heading {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.attendee-ticket-tag {
  font-size: 0.82rem;
  font-weight: 600;
  color: #337168;
  background: #e8f5f1;
  padding: 3px 10px;
  border-radius: 999px;
}
/* buyer 區塊改用品牌黃（原本橘色 #f97316 → 品牌黃 #E0A800） */
.buyer-section { background: #fefce8; border-color: #fde68a; }
.buyer-section .section-heading::before {
  content: '';
  width: 4px;
  height: 18px;
  background: #E0A800;
  border-radius: 2px;
}
.order-section { background: #f8fafc; border-color: #e2e8f0; }
.form-tickets-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
}
.form-tickets-error .field-error {
  display: block;
  color: #b91c1c;
  font-size: 0.88rem;
  font-weight: 600;
}
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
  /* 底部 padding 補 iPhone safe-area，避免被 home indicator 遮住 */
  padding: 20px 24px calc(20px + env(safe-area-inset-bottom, 0px));
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

  /* 報名表 sticky header 瘦身：縮小 padding + back-btn icon-only + 活動名單行佔最大寬 */
  .form-view-header {
    padding: 8px 12px;
    gap: 10px;
  }
  .back-btn {
    padding: 6px 10px;
    font-size: 0.78rem;
    /* 手機只顯示「←」icon，隱藏「返回活動介紹」文字 */
    overflow: hidden;
    max-width: 40px;
    text-indent: -9999px;
    position: relative;
  }
  .back-btn::before {
    content: "←";
    position: absolute;
    left: 0; right: 0; top: 0; bottom: 0;
    display: flex; align-items: center; justify-content: center;
    text-indent: 0;
    font-size: 1rem;
    font-weight: 700;
  }
  .form-view-ename {
    font-size: 0.85rem;
    flex: 1; min-width: 0;
  }
  /* 表單卡 padding 縮小 + 標題瘦身，省手機首屏高度 */
  .form-wrap {
    margin-top: 16px;
    padding: 20px 16px 28px;
  }
  .form-wrap-header {
    margin-bottom: 18px;
  }
  .form-embed-title { font-size: 1.15rem; margin-bottom: 4px; }
  .form-embed-sub   { font-size: 0.78rem; }
}
</style>
