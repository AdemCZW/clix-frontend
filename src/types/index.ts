// ── 使用者 ─────────────────────────────────────────────
export interface User {
  id: number
  username: string
  email: string
  is_superuser: boolean
}

export interface LoginResponse {
  access: string
  refresh: string
  user: User
}

// ── 活動 ───────────────────────────────────────────────
export type EventStatus = 'active' | 'upcoming' | 'completed'

export interface Event {
  id: number
  name: string
  banner: string | null
  date: string
  endDate: string
  time: string
  endTime: string
  location: string
  address: string
  isPublished: boolean
  hasRegistrationPage: boolean
  guestsCount: number
  participantsCount: number
  participants: number
  status: EventStatus
  statusText: string
  shortLink?: string
  contactLink?: string
  maxParticipants?: number
}

/** 後端回傳的原始活動資料（snake_case） */
export interface RawEvent {
  id: number
  name?: string
  banner?: string | null
  date?: string
  end_date?: string
  time?: string
  end_time?: string
  location?: string
  address?: string
  is_published?: boolean
  has_registration_page?: boolean
  guests_count?: number
  participants_count?: number
  status?: EventStatus
  status_text?: string
  short_link?: string
  shortLink?: string
  owner?: number | { id: number }
  owner_id?: number
  created_by?: number | { id: number }
  created_by_id?: number
  managers?: Array<number | { id: number }>
  manager_ids?: number[]
  members?: Array<number | { id: number }>
  member_ids?: number[]
  contact_link?: string
  max_participants?: number
}

// ── 參與者 ─────────────────────────────────────────────
export type ParticipantType = 'VIP' | '一般民眾'
export type CheckInStatus = '已報到' | '未報到'

export interface Participant {
  id: number
  name: string
  company: string
  title: string
  phone: string
  email: string
  type: ParticipantType
  status: CheckInStatus | string
  eventId: number
  eventName: string
  managerId: number
  managerEmail: string
  checkInToken: string
  qrCodeUrl: string
  createdAt: string
  updatedAt: string

  // ── 訂單 / 票券 / 自訂（5/5 起加入；optional 因為早期資料 / list view 不一定全帶） ──
  formAnswers?: Record<string, unknown>
  extraImportData?: Record<string, unknown>
  externalTicketId?: string
  orderId?: number | null
  orderNumber?: string
  buyerName?: string
  buyerEmail?: string
  buyerPhone?: string
  paymentMethod?: string
  paymentStatus?: string
  paidAt?: string | null
  cardLast4?: string
  promoCode?: string
  note?: string
  ticketId?: number | null
  ticketName?: string
  ticketNumber?: string
  ticketPrice?: number | string
  validFrom?: string | null
  validTo?: string | null
}

/** 後端回傳的原始參與者資料（snake_case） */
export interface RawParticipant {
  id: number
  name: string
  company: string
  title: string
  phone: string
  email: string
  type: string
  status: string
  event: number
  event_name: string
  manager: number
  manager_email: string
  check_in_token: string
  qr_code_url: string
  created_at: string
  updated_at: string

  // 訂單 / 票券 / 自訂（後端 ParticipantSerializer 一律會回，但舊版 / 部分情境可能缺欄位）
  form_answers?: Record<string, unknown>
  extra_import_data?: Record<string, unknown>
  external_ticket_id?: string
  order?: number | null
  order_number?: string
  buyer_name?: string
  buyer_email?: string
  buyer_phone?: string
  payment_method?: string
  payment_status?: string
  paid_at?: string | null
  card_last4?: string
  promo_code?: string
  note?: string
  ticket?: number | null
  ticket_name?: string
  ticket_number?: string
  ticket_price?: number | string
  valid_from?: string | null
  valid_to?: string | null
}

/**
 * 公開報名成功後回傳的單筆 participant（已在 store 層正規化為 camelCase）。
 *
 * 僅給成功頁 / SuccessState.vue 使用。**不要**把它當成一般 `Participant`：
 * 這份資料是公開報名 response 拼出來的，缺 status / managerId 等後台欄位。
 */
export interface PublicSubmittedParticipant {
  id: number
  name: string
  email: string
  phone: string
  company: string
  title: string
  type: string
  ticketId: number | null
  ticketName: string
  ticketNumber: string
  checkInToken: string
  qrCodeUrl: string
}

// ── Toast ──────────────────────────────────────────────
export type ToastType = 'info' | 'success' | 'error' | 'warning'

// ── 貴賓 ──────────────────────────────────────────────
export interface Guest {
  id: number
  name: string
  title: string
  company: string
  event: number
  bio?: string
  avatar?: string
  activity?: string
  [key: string]: unknown
}

// ── 報名頁 ────────────────────────────────────────────
export interface RegistrationPage {
  id: number
  eventId: number
  eventName: string
  eventDate: string
  eventEndDate?: string
  eventTime?: string
  eventLocation: string
  eventAddress?: string
  banner: string | null
  shortLink: string
  mainContent: string
  emailSubject: string
  emailSenderName: string
  emailContent: string
  enableAutoSend: boolean
  isPublished: boolean
  formFields: FormField[]
  createdAt: string
  updatedAt: string
}

export interface RawRegistrationPage {
  id: number
  event: number
  event_name?: string
  event_date?: string
  event_location?: string
  banner?: string | null
  short_link?: string
  main_content?: string
  email_subject?: string
  email_sender_name?: string
  email_content?: string
  enable_auto_send?: boolean
  is_published?: boolean
  form_fields?: FormField[]
  created_at?: string
  updated_at?: string
}

// ── 表單欄位 ──────────────────────────────────────────
export type FieldType = 'text' | 'tel' | 'email' | 'select' | 'radio' | 'textarea'

export interface FieldOption {
  text: string
  order: number
}

export interface FormField {
  id: number | null
  label: string
  field_type: FieldType
  field_key?: string  // 系統預設欄位有 key（name/email/phone/buyer_*/note/promo_code）；自訂欄位無
  is_required: boolean
  is_hidden: boolean
  is_fixed: boolean
  order: number
  options: FieldOption[]
}

// ── 管理者 / 員工 ─────────────────────────────────────
export interface Manager {
  id: number
  email: string
  staffQuota: number
  staffCount: number
  isActive: boolean
  createdAt: string
}

export interface RawManager {
  id: number
  email: string
  staff_quota?: number | null
  staff_count?: number | null
  is_active: boolean
  date_joined?: string
}

export interface Staff {
  id: number
  accountId: string
  managerId: number
  managerEmail: string
  isActive: boolean
  createdAt: string
  status: 'active' | 'inactive'
}

export interface RawStaff {
  id: number
  account_id: string
  manager: number
  manager_email: string
  is_active: boolean
  date_joined?: string
}

// ── 座位 ──────────────────────────────────────────────
export interface SeatLayout {
  rows: number
  cols: number
}

export interface SeatAttendee {
  id: number
  name: string
  type?: string
  [key: string]: unknown
}

export interface Seat {
  id: string
  label: string
  attendee: SeatAttendee[]
}

export type ActivitySeats = Record<string, Seat[]>

// ── API ────────────────────────────────────────────────
/** 後端分頁回應格式 */
export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
