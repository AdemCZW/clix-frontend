/**
 * Participant 欄位來源解析器
 *
 * 統一三個欄位來源的解讀規則：
 * - basic：Participant 模型內建欄位（name/company/title/email/phone/type/external_ticket_id...）
 * - custom：form_answers（後台「報名表欄位」設定 → field_key）
 * - extra：extra_import_data（Excel 匯入但無對應的欄位）
 *
 * 用於列印模板渲染、編輯抽屜「自訂欄位」tab、匯入後彙整 unknown 欄位等場景。
 * 若有新增 basic 欄位，加進 BASIC_FIELD_OPTIONS 即可。
 */

export type FieldSource = 'basic' | 'custom' | 'extra'

export interface FieldOption {
    key: string
    label: string
    source: FieldSource
}

/**
 * 列印 / 編輯抽屜使用的 basic 欄位選單。順序即顯示順序。
 * 預設 label 以列印頁慣例為主（company 用「單位」）；其他頁要不同 label，
 * 自行 map（key 集合保證不變，label 可覆蓋）。
 */
export const BASIC_FIELD_OPTIONS: FieldOption[] = [
    { key: 'name', label: '姓名', source: 'basic' },
    { key: 'company', label: '單位', source: 'basic' },
    { key: 'title', label: '職稱', source: 'basic' },
    { key: 'email', label: 'Email', source: 'basic' },
    { key: 'phone', label: '電話', source: 'basic' },
    { key: 'type', label: '身分', source: 'basic' },
    { key: 'external_ticket_id', label: '票號', source: 'basic' },
    { key: 'code', label: 'QR Code', source: 'basic' },
]

const BASIC_KEY_SET = new Set(BASIC_FIELD_OPTIONS.map((o) => o.key))

/** 鬆綁過的 participant 介面 — 接受 snake_case（API 原始）與 camelCase（前端 mapParticipant 後） */
type ParticipantLike = Record<string, unknown> & {
    formAnswers?: Record<string, unknown>
    form_answers?: Record<string, unknown>
    extraImportData?: Record<string, unknown>
    extra_import_data?: Record<string, unknown>
    externalTicketId?: string
    external_ticket_id?: string
}

const getFormAnswers = (p: ParticipantLike): Record<string, unknown> =>
    p.formAnswers ?? p.form_answers ?? {}

const getExtraImportData = (p: ParticipantLike): Record<string, unknown> =>
    p.extraImportData ?? p.extra_import_data ?? {}

/**
 * 由 key 取出 participant 顯示值。
 * basic 直接讀欄位；custom/extra 走 form_answers → extra_import_data fallback。
 * `code` 永遠回空字串（QR Code 由呼叫端用 <img> 渲染，不走文字）。
 */
export function resolveFieldValue(p: ParticipantLike, key: string): string {
    switch (key) {
        case 'name':
        case 'company':
        case 'title':
        case 'email':
        case 'phone':
        case 'type':
            return String(p[key] ?? '')
        case 'external_ticket_id':
            return String(p.externalTicketId ?? p.external_ticket_id ?? '')
        case 'code':
            return ''
        default: {
            const answers = getFormAnswers(p)
            if (key in answers && answers[key] !== '' && answers[key] != null) {
                return String(answers[key])
            }
            const extra = getExtraImportData(p)
            return String(extra[key] ?? '')
        }
    }
}

/**
 * 從一組 RegistrationFormField 中過濾出可供選擇的 custom 欄位（去掉 hidden / fixed / basic 重複）。
 * 寫進 form_answers 時統一用 field_key。
 */
export function buildCustomFieldOptions(
    formFields: Array<{ field_key?: string; label?: string; is_hidden?: boolean; is_fixed?: boolean }>,
): FieldOption[] {
    const out: FieldOption[] = []
    for (const f of formFields) {
        if (f.is_hidden || f.is_fixed) continue
        const k = f.field_key
        if (!k || BASIC_KEY_SET.has(k)) continue
        out.push({ key: k, label: f.label || k, source: 'custom' })
    }
    return out
}

/**
 * 從一群 participants 聯集出 extra_import_data 的 key（排除 basic / 已是 custom 的 key）。
 * 用於列印模板「自訂欄位」選單第三段：Excel 額外資料的 key 來源。
 */
export function buildExtraFieldOptions(
    participants: ParticipantLike[],
    excludeKeys: Iterable<string> = [],
): FieldOption[] {
    const excludeSet = new Set([...BASIC_KEY_SET, ...excludeKeys])
    const seen = new Set<string>()
    for (const p of participants) {
        const extra = getExtraImportData(p)
        for (const k of Object.keys(extra)) {
            if (!k) continue
            if (excludeSet.has(k)) continue
            seen.add(k)
        }
    }
    return Array.from(seen)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => ({ key: k, label: k, source: 'extra' }))
}
