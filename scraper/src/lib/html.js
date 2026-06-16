/**
 * 輕量 HTML 文字處理工具（無需安裝套件）
 * --------------------------------------------------
 * 提供「去標籤」「解 HTML 實體」「依標籤文字找欄位」等基礎能力，
 * 讓解析層即使在網頁版型小改動時也能保持穩定。
 */

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

/** 解 HTML 實體（含數字實體 &#xxx;） */
export function decodeEntities(str = '') {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m] ?? m)
}

/** 去除所有 HTML 標籤，壓平空白，得到純文字 */
export function stripTags(html = '') {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>(?!\n)/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * 依「標籤文字」抽取對應的值，例如表格裡的：
 *   主辦單位：台北市攝影學會
 *   聯絡電話：02-1234-5678
 * @param {string} text 已去標籤的純文字
 * @param {string[]} labels 可能的標籤關鍵字
 * @returns {string|null}
 */
export function extractByLabel(text, labels) {
  for (const label of labels) {
    // 標籤後面可能接 全形/半形冒號、空白，再到行尾或下一個標籤
    const re = new RegExp(`${label}\\s*[:：]?\\s*([^\\n]{1,120})`, 'i')
    const m = re.exec(text)
    if (m && m[1]) {
      const value = m[1].trim().replace(/\s{2,}.*$/, '').trim()
      if (value && !/^[:：]/.test(value)) return value
    }
  }
  return null
}

/** 從文字中抓出第一個 Email */
export function extractEmail(text = '') {
  const m = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(text)
  return m ? m[0] : null
}

/** 從文字中抓出台灣常見格式的電話 / 手機 */
export function extractPhone(text = '') {
  const patterns = [
    /09\d{2}[-\s]?\d{3}[-\s]?\d{3}/, // 手機 09xx-xxx-xxx
    /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}(?:[-\s#轉]?\d{1,5})?/, // 市話含分機
  ]
  for (const re of patterns) {
    const m = re.exec(text)
    if (m) return m[0].trim()
  }
  return null
}
