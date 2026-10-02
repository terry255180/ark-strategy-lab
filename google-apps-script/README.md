# Google 試算表同步與 Gemini 圖片辨識設定

這個 Apps Script 會優先以工作表 GID `671589303` 讀取指定分頁，並以「紀錄」名稱作為備援。即使分頁日後重新命名，GID 不變就仍可同步。程式只輸出網站需要的安全欄位；今日／累積損益、台美股庫存、台幣與總資產不會出現在 API 回應中。

同一個 Apps Script 網頁應用程式同時處理：

- `GET`：讀取 Google 試算表中的安全白名單欄位。
- `POST`：驗證私人密碼後，把 ETF 截圖交給 Gemini 分析。

Gemini API Key 與私人辨識密碼只存在 Apps Script 的「指令碼屬性」，不會寫入 GitHub Pages。

## 第一次設定

1. 開啟指定的 Google 試算表。
2. 選擇「擴充功能」→「Apps Script」。
3. 把 `Code.gs` 的全部內容貼入編輯器並儲存。
4. 到 [Google AI Studio](https://aistudio.google.com/apikey) 建立 Gemini API Key。
5. 在 Apps Script 左側選擇「專案設定」→「指令碼屬性」，新增：
   - `GEMINI_API_KEY`：步驟 4 取得的 API Key。
   - `VISION_ACCESS_TOKEN`：自行設定一組夠長、不可猜測的私人密碼。
   - `GEMINI_MODEL`：可省略；預設為 `gemini-2.5-flash-lite`。
   - `VISION_DAILY_LIMIT`：可省略；預設每天最多辨識 30 次。
6. 選擇右上角「部署」→「新增部署作業」。
7. 類型選擇「網頁應用程式」。
8. 執行身分選擇「我」。
9. 存取權限需允許 GitHub Pages 呼叫。因端點可被公開存取，程式會再以 `VISION_ACCESS_TOKEN` 驗證圖片辨識請求，試算表回應則仍只含安全欄位白名單。
10. 完成部署並複製以 `/exec` 結尾的網頁應用程式網址。
11. 打開專案根目錄的 `config.js`，將網址填入 `googleSheets.webAppUrl`。
12. 開啟網站，在「AI 辨識密碼」輸入與 `VISION_ACCESS_TOKEN` 完全相同的值。密碼只會保存在目前瀏覽器的本機儲存空間。

## 更新現有部署

每次修改 `Code.gs` 後，必須到「部署」→「管理部署作業」→鉛筆圖示，將版本改為「新版本」並部署。請更新既有部署，不必建立新的網址。

## 辨識流程

網站會優先使用 Gemini 回傳股票代號、名稱、折溢價、位階股數／金額與風控股數／金額，再核對代碼並移除重複 ETF。Gemini 無法連線、額度用完或密碼錯誤時，網站會自動改用原本的本機 Tesseract OCR。

部署完成後，網站每次開啟會自動同步；同步失敗時會繼續使用上次成功的本機快取。
