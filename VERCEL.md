# Vercel 部署

網站、Gemini 圖片辨識與 Yahoo 行情都由同一個 Vercel 專案提供；Google Sheet 同步暫時繼續使用既有 Apps Script。前端不再透過 `Code.gs` 呼叫 Gemini 或 Yahoo。

## 第一次部署

1. 在 Vercel 選擇 **Add New → Project**，匯入 `terry255180/ark-strategy-lab`。
2. Framework Preset 選 **Other**，Root Directory 保持專案根目錄，無需 Build Command。
3. 在 Environment Variables 新增：
   - `GEMINI_API_KEY`：Google AI Studio 的 API Key。
   - `VISION_ACCESS_TOKEN`：自行設定的長密碼，網站辨識時輸入相同內容。
   - `GEMINI_MODEL`：可省略；預設 `gemini-3.5-flash-lite`。
4. 按 **Deploy**。

部署成功後，Production Branch 保持 `main`。此後推送 GitHub `main` 會自動更新網站與兩個 API，不需要再部署 `Code.gs`。

## API

- `POST /api/vision`：Gemini ETF 清單與持股截圖辨識。
- `GET /api/returns?symbols=0050,0052`：Yahoo 最新價格與今年至今、1 年、3 年報酬。
- `GET /api/search?q=台積電`：以台股名稱或代號查詢正式代號。

`GEMINI_API_KEY` 與 `VISION_ACCESS_TOKEN` 只能放在 Vercel Environment Variables，不可寫入 `config.js` 或提交到 GitHub。

## 本機驗證

```bash
npm test
npm run check
npx vercel dev
```

`vercel dev` 測試 Gemini 時，本機需透過 `.env.local` 提供相同環境變數；`.env.local` 不可提交。
