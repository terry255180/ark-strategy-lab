const SPREADSHEET_ID = '1YlZu_ztxjwjdBkld25l4H4WdaBb94E8u3r02-ew3NfA';
const SHEET_NAME = '紀錄';
const SHEET_GID = 671589303;

// 只輸出網站策略運算需要的欄位。私人資產、庫存與損益不會離開試算表。
const SAFE_FIELDS = {
  '日期': 'date',
  '台灣加權指數': 'taiwanIndex',
  '持股配置(%)': 'arkAllocation',
  '現在持股(%)': 'actualAllocation',
  'CNN貪婪指數': 'cnn',
  '折價檔數': 'discountCount',
  '溢價檔數': 'premiumCount',
  '方舟啟航': 'arkSuggestedCapital',
  '缺口(建議-現在)': 'allocationGap',
  '融資維持率(%)': 'marginMaintenance',
  'RSI': 'rsi'
};

function doGet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetById(SHEET_GID) || spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      const availableSheets = spreadsheet.getSheets().map(item => ({
        name: item.getName(),
        gid: item.getSheetId()
      }));
      return jsonOutput({
        ok: false,
        error: `找不到 gid=${SHEET_GID} 或名稱為「${SHEET_NAME}」的工作表。`,
        availableSheets
      });
    }

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return jsonOutput({ ok: true, records: [], syncedAt: new Date().toISOString() });

    const headers = values[0].map(value => String(value).trim());
    const records = values.slice(1).map(row => {
      const record = {};
      headers.forEach((header, index) => {
        const safeKey = SAFE_FIELDS[header];
        if (!safeKey) return;
        const value = row[index];
        record[safeKey] = value instanceof Date
          ? Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd')
          : value;
      });
      return record;
    }).filter(record => record.date && record.arkAllocation !== '');

    return jsonOutput({
      ok: true,
      sheet: sheet.getName(),
      gid: sheet.getSheetId(),
      syncedAt: new Date().toISOString(),
      records
    });
  } catch (error) {
    return jsonOutput({ ok: false, error: String(error && error.message || error) });
  }
}

function doPost(event) {
  try {
    const request = JSON.parse(event && event.postData && event.postData.contents || '{}');
    if (request.action !== 'vision') return jsonOutput({ ok: false, error: '不支援的操作。' });
    return jsonOutput(analyzeArkImages_(request));
  } catch (error) {
    return jsonOutput({ ok: false, error: String(error && error.message || error) });
  }
}

function analyzeArkImages_(request) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty('GEMINI_API_KEY');
  const accessToken = properties.getProperty('VISION_ACCESS_TOKEN');
  if (!apiKey) throw new Error('Apps Script 尚未設定 GEMINI_API_KEY。');
  if (!accessToken) throw new Error('Apps Script 尚未設定 VISION_ACCESS_TOKEN。');
  if (!request.token || request.token !== accessToken) throw new Error('AI 辨識密碼不正確。');

  const images = Array.isArray(request.images) ? request.images.slice(0, 5) : [];
  if (!images.length) throw new Error('沒有收到圖片。');
  let totalLength = 0;
  images.forEach((image, index) => {
    if (!image || !/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(String(image.mimeType || ''))) throw new Error(`第 ${index + 1} 張圖片格式不支援。`);
    if (!image.data || String(image.data).length > 5500000) throw new Error(`第 ${index + 1} 張圖片過大。`);
    totalLength += String(image.data).length;
  });
  if (totalLength > 12000000) throw new Error('圖片總大小超過 9MB，請減少張數或使用原始截圖。');
  enforceVisionDailyLimit_(properties);

  const model = properties.getProperty('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
  const parts = [{ text: buildArkVisionPrompt_() }].concat(images.map(image => ({
    inlineData: { mimeType: image.mimeType, data: image.data }
  })));
  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'ETF 股票代號' },
            name: { type: 'string', description: 'ETF 中文名稱' },
            premiumPercent: { type: 'number', description: '折溢價百分比，保留正負號' },
            positionShares: { type: 'integer', description: '黃色的位階股數' },
            positionAmount: { type: 'integer', description: '黃色的位階布局金額' },
            riskShares: { type: 'integer', description: '灰色的風控股數' },
            riskAmount: { type: 'integer', description: '灰色的風控布局金額' }
          },
          required: ['symbol', 'name']
        }
      }
    },
    required: ['items']
  };
  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };
  const response = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const bodyText = response.getContentText();
  if (status < 200 || status >= 300) {
    let detail = bodyText;
    try { detail = JSON.parse(bodyText).error.message || bodyText; } catch (_) {}
    throw new Error(`Gemini API ${status}：${String(detail).slice(0, 240)}`);
  }
  const body = JSON.parse(bodyText);
  const text = (((body.candidates || [])[0] || {}).content || {}).parts;
  const jsonText = Array.isArray(text) ? text.map(part => part.text || '').join('') : '';
  if (!jsonText) throw new Error('Gemini 沒有回傳可用資料。');
  const parsed = JSON.parse(jsonText);
  const items = normalizeGeminiItems_(parsed.items || []);
  if (!items.length) throw new Error('Gemini 沒有辨識出 ETF。');
  return { ok: true, provider: 'gemini', model, detectedRows: items.length, items };
}

function buildArkVisionPrompt_() {
  return [
    '你正在辨識台灣券商 App 的「價值佈局」ETF 清單截圖。多張圖片可能有重疊列，最後只保留每個 ETF 一筆。',
    '辨識圖片中所有可見 ETF，不限固定清單。股票代號通常為 4 至 6 位數字，部分主動式或槓桿 ETF 會在尾端帶英文字母，例如 00981A、00631L。',
    '逐列讀取：股票代號與中文名稱；即時淨值下方紅色或綠色的折溢價%；位階股數欄上方黃色數字；位階布局金額欄上方黃色數字；同欄下方灰色的風控股數與風控布局金額。',
    '0 是合法值，不可因為是 0 而省略。不要把即時淨值當作布局金額，也不要把黃色與灰色數字交換。',
    '若兩張圖出現同一 ETF，合併為一筆並採用最清楚完整的數值。逐列掃描，不可只辨識既有或熟悉的 ETF，也不要生成圖片中不存在的 ETF。僅回傳符合指定 JSON schema 的結果。'
  ].join('\n');
}

function normalizeGeminiItems_(rawItems) {
  const names = {
    '0055':'元大MSCI金融','00960':'野村全球航運龍頭','00875':'國泰網路資安','0056':'元大高股息','0050':'元大台灣50',
    '00830':'國泰費城半導體','00631L':'元大台灣50正2','0052':'富邦科技','00911':'兆豐洲際半導體','0053':'元大電子',
    '006208':'富邦台50','0057':'富邦摩台','00988A':'主動統一全球創新','00913':'兆豐台灣晶圓製造','00935':'野村臺灣新科技50',
    '00947':'台新臺灣IC設計','00891':'中信關鍵半導體','00981A':'主動統一台股增長','00728':'第一金工業30','00690':'兆豐藍籌30',
    '00927':'群益半導體收益','00894':'中信小資高價30'
  };
  const map = {};
  (rawItems || []).forEach(raw => {
    let symbol = String(raw.symbol || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^O/, '0');
    if (symbol === '00631') symbol = '00631L';
    if (!/^\d{4,6}[A-Z]?$/.test(symbol)) return;
    const item = {
      symbol,
      name: names[symbol] || String(raw.name || '').trim() || symbol,
      premiumPercent: numberOrNull_(raw.premiumPercent),
      positionShares: integerOrNull_(raw.positionShares),
      positionAmount: integerOrNull_(raw.positionAmount),
      riskShares: integerOrNull_(raw.riskShares),
      riskAmount: integerOrNull_(raw.riskAmount)
    };
    const old = map[symbol];
    if (!old) map[symbol] = item;
    else Object.keys(item).forEach(key => { if ((old[key] === null || old[key] === '') && item[key] !== null) old[key] = item[key]; });
  });
  return Object.keys(map).map(key => map[key]);
}

function numberOrNull_(value) {
  if (value === null || value === '' || value === undefined) return null;
  const number = Number(String(value).replace(/[%,$，\s]/g, ''));
  return isFinite(number) ? number : null;
}

function integerOrNull_(value) {
  const number = numberOrNull_(value);
  return number === null ? null : Math.max(0, Math.round(number));
}

function enforceVisionDailyLimit_(properties) {
  const limit = Math.max(1, Number(properties.getProperty('VISION_DAILY_LIMIT') || 30));
  const day = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  const key = `VISION_USAGE_${day}`;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const used = Number(properties.getProperty(key) || 0);
    if (used >= limit) throw new Error(`今日 AI 辨識已達 ${limit} 次上限。`);
    properties.setProperty(key, String(used + 1));
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
