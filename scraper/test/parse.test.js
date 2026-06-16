/**
 * 解析與評分邏輯的離線測試（用假 HTML，不需要網路）
 * 執行：node test/parse.test.js
 */
import assert from 'node:assert'
import { parseList } from '../src/lib/parseList.js'
import { parseDetail } from '../src/lib/parseDetail.js'
import { scoreLeads } from '../src/lib/matcher.js'
import { config } from '../src/config.js'

let passed = 0
const ok = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (e) {
    console.error(`✗ ${name}\n  ${e.message}`)
    process.exitCode = 1
  }
}

// --- 列表頁解析 ---
const listHtml = `
  <div class="event">
    <a href="/show.php?qrs=ABC123">2026 攝影研習工作坊</a>
  </div>
  <div class="event">
    <a href="https://www.beclass.com/default.php?name=ShowDetail&sn=999">親子同樂會</a>
  </div>
  <a href="/about.php">關於我們</a>
  <a href="/show.php?qrs=ABC123"><img src="x.png"></a>
`

ok('parseList 抓到 2 筆詳細頁連結、去除非活動連結與重複', () => {
  const items = parseList(listHtml, config.baseUrl)
  assert.equal(items.length, 2)
  assert.equal(items[0].title, '2026 攝影研習工作坊')
  assert.ok(items[0].detailUrl.startsWith('https://www.beclass.com/show.php?qrs=ABC123'))
})

// --- 詳細頁解析 ---
const detailHtml = `
  <html><head><title>2026 攝影研習工作坊 - beclass</title></head><body>
  <table>
    <tr><td>主辦單位：</td><td>台北市攝影學會</td></tr>
    <tr><td>聯絡人：</td><td>王小明</td></tr>
    <tr><td>聯絡電話：</td><td>02-2345-6789</td></tr>
    <tr><td>E-mail：</td><td>contact@photo-club.org.tw</td></tr>
    <tr><td>活動日期：</td><td>2026/08/15</td></tr>
    <tr><td>活動地點：</td><td>台北市信義區</td></tr>
    <tr><td>費用：</td><td>新台幣 1200 元</td></tr>
  </table></body></html>
`

ok('parseDetail 正確抽出主辦/聯絡/Email/電話/日期/付費', () => {
  const d = parseDetail(detailHtml, 'https://example.com/x')
  assert.equal(d.organizer, '台北市攝影學會')
  assert.equal(d.contactPerson, '王小明')
  assert.equal(d.email, 'contact@photo-club.org.tw')
  assert.equal(d.phone, '02-2345-6789')
  assert.equal(d.eventDate, '2026-08-15')
  assert.equal(d.isPaid, true)
})

// --- 評分 ---
ok('scoreLeads 給有聯絡方式+付費+研習的主辦較高分並排序', () => {
  const leads = [
    { title: '攝影研習', organizer: '台北市攝影學會', email: 'a@b.com', phone: '02-1', isPaid: true, eventDate: '2099-01-01' },
    { title: '攝影研習', organizer: '台北市攝影學會', email: 'a@b.com', isPaid: true },
    { title: '免費同學會聚餐', organizer: null },
  ]
  const scored = scoreLeads(leads, config.scoring)
  assert.equal(scored[0].organizer, '台北市攝影學會')
  assert.ok(scored[0].score > scored[2].score)
  assert.ok(scored[0].organizerEventCount === 2, '應偵測到重複主辦')
  assert.equal(scored[scored.length - 1].tier, 'D')
})

console.log(`\n${passed} 項測試通過`)
