/**
 * 列表頁解析
 * --------------------------------------------------
 * 從 ShowList 頁面抽出每一筆活動的「標題」與「詳細頁連結」。
 *
 * 採「以連結為錨點」的策略：找出所有指向活動詳細頁的 <a>，
 * 比依賴特定 class 名稱更耐版型變動。
 *
 * ⚠️ 需對照實機驗證的點：beclass 詳細頁的網址樣式。
 * 目前涵蓋常見的 show.php / name=ShowDetail / qrs= 等樣式；
 * 若實際不同，調整下方 DETAIL_LINK_PATTERNS 即可。
 */
import { decodeEntities, stripTags } from './html.js'

const DETAIL_LINK_PATTERNS = [
  /show\.php\?[^"'#\s]*qrs=/i,
  /name=ShowDetail/i,
  /name=ShowCon/i, // ShowConf / ShowContent 之類
  /default\.php\?[^"'#\s]*sn=\d+/i,
]

function isDetailLink(href) {
  return DETAIL_LINK_PATTERNS.some((re) => re.test(href))
}

/**
 * @param {string} html 列表頁 HTML
 * @param {string} baseUrl 用來把相對網址補成絕對網址
 * @returns {Array<{title: string, detailUrl: string}>}
 */
export function parseList(html, baseUrl) {
  const seen = new Set()
  const results = []

  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = anchorRe.exec(html)) !== null) {
    const rawHref = decodeEntities(m[1].trim())
    if (!isDetailLink(rawHref)) continue

    let detailUrl
    try {
      detailUrl = new URL(rawHref, baseUrl).href
    } catch {
      continue
    }
    if (seen.has(detailUrl)) continue

    const title = stripTags(m[2]).trim()
    // 跳過沒有文字的連結（例如純圖片按鈕），避免重複錨點
    if (!title || title.length < 2) continue

    seen.add(detailUrl)
    results.push({ title, detailUrl })
  }

  return results
}
