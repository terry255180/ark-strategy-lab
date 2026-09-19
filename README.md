# ARK Strategy Lab｜方舟策略實驗室

V1 是可離線使用的 Quant Execution Decision Support 系統。ARK Target 決定應持有多少，Execution Engine 決定今日靠近目標的速度，Premium 與 Concentration Engine 控制 ETF 執行品質。

## 直接執行

雙擊 `index.html`，即可在桌面瀏覽器或 iPhone Safari 開啟。不需要 npm、建置流程、CDN 或網路連線。若瀏覽器限制 `file://` 的儲存，可用任何靜態伺服器開啟資料夾；網站本身沒有伺服器相依。

## 每日使用方式

1. 網頁會依台灣時間自動顯示今日日期，不需要手動輸入。
2. 確認今日 ARK 配置、實際配置、ARK 建議佈局金額，以及昨日／三日前／五日前與近十日高點。
3. CNN、RSI、二十日乖離率、融資維持率與市場位置都屬於非必填進階條件；不確定時維持預設值。
4. ETF 基本資料會保存在瀏覽器。每天只需在 ETF 卡片更新淨值、溢價率、ARK 建議股數與目前權重。
5. 檢查執行建議後按「儲存今日紀錄」。

## 專案架構

- `index.html`：語意化頁面、輸入控制、Dashboard 與 ETF cards。
- `styles.css`：Bloomberg-style 深色終端介面，桌面 Dashboard 與手機 Card layout。
- `config.js`：策略版本與所有 V1 參數。
- `app.js`：Data Layer、State、Strategy Engine、Execution Engine、Result 與 UI Render。

資料流程：`Data Provider → State → Strategy Engine → Execution Engine → Result → UI Render`。

## Strategy Engine 與 State Machine

`determineRegime()` 只回傳一個主要狀態：`ACCUMULATION`、`HOLD`、`WATCH`、`DISTRIBUTION`、`CONFIRMED_DISTRIBUTION` 或 `RISK_OFF`。±1pp dead band 固定為 HOLD。下降期依連續下降天數與近 10 日高點回撤逐級進入 Distribution 狀態；Confirmed Distribution 必須先經過 Distribution，避免單日小幅波動直接從買進切換為高強度賣出。8pp Risk-Off 門檻仍可直接啟動風控。

## Buy Engine

`calculateBuyMultiplier()` 對 gap 使用連續分段函數：小 gap 可達 3×，20pp 以上逐步降至 1.8×。`calculateBuyTrendFactor()` 再依 1D Ark 方向調整，最後 clamp 至 0–3×。建議曝險仍以 gap fill rate 分批靠近，不會一天補滿。

## Sell Engine

賣出只處理 `Actual - Ark Target` 的超額曝險。Distribution、Confirmed Distribution、Risk-Off 的基準填補率分別為 15%、25%、50%，市場指標只調整速度，不能凌駕 Ark 風控。

## Premium 與 Concentration Engine

溢價不會以固定 0.5% 門檻永久封鎖買進。`calculatePremiumDecision()` 同時考慮 urgency 與 concentration，輸出 `BUY AT NAV`、`BUY WITH PREMIUM`、`EXECUTION PRIORITY`、`WAIT FOR NAV` 或 `STOP ADDING`。集中度達 soft cap 代表停止加碼，不代表強制賣出。

`reconcileExecutionBudget()` 保證 ETF 最終委託總額不超過使用者輸入的「ARK 建議佈局金額」。若未填金額，才以 ARK 建議籃子名目金額乘以 Global Multiplier 作為替代上限。`evaluatePremiumCounterfactual()` 已保留未來 1D／3D／5D 的 BUY NOW 與 WAIT FOR NAV 研究介面。

## localStorage

個人輸入、ETF 資料、中央資料 cache 與最近 60 個交易日 snapshot 分開保存。相同日期再次按 `SAVE TODAY` 會先詢問是否更新，不會新增重複紀錄。私人資料不會送至任何中央來源。

## 修改 CONFIG

在 `config.js` 修改 dead band、回撤門檻、sell fill rate、buy multiplier 或 `strategyVersion`。每一筆 Snapshot 都會保存當時的策略版本。

## Google Sheets API 擴充

`app.js` 已提供 `GoogleSheetsDataProvider`。依照 `google-apps-script/README.md` 部署 `Code.gs`，再把 `/exec` 網址填入 `config.js` 的 `googleSheets.webAppUrl`，網站開啟時就會自動讀取「紀錄」工作表。API 採安全欄位白名單，不會回傳總資產、現金、私人持股、成本或損益；同步失敗時使用上次成功的本機快取。

## 驗證

頁面內建 `runSelfTests()`，涵蓋 HOLD、BUY、大 gap multiplier、Distribution、Risk-Off、動態溢價、集中度上限、budget reconciliation、localStorage 與同日更新，共 10 項。

本工具是 Decision Support / Historical Research 系統，不是券商交易介面，也不構成保證、預測或最佳買賣點建議。
