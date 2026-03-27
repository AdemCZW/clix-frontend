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
}

/** 後端回傳的原始活動資料（snake_case） */
export interface RawEvent {
  id: number
  name?: string
  banner?: string | null
  date?: string
  end_date?: string
  time?: string
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
}

// ── Toast ──────────────────────────────────────────────
export type ToastType = 'info' | 'success' | 'error' | 'warning'

export interface ToastState {
  show: boolean
  message: string
  type: ToastType
  duration: number
}

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
