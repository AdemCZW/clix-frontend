import {
  IMPORT_HEADER_ALIASES,
  lookupSystemField,
  normalizeStatusValue,
  normalizeTypeValue,
} from './importFieldMapping'

// Excel 一列 → 後端可吃的 row payload
//
// 流程：
// 1. 把 Excel header 對到固定欄位（name/company/...）
// 2. 對不到固定欄位的 header，依序嘗試對 formFields：
//    a. 先比 RegistrationFormField.field_key（exact match）→ 進 form_answers
//    b. 再比 RegistrationFormField.label（exact match）→ 進 form_answers
// 3. 都對不到（系統完全不認識）→ 進 unknown_columns
//    呼叫端應該先警告使用者，使用者選擇「保留」才把 unknown_columns merge 進 form_answers 一起送
//    （直接靜默塞 form_answers 會吃下惡意 / 錯誤格式欄位，所以改成顯式確認）

export interface FormFieldRef {
  field_key?: string | null
  label?: string
  is_hidden?: boolean
}

export interface NormalizedImportRow {
  name: string
  company: string
  title: string
  phone: string
  email: string
  type: 'VIP' | '一般民眾'
  status: '已報到' | '未報到'
  ticket?: number | null
  external_ticket_id?: string
  form_answers: Record<string, string>
  unknown_columns: Record<string, string>
  /**
   * 「值的格式」級警告（不是 header 未知）。
   *
   * 例如：ticket 欄位給了非數字字串（系統第一版只支援 ticket id）。
   * 這是純警告，**不會送 backend**，呼叫端應在 confirm 預覽顯示，讓使用者修正後重傳。
   */
  validation_issues: string[]
}

const FIXED_FIELDS = new Set(Object.keys(IMPORT_HEADER_ALIASES))

interface FormFieldIndex {
  byKey: Map<string, string> // field_key -> form_answers 用的 key（=field_key）
  byLabel: Map<string, string> // label -> form_answers 用的 key（field_key or label）
}

function buildFormFieldIndex(formFields: FormFieldRef[]): FormFieldIndex {
  const byKey = new Map<string, string>()
  const byLabel = new Map<string, string>()
  for (const f of formFields) {
    if (f.is_hidden) continue
    const key = (f.field_key || '').trim()
    const label = (f.label || '').trim()
    // 寫進 form_answers 時統一用 field_key；沒有 field_key 才 fallback 用 label
    const answerKey = key || label
    if (!answerKey) continue
    if (key) byKey.set(key, answerKey)
    if (label) byLabel.set(label, answerKey)
  }
  return { byKey, byLabel }
}

export function normalizeImportRow(
  raw: Record<string, unknown>,
  formFields: FormFieldRef[] = [],
): NormalizedImportRow {
  const fixed: Partial<NormalizedImportRow> = {}
  const formAnswers: Record<string, string> = {}
  const unknownColumns: Record<string, string> = {}
  const validationIssues: string[] = []
  const index = buildFormFieldIndex(formFields)

  for (const [header, value] of Object.entries(raw)) {
    const systemKey = lookupSystemField(header)
    const stringValue = stringifyCell(value)

    if (systemKey && FIXED_FIELDS.has(systemKey)) {
      // 固定欄位
      switch (systemKey) {
        case 'type':
          fixed.type = normalizeTypeValue(stringValue)
          break
        case 'status':
          fixed.status = normalizeStatusValue(stringValue)
          break
        case 'ticket': {
          // 第一版只支援 ticket id（數字）。
          // 給字串（很可能是票種名稱）→ 不靜默轉 null，記到 validation_issues 讓 UI 顯示
          if (!stringValue) {
            fixed.ticket = null
          } else {
            const num = Number(stringValue)
            if (Number.isFinite(num) && num > 0) {
              fixed.ticket = num
            } else {
              fixed.ticket = null
              validationIssues.push(
                `「${String(header).trim()}」欄位偵測到非數字值「${stringValue}」：` +
                  `目前匯入只支援票種 id（數字），這筆票券設定會被忽略。` +
                  `如要保留，請改用「報名表欄位」中的票種設定，或先把 Excel 內票種名稱換成系統內的票種 id。`,
              )
            }
          }
          break
        }
        case 'external_ticket_id':
          // 票號：純字串，trim 後直接帶；空值不傳，讓後端 fallback 用內部 UUID
          if (stringValue) fixed.external_ticket_id = stringValue
          break
        default:
          // name / company / title / phone / email
          ;(fixed as Record<string, string>)[systemKey] = stringValue
      }
      continue
    }

    if (!header) continue

    // 對不到固定欄位 → 試 formFields 映射
    const trimmedHeader = String(header).trim()
    const mappedKey = index.byKey.get(trimmedHeader) || index.byLabel.get(trimmedHeader)

    if (mappedKey) {
      // 對到後台已設定的報名表欄位 → 進 form_answers
      if (stringValue) formAnswers[mappedKey] = stringValue
      // 對到但空值 → 不寫，避免汙染 form_answers
    } else {
      // 系統完全不認識的欄位 → 進 unknown_columns 由呼叫端決定要保留還是擋下
      // 空值的未知欄位也記下來，讓 UI 能顯示「有這個欄位但全空」
      unknownColumns[trimmedHeader] = stringValue
    }
  }

  return {
    name: fixed.name ?? '',
    company: fixed.company ?? '',
    title: fixed.title ?? '',
    phone: fixed.phone ?? '',
    email: fixed.email ?? '',
    type: fixed.type ?? '一般民眾',
    status: fixed.status ?? '未報到',
    ticket: fixed.ticket ?? null,
    external_ticket_id: fixed.external_ticket_id ?? '',
    form_answers: formAnswers,
    unknown_columns: unknownColumns,
    validation_issues: validationIssues,
  }
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  return String(value)
}
