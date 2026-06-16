/**
 * 詳細頁解析
 * --------------------------------------------------
 * 從單一活動頁抽出做潛在客戶開發所需的關鍵欄位：
 *   主辦單位、聯絡人、電話、Email、活動日期、地點、費用、類別。
 *
 * 採「標籤文字 + 萬用樣式」雙重策略，對版型改動容忍度高。
 */
import {
  extractByLabel,
  extractEmail,
  extractPhone,
  stripTags,
} from './html.js'

/** 嘗試把各種日期寫法正規化成 YYYY-MM-DD（抓不到就回原字串） */
function normalizeDate(raw) {
  if (!raw) return null
  const m = /(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/.exec(raw)
  if (!m) return raw.trim()
  const [, y, mo, d] = m
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * @param {string} html 詳細頁 HTML
 * @param {string} sourceUrl 來源網址
 * @returns {object} 結構化的活動 / 主辦資訊
 */
export function parseDetail(html, sourceUrl) {
  const text = stripTags(html)

  const organizer = extractByLabel(text, ['主辦單位', '主辦', '主辦者', '舉辦單位'])
  const contact = extractByLabel(text, ['聯絡人', '承辦人', '聯繫人'])
  const phone =
    extractByLabel(text, ['聯絡電話', '電話', '連絡電話', '手機', 'Tel', 'TEL']) ||
    extractPhone(text)
  const email =
    extractByLabel(text, ['E-mail', 'Email', '電子郵件', '信箱', 'E-Mail']) ||
    extractEmail(text)

  const dateRaw = extractByLabel(text, ['活動日期', '活動時間', '舉辦日期', '日期'])
  const location = extractByLabel(text, ['活動地點', '地點', '地址', '舉辦地點'])
  const feeRaw = extractByLabel(text, ['費用', '報名費', '票價', '收費'])
  const category = extractByLabel(text, ['活動類別', '類別', '分類'])
  const titleTag = /<title>([\s\S]*?)<\/title>/i.exec(html)

  // 用 label 抓 email 可能會抓到一段含雜訊的字串，這裡再純化一次
  const cleanEmail = email ? extractEmail(email) || email : null
  const cleanPhone = phone ? extractPhone(phone) || phone : null

  const isPaid =
    feeRaw != null && !/免費|免收|free|(?<!\d)0\s*元/i.test(feeRaw)
      ? true
      : feeRaw != null
        ? false
        : null

  return {
    sourceUrl,
    pageTitle: titleTag ? stripTags(titleTag[1]) : null,
    organizer: organizer || null,
    contactPerson: contact || null,
    phone: cleanPhone || null,
    email: cleanEmail || null,
    eventDate: normalizeDate(dateRaw),
    location: location || null,
    fee: feeRaw || null,
    isPaid,
    category: category || null,
  }
}
