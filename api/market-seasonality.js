"use strict";

module.exports = async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ ok: false, error: "只接受 GET。" });
  const month = Math.min(12, Math.max(1, Number(req.query?.month) || new Date().getMonth() + 1));
  try {
    const period1 = Math.floor(Date.UTC(1990, 0, 1) / 1000),
      period2 = Math.floor(Date.now() / 1000) + 86400,
      url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?period1=${period1}&period2=${period2}&interval=1mo&events=history`,
      response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ARKStrategyLab/1.0)" } });
    if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
    const result = (await response.json())?.chart?.result?.[0];
    if (!result) throw new Error("查無台灣加權指數歷史資料");
    const timestamps = result.timestamp || [],
      closes = result.indicators?.quote?.[0]?.close || [],
      points = timestamps.map((timestamp, index) => ({ date: new Date(Number(timestamp) * 1000 + 8 * 3600 * 1000), close: Number(closes[index]) })).filter((point) => Number.isFinite(point.close) && point.close > 0),
      cases = [];
    const now = new Date();
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index], previous = points[index - 1];
      if (point.date.getUTCMonth() + 1 !== month) continue;
      if (point.date.getUTCFullYear() === now.getUTCFullYear() && point.date.getUTCMonth() === now.getUTCMonth()) continue;
      const value = (point.close / previous.close - 1) * 100;
      if (Number.isFinite(value)) cases.push({ year: point.date.getUTCFullYear(), return: Math.round(value * 100) / 100 });
    }
    if (cases.length < 5) throw new Error("同月份歷史樣本不足");
    const average = cases.reduce((sum, item) => sum + item.return, 0) / cases.length,
      upCount = cases.filter((item) => item.return > 0).length,
      flatCount = cases.filter((item) => item.return === 0).length;
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ ok: true, source: "Yahoo Finance ^TWII monthly close", month, caseCount: cases.length, upRate: (upCount / cases.length) * 100, downRate: ((cases.length - upCount - flatCount) / cases.length) * 100, averageReturn: average, cases });
  } catch (error) {
    return res.status(502).json({ ok: false, error: String(error?.message || error) });
  }
};
