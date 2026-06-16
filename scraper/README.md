# beclass 潛在客戶爬蟲 (Lead Scraper)

針對 [beclass.com](https://www.beclass.com/default.php?name=ShowList) 活動列表的爬蟲，
目的是找出**正在辦活動的主辦單位 / 廠商**，作為你「活動報名系統」的潛在客戶名單，
並依「理想客戶輪廓（ICP）」自動評分排序，讓你優先聯繫最有機會成交的對象。

> 純 Node.js 內建功能撰寫，**不需要 `npm install`**，clone 下來就能跑（需 Node 20+）。

---

## 為什麼是這套邏輯？

你的產品是報名系統，最值得開發的客戶 = **會反覆辦活動、活動有規模、且找得到聯絡方式**的單位。
所以爬蟲做兩件事：

1. **抓資料**：從 ShowList 逐頁收集活動 → 進入每個活動詳細頁，抓出
   `主辦單位 / 聯絡人 / 電話 / Email / 日期 / 地點 / 費用 / 類別`。
2. **比對評分**：依 `src/config.js` 的 `scoring` 規則打分數並分級（A/B/C/D），
   有 Email、付費活動、重複辦活動、類型符合（研習/協會/講座…）者得分高。

---

## 快速開始

```bash
cd scraper

# 1) 先小範圍預覽（只抓列表、不進詳細頁，速度快，用來確認連線與版型正常）
node src/index.js --no-details --pages 1-2

# 2) 完整執行（抓詳細頁、評分、輸出 CSV/JSON）
node src/index.js

# 3) 自訂範圍
node src/index.js --pages 1-10 --max-details 150
```

結果輸出在 `scraper/output/`：
- `leads-<時間>.csv`（含 BOM，可直接用 Excel 開啟、不亂碼）
- `leads-<時間>.json`

---

## 指令參數

| 參數 | 說明 |
| --- | --- |
| `--pages 1-5` | 覆蓋要爬的頁碼範圍 |
| `--max-details 100` | 最多抓幾筆詳細頁（避免一次跑太久） |
| `--no-details` | 只抓列表、不進詳細頁（快速預覽） |
| `--inspect <url>` | 偵錯模式：印出某網址的解析結果，方便校正選擇器 |

---

## ⚠️ 第一次執行請務必做的「校正」

我**無法在開發環境連到 beclass**（網路被防火牆擋住），所以**詳細頁的網址樣式與欄位標籤是依平台慣例預設的**，
你第一次在本機跑時，請用 `--inspect` 確認解析正確：

```bash
# 確認「列表頁」的詳細頁連結有被抓到
node src/index.js --inspect "https://www.beclass.com/default.php?name=ShowList"

# 隨便挑一個活動，確認「詳細頁」欄位抓得到
node src/index.js --inspect "https://www.beclass.com/show.php?qrs=<活動代碼>"
```

若解析結果是空的，依下列對照調整：

| 抓不到什麼 | 改哪裡 |
| --- | --- |
| 列表頁找不到活動連結 | `src/lib/parseList.js` 的 `DETAIL_LINK_PATTERNS`（詳細頁網址樣式） |
| 翻頁沒換頁 | `src/config.js` 的 `listUrlTemplate`（分頁參數，可能不是 `&page=`） |
| 主辦/電話/Email 抓不到 | `src/lib/parseDetail.js` 的各 `extractByLabel([...])` 標籤字 |

---

## 設定檔（`src/config.js`）

最常調整的項目：
- `startPage` / `endPage`：爬幾頁
- `fetchDetails`：是否進詳細頁
- `requestDelayMs`：請求間隔（**請保留延遲，當個有禮貌的爬蟲，避免被封鎖**）
- `scoring`：評分權重與關鍵字（你的 ICP 規則）

---

## 使用規範與注意事項

- 本工具只抓取**公開可見**的活動資訊，並內建請求延遲與重試上限，請勿任意調低延遲。
- 抓到的聯絡資訊屬於**個人資料**，請依《個人資料保護法》僅用於合理的商業開發，
  發送行銷訊息時提供退訂管道；`output/` 已預設不進版控。
- 請尊重對方網站的 `robots.txt` 與服務條款；若對方要求停止，請即停止抓取。

---

## 後續可串接

抓出的 CSV/JSON 可以再：
- 匯入你的 CRM / 試算表做後續追蹤
- 與你報名系統現有客戶比對，過濾掉既有客戶（只留新名單）
- 串接寄信 API 做分級開發信（A 級優先）
