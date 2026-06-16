/**
 * 輸出層：把結果寫成 JSON 與 CSV（CSV 可直接用 Excel 開啟）
 */
import { mkdir, writeFile } from 'node:fs/promises'

const COLUMNS = [
  ['tier', '等級'],
  ['score', '分數'],
  ['organizer', '主辦單位'],
  ['title', '活動名稱'],
  ['contactPerson', '聯絡人'],
  ['phone', '電話'],
  ['email', 'Email'],
  ['eventDate', '活動日期'],
  ['location', '地點'],
  ['fee', '費用'],
  ['category', '類別'],
  ['organizerEventCount', '主辦活動數'],
  ['matchReasons', '比對依據'],
  ['detailUrl', '來源連結'],
]

function csvCell(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows) {
  const header = COLUMNS.map(([, label]) => label).join(',')
  const body = rows
    .map((row) => COLUMNS.map(([key]) => csvCell(row[key])).join(','))
    .join('\n')
  // 加上 BOM，Excel 開中文才不會亂碼
  return `﻿${header}\n${body}\n`
}

export async function exportResults(rows, outputDir) {
  await mkdir(outputDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  const jsonPath = `${outputDir}leads-${stamp}.json`
  const csvPath = `${outputDir}leads-${stamp}.csv`

  await writeFile(jsonPath, JSON.stringify(rows, null, 2), 'utf-8')
  await writeFile(csvPath, toCsv(rows), 'utf-8')

  return { jsonPath, csvPath }
}
