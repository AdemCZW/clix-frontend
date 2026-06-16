/**
 * 潛在客戶比對與評分
 * --------------------------------------------------
 * 依「理想客戶輪廓（ICP）」對每個主辦單位打分數，分數越高代表越值得優先聯繫。
 * 評分邏輯與權重定義在 config.js 的 scoring 區塊，可自由調整。
 */

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/** 標準化主辦單位名稱，用於判斷「同一主辦是否重複出現」 */
function normalizeOrg(name) {
  return (name || '')
    .replace(/\s+/g, '')
    .replace(/[股份有限公司、，。．・]/g, '')
    .toLowerCase()
}

/**
 * 對一批 lead 進行評分。
 * @param {Array<object>} leads 每筆至少含 { title, organizer, email, phone, ... }
 * @param {object} scoring config.scoring
 * @returns {Array<object>} 加上 score / matchReasons / tier，並依分數由高到低排序
 */
export function scoreLeads(leads, scoring) {
  // 先統計每個主辦單位出現次數，用來判斷「重度活動辦理者」
  const orgCount = new Map()
  for (const lead of leads) {
    const key = normalizeOrg(lead.organizer)
    if (key) orgCount.set(key, (orgCount.get(key) || 0) + 1)
  }

  const today = todayISO()

  const scored = leads.map((lead) => {
    let score = 0
    const reasons = []
    const haystack = `${lead.title || ''} ${lead.category || ''} ${lead.organizer || ''}`

    if (lead.email) {
      score += scoring.hasEmail
      reasons.push('有 Email 可開發')
    }
    if (lead.phone) {
      score += scoring.hasPhone
      reasons.push('有電話')
    }
    if (lead.organizer) {
      score += scoring.hasOrganizer
      reasons.push('主辦明確')
    }
    if (lead.isPaid === true) {
      score += scoring.isPaidEvent
      reasons.push('付費活動(有預算)')
    }

    const orgKey = normalizeOrg(lead.organizer)
    const count = orgKey ? orgCount.get(orgKey) || 0 : 0
    if (count >= 2) {
      score += scoring.recurringOrganizerBonus
      reasons.push(`重複辦活動 x${count}`)
    }

    if (lead.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(lead.eventDate) && lead.eventDate >= today) {
      score += scoring.upcomingEvent
      reasons.push('近期活動')
    }

    const hitKeyword = scoring.keywords.find((k) => haystack.includes(k))
    if (hitKeyword) {
      score += scoring.keywordBonus
      reasons.push(`類型符合(${hitKeyword})`)
    }

    const hitNegative = scoring.negativeKeywords.find((k) => haystack.includes(k))
    if (hitNegative) {
      score -= scoring.negativeKeywordPenalty
      reasons.push(`減分(${hitNegative})`)
    }

    const tier = score >= 70 ? 'A' : score >= 45 ? 'B' : score >= 25 ? 'C' : 'D'

    return {
      ...lead,
      organizerEventCount: count,
      score,
      tier,
      matchReasons: reasons.join('; '),
    }
  })

  return scored.sort((a, b) => b.score - a.score)
}
