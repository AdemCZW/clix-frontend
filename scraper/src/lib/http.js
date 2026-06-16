/**
 * HTTP 抓取層
 * --------------------------------------------------
 * 負責「有禮貌地」抓網頁：自動重試、請求間延遲、逾時控制，
 * 並正確處理中文編碼（beclass 為 UTF-8，但保留 Big5 後援）。
 * 只用 Node.js 內建功能，無需安裝任何套件。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 從 HTTP header 或 <meta> 偵測網頁編碼 */
function detectCharset(buffer, contentType = '') {
  const headerMatch = /charset=([\w-]+)/i.exec(contentType)
  if (headerMatch) return headerMatch[1].toLowerCase()

  // 讀前 2KB 找 <meta charset> 線索
  const head = Buffer.from(buffer.slice(0, 2048)).toString('latin1')
  const metaMatch = /charset=["']?([\w-]+)/i.exec(head)
  if (metaMatch) return metaMatch[1].toLowerCase()

  return 'utf-8'
}

/** 將原始 bytes 依偵測到的編碼解成字串。Node 內建 TextDecoder 支援 big5。 */
function decodeBuffer(buffer, charset) {
  const normalized = charset === 'utf8' ? 'utf-8' : charset
  try {
    return new TextDecoder(normalized).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

/**
 * 抓取單一網址，回傳 { ok, status, url, html }
 * @param {string} url
 * @param {object} opts - { userAgent, timeoutMs, maxRetries, retryBackoffMs }
 */
export async function politeFetch(url, opts = {}) {
  const {
    userAgent = 'Mozilla/5.0',
    timeoutMs = 20000,
    maxRetries = 3,
    retryBackoffMs = 2000,
  } = opts

  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const wait = retryBackoffMs * 2 ** (attempt - 1)
      console.warn(`  ↻ 重試 (${attempt}/${maxRetries})，等待 ${wait}ms… ${url}`)
      await sleep(wait)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-TW,zh;q=0.9',
        },
      })
      clearTimeout(timer)

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`)
        // 4xx（除了 429）通常重試也沒用，直接放棄
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { ok: false, status: res.status, url, html: '' }
        }
        continue
      }

      const buffer = await res.arrayBuffer()
      const charset = detectCharset(buffer, res.headers.get('content-type') || '')
      const html = decodeBuffer(buffer, charset)
      return { ok: true, status: res.status, url: res.url || url, html }
    } catch (err) {
      clearTimeout(timer)
      lastError = err
    }
  }

  console.error(`  ✗ 抓取失敗：${url} (${lastError?.message || 'unknown'})`)
  return { ok: false, status: 0, url, html: '', error: lastError?.message }
}

export { sleep }
