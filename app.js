"use strict";

const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, d = 2) => Number(Number(v).toFixed(d));
const pp = (v) => `${v >= 0 ? "+" : ""}${round(v, 2).toFixed(2)}%`;
const pct = (v, d = 1) => `${round(v, d).toFixed(d)}%`;
const num = (id, fallback = 0) => Number($(id).value || fallback);
const REGIME_ZH = {
  ACCUMULATION: "累積建倉",
  DEFENSIVE_ACCUMULATION: "防守型分批建倉",
  HOLD: "觀望不動",
  WATCH: "暫停觀察",
  DISTRIBUTION: "分批調節",
  CONFIRMED_DISTRIBUTION: "確認調節",
  RISK_OFF: "風險降低",
};
const ACTION_ZH = { BUY: "買進", SELL: "賣出", HOLD: "不交易" };
const STATUS_ZH = {
  "STOP ADDING": "停止加碼",
  "BUY @ NAV": "以淨值附近買進",
  "BUY AT NAV": "以淨值附近買進",
  "BUY WITH PREMIUM": "接受溢價買進",
  "EXECUTION PRIORITY": "優先執行",
  "WAIT FOR NAV": "等待接近淨值",
  "WAIT & ACCUMULATE": "等待並累積",
  "ROUNDING LIMITED": "受整股取整限制",
  "EXTREME BUY": "極端機會建倉",
  BUY: "買進",
};
const regimeZh = (value) => REGIME_ZH[value] || value;
const actionZh = (value) => ACTION_ZH[value] || value;
const statusZh = (value) => STATUS_ZH[value] || value;

const SOURCE_RECORDS = [
  { date: "2026-09-07", arkAllocation: 69.1, taiwanIndex: 47326.27 },
  { date: "2026-09-09", arkAllocation: 73.4, taiwanIndex: 47183.36 },
  { date: "2026-09-10", arkAllocation: 75.1, taiwanIndex: 46940.49 },
  { date: "2026-09-11", arkAllocation: 77.9, taiwanIndex: 46184.85 },
  { date: "2026-09-14", arkAllocation: 79.0, taiwanIndex: 45862.52 },
  { date: "2026-09-15", arkAllocation: 78.2, taiwanIndex: 45511.49 },
  { date: "2026-09-16", arkAllocation: 76.6, taiwanIndex: 45848.9 },
  { date: "2026-09-17", arkAllocation: 73.6, taiwanIndex: 46288.0 },
];
const SOURCE_HISTORY = SOURCE_RECORDS.map((row) => row.arkAllocation);
const SAMPLE_ETFS = [
  [
    "0050",
    "元大台灣50",
    108.9,
    -0.18,
    7,
    7.2,
    "TAIWAN_EQUITY",
    1,
    "TAIWAN_LARGE_CAP",
  ],
  [
    "006208",
    "富邦台50",
    126.4,
    0.12,
    5,
    8.5,
    "TAIWAN_EQUITY",
    1,
    "TAIWAN_LARGE_CAP",
  ],
  [
    "00911",
    "兆豐洲際半導體",
    33.55,
    2.83,
    8,
    4.2,
    "GLOBAL_EQUITY",
    1,
    "SEMICONDUCTOR",
  ],
  [
    "00830",
    "國泰費城半導體",
    48.22,
    1.7,
    6,
    6.8,
    "US_EQUITY",
    1,
    "SEMICONDUCTOR",
  ],
  [
    "00910",
    "第一金太空衛星",
    28.18,
    1.26,
    9,
    5.1,
    "GLOBAL_EQUITY",
    1,
    "GLOBAL_THEME",
  ],
  [
    "00920",
    "富邦ESG綠色電力",
    15.84,
    0.96,
    10,
    7.4,
    "GLOBAL_EQUITY",
    1,
    "GLOBAL_THEME",
  ],
  [
    "00631L",
    "元大台灣50正2",
    256.5,
    0.42,
    1,
    6.5,
    "LEVERAGED_TW",
    2,
    "TAIWAN_LARGE_CAP",
  ],
];

class LocalDataProvider {
  async getCentralData() {
    const cached = JSON.parse(
      localStorage.getItem(CONFIG.storageKeys.cache) || "null",
    );
    return (
      cached || {
        syncedAt: null,
        source: "本機資料",
        arkHistory: SOURCE_HISTORY,
      }
    );
  }
  async sync() {
    const data = {
      syncedAt: new Date().toISOString(),
      source: "本機快取",
      arkHistory: SOURCE_HISTORY,
    };
    localStorage.setItem(CONFIG.storageKeys.cache, JSON.stringify(data));
    return data;
  }
}
class GoogleSheetsDataProvider {
  constructor(webAppUrl) {
    this.webAppUrl = webAppUrl;
  }
  async getCentralData() {
    try {
      return JSON.parse(
        localStorage.getItem(CONFIG.storageKeys.cache) || "null",
      );
    } catch {
      return null;
    }
  }
  async sync() {
    if (!this.webAppUrl)
      throw new Error("尚未設定 Apps Script 網頁應用程式網址。");
    if (location.protocol === "file:")
      throw new Error(
        "請從 http://127.0.0.1:4173/ 開啟網站；直接開啟 index.html 可能被瀏覽器擋下跨站同步。",
      );
    const separator = this.webAppUrl.includes("?") ? "&" : "?";
    const response = await fetch(
      `${this.webAppUrl}${separator}t=${Date.now()}`,
      { method: "GET", redirect: "follow", cache: "no-store" },
    );
    if (!response.ok) throw new Error(`同步失敗（HTTP ${response.status}）`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json"))
      throw new Error(
        "Apps Script 端點目前需要 Google 登入。請將網頁應用程式的存取權限改為「所有人」。",
      );
    const payload = await response.json();
    if (!payload.ok)
      throw new Error(payload.error || "Google 試算表回傳錯誤。");
    const data = {
      ...payload,
      source: "Google 試算表",
      syncedAt: payload.syncedAt || new Date().toISOString(),
    };
    localStorage.setItem(CONFIG.storageKeys.cache, JSON.stringify(data));
    return data;
  }
}
const dataProvider = CONFIG.googleSheets?.enabled
  ? new GoogleSheetsDataProvider(CONFIG.googleSheets.webAppUrl)
  : new LocalDataProvider();

function applyCentralData(data) {
  const records = (data?.records || [])
    .filter((row) => row.date && Number.isFinite(Number(row.arkAllocation)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!records.length) return false;
  window.centralRecords = records.map((row) => ({
    ...row,
    arkAllocation: Number(row.arkAllocation),
    taiwanIndex: Number(row.taiwanIndex),
  }));
  const latest = records.at(-1),
    lookbacks = getArkLookbackValues(
      records,
      $("decisionDate")?.value ||
        new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }),
    ),
    allocations = records.map((row) => Number(row.arkAllocation));
  const setNumber = (id, value) => {
    if (
      value !== "" &&
      value !== null &&
      value !== undefined &&
      Number.isFinite(Number(value))
    )
      $(id).value = Number(value);
  };
  setNumber("yesterdayArk", lookbacks.yesterday);
  setNumber("ark3D", lookbacks.threeDaysAgo);
  setNumber("ark5D", lookbacks.fiveDaysAgo);
  setNumber("peak10D", Math.max(...allocations.slice(-10)));
  setNumber("cnn", latest.cnn);
  setNumber("margin", latest.marginMaintenance);
  setNumber("rsi", latest.rsi);
  renderDashboard();
  return true;
}

function findLatestTradingRecord(records, todayDate) {
  const today = String(todayDate || "").slice(0, 10);
  return (records || [])
    .filter(
      (row) =>
        row?.date &&
        String(row.date).slice(0, 10) <= today &&
        Number.isFinite(Number(row.arkAllocation)),
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .at(-1);
}

async function syncLatestTradingDayData() {
  const button = $("syncLatestTradingDayBtn"),
    today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  button.disabled = true;
  button.textContent = "同步中…";
  try {
    const data = await syncCentralData(),
      record = findLatestTradingRecord(
        data?.records || window.centralRecords || [],
        today,
      );
    if (!record) throw new Error("找不到最近開盤日資料。");
    const setNumber = (id, value) => {
      if (
        value !== "" &&
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value))
      )
        $(id).value = Number(value);
    };
    setNumber("todayArk", record.arkAllocation);
    setNumber("currentTaiwanIndex", record.taiwanIndex);
    setNumber("actualAllocation", record.actualAllocation);
    setNumber("arkSuggestedCapital", record.arkSuggestedCapital);
    const recordDate = String(record.date).slice(0, 10);
    $("decisionDate").value = recordDate;
    $("decisionDateDisplay").textContent = recordDate.replaceAll("-", "/");
    applyCentralData(data);
    persistState();
    renderDashboard();
    const isToday = recordDate === today;
    $("syncStatus").textContent = `${isToday ? "今日開盤資料" : "最近開盤日"} ${recordDate.replaceAll("-", "/")} · 已同步`;
    $("saveMessage").textContent = isToday
      ? "已同步今日開盤資料。"
      : `今日尚無開盤資料，已自動套用最近開盤日 ${recordDate.replaceAll("-", "/")}。`;
  } catch (error) {
    $("saveMessage").textContent = `最近開盤資料同步失敗：${String(error?.message || error)}`;
  } finally {
    button.disabled = false;
    button.textContent = "同步最近開盤資料";
  }
}

function getArkLookbackValues(records, todayDate) {
  const valid = (records || [])
      .filter((row) => row?.date && Number.isFinite(Number(row.arkAllocation)))
      .map((row) => ({
        date: String(row.date).slice(0, 10),
        arkAllocation: Number(row.arkAllocation),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    latestIndex = valid.length - 1;
  if (latestIndex < 0)
    return { yesterday: null, threeDaysAgo: null, fiveDaysAgo: null };
  const latestIsToday =
      valid[latestIndex].date === String(todayDate).slice(0, 10),
    yesterdayIndex = latestIndex - (latestIsToday ? 1 : 0),
    valueAtTradingOffset = (offset) =>
      valid[Math.max(0, yesterdayIndex - offset)]?.arkAllocation ?? null;
  return {
    yesterday: valueAtTradingOffset(0),
    threeDaysAgo: valueAtTradingOffset(2),
    fiveDaysAgo: valueAtTradingOffset(4),
  };
}

async function syncCentralData({ silent = false } = {}) {
  try {
    $("syncStatus").textContent = silent ? "更新全年資料中…" : "同步中…";
    const data = await dataProvider.sync();
    applyCentralData(data);
    $("syncStatus").textContent =
      `Google 試算表 · ${new Date(data.syncedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`;
    $("syncStatus").title = "";
    return data;
  } catch (error) {
    const cached = await dataProvider.getCentralData();
    if (cached) applyCentralData(cached);
    const reason =
      error instanceof TypeError
        ? "連線遭瀏覽器阻擋或網路中斷；請確認使用 http://127.0.0.1:4173/ 開啟，並檢查 Apps Script 公開權限"
        : String(error?.message || "未知錯誤");
    $("syncStatus").textContent =
      `同步失敗：${reason}${cached ? " · 使用上次快取" : ""}`;
    $("syncStatus").title = String(error?.message || reason);
    if (!silent) $("saveMessage").textContent = reason;
    return cached;
  }
}

function calculateGap(todayArk, actual) {
  return round(todayArk - actual, 4);
}
function calculateArkPeak(values) {
  return Math.max(...values.slice(-10));
}
function calculateArkTrend(values) {
  const last = values.length - 1;
  const delta = (days) =>
    last - days >= 0 ? round(values[last] - values[last - days], 2) : 0;
  return {
    delta1D: delta(1),
    delta2D: delta(2),
    delta3D: delta(3),
    delta5D: delta(5),
    peak: calculateArkPeak(values),
    drawdown: round(values[last] - calculateArkPeak(values), 2),
  };
}
function consecutiveDeclines(values) {
  let n = 0;
  for (let i = values.length - 1; i > 0 && values[i] < values[i - 1]; i--) n++;
  return n;
}

function shouldPauseBuying(state) {
  const { trend, arkHistory, cnn = 0, rsi = 0, marketPosition = "MID" } = state;
  const rapidDrop = trend.delta1D <= -CONFIG.rapidDropPause;
  const prolongedRapidDrop =
    consecutiveDeclines(arkHistory) >= 3 &&
    Math.abs(Math.min(0, trend.drawdown)) >= CONFIG.prolongedDropPause;
  const extremeOverheat = cnn >= 80 && rsi >= 80 && marketPosition === "HIGH";
  return rapidDrop || prolongedRapidDrop || extremeOverheat;
}

function determineRegime(state) {
  const {
    gap,
    trend,
    actualAllocation,
    todayArk,
    previousRegime = "HOLD",
  } = state;
  if (Math.abs(gap) <= CONFIG.deadBand) return "HOLD";
  const excess = actualAllocation > todayArk;
  const dd = Math.abs(Math.min(0, trend.drawdown));
  if (excess && dd >= CONFIG.riskOffDrawdown) return "RISK_OFF";
  if (
    excess &&
    dd >= CONFIG.confirmedDistributionDrawdown &&
    ["DISTRIBUTION", "CONFIRMED_DISTRIBUTION"].includes(previousRegime)
  )
    return "CONFIRMED_DISTRIBUTION";
  if (
    excess &&
    consecutiveDeclines(state.arkHistory) >= 2 &&
    dd >= CONFIG.distributionDrawdown
  )
    return "DISTRIBUTION";
  if (gap > CONFIG.deadBand) {
    if (shouldPauseBuying(state)) return "WATCH";
    const weakening =
      trend.delta1D < 0 || (previousRegime.includes("DISTRIBUTION") && dd > 1);
    if (weakening && gap <= CONFIG.buyWatchMaxGap) return "WATCH";
    if (gap > CONFIG.defensiveAccumulationGap) return "DEFENSIVE_ACCUMULATION";
    return "ACCUMULATION";
  }
  return "HOLD";
}

function calculateBuyMultiplier(gap) {
  if (gap <= 1) return 0;
  if (gap <= 5) return 3;
  if (gap <= 10) return 3 - (gap - 5) * 0.06;
  if (gap <= 20) return 2.7 - (gap - 10) * 0.04;
  return clamp(
    2.3 - (gap - 20) * 0.02,
    CONFIG.minInitialBuildMultiplier,
    CONFIG.maxBuyMultiplier,
  );
}
function calculateBuyTrendFactor(delta1D) {
  if (delta1D >= 2) return 1.1;
  if (delta1D >= 0) return 1;
  if (delta1D >= -2) return 0.9;
  if (delta1D >= -4) return 0.7;
  return 0.5;
}
function calculateSellFillRate(
  regime,
  excessGap = Infinity,
  marketModifier = 1,
) {
  if (excessGap <= 2) return round(clamp(0.22 * marketModifier, 0.2, 0.25), 3);
  const base =
    {
      DISTRIBUTION: CONFIG.sellFillDistribution,
      CONFIRMED_DISTRIBUTION: CONFIG.sellFillConfirmed,
      RISK_OFF: CONFIG.sellFillRiskOff,
    }[regime] || 0;
  if (excessGap <= 5) return round(clamp(base * marketModifier, 0.15, 0.35), 3);
  return round(clamp(base * marketModifier, 0, 0.5), 3);
}
function calculateMarketModifier(input, action) {
  let modifier = 1;
  const hot =
    input.cnn >= 65 || input.rsi >= 70 || input.marketPosition === "HIGH";
  const cold =
    input.cnn <= 25 || input.rsi <= 30 || input.marketPosition === "LOW";
  if (action === "SELL") modifier *= hot ? 1.15 : cold ? 0.85 : 1;
  if (action === "BUY") modifier *= cold ? 1.1 : hot ? 0.9 : 1;
  return clamp(modifier, 0.75, 1.25);
}
function calculateUrgencyScore(gap, trend, regime, action = "HOLD") {
  const regimePoints = {
    HOLD: 5,
    WATCH: 20,
    ACCUMULATION: 45,
    DEFENSIVE_ACCUMULATION: 50,
    DISTRIBUTION: 60,
    CONFIRMED_DISTRIBUTION: 78,
    RISK_OFF: 95,
  }[regime];
  const raw =
    regimePoints +
    Math.min(Math.abs(gap), 20) -
    Math.min(Math.abs(trend.delta1D), 5);
  if (action === "SELL") {
    const excess = Math.abs(Math.min(0, gap));
    if (excess <= 2)
      return Math.round(
        clamp(
          50 +
            Math.max(0, excess - CONFIG.deadBand) * 15 +
            Math.min(Math.abs(trend.drawdown), 10) * 0.5,
          50,
          65,
        ),
      );
    if (excess <= 5) return Math.round(clamp(raw, 55, 80));
  }
  return Math.round(clamp(raw, 0, 100));
}
function calculateConcentrationFactor(etf) {
  const w = etf.currentWeight,
    leveraged = etf.leverage > 1 || etf.assetType === "LEVERAGED_TW";
  if (leveraged) return w < 6 ? 1 : w < 8 ? 0.75 : w < 10 ? 0.5 : 0;
  return w < 8 ? 1 : w < 10 ? 0.75 : w < 12 ? 0.5 : 0;
}
function calculatePremiumDecision(etf, urgency, concentrationFactor) {
  if (concentrationFactor === 0) return { factor: 0, status: "STOP ADDING" };
  if (etf.premium <= 0.1) return { factor: 1, status: "BUY AT NAV" };
  const tolerance = 0.25 + (urgency / 100) * 1.5;
  if (etf.premium <= tolerance)
    return {
      factor: clamp(1 - etf.premium * 0.08, 0.72, 1),
      status: urgency >= 70 ? "EXECUTION PRIORITY" : "BUY WITH PREMIUM",
    };
  if (urgency >= 80 && etf.premium < 2.5)
    return { factor: 0.65, status: "EXECUTION PRIORITY" };
  return { factor: 0, status: "WAIT FOR NAV" };
}
function evaluatePremiumCounterfactual() {
  return {
    status: "RESEARCH_PENDING",
    horizons: [1, 3, 5],
    navOnly: "NOT_EVALUATED",
  };
}

function calculateDecision(input) {
  const gap = calculateGap(input.todayArk, input.actualAllocation),
    arkHistory = [...input.arkHistory.slice(-9), input.todayArk],
    trend = calculateArkTrend(arkHistory),
    history = input.strategyHistory?.length
      ? input.strategyHistory
      : arkHistory.map((arkAllocation, index) => ({
          arkAllocation,
          taiwanIndex:
            index === arkHistory.length - 1 ? input.currentTaiwanIndex : null,
        })),
    savedExecution = (() => {
      try {
        return JSON.parse(
          localStorage.getItem(CONFIG.storageKeys.strategyExecution) || "{}",
        );
      } catch {
        return {};
      }
    })(),
    strategyState =
      input.strategyState !== undefined ? input.strategyState : savedExecution,
    strategy = window.ARKStrategyEngine.evaluateStrategy(
      {
        A: input.todayArk,
        W: input.actualAllocation,
        CNN: input.cnn,
        M: input.margin,
        history,
        currentIndex: history.length - 1,
      },
      strategyState,
    ),
    action = strategy.action,
    target = strategy.targetAllocation,
    rate = Math.abs(gap) > 0 ? strategy.adjustmentPoints / Math.abs(gap) : 0,
    regime =
      strategy.mode === window.ARKStrategyEngine.MODES.EXTREME_BUY
        ? "DEFENSIVE_ACCUMULATION"
        : strategy.mode === window.ARKStrategyEngine.MODES.GENERAL_BUY
          ? "ACCUMULATION"
          : strategy.mode === window.ARKStrategyEngine.MODES.ACCELERATED_SELL
            ? "RISK_OFF"
            : strategy.mode === window.ARKStrategyEngine.MODES.GENERAL_SELL
              ? "DISTRIBUTION"
              : "HOLD",
    label = strategy.mode.replaceAll("_", " ");
  return {
    gap,
    trend,
    regime,
    action,
    rate: round(rate, 3),
    target: round(target, 2),
    label,
    urgency: calculateUrgencyScore(gap, trend, regime, action),
    arkHistory,
    suggestedCapital: input.arkSuggestedCapital,
    strategy,
    adjustmentPoints: strategy.adjustmentPoints,
  };
}

function arkWaterLevelState(input, d) {
  const levels = CONFIG.arkWaterLevels,
    value = Number(input.todayArk),
    direction =
      d.trend.delta1D > 0 ? "RISING" : d.trend.delta1D < 0 ? "FALLING" : "FLAT",
    zone =
      value >= levels.upperDecile
        ? "HIGH"
        : value <= levels.lowerDecile
          ? "LOW"
          : "NORMAL";
  return { zone, direction, value, levels };
}
function applyArkWaterLevelDecisionPolicy(input, decision) {
  const d = { ...decision, trend: { ...decision.trend } },
    state = arkWaterLevelState(input, d);
  if (
    state.zone === "HIGH" &&
    state.direction === "RISING" &&
    d.action === "SELL"
  ) {
    d.action = "HOLD";
    d.regime = "HOLD";
    d.rate = 0;
    d.target = input.actualAllocation;
    d.label = "HIGH ARK · NO SELL";
    d.urgency = Math.min(d.urgency, 40);
    d.waterLevelPolicy = "HIGH_RISING_NO_SELL";
  } else if (state.zone === "LOW" && state.direction === "FALLING") {
    d.waterLevelPolicy = "LOW_FALLING_DEFENSIVE";
  } else d.waterLevelPolicy = "NORMAL";
  d.waterLevelState = state;
  return d;
}

function parseETFData(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 10)
    .map((line) => {
      const parts = line
        .trim()
        .split(/\t|,|，|\s{2,}/)
        .map((v) => v.trim())
        .filter(Boolean);
      if (parts[0]?.toLowerCase() === "symbol") return null;
      const [
        symbol,
        name,
        nav,
        premium,
        arkShares,
        currentWeight,
        assetType,
        leverage,
        exposureGroup,
      ] = parts;
      return {
        symbol,
        name,
        nav: Number(nav),
        premium: Number(String(premium).replace("%", "")),
        arkShares: Number(arkShares),
        currentWeight: Number(String(currentWeight).replace("%", "")),
        assetType,
        leverage: Number(leverage || 1),
        exposureGroup,
      };
    })
    .filter(
      (e) =>
        e && e.symbol && Number.isFinite(e.nav) && Number.isFinite(e.arkShares),
    );
}

let ocrFiles = [];
let ocrObjectUrls = [];
let ocrRows = [];
function blobToBase64Payload(blob, fileName = "圖片") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [header, data] = String(reader.result || "").split(",", 2);
      resolve({
        mimeType:
          (header.match(/^data:([^;]+)/) || [])[1] || blob.type || "image/jpeg",
        data,
      });
    };
    reader.onerror = () => reject(new Error(`無法讀取圖片：${fileName}`));
    reader.readAsDataURL(blob);
  });
}
async function fileToBase64Payload(file, maxBytes = 700000) {
  if (/^image\/(jpeg|jpg|png|webp)$/i.test(file.type) && file.size <= maxBytes)
    return blobToBase64Payload(file, file.name);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.58, 0.88 - attempt * 0.08),
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
      canvas.width = 1;
      canvas.height = 1;
      if (blob && (blob.size <= maxBytes || attempt === 4))
        return blobToBase64Payload(blob, file.name);
      scale *= 0.82;
    }
  } catch (error) {
    throw new Error(`無法壓縮圖片 ${file.name}：${error?.message || error}`);
  } finally {
    bitmap?.close?.();
  }
  throw new Error(`圖片 ${file.name} 無法處理`);
}
async function extractWithGeminiVision(
  images,
  action = "vision",
  tokenInputId = "visionAccessToken",
) {
  const endpoints = [
      CONFIG.imageImport.visionEndpoint,
      CONFIG.googleSheets?.webAppUrl,
    ].filter((endpoint, index, all) => endpoint && all.indexOf(endpoint) === index),
    token = $(tokenInputId)?.value.trim() || $("visionAccessToken")?.value.trim();
  if (!endpoints.length) throw new Error("尚未設定 Gemini 辨識端點");
  if (!token) throw new Error("請先輸入 AI 辨識密碼");
  const imageFiles = images || [],
    maxImageBytes = Math.min(850000, Math.floor(3000000 / Math.max(1, imageFiles.length))),
    payloadImages = await Promise.all(
      imageFiles.map((file) => fileToBase64Payload(file, maxImageBytes)),
    ),
    requestBody = JSON.stringify({ action, token, images: payloadImages });
  const errors = [];
  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController(),
        timeout = setTimeout(() => controller.abort(), 55000);
      try {
        const response = await fetch(endpoint, {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: requestBody,
            signal: controller.signal,
          }),
          text = await response.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error(
            `辨識服務回傳非 JSON（HTTP ${response.status}）`,
          );
        }
        if (!response.ok || !payload.ok)
          throw new Error(
            payload.error || `Gemini 服務 HTTP ${response.status}`,
          );
        return {
          detectedRows: (payload.items || []).length,
          items: payload.items || [],
          provider:
            payload.provider ||
            (endpoint === CONFIG.googleSheets?.webAppUrl
              ? "gemini-apps-script"
              : "gemini-vercel"),
        };
      } catch (error) {
        const message =
          error?.name === "AbortError"
            ? "請求逾時"
            : String(error?.message || error);
        errors.push(
          `${endpoint === CONFIG.googleSheets?.webAppUrl ? "Apps Script" : "Vercel"}${attempt > 1 ? `重試${attempt}` : ""}：${message}`,
        );
        const retryable =
          error?.name === "AbortError" ||
          /load failed|failed to fetch|network|http 429|http 5\d\d/i.test(
            message,
          );
        if (!retryable) break;
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  throw new Error(errors.join("；").slice(0, 500));
}
window.geminiVisionExtractor = (images) => extractWithGeminiVision(images);
window.geminiRebalanceVisionExtractor = (images) =>
  extractWithGeminiVision(images, "rebalanceVision", "rebalanceVisionAccessToken");
function createImageDataProvider(fallbackExtractor) {
  const providers = window.BuyEngineV2,
    name = CONFIG.imageImport.provider;
  if (name === "OpenAIVisionProvider" && window.openAIVisionExtractor)
    return new providers.OpenAIVisionProvider(window.openAIVisionExtractor);
  if (name === "GeminiVisionProvider" && window.geminiVisionExtractor)
    return new providers.GeminiVisionProvider(window.geminiVisionExtractor);
  if (name === "ManualProvider") return new providers.ManualProvider();
  return new providers.OCRFallbackProvider(fallbackExtractor);
}
const ETF_NAME_BY_SYMBOL = Object.fromEntries(
  Object.entries(window.BuyEngineV2.ETF_MASTER).map(([symbol, item]) => [
    symbol,
    item.name,
  ]),
);
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );
const cleanOcrNumber = (value) => {
  const cleaned = String(value ?? "")
    .replace(/[OoＯ０]/g, "0")
    .replace(/[IlＩｌ]/g, "1")
    .replace(/[,，\s]/g, "")
    .replace(/[^−\-+\d.%]/g, "")
    .replace("−", "-");
  const parsed = Number.parseFloat(cleaned.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const cleanOcrSymbol = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[OoＯ０]/g, "0")
    .replace(/[IlＩｌ|]/g, "1")
    .replace(/[^0-9A-Z]/g, "");
function ocrEditDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = saved;
    }
  }
  return row[b.length];
}
function extractKnownOcrSymbol(value) {
  const cleaned = cleanOcrSymbol(value);
  const symbols = Object.keys(window.BuyEngineV2.ETF_MASTER).sort(
      (a, b) => b.length - a.length,
    ),
    exact = symbols.find((symbol) => cleaned.includes(symbol));
  if (exact) return exact;
  const missingSuffix = symbols.filter(
    (symbol) =>
      symbol.length === cleaned.length + 1 && symbol.startsWith(cleaned),
  );
  if (missingSuffix.length === 1) return missingSuffix[0];
  if (/^0\d{3,5}[A-Z]?$/.test(cleaned)) {
    const near = symbols.filter(
      (symbol) =>
        symbol.length === cleaned.length &&
        ocrEditDistance(symbol, cleaned) === 1,
    );
    if (near.length === 1) return near[0];
    return cleaned;
  }
  return "";
}
function flattenOcrWords(blocks) {
  const words = [];
  for (const block of blocks || [])
    for (const paragraph of block.paragraphs || [])
      for (const line of paragraph.lines || [])
        for (const word of line.words || [])
          if (word.text?.trim()) words.push(word);
  return words;
}
const OCR_NAME_ALIASES = {
  "00830": ["國泰費城", "費城半導體", "國泰費城半導體"],
  "0053": ["元大電子"],
};
function getOcrSymbolAnchors(normalized, imageWidth) {
  const anchors = normalized
      .map((word) => ({ ...word, symbol: extractKnownOcrSymbol(word.text) }))
      .filter((word) => word.symbol && word.cx < imageWidth * 0.36),
    leftLines = [];
  for (const word of normalized
    .filter((word) => word.cx < imageWidth * 0.36)
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx)) {
    let line = leftLines.find((item) => Math.abs(item.cy - word.cy) <= 24);
    if (!line) {
      line = { cy: word.cy, words: [] };
      leftLines.push(line);
    }
    line.words.push(word);
    line.cy =
      line.words.reduce((sum, item) => sum + item.cy, 0) / line.words.length;
  }
  const candidates = leftLines.flatMap((line, index) => {
    const text = [...line.words]
        .sort((a, b) => a.cx - b.cx)
        .map((word) => word.text)
        .join(""),
      items = [{ cy: line.cy, text }],
      next = leftLines[index + 1];
    if (next && next.cy - line.cy < 90)
      items.push({
        cy: (line.cy + next.cy) / 2,
        text: `${text}${[...next.words]
          .sort((a, b) => a.cx - b.cx)
          .map((word) => word.text)
          .join("")}`,
      });
    return items;
  });
  for (const [symbol, aliases] of Object.entries(OCR_NAME_ALIASES)) {
    const match = candidates.find((item) => {
      const text = item.text
        .replace(/\s/g, "")
        .replace(/[^\u3400-\u9fffA-Za-z0-9]/g, "");
      return aliases.some(
        (alias) =>
          text.includes(alias) || (alias.includes(text) && text.length >= 4),
      );
    });
    if (match && !anchors.some((word) => word.symbol === symbol))
      anchors.push({ ...match, symbol, cx: imageWidth * 0.16 });
  }
  return anchors;
}
function parseArkScreenshotWords(words, imageWidth) {
  const normalized = words.map((word) => ({
    ...word,
    text: String(word.text || "").trim(),
    cx: (word.bbox.x0 + word.bbox.x1) / 2,
    cy: (word.bbox.y0 + word.bbox.y1) / 2,
  }));
  const anchors = getOcrSymbolAnchors(normalized, imageWidth).sort(
    (a, b) => a.cy - b.cy,
  );
  return anchors
    .map((anchor, index) => {
      const top = index
        ? (anchors[index - 1].cy + anchor.cy) / 2
        : Math.max(
            0,
            anchor.cy -
              (anchors[index + 1] ? anchors[index + 1].cy - anchor.cy : 150) *
                0.62,
          );
      const bottom =
        index < anchors.length - 1
          ? (anchor.cy + anchors[index + 1].cy) / 2
          : anchor.cy +
            (index ? anchor.cy - anchors[index - 1].cy : 150) * 0.62;
      const row = normalized.filter(
        (word) => word.cy >= top && word.cy < bottom,
      );
      const left = row
        .filter((word) => word.cx < imageWidth * 0.34 && word !== anchor)
        .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
      const name = left
        .map((word) => word.text.replace(/[「」［］]/g, ""))
        .filter(
          (text) =>
            !/^價值$|^升溫$|^股票名稱$/.test(text) &&
            !/^0\d{3,5}[A-Z]?$/.test(cleanOcrSymbol(text)) &&
            /[㐀-鿿A-Za-z]/.test(text),
        )
        .join("")
        .replace(/價值|升溫/g, "");
      const columnNumbers = (min, max) =>
        row
          .filter(
            (word) => word.cx >= imageWidth * min && word.cx < imageWidth * max,
          )
          .map((word) => ({
            value: cleanOcrNumber(word.text),
            text: word.text,
            cy: word.cy,
          }))
          .filter((item) => item.value !== null)
          .sort((a, b) => a.cy - b.cy);
      const navColumn = columnNumbers(0.34, 0.58),
        shareColumn = columnNumbers(0.58, 0.8),
        capitalColumn = columnNumbers(0.8, 1.02);
      const premiumItem =
        navColumn.find((item) => item.text.includes("%")) ||
        navColumn.find((item, i) => i > 0 && Math.abs(item.value) <= 10);
      const symbol = anchor.symbol || cleanOcrSymbol(anchor.text);
      return {
        symbol,
        name: ETF_NAME_BY_SYMBOL[symbol] || name,
        nav: navColumn[0]?.value ?? null,
        premium: premiumItem?.value ?? null,
        arkShares: shareColumn[0]?.value ?? null,
        positionCapital: capitalColumn[0]?.value ?? null,
        riskShares: shareColumn[1]?.value ?? null,
        riskAmount: capitalColumn[1]?.value ?? null,
      };
    })
    .filter((row) => row.symbol);
}
function parseArkScreenshotGrid(words, imageWidth, imageHeight) {
  const normalized = words.map((word) => ({
    ...word,
    text: String(word.text || "").trim(),
    cx: (word.bbox.x0 + word.bbox.x1) / 2,
    cy: (word.bbox.y0 + word.bbox.y1) / 2,
  }));
  const symbolWords = getOcrSymbolAnchors(normalized, imageWidth);
  const navCandidates = normalized
      .filter(
        (word) =>
          word.cx >= imageWidth * 0.3 &&
          word.cx < imageWidth * 0.58 &&
          /[.,]\d/.test(word.text) &&
          !word.text.includes("%") &&
          cleanOcrNumber(word.text) >= 5 &&
          cleanOcrNumber(word.text) <= 1000,
      )
      .sort((a, b) => a.cy - b.cy),
    navWords = navCandidates.filter(
      (word, index) =>
        !index || Math.abs(word.cy - navCandidates[index - 1].cy) > 18,
    );
  const percentWords = normalized.filter(
    (word) =>
      word.cx >= imageWidth * 0.28 &&
      word.cx < imageWidth * 0.6 &&
      word.text.includes("%") &&
      Math.abs(cleanOcrNumber(word.text)) <= 10,
  );
  const nearest = (items, y, tolerance) =>
    items
      .filter((item) => Math.abs(item.cy - y) <= tolerance)
      .sort((a, b) => Math.abs(a.cy - y) - Math.abs(b.cy - y))[0];
  return navWords
    .map((navWord, index) => {
      const previous = navWords[index - 1],
        next = navWords[index + 1],
        spacing = Math.min(
          next ? next.cy - navWord.cy : Infinity,
          previous ? navWord.cy - previous.cy : Infinity,
        ),
        rowSpacing = Number.isFinite(spacing)
          ? spacing
          : Math.max(210, imageHeight * 0.18),
        premiumWord = percentWords
          .filter(
            (word) =>
              word.cy > navWord.cy &&
              word.cy - navWord.cy < Math.min(190, rowSpacing * 0.48),
          )
          .sort((a, b) => a.cy - b.cy)[0];
      if (!premiumWord) return null;
      const symbolWord = nearest(
        symbolWords,
        premiumWord.cy,
        Math.min(170, rowSpacing * 0.48),
      );
      if (!symbolWord) return null;
      const shareWords = normalized.filter(
          (word) =>
            word.cx >= imageWidth * 0.58 &&
            word.cx < imageWidth * 0.8 &&
            cleanOcrNumber(word.text) !== null,
        ),
        capitalWords = normalized.filter(
          (word) =>
            word.cx >= imageWidth * 0.8 &&
            word.cx <= imageWidth * 1.02 &&
            cleanOcrNumber(word.text) !== null,
        ),
        lineTolerance = Math.max(38, Math.min(70, rowSpacing * 0.22));
      const positionShare = nearest(shareWords, navWord.cy, lineTolerance),
        positionAmount = nearest(capitalWords, navWord.cy, lineTolerance),
        riskShare = nearest(shareWords, premiumWord.cy, lineTolerance),
        riskAmount = nearest(capitalWords, premiumWord.cy, lineTolerance);
      const bothPositionMissing =
        !positionShare && !positionAmount && riskShare && riskAmount;
      return {
        symbol: symbolWord.symbol,
        name: ETF_NAME_BY_SYMBOL[symbolWord.symbol] || "",
        nav: cleanOcrNumber(navWord.text),
        premium: cleanOcrNumber(premiumWord.text),
        arkShares: bothPositionMissing
          ? 0
          : positionShare
            ? cleanOcrNumber(positionShare.text)
            : null,
        positionCapital: bothPositionMissing
          ? 0
          : positionAmount
            ? cleanOcrNumber(positionAmount.text)
            : null,
        riskShares: riskShare ? cleanOcrNumber(riskShare.text) : null,
        riskAmount: riskAmount ? cleanOcrNumber(riskAmount.text) : null,
        _navCy: navWord.cy,
        _rowSpacing: rowSpacing,
      };
    })
    .filter(Boolean);
}
function parseArkScreenshotText(text) {
  const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    rows = [];
  lines.forEach((line, index) => {
    const symbolMatch = line.match(/\b0\d{3,5}[A-Z]?\b/i);
    if (!symbolMatch) return;
    const symbol = cleanOcrSymbol(symbolMatch[0]);
    let values = null;
    for (let offset = 1; offset <= 4 && !values; offset++) {
      const candidate = lines[index - offset] || "";
      if (/\b0\d{3,5}[A-Z]?\b/i.test(candidate)) break;
      const numbers = [...candidate.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) =>
        cleanOcrNumber(match[0]),
      );
      if (numbers.length >= 3) values = numbers.slice(-3);
    }
    const premiumMatch = line.match(/[-+−]?\d+(?:\.\d+)?\s*%/);
    rows.push({
      symbol,
      name: ETF_NAME_BY_SYMBOL[symbol] || "",
      nav: values?.[0] ?? null,
      arkShares: values?.[1] ?? null,
      positionCapital: values?.[2] ?? null,
      premium: premiumMatch ? cleanOcrNumber(premiumMatch[0]) : null,
    });
  });
  return rows;
}
function parseArkSequentialText(text, anchorRows) {
  const candidates = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.includes("%") &&
        !line.includes(":") &&
        !/4G|6,?532|股票名稱|布局金額/.test(line),
    )
    .map((line) =>
      [...line.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) =>
        cleanOcrNumber(match[0]),
      ),
    )
    .filter((numbers) => numbers.length >= 2);
  const premiums = [...String(text || "").matchAll(/[-+−]?\d+(?:\.\d+)?\s*%/g)]
    .map((match) => cleanOcrNumber(match[0]))
    .filter((value) => Math.abs(value) <= 5);
  return anchorRows.map((row, index) => {
    const numbers = candidates[index] || [];
    const premium = row.premium ?? premiums[index] ?? null;
    if (numbers.length >= 3) {
      const [nav, arkShares, positionCapital] = numbers.slice(-3);
      return { ...row, nav, arkShares, positionCapital, premium };
    }
    if (numbers.length === 2) {
      const [nav, positionCapital] = numbers;
      return { ...row, nav, positionCapital, premium };
    }
    return { ...row, premium };
  });
}
function recoverPremiumsByPosition(words, imageWidth, rows) {
  if (rows.length < 2) return rows;
  const expectedIndex = new Map(rows.map((row, index) => [row.symbol, index]));
  const normalized = words.map((word) => ({
    ...word,
    text: String(word.text || "").trim(),
    cx: (word.bbox.x0 + word.bbox.x1) / 2,
    cy: (word.bbox.y0 + word.bbox.y1) / 2,
  }));
  const anchors = normalized
    .map((word) => ({ symbol: cleanOcrSymbol(word.text), cy: word.cy }))
    .filter((item) => expectedIndex.has(item.symbol))
    .map((item) => ({ ...item, index: expectedIndex.get(item.symbol) }))
    .sort((a, b) => a.index - b.index);
  if (anchors.length < 2) return rows;
  const slopes = [];
  for (let i = 1; i < anchors.length; i++) {
    const deltaIndex = anchors[i].index - anchors[i - 1].index;
    if (deltaIndex > 0)
      slopes.push((anchors[i].cy - anchors[i - 1].cy) / deltaIndex);
  }
  const spacing = slopes.sort((a, b) => a - b)[Math.floor(slopes.length / 2)];
  if (!Number.isFinite(spacing) || spacing <= 0) return rows;
  const offset =
    anchors.reduce((sum, item) => sum + (item.cy - spacing * item.index), 0) /
    anchors.length;
  const premiumWords = normalized
    .map((word) => ({
      value: word.text.includes("%") ? cleanOcrNumber(word.text) : null,
      cy: word.cy,
      cx: word.cx,
    }))
    .filter(
      (item) =>
        item.value !== null &&
        Math.abs(item.value) <= 5 &&
        item.cx >= imageWidth * 0.28 &&
        item.cx < imageWidth * 0.62,
    );
  return rows.map((row, index) => {
    const expectedY = offset + spacing * index;
    const match = premiumWords
      .filter((item) => Math.abs(item.cy - expectedY) < spacing * 0.32)
      .sort(
        (a, b) => Math.abs(a.cy - expectedY) - Math.abs(b.cy - expectedY),
      )[0];
    return match ? { ...row, premium: match.value } : row;
  });
}
function mergeOcrRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.symbol) continue;
    const old = map.get(row.symbol) || {};
    map.set(row.symbol, {
      ...old,
      ...Object.fromEntries(
        Object.entries(row).filter(
          ([, v]) => v !== null && v !== "" && v !== undefined,
        ),
      ),
    });
  }
  return [...map.values()].map((row) => {
    let nav = row.nav === null || row.nav === undefined ? NaN : Number(row.nav),
      shares =
        row.arkShares === null || row.arkShares === undefined
          ? NaN
          : Number(row.arkShares),
      capital =
        row.positionCapital === null || row.positionCapital === undefined
          ? NaN
          : Number(row.positionCapital);
    if (nav >= 1000) nav = nav / 100;
    if (!Number.isFinite(nav) || nav < 5 || nav > 1000) nav = null;
    if (!Number.isInteger(shares) || shares < 0 || shares > 20) shares = null;
    if (Number.isFinite(nav) && Number.isFinite(capital) && capital >= 0) {
      const inferred = Math.round(capital / nav),
        inferredDifference = Math.abs(nav * inferred - capital),
        ocrDifference = Number.isFinite(shares)
          ? Math.abs(nav * shares - capital)
          : Infinity,
        strictTolerance = Math.max(2, nav * 0.08),
        conflictTolerance = Math.max(2, nav + 2);
      if (
        inferred >= 0 &&
        inferred <= 20 &&
        inferredDifference <= strictTolerance &&
        (shares === null || ocrDifference > conflictTolerance)
      ) {
        shares = inferred;
        if (inferred === 0) capital = 0;
      }
    }
    if (shares === 0 && !Number.isFinite(capital)) capital = 0;
    if (!Number.isFinite(capital) || capital < 0 || capital > 20000)
      capital = null;
    let riskShares = finiteOrNull(row.riskShares),
      riskAmount = finiteOrNull(row.riskAmount);
    if (
      Number.isFinite(nav) &&
      Number.isInteger(riskShares) &&
      riskShares > 0 &&
      riskAmount !== null &&
      riskShares * nav < riskAmount * 0.5
    ) {
      const expectedDigits = String(
          Math.max(1, Math.round(riskAmount / nav)),
        ).length,
        lastDigit = riskShares % 10;
      let repeated = riskShares;
      while (String(repeated).length < expectedDigits)
        repeated = repeated * 10 + lastDigit;
      const tolerance = Math.max(nav + 2, nav * 1.25, riskAmount * 0.015);
      if (Math.abs(nav * repeated - riskAmount) <= tolerance)
        riskShares = repeated;
    }
    if (
      Number.isFinite(nav) &&
      Number.isInteger(riskShares) &&
      riskShares % 10 === 5 &&
      riskAmount !== null
    ) {
      const alternate = riskShares - 2,
        currentDiff = Math.abs(nav * riskShares - riskAmount),
        alternateDiff = Math.abs(nav * alternate - riskAmount);
      if (alternateDiff + nav * 0.5 < currentDiff) riskShares = alternate;
    }
    return {
      ...row,
      name: ETF_NAME_BY_SYMBOL[row.symbol] || row.name,
      nav: Number.isFinite(nav) ? round(nav, 2) : null,
      premium: finiteOrNull(row.premium),
      arkShares: Number.isFinite(shares) ? shares : null,
      positionCapital: Number.isFinite(capital) ? capital : null,
      riskShares,
      riskAmount,
    };
  });
}
function finiteOrNull(value) {
  return value !== null && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}
const isMobileOcrDevice = () =>
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  matchMedia("(pointer: coarse)").matches;
async function prepareOcrImage(file) {
  const bitmap = await createImageBitmap(file),
    maxWidth = 1800,
    maxPixels = 7000000,
    scale = Math.min(
      2,
      maxWidth / bitmap.width,
      Math.sqrt(maxPixels / (bitmap.width * bitmap.height)),
    ),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { image: canvas, width: canvas.width, height: canvas.height };
}
function prepareMobileNumericCrop(prepared) {
  const x = Math.round(prepared.width * 0.28),
    canvas = document.createElement("canvas");
  canvas.width = prepared.width - x;
  canvas.height = prepared.height;
  canvas
    .getContext("2d")
    .drawImage(
      prepared.image,
      x,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return { image: canvas, x };
}
function offsetOcrWords(words, xOffset) {
  return words.map((word) => ({
    ...word,
    bbox: {
      ...word.bbox,
      x0: word.bbox.x0 + xOffset,
      x1: word.bbox.x1 + xOffset,
    },
  }));
}
async function recognizeOcrColumn(worker, prepared, minX, maxX, whitelist) {
  const x = Math.round(prepared.width * minX),
    width = Math.round(prepared.width * maxX) - x,
    canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = prepared.height;
  canvas
    .getContext("2d")
    .drawImage(
      prepared.image,
      x,
      0,
      width,
      prepared.height,
      0,
      0,
      width,
      prepared.height,
    );
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: whitelist,
  });
  try {
    const result = await worker.recognize(
      canvas,
      {},
      { text: false, blocks: true },
    );
    return offsetOcrWords(flattenOcrWords(result.data.blocks), x);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
async function recognizeOcrCell(
  worker,
  prepared,
  minX,
  maxX,
  centerY,
  halfHeight = 60,
) {
  const x = Math.round(prepared.width * minX),
    y = Math.max(0, Math.round(centerY - halfHeight)),
    width = Math.round(prepared.width * maxX) - x,
    height = Math.min(prepared.height - y, Math.round(halfHeight * 2)),
    canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(
    prepared.image,
    x,
    y,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "0123456789,",
  });
  try {
    const result = await worker.recognize(
        canvas,
        {},
        { text: true, blocks: false },
      ),
      matches = String(result.data.text || "").match(/[\d,]+/g) || [];
    return matches.length
      ? cleanOcrNumber(matches.sort((a, b) => b.length - a.length)[0])
      : null;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
async function recognizeOcrSymbolCell(worker, prepared, centerY, halfHeight) {
  const width = Math.round(prepared.width * 0.36),
    y = Math.max(0, Math.round(centerY - halfHeight)),
    height = Math.min(prepared.height - y, Math.round(halfHeight * 2)),
    canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(
    prepared.image,
    0,
    y,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZL",
  });
  try {
    const result = await worker.recognize(
        canvas,
        {},
        { text: true, blocks: false },
      ),
      lines = String(result.data.text || "")
        .split(/\s+/)
        .filter(Boolean);
    for (const line of lines) {
      const symbol = extractKnownOcrSymbol(line);
      if (symbol) return symbol;
    }
    return extractKnownOcrSymbol(result.data.text);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
async function recoverMissingGridRows(worker, prepared, words, rows) {
  const normalized = words.map((word) => ({
      ...word,
      text: String(word.text || "").trim(),
      cx: (word.bbox.x0 + word.bbox.x1) / 2,
      cy: (word.bbox.y0 + word.bbox.y1) / 2,
    })),
    navCandidates = normalized
      .filter(
        (word) =>
          word.cx >= prepared.width * 0.3 &&
          word.cx < prepared.width * 0.58 &&
          /[.,]\d/.test(word.text) &&
          !word.text.includes("%") &&
          cleanOcrNumber(word.text) >= 5 &&
          cleanOcrNumber(word.text) <= 1000,
      )
      .sort((a, b) => a.cy - b.cy),
    navWords = navCandidates.filter(
      (word, index) =>
        !index || Math.abs(word.cy - navCandidates[index - 1].cy) > 18,
    ),
    percentWords = normalized.filter(
      (word) =>
        word.cx >= prepared.width * 0.28 &&
        word.cx < prepared.width * 0.6 &&
        word.text.includes("%") &&
        Math.abs(cleanOcrNumber(word.text)) <= 10,
    ),
    spacings = navWords
      .slice(1)
      .map((word, index) => word.cy - navWords[index].cy)
      .filter((value) => value > 50 && value < 400)
      .sort((a, b) => a - b),
    rowSpacing =
      spacings[Math.floor(spacings.length / 2)] || prepared.height * 0.085;
  const recovered = [];
  for (const navWord of navWords) {
    if (
      rows.some(
        (row) =>
          Number.isFinite(row._navCy) &&
          Math.abs(row._navCy - navWord.cy) < rowSpacing * 0.28,
      )
    )
      continue;
    const premiumWord = percentWords
      .filter(
        (word) =>
          word.cy > navWord.cy && word.cy - navWord.cy < rowSpacing * 0.48,
      )
      .sort((a, b) => a.cy - b.cy)[0];
    if (!premiumWord) continue;
    const halfHeight = Math.max(70, Math.min(150, rowSpacing * 0.48)),
      symbol = await recognizeOcrSymbolCell(
        worker,
        prepared,
        (navWord.cy + premiumWord.cy) / 2,
        halfHeight,
      );
    if (!symbol) continue;
    const cellHalf = Math.max(42, Math.min(72, rowSpacing * 0.22)),
      arkShares = await recognizeOcrCell(
        worker,
        prepared,
        0.58,
        0.8,
        navWord.cy,
        cellHalf,
      ),
      positionCapital = await recognizeOcrCell(
        worker,
        prepared,
        0.8,
        1,
        navWord.cy,
        cellHalf,
      ),
      riskShares = await recognizeOcrCell(
        worker,
        prepared,
        0.58,
        0.8,
        premiumWord.cy,
        cellHalf,
      ),
      riskAmount = await recognizeOcrCell(
        worker,
        prepared,
        0.8,
        1,
        premiumWord.cy,
        cellHalf,
      );
    recovered.push({
      symbol,
      name: ETF_NAME_BY_SYMBOL[symbol] || "",
      nav: cleanOcrNumber(navWord.text),
      premium: cleanOcrNumber(premiumWord.text),
      arkShares,
      positionCapital,
      riskShares,
      riskAmount,
      _navCy: navWord.cy,
      _rowSpacing: rowSpacing,
    });
  }
  return [...rows, ...recovered];
}
async function repairEssentialOcrCells(worker, prepared, rows) {
  for (const row of rows) {
    if (!Number.isFinite(row._navCy)) continue;
    const halfHeight = Math.max(
      42,
      Math.min(72, (row._rowSpacing || 240) * 0.22),
    );
    if (row.arkShares === null)
      row.arkShares = await recognizeOcrCell(
        worker,
        prepared,
        0.58,
        0.8,
        row._navCy,
        halfHeight,
      );
    if (row.positionCapital === null)
      row.positionCapital = await recognizeOcrCell(
        worker,
        prepared,
        0.8,
        1,
        row._navCy,
        halfHeight,
      );
    if (row.arkShares === null && row.positionCapital === null) {
      row.arkShares = 0;
      row.positionCapital = 0;
    }
    if (row.arkShares === 0 && row.positionCapital === null)
      row.positionCapital = 0;
    if (row.positionCapital === 0 && row.arkShares === null) row.arkShares = 0;
  }
  return rows;
}
function renderOcrReview() {
  const validation = window.BuyEngineV2.validateArkImageData({
    items: ocrRows,
  });
  $("ocrReview").hidden = !ocrRows.length;
  $("ocrValidationSummary").textContent =
    `Detected ETFs: ${validation.detectedRows} · Validated: ${validation.validated} · Warnings: ${validation.warnings} · Errors: ${validation.errors}${validation.incomplete ? " · POSSIBLE INCOMPLETE LIST" : ""}`;
  $("ocrReviewGrid").innerHTML = validation.items
    .map(
      (row, index) =>
        `<article class="ocr-result-card validation-${row.validation.status.toLowerCase()}"><div class="ocr-row-status"><strong>${escapeHtml(row.name || ETF_NAME_BY_SYMBOL[row.symbol] || "ETF")} · ${escapeHtml(row.symbol || `第 ${index + 1} 檔`)}</strong><span class="badge ${row.validation.status === "ERROR" ? "sell" : row.validation.status === "WARNING" ? "warning" : "buy"}">${row.validation.status}</span></div><p class="rebalance-ocr-warning">${escapeHtml([...row.validation.errors, ...row.validation.warnings].join("；") || "必要欄位檢查通過")}</p><div class="ocr-fields ocr-fields-essential"><label>股票代碼<input data-ocr-index="${index}" data-ocr-field="symbol" value="${escapeHtml(row.symbol)}"></label><label>折溢價 %<input type="number" step="0.01" data-ocr-index="${index}" data-ocr-field="premium" value="${row.premiumPercent ?? ""}"></label><label>位階股數（黃字）<input type="number" min="0" step="1" data-ocr-index="${index}" data-ocr-field="arkShares" value="${row.positionShares ?? ""}"></label><label>位階布局金額（黃字）<input type="number" min="0" step="1" data-ocr-index="${index}" data-ocr-field="positionCapital" value="${row.positionAmount ?? ""}"></label></div></article>`,
    )
    .join("");
}
function renderImageReview() {
  return renderOcrReview();
}
function resetOcrImport(statusText = "尚未選擇圖片") {
  ocrObjectUrls.forEach(URL.revokeObjectURL);
  ocrObjectUrls = [];
  ocrFiles = [];
  ocrRows = [];
  $("ocrImages").value = "";
  $("ocrImagePreview").innerHTML = "";
  $("ocrReview").hidden = true;
  $("ocrProgress").hidden = true;
  $("clearOcrBtn").hidden = true;
  $("runOcrBtn").disabled = true;
  $("ocrStatus").textContent = statusText;
}
async function recognizeArkScreenshots() {
  if (location.protocol === "file:") {
    $("ocrStatus").textContent =
      "OCR 無法在直接開啟的 file:// 網頁運作。請關閉本頁，改為雙擊「啟動網站.cmd」。";
    return;
  }
  if (!ocrFiles.length) {
    $("ocrStatus").textContent =
      "請先選擇要辨識的截圖。";
    return;
  }
  $("runOcrBtn").disabled = true;
  $("ocrProgress").hidden = false;
  $("ocrProgressBar").style.width = "2%";
  $("ocrStatus").textContent = "正在載入本機辨識模型…";
  let worker,
    visionFailure = "";
  try {
    const configuredVision =
      (CONFIG.imageImport.provider === "OpenAIVisionProvider" &&
        window.openAIVisionExtractor) ||
      (CONFIG.imageImport.provider === "GeminiVisionProvider" &&
        window.geminiVisionExtractor);
    if (configuredVision) {
      try {
        $("ocrStatus").textContent = "正在使用 Gemini AI 分析整張表格…";
        const extraction = await window.BuyEngineV2.extractArkImageData(
          createImageDataProvider(),
          ocrFiles,
        );
        ocrRows = (extraction.items || []).map((row) => ({
          ...row,
          premium: row.premiumPercent,
          arkShares: row.positionShares,
          positionCapital: row.positionAmount,
        }));
        renderImageReview();
        $("ocrProgressBar").style.width = "100%";
        $("ocrStatus").textContent =
          `Gemini AI 已辨識 ${ocrRows.length} 檔 ETF，請核對後套用。`;
        return;
      } catch (visionError) {
        console.warn("Gemini Vision fallback", visionError);
        visionFailure = String(visionError?.message || visionError);
        $("ocrStatus").textContent =
          `Gemini 暫時無法使用（${visionFailure.slice(0, 120)}），正在改用本機 OCR…`;
      }
    }
    if (!window.Tesseract)
      throw new Error("本機 OCR 引擎未成功載入");
    const mobile = isMobileOcrDevice(),
      languages = ["chi_tra", "eng"];
    worker = await Tesseract.createWorker(languages, Tesseract.OEM.LSTM_ONLY, {
      workerPath: "vendor/tesseract/worker.min.js",
      langPath: "vendor/tesseract/lang",
      corePath: "vendor/tesseract",
      logger: (message) => {
        if (message.progress !== undefined) {
          const progress = Math.round(message.progress * 0.75 * 100);
          $("ocrProgressBar").style.width = `${Math.max(2, progress)}%`;
          $("ocrStatus").textContent =
            `${message.status === "recognizing text" ? "辨識文字" : "準備模型"}… ${Math.round(message.progress * 100)}%`;
        }
      },
    });
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: "",
    });
    const found = [],
      imageExtractions = [],
      imageResults = [],
      failures = [];
    for (let i = 0; i < ocrFiles.length; i++) {
      $("ocrStatus").textContent =
        `正在辨識第 ${i + 1} / ${ocrFiles.length} 張…`;
      let prepared, numericCrop;
      try {
        prepared = await prepareOcrImage(ocrFiles[i]);
        numericCrop = null;
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.AUTO,
          preserve_interword_spaces: "1",
          tessedit_char_whitelist: "",
        });
        const result = await worker.recognize(
            numericCrop?.image || prepared.image,
            {},
            { text: true, blocks: true },
          ),
          rawWords = flattenOcrWords(result.data.blocks),
          baseWords = numericCrop
            ? offsetOcrWords(rawWords, numericCrop.x)
            : rawWords;
        const leftWords = await recognizeOcrColumn(
            worker,
            prepared,
            0,
            0.34,
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZL",
          ),
          middleWords = await recognizeOcrColumn(
            worker,
            prepared,
            0.28,
            0.6,
            "0123456789.,+-%",
          ),
          rightWords = await recognizeOcrColumn(
            worker,
            prepared,
            0.55,
            1,
            "0123456789,.",
          ),
          allWords = [
            ...baseWords,
            ...leftWords,
            ...middleWords,
            ...rightWords,
          ];
        let gridRows = parseArkScreenshotGrid(
          allWords,
          prepared.width,
          prepared.height,
        );
        gridRows = await recoverMissingGridRows(
          worker,
          prepared,
          allWords,
          gridRows,
        );
        const detectedRows = parseArkScreenshotWords(allWords, prepared.width),
          wordRows = recoverPremiumsByPosition(
            allWords,
            prepared.width,
            detectedRows,
          ),
          fallbackRows = [
            ...wordRows,
            ...parseArkScreenshotText(result.data.text),
          ];
        if (gridRows.length)
          await repairEssentialOcrCells(worker, prepared, gridRows);
        const rows = gridRows.length ? gridRows : fallbackRows;
        const mergedImage = mergeOcrRows(rows);
        found.push(...mergedImage);
        imageExtractions.push({
          items: mergedImage.map((row) => ({
            ...row,
            premiumPercent: row.premium,
            positionShares: row.arkShares,
            positionAmount: row.positionCapital,
          })),
        });
        imageResults.push(mergedImage.length);
      } catch (imageError) {
        console.error(imageError);
        failures.push(i + 1);
        imageResults.push(0);
      } finally {
        if (numericCrop?.image) {
          numericCrop.image.width = 1;
          numericCrop.image.height = 1;
        }
        if (prepared?.image) {
          prepared.image.width = 1;
          prepared.image.height = 1;
        }
      }
    }
    if (!found.length)
      throw new Error("兩張圖片都無法完成辨識，請重新整理頁面後再試。");
    const provider = createImageDataProvider(async () =>
        window.BuyEngineV2.mergeImageExtractions(imageExtractions),
      ),
      extraction = await window.BuyEngineV2.extractArkImageData(
        provider,
        ocrFiles,
      );
    ocrRows = extraction.items.map((row) => ({
      ...row,
      premium: row.premiumPercent,
      arkShares: row.positionShares,
      positionCapital: row.positionAmount,
    }));
    renderImageReview();
    $("ocrProgressBar").style.width = "100%";
    const detail = imageResults
        .map((count, index) => `第${index + 1}張 ${count} 檔`)
        .join("、"),
      retry = failures.length
        ? `；第 ${failures.join("、")} 張未完成，可重新選圖再試。`
        : "";
    $("ocrStatus").textContent = ocrRows.length
      ? `已辨識 ${ocrRows.length} 檔 ETF（${detail}），請核對後套用${retry}`
      : "未找到 ETF 代號，請改用清晰、未裁掉代號的截圖。";
  } catch (error) {
    console.error(error);
    const message = String(error?.message || error || ""),
      geminiDetail = visionFailure
        ? `Gemini：${visionFailure.slice(0, 180)}；`
        : "",
      hint = /worker|fetch|network|load/i.test(message)
        ? "本機 OCR 模型也載入失敗，請檢查網路後重試。"
        : "請重新選擇清晰截圖。";
    $("ocrStatus").textContent =
      `辨識失敗。${geminiDetail}${hint}${message ? `（本機 OCR：${message.slice(0, 120)}）` : ""}`;
  } finally {
    if (worker) await worker.terminate();
    $("runOcrBtn").disabled = !ocrFiles.length;
  }
}
async function saveEtfListToGoogleSheet() {
  const endpoint = CONFIG.googleSheets?.webAppUrl,
    token = $("visionAccessToken")?.value.trim(),
    plan = window.currentDecision?._v2Plan;
  if (!endpoint) throw new Error("尚未設定 Google Sheet Apps Script 網址");
  if (!token) throw new Error("請先輸入 AI 辨識密碼");
  const orderBySymbol = new Map((plan?.orders || []).map((item) => [item.symbol, item])),
    items = (window.currentETFs || []).map((etf, index) => {
      const order = orderBySymbol.get(etf.symbol) || etf,
        recommendation = calculateEtfRecommendedMultiplier(order, plan),
        multiplier = recommendation.multiplier,
        positionShares = finiteOrNull(etf.arkShares ?? etf.positionShares),
        positionAmount = finiteOrNull(etf.positionCapital ?? etf.positionAmount);
      return {
        rank: index + 1,
        symbol: etf.symbol,
        name: etf.name || ETF_NAME_BY_SYMBOL[etf.symbol] || "",
        price: finiteOrNull(etf.nav),
        premiumPercent: finiteOrNull(etf.premium),
        positionShares,
        positionAmount,
        multiplier,
        actualShares: positionShares === null ? null : round(positionShares * multiplier, 2),
        actualAmount: positionAmount === null ? null : Math.round(positionAmount * multiplier),
      };
    }),
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "saveEtfList",
        token,
        date: $("decisionDate").value,
        items,
      }),
    });
  if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "Google Sheet 儲存失敗");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || "")) ||
    !Number.isFinite(Number(payload.savedCount))
  )
    throw new Error("Apps Script 尚未部署 ETF 清單儲存功能，請更新既有部署版本");
  return payload;
}

let strengthUniverse = [], strengthBenchmarkReturn = null;
function normalizeEtfUniverseSymbol(value) {
  let symbol = String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (/^\d+$/.test(symbol) && !symbol.startsWith("0")) {
    const width = symbol.length <= 2 ? 4 : symbol.length === 3 ? 5 : 6;
    symbol = symbol.padStart(width, "0");
  }
  return /^\d{4,6}[A-Z]?$/.test(symbol) ? symbol : "";
}
async function postGoogleSheetAction(action, extra = {}) {
  const endpoint = CONFIG.googleSheets?.webAppUrl,
    token =
      $("strengthAccessToken")?.value.trim() ||
      $("visionAccessToken")?.value.trim();
  if (!endpoint) throw new Error("尚未設定 Google Sheet Apps Script 網址");
  if (!token) throw new Error("請先輸入同步密碼");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token, ...extra }),
  });
  if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "Google Sheet 操作失敗");
  return payload;
}
function calculateRsRatio(etfReturn, benchmarkReturn) {
  if (
    etfReturn === null ||
    etfReturn === "" ||
    etfReturn === undefined ||
    benchmarkReturn === null ||
    benchmarkReturn === "" ||
    benchmarkReturn === undefined
  )
    return null;
  const etf = Number(etfReturn), benchmark = Number(benchmarkReturn);
  if (!Number.isFinite(etf) || !Number.isFinite(benchmark) || benchmark <= -100)
    return null;
  return round(((1 + etf / 100) / (1 + benchmark / 100)) * 100, 2);
}
function calculateLeverageAdjustedReturn(value, leverage = 1) {
  const result = finiteOrNull(value), multiple = Math.max(1, Number(leverage) || 1);
  if (result === null || result <= -100) return null;
  return round((Math.pow(1 + result / 100, 1 / multiple) - 1) * 100, 4);
}
function classifyRs20Trend(values = {}) {
  const current = finiteOrNull(values[0]), d3 = finiteOrNull(values[3]),
    d5 = finiteOrNull(values[5]), d10 = finiteOrNull(values[10]),
    available = [current, d3, d5, d10, finiteOrNull(values[20])].filter(value => value !== null);
  if (current === null || available.length < 4)
    return { key: "INSUFFICIENT", label: "資料不足", detail: "尚無完整 RS20 軌跡", highest: null, gap: null };
  const highest = Math.max(...available), gap = round(highest - current, 2);
  if (current < 100)
    return { key: "ROTATE", label: "轉換標的", detail: `RS20 已低於 100；距觀察期高點 ${gap.toFixed(2)}`, highest, gap };
  if (current < d3 && d3 < d5 && d5 < d10)
    return { key: "REDUCE", label: "分批調節", detail: `持續下降；最高 ${highest.toFixed(2)}，目前低 ${gap.toFixed(2)}`, highest, gap };
  if (current < d3 && d3 > d5)
    return { key: "WATCH", label: "觀察", detail: `由上升轉為下降；距高點 ${gap.toFixed(2)}`, highest, gap };
  if (current > d3 && d3 > d5)
    return { key: "STRONG", label: "持續轉強", detail: "短中期 RS20 同步上升", highest, gap };
  return { key: "NEUTRAL", label: "震盪", detail: `方向尚未連續；距高點 ${gap.toFixed(2)}`, highest, gap };
}
async function fetchTwentyDayReturns(symbols) {
  const unique = [...new Set(["0050", ...symbols])], results = [];
  for (let index = 0; index < unique.length; index += 35) {
    const batch = unique.slice(index, index + 35),
      params = new URLSearchParams({ symbols: batch.join(",") }),
      endpoint = `${CONFIG.performanceEndpoint}?${params}`,
      response = await fetch(endpoint);
    if (!response.ok) throw new Error(`行情服務 HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "行情服務讀取失敗");
    results.push(...(payload.items || []));
  }
  return results;
}
function renderStrengthTable(items = strengthUniverse) {
  const valid = items.filter(item => Number.isFinite(item.rsRatio)),
    stronger = valid.filter(item => item.rsRatio > 100).length,
    weaker = valid.filter(item => item.rsRatio < 100).length,
    benchmarkReturn = Number(strengthBenchmarkReturn);
  $("strengthCount").textContent = `${items.length} 檔`;
  $("strengthSummary").innerHTML = items.length
    ? `<div><span>跑贏 0050</span><strong class="positive">${stronger} 檔</strong></div><div><span>落後 0050</span><strong class="negative">${weaker} 檔</strong></div><div><span>0050 20日報酬</span><strong>${Number.isFinite(benchmarkReturn) ? `${benchmarkReturn >= 0 ? "+" : ""}${benchmarkReturn.toFixed(2)}%` : "—"}</strong></div>`
    : "";
  $("strengthTable").innerHTML = items.length
    ? `<div class="strength-row strength-head"><span>排名／ETF</span><span>RS20 軌跡（現／3／5／10／20日前）</span><span>20日報酬</span><span>趨勢評級</span><span></span></div>${items.map((item, index) => {
        const formatReturn = value => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "—",
          rsTrack = [0, 3, 5, 10, 20].map(offset => Number.isFinite(item.rsTimeline?.[offset]) ? item.rsTimeline[offset].toFixed(2) : "—").join("／"),
          leveragedNote = item.leverage > 1 ? `<small>已做 ${item.leverage}x 槓桿校正</small>` : "";
        return `<div class="strength-row"><span><b>${index + 1}</b><strong>${escapeHtml(item.name || ETF_NAME_BY_SYMBOL[item.symbol] || "ETF")}</strong><small>${escapeHtml(item.symbol)}${item.leverage > 1 ? ` · ${item.leverage}x` : ""}</small></span><span class="rs-track"><strong>${rsTrack}</strong>${leveragedNote}</span><span class="strength-return"><strong class="${Number(item.return20D) >= 0 ? "positive" : "negative"}">${formatReturn(item.return20D)}</strong>${item.error ? `<small title="${escapeHtml(item.error)}">查無行情</small>` : ""}</span><span class="strength-rating rating-${item.rating.key.toLowerCase()}"><strong>${escapeHtml(item.rating.label)}</strong><small>${escapeHtml(item.rating.detail)}</small></span><button type="button" class="remove-strength" data-strength-remove="${escapeHtml(item.symbol)}" aria-label="刪除 ${escapeHtml(item.symbol)}">×</button></div>`;
      }).join("")}`
    : `<p class="note">目前沒有 ETF，請先同步或手動新增。</p>`;
}
async function refreshStrengthUniverse({ quiet = false } = {}) {
  const button = $("strengthRefreshBtn");
  button.disabled = true;
  if (!quiet) $("strengthStatus").textContent = "正在從 Google Sheet 整理不重複 ETF…";
  try {
    const payload = await postGoogleSheetAction("getEtfUniverse"),
      universeMap = new Map();
    (payload.items || []).forEach(item => {
      const symbol = normalizeEtfUniverseSymbol(item.symbol);
      if (!symbol) return;
      const old = universeMap.get(symbol);
      universeMap.set(symbol, {
        ...old,
        ...item,
        symbol,
        name: item.name || old?.name || "",
      });
    });
    const universe = [...universeMap.values()];
    $("strengthStatus").textContent = `已從 ${payload.sheet || "Google Sheet"} 載入 ${universe.length} 檔，正在計算最近 20 個交易日…`;
    const returns = await fetchTwentyDayReturns(universe.map(item => item.symbol)),
      bySymbol = new Map(returns.map(item => [item.symbol, item])),
      benchmark = bySymbol.get("0050") || {},
      benchmarkReturn = finiteOrNull(benchmark.return20D),
      benchmarkOffsets = benchmark.return20DOffsets || {};
    strengthBenchmarkReturn = benchmarkReturn;
    strengthUniverse = universe.map(item => {
      const performance = bySymbol.get(item.symbol) || {},
        meta = window.BuyEngineV2.ETF_MASTER[item.symbol] || {},
        leverage = meta.leveraged || /L$/.test(item.symbol) ? 2 : 1,
        returnsByOffset = performance.return20DOffsets || {},
        rsTimeline = Object.fromEntries([0, 3, 5, 10, 20].map(offset => {
          const adjusted = calculateLeverageAdjustedReturn(returnsByOffset[offset], leverage);
          return [offset, calculateRsRatio(adjusted, benchmarkOffsets[offset])];
        })),
        rating = classifyRs20Trend(rsTimeline);
      return {
        ...item,
        name: item.name || performance.name || ETF_NAME_BY_SYMBOL[item.symbol] || "",
        return20D: finiteOrNull(performance.return20D),
        benchmarkReturn,
        leverage,
        rsTimeline,
        rsRatio: rsTimeline[0],
        rating,
        latestDate: performance.latestDate || "",
        error: performance.error || "",
      };
    }).sort((a, b) => (b.rsRatio ?? -Infinity) - (a.rsRatio ?? -Infinity));
    renderStrengthTable();
    const available = strengthUniverse.filter(item => Number.isFinite(item.rsRatio)).length;
    $("strengthStatus").textContent = `完成：${available}／${strengthUniverse.length} 檔已有 20 日行情；基準日 ${bySymbol.get("0050")?.latestDate || "—"}。`;
  } catch (error) {
    $("strengthStatus").textContent = `無法載入動態清單：${String(error?.message || error)}。若顯示「不支援的操作」，請重新部署最新版 Apps Script。`;
  } finally {
    button.disabled = false;
  }
}
async function updateStrengthUniverse(operation, symbol, name = "") {
  await postGoogleSheetAction("updateEtfUniverse", { operation, symbol, name });
  await refreshStrengthUniverse({ quiet: true });
}
async function applyOcrRows() {
  const numericFields = ["premium", "arkShares", "positionCapital"];
  ocrRows = ocrRows
    .map((row, index) => {
      const inputs = [
        ...document.querySelectorAll(`[data-ocr-index="${index}"]`),
      ];
      const next = { ...row };
      inputs.forEach((input) => {
        next[input.dataset.ocrField] = numericFields.includes(
          input.dataset.ocrField,
        )
          ? cleanOcrNumber(input.value)
          : input.value.trim();
      });
      delete next._dataConflict;
      delete next._duplicate;
      return next;
    })
    .filter((row) => row.symbol);
  const validation = window.BuyEngineV2.validateArkImageData({
    items: ocrRows,
  });
  if (validation.errors) {
    $("ocrStatus").textContent =
      `尚有 ${validation.errors} 個驗證錯誤，請修正後再確認。`;
    ocrRows = validation.items;
    renderOcrReview();
    return;
  }
  const existing = new Map(
    (window.currentETFs || []).map((etf) => [etf.symbol, etf]),
  );
  window.currentETFs = validation.items.map((row) => {
    const old = existing.get(row.symbol) || {},
      meta = window.BuyEngineV2.ETF_MASTER[row.symbol] || {};
    return {
      ...old,
      ...meta,
      symbol: row.symbol,
      // Unknown/new ETFs are not necessarily in ETF_MASTER. Keep the Chinese
      // name returned by Gemini instead of dropping it while applying rows.
      name:
        meta.name ||
        String(row.name || "").trim() ||
        old.name ||
        ETF_NAME_BY_SYMBOL[row.symbol] ||
        "",
      nav: row.nav,
      premium: row.premiumPercent,
      arkShares: row.positionShares,
      positionCapital: row.positionAmount,
      riskShares: row.riskShares,
      riskAmount: row.riskAmount,
      valueTag: row.valueTag,
      heatingTag: row.heatingTag,
      currentWeight: old.currentWeight ?? 0,
      leverage: meta.leveraged ? 2 : old.leverage || 1,
    };
  });
  const confirmed = {
      date: $("decisionDate").value,
      detectedRows: validation.detectedRows,
      items: validation.items.map(({ validation, ...row }) => row),
    },
    successText = `已確認並套用 ${window.currentETFs.length} 檔 ETF；${validation.incomplete ? "清單少於10檔，已依實際列數保存，未自動補檔。" : "清單驗證完成。"}`;
  window.BuyEngineV2.saveDailySnapshot(confirmed);
  saveETFs();
  renderDashboard();
  let finalText = successText;
  if ($("saveEtfListOption")?.checked) {
    const button = $("applyOcrBtn");
    button.disabled = true;
    button.textContent = "正在儲存…";
    try {
      const saved = await saveEtfListToGoogleSheet();
      finalText += ` 已儲存 ${saved.date} 共 ${saved.savedCount} 檔至 Google Sheet；重複資料已更新。`;
    } catch (error) {
      finalText += ` Google Sheet 尚未儲存：${String(error?.message || error)}`;
    } finally {
      button.disabled = false;
      button.textContent = "確認並套用今日資料";
    }
  }
  resetOcrImport(finalText);
  $("etfCards").scrollIntoView({ behavior: "smooth", block: "start" });
}
function calculateETFOrders(etfs, decision) {
  if (decision?._v2Plan) return decision._v2Plan.orders;
  return etfs.map((etf) => ({
    ...etf,
    global: 0,
    concentrationFactor: 1,
    premiumFactor: 1,
    status: "WAIT & ACCUMULATE",
    finalMultiplier: 0,
    finalShares: 0,
  }));
}
function reconcileExecutionBudget(orders, decision) {
  const plan = decision?._v2Plan;
  if (plan)
    return {
      orders: plan.orders,
      globalTarget: plan.globalTargetExecution,
      total: plan.effectiveExecution,
      unallocated: plan.pendingCapital,
    };
  return { orders, globalTarget: 0, total: 0, unallocated: 0 };
}

function predictMarketPosition(records, input) {
  const valid = records.filter(
      (row) =>
        Number.isFinite(Number(row.taiwanIndex)) && Number(row.taiwanIndex) > 0,
    ),
    recent = valid.slice(-20);
  if (recent.length < 5)
    return {
      value: "MID",
      label: "區間震盪",
      reason: "可用的大盤資料不足5筆，暫列區間震盪。",
      rangePosition: null,
    };
  const indices = recent.map((row) => Number(row.taiwanIndex)),
    latest = indices.at(-1),
    low = Math.min(...indices),
    high = Math.max(...indices),
    rangePosition = high === low ? 0.5 : (latest - low) / (high - low);
  let highScore = rangePosition >= 0.8 ? 2 : rangePosition >= 0.65 ? 1 : 0,
    lowScore = rangePosition <= 0.2 ? 2 : rangePosition <= 0.35 ? 1 : 0;
  const reasons = [
    `大盤位於近20筆區間的 ${(rangePosition * 100).toFixed(0)}% 位置`,
  ];
  const year = Number(
      String(valid.at(-1)?.date || new Date().getFullYear()).slice(0, 4),
    ),
    events = buildArkLevelEvents(getAnnualArkRecords(records, year)),
    highEvents = summarizeArkEvents(events, "HIGH"),
    lowEvents = summarizeArkEvents(events, "LOW");
  if (input.todayArk >= CONFIG.arkWaterLevels.upperDecile && highEvents.count) {
    if (highEvents.averageChange > 0) lowScore += 1;
    else if (highEvents.averageChange < 0) highScore += 1;
    reasons.push(
      `ARK處於${CONFIG.arkWaterLevels.upperDecile}%以上；今年高水位事件離開前大盤平均 ${highEvents.averageChange >= 0 ? "+" : ""}${highEvents.averageChange.toFixed(2)}%`,
    );
  }
  if (input.todayArk <= CONFIG.arkWaterLevels.lowerDecile && lowEvents.count) {
    if (lowEvents.averageChange > 1) lowScore += 1;
    else if (lowEvents.averageChange < -1) highScore += 1;
    reasons.push(
      `ARK處於${CONFIG.arkWaterLevels.lowerDecile}%以下；今年低水位事件離開前大盤平均 ${lowEvents.averageChange >= 0 ? "+" : ""}${lowEvents.averageChange.toFixed(2)}%`,
    );
  }
  if (input.cnn >= 70) {
    highScore += 1;
    reasons.push("CNN偏貪婪");
  } else if (input.cnn <= 30) {
    lowScore += 1;
    reasons.push("CNN偏恐懼");
  }
  if (input.rsi >= 70) {
    highScore += 1;
    reasons.push("RSI偏熱");
  } else if (input.rsi <= 30) {
    lowScore += 1;
    reasons.push("RSI偏冷");
  }
  const value =
      highScore - lowScore >= 2
        ? "HIGH"
        : lowScore - highScore >= 2
          ? "LOW"
          : "MID",
    label = { HIGH: "區間高點", LOW: "區間低點", MID: "區間震盪" }[value];
  return {
    value,
    label,
    reason: `${reasons.join("；")}。高點分數 ${highScore}、低點分數 ${lowScore}，預測為${label}。`,
    rangePosition,
  };
}
function recordsWithCurrentMarket(records, input) {
  const merged = (records || [])
    .filter(
      (row) =>
        row?.date &&
        Number.isFinite(Number(row.arkAllocation)) &&
        Number.isFinite(Number(row.taiwanIndex)),
    )
    .map((row) => ({
      ...row,
      arkAllocation: Number(row.arkAllocation),
      taiwanIndex: Number(row.taiwanIndex),
      cnn: Number.isFinite(Number(row.cnn)) ? Number(row.cnn) : null,
    }));
  const currentIndex = Number(input?.currentTaiwanIndex),
    todayArk = Number(input?.todayArk),
    currentCnn = Number(input?.cnn);
  if (!(currentIndex > 0) || !(todayArk > 0)) return merged;
  const date =
      $("decisionDate")?.value ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }),
    row = {
      date,
      arkAllocation: todayArk,
      taiwanIndex: currentIndex,
      ...(Number.isFinite(currentCnn) ? { cnn: currentCnn } : {}),
    },
    existing = merged.findIndex((item) => String(item.date) === date);
  if (existing >= 0) merged[existing] = { ...merged[existing], ...row };
  else merged.push(row);
  return merged.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function getInput() {
  const input = {
    todayArk: num("todayArk"),
    currentTaiwanIndex: num("currentTaiwanIndex"),
    actualAllocation: num("actualAllocation"),
    arkSuggestedCapital: num("arkSuggestedCapital"),
    cnn: num("cnn"),
    rsi: num("rsi"),
    margin: num("margin"),
    arkHistory: [
      ...SOURCE_HISTORY.slice(0, -3),
      num("ark5D"),
      num("ark3D"),
      num("yesterdayArk"),
    ],
    previousRegime: (loadHistory().at(-1) || {}).regime,
  };
  input.strategyHistory = recordsWithCurrentMarket(
    window.centralRecords || [],
    input,
  );
  const prediction = predictMarketPosition(
    input.strategyHistory,
    input,
  );
  input.marketPosition = prediction.value;
  input.marketPrediction = prediction;
  $("marketPosition").value = prediction.value;
  $("marketPositionLabel").textContent = prediction.label;
  $("marketPositionReason").textContent = prediction.reason;
  return input;
}
function renderSparkline(input = getInput()) {
  const records = recordsWithCurrentMarket(
    window.centralRecords?.length ? window.centralRecords : SOURCE_RECORDS,
    input,
  ).slice(-10);
  if (records.length < 2) {
    $("sparkline").innerHTML =
      '<p class="note">同步至少兩筆含日期與大盤指數的紀錄後，才會顯示趨勢圖。</p>';
    return;
  }
  const w = 620,
    h = 215,
    left = 42,
    right = 62,
    top = 15,
    bottom = 55,
    plotW = w - left - right,
    plotH = h - top - bottom;
  const ark = records.map((row) => Number(row.arkAllocation)),
    index = records.map((row) => Number(row.taiwanIndex));
  const arkMin = Math.min(...ark) - 1,
    arkMax = Math.max(...ark) + 1,
    indexPad = Math.max(100, (Math.max(...index) - Math.min(...index)) * 0.12),
    indexMin = Math.min(...index) - indexPad,
    indexMax = Math.max(...index) + indexPad;
  const x = (i) => left + (i * plotW) / (records.length - 1),
    yArk = (v) => top + ((arkMax - v) * plotH) / (arkMax - arkMin),
    yIndex = (v) => top + ((indexMax - v) * plotH) / (indexMax - indexMin);
  const arkPoints = ark.map((v, i) => `${x(i)},${yArk(v)}`).join(" "),
    barWidth = Math.min(32, (plotW / records.length) * 0.58);
  const dateLabels = records
    .map(
      (row, i) =>
        `<text class="date-label" x="${x(i)}" y="${h - 8}" text-anchor="end" transform="rotate(-45 ${x(i)} ${h - 8})">${String(row.date).slice(5).replace("-", "/")}</text>`,
    )
    .join("");
  const bars = records
    .map(
      (row, i) =>
        `<rect class="index-bar-chart" x="${x(i) - barWidth / 2}" y="${yIndex(index[i])}" width="${barWidth}" height="${h - bottom - yIndex(index[i])}"><title>${row.date}｜加權指數 ${index[i].toLocaleString("zh-TW")}</title></rect><text class="index-value-label" x="${x(i)}" y="${h - bottom - 7}" text-anchor="middle">${Math.round(index[i]).toLocaleString("zh-TW")}</text>`,
    )
    .join("");
  const dots = records
    .map(
      (row, i) =>
        `<circle cx="${x(i)}" cy="${yArk(ark[i])}" r="3" fill="#36d6e7"><title>${row.date}｜ARK ${ark[i].toFixed(1)}%</title></circle><text class="ark-value-label" x="${x(i)}" y="${yArk(ark[i]) < top + 13 ? yArk(ark[i]) + 15 : yArk(ark[i]) - 8}" text-anchor="middle">${ark[i].toFixed(1)}%</text>`,
    )
    .join("");
  $("sparkline").innerHTML =
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="ARK 建議持股折線與台灣加權指數柱狀趨勢圖"><line class="grid" x1="${left}" y1="${top}" x2="${w - right}" y2="${top}"/><line class="grid" x1="${left}" y1="${top + plotH / 2}" x2="${w - right}" y2="${top + plotH / 2}"/><line class="grid" x1="${left}" y1="${h - bottom}" x2="${w - right}" y2="${h - bottom}"/>${bars}<polyline class="line" points="${arkPoints}"/>${dots}<text x="2" y="${top + 5}">${arkMax.toFixed(1)}%</text><text x="2" y="${h - bottom}">${arkMin.toFixed(1)}%</text><text x="${w - 2}" y="${top + 5}" text-anchor="end">${Math.round(indexMax).toLocaleString("zh-TW")}</text><text x="${w - 2}" y="${h - bottom}" text-anchor="end">${Math.round(indexMin).toLocaleString("zh-TW")}</text>${dateLabels}</svg>`;
}
function trendVector(rows, key) {
  const values = rows.map((row) => Number(row[key])),
    base = values[0];
  if (!values.every(Number.isFinite) || !Number.isFinite(base)) return null;
  if (key === "arkAllocation") return values.map((value) => (value - base) / 10);
  if (key === "cnn") return values.map((value) => (value - base) / 30);
  if (key === "taiwanIndex")
    return values.map((value, index) =>
      index && values[index - 1] > 0
        ? ((value / values[index - 1] - 1) * 100) / 5
        : 0,
    );
  return null;
}
function trendRmse(left, right) {
  if (!left || !right || left.length !== right.length) return Infinity;
  return Math.sqrt(
    left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0) /
      left.length,
  );
}
function arkWaterRegime(value) {
  if (value >= 75) return "HIGH";
  if (value >= 60) return "MID";
  return "LOW";
}
function trendDirection(value, threshold) {
  if (value > threshold) return 1;
  if (value < -threshold) return -1;
  return 0;
}
function arkMarketRelationship(rows) {
  const first = rows[0],
    last = rows.at(-1),
    arkChange = Number(last?.arkAllocation) - Number(first?.arkAllocation),
    firstIndex = Number(first?.taiwanIndex),
    lastIndex = Number(last?.taiwanIndex),
    marketChange = firstIndex > 0 ? (lastIndex / firstIndex - 1) * 100 : 0;
  return {
    ark: trendDirection(arkChange, 0.5),
    market: trendDirection(marketChange, 0.3),
  };
}
function compareTrendWindows(current, candidate) {
  const keys = ["arkAllocation", "cnn", "taiwanIndex"],
    scores = Object.fromEntries(
      keys.map((key) => [key, trendRmse(trendVector(current, key), trendVector(candidate, key))]),
    ),
    currentWater = Number(current.at(-1)?.arkAllocation),
    candidateWater = Number(candidate.at(-1)?.arkAllocation),
    waterLevelDifference = Math.abs(currentWater - candidateWater),
    currentRelationship = arkMarketRelationship(current),
    candidateRelationship = arkMarketRelationship(candidate),
    relationshipMismatch =
      Number(currentRelationship.ark !== candidateRelationship.ark) +
      Number(currentRelationship.market !== candidateRelationship.market),
    waterLevelPenalty = Math.max(0, waterLevelDifference - 2) * 0.08,
    relationshipPenalty = relationshipMismatch * 0.35;
  return {
    score:
      scores.arkAllocation * 0.6 +
      scores.taiwanIndex * 0.3 +
      scores.cnn * 0.1 +
      waterLevelPenalty +
      relationshipPenalty,
    scores,
    waterLevelDifference,
    relationshipMismatch,
  };
}
const marketSeasonalityCache = {};
const marketSeasonalityPending = {};
function loadMarketSeasonality(month) {
  if (Object.prototype.hasOwnProperty.call(marketSeasonalityCache, month) || marketSeasonalityPending[month]) return;
  marketSeasonalityPending[month] = fetch(`/api/market-seasonality?month=${month}`)
    .then((response) => response.json())
    .then((data) => { marketSeasonalityCache[month] = data?.ok ? data : null; })
    .catch(() => { marketSeasonalityCache[month] = null; })
    .finally(() => {
      delete marketSeasonalityPending[month];
      if (window.currentDecision) renderDashboard();
      else renderSimilarTrendAnalysis();
    });
}
function analyzeSimilarTrend(records, year = new Date().getFullYear(), seasonality = null) {
  const rows = (records || [])
    .filter(
      (row) =>
        String(row?.date || "").startsWith(`${year}-`) &&
        [row.arkAllocation, row.cnn, row.taiwanIndex].every(
          (value) => value !== null && value !== "" && Number.isFinite(Number(value)),
        ) &&
        Number(row.taiwanIndex) > 0,
    )
    .map((row) => ({
      ...row,
      arkAllocation: Number(row.arkAllocation),
      cnn: Number(row.cnn),
      taiwanIndex: Number(row.taiwanIndex),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (rows.length < 20) return null;
  const current = rows.slice(-5),
    history = rows.filter((row) => String(row.date) < String(current[0].date));
  if (history.length < 15) return null;
  const candidates = [];
  for (let start = 0; start <= history.length - 15; start += 1) {
    const segment = history.slice(start, start + 15);
    const candidateWindow = segment.slice(0, 5),
      currentWater = current.at(-1).arkAllocation,
      candidateWater = candidateWindow.at(-1).arkAllocation;
    // 絕對水位代表不同的市場風險階段。高水位不可再與 60% 多的中水位互相比對。
    if (
      arkWaterRegime(currentWater) !== arkWaterRegime(candidateWater) ||
      Math.abs(currentWater - candidateWater) > 8
    )
      continue;
    const comparison = compareTrendWindows(current, candidateWindow);
    if (Number.isFinite(comparison.score))
      candidates.push({ ...comparison, segment, current, start });
  }
  const selected = [];
  for (const candidate of candidates.sort((a, b) => a.score - b.score)) {
    if (selected.every((item) => Math.abs(item.start - candidate.start) >= 15))
      selected.push(candidate);
    if (selected.length === 5) break;
  }
  if (selected.length < 3) return null;
  const change = (to, from) => (from ? (to / from - 1) * 100 : 0),
    currentRisk = current.at(-1).arkAllocation,
    withForecast = selected.map((candidate) => {
      const matchEnd = candidate.segment[4],
        nearFuture = candidate.segment[9],
        farFuture = candidate.segment[14],
        marketPath = candidate.segment
          .slice(4)
          .map((row) => change(row.taiwanIndex, matchEnd.taiwanIndex)),
        riskPath = candidate.segment
          .slice(4)
          .map((row) => currentRisk + row.arkAllocation - matchEnd.arkAllocation);
      return {
        ...candidate,
        similarity: clamp(100 - candidate.score * 30, 0, 100),
        startDate: candidate.segment[0].date,
        matchEndDate: matchEnd.date,
        endDate: farFuture.date,
        marketPath,
        riskPath,
        forecast: {
          risk5: nearFuture.arkAllocation - matchEnd.arkAllocation,
          risk10: farFuture.arkAllocation - matchEnd.arkAllocation,
          market5: change(nearFuture.taiwanIndex, matchEnd.taiwanIndex),
          market10: change(farFuture.taiwanIndex, matchEnd.taiwanIndex),
          cnn5: nearFuture.cnn - matchEnd.cnn,
          cnn10: farFuture.cnn - matchEnd.cnn,
        },
      };
    }),
    average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length,
    horizonStats = (key) => {
      const values = withForecast.map((item) => item.forecast[key]);
      return {
        upRate: (values.filter((value) => value > 0).length / values.length) * 100,
        average: average(values),
        max: Math.max(...values),
        min: Math.min(...values),
      };
    },
    averagePath = (key) => Array.from({ length: 11 }, (_, index) =>
      average(withForecast.map((item) => item[key][index])),
    ),
    similarMarketPath = averagePath("marketPath"),
    seasonalTenDayReturn = seasonality ? Number(seasonality.averageReturn) * (10 / 21) : 0,
    combinedMarketPath = similarMarketPath.map((value, index) =>
      value * (seasonality ? 0.8 : 1) + seasonalTenDayReturn * (index / 10) * (seasonality ? 0.2 : 0),
    ),
    combinedRiskPath = averagePath("riskPath"),
    similarUpRate = horizonStats("market10").upRate,
    combinedUpRate = seasonality
      ? similarUpRate * 0.8 + Number(seasonality.upRate) * 0.2
      : similarUpRate,
    best = withForecast[0];
  return {
    ...best,
    cases: withForecast,
    caseCount: withForecast.length,
    recent: rows.slice(-20),
    averageSimilarity: average(withForecast.map((item) => item.similarity)),
    stats: {
      market5: horizonStats("market5"),
      market10: horizonStats("market10"),
      risk5Average: average(withForecast.map((item) => item.forecast.risk5)),
      risk10Average: average(withForecast.map((item) => item.forecast.risk10)),
      reaches85Rate:
        (withForecast.filter((item) => Math.max(...item.riskPath) >= 85).length /
          withForecast.length) *
        100,
      divergenceRate:
        (withForecast.filter(
          (item) => item.forecast.risk10 > 0 && item.forecast.market10 < 0,
        ).length /
          withForecast.length) *
        100,
      combinedUpRate,
      combinedDownRate: 100 - combinedUpRate,
    },
    seasonality,
    scenarios: {
      combined: {
        marketPath: combinedMarketPath,
        riskPath: combinedRiskPath,
        forecast: {
          market10: combinedMarketPath.at(-1),
          risk10: combinedRiskPath.at(-1) - currentRisk,
        },
      },
    },
  };
}
function renderSimilarScenarioChart(result) {
  const chart = $("similarTrendScenarioChart");
  if (!chart) return;
  const mobile = window.matchMedia("(max-width: 600px)").matches,
    width = mobile ? 390 : 900,
    height = 300,
    left = mobile ? 72 : 68,
    right = mobile ? 12 : 178,
    top = 52,
    bottom = 48,
    plotWidth = width - left - right,
    plotHeight = height - top - bottom,
    series = [["combined", "綜合預測", "#5bc0be", 126]],
    smoothPath = (points) => {
      if (points.length < 2) return "";
      return points.slice(1).reduce((path, point, index) => {
        const previous = points[index],
          before = points[index - 1] || previous,
          after = points[index + 2] || point,
          control1X = previous[0] + (point[0] - before[0]) / 6,
          control1Y = previous[1] + (point[1] - before[1]) / 6,
          control2X = point[0] - (after[0] - previous[0]) / 6,
          control2Y = point[1] - (after[1] - previous[1]) / 6;
        return `${path} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${point[0]} ${point[1]}`;
      }, `M ${points[0][0]} ${points[0][1]}`);
    },
    recent = result.recent || result.current,
    currentIndex = Number(recent.at(-1).taiwanIndex),
    historyOffset = 20 - recent.length,
    marketX = (index) => left + (index * plotWidth) / 29,
    marketPaths = Object.fromEntries(
      series.map(([key]) => [
        key,
        result.scenarios[key].marketPath.map(
          (value) => currentIndex * (1 + value / 100),
        ),
      ]),
    ),
    marketValues = [
      ...recent.map((row) => Number(row.taiwanIndex)),
      ...Object.values(marketPaths).flat(),
    ],
    marketMin = Math.min(...marketValues),
    marketMax = Math.max(...marketValues),
    marketPadding = Math.max((marketMax - marketMin) * 0.14, 120),
    marketY = (value) =>
      top +
      ((marketMax + marketPadding - value) * plotHeight) /
        (marketMax - marketMin + marketPadding * 2),
    marketGrid = Array.from({ length: 5 }, (_, index) => {
      const value =
          marketMax + marketPadding -
          (index * (marketMax - marketMin + marketPadding * 2)) / 4,
        gridY = marketY(value);
      return `<line x1="${left}" y1="${gridY}" x2="${width - right}" y2="${gridY}" class="scenario-grid-line"/><text x="${left - 12}" y="${gridY + 4}" text-anchor="end">${Math.round(value).toLocaleString("zh-TW")}</text>`;
    }).join(""),
    observedPoints = recent.map((row, index) => [
      marketX(historyOffset + index),
      marketY(Number(row.taiwanIndex)),
    ]),
    observedPath = smoothPath(observedPoints),
    marketLines = series
      .map(([key, label, color, labelY]) => {
        const scenario = result.scenarios[key],
          projected = marketPaths[key],
          points = projected.map((value, index) => [marketX(19 + index), marketY(value)]),
          path = smoothPath(points),
          end = scenario.marketPath.at(-1),
          target = projected.at(-1),
          endY = marketY(target),
          dots = points
            .map(([dotX, dotY], index) => `<circle cx="${dotX}" cy="${dotY}" r="${index === 10 ? 4.5 : 2.2}" fill="${color}" class="scenario-dot"/>`)
            .join("");
        const resultLabel = mobile
          ? ""
          : `<path d="M ${marketX(29) + 6} ${endY} C ${marketX(29) + 24} ${endY}, ${width - right + 24} ${labelY}, ${width - right + 44} ${labelY}" fill="none" stroke="${color}" class="scenario-connector"/><g class="scenario-result"><rect x="${width - right + 44}" y="${labelY - 19}" width="122" height="38" rx="8" fill="${color}" stroke="${color}"/><text x="${width - right + 56}" y="${labelY - 4}" class="scenario-result-label">${label} · ${Math.round(target).toLocaleString("zh-TW")} 點</text><text x="${width - 24}" y="${labelY + 12}" text-anchor="end" class="scenario-result-value">${end >= 0 ? "+" : ""}${end.toFixed(1)}%</text></g>`;
        return `<path d="${path}" fill="none" stroke="${color}" class="scenario-line scenario-forecast-line"/>${dots}${resultLabel}`;
      })
      .join(""),
    marketLabels = [
      [historyOffset, String(recent[0].date).slice(5).replace("-", "/")],
      [19, "現在"],
      [24, "後 5 日"],
      [29, "後 10 日"],
    ]
      .map(([index, label]) => `<text x="${marketX(index)}" y="${height - 12}" text-anchor="middle">${label}</text>`)
      .join(""),
    riskHeight = 270,
    riskTop = 28,
    riskBottom = 44,
    riskPlotHeight = riskHeight - riskTop - riskBottom,
    riskValues = series.flatMap(([key]) => result.scenarios[key].riskPath),
    riskMin = Math.min(...riskValues, 85),
    riskMax = Math.max(...riskValues, 85),
    riskPadding = Math.max((riskMax - riskMin) * 0.14, 1),
    riskChartMin = riskMin - riskPadding,
    riskChartMax = riskMax + riskPadding,
    x = (index) => left + (index * plotWidth) / 10,
    riskY = (value) =>
      riskTop +
      ((riskChartMax - value) * riskPlotHeight) / (riskChartMax - riskChartMin),
    riskGrid = Array.from({ length: 5 }, (_, index) => {
      const value = riskChartMax - (index * (riskChartMax - riskChartMin)) / 4,
        gridY = riskY(value);
      return `<line x1="${left}" y1="${gridY}" x2="${width - right}" y2="${gridY}" class="scenario-grid-line"/><text x="${left - 12}" y="${gridY + 4}" text-anchor="end">${value.toFixed(1)}%</text>`;
    }).join(""),
    riskLines = series
      .map(([key, label, color, labelY]) => {
        const pathValues = result.scenarios[key].riskPath,
          points = pathValues.map((value, index) => [x(index), riskY(value)]),
          path = smoothPath(points),
          end = pathValues.at(-1),
          endY = riskY(end),
          dots = points
            .map(([dotX, dotY], index) => `<circle cx="${dotX}" cy="${dotY}" r="${index === 10 ? 4.5 : 2.5}" fill="${color}" class="scenario-dot"/>`)
            .join("");
        const resultLabel = mobile
          ? ""
          : `<path d="M ${x(10) + 6} ${endY} C ${x(10) + 34} ${endY}, ${width - right + 26} ${labelY}, ${width - right + 44} ${labelY}" fill="none" stroke="${color}" class="scenario-connector"/><g class="scenario-result"><rect x="${width - right + 44}" y="${labelY - 19}" width="122" height="38" rx="8" fill="${color}" stroke="${color}"/><text x="${width - right + 56}" y="${labelY - 3}" class="scenario-result-label">${label}</text><text x="${width - 24}" y="${labelY + 11}" text-anchor="end" class="scenario-result-value">${end.toFixed(1)}%</text></g>`;
        return `<path d="${path}" fill="none" stroke="${color}" class="scenario-line"/>${dots}${resultLabel}`;
      })
      .join(""),
    riskDayLabels = [0, 5, 10]
      .map((day) => `<text x="${x(day)}" y="${riskHeight - 10}" text-anchor="middle">${day === 0 ? "目前" : `後 ${day} 日`}</text>`)
      .join(""),
    mobileMarketSummary = mobile
      ? `<div class="mobile-scenario-results">${series.map(([key, label, color]) => { const scenario = result.scenarios[key], target = marketPaths[key].at(-1), end = scenario.marketPath.at(-1); return `<div style="--scenario-color:${color}"><span>${label} · ${Math.round(target).toLocaleString("zh-TW")} 點</span><strong>${end >= 0 ? "+" : ""}${end.toFixed(1)}%</strong></div>`; }).join("")}</div>`
      : "",
    marketSvg = `<h4>大盤實際走勢與歷史情境推演</h4><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="近期大盤實際走勢及後十日歷史情境推演"><rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" rx="8" class="scenario-plot-bg"/>${marketGrid}<line x1="${marketX(19)}" y1="${top}" x2="${marketX(19)}" y2="${height - bottom}" class="scenario-now-line"/><text x="${marketX(19) + 8}" y="${top + 14}" class="scenario-now-label">現在</text><path d="${observedPath}" fill="none" class="scenario-observed-line"/><circle cx="${marketX(19)}" cy="${marketY(currentIndex)}" r="4.5" class="scenario-current-dot"/>${marketLines}${marketLabels}</svg>${mobileMarketSummary}`,
    riskDividers = [0, 5, 10]
      .map((day) => `<line x1="${x(day)}" y1="${riskTop}" x2="${x(day)}" y2="${riskHeight - riskBottom}" class="scenario-day-line"/>`)
      .join(""),
    mobileRiskSummary = mobile
      ? `<div class="mobile-scenario-results">${series.map(([key, label, color]) => `<div style="--scenario-color:${color}"><span>${label}</span><strong>${result.scenarios[key].riskPath.at(-1).toFixed(1)}%</strong></div>`).join("")}</div>`
      : "",
    riskSvg = `<h4>方舟風控水位（依目前水位投影）</h4><svg viewBox="0 0 ${width} ${riskHeight}" role="img" aria-label="相似案例後十日的方舟風控水位路徑"><rect x="${left}" y="${riskTop}" width="${plotWidth}" height="${riskPlotHeight}" rx="8" class="scenario-plot-bg"/>${riskGrid}${riskDividers}<line x1="${left}" y1="${riskY(85)}" x2="${width - right}" y2="${riskY(85)}" class="scenario-threshold-line"/><text x="${left + 8}" y="${riskY(85) - 7}" class="scenario-threshold-label">85% 觀察線</text>${riskLines}${riskDayLabels}</svg>${mobileRiskSummary}`;
  chart.innerHTML = marketSvg + riskSvg;
}
function renderSimilarTrendChart(result) {
  const chart = $("similarTrendChart");
  if (!chart) return;
  const width = 900,
    height = 500,
    left = 100,
    right = 34,
    top = 58,
    rowHeight = 100,
    gap = 52,
    plotWidth = width - left - right,
    x = (index) => left + (index * plotWidth) / 14,
    metrics = [
      ["arkAllocation", "風控水位 %", "#36d6e7", (value) => `${value.toFixed(1)}%`],
      ["marketReturn", "大盤日漲跌 %", "#6aa9ff", (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`],
      ["cnn", "CNN 指數", "#f4b942", (value) => value.toFixed(0)],
    ];
  const dailyReturns = (rows) =>
      rows.map((row, index) =>
        index && Number(rows[index - 1].taiwanIndex) > 0
          ? (Number(row.taiwanIndex) / Number(rows[index - 1].taiwanIndex) - 1) * 100
          : 0,
      ),
    phaseWidth = plotWidth / 3,
    backgrounds = [0, 1, 2]
      .map((phase) => `<rect x="${left + phase * phaseWidth}" y="25" width="${phaseWidth}" height="${height - 48}" class="phase-bg${phase ? " future" : " active"}"/><text x="${left + phase * phaseWidth + phaseWidth / 2}" y="42" class="phase-label" text-anchor="middle">${["歷史相似 5 日", "歷史後續 1–5 日", "歷史後續 6–10 日"][phase]}</text>`)
      .join("");
  const lines = metrics
    .map(([key, label, color, format], metricIndex) => {
      const historical = key === "marketReturn"
          ? dailyReturns(result.segment)
          : result.segment.map((row) => Number(row[key])),
        current = key === "marketReturn"
          ? dailyReturns(result.current)
          : result.current.map((row) => Number(row[key])),
        all = [...historical, ...current],
        min = Math.min(...all),
        max = Math.max(...all),
        padding = Math.max((max - min) * 0.25, key === "marketReturn" ? 0.25 : 2),
        chartMin = min - padding,
        chartMax = max + padding,
        range = chartMax - chartMin || 1,
        rowTop = top + metricIndex * (rowHeight + gap),
        y = (value) => rowTop + rowHeight - ((value - chartMin) / range) * rowHeight,
        historyPoints = historical.map((value, index) => `${x(index)},${y(value)}`).join(" "),
        currentPoints = current.map((value, index) => `${x(index)},${y(value)}`).join(" "),
        labels = historical
          .map((value, index) => `<text x="${x(index)}" y="${y(value) - 9}" class="value-label" text-anchor="middle">${format(value)}</text>`)
          .join(""),
        dots = historical
          .map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="2.5" fill="${color}"/>`)
          .join("");
      return `<text x="8" y="${rowTop + rowHeight / 2}" class="metric-label">${label}</text><line x1="${left}" y1="${rowTop + rowHeight}" x2="${width - right}" y2="${rowTop + rowHeight}" class="similar-grid"/><polyline points="${historyPoints}" fill="none" stroke="${color}" class="history-line"/>${dots}${labels}<polyline points="${currentPoints}" fill="none" stroke="#ffffff" class="current-line"/>`;
    })
    .join("");
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="歷史相似走勢及其後十個交易日圖表">${backgrounds}${lines}</svg>`;
}
function renderSimilarTrendAnalysis(input = getInput()) {
  const summary = $("similarTrendSummary"),
    phases = $("similarTrendPhases"),
    badge = $("similarTrendBadge"),
    chart = $("similarTrendChart"),
    scenarioChart = $("similarTrendScenarioChart");
  if (!summary || !phases || !badge || !chart || !scenarioChart) return;
  const decisionDate = String($("decisionDate")?.value || ""),
    decisionYear = Number(decisionDate.slice(0, 4)) ||
      new Date().getFullYear(),
    decisionMonth = Number(decisionDate.slice(5, 7)) || new Date().getMonth() + 1,
    records = recordsWithCurrentMarket(
      window.centralRecords?.length ? window.centralRecords : SOURCE_RECORDS,
      input,
    ),
    result = analyzeSimilarTrend(records, decisionYear, marketSeasonalityCache[decisionMonth]);
  loadMarketSeasonality(decisionMonth);
  if (!result) {
    badge.textContent = "資料不足";
    badge.className = "badge warning";
    summary.textContent = `需要 ${decisionYear} 年至少 50 筆完整資料，並且至少找到 3 個同風控區間、期末水位差不超過 8 個百分點的互不重疊案例，才能建立情境統計。`;
    phases.innerHTML = "";
    scenarioChart.innerHTML = '<p class="note">目前沒有足夠的獨立案例可建立綜合預測路徑。</p>';
    chart.innerHTML = '<p class="note">同步更多每日資料後會自動產生圖表。</p>';
    return;
  }
  badge.textContent = `前 ${result.caseCount} 個案例 · 平均相似 ${result.averageSimilarity.toFixed(0)}%`;
  badge.className = "badge buy";
  const sign = (value, suffix = "%") => `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`,
    s5 = result.stats.market5,
    s10 = result.stats.market10,
    seasonal = result.seasonality,
    upRate = result.stats.combinedUpRate,
    majority = upRate >= 60 ? "綜合偏多" : upRate <= 40 ? "綜合偏空" : "方向接近中性";
  summary.textContent = `相似案例須處於相同風控區間，且期末水位差不超過 8 個百分點；再依方舟 60%、大盤日漲跌 30%、CNN 10% 比對，方舟與大盤方向關係不同時會扣分。綜合預測採相似趨勢 80%＋歷年 ${decisionMonth} 月季節性 20%。上漲機率 ${upRate.toFixed(0)}%、下跌機率 ${result.stats.combinedDownRate.toFixed(0)}%，判讀為「${majority}」。相似案例後 10 日平均報酬 ${sign(s10.average)}；${seasonal ? `歷年 ${decisionMonth} 月共 ${seasonal.caseCount} 個樣本，平均月報酬 ${sign(Number(seasonal.averageReturn))}` : "同月歷史資料讀取中"}。統計是歷史推演，不代表未來保證。`;
  phases.innerHTML = `<div class="similar-phase active"><span>綜合漲跌機率</span><strong>上漲 ${upRate.toFixed(0)}% · 下跌 ${result.stats.combinedDownRate.toFixed(0)}%</strong><small>相似趨勢 80%＋同月季節性 20%</small></div><div class="similar-phase"><span>相似趨勢（後 10 日）</span><strong>上漲 ${s10.upRate.toFixed(0)}% · 平均 ${sign(s10.average)}</strong><small>${result.caseCount} 個案例；最高 ${sign(s10.max)} · 最低 ${sign(s10.min)}</small></div><div class="similar-phase"><span>歷年 ${decisionMonth} 月季節性</span><strong>${seasonal ? `上漲 ${Number(seasonal.upRate).toFixed(0)}% · 下跌 ${Number(seasonal.downRate).toFixed(0)}%` : "讀取中"}</strong><small>${seasonal ? `${seasonal.caseCount} 年樣本 · 平均 ${sign(Number(seasonal.averageReturn))}` : "由 Yahoo Finance 自動統計"}</small></div><div class="similar-phase"><span>風控水位情境</span><strong>升抵 85%：${result.stats.reaches85Rate.toFixed(0)}%</strong><small>後 10 日平均 ${sign(result.stats.risk10Average, " 個百分點")}</small></div>`;
  renderSimilarScenarioChart(result);
  renderSimilarTrendChart(result);
}
function decisionReasons(input, d) {
  const r = [],
    water = d.waterLevelState || arkWaterLevelState(input, d),
    levels = water.levels,
    plan = d._v2Plan,
    extremeMode = plan?.buyMode === "EXTREME_DEPLOYMENT",
    actualGapFillPercent = Number(
      plan?.actualGapFillPercent ?? plan?.targetGapFillPercent ?? 0,
    ),
    gapFillShare = Number(
      plan?.actualGapFillShare ??
        (d.gap > 0 ? (actualGapFillPercent / d.gap) * 100 : 0),
    );
  r.push(
    `實際配置比 ARK 目標${d.gap >= 0 ? "低" : "高"} ${Math.abs(d.gap).toFixed(2)}%。`,
  );
  if (Math.abs(d.gap) <= CONFIG.deadBand)
    r.push("缺口位於 ±1% 的無動作區間內，因此今日不建議交易。");
  else if (d.gap > 0)
    r.push("目前配置不足，依缺口大小分級補足，ARK 趨勢只用來調整買進速度。");
  else r.push("只有超出 ARK 目標的部位可列入調節範圍。");
  r.push(
    `ARK 一日變化為 ${pp(d.trend.delta1D)}，相較近十日高點為 ${pp(d.trend.drawdown)}。`,
  );
  if (input.currentTaiwanIndex > 0)
    r.push(
      `當下加權指數 ${input.currentTaiwanIndex.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 點，市場位置判定為「${input.marketPrediction?.label || "區間震盪"}」，已納入今日布局／調節速度。`,
    );
  if (d.strategy?.reasons?.length)
    r.push(`共用策略判定：${d.strategy.reasons.join("；")}。`);
  if (extremeMode)
    r.push(
      `今日採極端補倉：A≥80%，且 CNN≤25 或融資維持率≤166%。以方舟水位為目標，補入缺口的 75%，單日上限 3 個百分點；5 倍只代表單檔位階上限。本日依實際下單金額回算約填補 ${actualGapFillPercent.toFixed(2)} 個百分點。`,
    );
  else if (water.zone === "HIGH" && water.direction === "RISING")
    r.push(
      `ARK 已進入今年前 10% 高水位（≥${levels.upperDecile}%）且持續上升，代表模型提高風險承擔；一般非槓桿 ETF 最高 4 倍、槓桿 ETF 最高 3 倍，只有極端機會模式才開放非槓桿 ETF 5 倍，這個區間不賣股票。`,
    );
  else if (water.zone === "LOW" && water.direction === "FALLING")
    r.push(
      `ARK 已進入今年後 10% 低水位（≤${levels.lowerDecile}%）且持續下降，代表模型降低風險；買進限制為最多 1 倍，只有持倉超額時才分批調節。`,
    );
  if (d.regime === "WATCH" && d.gap <= CONFIG.buyWatchMaxGap)
    r.push("缺口只有 1–5% 且 ARK 走弱，今日可暫停加碼並觀察。");
  if (d.regime === "WATCH" && d.gap > CONFIG.buyWatchMaxGap)
    r.push("目前觸發快速下降、連續深度回撤或市場極端過熱等明確停買條件。");
  if (d.action === "SELL") {
    const reduction = input.actualAllocation - d.target;
    r.push(
      `${d.strategy?.mode === window.ARKStrategyEngine.MODES.ACCELERATED_SELL ? "加速" : "一般"}調節預計降低 ${reduction.toFixed(2)} 個百分點；成交後依該模式開始冷卻。`,
    );
  }
  return r;
}
function buildAllocationSummary(d, input, market = {}) {
  const gap = Number(d.gap),
    absoluteGap = Math.abs(gap),
    actual = Number(input.actualAllocation),
    target = Number(input.todayArk),
    water = d.waterLevelState || arkWaterLevelState(input, d),
    multiplier = Math.max(0, Number(d._v2Plan?.dynamicScale || 0)),
    oneDay = Number(d.trend.delta1D || 0),
    threeDay = Number(d.trend.delta3D || 0),
    fiveDay = Number(d.trend.delta5D || 0),
    fallingConfirmed = oneDay < 0 && (threeDay < 0 || fiveDay < 0),
    risingConfirmed = oneDay > 0 && (threeDay > 0 || fiveDay > 0),
    marketHigh = market.isRecordHigh || market.nearRecordHigh;
  const trendContext = fallingConfirmed
    ? `ARK 的 1／3／5 日變化至少兩個週期偏下（1日 ${pp(oneDay)}、3日 ${pp(threeDay)}、5日 ${pp(fiveDay)}），降風險訊號具有延續性。`
    : risingConfirmed
      ? `ARK 的 1／3／5 日變化至少兩個週期偏上（1日 ${pp(oneDay)}、3日 ${pp(threeDay)}、5日 ${pp(fiveDay)}），加風險訊號具有延續性。`
      : `ARK 的短中期方向尚未一致（1日 ${pp(oneDay)}、3日 ${pp(threeDay)}、5日 ${pp(fiveDay)}），先視為未確認趨勢。`;
  const marketContext = marketHigh
    ? "大盤位於新高附近，若 ARK 同步下降應偏向控風險；若 ARK 反而上升，則代表模型仍願意承擔風險。"
    : market.indexChangePercent > 0
      ? "大盤仍在上漲但尚未到同步紀錄高點，交易速度應以 ARK 趨勢確認為主。"
      : gap > 0
        ? "大盤回落時不因單日下跌直接停買，仍依缺口與 ARK 趨勢分批處理。"
        : "大盤正在回落；若 ARK 也持續下調，代表超配部位的調節理由增強。";
  if (absoluteGap <= CONFIG.deadBand)
    return `目前持倉 ${actual.toFixed(2)}% 與 ARK ${target.toFixed(2)}% 接近，位於 ±${CONFIG.deadBand}% 無動作區間。${trendContext} ${marketContext} 結論：維持持倉，不為小差距產生交易成本；等缺口超過 1% 或 ARK 趨勢進一步確認後再處理。`;
  if (gap > 0) {
    const size =
      gap > CONFIG.defensiveAccumulationGap
        ? "嚴重低配"
        : gap > 5
          ? "中度低配"
          : "輕度低配";
    let actionText;
    if (water.zone === "HIGH" && water.direction === "RISING")
      actionText = `ARK 已進入前 10% 高水位並續升，本次可使用 ${multiplier.toFixed(2)} 倍位階股數加強布局`;
    else if (fallingConfirmed)
      actionText = `ARK 趨勢仍弱，本次以 ${multiplier.toFixed(2)} 倍減速布局`;
    else actionText = `本次依 ${multiplier.toFixed(2)} 倍位階股數分批布局`;
    return `目前持倉 ${actual.toFixed(2)}% 低於 ARK ${target.toFixed(2)}%，缺口 ${gap.toFixed(2)}%，屬於${size}。${trendContext} ${marketContext} 結論：${actionText}；共用策略預計調高 ${(d.adjustmentPoints || 0).toFixed(2)} 個百分點，總預算再分配至各檔 ETF 位階與折溢價倍率。`;
  }
  const size =
    absoluteGap > 5 ? "明顯超配" : absoluteGap > 2 ? "中度超配" : "輕微超配";
  let actionText;
  if (water.zone === "HIGH" && water.direction === "RISING")
    actionText =
      "ARK 位於前 10% 高水位且續升，暫不賣出，等待 ARK 轉弱再重新評估";
  else if (absoluteGap <= 2)
    actionText =
      "差距仍小，先不急著賣；只有 ARK 繼續下降並形成趨勢時才小幅調節";
  else if (fallingConfirmed && d.action === "SELL")
    actionText =
      input.arkSuggestedCapital < 0
        ? `可調節降低風險；ARK 降風險趨勢已確認，可處理超額部位金額 NT$ ${Math.round(input.arkSuggestedCapital).toLocaleString("zh-TW")}，可至調節計算機中檢視股票配置`
        : `可調節降低風險；共用策略建議降低 ${(d.adjustmentPoints || 0).toFixed(2)} 個百分點，預計把配置由 ${actual.toFixed(2)}% 降至 ${d.target.toFixed(2)}%；可至調節計算機分配賣出標的`;
  else
    actionText =
      "目前只有超額事實、尚缺持續下降確認，先觀察；不因大盤單獨創高立即賣出";
  return `目前持倉 ${actual.toFixed(2)}% 高於 ARK ${target.toFixed(2)}%，超額 ${absoluteGap.toFixed(2)}%，屬於${size}。${trendContext} ${marketContext} 結論：${actionText}。`;
}
function buildTrendSummary(d, input = { todayArk: 0, actualAllocation: 0 }) {
  const allRecords = recordsWithCurrentMarket(
      window.centralRecords || [],
      input,
    ),
    records = allRecords.slice(-10);
  const arkText =
    d.trend.delta1D > 0
      ? `今日 ARK 比昨日提高 ${Math.abs(d.trend.delta1D).toFixed(2)}%，風險水位正在上調。`
      : d.trend.delta1D < 0
        ? `今日 ARK 比昨日降低 ${Math.abs(d.trend.delta1D).toFixed(2)}%，風險水位正在下調。`
        : "今日 ARK 與昨日相同，風險水位暫時持平。";
  if (records.length < 2)
    return `${arkText} 同步更多日期與大盤指數後，可加入新高與兩者方向的判讀。 ${buildAllocationSummary(d, input)}`;
  let comparable = 0,
    same = 0;
  for (let i = 1; i < records.length; i++) {
    const arkChange =
        Number(records[i].arkAllocation) - Number(records[i - 1].arkAllocation),
      indexChange =
        Number(records[i].taiwanIndex) - Number(records[i - 1].taiwanIndex);
    if (arkChange === 0 || indexChange === 0) continue;
    comparable++;
    if (Math.sign(arkChange) === Math.sign(indexChange)) same++;
  }
  const latest = allRecords.at(-1),
    previous = allRecords.at(-2),
    latestIndex = Number(latest.taiwanIndex),
    previousIndex = Number(previous.taiwanIndex),
    priorHigh = Math.max(
      ...allRecords.slice(0, -1).map((row) => Number(row.taiwanIndex)),
    ),
    indexChange = latestIndex - previousIndex,
    indexChangePercent = previousIndex
      ? (indexChange / previousIndex) * 100
      : 0,
    isRecordHigh = latestIndex > priorHigh,
    nearRecordHigh =
      !isRecordHigh && priorHigh > 0 && latestIndex >= priorHigh * 0.995,
    relation = !comparable
      ? "目前可比較資料不足"
      : same / comparable >= 0.7
        ? "近十筆資料多數同向"
        : same / comparable <= 0.3
          ? "近十筆資料多數反向"
          : "近十筆資料方向混合";
  const marketText = isRecordHigh
    ? `台灣加權指數來到 ${latestIndex.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} 點，突破同步紀錄前高 ${priorHigh.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} 點，創資料中的新高。`
    : nearRecordHigh
      ? `台灣加權指數來到 ${latestIndex.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} 點，距同步紀錄高點不到 0.5%。`
      : `台灣加權指數最新${indexChange >= 0 ? "上漲" : "下跌"} ${Math.abs(indexChange).toLocaleString("zh-TW", { maximumFractionDigits: 0 })} 點（${indexChangePercent >= 0 ? "+" : ""}${indexChangePercent.toFixed(2)}%）。`;
  let divergenceText = `ARK 與大盤${relation}。`;
  if ((isRecordHigh || nearRecordHigh) && d.trend.delta1D < 0)
    divergenceText =
      "大盤位於新高附近但 ARK 下調，代表模型沒有跟著指數追高，而是在降低風險預算。";
  else if ((isRecordHigh || nearRecordHigh) && d.trend.delta1D > 0)
    divergenceText =
      "大盤位於新高附近且 ARK 同步上調，趨勢仍偏強，但加碼應維持分批，避免一次追價。";
  const water = d.waterLevelState || arkWaterLevelState(input, d),
    levels = water.levels,
    waterText =
      water.zone === "HIGH" && water.direction === "RISING"
        ? `ARK 位於前 10% 高水位（${levels.upperDecile}%～${levels.max}%）並續升，視為模型在相對低檔加大風險承擔：一般非槓桿 ETF 最高 4 倍、槓桿 ETF 最高 3 倍，且此區間不賣股票。`
        : water.zone === "LOW" && water.direction === "FALLING"
          ? `ARK 位於後 10% 低水位（${levels.min}%～${levels.lowerDecile}%）並續降，視為模型降低風險：布局最多 1 倍，持倉超額時才分批調節。`
          : `ARK 尚未同時符合極端水位與延續方向，維持一般分批規則。`,
    allocationText = buildAllocationSummary(d, input, {
      isRecordHigh,
      nearRecordHigh,
      indexChangePercent,
    });
  return `${arkText} ${marketText} ${divergenceText} ${waterText} ${allocationText}`;
}
function calculateBacktestMetrics(values, dailyReturns, allocations, turnover) {
  const cumulativeReturn = (values.at(-1) / values[0] - 1) * 100;
  let peak = values[0],
    maxDrawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, ((value - peak) / peak) * 100);
  }
  const mean = dailyReturns.length
      ? dailyReturns.reduce((sum, value) => sum + value, 0) /
        dailyReturns.length
      : 0,
    variance =
      dailyReturns.length > 1
        ? dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          (dailyReturns.length - 1)
        : 0;
  return {
    cumulativeReturn,
    maxDrawdown,
    annualVolatility: Math.sqrt(variance) * Math.sqrt(252) * 100,
    turnover,
    averageAllocation:
      allocations.reduce((sum, value) => sum + value, 0) / allocations.length,
  };
}
function buildStrategyBacktest(records) {
  const rows = records
    .filter(
      (row) => row.date && Number(row.taiwanIndex) > 0,
    )
    .map((row) => ({
      ...row,
      taiwanIndex: Number(row.taiwanIndex),
      arkAllocation:
        row.arkAllocation !== "" &&
        row.arkAllocation !== null &&
        row.arkAllocation !== undefined &&
        Number.isFinite(Number(row.arkAllocation))
          ? Number(row.arkAllocation)
          : null,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (rows.length < 2) return { rows, strategies: [] };
  const definitions = [
      {
        key: "current",
        name: "目前規則",
        initial: 80,
      },
      { key: "fixed", name: "固定70%", initial: 70 },
      { key: "fixed80", name: "固定80%", initial: 80 },
    ],
    states = Object.fromEntries(
      definitions.map((definition) => [
        definition.key,
        {
          ...definition,
          allocation: clamp(definition.initial, 0, 100),
          value: 100,
          values: [100],
          allocations: [clamp(definition.initial, 0, 100)],
          dailyReturns: [],
          turnover: 0,
          actions: [],
          pendingSignal: null,
          strategyState: {},
        },
      ]),
    ),
    dates = [rows[0].date];
  const current = states.current,
    firstHistory = rows.slice(0, 1);
  if (rows[0].arkAllocation !== null)
    current.pendingSignal = {
      ...window.ARKStrategyEngine.evaluateStrategy({
        A: rows[0].arkAllocation,
        W: current.allocation,
        CNN: rows[0].cnn,
        M: rows[0].marginMaintenance,
        history: firstHistory,
        currentIndex: 0,
      }),
      signalA: rows[0].arkAllocation,
      signalIndex: 0,
      signalDate: rows[0].date,
    };
  for (let i = 1; i < rows.length; i++) {
    const marketReturn = rows[i].taiwanIndex / rows[i - 1].taiwanIndex - 1,
      row = rows[i];
    dates.push(rows[i].date);
    for (const state of Object.values(states)) {
      const portfolioReturn = marketReturn * (state.allocation / 100);
      state.value *= 1 + portfolioReturn;
      state.values.push(state.value);
      state.dailyReturns.push(portfolioReturn);
    }
    const driftedAllocation = window.ARKStrategyEngine.allocationAfterMarketMove(
        current.allocation,
        marketReturn,
      ),
      execution = window.ARKStrategyEngine.executePendingSignal(
        current.pendingSignal,
        driftedAllocation,
        Math.max(0, 100 - driftedAllocation),
      );
    current.allocation = execution.allocation;
    if (execution.executed) {
      current.turnover += Math.abs(execution.delta);
      current.actions.push({
        index: i,
        date: row.date,
        delta: execution.delta,
        mode: current.pendingSignal.mode,
        signalDate: current.pendingSignal.signalDate,
        signalA: current.pendingSignal.signalA,
      });
      if (execution.delta < 0)
        current.strategyState.lastSellExecution = {
          executionIndex: i,
          executionDate: row.date,
          signalA: current.pendingSignal.signalA,
          mode: current.pendingSignal.mode,
        };
    }
    current.pendingSignal = null;
    if (row.arkAllocation !== null) {
      const signal = window.ARKStrategyEngine.evaluateStrategy(
        {
          A: row.arkAllocation,
          W: current.allocation,
          CNN: row.cnn,
          M: row.marginMaintenance,
          history: rows.slice(0, i + 1),
          currentIndex: i,
        },
        current.strategyState,
      );
      if (signal.action !== "HOLD" && signal.adjustmentPoints > 0)
        current.pendingSignal = {
          ...signal,
          signalA: row.arkAllocation,
          signalIndex: i,
          signalDate: row.date,
        };
    }
    states.fixed.allocation = 70;
    states.fixed80.allocation = 80;
    for (const state of Object.values(states))
      state.allocations.push(state.allocation);
  }
  const strategies = definitions.map(({ key, name }) => {
    const state = states[key];
    return {
      key,
      name,
      values: state.values,
      metrics: calculateBacktestMetrics(
        state.values,
        state.dailyReturns,
        state.allocations,
        state.turnover,
      ),
      actions: state.actions,
      endingAllocation: state.allocation,
    };
  });
  return { rows, dates, strategies };
}
function normalizeBacktestRows(records) {
  return (records || [])
    .filter(
      (row) =>
        row.date &&
        Number(row.taiwanIndex) > 0 &&
        Number.isFinite(Number(row.arkAllocation)),
    )
    .map((row) => ({
      ...row,
      taiwanIndex: Number(row.taiwanIndex),
      arkAllocation: Number(row.arkAllocation),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function calculateExecutionDiagnostics(rows, actions, grossDailyReturns) {
  let marketUpside = 0,
    strategyUpside = 0,
    marketDownside = 0,
    strategyDownside = 0,
    chasePullbackLoss = 0,
    prematureSaleCost = 0,
    whipsawTrades = 0,
    previousAction = null;
  for (let i = 1; i < rows.length; i++) {
    const marketReturn = rows[i].taiwanIndex / rows[i - 1].taiwanIndex - 1,
      strategyReturn = grossDailyReturns[i - 1] || 0;
    if (marketReturn > 0) {
      marketUpside += marketReturn;
      strategyUpside += strategyReturn;
    } else if (marketReturn < 0) {
      marketDownside += Math.abs(marketReturn);
      strategyDownside += Math.abs(strategyReturn);
    }
  }
  for (const action of actions) {
    if (Math.abs(action.delta) < 0.25) continue;
    const end = Math.min(rows.length - 1, action.index + 5),
      base = rows[action.index].taiwanIndex,
      forwards = rows
        .slice(action.index + 1, end + 1)
        .map((row) => row.taiwanIndex / base - 1);
    if (action.delta > 0 && forwards.length) {
      const pullback = Math.min(0, ...forwards);
      chasePullbackLoss += (action.delta / 100) * Math.abs(pullback) * 100;
    }
    if (action.delta < 0 && forwards.length) {
      const rebound = Math.max(0, ...forwards);
      prematureSaleCost += (Math.abs(action.delta) / 100) * rebound * 100;
    }
    if (
      previousAction &&
      Math.sign(previousAction.delta) !== Math.sign(action.delta) &&
      action.index - previousAction.index <= 5
    )
      whipsawTrades++;
    previousAction = action;
  }
  return {
    upsideCapture: marketUpside > 0 ? (strategyUpside / marketUpside) * 100 : 0,
    downsideProtection:
      marketDownside > 0 ? (1 - strategyDownside / marketDownside) * 100 : 0,
    chasePullbackLoss,
    prematureSaleCost,
    whipsawTrades,
  };
}
function simulateBandStrategy(records, params, costRate = 0) {
  const rows = normalizeBacktestRows(records),
    deadBand = Math.max(0, Number(params?.deadBand) || 0),
    buyRate = clamp(Number(params?.buyRate) || 0, 0, 1),
    sellRate = clamp(Number(params?.sellRate) || 0, 0, 1);
  if (rows.length < 2) return null;
  let allocation = clamp(rows[0].arkAllocation, 0, 100),
    value = 100,
    turnover = 0,
    transactionCost = 0;
  const values = [value],
    allocations = [allocation],
    dailyReturns = [],
    grossDailyReturns = [],
    actions = [];
  for (let i = 1; i < rows.length; i++) {
    const previousValue = value,
      marketReturn = rows[i].taiwanIndex / rows[i - 1].taiwanIndex - 1,
      grossReturn = marketReturn * (allocation / 100);
    value *= 1 + grossReturn;
    const gap = rows[i].arkAllocation - allocation,
      nextAllocation =
        Math.abs(gap) <= deadBand
          ? allocation
          : clamp(allocation + gap * (gap > 0 ? buyRate : sellRate), 0, 100),
      delta = nextAllocation - allocation,
      cost = value * (Math.abs(delta) / 100) * (costRate / 100);
    value -= cost;
    transactionCost += cost;
    turnover += Math.abs(delta);
    if (Math.abs(delta) > 0.0001) actions.push({ index: i, delta });
    allocation = nextAllocation;
    values.push(value);
    allocations.push(allocation);
    grossDailyReturns.push(grossReturn);
    dailyReturns.push(value / previousValue - 1);
  }
  return {
    params: { deadBand, buyRate, sellRate },
    values,
    allocations,
    actions,
    metrics: {
      ...calculateBacktestMetrics(values, dailyReturns, allocations, turnover),
      transactionCost,
      ...calculateExecutionDiagnostics(rows, actions, grossDailyReturns),
    },
  };
}
function isOutOfSampleImprovement(candidate, benchmark) {
  return (
    candidate.cumulativeReturn >= benchmark.cumulativeReturn + 0.01 &&
    candidate.maxDrawdown >= benchmark.maxDrawdown + 0.01
  );
}
function optimizeWalkForward(records, costRate = 0.2) {
  const rows = normalizeBacktestRows(records);
  if (rows.length < 20) return null;
  const split = Math.floor(rows.length * 0.7),
    trainingRows = rows.slice(0, split),
    testingRows = rows.slice(split - 1),
    benchmarkParams = { deadBand: 0, buyRate: 1, sellRate: 1 },
    trainingBenchmark = simulateBandStrategy(
      trainingRows,
      benchmarkParams,
      costRate,
    ),
    testingBenchmark = simulateBandStrategy(
      testingRows,
      benchmarkParams,
      costRate,
    ),
    candidates = [];
  for (const deadBand of [0.5, 1, 1.5, 2, 3])
    for (const buyRate of [0.1, 0.15, 0.25, 0.5, 0.75, 1])
      for (const sellRate of [0.2, 0.25, 0.5, 0.75, 1]) {
        const result = simulateBandStrategy(
          trainingRows,
          { deadBand, buyRate, sellRate },
          costRate,
        );
        candidates.push(result);
      }
  const eligible = candidates.filter(
      (candidate) =>
        candidate.metrics.maxDrawdown >=
        trainingBenchmark.metrics.maxDrawdown - 0.5,
    ),
    ranked = (eligible.length ? eligible : candidates).sort(
      (a, b) =>
        b.metrics.cumulativeReturn - a.metrics.cumulativeReturn ||
        b.metrics.maxDrawdown - a.metrics.maxDrawdown ||
        a.metrics.turnover - b.metrics.turnover,
    ),
    selectedTraining = ranked[0],
    selectedTesting = simulateBandStrategy(
      testingRows,
      selectedTraining.params,
      costRate,
    ),
    approved = isOutOfSampleImprovement(
      selectedTesting.metrics,
      testingBenchmark.metrics,
    );
  return {
    rows,
    split,
    trainingRows,
    testingRows,
    trainingBenchmark,
    testingBenchmark,
    selectedTraining,
    selectedTesting,
    ranked: ranked.slice(0, 5),
    approved,
    costRate,
  };
}
function renderSensitivityValidation(records) {
  const container = $("sensitivityResult");
  if (!container) return;
  const costRate = clamp(Number($("backtestCostRate")?.value || 0.2), 0, 2),
    result = optimizeWalkForward(records, costRate),
    signed = (value) => `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
  if (!result) {
    container.innerHTML =
      '<p class="note">至少需要20筆有效資料才能進行70／30驗證。</p>';
    return;
  }
  const parameterText = (params) =>
      `無動作 ±${params.deadBand}% · 買進補缺口 ${(params.buyRate * 100).toFixed(0)}% · 調節超額 ${(params.sellRate * 100).toFixed(0)}%`,
    metricRows = [
      ["淨報酬", "cumulativeReturn", signed],
      ["最大回撤", "maxDrawdown", signed],
      ["累計換手", "turnover", (value) => `${value.toFixed(1)}%點`],
      ["交易成本", "transactionCost", (value) => `${value.toFixed(3)}%`],
      ["上漲行情參與率", "upsideCapture", (value) => `${value.toFixed(1)}%`],
      [
        "下跌行情保護率",
        "downsideProtection",
        (value) => `${value.toFixed(1)}%`,
      ],
      [
        "追高後回落損失",
        "chasePullbackLoss",
        (value) => `${value.toFixed(3)}%`,
      ],
      [
        "過早賣出機會成本",
        "prematureSaleCost",
        (value) => `${value.toFixed(3)}%`,
      ],
      ["5日內來回交易", "whipsawTrades", (value) => `${value.toFixed(0)}次`],
    ],
    candidate = result.selectedTesting.metrics,
    benchmark = result.testingBenchmark.metrics;
  container.innerHTML = `
    <div class="sensitivity-summary">
      <div class="sensitivity-box"><span>前70%參數搜尋</span><strong>${result.trainingRows[0].date}～${result.trainingRows.at(-1).date}</strong><small>${parameterText(result.selectedTraining.params)}</small></div>
      <div class="sensitivity-box"><span>訓練期淨報酬</span><strong>${signed(result.selectedTraining.metrics.cumulativeReturn)}</strong><small>ARK直接配置 ${signed(result.trainingBenchmark.metrics.cumulativeReturn)}</small></div>
      <div class="sensitivity-box"><span>後30%樣本外驗證</span><strong>${result.rows[result.split].date}～${result.rows.at(-1).date}</strong><small>參數已鎖定，未使用後30%挑選</small></div>
    </div>
    <div class="sensitivity-verdict ${result.approved ? "pass" : ""}"><strong>${result.approved ? "樣本外通過，可列入候選" : "樣本外未通過，不允許採用"}</strong><br>${result.approved ? "後30%的淨報酬與最大回撤都至少改善0.01個百分點；仍只列為候選，不會自動改寫正式參數。" : "只有後30%的淨報酬與最大回撤都至少改善0.01個百分點才可採用；目前至少一項未達門檻，正式策略維持不變。"}</div>
    <div class="sensitivity-ranking oos-metrics"><div class="sensitivity-row metric header"><span>後30%指標</span><span>候選參數</span><span>ARK直接配置</span><span>差異</span></div>${metricRows
      .map(([label, key, formatter]) => {
        const difference = candidate[key] - benchmark[key];
        return `<div class="sensitivity-row metric"><strong>${label}</strong><span>${formatter(candidate[key])}</span><span>${formatter(benchmark[key])}</span><span>${key === "whipsawTrades" ? `${difference >= 0 ? "+" : ""}${difference.toFixed(0)}次` : signed(difference)}</span></div>`;
      })
      .join("")}</div>
    <div class="sensitivity-ranking"><div class="sensitivity-row header"><span>訓練排名</span><span>無動作區</span><span>買進比例</span><span>調節比例</span><span>淨報酬</span><span>最大回撤</span><span>交易成本</span></div>${result.ranked
      .map(
        (item, index) =>
          `<div class="sensitivity-row"><strong>#${index + 1}</strong><span>±${item.params.deadBand}%</span><span>${(item.params.buyRate * 100).toFixed(0)}%</span><span>${(item.params.sellRate * 100).toFixed(0)}%</span><span>${signed(item.metrics.cumulativeReturn)}</span><span>${signed(item.metrics.maxDrawdown)}</span><span>${item.metrics.transactionCost.toFixed(3)}%</span></div>`,
      )
      .join("")}</div>
    <p class="research-warning">單邊交易成本假設 ${costRate.toFixed(2)}%，會依每次配置變動扣除。上漲參與率與下跌保護率以100%持有大盤為基準；追高損失為買進後5日內回落造成的估算損失；過早賣出成本為賣出後5日內上漲的估算機會成本；5日內反向調整且幅度至少0.25個百分點，計為一次來回交易。</p>`;
}
function renderStrategyValidation() {
  const year = CONFIG.arkWaterLevels.year,
    records = (window.centralRecords || []).filter(
      (row) => String(row.date).startsWith(`${year}-`) && Number(row.taiwanIndex) > 0,
    ),
    result = buildStrategyBacktest(records);
  if (!result.strategies.length) {
    $("backtestCount").textContent = "資料不足";
    $("backtestMetrics").innerHTML =
      '<p class="note">至少需要兩筆有效的大盤與ARK資料。</p>';
    $("backtestConclusion").textContent = "尚無法形成驗證結論。";
    $("backtestChart").innerHTML = "";
    $("backtestTable").innerHTML = "";
    return;
  }
  $("backtestCount").textContent =
    `${result.rows.length} 筆 · ${result.rows[0].date}～${result.rows.at(-1).date}`;
  const signed = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  $("backtestMetrics").innerHTML = result.strategies
    .map(
      (strategy) =>
        `<div class="backtest-metric ${strategy.key}"><span>${strategy.name}</span><strong>${signed(strategy.metrics.cumulativeReturn)}</strong><small>最大回撤 ${signed(strategy.metrics.maxDrawdown)} · 平均持股 ${strategy.metrics.averageAllocation.toFixed(1)}%</small></div>`,
    )
    .join("");
  const current = result.strategies.find(
      (strategy) => strategy.key === "current",
    ),
    fixed80 = result.strategies.find((strategy) => strategy.key === "fixed80"),
    returnDifference =
      current.metrics.cumulativeReturn - fixed80.metrics.cumulativeReturn,
    drawdownDifference = current.metrics.maxDrawdown - fixed80.metrics.maxDrawdown;
  $("backtestConclusion").textContent =
    returnDifference >= 0 && drawdownDifference >= 0
      ? `目前樣本下，現行規則相較固定 80% 多 ${returnDifference.toFixed(2)}% 報酬，最大回撤改善 ${drawdownDifference.toFixed(2)}%；報酬與風險同時改善，但仍需更多跨行情資料驗證。`
      : returnDifference < 0 && drawdownDifference >= 0
        ? `目前樣本下，現行規則比固定 80% 少 ${Math.abs(returnDifference).toFixed(2)}% 報酬，換得最大回撤改善 ${drawdownDifference.toFixed(2)}%。`
        : returnDifference >= 0
          ? `目前樣本下，現行規則比固定 80% 多 ${returnDifference.toFixed(2)}% 報酬，但最大回撤惡化 ${Math.abs(drawdownDifference).toFixed(2)}%。`
          : `目前樣本下，現行規則比固定 80% 少 ${Math.abs(returnDifference).toFixed(2)}% 報酬，最大回撤也惡化 ${Math.abs(drawdownDifference).toFixed(2)}%。`;
  const allValues = result.strategies.flatMap((strategy) => strategy.values),
    min = Math.min(...allValues),
    max = Math.max(...allValues),
    width = 1000,
    height = 230,
    left = 42,
    right = 12,
    top = 14,
    bottom = 26,
    x = (index) =>
      left +
      (index / Math.max(1, result.dates.length - 1)) * (width - left - right),
    y = (value) =>
      top +
      ((max - value) / Math.max(0.0001, max - min)) * (height - top - bottom),
    gridValues = [max, (max + min) / 2, min];
  $("backtestChart").innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="動態策略與固定配置淨值曲線">${gridValues.map((value) => `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="2" y="${y(value) + 3}">${value.toFixed(1)}</text>`).join("")}${result.strategies.map((strategy) => `<polyline class="line ${strategy.key}" points="${strategy.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")}"/>`).join("")}<text x="${left}" y="${height - 5}">${result.dates[0].slice(5).replace("-", "/")}</text><text x="${width - right}" y="${height - 5}" text-anchor="end">${result.dates.at(-1).slice(5).replace("-", "/")}</text></svg>`;
  $("backtestTable").innerHTML =
    `<div class="backtest-row header"><span>策略</span><span>累積報酬</span><span>最大回撤</span><span>年化波動</span><span>累計換手</span><span>平均持股</span></div>${result.strategies.map((strategy) => `<div class="backtest-row"><strong>${strategy.name}</strong><span>${signed(strategy.metrics.cumulativeReturn)}</span><span>${signed(strategy.metrics.maxDrawdown)}</span><span>${strategy.metrics.annualVolatility.toFixed(2)}%</span><span>${strategy.metrics.turnover.toFixed(1)}%點</span><span>${strategy.metrics.averageAllocation.toFixed(1)}%</span></div>`).join("")}`;
}
function quantile(values, p) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p,
    lower = Math.floor(index),
    upper = Math.ceil(index);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function getAnnualArkRecords(
  records,
  year = Number(
    new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })
      .slice(0, 4),
  ),
) {
  return records
    .filter(
      (row) =>
        String(row.date).startsWith(`${year}-`) &&
        Number.isFinite(Number(row.arkAllocation)),
    )
    .map((row) => ({
      ...row,
      arkAllocation: Number(row.arkAllocation),
      taiwanIndex: Number(row.taiwanIndex),
      marginMaintenance:
        row.marginMaintenance !== "" &&
        row.marginMaintenance !== null &&
        Number.isFinite(Number(row.marginMaintenance))
          ? Number(row.marginMaintenance)
          : null,
      cnn:
        row.cnn !== "" && row.cnn !== null && Number.isFinite(Number(row.cnn))
          ? Number(row.cnn)
          : null,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function getAnnualArkLevelRecords(
  records,
  year,
  high = 80,
  low = 70,
) {
  return getAnnualArkRecords(records, year)
    .filter((row) => row.arkAllocation > high || row.arkAllocation <= low)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function calculateForwardIndexMetrics(records, entryDate, horizon = 40) {
  const start = records.findIndex((row) => row.date === entryDate),
    entryIndex = Number(records[start]?.taiwanIndex);
  if (start < 0 || !(entryIndex > 0))
    return {
      forwardReturns: { 5: null, 10: null, 20: null, 40: null },
      maxDrawdown: null,
      observedDays: 0,
      complete: false,
    };
  const forwardReturns = {};
  for (const days of [5, 10, 20, 40]) {
    const futureIndex = Number(records[start + days]?.taiwanIndex);
    forwardReturns[days] =
      futureIndex > 0 ? ((futureIndex - entryIndex) / entryIndex) * 100 : null;
  }
  const end = Math.min(records.length - 1, start + horizon);
  let peak = entryIndex,
    maxDrawdown = 0;
  for (let i = start; i <= end; i++) {
    const value = Number(records[i]?.taiwanIndex);
    if (!(value > 0)) continue;
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, ((value - peak) / peak) * 100);
  }
  return {
    forwardReturns,
    maxDrawdown,
    observedDays: end - start,
    complete: start + horizon < records.length,
  };
}
function buildArkLevelEvents(
  records,
  high = CONFIG.arkWaterLevels.upperDecile,
  low = CONFIG.arkWaterLevels.lowerDecile,
) {
  const events = [];
  let active = null;
  const kind = (row) =>
    row.arkAllocation >= high
      ? "HIGH"
      : row.arkAllocation <= low
        ? "LOW"
        : null;
  const close = (exit) => {
    if (!active) return;
    active.exit = exit || null;
    active.duration = active.rows.length;
    active.extreme =
      active.kind === "HIGH"
        ? active.rows.reduce((a, b) =>
            b.arkAllocation > a.arkAllocation ? b : a,
          )
        : active.rows.reduce((a, b) =>
            b.arkAllocation < a.arkAllocation ? b : a,
          );
    const startIndex = Number(active.entry.taiwanIndex),
      exitIndex = Number(active.exit?.taiwanIndex);
    active.indexChange =
      Number.isFinite(startIndex) &&
      startIndex !== 0 &&
      Number.isFinite(exitIndex)
        ? ((exitIndex - startIndex) / startIndex) * 100
        : null;
    active.forwardMetrics = calculateForwardIndexMetrics(
      records,
      active.entry.date,
    );
    events.push(active);
    active = null;
  };
  for (const row of records) {
    const rowKind = kind(row);
    if (!active && rowKind) {
      active = { kind: rowKind, entry: row, rows: [row] };
      continue;
    }
    if (active && rowKind === active.kind) {
      active.rows.push(row);
      continue;
    }
    if (active) {
      close(row);
      if (rowKind) active = { kind: rowKind, entry: row, rows: [row] };
    }
  }
  close(null);
  return events;
}
function summarizeArkEvents(events, kind) {
  const matching = events.filter((event) => event.kind === kind),
    horizons = [5, 10, 20, 40],
    forwardAverages = {},
    forwardCounts = {};
  for (const days of horizons) {
    const values = matching
      .map((event) => event.forwardMetrics?.forwardReturns?.[days])
      .filter(Number.isFinite);
    forwardCounts[days] = values.length;
    forwardAverages[days] = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }
  const drawdowns = matching
    .map((event) => event.forwardMetrics?.maxDrawdown)
    .filter(Number.isFinite);
  const completed = events.filter(
    (event) =>
      event.kind === kind && event.exit && Number.isFinite(event.indexChange),
  );
  return {
    count: completed.length,
    averageDuration: completed.length
      ? completed.reduce((sum, event) => sum + event.duration, 0) /
        completed.length
      : null,
    averageChange: completed.length
      ? completed.reduce((sum, event) => sum + event.indexChange, 0) /
        completed.length
      : null,
    positiveRate: completed.length
      ? (completed.filter((event) => event.indexChange > 0).length /
          completed.length) *
        100
      : null,
    forwardAverages,
    forwardCounts,
    averageMaxDrawdown: drawdowns.length
      ? drawdowns.reduce((sum, value) => sum + value, 0) / drawdowns.length
      : null,
    maxDrawdownCount: drawdowns.length,
  };
}
const formatIndex = (value) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 2 })
    : "—";
const formatDate = (value) =>
  value ? String(value).replaceAll("-", "/") : "尚未離開";
const arkLevelFilterState = { low: true, high: true };
function renderArkLevelRecords() {
  const highThreshold = 80,
    lowThreshold = 70,
    water = {
      upperDecile: highThreshold,
      lowerDecile: lowThreshold,
      year: new Date().getFullYear(),
    };
  const year = Number(
      new Date()
        .toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })
        .slice(0, 4),
    ),
    annual = getAnnualArkRecords(window.centralRecords || [], year),
    allLevels = getAnnualArkLevelRecords(annual, year, highThreshold, lowThreshold),
    levels = allLevels.filter((row) =>
      row.arkAllocation > highThreshold
        ? arkLevelFilterState.high
        : arkLevelFilterState.low,
    ),
    values = annual.map((row) => row.arkAllocation),
    events = buildArkLevelEvents(annual, highThreshold, lowThreshold),
    highSummary = summarizeArkEvents(events, "HIGH"),
    lowSummary = summarizeArkEvents(events, "LOW"),
    highCount = allLevels.filter((row) => row.arkAllocation > highThreshold).length,
    lowCount = allLevels.length - highCount;
  $("arkLevelCount").textContent =
    `${levels.length} 筆顯示 · 高 ${highCount}／低 ${lowCount}`;
  if (!annual.length) {
    $("arkLevelRecords").innerHTML =
      `<p class="note">${year} 年目前沒有可分析的方舟水位紀錄。</p>`;
    return;
  }
  const distribution = [
    ["最低", Math.min(...values)],
    ["中位數", quantile(values, 0.5)],
    ["最高", Math.max(...values)],
    ["前10%分界", quantile(values, 0.9)],
    ["後10%分界", quantile(values, 0.1)],
  ];
  const formatReturn = (value) =>
      Number.isFinite(value)
        ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
        : "資料不足",
    summaryCard = (label, summary, kind) =>
      `<div class="event-summary ${kind.toLowerCase()}"><span>${label} · 已完成 ${summary.count} 次</span><strong>${summary.count ? `平均 ${summary.averageDuration.toFixed(1)} 個交易日 · 大盤 ${summary.averageChange >= 0 ? "+" : ""}${summary.averageChange.toFixed(2)}%` : "尚無完整事件"}</strong><small>${summary.count ? `進入至離開期間大盤上漲比例 ${summary.positiveRate.toFixed(0)}%` : `需要出現進入與離開紀錄後才能統計`}</small><small>進入後平均報酬：5日 ${formatReturn(summary.forwardAverages[5])}（${summary.forwardCounts[5]}次） · 10日 ${formatReturn(summary.forwardAverages[10])}（${summary.forwardCounts[10]}次） · 20日 ${formatReturn(summary.forwardAverages[20])}（${summary.forwardCounts[20]}次） · 40日 ${formatReturn(summary.forwardAverages[40])}（${summary.forwardCounts[40]}次）</small><small>進入後最長40日平均最大回撤：${formatReturn(summary.averageMaxDrawdown)}（${summary.maxDrawdownCount}次）</small></div>`;
  $("arkLevelRecords").innerHTML =
    `<section class="ark-research-block"><h3>${year} 年水位分布</h3><div class="distribution-grid">${distribution.map(([label, value]) => `<div><span>${label}</span><strong>${pct(value, 1)}</strong></div>`).join("")}</div></section><section class="ark-research-block"><h3>極端水位日期明細</h3><div class="ark-level-row ark-level-head"><span>日期</span><span>台灣加權指數</span><span>方舟建議持股</span></div>${levels.map((row) => `<div class="ark-level-row"><span>${formatDate(row.date)}</span><strong>${formatIndex(row.taiwanIndex)}</strong><strong class="${row.arkAllocation >= water.upperDecile ? "level-high" : "level-low"}">${pct(row.arkAllocation, 1)}</strong></div>`).join("") || `<p class="note">目前沒有 ${water.upperDecile}% 以上或 ${water.lowerDecile}% 以下紀錄。</p>`}</section><section class="ark-research-block" hidden><h3>極端水位事件與歷史規律</h3><div class="event-summary-grid">${summaryCard(`高水位 ≥${water.upperDecile}%`, highSummary, "HIGH")}${summaryCard(`低水位 ≤${water.lowerDecile}%`, lowSummary, "LOW")}</div><div class="event-list">${
      events
        .slice()
        .reverse()
        .map(
          (event) =>
            `<article class="event-card ${event.kind.toLowerCase()}"><div class="event-card-head"><strong>${event.kind === "HIGH" ? "高水位事件" : "低水位事件"}</strong><span>${event.duration} 個交易日</span></div><dl><div><dt>進入日</dt><dd>${formatDate(event.entry.date)} · 大盤 ${formatIndex(event.entry.taiwanIndex)} · ARK ${pct(event.entry.arkAllocation, 1)}</dd></div><div><dt>區間${event.kind === "HIGH" ? "最高" : "最低"}</dt><dd>${formatDate(event.extreme.date)} · 大盤 ${formatIndex(event.extreme.taiwanIndex)} · ARK ${pct(event.extreme.arkAllocation, 1)}</dd></div><div><dt>離開日</dt><dd>${event.exit ? `${formatDate(event.exit.date)} · 大盤 ${formatIndex(event.exit.taiwanIndex)} · ARK ${pct(event.exit.arkAllocation, 1)}` : "尚未離開極端區間"}</dd></div><div><dt>區間大盤變化</dt><dd>${Number.isFinite(event.indexChange) ? `${event.indexChange >= 0 ? "+" : ""}${event.indexChange.toFixed(2)}%` : "事件進行中"}</dd></div><div><dt>進入後報酬</dt><dd>5日 ${formatReturn(event.forwardMetrics?.forwardReturns?.[5])} · 10日 ${formatReturn(event.forwardMetrics?.forwardReturns?.[10])} · 20日 ${formatReturn(event.forwardMetrics?.forwardReturns?.[20])} · 40日 ${formatReturn(event.forwardMetrics?.forwardReturns?.[40])}</dd></div><div><dt>${event.forwardMetrics?.complete ? "進入後40日最大回撤" : `截至最新（${event.forwardMetrics?.observedDays || 0}日）最大回撤`}</dt><dd>${formatReturn(event.forwardMetrics?.maxDrawdown)}</dd></div></dl></article>`,
        )
        .join("") || `<p class="note">目前尚未形成極端水位事件。</p>`
    }</div><p class="research-warning">報酬以事件進入日的大盤指數為基準，5／10／20／40日均指後續交易日；最大回撤計算進入日起最長40個交易日內，任一期間高點至其後低點的最大跌幅。資料未滿40日會標示「截至最新」。${water.year} 年策略分界：前 10% 為 ${water.upperDecile}%、後 10% 為 ${water.lowerDecile}%。歷史規律仍不能單獨視為買賣訊號。</p></section>`;
  const formatOptional = (value, suffix = "") =>
      value !== null && value !== "" && Number.isFinite(Number(value))
        ? `${Number(value).toFixed(1)}${suffix}`
        : "—",
    isLowCnn = (row) => Number.isFinite(row.cnn) && row.cnn <= 25,
    isLowMargin = (row) =>
      Number.isFinite(row.marginMaintenance) && row.marginMaintenance <= 166,
    isTripleSignal = (row) =>
      row.arkAllocation >= 80 && isLowCnn(row) && isLowMargin(row),
    detailBlock = $("arkLevelRecords").querySelectorAll(".ark-research-block")[1];
  detailBlock.innerHTML = `<div class="ark-level-title"><h3>極端水位日期明細</h3><div class="ark-level-filters"><label><input id="arkShowLow" type="checkbox" ${arkLevelFilterState.low ? "checked" : ""}> 顯示風控 70% 以下</label><label><input id="arkShowHigh" type="checkbox" ${arkLevelFilterState.high ? "checked" : ""}> 顯示風控 80% 以上</label></div></div><div class="ark-level-row ark-level-head"><span>日期</span><span>大盤指數</span><span>方舟持股</span><span>融資維持率</span><span>CNN</span></div>${levels.map((row) => `<div class="ark-level-row ${row.arkAllocation > highThreshold ? "level-high-row" : "level-low-row"} ${isTripleSignal(row) ? "triple-signal-row" : ""}"><span>${formatDate(row.date)}${isTripleSignal(row) ? '<em class="triple-signal-badge">三重訊號</em>' : ""}</span><strong>${formatIndex(row.taiwanIndex)}</strong><strong class="${row.arkAllocation > highThreshold ? "level-high" : "level-low"}">${pct(row.arkAllocation, 1)}</strong><strong class="${isLowMargin(row) ? "risk-alert" : ""}">${formatOptional(row.marginMaintenance, "%")}</strong><strong class="${isLowCnn(row) ? "risk-alert" : ""}">${formatOptional(row.cnn)}</strong></div>`).join("") || `<p class="note">目前沒有符合已勾選條件的紀錄。</p>`}`;
  $("arkShowLow")?.addEventListener("change", (event) => {
    arkLevelFilterState.low = event.target.checked;
    renderArkLevelRecords();
  });
  $("arkShowHigh")?.addEventListener("change", (event) => {
    arkLevelFilterState.high = event.target.checked;
    renderArkLevelRecords();
  });
}
function applyArkWaterLevelMultiplierPolicy(plan, input, d) {
  let scale = Math.max(0, Number(plan.dynamicScale || 0));
  const state = d.waterLevelState || arkWaterLevelState(input, d);
  if (
    !(plan.arkBaseTotal > 0) ||
    !(input.arkSuggestedCapital > 0) ||
    d.action !== "BUY"
  ) {
    return {
      ...plan,
      dynamicScale: d.action === "BUY" ? scale : 0,
      waterLevelMultiplierPolicy: "NONE",
    };
  }
  const similar = input.similarTrendAnalysis,
    stats = similar?.stats,
    gap = Math.max(0, Number(d.gap || 0)),
    gapBase = gap <= CONFIG.deadBand
      ? 0
      : 1 + 3 * (1 - Math.exp(-(gap - CONFIG.deadBand) / 6)),
    forecastUpRate = Number.isFinite(Number(stats?.combinedUpRate))
      ? Number(stats.combinedUpRate)
      : Number.isFinite(Number(stats?.market10?.upRate))
        ? Number(stats.market10.upRate)
        : 50,
    forecastAdjustment = stats
      ? clamp((forecastUpRate - 50) / 25, -1, 1)
      : 0,
    arkTrendAdjustment = clamp(Number(d.trend?.delta1D || 0) / 8, -0.4, 0.4);
  scale = gapBase + forecastAdjustment + arkTrendAdjustment;
  let policy = stats ? "SMOOTH_GAP_AND_FORECAST" : "SMOOTH_GAP";
  if (state.value < 70) {
    scale *= 0.75;
    policy = "LOWER_WATER_LEVEL_SMOOTH_BRAKE";
  }
  if (state.zone === "LOW" && state.direction === "FALLING") {
    scale = Math.min(scale, 1);
    policy = "LOW_FALLING_MAX_ONE_X";
  }
  const extremeMode = plan.buyMode === "EXTREME_DEPLOYMENT",
    multiplierCap = extremeMode
      ? CONFIG.maxBuyMultiplier
      : CONFIG.maxStandardBuyMultiplier,
    suggestedCapital = Math.max(0, Number(input.arkSuggestedCapital || 0)),
    dailyGapFillRate = clamp(
      0.12 + gap * 0.006 + forecastAdjustment * 0.02,
      0.1,
      0.3,
    ),
    dailyCapitalLimit =
      gap > 0
        ? suggestedCapital * dailyGapFillRate
        : 0;
  if (extremeMode) scale = Math.max(scale, Number(plan.dynamicScale || 0));
  scale = Math.min(scale, multiplierCap);
  if (!extremeMode && Number(plan.dynamicScale || 0) > multiplierCap)
    policy = "STANDARD_MAX_THREE_X";
  return {
    ...plan,
    dynamicScale: Math.floor(clamp(scale, 0, multiplierCap) * 100) / 100,
    dailyCapitalLimit: round(dailyCapitalLimit, 2),
    targetGapFillPercent: Math.min(
      Number(plan.targetGapFillPercent || 0),
      gap * dailyGapFillRate,
    ),
    waterLevelMultiplierPolicy: policy,
    similarTrendMultiplier: stats
      ? {
          cases: similar.caseCount,
          upRate10D: stats.market10.upRate,
          averageReturn10D: stats.market10.average,
          riskChange10D: stats.risk10Average,
          reaches85Rate: stats.reaches85Rate,
          gapBase,
          forecastUpRate,
          forecastDownRate: 100 - forecastUpRate,
          forecastAdjustment,
          arkTrendAdjustment,
          adjustment: forecastAdjustment + arkTrendAdjustment,
        }
      : null,
    dailyGapFillRate,
    dailyGapFillPercent: gap * dailyGapFillRate,
  };
}
function buildBuyV2Plan(input, d) {
  const date = $("decisionDate").value;
  const plan = window.BuyEngineV2.buildPlan(window.currentETFs || [], {
    arkTarget: input.todayArk,
    actualAllocation: input.actualAllocation,
    arkDelta1D: d.trend.delta1D,
    arkDelta3D: d.trend.delta3D,
    arkDelta5D: d.trend.delta5D,
    gapCapital: input.arkSuggestedCapital,
    priorPending: window.BuyEngineV2.loadPendingCapital(date),
    cnn: input.cnn,
    rsi: input.rsi,
    marginMaintenance: input.margin,
    marketPosition: input.marketPosition,
    urgency: d.urgency,
  });
  const year = Number(String(date).slice(0, 4)) || new Date().getFullYear(),
    month = Number(String(date).slice(5, 7)) || new Date().getMonth() + 1,
    similarTrendAnalysis = analyzeSimilarTrend(
      recordsWithCurrentMarket(
        window.centralRecords?.length ? window.centralRecords : SOURCE_RECORDS,
        input,
      ),
      year,
      marketSeasonalityCache[month],
    );
  const adjusted = applyArkWaterLevelMultiplierPolicy(
    plan,
    { ...input, similarTrendAnalysis },
    d,
  ),
    strategyMode = d.strategy?.mode,
    isExtremeBuy =
      strategyMode === window.ARKStrategyEngine.MODES.EXTREME_BUY,
    isBuy = d.action === "BUY" && Number(d.adjustmentPoints || 0) > 0,
    allocationGap = Math.max(
      0,
      Number(input.todayArk || 0) - Number(input.actualAllocation || 0),
    ),
    dailyGapFillCapRate =
      allocationGap > 0 ? Number(d.adjustmentPoints || 0) / allocationGap : 0,
    executionCapAmount = Math.max(
      0,
      isBuy ? Number(input.arkSuggestedCapital || 0) * dailyGapFillCapRate : 0,
    ),
    strategyPlan = {
      ...adjusted,
      buyMode: isExtremeBuy ? "EXTREME_DEPLOYMENT" : "NORMAL",
      targetGapFillPercent: Number(d.adjustmentPoints || 0),
      dailyGapFillPercent: Number(d.adjustmentPoints || 0),
      dailyGapFillRate: dailyGapFillCapRate,
      theoreticalExecution: executionCapAmount,
      newGapFill: executionCapAmount,
    },
    executionAtScale = (scale) => {
      const scaledPlan = { ...strategyPlan, dynamicScale: scale };
      return strategyPlan.orders.reduce((sum, item) => {
        const recommendation = calculateEtfRecommendedMultiplier(
          item,
          scaledPlan,
        );
        return (
          sum +
          Math.max(0, Number(item.positionAmount) || 0) *
            recommendation.multiplier
        );
      }, 0);
    };
  const scaleCap = isExtremeBuy ? 5 : 4;
  let cappedScale = 0;
  if (executionCapAmount > 0) {
    let low = 0,
      high = scaleCap;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = (low + high) / 2;
      if (executionAtScale(middle) <= executionCapAmount) low = middle;
      else high = middle;
    }
    cappedScale = Math.floor(low * 100) / 100;
  }
  const cappedPlan = {
      ...strategyPlan,
      dynamicScale: cappedScale,
      uncappedDynamicScale: Number(adjusted.dynamicScale || 0),
      dailyGapFillCapRate,
      executionCapAmount: round(executionCapAmount, 2),
      tripleExtremeSignal: isExtremeBuy,
      executionWasCapped: executionAtScale(scaleCap) > executionCapAmount,
      strategyMode,
    },
    effectiveExecution = cappedPlan.orders.reduce((sum, item) => {
      const recommendation = calculateEtfRecommendedMultiplier(item, cappedPlan);
      return (
        sum +
        Math.max(0, Number(item.positionAmount) || 0) *
          recommendation.multiplier
      );
    }, 0);
  return {
    ...cappedPlan,
    effectiveExecution: round(effectiveExecution, 2),
    pendingCapital: round(
      Math.max(0, cappedPlan.theoreticalExecution - effectiveExecution),
      2,
    ),
  };
}
function renderExecutionBuffer(plan) {
  return `Execution Buffer：本次待累積 NT$ ${Math.round(plan.pendingCapital).toLocaleString("zh-TW")}；只累積資金，隔日依最新 ARK 權重重新分配。`;
}
function renderExtremeMode(plan) {
  const factors = plan.extremeFactors || {},
    breakdown = `CNN ${Number(factors.cnn || 0).toFixed(2)}＋方舟水位 ${Number(factors.arkLevel || 0).toFixed(2)}＋水位轉折 ${Number(factors.arkTurn || 0).toFixed(2)}＋融資 ${Number(factors.margin || 0).toFixed(2)}`;
  return plan.buyMode === "EXTREME_DEPLOYMENT"
    ? `極端機會分數 ${plan.extremeScore}/9（${breakdown}）；分數越高，缺口填補與溢價容忍度越高，riskAmount 仍是單檔上限。`
    : `極端機會分數 ${plan.extremeScore}/9（${breakdown}），未達 4 分。`;
}
function renderDecisionExplanation(plan, input, d) {
  const modeZh = {
    NORMAL: "NORMAL 一般建倉",
    ACCELERATED: "ACCELERATED 加速建倉",
    EXTREME_DEPLOYMENT: "EXTREME 極端布局",
  }[plan.buyMode];
  if (plan.gap <= CONFIG.buyEngineV2.deadband)
    return "配置缺口位於 ±1% 無動作區間，不追求精確歸零。";
  if (d.action !== "BUY")
    return `共用策略目前判定為${d.action === "SELL" ? "調節" : "維持"}，不產生買進預算。`;
  return `${modeZh}：共用策略建議增加 ${Number(d.adjustmentPoints || 0).toFixed(2)} 個百分點，換算為本日總預算後，再依各檔 ETF 位階、槓桿上限與折溢價分配。${renderExecutionBuffer(plan)}`;
}
function renderBuyEngine(plan, input, d) {
  const modeZh = {
    NORMAL: "NORMAL 一般建倉",
    ACCELERATED: "ACCELERATED 加速建倉",
    EXTREME_DEPLOYMENT: "EXTREME 極端布局",
  }[plan.buyMode];
  $("buyEngineMetrics").innerHTML = [
    ["BUY MODE", modeZh],
    ["ARK TARGET", pct(input.todayArk)],
    ["ACTUAL", pct(input.actualAllocation, 2)],
    ["GAP", pp(plan.gap)],
    ["ARK TREND", pp(d.trend.delta1D)],
    ["BASE GAP FILL RATE", pct(plan.baseGapFillRate * 100, 0)],
    ["ARK TREND FACTOR", `×${plan.arkTrendFactor.toFixed(2)}`],
    ["MARKET FACTOR", `×${plan.marketFactor.toFixed(2)}`],
    ["TARGET GAP FILL", `${plan.targetGapFillPercent.toFixed(2)}%`],
    ["DYNAMIC SCALE", `×${plan.dynamicScale.toFixed(2)}`],
    [
      "DAILY GAP CAP",
      `${(Number(plan.dailyGapFillCapRate || 0) * 100).toFixed(0)}% · NT$ ${Math.round(plan.executionCapAmount || 0).toLocaleString("zh-TW")}`,
    ],
    [
      "SIMILAR TREND BASIS",
      plan.similarTrendMultiplier
        ? `綜合上漲 ${plan.similarTrendMultiplier.forecastUpRate.toFixed(0)}%／下跌 ${plan.similarTrendMultiplier.forecastDownRate.toFixed(0)}% · 機率調整 ${plan.similarTrendMultiplier.forecastAdjustment >= 0 ? "+" : ""}${plan.similarTrendMultiplier.forecastAdjustment.toFixed(2)}x`
        : "資料不足，依缺口計算",
    ],
    [
      "THEORETICAL EXECUTION",
      `NT$ ${Math.round(plan.theoreticalExecution).toLocaleString("zh-TW")}`,
    ],
    [
      "EFFECTIVE EXECUTION",
      `NT$ ${Math.round(plan.effectiveExecution).toLocaleString("zh-TW")}`,
    ],
    [
      "PENDING CAPITAL",
      `NT$ ${Math.round(plan.pendingCapital).toLocaleString("zh-TW")}`,
    ],
    ["EXTREME SCORE", `${plan.extremeScore} / 9`],
  ]
    .map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`)
    .join("");
  $("buyEngineExplanation").textContent = renderDecisionExplanation(
    plan,
    input,
    d,
  );
}
function calculateEtfRecommendedMultiplier(item, plan) {
  const globalScale = Math.max(0, Number(plan?.dynamicScale || 0)),
    leveraged = Boolean(item?.leveraged) || item?.assetType === "LEVERAGED_TW",
    nonLeveragedCap = plan?.buyMode === "EXTREME_DEPLOYMENT" ? 5 : 4,
    cappedScale = Math.min(globalScale, leveraged ? 3 : nonLeveragedCap),
    premium = Number(item?.premiumPercent ?? item?.premium ?? 0);
  let factor = 1,
    reason = premium <= 0 ? "折價／淨值內完整布局" : "小幅溢價完整布局";
  const extremeMode = plan?.buyMode === "EXTREME_DEPLOYMENT";
  if (premium > 1) {
    factor = 0;
    reason = "溢價超過 1%，等待淨值";
  } else if (extremeMode && premium > 0.3) {
    factor = window.BuyEngineV2.calculateExtremePremiumFactor(
      premium,
      plan.extremeScore,
    );
    reason = `極端模式依分數放寬溢價限制（保留 ${(factor * 100).toFixed(0)}% 倍率）`;
  } else if (premium > 0.5) {
    factor = Number(plan?.gap || 0) > 10 ? 0.25 : 0;
    reason = factor ? "缺口較大，僅布局四分之一" : "溢價偏高，等待淨值";
  } else if (premium > 0.3) {
    factor = 0.5;
    reason = "溢價 0.3%～0.5%，布局一半";
  }
  return {
    multiplier: Math.floor(cappedScale * factor * 100) / 100,
    factor,
    leveraged,
    reason: leveraged ? `${reason}；槓桿 ETF 上限 3x` : reason,
  };
}
function summarizePositionExecution(plan) {
  const multiplier = Math.max(0, Number(plan?.dynamicScale || 0)),
    baseAmount = (plan?.orders || []).reduce(
      (sum, item) => sum + Math.max(0, Number(item.positionAmount) || 0),
      0,
    ),
    totalAmount = (plan?.orders || []).reduce((sum, item) => {
      const recommendation = calculateEtfRecommendedMultiplier(item, plan);
      return (
        sum +
        Math.max(0, Number(item.positionAmount) || 0) *
          recommendation.multiplier
      );
    }, 0);
  return {
    multiplier,
    baseAmount: round(baseAmount, 2),
    totalAmount: Math.max(0, Math.round(totalAmount)),
  };
}
function calculateActualGapFill(input, d, plan, positionExecution) {
  const gap = Math.max(0, Number(d?.gap || 0)),
    gapCapital = Math.max(0, Number(input?.arkSuggestedCapital || 0)),
    executionAmount = Math.max(0, Number(positionExecution?.totalAmount || 0)),
    theoreticalPoints = Math.max(0, Number(plan?.targetGapFillPercent || 0));
  if (!(gap > 0) || !(gapCapital > 0) || !(executionAmount > 0)) {
    return {
      points: theoreticalPoints,
      share: gap > 0 ? (theoreticalPoints / gap) * 100 : 0,
      source: "THEORETICAL",
    };
  }
  const share = (executionAmount / gapCapital) * 100;
  return {
    points: gap * (share / 100),
    share,
    source: "ACTUAL_EXECUTION",
  };
}
function renderDashboard() {
  const input = getInput(),
    d = applyArkWaterLevelDecisionPolicy(input, calculateDecision(input)),
    plan = buildBuyV2Plan(input, d),
    positionExecution = summarizePositionExecution(plan),
    actualGapFill = calculateActualGapFill(input, d, plan, positionExecution),
    reduction = Math.max(0, input.actualAllocation - d.target);
  plan.actualGapFillPercent = actualGapFill.points;
  plan.actualGapFillShare = actualGapFill.share;
  d._v2Plan = plan;
  window.currentDecision = d;
  $("arkTarget").textContent = pct(input.todayArk);
  $("actualValue").textContent = pct(input.actualAllocation, 2);
  $("gapValue").textContent = pp(d.gap);
  $("gapLabel").textContent =
    Math.abs(d.gap) <= 1 ? "無動作區間" : d.gap > 0 ? "配置不足" : "配置超額";
  $("trendValue").textContent = pp(d.trend.delta1D);
  $("drawdownValue").textContent = pp(d.trend.drawdown);
  $("regimeValue").textContent = regimeZh(d.regime);
  $("actionValue").textContent =
    d.action === "BUY"
      ? positionExecution.totalAmount > 0
        ? "累積建倉"
        : "等待 ETF 截圖"
      : d.action === "SELL"
        ? regimeZh(d.regime)
        : "今日不交易";
  $("speedValue").textContent =
    d.action === "BUY"
      ? plan.buyMode === "EXTREME_DEPLOYMENT"
        ? `極端 ×${Math.min(positionExecution.multiplier, 5).toFixed(2)} · 槓桿最高 ×3`
        : `一般 ×${Math.min(positionExecution.multiplier, 4).toFixed(2)} · 槓桿最高 ×3`
      : d.action === "SELL"
        ? `${d.strategy?.mode === window.ARKStrategyEngine.MODES.ACCELERATED_SELL ? "加速" : "一般"}調節 ${d.adjustmentPoints.toFixed(2)}%`
        : "0";
  $("targetExecution").textContent =
    d.action === "SELL"
      ? `預計降低 ${reduction.toFixed(2)}% · ${input.actualAllocation.toFixed(2)}% → ${d.target.toFixed(2)}%`
      : d.action === "BUY"
        ? `${plan.buyMode === "EXTREME_DEPLOYMENT" ? "極端模式 · " : ""}今日實際填補約 ${actualGapFill.points.toFixed(2)} 個百分點（剩餘缺口的 ${actualGapFill.share.toFixed(0)}%）`
        : pct(d.target, 2);
  $("targetCapital").textContent =
    d.action === "BUY"
      ? positionExecution.baseAmount > 0
        ? `NT$ ${positionExecution.totalAmount.toLocaleString("zh-TW")}`
        : "待辨識 ETF 位階資料"
      : d.action === "SELL"
        ? input.arkSuggestedCapital < 0
          ? `NT$ ${Math.round(input.arkSuggestedCapital).toLocaleString("zh-TW")}`
          : "請輸入負數調節金額"
        : "—";
  $("executionSpeed").textContent =
    d.action === "BUY"
      ? plan.buyMode === "EXTREME_DEPLOYMENT"
        ? `極端補倉：缺口 75%、單日最高 3 個百分點；今日單檔倍率 ×${positionExecution.multiplier.toFixed(2)}`
        : `一般補倉：距 80% 缺口的 10%、單日最高 3 個百分點；今日單檔倍率 ×${positionExecution.multiplier.toFixed(2)}`
      : d.action === "SELL"
        ? `${d.strategy?.mode === window.ARKStrategyEngine.MODES.ACCELERATED_SELL ? "35% 計算、單日最高 4%" : "50% 計算、單日最高 2%"}`
        : "不交易";
  $("urgencyScore").textContent = `${d.urgency} / 100`;
  $("actionBadge").textContent = actionZh(d.action);
  $("actionBadge").className = `badge ${d.action.toLowerCase()}`;
  $("decisionReasons").innerHTML = decisionReasons(input, d)
    .map((x) => `<li>${x}</li>`)
    .join("");
  $("trendSummary").textContent = buildTrendSummary(d, input);
  [1, 2, 3, 5].forEach(
    (n) => ($("delta" + n + "D").textContent = pp(d.trend[`delta${n}D`])),
  );
  renderBuyEngine(plan, input, d);
  renderSparkline(input);
  renderSimilarTrendAnalysis(input);
  renderStrategyValidation();
  renderArkLevelRecords();
  renderETFExecution();
  persistState();
}
function renderETFExecution() {
  const plan =
      window.currentDecision?._v2Plan ||
      buildBuyV2Plan(
        getInput(),
        window.currentDecision || calculateDecision(getInput()),
      ),
    multiplier = Math.max(0, Number(plan.dynamicScale || 0)),
    hasAppliedETFs = (window.currentETFs || []).length > 0,
    formatShares = (value) =>
      value === null
        ? "—"
        : Number.isInteger(value)
          ? value.toLocaleString("zh-TW")
          : round(value, 2).toLocaleString("zh-TW", {
              maximumFractionDigits: 2,
            }),
    formatMoney = (value) =>
      value === null ? "—" : `NT$ ${Math.round(value).toLocaleString("zh-TW")}`,
    orders = (plan.orders || []).map((o) => {
      const positionShares = finiteOrNull(o.positionShares),
        positionAmount = finiteOrNull(o.positionAmount),
        recommendation = calculateEtfRecommendedMultiplier(o, plan),
        itemMultiplier = recommendation.multiplier,
        actualShares =
          positionShares === null
            ? null
            : round(positionShares * itemMultiplier, 2),
        actualAmount =
          positionAmount === null
            ? null
            : Math.max(0, Math.round(positionAmount * itemMultiplier));
      return {
        ...o,
        positionShares,
        positionAmount,
        itemMultiplier,
        multiplierReason: recommendation.reason,
        actualShares,
        actualAmount,
      };
    });
  $("etfCards").innerHTML = !hasAppliedETFs
    ? ""
    : `<div class="etf-result-table" role="table" aria-label="ETF 代入結果"><div class="etf-result-row etf-result-head" role="row"><span>股票名稱／代號</span><span>實際股數／實際金額</span><span>位階股數／位階金額</span></div>${orders
        .map((o) => {
          const multiplierText = Number(o.itemMultiplier.toFixed(2)).toString(),
            positionSharesText = formatShares(o.positionShares),
            actualSharesText = formatShares(o.actualShares),
            positionMoneyText = formatMoney(o.positionAmount),
            actualMoneyText = formatMoney(o.actualAmount),
            shareFormula =
              o.positionShares === null
                ? "—"
                : `${positionSharesText} × ${multiplierText} = ${actualSharesText} 股`,
            moneyFormula =
              o.positionAmount === null
                ? "—"
                : `${positionMoneyText} × ${multiplierText} = ${actualMoneyText}`;
          return `<div class="etf-result-row" role="row"><div class="etf-result-cell etf-stock-cell"><strong>${escapeHtml(o.name || ETF_NAME_BY_SYMBOL[o.symbol] || "")}</strong><small>${escapeHtml(o.symbol)}</small></div><div class="etf-result-cell etf-actual-cell"><strong>${shareFormula}</strong><small>${moneyFormula}</small><em>${escapeHtml(o.multiplierReason)}</em></div><div class="etf-result-cell"><strong>${positionSharesText === "—" ? "—" : `${positionSharesText} 股`}</strong><small>${positionMoneyText}</small></div></div>`;
        })
        .join("")}</div>`;
}
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.storageKeys.history) || "[]");
  } catch {
    return [];
  }
}
function saveDailySnapshot(force = false) {
  const history = loadHistory(),
    date = $("decisionDate").value,
    index = history.findIndex((x) => x.date === date);
  if (index >= 0 && !force && !confirm("今天已有紀錄，是否更新今日資料？"))
    return;
  const input = getInput(),
    d = window.currentDecision,
    plan = d._v2Plan,
    snapshot = {
      date,
      ark: input.todayArk,
      arkTarget: input.todayArk,
      taiwanIndex: input.currentTaiwanIndex,
      actual: input.actualAllocation,
      actualAllocation: input.actualAllocation,
      gap: d.gap,
      regime: d.regime,
      buyMode: plan?.buyMode,
      baseGapFillRate: plan?.baseGapFillRate,
      arkTrendFactor: plan?.arkTrendFactor,
      marketFactor: plan?.marketFactor,
      dynamicScale: plan?.dynamicScale,
      theoreticalExecution: plan?.theoreticalExecution,
      effectiveExecution: plan?.effectiveExecution,
      pendingCapital: plan?.pendingCapital,
      extremeOpportunityScore: plan?.extremeScore,
      arkDelta1D: d.trend.delta1D,
      arkDelta3D: d.trend.delta3D,
      arkDelta5D: d.trend.delta5D,
      buyMultiplier: d.action === "BUY" ? plan?.dynamicScale || 0 : 0,
      sellFillRate: d.action === "SELL" ? d.rate : 0,
      suggestedExecution: d.target,
      arkSuggestedCapital: input.arkSuggestedCapital,
      marketIndicators: {
        taiwanIndex: input.currentTaiwanIndex,
        cnn: input.cnn,
        rsi: input.rsi,
        margin: input.margin,
        marketPosition: input.marketPosition,
        bias20D: null,
        marketPercentile: null,
        vix: null,
      },
      strategyVersion: CONFIG.strategyVersion,
      etfDecisions: (plan?.orders || []).map((o) => ({
        symbol: o.symbol,
        nav: o.nav,
        premium: o.premiumPercent,
        positionShares: o.positionShares,
        positionAmount: o.positionAmount,
        riskShares: o.riskShares,
        riskAmount: o.riskAmount,
        calculatedAmount: o.calculatedAmount,
        effectiveAmount: o.effectiveAmount,
        finalShares: o.finalShares,
        premiumStatus: o.premiumStatus,
        concentrationStatus: o.concentrationStatus,
        executionStatus: o.executionStatus,
      })),
    };
  if (index >= 0) history[index] = snapshot;
  else history.push(snapshot);
  history.sort((a, b) => a.date.localeCompare(b.date));
  localStorage.setItem(
    CONFIG.storageKeys.history,
    JSON.stringify(history.slice(-CONFIG.historyLimit)),
  );
  if (plan) window.BuyEngineV2.savePendingCapital(plan.pendingCapital, date);
  $("saveMessage").textContent =
    index >= 0 ? "今日紀錄已更新。" : "今日紀錄已儲存。";
  renderHistory();
}
function renderHistory() {
  const h = loadHistory();
  $("historyCount").textContent = `${h.length} / ${CONFIG.historyLimit}`;
  $("historyCards").innerHTML =
    h
      .slice(-8)
      .reverse()
      .map(
        (x) =>
          `<div class="history-row"><span>${x.date}</span><span>ARK <strong>${pct(x.ark)}</strong></span><span>實際配置 <strong>${pct(x.actual, 2)}</strong></span><span>缺口 <strong>${pp(x.gap)}</strong></span><span>狀態 <strong>${regimeZh(x.regime)}</strong></span><span>目標配置 <strong>${pct(x.suggestedExecution, 2)}</strong></span><span>${x.strategyVersion}</span></div>`,
      )
      .join("") || `<p class="note">目前尚無已儲存的紀錄。</p>`;
}
function persistState() {
  const ids = [
    "yesterdayArk",
    "ark3D",
    "ark5D",
    "peak10D",
    "cnn",
    "rsi",
    "margin",
    "marketPosition",
  ];
  const state = Object.fromEntries(ids.map((id) => [id, $(id).value]));
  localStorage.setItem(CONFIG.storageKeys.state, JSON.stringify(state));
}
function restoreState() {
  const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Taipei",
    }),
    defaults = {
      yesterdayArk: 76.6,
      ark3D: 78.2,
      ark5D: 79,
      peak10D: 79,
      cnn: 50,
      rsi: 50,
      margin: 0,
      marketPosition: "MID",
    };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(CONFIG.storageKeys.state) || "{}");
  } catch {}
  Object.entries({ ...defaults, ...saved }).forEach(([k, v]) => {
    if ($(k)) $(k).value = v;
  });
  [
    "todayArk",
    "currentTaiwanIndex",
    "actualAllocation",
    "arkSuggestedCapital",
  ].forEach((id) => ($(id).value = ""));
  $("decisionDate").value = today;
  $("decisionDateDisplay").textContent = today.replaceAll("-", "/");
  window.centralRecords = SOURCE_RECORDS;
  window.currentETFs = [];
}
function toETF(a) {
  return migrateETF({
    symbol: a[0],
    name: a[1],
    nav: a[2],
    premium: a[3],
    arkShares: a[4],
    positionCapital: Math.round(a[2] * a[4]),
    currentWeight: a[5],
    assetType: a[6],
    leverage: a[7],
    exposureGroup: a[8],
  });
}
function migrateETF(etf) {
  const meta = window.BuyEngineV2.ETF_MASTER[etf.symbol] || {};
  return {
    ...etf,
    ...meta,
    name: meta.name || etf.name || "",
    riskShares: etf.riskShares ?? null,
    riskAmount: etf.riskAmount ?? null,
    valueTag: etf.valueTag ?? null,
    heatingTag: etf.heatingTag ?? null,
    leverage: meta.leveraged ? 2 : etf.leverage || 1,
  };
}
function loadSample() {
  window.currentETFs = SAMPLE_ETFS.map(toETF);
  localStorage.setItem(
    CONFIG.storageKeys.etfs,
    JSON.stringify(window.currentETFs),
  );
  renderETFExecution();
}
function runSelfTests() {
  const tests = [];
  const test = (name, fn) => {
    try {
      tests.push([name, Boolean(fn())]);
    } catch {
      tests.push([name, false]);
    }
  };
  const base = {
    cnn: 50,
    rsi: 50,
    marketPosition: "MID",
    previousRegime: "HOLD",
    strategyState: {},
  };
  test("無動作區間會回傳觀望不動", () =>
    calculateDecision({
      ...base,
      todayArk: 73,
      actualAllocation: 73,
      arkHistory: [73, 73, 73, 73, 73, 73, 73],
    }).regime === "HOLD");
  test("配置不足會回傳買進", () =>
    calculateDecision({
      ...base,
      todayArk: 80,
      actualAllocation: 70,
      arkHistory: [78, 78, 79, 79, 80, 80, 80],
    }).action === "BUY");
  test("大缺口每日填補率為10%", () =>
    window.BuyEngineV2.calculateBaseGapFillRate(22.15) === 0.1);
  test("A 高於 70 時不因高水位回落直接調節", () =>
    calculateDecision({
      ...base,
      todayArk: 81,
      actualAllocation: 84,
      arkHistory: [87, 87, 87, 87, 87, 84],
    }).regime === "HOLD");
  test("A 高於 70 時即使回撤 8% 仍維持", () =>
    calculateDecision({
      ...base,
      todayArk: 79,
      actualAllocation: 84,
      arkHistory: [87, 87, 87, 87, 87, 83],
    }).regime === "HOLD");
  test("溢價高於 0.5% 不會一律等待", () =>
    calculatePremiumDecision({ premium: 0.8 }, 90, 1).status !==
    "WAIT FOR NAV");
  test("達集中度上限會停止加碼", () =>
    calculateConcentrationFactor({
      currentWeight: 12,
      leverage: 1,
      assetType: "TAIWAN_EQUITY",
    }) === 0);
  test("最終委託不超過執行預算", () => {
    const d = calculateDecision({
      ...base,
      todayArk: 80,
      actualAllocation: 70,
      arkHistory: [76, 77, 78, 79, 80, 80, 80],
    });
    const r = reconcileExecutionBudget(
      calculateETFOrders(SAMPLE_ETFS.map(toETF), d),
      d,
    );
    return r.total <= r.globalTarget + 0.01;
  });
  test("本機儲存與載入正常", () => {
    const k = "arkStrategyLab.test";
    localStorage.setItem(k, "ok");
    const ok = localStorage.getItem(k) === "ok";
    localStorage.removeItem(k);
    return ok;
  });
  test("同日紀錄可更新而不重複", () => {
    const a = [{ date: "2026-01-01" }],
      i = a.findIndex((x) => x.date === "2026-01-01");
    a[i] = { date: "2026-01-01", updated: true };
    return a.length === 1 && a[0].updated;
  });
  test("小幅超額未達必要門檻時不調節", () => {
    const d = calculateDecision({
      ...base,
      todayArk: 70.4,
      actualAllocation: 72,
      arkHistory: [79, 78, 77, 76, 74, 73.6],
    });
    return d.action === "HOLD";
  });
  test("小幅超額維持原持股", () => {
    const d = calculateDecision({
      ...base,
      todayArk: 70.4,
      actualAllocation: 72,
      arkHistory: [79, 78, 77, 76, 74, 73.6],
    });
    return d.target === 72;
  });
  test("今日執行金額等於位階布局金額乘倍率", () =>
    summarizePositionExecution({
      dynamicScale: 5,
      buyMode: "EXTREME_DEPLOYMENT",
      extremeScore: 9,
      orders: [{ positionAmount: 57 }, { positionAmount: 80 }],
    }).totalAmount === 685);
  test("A 等於 70 不啟動調節", () => {
    const d = calculateDecision({
      ...base,
      todayArk: 70,
      actualAllocation: 76,
      arkHistory: [79, 79, 79, 78, 74, 72],
    });
    return d.action === "HOLD";
  });
  test("A 低於 80 時不啟動一般補倉", () =>
    calculateDecision({
      ...base,
      todayArk: 70,
      actualAllocation: 67,
      arkHistory: [75, 74, 73, 72, 71, 72],
    }).regime === "HOLD");
  test("A 低於 80 時即使缺口 10% 仍維持", () => {
    const d = calculateDecision({
      ...base,
      todayArk: 70,
      actualAllocation: 60,
      arkHistory: [76, 75, 74, 73, 72, 73.2],
    });
    return d.regime === "HOLD" && d.action === "HOLD";
  });
  test("A 低於 80 時不因超大缺口買進", () => {
    const d = calculateDecision({
      ...base,
      todayArk: 70.4,
      actualAllocation: 20,
      arkHistory: [79, 78, 77, 76, 74, 73.6],
    });
    return d.regime === "HOLD" && d.target === 20;
  });
  test("A 低於 80 時單日快速下降仍不建立買單", () =>
    calculateDecision({
      ...base,
      todayArk: 70,
      actualAllocation: 20,
      arkHistory: [81, 80, 79, 78, 77, 77],
    }).regime === "HOLD");
  test("年度方舟水位只保留高於 80% 與 70% 以下", () => {
    const rows = getAnnualArkLevelRecords(
      [
        { date: "2026-01-01", arkAllocation: 80.1 },
        { date: "2026-01-02", arkAllocation: 80 },
        { date: "2026-01-03", arkAllocation: 70 },
        { date: "2026-01-04", arkAllocation: 70.1 },
      ],
      2026,
    );
    return rows.length === 2;
  });
  test("連續極端日期會合併成事件", () => {
    const rows = getAnnualArkRecords(
        [
          { date: "2026-01-01", arkAllocation: 81, taiwanIndex: 100 },
          { date: "2026-01-02", arkAllocation: 82, taiwanIndex: 102 },
          { date: "2026-01-03", arkAllocation: 79, taiwanIndex: 101 },
        ],
        2026,
      ),
      events = buildArkLevelEvents(rows);
    return (
      events.length === 1 &&
      events[0].duration === 2 &&
      events[0].extreme.arkAllocation === 82 &&
      events[0].exit.date === "2026-01-03"
    );
  });
  test("極端水位事件會計算進入後5至40日報酬", () => {
    const rows = Array.from({ length: 41 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        arkAllocation: i === 0 ? 64 : 70,
        taiwanIndex: 100 + i,
      })),
      event = buildArkLevelEvents(rows)[0];
    return (
      event.forwardMetrics.forwardReturns[5] === 5 &&
      event.forwardMetrics.forwardReturns[10] === 10 &&
      event.forwardMetrics.forwardReturns[20] === 20 &&
      event.forwardMetrics.forwardReturns[40] === 40 &&
      event.forwardMetrics.complete
    );
  });
  test("最大回撤使用進入後期間高點至後續低點", () => {
    const metrics = calculateForwardIndexMetrics(
      [
        { date: "2026-01-01", taiwanIndex: 100 },
        { date: "2026-01-02", taiwanIndex: 110 },
        { date: "2026-01-03", taiwanIndex: 99 },
      ],
      "2026-01-01",
    );
    return Math.abs(metrics.maxDrawdown + 10) < 0.0001;
  });
  test("辨識幾列就保留幾列，不自動補ETF", () =>
    mergeOcrRows([]).length === 0 &&
    mergeOcrRows([
      { symbol: "0050", nav: 100, arkShares: 1, positionCapital: 100 },
    ]).length === 1);
  test("影像原始金額不被策略層重寫", () =>
    mergeOcrRows([
      { symbol: "00631L", nav: 37.62, arkShares: 3, positionCapital: 999 },
    ])[0].positionCapital === 999);
  test("已辨識且與布局金額吻合的股數不改寫", () =>
    mergeOcrRows([
      { symbol: "0056", nav: 56.93, arkShares: 1, positionCapital: 57 },
    ])[0].arkShares === 1);
  test("手機誤讀且與布局金額衝突的股數會校正", () =>
    mergeOcrRows([
      { symbol: "0056", nav: 56.93, arkShares: 7, positionCapital: 57 },
    ])[0].arkShares === 1);
  test("手機漏讀位階股數時可由吻合金額補回", () =>
    mergeOcrRows([
      { symbol: "0056", nav: 56.8, arkShares: null, positionCapital: 57 },
    ])[0].arkShares === 1);
  test("手機將零布局金額誤讀成極小值時校正為0股0元", () => {
    const row = mergeOcrRows([
      { symbol: "0057", nav: 332.03, arkShares: null, positionCapital: 5 },
    ])[0];
    return row.arkShares === 0 && row.positionCapital === 0;
  });
  test("OCR 代碼單字元誤差可校正", () =>
    extractKnownOcrSymbol("00651L") === "00631L");
  test("OCR 漏掉槓桿ETF尾碼可校正", () =>
    extractKnownOcrSymbol("00631") === "00631L");
  test("市場接近區間高檔且指標偏熱會預測高點", () =>
    predictMarketPosition(
      [
        { taiwanIndex: 90 },
        { taiwanIndex: 92 },
        { taiwanIndex: 94 },
        { taiwanIndex: 96 },
        { taiwanIndex: 100 },
      ],
      { todayArk: 70, cnn: 75, rsi: 72 },
    ).value === "HIGH");
  test("市場接近區間低檔且 ARK 高水位會預測低點", () =>
    predictMarketPosition(
      [
        { taiwanIndex: 100 },
        { taiwanIndex: 98 },
        { taiwanIndex: 96 },
        { taiwanIndex: 94 },
        { taiwanIndex: 90 },
      ],
      { todayArk: 82, cnn: 50, rsi: 50 },
    ).value === "LOW");
  test("當下大盤與今日ARK會覆寫同日同步紀錄", () => {
    const date = $("decisionDate").value,
      rows = recordsWithCurrentMarket(
        [{ date, arkAllocation: 60, taiwanIndex: 100 }],
        { todayArk: 70, currentTaiwanIndex: 120 },
      );
    return (
      rows.length === 1 &&
      rows[0].arkAllocation === 70 &&
      rows[0].taiwanIndex === 120
    );
  });
  test("試算表最後日期不是今天時最後一筆視為昨日", () => {
    const values = getArkLookbackValues(
      [
        { date: "2026-10-01", arkAllocation: 71 },
        { date: "2026-10-02", arkAllocation: 72 },
        { date: "2026-10-03", arkAllocation: 73 },
        { date: "2026-10-06", arkAllocation: 74 },
        { date: "2026-10-07", arkAllocation: 75 },
      ],
      "2026-10-08",
    );
    return (
      values.yesterday === 75 &&
      values.threeDaysAgo === 73 &&
      values.fiveDaysAgo === 71
    );
  });
  test("試算表已有今天資料時會從前一交易日開始回看", () => {
    const values = getArkLookbackValues(
      [
        { date: "2026-10-01", arkAllocation: 71 },
        { date: "2026-10-02", arkAllocation: 72 },
        { date: "2026-10-03", arkAllocation: 73 },
        { date: "2026-10-06", arkAllocation: 74 },
        { date: "2026-10-07", arkAllocation: 75 },
        { date: "2026-10-08", arkAllocation: 76 },
      ],
      "2026-10-08",
    );
    return (
      values.yesterday === 75 &&
      values.threeDaysAgo === 73 &&
      values.fiveDaysAgo === 71
    );
  });
  test("休市日會選擇最近一個開盤日資料", () => {
    const latest = findLatestTradingRecord(
      [
        { date: "2026-10-22", arkAllocation: 70 },
        { date: "2026-10-23", arkAllocation: 72 },
        { date: "2026-10-26", arkAllocation: 73 },
      ],
      "2026-10-25",
    );
    return latest?.date === "2026-10-23";
  });
  test("相似趨勢會接出歷史相似點後十日走向", () => {
    const historical = Array.from({ length: 75 }, (_, index) => {
        const day = index % 15,
          month = Math.floor(index / 25) + 1,
          monthDay = (index % 25) + 1;
        return {
          date: `2026-${String(month).padStart(2, "0")}-${String(monthDay).padStart(2, "0")}`,
          arkAllocation: 60 + day * 1.2 + Math.sin(day) * 2,
          cnn: 35 + day * 1.8 + Math.cos(day) * 3,
          taiwanIndex: 18000 * 1.04 ** Math.floor(index / 15) + day * 90,
        };
      }),
      current = historical.slice(0, 5).map((row, index) => ({
        ...row,
        date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      })),
      result = analyzeSimilarTrend([...historical, ...current], 2026);
    return (
      result?.caseCount === 5 &&
      result.stats.market10.upRate === 100 &&
      result.stats.market10.average > 0 &&
      result.scenarios.combined.marketPath.length === 11 &&
      Number.isFinite(result.scenarios.combined.forecast.market10)
    );
  });
  test("當下大盤新高會進入市場位置判斷", () => {
    const date = $("decisionDate").value,
      rows = recordsWithCurrentMarket(
        [
          { date: "2026-10-01", arkAllocation: 68, taiwanIndex: 100 },
          { date: "2026-10-02", arkAllocation: 69, taiwanIndex: 102 },
          { date: "2026-10-03", arkAllocation: 69, taiwanIndex: 104 },
          { date: "2026-10-04", arkAllocation: 70, taiwanIndex: 106 },
        ],
        { todayArk: 70, currentTaiwanIndex: 120 },
      ),
      prediction = predictMarketPosition(rows, {
        todayArk: 70,
        cnn: 75,
        rsi: 72,
      });
    return rows.at(-1).date === date && prediction.value === "HIGH";
  });
  test("超大低配不因跨過20%門檻突然降至1倍", () => {
    const input = {
        todayArk: 66.8,
        actualAllocation: 20,
        arkSuggestedCapital: 10000,
      },
      d = {
        action: "BUY",
        gap: 46.8,
        trend: { delta1D: -1 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "FALLING",
          value: 66.8,
          levels: CONFIG.arkWaterLevels,
        },
      },
      plan = applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 3, arkBaseTotal: 1000 },
        input,
        d,
      );
    return plan.dynamicScale > 2.8;
  });
  test("一般缺口依平滑曲線計算倍率", () => {
    const input = {
        todayArk: 72,
        actualAllocation: 65,
        arkSuggestedCapital: 10000,
      },
      d = {
        action: "BUY",
        gap: 7,
        trend: { delta1D: 0.2 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "RISING",
          value: 72,
          levels: CONFIG.arkWaterLevels,
        },
      },
      plan = applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 1, arkBaseTotal: 1000 },
        input,
        d,
      );
    return plan.dynamicScale > 2.8 && plan.dynamicScale < 3;
  });
  test("ARK前10%高水位且大缺口會提高至4倍", () => {
    const input = {
        todayArk: 87.4,
        actualAllocation: 20,
        arkSuggestedCapital: 10000,
      },
      d = {
        action: "BUY",
        gap: 67.4,
        trend: { delta1D: 1 },
        waterLevelState: {
          zone: "HIGH",
          direction: "RISING",
          value: 87.4,
          levels: CONFIG.arkWaterLevels,
        },
      };
    return (
      applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 1, arkBaseTotal: 1000 },
        input,
        d,
      ).dynamicScale === 4
    );
  });
  test("小缺口即使高水位續升也不過度放大", () => {
    const input = {
        todayArk: 87.4,
        actualAllocation: 84.4,
        arkSuggestedCapital: 10000,
      },
      d = {
        action: "BUY",
        gap: 3,
        trend: { delta1D: 1 },
        waterLevelState: {
          zone: "HIGH",
          direction: "RISING",
          value: 87.4,
          levels: CONFIG.arkWaterLevels,
        },
      };
    return (
      applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 1, arkBaseTotal: 1000 },
        input,
        d,
      ).dynamicScale < 2.1
    );
  });
  test("只有極端機會模式可使用5倍", () => {
    const input = {
        todayArk: 87.4,
        actualAllocation: 84.4,
        arkSuggestedCapital: 10000,
      },
      d = {
        action: "BUY",
        gap: 3,
        trend: { delta1D: 1 },
        waterLevelState: {
          zone: "HIGH",
          direction: "RISING",
          value: 87.4,
          levels: CONFIG.arkWaterLevels,
        },
      };
    return (
      applyArkWaterLevelMultiplierPolicy(
        {
          dynamicScale: 5,
          arkBaseTotal: 1000,
          buyMode: "EXTREME_DEPLOYMENT",
        },
        input,
        d,
      ).dynamicScale === 5
    );
  });
  test("每日填補比例隨缺口平滑增加", () => {
    const input = {
        todayArk: 76,
        actualAllocation: 64,
        arkSuggestedCapital: 120000,
      },
      d = {
        action: "BUY",
        gap: 12,
        trend: { delta1D: 3 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "RISING",
          value: 76,
          levels: CONFIG.arkWaterLevels,
        },
      },
      plan = applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 5, arkBaseTotal: 10000, buyMode: "ACCELERATED" },
        input,
        d,
      );
    return (
      plan.dynamicScale > 3.8 &&
      plan.dailyCapitalLimit === 23040 &&
      plan.dailyGapFillPercent > 2
    );
  });
  test("相同條件下缺口越大倍率不會越低", () => {
    const input = {
        todayArk: 79,
        arkSuggestedCapital: 100000,
      },
      makeDecision = (gap) => ({
        action: "BUY",
        gap,
        trend: { delta1D: -1.3 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "FALLING",
          value: 79,
          levels: CONFIG.arkWaterLevels,
        },
      }),
      smaller = applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 1, arkBaseTotal: 4555 },
        input,
        makeDecision(19),
      ),
      larger = applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 1, arkBaseTotal: 4555 },
        input,
        makeDecision(21.5),
      );
    return larger.dynamicScale >= smaller.dynamicScale;
  });
  test("未來上漲機率提高倍率、下跌機率降低倍率", () => {
    const baseStats = {
        market10: { upRate: 50, average: 0 },
        risk10Average: 0,
        reaches85Rate: 0,
      },
      input = {
        todayArk: 79,
        actualAllocation: 60,
        arkSuggestedCapital: 100000,
      },
      decision = {
        action: "BUY",
        gap: 19,
        trend: { delta1D: 0 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "FLAT",
          value: 79,
          levels: CONFIG.arkWaterLevels,
        },
      },
      withProbability = (combinedUpRate) =>
        applyArkWaterLevelMultiplierPolicy(
          { dynamicScale: 1, arkBaseTotal: 4555 },
          {
            ...input,
            similarTrendAnalysis: {
              caseCount: 5,
              stats: { ...baseStats, combinedUpRate },
            },
          },
          decision,
        ).dynamicScale;
    return withProbability(70) > withProbability(50) && withProbability(50) > withProbability(30);
  });
  test("逐檔倍率會套用溢價折減與槓桿上限", () => {
    const plan = { dynamicScale: 4, gap: 14, buyMode: "ACCELERATED" };
    return (
      calculateEtfRecommendedMultiplier({ premiumPercent: 0.2 }, plan)
        .multiplier === 4 &&
      calculateEtfRecommendedMultiplier({ premiumPercent: 0.4 }, plan)
        .multiplier === 2 &&
      calculateEtfRecommendedMultiplier({ premiumPercent: 0.8 }, plan)
        .multiplier === 1 &&
      calculateEtfRecommendedMultiplier(
        { premiumPercent: 0.2, leveraged: true },
        plan,
      ).multiplier === 3
    );
  });
  test("±1%無動作區間不因高水位放大倍率", () => {
    const input = {
        todayArk: 87.4,
        actualAllocation: 87,
        arkSuggestedCapital: 10000,
      },
      d = {
        action: "HOLD",
        gap: 0.4,
        trend: { delta1D: 1 },
        waterLevelState: {
          zone: "HIGH",
          direction: "RISING",
          value: 87.4,
          levels: CONFIG.arkWaterLevels,
        },
      };
    return (
      applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 1, arkBaseTotal: 1000 },
        input,
        d,
      ).dynamicScale === 0
    );
  });
  test("ARK後10%低水位續跌時布局不超過1倍", () => {
    const input = {
        todayArk: 61.6,
        actualAllocation: 50,
        arkSuggestedCapital: 10000,
      },
      d = {
        action: "BUY",
        gap: 11.6,
        trend: { delta1D: -1 },
        waterLevelState: {
          zone: "LOW",
          direction: "FALLING",
          value: 61.6,
          levels: CONFIG.arkWaterLevels,
        },
      };
    return (
      applyArkWaterLevelMultiplierPolicy(
        { dynamicScale: 2.5, arkBaseTotal: 1000 },
        input,
        d,
      ).dynamicScale === 1
    );
  });
  test("ARK前10%高水位續升時不賣股票", () => {
    const input = { todayArk: 82, actualAllocation: 90 },
      d = applyArkWaterLevelDecisionPolicy(input, {
        action: "SELL",
        regime: "DISTRIBUTION",
        rate: 0.5,
        target: 86,
        label: "SELL",
        urgency: 80,
        gap: -8,
        trend: { delta1D: 1 },
      });
    return d.action === "HOLD" && d.rate === 0 && d.target === 90;
  });
  test("低配總結會顯示共用策略調整點數", () => {
    const input = { todayArk: 66.8, actualAllocation: 20 },
      d = {
        action: "BUY",
        adjustmentPoints: 3,
        gap: 46.8,
        rate: 0.1,
        target: 24.68,
        trend: { delta1D: -1, delta3D: -2, delta5D: -3 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "FALLING",
          value: 66.8,
          levels: CONFIG.arkWaterLevels,
        },
        _v2Plan: { dynamicScale: 1 },
      };
    return buildAllocationSummary(d, input).includes("共用策略預計調高 3.00 個百分點");
  });
  test("小幅超配總結會等待ARK趨勢確認", () => {
    const input = { todayArk: 66.8, actualAllocation: 68 },
      d = {
        action: "HOLD",
        gap: -1.2,
        rate: 0,
        target: 68,
        trend: { delta1D: 0.1, delta3D: -0.2, delta5D: 0.1 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "RISING",
          value: 66.8,
          levels: CONFIG.arkWaterLevels,
        },
      };
    return buildAllocationSummary(d, input).includes("只有 ARK 繼續下降");
  });
  test("明顯超配且ARK持續下降會顯示調節幅度", () => {
    const input = { todayArk: 66.8, actualAllocation: 80 },
      d = {
        action: "SELL",
        gap: -13.2,
        rate: 0.15,
        target: 78,
        adjustmentPoints: 2,
        trend: { delta1D: -1, delta3D: -3, delta5D: -5 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "FALLING",
          value: 66.8,
          levels: CONFIG.arkWaterLevels,
        },
      };
    return buildAllocationSummary(d, input).includes("降低 2.00 個百分點");
  });
  test("負數調節金額會直接顯示於超配總結", () => {
    const input = {
        todayArk: 66.8,
        actualAllocation: 80,
        arkSuggestedCapital: -10000,
      },
      d = {
        action: "SELL",
        gap: -13.2,
        rate: 0.5,
        target: 73.4,
        trend: { delta1D: -1, delta3D: -3, delta5D: -5 },
        waterLevelState: {
          zone: "NORMAL",
          direction: "FALLING",
          value: 66.8,
          levels: CONFIG.arkWaterLevels,
        },
      },
      summary = buildAllocationSummary(d, input);
    return summary.includes("NT$ -10,000") && summary.includes("調節計算機");
  });
  test("策略回測使用前一日配置避免偷看當日結果", () => {
    const result = buildStrategyBacktest([
        {
          date: "2026-01-01",
          taiwanIndex: 100,
          arkAllocation: 50,
          actualAllocation: 50,
        },
        { date: "2026-01-02", taiwanIndex: 110, arkAllocation: 100 },
        { date: "2026-01-03", taiwanIndex: 121, arkAllocation: 0 },
      ]),
      current = result.strategies.find((strategy) => strategy.key === "current"),
      fixed = result.strategies.find((strategy) => strategy.key === "fixed");
    return (
      Math.abs(current.metrics.cumulativeReturn - 16.8) < 0.0001 &&
      Math.abs(fixed.metrics.cumulativeReturn - 14.49) < 0.0001
    );
  });
  test("策略驗證三種淨值皆為有限數值", () => {
    const result = buildStrategyBacktest([
      {
        date: "2026-01-01",
        taiwanIndex: 100,
        arkAllocation: 70,
        actualAllocation: 68,
      },
      { date: "2026-01-02", taiwanIndex: 102, arkAllocation: 72 },
      { date: "2026-01-03", taiwanIndex: 99, arkAllocation: 68 },
      { date: "2026-01-04", taiwanIndex: 103, arkAllocation: 75 },
      { date: "2026-01-05", taiwanIndex: 105, arkAllocation: 74 },
    ]);
    return (
      result.strategies.length === 3 &&
      result.strategies.every((strategy) =>
        strategy.values.every(Number.isFinite),
      )
    );
  });
  test("RS Ratio 以 0050 為 100 基準", () =>
    calculateRsRatio(7, 5) === 101.9 &&
    calculateRsRatio(5, 5) === 100 &&
    calculateRsRatio(null, 5) === null,
  );
  test("ETF 數字代號遺失前導零時會自動修復", () =>
    normalizeEtfUniverseSymbol("9816") === "009816" &&
    normalizeEtfUniverseSymbol("921") === "00921" &&
    normalizeEtfUniverseSymbol("50") === "0050",
  );
  test("RS20 趨勢評級符合轉折、連跌與低於100規則", () =>
    classifyRs20Trend({ 0: 101, 3: 103, 5: 102, 10: 101, 20: 99 }).key === "WATCH" &&
    classifyRs20Trend({ 0: 101, 3: 102, 5: 103, 10: 104, 20: 105 }).key === "REDUCE" &&
    classifyRs20Trend({ 0: 99, 3: 101, 5: 102, 10: 103, 20: 104 }).key === "ROTATE",
  );
  test("2倍槓桿報酬會還原單位曝險", () =>
    Math.abs(calculateLeverageAdjustedReturn(21, 2) - 10) < 0.001,
  );
  const v2 = window.BuyEngineV2.runBuyEngineSelfTests();
  v2.tests.forEach((x) => tests.push([`BUY V2 · ${x.name}`, x.ok]));
  const passed = tests.filter((t) => t[1]).length,
    failed = tests.filter(([, ok]) => !ok);
  if (failed.length)
    console.warn(
      `[ARK Strategy Lab] 自我測試失敗：${passed}/${tests.length}`,
      failed.map(([name]) => name),
    );
  else
    console.info(`[ARK Strategy Lab] 自我測試通過：${passed}/${tests.length}`);
  return { passed, total: tests.length, tests };
}

function saveETFs() {
  localStorage.setItem(
    CONFIG.storageKeys.etfs,
    JSON.stringify(window.currentETFs),
  );
}
function bind() {
  const visionTokenInputs = [
    $("visionAccessToken"),
    $("rebalanceVisionAccessToken"),
    $("strengthAccessToken"),
  ].filter(Boolean);
  const savedVisionToken =
    localStorage.getItem(CONFIG.storageKeys.visionToken) || "";
  visionTokenInputs.forEach((input) => {
    input.value = savedVisionToken;
    input.addEventListener("input", (event) => {
      const token = event.target.value.trim();
      localStorage.setItem(CONFIG.storageKeys.visionToken, token);
      visionTokenInputs.forEach((other) => {
        if (other !== event.target) other.value = token;
      });
    });
  });
  document
    .querySelectorAll(".inputs-card input,.inputs-card select")
    .forEach((el) => el.addEventListener("input", renderDashboard));
  $("etfCards").addEventListener("change", (event) => {
    const el = event.target,
      index = Number(el.dataset.etfIndex),
      field = el.dataset.etfField;
    if (!field || !Number.isInteger(index) || !window.currentETFs[index])
      return;
    window.currentETFs[index][field] = [
      "nav",
      "premium",
      "arkShares",
      "positionCapital",
      "riskShares",
      "riskAmount",
      "currentWeight",
      "leverage",
    ].includes(field)
      ? Number(el.value || 0)
      : el.value;
    saveETFs();
    renderDashboard();
  });
  $("etfCards").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-etf]");
    if (!button) return;
    window.currentETFs.splice(Number(button.dataset.removeEtf), 1);
    saveETFs();
    renderETFExecution();
  });
  $("ocrImages").addEventListener("change", () => {
    ocrObjectUrls.forEach(URL.revokeObjectURL);
    const max = CONFIG.imageImport.maxScreenshots,
      selected = [...$("ocrImages").files]
        .filter((file) => file.type.startsWith("image/"))
        .slice(0, max);
    ocrFiles = selected;
    ocrObjectUrls = selected.map(URL.createObjectURL);
    $("ocrImagePreview").innerHTML = ocrObjectUrls
      .map(
        (url, index) =>
          `<figure><img src="${url}" alt="待辨識截圖 ${index + 1}"><figcaption>截圖 ${index + 1}</figcaption></figure>`,
      )
      .join("");
    $("runOcrBtn").disabled = !selected.length;
    $("clearOcrBtn").hidden = !selected.length;
    $("ocrReview").hidden = true;
    $("ocrStatus").textContent = selected.length
      ? `已選擇 ${selected.length} 張，按「開始辨識」。`
      : "尚未選擇圖片";
    if ($("ocrImages").files.length > max)
      $("ocrStatus").textContent = `一次最多辨識 ${max} 張，已取前 ${max} 張。`;
  });
  $("runOcrBtn").addEventListener("click", recognizeArkScreenshots);
  $("clearOcrBtn").addEventListener("click", () => resetOcrImport());
  $("applyOcrBtn").addEventListener("click", applyOcrRows);
  $("saveBtn").addEventListener("click", () => saveDailySnapshot());
  $("syncBtn").addEventListener("click", () => syncCentralData());
  $("syncLatestTradingDayBtn").addEventListener(
    "click",
    syncLatestTradingDayData,
  );
  $("strengthRefreshBtn").addEventListener("click", () =>
    refreshStrengthUniverse(),
  );
  $("strengthAddBtn").addEventListener("click", async () => {
    const symbol = normalizeEtfUniverseSymbol($("strengthSymbol").value),
      name = $("strengthName").value.trim();
    if (!/^\d{4,6}[A-Z]?$/.test(symbol)) {
      $("strengthStatus").textContent = "請輸入正確的台灣 ETF 代號。";
      return;
    }
    try {
      $("strengthStatus").textContent = `正在新增 ${symbol}…`;
      await updateStrengthUniverse("add", symbol, name);
      $("strengthSymbol").value = "";
      $("strengthName").value = "";
    } catch (error) {
      $("strengthStatus").textContent = `新增失敗：${String(error?.message || error)}`;
    }
  });
  $("strengthTable").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-strength-remove]");
    if (!button) return;
    const symbol = button.dataset.strengthRemove;
    button.disabled = true;
    try {
      $("strengthStatus").textContent = `正在從動態清單移除 ${symbol}…`;
      await updateStrengthUniverse("remove", symbol);
    } catch (error) {
      $("strengthStatus").textContent = `刪除失敗：${String(error?.message || error)}`;
      button.disabled = false;
    }
  });
}
async function init() {
  $("strategyVersion").textContent = CONFIG.strategyVersion;
  restoreState();
  bind();
  if (location.protocol === "file:") {
    $("ocrStatus").textContent =
      "圖片辨識需要本機網頁伺服器：請改為雙擊「啟動網站.cmd」開啟。";
  }
  const cached = await dataProvider.getCentralData();
  if (CONFIG.googleSheets?.webAppUrl) {
    [
      "yesterdayArk",
      "ark3D",
      "ark5D",
      "peak10D",
      "cnn",
      "rsi",
      "margin",
    ].forEach((id) => ($(id).value = ""));
    $("syncStatus").textContent = "更新最新交易日資料中…";
  } else if (cached) {
    applyCentralData(cached);
    $("syncStatus").textContent =
      `使用快取 · ${new Date(cached.syncedAt).toLocaleDateString("zh-TW")}`;
  } else $("syncStatus").textContent = "待設定 Google 同步";
  renderDashboard();
  renderHistory();
  runSelfTests();
  if (CONFIG.googleSheets?.webAppUrl) await syncCentralData({ silent: true });
  if (localStorage.getItem(CONFIG.storageKeys.visionToken))
    await refreshStrengthUniverse({ quiet: true });
}
document.addEventListener("DOMContentLoaded", init);

window.ARKStrategyLab = {
  findLatestTradingRecord,
  getArkLookbackValues,
  calculateGap,
  calculateArkTrend,
  calculateArkPeak,
  arkWaterLevelState,
  applyArkWaterLevelDecisionPolicy,
  applyArkWaterLevelMultiplierPolicy,
  determineRegime,
  calculateBuyMultiplier,
  calculateBuyTrendFactor,
  calculateSellFillRate,
  calculateMarketModifier,
  calculateConcentrationFactor,
  calculatePremiumDecision,
  calculateETFOrders,
  reconcileExecutionBudget,
  evaluatePremiumCounterfactual,
  predictMarketPosition,
  recordsWithCurrentMarket,
  compareTrendWindows,
  analyzeSimilarTrend,
  quantile,
  getAnnualArkRecords,
  getAnnualArkLevelRecords,
  calculateForwardIndexMetrics,
  buildArkLevelEvents,
  summarizeArkEvents,
  calculateBacktestMetrics,
  buildStrategyBacktest,
  calculateExecutionDiagnostics,
  simulateBandStrategy,
  isOutOfSampleImprovement,
  optimizeWalkForward,
  renderStrategyValidation,
  renderSensitivityValidation,
  summarizePositionExecution,
  calculateEtfRecommendedMultiplier,
  buildAllocationSummary,
  buildTrendSummary,
  saveDailySnapshot,
  loadHistory,
  runSelfTests,
  getInput,
  renderImageReview,
  renderBuyEngine,
  renderETFExecution,
  renderExecutionBuffer,
  renderExtremeMode,
  renderDecisionExplanation,
  calculateRsRatio,
  calculateLeverageAdjustedReturn,
  classifyRs20Trend,
  refreshStrengthUniverse,
  LocalDataProvider,
  GoogleSheetsDataProvider,
};
