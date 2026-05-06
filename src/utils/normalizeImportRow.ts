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
//    a. 先比 RegistrationFormField.field_key（exact match）
//    b. 再比 RegistrationFormField.label（exact match）
//    對到就用 field_key 當 form_answers 的 key（沒 field_key 才 fallback 用 label）
// 3. 都對不到 → 用原始 header 當 form_answers 的 key（best effort，不丟資料）
// 4. 完全空白的欄位 → 進 unknown_columns（預覽用，不送後端）

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
  form_answers: Record<string, string>
  unknown_columns: Record<string, string>
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
          // 第一版只支援 ticket id（數字）。ticket name → 留空，由後端拒絕
          const num = Number(stringValue)
          fixed.ticket = Number.isFinite(num) && num > 0 ? num : null
          break
        }
        default:
          // name / company / title / phone / email
          ;(fixed as Record<string, string>)[systemKey] = stringValue
      }
      continue
    }

    if (!header) continue

    // 對不到固定欄位 → 試 formFields 映射
    const trimmedHeader = String(header).trim()
    const mappedKey =
      index.byKey.get(trimmedHeader) || index.byLabel.get(trimmedHeader) || trimmedHeader

    if (stringValue) {
      formAnswers[mappedKey] = stringValue
    } else {
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
    form_answers: formAnswers,
    unknown_columns: unknownColumns,
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
