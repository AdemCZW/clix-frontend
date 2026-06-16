#!/usr/bin/env node
/**
 * beclass 潛在客戶爬蟲 —— 主程式
 * --------------------------------------------------
 * 流程：
 *   1) 逐頁抓取 ShowList 列表，收集每個活動的詳細頁連結
 *   2)（可選）進入每個詳細頁，抓出主辦單位 / 聯絡人 / 電話 / Email
 *   3) 依 ICP 規則評分排序，找出最值得聯繫的潛在客戶
 *   4) 輸出 JSON + CSV
 *
 * 用法：
 *   node src/index.js                      # 依 config.js 設定執行
 *   node src/index.js --pages 1-5          # 覆蓋頁碼範圍
 *   node src/index.js --max-details 100    # 最多抓 100 筆詳細頁
 *   node src/index.js --no-details         # 只抓列表，不進詳細頁（快速預覽）
 *   node src/index.js --inspect <url>      # 偵錯：印出某網址解析結果，方便校正選擇器
 */
import { config } from './config.js'
import { politeFetch, sleep } from './lib/http.js'
import { parseList } from './lib/parseList.js'
import { parseDetail } from './lib/parseDetail.js'
import { scoreLeads } from './lib/matcher.js'
import { exportResults } from './lib/exporter.js'

function parseArgs(argv) {
  const args = { pages: null, maxDetails: null, fetchDetails: null, inspect: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pages') args.pages = argv[++i]
    else if (a === '--max-details') args.maxDetails = Number(argv[++i])
    else if (a === '--no-details') args.fetchDetails = false
    else if (a === '--inspect') args.inspect = argv[++i]
  }
  return args
}

const fetchOpts = {
  userAgent: config.userAgent,
  timeoutMs: config.timeoutMs,
  maxRetries: config.maxRetries,
  retryBackoffMs: config.retryBackoffMs,
}

/** 偵錯模式：抓單一網址並印出解析結果，協助校正選擇器 */
async function inspect(url) {
  console.log(`🔍 偵錯抓取：${url}\n`)
  const res = await politeFetch(url, fetchOpts)
  if (!res.ok) {
    console.error(`抓取失敗，HTTP ${res.status}`)
    return
  }
  console.log(`HTML 長度：${res.html.length} bytes\n`)

  const listItems = parseList(res.html, config.baseUrl)
  console.log(`--- 當作「列表頁」解析：找到 ${listItems.length} 個詳細頁連結 ---`)
  console.log(listItems.slice(0, 10))

  console.log('\n--- 當作「詳細頁」解析 ---')
  console.log(parseDetail(res.html, url))
}

async function run() {
  const args = parseArgs(process.argv.slice(2))

  if (args.inspect) {
    await inspect(args.inspect)
    return
  }

  let [startPage, endPage] = [config.startPage, config.endPage]
  if (args.pages) {
    const [s, e] = args.pages.split('-').map(Number)
    startPage = s
    endPage = e || s
  }
  const fetchDetails = args.fetchDetails ?? config.fetchDetails
  const maxDetails = args.maxDetails ?? config.maxDetails

  console.log('🚀 開始爬取 beclass 活動列表')
  console.log(`   頁碼範圍：${startPage}–${endPage}｜抓詳細頁：${fetchDetails ? '是' : '否'}\n`)

  // 步驟 1：收集列表
  const collected = new Map() // detailUrl -> { title, detailUrl }
  for (let page = startPage; page <= endPage; page++) {
    const url = config.listUrlTemplate.replace('{page}', String(page))
    console.log(`📄 列表第 ${page} 頁：${url}`)
    const res = await politeFetch(url, fetchOpts)
    await sleep(config.requestDelayMs)

    if (!res.ok) {
      console.warn(`   略過（HTTP ${res.status}）`)
      continue
    }
    const items = parseList(res.html, config.baseUrl)
    console.log(`   找到 ${items.length} 筆活動連結`)
    if (items.length === 0) {
      console.log('   本頁無資料，可能已到最後一頁，停止翻頁。')
      break
    }
    for (const item of items) {
      if (!collected.has(item.detailUrl)) collected.set(item.detailUrl, item)
    }
  }

  let leads = [...collected.values()]
  console.log(`\n✅ 列表階段完成，共 ${leads.length} 筆不重複活動\n`)

  // 步驟 2：抓詳細頁
  if (fetchDetails && leads.length > 0) {
    const limit = maxDetails > 0 ? Math.min(maxDetails, leads.length) : leads.length
    console.log(`🔎 抓取詳細頁（最多 ${limit} 筆）…`)
    for (let i = 0; i < limit; i++) {
      const lead = leads[i]
      process.stdout.write(`   [${i + 1}/${limit}] ${lead.title.slice(0, 30)}… `)
      const res = await politeFetch(lead.detailUrl, fetchOpts)
      await sleep(config.requestDelayMs)
      if (res.ok) {
        const detail = parseDetail(res.html, lead.detailUrl)
        Object.assign(lead, detail, { title: lead.title })
        console.log(detail.organizer ? `✓ ${detail.organizer}` : '✓ (主辦未解析到)')
      } else {
        console.log(`✗ HTTP ${res.status}`)
      }
    }
  }

  // 步驟 3：評分排序
  const scored = scoreLeads(leads, config.scoring)
  const tiers = scored.reduce((acc, l) => ((acc[l.tier] = (acc[l.tier] || 0) + 1), acc), {})

  // 步驟 4：輸出
  const { jsonPath, csvPath } = await exportResults(scored, config.outputDir)

  console.log('\n📊 完成！分級統計：', tiers)
  console.log('🏆 前 10 名潛在客戶：')
  for (const l of scored.slice(0, 10)) {
    console.log(`   [${l.tier}] ${l.score}分 | ${l.organizer || '(無主辦)'} | ${l.email || l.phone || '無聯絡方式'} | ${l.title.slice(0, 24)}`)
  }
  console.log(`\n💾 已輸出：\n   ${csvPath}\n   ${jsonPath}`)
}

run().catch((err) => {
  console.error('執行發生錯誤：', err)
  process.exit(1)
})
