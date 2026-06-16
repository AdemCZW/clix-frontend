/**
 * 全域設定檔
 * --------------------------------------------------
 * 這裡集中管理「要爬哪裡」「爬多快」以及「什麼樣的主辦單位算是好客戶」的規則。
 * 多數情況下你只需要調整這個檔案，不必動到其他程式碼。
 */

export const config = {
  // beclass 活動列表首頁
  baseUrl: 'https://www.beclass.com',

  /**
   * 列表頁網址樣板。{page} 會被替換成頁碼。
   * beclass 的 ShowList 是分頁的，預設用 &page=N。
   * 若實際參數名稱不同（例如 &p= 或 &pageNo=），在這裡改即可。
   */
  listUrlTemplate: 'https://www.beclass.com/default.php?name=ShowList&page={page}',

  // 從第幾頁爬到第幾頁（含）。先用小範圍測試，確認資料正確再放大。
  startPage: 1,
  endPage: 3,

  // 是否進入每個活動的詳細頁抓「主辦單位 / 聯絡人 / 電話 / Email」。
  // 這是找潛在客戶最關鍵的資料，但會多送很多請求，請搭配 requestDelayMs。
  fetchDetails: true,

  // 單次執行最多抓幾筆詳細頁，避免一次跑太久（0 = 不限制）。
  maxDetails: 60,

  // 禮貌性爬蟲設定 —— 請務必保留延遲，避免對方伺服器負擔過重而封鎖你。
  requestDelayMs: 1500, // 每個請求之間至少間隔（毫秒）
  maxRetries: 3,
  retryBackoffMs: 2000, // 失敗重試的基礎退避時間，會指數成長
  timeoutMs: 20000,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 (lead-research-bot)',

  // 輸出
  outputDir: new URL('../output/', import.meta.url).pathname,

  /**
   * 理想客戶輪廓（ICP, Ideal Customer Profile）評分權重。
   * 你的產品是「活動報名系統」，所以最有價值的客戶是：
   * 會反覆辦活動、活動有規模、且找得到聯絡方式的主辦單位。
   * 分數越高代表越值得優先聯繫。可自行調整。
   */
  scoring: {
    hasEmail: 30, // 有 Email，可直接寄開發信
    hasPhone: 15, // 有電話
    hasOrganizer: 10, // 有明確主辦單位名稱
    isPaidEvent: 15, // 付費活動 → 代表有預算
    recurringOrganizerBonus: 25, // 同一主辦在清單中出現多次 → 重度活動辦理者
    upcomingEvent: 10, // 活動日期在未來 → 正在活躍辦活動

    // 活動類別 / 名稱中若含這些關鍵字，加分（代表是組織型、會持續辦活動的單位）
    keywordBonus: 12,
    keywords: [
      '研習', '課程', '講座', '研討會', '工作坊', '培訓', '認證',
      '協會', '學會', '公會', '基金會', '商會', '企業', '公司',
      '展覽', '論壇', '年會', '招生', '營隊', '比賽', '競賽',
    ],

    // 名稱中若含這些關鍵字，代表可能是「一次性 / 個人 / 免費小活動」，扣分
    negativeKeywordPenalty: 10,
    negativeKeywords: ['免費', '個人', '同學會', '聚餐', '揪團'],
  },
}
