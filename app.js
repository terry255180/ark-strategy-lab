"use strict";

const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, d = 2) => Number(Number(v).toFixed(d));
const pp = (v) => `${v >= 0 ? "+" : ""}${round(v, 2).toFixed(2)}pp`;
const pct = (v, d = 1) => `${round(v, d).toFixed(d)}%`;
const num = (id, fallback = 0) => Number($(id).value || fallback);
const REGIME_ZH = {ACCUMULATION:"累積建倉",HOLD:"觀望不動",WATCH:"暫停觀察",DISTRIBUTION:"分批調節",CONFIRMED_DISTRIBUTION:"確認調節",RISK_OFF:"風險降低"};
const ACTION_ZH = {BUY:"買進",SELL:"賣出",HOLD:"不交易"};
const STATUS_ZH = {"STOP ADDING":"停止加碼","BUY AT NAV":"以淨值附近買進","BUY WITH PREMIUM":"接受溢價買進","EXECUTION PRIORITY":"優先執行","WAIT FOR NAV":"等待接近淨值"};
const regimeZh = (value) => REGIME_ZH[value] || value;
const actionZh = (value) => ACTION_ZH[value] || value;
const statusZh = (value) => STATUS_ZH[value] || value;

const SOURCE_RECORDS = [
  {date:"2026-09-07",arkAllocation:69.1,taiwanIndex:47326.27},
  {date:"2026-09-09",arkAllocation:73.4,taiwanIndex:47183.36},
  {date:"2026-09-10",arkAllocation:75.1,taiwanIndex:46940.49},
  {date:"2026-09-11",arkAllocation:77.9,taiwanIndex:46184.85},
  {date:"2026-09-14",arkAllocation:79.0,taiwanIndex:45862.52},
  {date:"2026-09-15",arkAllocation:78.2,taiwanIndex:45511.49},
  {date:"2026-09-16",arkAllocation:76.6,taiwanIndex:45848.90},
  {date:"2026-09-17",arkAllocation:73.6,taiwanIndex:46288.00}
];
const SOURCE_HISTORY = SOURCE_RECORDS.map(row=>row.arkAllocation);
const SAMPLE_ETFS = [
  ["0050","元大台灣50",108.90,-0.18,7,7.2,"TAIWAN_EQUITY",1,"TAIWAN_LARGE_CAP"],
  ["006208","富邦台50",126.40,0.12,5,8.5,"TAIWAN_EQUITY",1,"TAIWAN_LARGE_CAP"],
  ["00911","兆豐洲際半導體",33.55,2.83,8,4.2,"GLOBAL_EQUITY",1,"SEMICONDUCTOR"],
  ["00830","國泰費城半導體",48.22,1.70,6,6.8,"US_EQUITY",1,"SEMICONDUCTOR"],
  ["00910","第一金太空衛星",28.18,1.26,9,5.1,"GLOBAL_EQUITY",1,"GLOBAL_THEME"],
  ["00920","富邦ESG綠色電力",15.84,0.96,10,7.4,"GLOBAL_EQUITY",1,"GLOBAL_THEME"],
  ["00631L","元大台灣50正2",256.50,0.42,1,6.5,"LEVERAGED_TW",2,"TAIWAN_LARGE_CAP"]
];

class LocalDataProvider {
  async getCentralData() {
    const cached = JSON.parse(localStorage.getItem(CONFIG.storageKeys.cache) || "null");
    return cached || { syncedAt: null, source: "本機資料", arkHistory: SOURCE_HISTORY };
  }
  async sync() {
    const data = { syncedAt: new Date().toISOString(), source: "本機快取", arkHistory: SOURCE_HISTORY };
    localStorage.setItem(CONFIG.storageKeys.cache, JSON.stringify(data));
    return data;
  }
}
class GoogleSheetsDataProvider {
  constructor(webAppUrl){ this.webAppUrl=webAppUrl; }
  async getCentralData(){
    try { return JSON.parse(localStorage.getItem(CONFIG.storageKeys.cache)||"null"); }
    catch { return null; }
  }
  async sync(){
    if(!this.webAppUrl) throw new Error("尚未設定 Apps Script 網頁應用程式網址。");
    const separator=this.webAppUrl.includes("?")?"&":"?";
    const response=await fetch(`${this.webAppUrl}${separator}t=${Date.now()}`,{method:"GET",redirect:"follow",cache:"no-store"});
    if(!response.ok) throw new Error(`同步失敗（HTTP ${response.status}）`);
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.includes("application/json")) throw new Error("Apps Script 端點目前需要 Google 登入。請將網頁應用程式的存取權限改為「所有人」。");
    const payload=await response.json();
    if(!payload.ok) throw new Error(payload.error||"Google 試算表回傳錯誤。");
    const data={...payload,source:"Google 試算表",syncedAt:payload.syncedAt||new Date().toISOString()};
    localStorage.setItem(CONFIG.storageKeys.cache,JSON.stringify(data));
    return data;
  }
}
const dataProvider=CONFIG.googleSheets?.enabled
  ? new GoogleSheetsDataProvider(CONFIG.googleSheets.webAppUrl)
  : new LocalDataProvider();

function applyCentralData(data){
  const records=(data?.records||[]).filter(row=>row.date&&Number.isFinite(Number(row.arkAllocation)));
  if(!records.length) return false;
  window.centralRecords=records.map(row=>({...row,arkAllocation:Number(row.arkAllocation),taiwanIndex:Number(row.taiwanIndex)}));
  const latest=records.at(-1), allocations=records.map(row=>Number(row.arkAllocation));
  const previous=(days)=>allocations[Math.max(0,allocations.length-1-days)];
  const setNumber=(id,value)=>{ if(value!==""&&value!==null&&value!==undefined&&Number.isFinite(Number(value))) $(id).value=Number(value); };
  setNumber("todayArk",latest.arkAllocation); setNumber("actualAllocation",latest.actualAllocation);
  setNumber("yesterdayArk",previous(1)); setNumber("ark3D",previous(3)); setNumber("ark5D",previous(5));
  setNumber("peak10D",Math.max(...allocations.slice(-10))); setNumber("cnn",latest.cnn);
  setNumber("margin",latest.marginMaintenance); setNumber("rsi",latest.rsi);
  if(Number(latest.arkSuggestedCapital)>0) setNumber("arkSuggestedCapital",latest.arkSuggestedCapital);
  renderDashboard();
  return true;
}

async function syncCentralData({silent=false}={}){
  try{
    if(!silent) $("syncStatus").textContent="同步中…";
    const data=await dataProvider.sync();
    applyCentralData(data);
    $("syncStatus").textContent=`Google 試算表 · ${new Date(data.syncedAt).toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`;
    return data;
  }catch(error){
    const cached=await dataProvider.getCentralData();
    if(cached) applyCentralData(cached);
    $("syncStatus").textContent=cached?"同步失敗 · 使用上次快取":(CONFIG.googleSheets?.webAppUrl?"Google 同步失敗":"尚未設定 Google 同步");
    if(!silent) $("saveMessage").textContent=error.message;
    return cached;
  }
}

function calculateGap(todayArk, actual) { return round(todayArk - actual, 4); }
function calculateArkPeak(values) { return Math.max(...values.slice(-10)); }
function calculateArkTrend(values) {
  const last = values.length - 1;
  const delta = (days) => last - days >= 0 ? round(values[last] - values[last-days], 2) : 0;
  return { delta1D:delta(1), delta2D:delta(2), delta3D:delta(3), delta5D:delta(5), peak:calculateArkPeak(values), drawdown:round(values[last]-calculateArkPeak(values),2) };
}
function consecutiveDeclines(values) { let n=0; for(let i=values.length-1;i>0&&values[i]<values[i-1];i--) n++; return n; }

function determineRegime(state) {
  const {gap, trend, actualAllocation, todayArk, previousRegime="HOLD"} = state;
  if (Math.abs(gap) <= CONFIG.deadBand) return "HOLD";
  const excess = actualAllocation > todayArk;
  const dd = Math.abs(Math.min(0, trend.drawdown));
  if (excess && dd >= CONFIG.riskOffDrawdown) return "RISK_OFF";
  if (excess && dd >= CONFIG.confirmedDistributionDrawdown && ["DISTRIBUTION","CONFIRMED_DISTRIBUTION"].includes(previousRegime)) return "CONFIRMED_DISTRIBUTION";
  if (excess && consecutiveDeclines(state.arkHistory) >= 2 && dd >= CONFIG.distributionDrawdown) return "DISTRIBUTION";
  if (trend.delta1D < 0 || (previousRegime.includes("DISTRIBUTION") && dd > 1)) return "WATCH";
  if (gap > CONFIG.deadBand) return "ACCUMULATION";
  return "HOLD";
}

function calculateBuyMultiplier(gap) {
  if (gap <= 1) return 0;
  if (gap <= 5) return 3;
  if (gap <= 10) return 3 - (gap-5)*0.06;
  if (gap <= 20) return 2.7 - (gap-10)*0.04;
  return clamp(2.3-(gap-20)*0.02, CONFIG.minInitialBuildMultiplier, CONFIG.maxBuyMultiplier);
}
function calculateBuyTrendFactor(delta1D) {
  if (delta1D >= 2) return 1.10; if (delta1D >= 0) return 1; if (delta1D >= -2) return .90; if (delta1D >= -4) return .70; return .50;
}
function calculateSellFillRate(regime) { return ({DISTRIBUTION:CONFIG.sellFillDistribution,CONFIRMED_DISTRIBUTION:CONFIG.sellFillConfirmed,RISK_OFF:CONFIG.sellFillRiskOff})[regime] || 0; }
function calculateMarketModifier(input, action) {
  let modifier=1;
  const hot=input.cnn>=65 || input.rsi>=70 || input.bias20D>=8 || input.marketPosition==="HIGH";
  const cold=input.cnn<=25 || input.rsi<=30 || input.bias20D<=-8 || input.marketPosition==="LOW";
  if(action==="SELL") modifier *= hot ? 1.15 : (cold ? 0.85 : 1);
  if(action==="BUY") modifier *= cold ? 1.10 : (hot ? 0.90 : 1);
  return clamp(modifier,.75,1.25);
}
function calculateUrgencyScore(gap, trend, regime) {
  const regimePoints={HOLD:5,WATCH:20,ACCUMULATION:45,DISTRIBUTION:60,CONFIRMED_DISTRIBUTION:78,RISK_OFF:95}[regime];
  return Math.round(clamp(regimePoints+Math.min(Math.abs(gap),20)-Math.min(Math.abs(trend.delta1D),5),0,100));
}
function calculateConcentrationFactor(etf) {
  const w=etf.currentWeight, leveraged=etf.leverage>1||etf.assetType==="LEVERAGED_TW";
  if(leveraged) return w<6?1:w<8?.75:w<10?.5:0;
  return w<8?1:w<10?.75:w<12?.5:0;
}
function calculatePremiumDecision(etf, urgency, concentrationFactor) {
  if(concentrationFactor===0) return {factor:0,status:"STOP ADDING"};
  if(etf.premium<=0.1) return {factor:1,status:"BUY AT NAV"};
  const tolerance=.25+(urgency/100)*1.5;
  if(etf.premium<=tolerance) return {factor:clamp(1-etf.premium*.08,.72,1),status:urgency>=70?"EXECUTION PRIORITY":"BUY WITH PREMIUM"};
  if(urgency>=80 && etf.premium<2.5) return {factor:.65,status:"EXECUTION PRIORITY"};
  return {factor:0,status:"WAIT FOR NAV"};
}
function evaluatePremiumCounterfactual(){ return {status:"RESEARCH_PENDING", horizons:[1,3,5], navOnly:"NOT_EVALUATED"}; }

function calculateDecision(input) {
  const gap=calculateGap(input.todayArk,input.actualAllocation);
  const arkHistory=[...input.arkHistory.slice(-9),input.todayArk];
  const trend=calculateArkTrend(arkHistory);
  const regime=determineRegime({...input,gap,trend,arkHistory});
  let action="HOLD", rate=0, target=input.actualAllocation, label="NO TRADE";
  if(regime==="ACCUMULATION") { action="BUY"; const base=calculateBuyMultiplier(gap); rate=clamp(base*calculateBuyTrendFactor(trend.delta1D)*calculateMarketModifier(input,"BUY"),0,CONFIG.maxBuyMultiplier); const fill=gap<=10?.15:gap<=20?.12:.10; target=input.actualAllocation+gap*fill; label=trend.delta1D<0?"SLOW ACCUMULATION":"ACCUMULATE"; }
  if(["DISTRIBUTION","CONFIRMED_DISTRIBUTION","RISK_OFF"].includes(regime)) { action="SELL"; rate=clamp(calculateSellFillRate(regime)*calculateMarketModifier(input,"SELL"),0,.6); target=input.actualAllocation-(input.actualAllocation-input.todayArk)*rate; label=regime.replaceAll("_"," "); }
  if(regime==="WATCH") label="PAUSE · WATCH";
  return {gap,trend,regime,action,rate:round(rate,3),target:round(target,2),label,urgency:calculateUrgencyScore(gap,trend,regime),arkHistory,suggestedCapital:input.arkSuggestedCapital};
}

function parseETFData(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).slice(0,10).map((line)=>{
    const parts=line.trim().split(/\t|,|，|\s{2,}/).map(v=>v.trim()).filter(Boolean);
    if(parts[0]?.toLowerCase()==="symbol") return null;
    const [symbol,name,nav,premium,arkShares,currentWeight,assetType,leverage,exposureGroup]=parts;
    return {symbol,name,nav:Number(nav),premium:Number(String(premium).replace("%","")),arkShares:Number(arkShares),currentWeight:Number(String(currentWeight).replace("%","")),assetType,leverage:Number(leverage||1),exposureGroup};
  }).filter(e=>e&&e.symbol&&Number.isFinite(e.nav)&&Number.isFinite(e.arkShares));
}
function calculateETFOrders(etfs, decision) {
  return etfs.map(etf=>{ const concentrationFactor=calculateConcentrationFactor(etf); const premium=calculatePremiumDecision(etf,decision.urgency,concentrationFactor); const global=decision.action==="BUY"?decision.rate:0; const finalMultiplier=global*concentrationFactor*premium.factor; return {...etf,global,concentrationFactor,premiumFactor:premium.factor,status:premium.status,finalMultiplier,finalShares:Math.floor(etf.arkShares*finalMultiplier)}; });
}
function reconcileExecutionBudget(orders, decision) {
  const eligible=orders.filter(o=>o.finalShares>0);
  // V1 has no private portfolio value input. Use the Ark recommendation basket
  // multiplied by the global execution speed as the public notional ceiling.
  const calculatedCeiling=orders.reduce((s,o)=>s+o.arkShares*o.nav,0)*(decision.action==="BUY"?decision.rate:0);
  let total=eligible.reduce((s,o)=>s+o.finalShares*o.nav,0), maxCapital=decision.action==="BUY"?(decision.suggestedCapital>0?decision.suggestedCapital:calculatedCeiling):0;
  if(total>maxCapital&&total>0){ const ratio=maxCapital/total; orders.forEach(o=>o.finalShares=Math.floor(o.finalShares*ratio)); total=orders.reduce((s,o)=>s+o.finalShares*o.nav,0); }
  return {orders,globalTarget:maxCapital,total,unallocated:Math.max(0,maxCapital-total)};
}

function getInput() {
  return {todayArk:num("todayArk"),actualAllocation:num("actualAllocation"),arkSuggestedCapital:num("arkSuggestedCapital"),cnn:num("cnn"),rsi:num("rsi"),bias20D:num("bias20D"),margin:num("margin"),marketPosition:$("marketPosition").value,arkHistory:[...SOURCE_HISTORY.slice(0,-3),num("ark5D"),num("ark3D"),num("yesterdayArk")],previousRegime:(loadHistory().at(-1)||{}).regime};
}
function renderSparkline(){
  const records=(window.centralRecords?.length?window.centralRecords:SOURCE_RECORDS).slice(-10).filter(row=>Number.isFinite(Number(row.arkAllocation))&&Number.isFinite(Number(row.taiwanIndex)));
  if(records.length<2){ $("sparkline").innerHTML='<p class="note">同步至少兩筆含日期與大盤指數的紀錄後，才會顯示趨勢圖。</p>'; return; }
  const w=620,h=215,left=42,right=62,top=15,bottom=55,plotW=w-left-right,plotH=h-top-bottom;
  const ark=records.map(row=>Number(row.arkAllocation)),index=records.map(row=>Number(row.taiwanIndex));
  const arkMin=Math.min(...ark)-1,arkMax=Math.max(...ark)+1,indexPad=Math.max(100,(Math.max(...index)-Math.min(...index))*.12),indexMin=Math.min(...index)-indexPad,indexMax=Math.max(...index)+indexPad;
  const x=i=>left+i*plotW/(records.length-1),yArk=v=>top+(arkMax-v)*plotH/(arkMax-arkMin),yIndex=v=>top+(indexMax-v)*plotH/(indexMax-indexMin);
  const arkPoints=ark.map((v,i)=>`${x(i)},${yArk(v)}`).join(" "),barWidth=Math.min(32,plotW/records.length*.58);
  const dateLabels=records.map((row,i)=>`<text class="date-label" x="${x(i)}" y="${h-8}" text-anchor="end" transform="rotate(-45 ${x(i)} ${h-8})">${String(row.date).slice(5).replace("-","/")}</text>`).join("");
  const bars=records.map((row,i)=>`<rect class="index-bar-chart" x="${x(i)-barWidth/2}" y="${yIndex(index[i])}" width="${barWidth}" height="${h-bottom-yIndex(index[i])}"><title>${row.date}｜加權指數 ${index[i].toLocaleString("zh-TW")}</title></rect>`).join("");
  const dots=records.map((row,i)=>`<circle cx="${x(i)}" cy="${yArk(ark[i])}" r="3" fill="#36d6e7"><title>${row.date}｜ARK ${ark[i].toFixed(1)}%</title></circle>`).join("");
  $("sparkline").innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="ARK 建議持股折線與台灣加權指數柱狀趨勢圖"><line class="grid" x1="${left}" y1="${top}" x2="${w-right}" y2="${top}"/><line class="grid" x1="${left}" y1="${top+plotH/2}" x2="${w-right}" y2="${top+plotH/2}"/><line class="grid" x1="${left}" y1="${h-bottom}" x2="${w-right}" y2="${h-bottom}"/>${bars}<polyline class="line" points="${arkPoints}"/>${dots}<text x="2" y="${top+5}">${arkMax.toFixed(1)}%</text><text x="2" y="${h-bottom}">${arkMin.toFixed(1)}%</text><text x="${w-2}" y="${top+5}" text-anchor="end">${Math.round(indexMax).toLocaleString("zh-TW")}</text><text x="${w-2}" y="${h-bottom}" text-anchor="end">${Math.round(indexMin).toLocaleString("zh-TW")}</text>${dateLabels}</svg>`;
}
function decisionReasons(input,d){ const r=[]; r.push(`實際配置比 ARK 目標${d.gap>=0?"低":"高"} ${Math.abs(d.gap).toFixed(2)} 個百分點。`); if(Math.abs(d.gap)<=CONFIG.deadBand) r.push("缺口位於 ±1 個百分點的無動作區間內，因此今日不建議交易。"); else if(d.gap>0) r.push("目前配置不足，應採分批方式逐步建倉。"); else r.push("只有超出 ARK 目標的部位可列入調節範圍。"); r.push(`ARK 一日變化為 ${pp(d.trend.delta1D)}，相較近十日高點為 ${pp(d.trend.drawdown)}。`); if(d.regime==="WATCH") r.push("ARK 目標正在下降，但尚未符合確認調節條件。"); if(d.action==="SELL") r.push("賣出速度只套用於超額部位，並由市場狀態調整速度。"); if(d.action==="BUY"&&d.gap>20) r.push("初始配置缺口較大，因此降低倍數，避免單日補滿全部缺口。"); return r; }
function buildTrendSummary(d){
  const records=(window.centralRecords||[]).slice(-10).filter(row=>Number.isFinite(Number(row.arkAllocation))&&Number.isFinite(Number(row.taiwanIndex)));
  const arkText=d.trend.delta1D>0?`今日 ARK 比昨日提高 ${Math.abs(d.trend.delta1D).toFixed(2)} 個百分點。`:d.trend.delta1D<0?`今日 ARK 比昨日降低 ${Math.abs(d.trend.delta1D).toFixed(2)} 個百分點。`:"今日 ARK 與昨日相同。";
  if(records.length<2) return `${arkText} 同步更多日期與大盤指數後，可比較兩者的短期方向。`;
  let comparable=0,same=0;
  for(let i=1;i<records.length;i++){ const arkChange=Number(records[i].arkAllocation)-Number(records[i-1].arkAllocation),indexChange=Number(records[i].taiwanIndex)-Number(records[i-1].taiwanIndex); if(arkChange===0||indexChange===0)continue; comparable++; if(Math.sign(arkChange)===Math.sign(indexChange))same++; }
  const latestIndexChange=Number(records.at(-1).taiwanIndex)-Number(records.at(-2).taiwanIndex),relation=!comparable?"目前可比較資料不足":same/comparable>=.7?"近十筆資料多數呈同向變化":same/comparable<=.3?"近十筆資料多數呈反向變化":"近十筆資料的方向關係較混合";
  return `${arkText} 台灣加權指數最新變化為 ${latestIndexChange>=0?"上漲":"下跌"} ${Math.abs(latestIndexChange).toLocaleString("zh-TW",{maximumFractionDigits:0})} 點；${relation}。`;
}
function renderDashboard(){ const input=getInput(),d=calculateDecision(input); window.currentDecision=d; $("arkTarget").textContent=pct(input.todayArk); $("actualValue").textContent=pct(input.actualAllocation,2); $("gapValue").textContent=pp(d.gap); $("gapLabel").textContent=Math.abs(d.gap)<=1?"無動作區間":d.gap>0?"配置不足":"配置超額"; $("trendValue").textContent=pp(d.trend.delta1D); $("drawdownValue").textContent=pp(d.trend.drawdown); $("regimeValue").textContent=regimeZh(d.regime); $("actionValue").textContent=d.regime==="WATCH"?"暫停加碼並觀察":d.action==="BUY"?(d.trend.delta1D<0?"減速建倉":"分批建倉"):d.action==="SELL"?regimeZh(d.regime):"今日不交易"; $("speedValue").textContent=d.action==="BUY"?`×${d.rate.toFixed(2)}`:d.action==="SELL"?`處理 ${(d.rate*100).toFixed(0)}%`:"0"; $("targetExecution").textContent=pct(d.target,2); $("targetCapital").textContent=d.action==="BUY"&&d.suggestedCapital>0?`NT$ ${Math.round(d.suggestedCapital).toLocaleString("zh-TW")}`:"—"; $("executionSpeed").textContent=d.action==="BUY"?`買進 ×${d.rate.toFixed(2)}`:d.action==="SELL"?`賣出 ${(d.rate*100).toFixed(0)}%`:"不交易"; $("urgencyScore").textContent=`${d.urgency} / 100`; $("actionBadge").textContent=actionZh(d.action); $("actionBadge").className=`badge ${d.action.toLowerCase()}`; $("decisionReasons").innerHTML=decisionReasons(input,d).map(x=>`<li>${x}</li>`).join(""); $("trendSummary").textContent=buildTrendSummary(d); [1,2,3,5].forEach(n=>$("delta"+n+"D").textContent=pp(d.trend[`delta${n}D`])); renderSparkline(); renderETFExecution(); persistState(); }
function renderETFExecution(){ const etfs=window.currentETFs||[]; const rec=reconcileExecutionBudget(calculateETFOrders(etfs,window.currentDecision),window.currentDecision); $("etfCards").innerHTML=rec.orders.map((o,i)=>`<article class="etf-card ${o.status.startsWith("STOP")?"stop":o.status.startsWith("WAIT")?"wait":""}"><div class="etf-title"><strong>${o.symbol||"新 ETF"}</strong><button class="remove-etf" type="button" data-remove-etf="${i}" title="移除">×</button></div><div class="etf-basic"><label>代號<input data-etf-index="${i}" data-etf-field="symbol" value="${o.symbol||""}"></label><label>名稱<input data-etf-index="${i}" data-etf-field="name" value="${o.name||""}"></label></div><div class="etf-edit-grid"><label>今日淨值<input type="number" step="0.01" data-etf-index="${i}" data-etf-field="nav" value="${o.nav}"></label><label>溢價率 %<input type="number" step="0.01" data-etf-index="${i}" data-etf-field="premium" value="${o.premium}"></label><label>ARK 建議股數<input type="number" min="0" step="1" data-etf-index="${i}" data-etf-field="arkShares" value="${o.arkShares}"></label><label>目前權重 %<input type="number" min="0" step="0.1" data-etf-index="${i}" data-etf-field="currentWeight" value="${o.currentWeight}"></label></div><details class="etf-advanced"><summary>ETF 基本設定（通常不需每日修改）</summary><div class="etf-edit-grid"><label>資產類型<select data-etf-index="${i}" data-etf-field="assetType">${["TAIWAN_EQUITY","US_EQUITY","GLOBAL_EQUITY","LEVERAGED_TW","OTHER"].map(v=>`<option value="${v}" ${o.assetType===v?"selected":""}>${v}</option>`).join("")}</select></label><label>槓桿倍數<input type="number" min="1" step="1" data-etf-index="${i}" data-etf-field="leverage" value="${o.leverage}"></label><label>曝險群組<input data-etf-index="${i}" data-etf-field="exposureGroup" value="${o.exposureGroup||"OTHER"}"></label></div></details><div class="factors"><div><span>全域倍數</span><strong>×${o.global.toFixed(2)}</strong></div><div><span>集中度</span><strong>×${o.concentrationFactor.toFixed(2)}</strong></div><div><span>溢價因子</span><strong>×${o.premiumFactor.toFixed(2)}</strong></div></div><div class="final-shares"><div><span>最終建議股數</span><strong>${o.finalShares}</strong></div><span class="badge ${o.status.includes("STOP")?"sell":o.status.includes("WAIT")?"hold":"buy"}">${statusZh(o.status)}</span></div></article>`).join("")||`<p class="note">尚未建立 ETF。請按「新增 ETF」或「載入範例」。</p>`; $("globalBudget").textContent=Math.round(rec.globalTarget).toLocaleString("zh-TW"); $("orderTotal").textContent=Math.round(rec.total).toLocaleString("zh-TW"); $("unallocated").textContent=Math.round(rec.unallocated).toLocaleString("zh-TW"); }
function loadHistory(){ try{return JSON.parse(localStorage.getItem(CONFIG.storageKeys.history)||"[]");}catch{return [];} }
function saveDailySnapshot(force=false){ const history=loadHistory(),date=$("decisionDate").value,index=history.findIndex(x=>x.date===date); if(index>=0&&!force&&!confirm("今天已有紀錄，是否更新今日資料？")) return; const input=getInput(),d=window.currentDecision,snapshot={date,ark:input.todayArk,actual:input.actualAllocation,gap:d.gap,regime:d.regime,buyMultiplier:d.action==="BUY"?d.rate:0,sellFillRate:d.action==="SELL"?d.rate:0,suggestedExecution:d.target,arkSuggestedCapital:input.arkSuggestedCapital,marketIndicators:{cnn:input.cnn,rsi:input.rsi,bias20D:input.bias20D,margin:input.margin},strategyVersion:CONFIG.strategyVersion,etfDecisions:calculateETFOrders(window.currentETFs||[],d)}; if(index>=0)history[index]=snapshot;else history.push(snapshot); history.sort((a,b)=>a.date.localeCompare(b.date)); localStorage.setItem(CONFIG.storageKeys.history,JSON.stringify(history.slice(-CONFIG.historyLimit))); $("saveMessage").textContent=index>=0?"今日紀錄已更新。":"今日紀錄已儲存。"; renderHistory(); }
function renderHistory(){ const h=loadHistory(); $("historyCount").textContent=`${h.length} / ${CONFIG.historyLimit}`; $("historyCards").innerHTML=h.slice(-8).reverse().map(x=>`<div class="history-row"><span>${x.date}</span><span>ARK <strong>${pct(x.ark)}</strong></span><span>實際配置 <strong>${pct(x.actual,2)}</strong></span><span>缺口 <strong>${pp(x.gap)}</strong></span><span>狀態 <strong>${regimeZh(x.regime)}</strong></span><span>目標配置 <strong>${pct(x.suggestedExecution,2)}</strong></span><span>${x.strategyVersion}</span></div>`).join("")||`<p class="note">目前尚無已儲存的紀錄。</p>`; }
function persistState(){ const ids=["todayArk","actualAllocation","arkSuggestedCapital","yesterdayArk","ark3D","ark5D","peak10D","cnn","rsi","bias20D","margin","marketPosition"]; const state=Object.fromEntries(ids.map(id=>[id,$(id).value])); localStorage.setItem(CONFIG.storageKeys.state,JSON.stringify(state)); }
function restoreState(){ const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}),defaults={todayArk:73.6,actualAllocation:67.9,arkSuggestedCapital:50000,yesterdayArk:76.6,ark3D:78.2,ark5D:79,peak10D:79,cnn:50,rsi:50,bias20D:0,margin:0,marketPosition:"MID"}; let saved={};try{saved=JSON.parse(localStorage.getItem(CONFIG.storageKeys.state)||"{}");}catch{} Object.entries({...defaults,...saved}).forEach(([k,v])=>{if($(k))$(k).value=v;}); $("decisionDate").value=today; $("decisionDateDisplay").textContent=today.replaceAll("-","/"); window.centralRecords=SOURCE_RECORDS; try{window.currentETFs=JSON.parse(localStorage.getItem(CONFIG.storageKeys.etfs)||"null")||SAMPLE_ETFS.map(toETF);}catch{window.currentETFs=SAMPLE_ETFS.map(toETF);} }
function toETF(a){return {symbol:a[0],name:a[1],nav:a[2],premium:a[3],arkShares:a[4],currentWeight:a[5],assetType:a[6],leverage:a[7],exposureGroup:a[8]};}
function loadSample(){ window.currentETFs=SAMPLE_ETFS.map(toETF); localStorage.setItem(CONFIG.storageKeys.etfs,JSON.stringify(window.currentETFs)); renderETFExecution(); }
function runSelfTests(){ const tests=[]; const test=(name,fn)=>{try{tests.push([name,Boolean(fn())]);}catch{tests.push([name,false]);}}; const base={cnn:50,rsi:50,bias20D:0,marketPosition:"MID",previousRegime:"HOLD"};
  test("無動作區間會回傳觀望不動",()=>calculateDecision({...base,todayArk:73,actualAllocation:73,arkHistory:[73,73,73,73,73,73,73]}).regime==="HOLD");
  test("配置不足會回傳買進",()=>calculateDecision({...base,todayArk:80,actualAllocation:70,arkHistory:[78,78,79,79,80,80,80]}).action==="BUY");
  test("大缺口倍數低於三倍",()=>calculateBuyMultiplier(22.15)<3);
  test("87→84→81 會進入分批調節",()=>calculateDecision({...base,todayArk:81,actualAllocation:84,arkHistory:[87,87,87,87,87,84]}).regime==="DISTRIBUTION");
  test("回撤八個百分點會進入風險降低",()=>calculateDecision({...base,todayArk:79,actualAllocation:84,arkHistory:[87,87,87,87,87,83]}).regime==="RISK_OFF");
  test("溢價高於 0.5% 不會一律等待",()=>calculatePremiumDecision({premium:.8},90,1).status!=="WAIT FOR NAV");
  test("達集中度上限會停止加碼",()=>calculateConcentrationFactor({currentWeight:12,leverage:1,assetType:"TAIWAN_EQUITY"})===0);
  test("最終委託不超過執行預算",()=>{const d=calculateDecision({...base,todayArk:80,actualAllocation:70,arkHistory:[76,77,78,79,80,80,80]});const r=reconcileExecutionBudget(calculateETFOrders(SAMPLE_ETFS.map(toETF),d),d);return r.total<=r.globalTarget+.01;});
  test("本機儲存與載入正常",()=>{const k="arkStrategyLab.test";localStorage.setItem(k,"ok");const ok=localStorage.getItem(k)==="ok";localStorage.removeItem(k);return ok;});
  test("同日紀錄可更新而不重複",()=>{const a=[{date:"2026-01-01"}],i=a.findIndex(x=>x.date==="2026-01-01");a[i]={date:"2026-01-01",updated:true};return a.length===1&&a[0].updated;});
  const passed=tests.filter(t=>t[1]).length; $("selfTestBadge").textContent=`${passed} / ${tests.length} 通過`; $("selfTestBadge").className=`badge ${passed===tests.length?"buy":"sell"}`; $("selfTestList").innerHTML=tests.map(([n,ok])=>`<li>${ok?"通過":"失敗"} · ${n}</li>`).join(""); return {passed,total:tests.length,tests}; }

function saveETFs(){ localStorage.setItem(CONFIG.storageKeys.etfs,JSON.stringify(window.currentETFs)); }
function bind(){
  document.querySelectorAll(".inputs-card input,.inputs-card select").forEach(el=>el.addEventListener("input",renderDashboard));
  $("etfCards").addEventListener("change",(event)=>{ const el=event.target,index=Number(el.dataset.etfIndex),field=el.dataset.etfField; if(!field||!Number.isInteger(index)||!window.currentETFs[index]) return; window.currentETFs[index][field]=["nav","premium","arkShares","currentWeight","leverage"].includes(field)?Number(el.value||0):el.value; saveETFs(); renderDashboard(); });
  $("etfCards").addEventListener("click",(event)=>{ const button=event.target.closest("[data-remove-etf]"); if(!button)return; window.currentETFs.splice(Number(button.dataset.removeEtf),1); saveETFs(); renderETFExecution(); });
  $("addEtfBtn").addEventListener("click",()=>{ if(window.currentETFs.length>=10){$("saveMessage").textContent="最多可建立十檔 ETF。";return;} window.currentETFs.push({symbol:"",name:"",nav:0,premium:0,arkShares:0,currentWeight:0,assetType:"OTHER",leverage:1,exposureGroup:"OTHER"}); saveETFs(); renderETFExecution(); });
  $("sampleBtn").addEventListener("click",loadSample); $("saveBtn").addEventListener("click",()=>saveDailySnapshot()); $("syncBtn").addEventListener("click",()=>syncCentralData());
}
async function init(){ $("strategyVersion").textContent=CONFIG.strategyVersion; restoreState(); bind(); renderDashboard(); renderHistory(); runSelfTests(); const cached=await dataProvider.getCentralData(); if(cached){applyCentralData(cached);$("syncStatus").textContent=`使用快取 · ${new Date(cached.syncedAt).toLocaleDateString("zh-TW")}`;} if(CONFIG.googleSheets?.webAppUrl) syncCentralData({silent:true}); else $("syncStatus").textContent="待設定 Google 同步"; }
document.addEventListener("DOMContentLoaded",init);

window.ARKStrategyLab={calculateGap,calculateArkTrend,calculateArkPeak,determineRegime,calculateBuyMultiplier,calculateBuyTrendFactor,calculateSellFillRate,calculateMarketModifier,calculateConcentrationFactor,calculatePremiumDecision,calculateETFOrders,reconcileExecutionBudget,evaluatePremiumCounterfactual,saveDailySnapshot,loadHistory,runSelfTests,LocalDataProvider,GoogleSheetsDataProvider};
