// Excel 匯入欄位對照表
//
// 用途：把 Excel 表頭（中/英文 / 多種寫法）正規化到系統欄位名稱。
// 設計原則：
// - 「固定欄位」進 Participant 主結構
// - 對不到的欄位 → 由 normalizeImportRow 進 form_answers
// - 系統結構欄位（buyer_*/note/promo_code）不在這裡，那是 order 層匯入的事

export const IMPORT_HEADER_ALIASES: Record<string, string[]> = {
  name: ['姓名', 'Name', 'name', '參加者姓名', '來賓姓名', '與會者姓名'],
  company: ['公司', '單位', '公司名稱', '單位名稱', '機構名稱', 'Company'],
  title: ['職稱', 'Title', '工作職稱', '職務'],
  phone: ['電話', '手機', '聯絡電話', 'Mobile', 'Phone', '手機號碼'],
  email: ['Email', 'E-mail', 'email', '電子郵件', '信箱', '電子信箱'],
  type: ['身分', '類型', '參加身份', '身份別', 'VIP類型', 'Type'],
  status: ['報到狀態', '狀態', '簽到狀態', '報名狀態', 'Status'],
  ticket: ['票種ID', '票種名稱', '票券', '票種', 'Ticket'],
}

// `type` 值正規化（Excel 寫什麼 → 系統值）
export const TYPE_VALUE_MAP: Record<string, 'VIP' | '一般民眾'> = {
  VIP: 'VIP',
  vip: 'VIP',
  Vip: 'VIP',
  貴賓: 'VIP',
  一般: '一般民眾',
  一般民眾: '一般民眾',
  一般來賓: '一般民眾',
}

// `status` 值正規化
export const STATUS_VALUE_MAP: Record<string, '已報到' | '未報到'> = {
  已報到: '已報到',
  已簽到: '已報到',
  已入場: '已報到',
  未報到: '未報到',
  未簽到: '未報到',
  未入場: '未報到',
}

// 反向查表：給定 header 字串，回傳對應系統欄位 key（找不到回 null）
export function lookupSystemField(header: string): string | null {
  const trimmed = String(header || '').trim()
  if (!trimmed) return null
  for (const [systemKey, aliases] of Object.entries(IMPORT_HEADER_ALIASES)) {
    if (aliases.includes(trimmed)) return systemKey
  }
  return null
}

export function normalizeTypeValue(raw: unknown): 'VIP' | '一般民眾' {
  const key = String(raw ?? '').trim()
  return TYPE_VALUE_MAP[key] ?? '一般民眾'
}

export function normalizeStatusValue(raw: unknown): '已報到' | '未報到' {
  const key = String(raw ?? '').trim()
  return STATUS_VALUE_MAP[key] ?? '未報到'
}
