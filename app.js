"use strict";

const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, d = 2) => Number(Number(v).toFixed(d));
const pp = (v) => `${v >= 0 ? "+" : ""}${round(v, 2).toFixed(2)}%`;
const pct = (v, d = 1) => `${round(v, d).toFixed(d)}%`;
const num = (id, fallback = 0) => Number($(id).value || fallback);
const REGIME_ZH = {ACCUMULATION:"累積建倉",DEFENSIVE_ACCUMULATION:"防守型分批建倉",HOLD:"觀望不動",WATCH:"暫停觀察",DISTRIBUTION:"分批調節",CONFIRMED_DISTRIBUTION:"確認調節",RISK_OFF:"風險降低"};
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
    if(location.protocol==="file:") throw new Error("請從 http://127.0.0.1:4173/ 開啟網站；直接開啟 index.html 可能被瀏覽器擋下跨站同步。");
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
    $("syncStatus").textContent=silent?"更新全年資料中…":"同步中…";
    const data=await dataProvider.sync();
    applyCentralData(data);
    $("syncStatus").textContent=`Google 試算表 · ${new Date(data.syncedAt).toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`;
    $("syncStatus").title="";
    return data;
  }catch(error){
    const cached=await dataProvider.getCentralData();
    if(cached) applyCentralData(cached);
    const reason=error instanceof TypeError?"連線遭瀏覽器阻擋或網路中斷；請確認使用 http://127.0.0.1:4173/ 開啟，並檢查 Apps Script 公開權限":String(error?.message||"未知錯誤");
    $("syncStatus").textContent=`同步失敗：${reason}${cached?" · 使用上次快取":""}`;
    $("syncStatus").title=String(error?.message||reason);
    if(!silent) $("saveMessage").textContent=reason;
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

function shouldPauseBuying(state) {
  const {trend, arkHistory, cnn=0, rsi=0, marketPosition="MID"} = state;
  const rapidDrop=trend.delta1D<=-CONFIG.rapidDropPause;
  const prolongedRapidDrop=consecutiveDeclines(arkHistory)>=3&&Math.abs(Math.min(0,trend.drawdown))>=CONFIG.prolongedDropPause;
  const extremeOverheat=cnn>=80&&rsi>=80&&marketPosition==="HIGH";
  return rapidDrop||prolongedRapidDrop||extremeOverheat;
}

function determineRegime(state) {
  const {gap, trend, actualAllocation, todayArk, previousRegime="HOLD"} = state;
  if (Math.abs(gap) <= CONFIG.deadBand) return "HOLD";
  const excess = actualAllocation > todayArk;
  const dd = Math.abs(Math.min(0, trend.drawdown));
  if (excess && dd >= CONFIG.riskOffDrawdown) return "RISK_OFF";
  if (excess && dd >= CONFIG.confirmedDistributionDrawdown && ["DISTRIBUTION","CONFIRMED_DISTRIBUTION"].includes(previousRegime)) return "CONFIRMED_DISTRIBUTION";
  if (excess && consecutiveDeclines(state.arkHistory) >= 2 && dd >= CONFIG.distributionDrawdown) return "DISTRIBUTION";
  if (gap > CONFIG.deadBand) {
    if (shouldPauseBuying(state)) return "WATCH";
    const weakening=trend.delta1D<0||(previousRegime.includes("DISTRIBUTION")&&dd>1);
    if (weakening&&gap<=CONFIG.buyWatchMaxGap) return "WATCH";
    if (gap>CONFIG.defensiveAccumulationGap) return "DEFENSIVE_ACCUMULATION";
    return "ACCUMULATION";
  }
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
function calculateSellFillRate(regime, excessGap=Infinity, marketModifier=1) {
  if(excessGap<=2) return round(clamp(.22*marketModifier,.20,.25),3);
  const base=({DISTRIBUTION:CONFIG.sellFillDistribution,CONFIRMED_DISTRIBUTION:CONFIG.sellFillConfirmed,RISK_OFF:CONFIG.sellFillRiskOff})[regime]||0;
  if(excessGap<=5) return round(clamp(base*marketModifier,.15,.35),3);
  return round(clamp(base*marketModifier,0,.50),3);
}
function calculateMarketModifier(input, action) {
  let modifier=1;
  const hot=input.cnn>=65 || input.rsi>=70 || input.marketPosition==="HIGH";
  const cold=input.cnn<=25 || input.rsi<=30 || input.marketPosition==="LOW";
  if(action==="SELL") modifier *= hot ? 1.15 : (cold ? 0.85 : 1);
  if(action==="BUY") modifier *= cold ? 1.10 : (hot ? 0.90 : 1);
  return clamp(modifier,.75,1.25);
}
function calculateUrgencyScore(gap, trend, regime, action="HOLD") {
  const regimePoints={HOLD:5,WATCH:20,ACCUMULATION:45,DEFENSIVE_ACCUMULATION:50,DISTRIBUTION:60,CONFIRMED_DISTRIBUTION:78,RISK_OFF:95}[regime];
  const raw=regimePoints+Math.min(Math.abs(gap),20)-Math.min(Math.abs(trend.delta1D),5);
  if(action==="SELL"){
    const excess=Math.abs(Math.min(0,gap));
    if(excess<=2) return Math.round(clamp(50+Math.max(0,excess-CONFIG.deadBand)*15+Math.min(Math.abs(trend.drawdown),10)*.5,50,65));
    if(excess<=5) return Math.round(clamp(raw,55,80));
  }
  return Math.round(clamp(raw,0,100));
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
  if(["ACCUMULATION","DEFENSIVE_ACCUMULATION"].includes(regime)) { action="BUY"; const base=calculateBuyMultiplier(gap); rate=clamp(base*calculateBuyTrendFactor(trend.delta1D)*calculateMarketModifier(input,"BUY"),0,CONFIG.maxBuyMultiplier); const fill=gap<=10?.15:gap<=20?.12:.10; target=input.actualAllocation+gap*fill; label=regime==="DEFENSIVE_ACCUMULATION"?"DEFENSIVE ACCUMULATION":trend.delta1D<0?"SLOW ACCUMULATION":"ACCUMULATE"; }
  if(["DISTRIBUTION","CONFIRMED_DISTRIBUTION","RISK_OFF"].includes(regime)) { action="SELL"; const excessGap=Math.max(0,input.actualAllocation-input.todayArk); rate=calculateSellFillRate(regime,excessGap,calculateMarketModifier(input,"SELL")); target=input.actualAllocation-excessGap*rate; label=regime.replaceAll("_"," "); }
  if(regime==="WATCH") label="PAUSE · WATCH";
  return {gap,trend,regime,action,rate:round(rate,3),target:round(target,2),label,urgency:calculateUrgencyScore(gap,trend,regime,action),arkHistory,suggestedCapital:input.arkSuggestedCapital};
}

function parseETFData(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).slice(0,10).map((line)=>{
    const parts=line.trim().split(/\t|,|，|\s{2,}/).map(v=>v.trim()).filter(Boolean);
    if(parts[0]?.toLowerCase()==="symbol") return null;
    const [symbol,name,nav,premium,arkShares,currentWeight,assetType,leverage,exposureGroup]=parts;
    return {symbol,name,nav:Number(nav),premium:Number(String(premium).replace("%","")),arkShares:Number(arkShares),currentWeight:Number(String(currentWeight).replace("%","")),assetType,leverage:Number(leverage||1),exposureGroup};
  }).filter(e=>e&&e.symbol&&Number.isFinite(e.nav)&&Number.isFinite(e.arkShares));
}

let ocrFiles=[];
let ocrObjectUrls=[];
let ocrRows=[];
const ETF_NAME_BY_SYMBOL={"0052":"富邦科技","00631L":"元大台灣50正2","0050":"元大台灣50","00960":"野村全球航運龍頭","00875":"國泰網路資安","0056":"元大高股息","0055":"元大MSCI金融","0053":"元大電子","0057":"富邦摩台","006208":"富邦台50"};
const ARK_SCREENSHOT_GROUPS=[
  ["0052","00631L","0050","00960","00875","0056","0055","0053"],
  ["0057","006208"]
];
const escapeHtml=(value)=>String(value??"").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
const cleanOcrNumber=(value)=>{
  const cleaned=String(value??"").replace(/[OoＯ０]/g,"0").replace(/[IlＩｌ]/g,"1").replace(/[,，\s]/g,"").replace(/[^−\-+\d.%]/g,"").replace("−","-");
  const parsed=Number.parseFloat(cleaned.replace("%",""));
  return Number.isFinite(parsed)?parsed:null;
};
const cleanOcrSymbol=(value)=>String(value??"").toUpperCase().replace(/[OoＯ０]/g,"0").replace(/[IlＩｌ|]/g,"1").replace(/[^0-9A-Z]/g,"");
function flattenOcrWords(blocks){
  const words=[];
  for(const block of blocks||[]) for(const paragraph of block.paragraphs||[]) for(const line of paragraph.lines||[]) for(const word of line.words||[]) if(word.text?.trim()) words.push(word);
  return words;
}
function parseArkScreenshotWords(words,imageWidth){
  const normalized=words.map(word=>({...word,text:String(word.text||"").trim(),cx:(word.bbox.x0+word.bbox.x1)/2,cy:(word.bbox.y0+word.bbox.y1)/2}));
  const anchors=normalized.filter(word=>word.cx<imageWidth*.34&&/^0\d{3,5}[A-Z]?$/.test(cleanOcrSymbol(word.text))).sort((a,b)=>a.cy-b.cy);
  return anchors.map((anchor,index)=>{
    const top=index?((anchors[index-1].cy+anchor.cy)/2):Math.max(0,anchor.cy-(anchors[index+1]?anchors[index+1].cy-anchor.cy:150)*.62);
    const bottom=index<anchors.length-1?((anchor.cy+anchors[index+1].cy)/2):anchor.cy+(index?(anchor.cy-anchors[index-1].cy):150)*.62;
    const row=normalized.filter(word=>word.cy>=top&&word.cy<bottom);
    const left=row.filter(word=>word.cx<imageWidth*.34&&word!==anchor).sort((a,b)=>a.cy-b.cy||a.cx-b.cx);
    const name=left.map(word=>word.text.replace(/[「」［］]/g,"")).filter(text=>!/^價值$|^升溫$|^股票名稱$/.test(text)&&!/^0\d{3,5}[A-Z]?$/.test(cleanOcrSymbol(text))&&/[㐀-鿿A-Za-z]/.test(text)).join("").replace(/價值|升溫/g,"");
    const columnNumbers=(min,max)=>row.filter(word=>word.cx>=imageWidth*min&&word.cx<imageWidth*max).map(word=>({value:cleanOcrNumber(word.text),text:word.text,cy:word.cy})).filter(item=>item.value!==null).sort((a,b)=>a.cy-b.cy);
    const navColumn=columnNumbers(.34,.58),shareColumn=columnNumbers(.58,.80),capitalColumn=columnNumbers(.80,1.02);
    const premiumItem=navColumn.find(item=>item.text.includes("%"))||navColumn.find((item,i)=>i>0&&Math.abs(item.value)<=10);
    const symbol=cleanOcrSymbol(anchor.text);
    return {symbol,name:ETF_NAME_BY_SYMBOL[symbol]||name,nav:navColumn[0]?.value??null,premium:premiumItem?.value??null,arkShares:shareColumn[0]?.value??null,positionCapital:capitalColumn[0]?.value??null};
  }).filter(row=>row.symbol);
}
function parseArkScreenshotText(text){
  const lines=String(text||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean),rows=[];
  lines.forEach((line,index)=>{
    const symbolMatch=line.match(/\b0\d{3,5}[A-Z]?\b/i); if(!symbolMatch) return;
    const symbol=cleanOcrSymbol(symbolMatch[0]); let values=null;
    for(let offset=1;offset<=4&&!values;offset++){
      const candidate=lines[index-offset]||"";
      if(/\b0\d{3,5}[A-Z]?\b/i.test(candidate)) break;
      const numbers=[...candidate.matchAll(/\d+(?:[.,]\d+)?/g)].map(match=>cleanOcrNumber(match[0]));
      if(numbers.length>=3) values=numbers.slice(-3);
    }
    const premiumMatch=line.match(/[-+−]?\d+(?:\.\d+)?\s*%/);
    rows.push({symbol,name:ETF_NAME_BY_SYMBOL[symbol]||"",nav:values?.[0]??null,arkShares:values?.[1]??null,positionCapital:values?.[2]??null,premium:premiumMatch?cleanOcrNumber(premiumMatch[0]):null});
  });
  return rows;
}
function parseArkSequentialText(text,anchorRows){
  const candidates=String(text||"").split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.includes("%")&&!line.includes(":")&&!/4G|6,?532|股票名稱|布局金額/.test(line)).map(line=>[...line.matchAll(/\d+(?:[.,]\d+)?/g)].map(match=>cleanOcrNumber(match[0]))).filter(numbers=>numbers.length>=2);
  const premiums=[...String(text||"").matchAll(/[-+−]?\d+(?:\.\d+)?\s*%/g)].map(match=>cleanOcrNumber(match[0])).filter(value=>Math.abs(value)<=5);
  return anchorRows.map((row,index)=>{
    const numbers=candidates[index]||[];
    const premium=row.premium??premiums[index]??null;
    if(numbers.length>=3){ const [nav,arkShares,positionCapital]=numbers.slice(-3); return {...row,nav,arkShares,positionCapital,premium}; }
    if(numbers.length===2){ const [nav,positionCapital]=numbers; return {...row,nav,positionCapital,premium}; }
    return {...row,premium};
  });
}
function parseArkRowsByLayout(words,imageWidth,imageHeight){
  const portrait=imageHeight>imageWidth,expected=portrait?ARK_SCREENSHOT_GROUPS[0]:ARK_SCREENSHOT_GROUPS[1];
  const centers=portrait?expected.map((_,index)=>imageHeight*(.26+index*(.60/(expected.length-1)))):[imageHeight*.12,imageHeight*.43];
  const normalized=words.map(word=>({...word,text:String(word.text||"").trim(),cx:(word.bbox.x0+word.bbox.x1)/2,cy:(word.bbox.y0+word.bbox.y1)/2}));
  return expected.map((symbol,index)=>{
    const top=index?((centers[index-1]+centers[index])/2):Math.max(0,centers[index]-(centers[1]-centers[0])*.5);
    const bottom=index<centers.length-1?((centers[index]+centers[index+1])/2):Math.min(imageHeight,centers[index]+(centers[index]-centers[index-1])*.5);
    const row=normalized.filter(word=>word.cy>=top&&word.cy<bottom);
    const values=(min,max)=>row.filter(word=>word.cx>=imageWidth*min&&word.cx<imageWidth*max).map(word=>({value:cleanOcrNumber(word.text),text:word.text,cy:word.cy})).filter(item=>item.value!==null).sort((a,b)=>a.cy-b.cy);
    const navValues=values(.34,.58),shareValues=values(.58,.80),capitalValues=values(.80,1.02),premium=navValues.find(item=>item.text.includes("%"))||navValues.find((item,i)=>i>0&&Math.abs(item.value)<=5);
    return {symbol,name:ETF_NAME_BY_SYMBOL[symbol],nav:navValues[0]?.value??null,premium:premium?.value??null,arkShares:shareValues[0]?.value??null,positionCapital:capitalValues[0]?.value??null};
  });
}
function recoverArkScreenshotRows(rows,imageWidth,imageHeight){
  const expected=imageHeight>imageWidth?ARK_SCREENSHOT_GROUPS[0]:ARK_SCREENSHOT_GROUPS[1];
  const recognized=new Map(rows.map(row=>[row.symbol,row]));
  return expected.map(symbol=>recognized.get(symbol)||{symbol,name:ETF_NAME_BY_SYMBOL[symbol],nav:null,premium:null,arkShares:null,positionCapital:null});
}
function recoverPremiumsByPosition(words,imageWidth,rows){
  if(rows.length<2) return rows;
  const expectedIndex=new Map(rows.map((row,index)=>[row.symbol,index]));
  const normalized=words.map(word=>({...word,text:String(word.text||"").trim(),cx:(word.bbox.x0+word.bbox.x1)/2,cy:(word.bbox.y0+word.bbox.y1)/2}));
  const anchors=normalized.map(word=>({symbol:cleanOcrSymbol(word.text),cy:word.cy})).filter(item=>expectedIndex.has(item.symbol)).map(item=>({...item,index:expectedIndex.get(item.symbol)})).sort((a,b)=>a.index-b.index);
  if(anchors.length<2) return rows;
  const slopes=[]; for(let i=1;i<anchors.length;i++){ const deltaIndex=anchors[i].index-anchors[i-1].index; if(deltaIndex>0) slopes.push((anchors[i].cy-anchors[i-1].cy)/deltaIndex); }
  const spacing=slopes.sort((a,b)=>a-b)[Math.floor(slopes.length/2)]; if(!Number.isFinite(spacing)||spacing<=0) return rows;
  const offset=anchors.reduce((sum,item)=>sum+(item.cy-spacing*item.index),0)/anchors.length;
  const premiumWords=normalized.map(word=>({value:word.text.includes("%")?cleanOcrNumber(word.text):null,cy:word.cy,cx:word.cx})).filter(item=>item.value!==null&&Math.abs(item.value)<=5&&item.cx>=imageWidth*.28&&item.cx<imageWidth*.62);
  return rows.map((row,index)=>{ const expectedY=offset+spacing*index; const match=premiumWords.filter(item=>Math.abs(item.cy-expectedY)<spacing*.32).sort((a,b)=>Math.abs(a.cy-expectedY)-Math.abs(b.cy-expectedY))[0]; return match?{...row,premium:match.value}:row; });
}
function mergeOcrRows(rows){
  const merged=new Map();
  rows.forEach(row=>{ const old=merged.get(row.symbol)||{}; merged.set(row.symbol,{...old,...Object.fromEntries(Object.entries(row).filter(([,value])=>value!==null&&value!==""))}); });
  return [...merged.values()].slice(0,10).map(row=>{
    let nav=row.nav===null||row.nav===undefined?NaN:Number(row.nav),shares=row.arkShares===null||row.arkShares===undefined?NaN:Number(row.arkShares),capital=row.positionCapital===null||row.positionCapital===undefined?NaN:Number(row.positionCapital);
    if(nav>=1000) nav=nav/100; if(!Number.isFinite(nav)||nav<5||nav>1000) nav=null;
    if(!Number.isInteger(shares)||shares<0||shares>20) shares=null;
    if(!Number.isFinite(capital)||capital<0||capital>20000) capital=null;
    if(Number.isFinite(nav)&&Number.isFinite(capital)){ const inferredShares=Math.round(capital/nav),inferredCapital=Math.ceil(nav*inferredShares); if(inferredShares>=0&&inferredShares<=20&&Math.abs(capital-inferredCapital)<=2) shares=inferredShares; }
    if(capital===0&&!Number.isFinite(shares)) shares=0;
    if(shares===0&&(!Number.isFinite(capital)||capital!==0)) capital=0;
    const expected=Number.isFinite(nav)&&Number.isFinite(shares)?Math.ceil(nav*shares):null;
    if(expected!==null) capital=expected;
    return {...row,name:ETF_NAME_BY_SYMBOL[row.symbol]||row.name,nav:Number.isFinite(nav)?round(nav,2):null,arkShares:Number.isFinite(shares)?shares:null,positionCapital:Number.isFinite(capital)?capital:null};
  });
}
const isMobileOcrDevice=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||matchMedia("(pointer: coarse)").matches;
async function prepareOcrImage(file){
  const bitmap=await createImageBitmap(file),mobile=isMobileOcrDevice(),maxWidth=mobile?1500:1800,maxPixels=mobile?3800000:7000000,scale=Math.min(mobile?1.35:2,maxWidth/bitmap.width,Math.sqrt(maxPixels/(bitmap.width*bitmap.height))),canvas=document.createElement("canvas");
  canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
  const context=canvas.getContext("2d"); context.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
  return {image:canvas,width:canvas.width,height:canvas.height};
}
function prepareMobileNumericCrop(prepared){ const x=Math.round(prepared.width*.28),canvas=document.createElement("canvas"); canvas.width=prepared.width-x; canvas.height=prepared.height; canvas.getContext("2d").drawImage(prepared.image,x,0,canvas.width,canvas.height,0,0,canvas.width,canvas.height); return {image:canvas,x}; }
function offsetOcrWords(words,xOffset){ return words.map(word=>({...word,bbox:{...word.bbox,x0:word.bbox.x0+xOffset,x1:word.bbox.x1+xOffset}})); }
function renderOcrReview(){
  $("ocrReview").hidden=!ocrRows.length;
  $("ocrReviewGrid").innerHTML=ocrRows.map((row,index)=>`<article class="ocr-result-card"><strong>${escapeHtml(row.symbol||`第 ${index+1} 檔`)}</strong><div class="ocr-fields"><label>代號<input data-ocr-index="${index}" data-ocr-field="symbol" value="${escapeHtml(row.symbol)}"></label><label>名稱<input data-ocr-index="${index}" data-ocr-field="name" value="${escapeHtml(row.name)}"></label><label>淨值<input type="number" step="0.01" data-ocr-index="${index}" data-ocr-field="nav" value="${row.nav??""}"></label><label>折溢價 %<input type="number" step="0.01" data-ocr-index="${index}" data-ocr-field="premium" value="${row.premium??""}"></label><label>位階股數<input type="number" min="0" step="1" data-ocr-index="${index}" data-ocr-field="arkShares" value="${row.arkShares??""}"></label><label>位階佈局金額<input type="number" min="0" step="1" data-ocr-index="${index}" data-ocr-field="positionCapital" value="${row.positionCapital??""}"></label></div></article>`).join("");
}
function resetOcrImport(){
  ocrObjectUrls.forEach(URL.revokeObjectURL); ocrObjectUrls=[]; ocrFiles=[]; ocrRows=[]; $("ocrImages").value=""; $("ocrImagePreview").innerHTML=""; $("ocrReview").hidden=true; $("ocrProgress").hidden=true; $("clearOcrBtn").hidden=true; $("runOcrBtn").disabled=true; $("ocrStatus").textContent="尚未選擇圖片";
}
async function recognizeArkScreenshots(){
  if(location.protocol==="file:"){ $("ocrStatus").textContent="OCR 無法在直接開啟的 file:// 網頁運作。請關閉本頁，改為雙擊「啟動網站.cmd」。"; return; }
  if(!ocrFiles.length||!window.Tesseract){ $("ocrStatus").textContent="OCR 引擎未成功載入，請確認 vendor/tesseract 資料夾已上傳。"; return; }
  $("runOcrBtn").disabled=true; $("ocrProgress").hidden=false; $("ocrProgressBar").style.width="2%"; $("ocrStatus").textContent="正在載入本機辨識模型…";
  let worker;
  try{
    const mobile=isMobileOcrDevice(),languages=mobile?["eng"]:["chi_tra","eng"];
    worker=await Tesseract.createWorker(languages,Tesseract.OEM.LSTM_ONLY,{workerPath:"vendor/tesseract/worker.min.js",langPath:"vendor/tesseract/lang",corePath:"vendor/tesseract",logger:message=>{ if(message.progress!==undefined){ const progress=Math.round((message.progress*.75)*100); $("ocrProgressBar").style.width=`${Math.max(2,progress)}%`; $("ocrStatus").textContent=`${message.status==="recognizing text"?"辨識文字":"準備模型"}… ${Math.round(message.progress*100)}%`; } }});
    await worker.setParameters(mobile?{tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT,preserve_interword_spaces:"1",tessedit_char_whitelist:"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.,+-%"}:{tessedit_pageseg_mode:Tesseract.PSM.AUTO,preserve_interword_spaces:"1"});
    const found=[],imageResults=[],failures=[];
    for(let i=0;i<ocrFiles.length;i++){
      $("ocrStatus").textContent=`正在辨識第 ${i+1} / ${ocrFiles.length} 張…`;
      let prepared,numericCrop;
      try{
        prepared=await prepareOcrImage(ocrFiles[i]);
        numericCrop=mobile?prepareMobileNumericCrop(prepared):null;
        const result=await worker.recognize(numericCrop?.image||prepared.image,{}, {text:true,blocks:true}),rawWords=flattenOcrWords(result.data.blocks),allWords=numericCrop?offsetOcrWords(rawWords,numericCrop.x):rawWords,layoutRows=parseArkRowsByLayout(allWords,prepared.width,prepared.height),detectedRows=mobile?[]:parseArkScreenshotWords(allWords,prepared.width),expectedRows=recoverArkScreenshotRows([...layoutRows,...detectedRows],prepared.width,prepared.height),wordRows=recoverPremiumsByPosition(allWords,prepared.width,expectedRows),rows=[...wordRows,...parseArkScreenshotText(result.data.text),...parseArkSequentialText(result.data.text,wordRows)];
        found.push(...rows); imageResults.push(mergeOcrRows(rows).length);
      }catch(imageError){ console.error(imageError); failures.push(i+1); imageResults.push(0); }
      finally{ if(numericCrop?.image){numericCrop.image.width=1;numericCrop.image.height=1;} if(prepared?.image){prepared.image.width=1;prepared.image.height=1;} }
    }
    if(!found.length) throw new Error("兩張圖片都無法完成辨識，請重新整理頁面後再試。");
    ocrRows=mergeOcrRows(found); renderOcrReview(); $("ocrProgressBar").style.width="100%";
    const detail=imageResults.map((count,index)=>`第${index+1}張 ${count} 檔`).join("、"),retry=failures.length?`；第 ${failures.join("、")} 張未完成，可重新選圖再試。`:"";
    $("ocrStatus").textContent=ocrRows.length?`已辨識 ${ocrRows.length} 檔 ETF（${detail}），請核對後套用${retry}`:"未找到 ETF 代號，請改用清晰、未裁掉代號的截圖。";
  }catch(error){ console.error(error); const message=String(error?.message||error||""); const hint=/worker|fetch|network|load/i.test(message)?"請確認是由 GitHub Pages 或「啟動網站.cmd」開啟，並確認 vendor/tesseract 已上傳。":"請重新選擇清晰截圖。"; $("ocrStatus").textContent=`辨識失敗。${hint}${message?` （${message.slice(0,120)}）`:""}`; }
  finally{ if(worker) await worker.terminate(); $("runOcrBtn").disabled=!ocrFiles.length; }
}
function applyOcrRows(){
  const numericFields=["nav","premium","arkShares","positionCapital"];
  ocrRows=ocrRows.map((row,index)=>{ const inputs=[...document.querySelectorAll(`[data-ocr-index="${index}"]`)]; const next={...row}; inputs.forEach(input=>{next[input.dataset.ocrField]=numericFields.includes(input.dataset.ocrField)?cleanOcrNumber(input.value):input.value.trim();}); return next; }).filter(row=>row.symbol);
  const existing=new Map((window.currentETFs||[]).map(etf=>[etf.symbol,etf]));
  window.currentETFs=ocrRows.slice(0,10).map(row=>{ const old=existing.get(row.symbol)||{}; const leveraged=/L$/.test(row.symbol); return {...old,symbol:row.symbol,name:row.name||old.name||"",nav:row.nav??old.nav??0,premium:row.premium??old.premium??0,arkShares:row.arkShares??old.arkShares??0,positionCapital:row.positionCapital??old.positionCapital??0,currentWeight:old.currentWeight??0,assetType:old.assetType||(leveraged?"LEVERAGED_TW":"TAIWAN_EQUITY"),leverage:old.leverage||(leveraged?2:1),exposureGroup:old.exposureGroup||"OTHER"}; });
  saveETFs(); renderDashboard(); $("ocrStatus").textContent=`已套用 ${window.currentETFs.length} 檔 ETF 資料，包含位階股數為 0 的檔案。`;
  $("etfCards").scrollIntoView({behavior:"smooth",block:"start"});
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

function predictMarketPosition(records,input){
  const valid=records.filter(row=>Number.isFinite(Number(row.taiwanIndex))&&Number(row.taiwanIndex)>0),recent=valid.slice(-20);
  if(recent.length<5) return {value:"MID",label:"區間震盪",reason:"可用的大盤資料不足5筆，暫列區間震盪。",rangePosition:null};
  const indices=recent.map(row=>Number(row.taiwanIndex)),latest=indices.at(-1),low=Math.min(...indices),high=Math.max(...indices),rangePosition=high===low?.5:(latest-low)/(high-low);
  let highScore=rangePosition>=.8?2:rangePosition>=.65?1:0,lowScore=rangePosition<=.2?2:rangePosition<=.35?1:0;
  const reasons=[`大盤位於近20筆區間的 ${(rangePosition*100).toFixed(0)}% 位置`];
  const year=Number(String(valid.at(-1)?.date||new Date().getFullYear()).slice(0,4)),events=buildArkLevelEvents(getAnnualArkRecords(records,year)),highEvents=summarizeArkEvents(events,"HIGH"),lowEvents=summarizeArkEvents(events,"LOW");
  if(input.todayArk>=80&&highEvents.count){ if(highEvents.averageChange>0)lowScore+=1;else if(highEvents.averageChange<0)highScore+=1; reasons.push(`ARK處於80%以上；今年高水位事件離開前大盤平均 ${highEvents.averageChange>=0?'+':''}${highEvents.averageChange.toFixed(2)}%`); }
  if(input.todayArk<=64&&lowEvents.count){ if(lowEvents.averageChange>1)lowScore+=1;else if(lowEvents.averageChange<-1)highScore+=1; reasons.push(`ARK處於64%以下；今年低水位事件離開前大盤平均 ${lowEvents.averageChange>=0?'+':''}${lowEvents.averageChange.toFixed(2)}%`); }
  if(input.cnn>=70){highScore+=1;reasons.push("CNN偏貪婪");} else if(input.cnn<=30){lowScore+=1;reasons.push("CNN偏恐懼");}
  if(input.rsi>=70){highScore+=1;reasons.push("RSI偏熱");} else if(input.rsi<=30){lowScore+=1;reasons.push("RSI偏冷");}
  const value=highScore-lowScore>=2?"HIGH":lowScore-highScore>=2?"LOW":"MID",label={HIGH:"區間高點",LOW:"區間低點",MID:"區間震盪"}[value];
  return {value,label,reason:`${reasons.join("；")}。高點分數 ${highScore}、低點分數 ${lowScore}，預測為${label}。`,rangePosition};
}
function getInput() {
  const input={todayArk:num("todayArk"),actualAllocation:num("actualAllocation"),arkSuggestedCapital:num("arkSuggestedCapital"),cnn:num("cnn"),rsi:num("rsi"),margin:num("margin"),arkHistory:[...SOURCE_HISTORY.slice(0,-3),num("ark5D"),num("ark3D"),num("yesterdayArk")],previousRegime:(loadHistory().at(-1)||{}).regime};
  const prediction=predictMarketPosition(window.centralRecords||[],input); input.marketPosition=prediction.value; $("marketPosition").value=prediction.value; $("marketPositionLabel").textContent=prediction.label; $("marketPositionReason").textContent=prediction.reason; return input;
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
function decisionReasons(input,d){ const r=[]; r.push(`實際配置比 ARK 目標${d.gap>=0?"低":"高"} ${Math.abs(d.gap).toFixed(2)}%。`); if(Math.abs(d.gap)<=CONFIG.deadBand) r.push("缺口位於 ±1% 的無動作區間內，因此今日不建議交易。"); else if(d.gap>0) r.push("目前配置不足，依缺口大小分級補足，ARK 趨勢只用來調整買進速度。"); else r.push("只有超出 ARK 目標的部位可列入調節範圍。"); r.push(`ARK 一日變化為 ${pp(d.trend.delta1D)}，相較近十日高點為 ${pp(d.trend.drawdown)}。`); if(d.regime==="WATCH"&&d.gap<=CONFIG.buyWatchMaxGap) r.push("缺口只有 1–5% 且 ARK 走弱，今日可暫停加碼並觀察。"); if(d.regime==="WATCH"&&d.gap>CONFIG.buyWatchMaxGap) r.push("目前觸發快速下降、連續深度回撤或市場極端過熱等明確停買條件。"); if(d.action==="SELL"){ const excess=Math.abs(d.gap),reduction=input.actualAllocation-d.target; r.push(`本次只處理超額部位的 ${(d.rate*100).toFixed(0)}%，預計降低 ${reduction.toFixed(2)}%。`); if(excess<=2) r.push("超額幅度只有 1–2%，已限制賣出速度與急迫度，避免過度調節。"); } if(d.action==="BUY"&&d.gap>CONFIG.defensiveAccumulationGap) r.push("缺口超過 20%，即使 ARK 單日下降仍採防守型分批建倉；今日只補 10% 缺口，不一次追到目標。"); else if(d.action==="BUY"&&d.trend.delta1D<0) r.push("ARK 走弱時保留買進方向，但降低建倉速度。"); return r; }
function buildTrendSummary(d){
  const records=(window.centralRecords||[]).slice(-10).filter(row=>Number.isFinite(Number(row.arkAllocation))&&Number.isFinite(Number(row.taiwanIndex)));
  const arkText=d.trend.delta1D>0?`今日 ARK 比昨日提高 ${Math.abs(d.trend.delta1D).toFixed(2)}%。`:d.trend.delta1D<0?`今日 ARK 比昨日降低 ${Math.abs(d.trend.delta1D).toFixed(2)}%。`:"今日 ARK 與昨日相同。";
  if(records.length<2) return `${arkText} 同步更多日期與大盤指數後，可比較兩者的短期方向。`;
  let comparable=0,same=0;
  for(let i=1;i<records.length;i++){ const arkChange=Number(records[i].arkAllocation)-Number(records[i-1].arkAllocation),indexChange=Number(records[i].taiwanIndex)-Number(records[i-1].taiwanIndex); if(arkChange===0||indexChange===0)continue; comparable++; if(Math.sign(arkChange)===Math.sign(indexChange))same++; }
  const latestIndexChange=Number(records.at(-1).taiwanIndex)-Number(records.at(-2).taiwanIndex),relation=!comparable?"目前可比較資料不足":same/comparable>=.7?"近十筆資料多數呈同向變化":same/comparable<=.3?"近十筆資料多數呈反向變化":"近十筆資料的方向關係較混合";
  return `${arkText} 台灣加權指數最新變化為 ${latestIndexChange>=0?"上漲":"下跌"} ${Math.abs(latestIndexChange).toLocaleString("zh-TW",{maximumFractionDigits:0})} 點；${relation}。`;
}
function quantile(values,p){ const sorted=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b); if(!sorted.length)return null; const index=(sorted.length-1)*p,lower=Math.floor(index),upper=Math.ceil(index); return lower===upper?sorted[lower]:sorted[lower]+(sorted[upper]-sorted[lower])*(index-lower); }
function getAnnualArkRecords(records,year=Number(new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}).slice(0,4))){ return records.filter(row=>String(row.date).startsWith(`${year}-`)&&Number.isFinite(Number(row.arkAllocation))).map(row=>({...row,arkAllocation:Number(row.arkAllocation),taiwanIndex:Number(row.taiwanIndex)})).sort((a,b)=>String(a.date).localeCompare(String(b.date))); }
function getAnnualArkLevelRecords(records,year,high=80,low=64){ return getAnnualArkRecords(records,year).filter(row=>row.arkAllocation>=high||row.arkAllocation<=low).sort((a,b)=>String(b.date).localeCompare(String(a.date))); }
function buildArkLevelEvents(records,high=80,low=64){ const events=[]; let active=null; const kind=row=>row.arkAllocation>=high?"HIGH":row.arkAllocation<=low?"LOW":null; const close=(exit)=>{ if(!active)return; active.exit=exit||null; active.duration=active.rows.length; active.extreme=active.kind==="HIGH"?active.rows.reduce((a,b)=>b.arkAllocation>a.arkAllocation?b:a):active.rows.reduce((a,b)=>b.arkAllocation<a.arkAllocation?b:a); const startIndex=Number(active.entry.taiwanIndex),exitIndex=Number(active.exit?.taiwanIndex); active.indexChange=Number.isFinite(startIndex)&&startIndex!==0&&Number.isFinite(exitIndex)?(exitIndex-startIndex)/startIndex*100:null; events.push(active); active=null; }; for(const row of records){ const rowKind=kind(row); if(!active&&rowKind){active={kind:rowKind,entry:row,rows:[row]};continue;} if(active&&rowKind===active.kind){active.rows.push(row);continue;} if(active){close(row);if(rowKind)active={kind:rowKind,entry:row,rows:[row]};} } close(null); return events; }
function summarizeArkEvents(events,kind){ const completed=events.filter(event=>event.kind===kind&&event.exit&&Number.isFinite(event.indexChange)); if(!completed.length)return {count:0,averageDuration:null,averageChange:null,positiveRate:null}; return {count:completed.length,averageDuration:completed.reduce((sum,event)=>sum+event.duration,0)/completed.length,averageChange:completed.reduce((sum,event)=>sum+event.indexChange,0)/completed.length,positiveRate:completed.filter(event=>event.indexChange>0).length/completed.length*100}; }
const formatIndex=value=>Number.isFinite(Number(value))?Number(value).toLocaleString("zh-TW",{maximumFractionDigits:2}):"—";
const formatDate=value=>value?String(value).replaceAll("-","/"):"尚未離開";
function renderArkLevelRecords(){ const year=Number(new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}).slice(0,4)),annual=getAnnualArkRecords(window.centralRecords||[],year),levels=getAnnualArkLevelRecords(annual,year),values=annual.map(row=>row.arkAllocation),events=buildArkLevelEvents(annual),highSummary=summarizeArkEvents(events,"HIGH"),lowSummary=summarizeArkEvents(events,"LOW"); $("arkLevelCount").textContent=`${levels.length} 筆 · ${events.length} 個事件`; if(!annual.length){$("arkLevelRecords").innerHTML=`<p class="note">${year} 年目前沒有可分析的方舟水位紀錄。</p>`;return;} const distribution=[['最低',Math.min(...values)],['中位數',quantile(values,.5)],['最高',Math.max(...values)],['前10%分界',quantile(values,.9)],['後10%分界',quantile(values,.1)]]; const summaryCard=(label,summary,kind)=>`<div class="event-summary ${kind.toLowerCase()}"><span>${label} · 已完成 ${summary.count} 次</span><strong>${summary.count?`平均 ${summary.averageDuration.toFixed(1)} 個交易日 · 大盤 ${summary.averageChange>=0?'+':''}${summary.averageChange.toFixed(2)}%`:"尚無完整事件"}</strong><small>${summary.count?`進入至離開期間大盤上漲比例 ${summary.positiveRate.toFixed(0)}%`:`需要出現進入與離開紀錄後才能統計`}</small></div>`; $("arkLevelRecords").innerHTML=`<section class="ark-research-block"><h3>${year} 年水位分布</h3><div class="distribution-grid">${distribution.map(([label,value])=>`<div><span>${label}</span><strong>${pct(value,1)}</strong></div>`).join("")}</div></section><section class="ark-research-block"><h3>極端水位日期明細</h3><div class="ark-level-row ark-level-head"><span>日期</span><span>台灣加權指數</span><span>方舟建議持股</span></div>${levels.map(row=>`<div class="ark-level-row"><span>${formatDate(row.date)}</span><strong>${formatIndex(row.taiwanIndex)}</strong><strong class="${row.arkAllocation>=80?"level-high":"level-low"}">${pct(row.arkAllocation,1)}</strong></div>`).join("")||`<p class="note">目前沒有80%以上或64%以下紀錄。</p>`}</section><section class="ark-research-block"><h3>極端水位事件與歷史規律</h3><div class="event-summary-grid">${summaryCard("高水位 ≥80%",highSummary,"HIGH")}${summaryCard("低水位 ≤64%",lowSummary,"LOW")}</div><div class="event-list">${events.slice().reverse().map(event=>`<article class="event-card ${event.kind.toLowerCase()}"><div class="event-card-head"><strong>${event.kind==="HIGH"?"高水位事件":"低水位事件"}</strong><span>${event.duration} 個交易日</span></div><dl><div><dt>進入日</dt><dd>${formatDate(event.entry.date)} · 大盤 ${formatIndex(event.entry.taiwanIndex)} · ARK ${pct(event.entry.arkAllocation,1)}</dd></div><div><dt>區間${event.kind==="HIGH"?"最高":"最低"}</dt><dd>${formatDate(event.extreme.date)} · 大盤 ${formatIndex(event.extreme.taiwanIndex)} · ARK ${pct(event.extreme.arkAllocation,1)}</dd></div><div><dt>離開日</dt><dd>${event.exit?`${formatDate(event.exit.date)} · 大盤 ${formatIndex(event.exit.taiwanIndex)} · ARK ${pct(event.exit.arkAllocation,1)}`:"尚未離開極端區間"}</dd></div><div><dt>區間大盤變化</dt><dd>${Number.isFinite(event.indexChange)?`${event.indexChange>=0?'+':''}${event.indexChange.toFixed(2)}%`:"事件進行中"}</dd></div></dl></article>`).join("")||`<p class="note">目前尚未形成極端水位事件。</p>`}</div><p class="research-warning">歷史規律只反映今年樣本，不能單獨視為買賣訊號；建議累積更多完成事件後，再用於調整買進／賣出速度。</p></section>`; }
function renderDashboard(){ const input=getInput(),d=calculateDecision(input),reduction=Math.max(0,input.actualAllocation-d.target),increase=Math.max(0,d.target-input.actualAllocation); window.currentDecision=d; $("arkTarget").textContent=pct(input.todayArk); $("actualValue").textContent=pct(input.actualAllocation,2); $("gapValue").textContent=pp(d.gap); $("gapLabel").textContent=Math.abs(d.gap)<=1?"無動作區間":d.gap>0?"配置不足":"配置超額"; $("trendValue").textContent=pp(d.trend.delta1D); $("drawdownValue").textContent=pp(d.trend.drawdown); $("regimeValue").textContent=regimeZh(d.regime); $("actionValue").textContent=d.regime==="WATCH"?"暫停加碼並觀察":d.regime==="DEFENSIVE_ACCUMULATION"?"防守型分批建倉":d.action==="BUY"?(d.trend.delta1D<0?"減速建倉":"分批建倉"):d.action==="SELL"?regimeZh(d.regime):"今日不交易"; $("speedValue").textContent=d.action==="BUY"?`×${d.rate.toFixed(2)}`:d.action==="SELL"?`賣出超額部位的 ${(d.rate*100).toFixed(0)}%`:"0"; $("targetExecution").textContent=d.action==="SELL"?`預計降低 ${reduction.toFixed(2)}% · ${input.actualAllocation.toFixed(2)}% → ${d.target.toFixed(2)}%`:d.action==="BUY"?`預計提高 ${increase.toFixed(2)}% · ${input.actualAllocation.toFixed(2)}% → ${d.target.toFixed(2)}%`:pct(d.target,2); $("targetCapital").textContent=d.action==="BUY"&&d.suggestedCapital>0?`NT$ ${Math.round(d.suggestedCapital).toLocaleString("zh-TW")}`:"—"; $("executionSpeed").textContent=d.action==="BUY"?`${d.regime==="DEFENSIVE_ACCUMULATION"?"防守買進":"買進"} ×${d.rate.toFixed(2)}`:d.action==="SELL"?`賣出超額部位的 ${(d.rate*100).toFixed(0)}%`:`不交易`; $("urgencyScore").textContent=`${d.urgency} / 100`; $("actionBadge").textContent=actionZh(d.action); $("actionBadge").className=`badge ${d.action.toLowerCase()}`; $("decisionReasons").innerHTML=decisionReasons(input,d).map(x=>`<li>${x}</li>`).join(""); $("trendSummary").textContent=buildTrendSummary(d); [1,2,3,5].forEach(n=>$("delta"+n+"D").textContent=pp(d.trend[`delta${n}D`])); renderSparkline(); renderArkLevelRecords(); renderETFExecution(); persistState(); }
function renderETFExecution(){ const etfs=window.currentETFs||[]; const rec=reconcileExecutionBudget(calculateETFOrders(etfs,window.currentDecision),window.currentDecision); $("etfCards").innerHTML=rec.orders.map((o,i)=>`<article class="etf-card ${o.status.startsWith("STOP")?"stop":o.status.startsWith("WAIT")?"wait":""}"><div class="etf-title"><strong>${o.symbol||"新 ETF"}</strong><button class="remove-etf" type="button" data-remove-etf="${i}" title="移除">×</button></div><div class="etf-basic"><label>代號<input data-etf-index="${i}" data-etf-field="symbol" value="${o.symbol||""}"></label><label>名稱<input data-etf-index="${i}" data-etf-field="name" value="${o.name||""}"></label></div><div class="etf-edit-grid"><label>今日淨值<input type="number" step="0.01" data-etf-index="${i}" data-etf-field="nav" value="${o.nav}"></label><label>溢價率 %<input type="number" step="0.01" data-etf-index="${i}" data-etf-field="premium" value="${o.premium}"></label><label>位階股數<input type="number" min="0" step="1" data-etf-index="${i}" data-etf-field="arkShares" value="${o.arkShares}"></label><label>位階佈局金額<input type="number" min="0" step="1" data-etf-index="${i}" data-etf-field="positionCapital" value="${o.positionCapital??0}"></label><label>目前權重 %<input type="number" min="0" step="0.1" data-etf-index="${i}" data-etf-field="currentWeight" value="${o.currentWeight}"></label></div><details class="etf-advanced"><summary>ETF 基本設定（通常不需每日修改）</summary><div class="etf-edit-grid"><label>資產類型<select data-etf-index="${i}" data-etf-field="assetType">${["TAIWAN_EQUITY","US_EQUITY","GLOBAL_EQUITY","LEVERAGED_TW","OTHER"].map(v=>`<option value="${v}" ${o.assetType===v?"selected":""}>${v}</option>`).join("")}</select></label><label>槓桿倍數<input type="number" min="1" step="1" data-etf-index="${i}" data-etf-field="leverage" value="${o.leverage}"></label><label>曝險群組<input data-etf-index="${i}" data-etf-field="exposureGroup" value="${o.exposureGroup||"OTHER"}"></label></div></details><div class="factors"><div><span>全域倍數</span><strong>×${o.global.toFixed(2)}</strong></div><div><span>集中度</span><strong>×${o.concentrationFactor.toFixed(2)}</strong></div><div><span>溢價因子</span><strong>×${o.premiumFactor.toFixed(2)}</strong></div></div><div class="final-shares"><div><span>最終建議股數</span><strong>${o.finalShares}</strong></div><span class="badge ${o.status.includes("STOP")?"sell":o.status.includes("WAIT")?"hold":"buy"}">${statusZh(o.status)}</span></div></article>`).join("")||`<p class="note">尚未建立 ETF。請按「新增 ETF」或「載入範例」。</p>`; $("globalBudget").textContent=Math.round(rec.globalTarget).toLocaleString("zh-TW"); $("orderTotal").textContent=Math.round(rec.total).toLocaleString("zh-TW"); $("unallocated").textContent=Math.round(rec.unallocated).toLocaleString("zh-TW"); }
function loadHistory(){ try{return JSON.parse(localStorage.getItem(CONFIG.storageKeys.history)||"[]");}catch{return [];} }
function saveDailySnapshot(force=false){ const history=loadHistory(),date=$("decisionDate").value,index=history.findIndex(x=>x.date===date); if(index>=0&&!force&&!confirm("今天已有紀錄，是否更新今日資料？")) return; const input=getInput(),d=window.currentDecision,snapshot={date,ark:input.todayArk,actual:input.actualAllocation,gap:d.gap,regime:d.regime,buyMultiplier:d.action==="BUY"?d.rate:0,sellFillRate:d.action==="SELL"?d.rate:0,suggestedExecution:d.target,arkSuggestedCapital:input.arkSuggestedCapital,marketIndicators:{cnn:input.cnn,rsi:input.rsi,margin:input.margin,marketPosition:input.marketPosition},strategyVersion:CONFIG.strategyVersion,etfDecisions:calculateETFOrders(window.currentETFs||[],d)}; if(index>=0)history[index]=snapshot;else history.push(snapshot); history.sort((a,b)=>a.date.localeCompare(b.date)); localStorage.setItem(CONFIG.storageKeys.history,JSON.stringify(history.slice(-CONFIG.historyLimit))); $("saveMessage").textContent=index>=0?"今日紀錄已更新。":"今日紀錄已儲存。"; renderHistory(); }
function renderHistory(){ const h=loadHistory(); $("historyCount").textContent=`${h.length} / ${CONFIG.historyLimit}`; $("historyCards").innerHTML=h.slice(-8).reverse().map(x=>`<div class="history-row"><span>${x.date}</span><span>ARK <strong>${pct(x.ark)}</strong></span><span>實際配置 <strong>${pct(x.actual,2)}</strong></span><span>缺口 <strong>${pp(x.gap)}</strong></span><span>狀態 <strong>${regimeZh(x.regime)}</strong></span><span>目標配置 <strong>${pct(x.suggestedExecution,2)}</strong></span><span>${x.strategyVersion}</span></div>`).join("")||`<p class="note">目前尚無已儲存的紀錄。</p>`; }
function persistState(){ const ids=["todayArk","actualAllocation","arkSuggestedCapital","yesterdayArk","ark3D","ark5D","peak10D","cnn","rsi","margin","marketPosition"]; const state=Object.fromEntries(ids.map(id=>[id,$(id).value])); localStorage.setItem(CONFIG.storageKeys.state,JSON.stringify(state)); }
function restoreState(){ const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}),defaults={todayArk:73.6,actualAllocation:67.9,arkSuggestedCapital:50000,yesterdayArk:76.6,ark3D:78.2,ark5D:79,peak10D:79,cnn:50,rsi:50,margin:0,marketPosition:"MID"}; let saved={};try{saved=JSON.parse(localStorage.getItem(CONFIG.storageKeys.state)||"{}");}catch{} Object.entries({...defaults,...saved}).forEach(([k,v])=>{if($(k))$(k).value=v;}); $("decisionDate").value=today; $("decisionDateDisplay").textContent=today.replaceAll("-","/"); window.centralRecords=SOURCE_RECORDS; try{window.currentETFs=JSON.parse(localStorage.getItem(CONFIG.storageKeys.etfs)||"null")||SAMPLE_ETFS.map(toETF);}catch{window.currentETFs=SAMPLE_ETFS.map(toETF);} }
function toETF(a){return {symbol:a[0],name:a[1],nav:a[2],premium:a[3],arkShares:a[4],positionCapital:0,currentWeight:a[5],assetType:a[6],leverage:a[7],exposureGroup:a[8]};}
function loadSample(){ window.currentETFs=SAMPLE_ETFS.map(toETF); localStorage.setItem(CONFIG.storageKeys.etfs,JSON.stringify(window.currentETFs)); renderETFExecution(); }
function runSelfTests(){ const tests=[]; const test=(name,fn)=>{try{tests.push([name,Boolean(fn())]);}catch{tests.push([name,false]);}}; const base={cnn:50,rsi:50,marketPosition:"MID",previousRegime:"HOLD"};
  test("無動作區間會回傳觀望不動",()=>calculateDecision({...base,todayArk:73,actualAllocation:73,arkHistory:[73,73,73,73,73,73,73]}).regime==="HOLD");
  test("配置不足會回傳買進",()=>calculateDecision({...base,todayArk:80,actualAllocation:70,arkHistory:[78,78,79,79,80,80,80]}).action==="BUY");
  test("大缺口倍數低於三倍",()=>calculateBuyMultiplier(22.15)<3);
  test("87→84→81 會進入分批調節",()=>calculateDecision({...base,todayArk:81,actualAllocation:84,arkHistory:[87,87,87,87,87,84]}).regime==="DISTRIBUTION");
  test("回撤 8% 會進入風險降低",()=>calculateDecision({...base,todayArk:79,actualAllocation:84,arkHistory:[87,87,87,87,87,83]}).regime==="RISK_OFF");
  test("溢價高於 0.5% 不會一律等待",()=>calculatePremiumDecision({premium:.8},90,1).status!=="WAIT FOR NAV");
  test("達集中度上限會停止加碼",()=>calculateConcentrationFactor({currentWeight:12,leverage:1,assetType:"TAIWAN_EQUITY"})===0);
  test("最終委託不超過執行預算",()=>{const d=calculateDecision({...base,todayArk:80,actualAllocation:70,arkHistory:[76,77,78,79,80,80,80]});const r=reconcileExecutionBudget(calculateETFOrders(SAMPLE_ETFS.map(toETF),d),d);return r.total<=r.globalTarget+.01;});
  test("本機儲存與載入正常",()=>{const k="arkStrategyLab.test";localStorage.setItem(k,"ok");const ok=localStorage.getItem(k)==="ok";localStorage.removeItem(k);return ok;});
  test("同日紀錄可更新而不重複",()=>{const a=[{date:"2026-01-01"}],i=a.findIndex(x=>x.date==="2026-01-01");a[i]={date:"2026-01-01",updated:true};return a.length===1&&a[0].updated;});
  test("小幅超額時只處理 20–25%",()=>{const d=calculateDecision({...base,todayArk:70.4,actualAllocation:72,arkHistory:[79,78,77,76,74,73.6]});return d.action==="SELL"&&d.rate>=.20&&d.rate<=.25;});
  test("小幅超額急迫度限於 50–65",()=>{const d=calculateDecision({...base,todayArk:70.4,actualAllocation:72,arkHistory:[79,78,77,76,74,73.6]});return d.urgency>=50&&d.urgency<=65;});
  test("超額超過 5% 風險降低可處理 50%",()=>{const d=calculateDecision({...base,todayArk:70,actualAllocation:76,arkHistory:[79,79,79,78,74,72]});return d.regime==="RISK_OFF"&&d.rate===.5;});
  test("1–5% 缺口且 ARK 下跌可暫停觀察",()=>calculateDecision({...base,todayArk:70,actualAllocation:67,arkHistory:[75,74,73,72,71,72]}).regime==="WATCH");
  test("5–20% 缺口且 ARK 下跌仍會減速建倉",()=>{const d=calculateDecision({...base,todayArk:70,actualAllocation:60,arkHistory:[76,75,74,73,72,73.2]});return d.regime==="ACCUMULATION"&&d.action==="BUY";});
  test("超過 20% 缺口會防守型分批建倉",()=>{const d=calculateDecision({...base,todayArk:70.4,actualAllocation:20,arkHistory:[79,78,77,76,74,73.6]});return d.regime==="DEFENSIVE_ACCUMULATION"&&d.action==="BUY"&&d.target===25.04;});
  test("單日快速下降仍可觸發明確停買",()=>calculateDecision({...base,todayArk:70,actualAllocation:20,arkHistory:[81,80,79,78,77,77]}).regime==="WATCH");
  test("年度方舟水位只保留 80% 以上與 64% 以下",()=>{const rows=getAnnualArkLevelRecords([{date:"2026-01-01",arkAllocation:80},{date:"2026-01-02",arkAllocation:70},{date:"2026-01-03",arkAllocation:64}],2026);return rows.length===2;});
  test("連續極端日期會合併成事件",()=>{const rows=getAnnualArkRecords([{date:"2026-01-01",arkAllocation:81,taiwanIndex:100},{date:"2026-01-02",arkAllocation:82,taiwanIndex:102},{date:"2026-01-03",arkAllocation:79,taiwanIndex:101}],2026),events=buildArkLevelEvents(rows);return events.length===1&&events[0].duration===2&&events[0].extreme.arkAllocation===82&&events[0].exit.date==="2026-01-03";});
  test("手機漏讀代號時仍會補回預期 ETF",()=>recoverArkScreenshotRows([],1000,2000).length===8&&recoverArkScreenshotRows([],1200,700).length===2);
  test("位階佈局金額會由淨值與股數重算",()=>mergeOcrRows([{symbol:"00631L",nav:37.62,arkShares:3,positionCapital:999}])[0].positionCapital===113);
  test("位階股數可由佈局金額交叉校驗",()=>mergeOcrRows([{symbol:"0056",nav:56.93,arkShares:7,positionCapital:57}])[0].arkShares===1);
  test("市場接近區間高檔且指標偏熱會預測高點",()=>predictMarketPosition([{taiwanIndex:90},{taiwanIndex:92},{taiwanIndex:94},{taiwanIndex:96},{taiwanIndex:100}],{todayArk:70,cnn:75,rsi:72}).value==="HIGH");
  test("市場接近區間低檔且 ARK 高水位會預測低點",()=>predictMarketPosition([{taiwanIndex:100},{taiwanIndex:98},{taiwanIndex:96},{taiwanIndex:94},{taiwanIndex:90}],{todayArk:82,cnn:50,rsi:50}).value==="LOW");
  const passed=tests.filter(t=>t[1]).length; $("selfTestBadge").textContent=`${passed} / ${tests.length} 通過`; $("selfTestBadge").className=`badge ${passed===tests.length?"buy":"sell"}`; $("selfTestList").innerHTML=tests.map(([n,ok])=>`<li>${ok?"通過":"失敗"} · ${n}</li>`).join(""); return {passed,total:tests.length,tests}; }

function saveETFs(){ localStorage.setItem(CONFIG.storageKeys.etfs,JSON.stringify(window.currentETFs)); }
function bind(){
  document.querySelectorAll(".inputs-card input,.inputs-card select").forEach(el=>el.addEventListener("input",renderDashboard));
  $("etfCards").addEventListener("change",(event)=>{ const el=event.target,index=Number(el.dataset.etfIndex),field=el.dataset.etfField; if(!field||!Number.isInteger(index)||!window.currentETFs[index]) return; window.currentETFs[index][field]=["nav","premium","arkShares","positionCapital","currentWeight","leverage"].includes(field)?Number(el.value||0):el.value; saveETFs(); renderDashboard(); });
  $("etfCards").addEventListener("click",(event)=>{ const button=event.target.closest("[data-remove-etf]"); if(!button)return; window.currentETFs.splice(Number(button.dataset.removeEtf),1); saveETFs(); renderETFExecution(); });
  $("addEtfBtn").addEventListener("click",()=>{ if(window.currentETFs.length>=10){$("saveMessage").textContent="最多可建立十檔 ETF。";return;} window.currentETFs.push({symbol:"",name:"",nav:0,premium:0,arkShares:0,positionCapital:0,currentWeight:0,assetType:"OTHER",leverage:1,exposureGroup:"OTHER"}); saveETFs(); renderETFExecution(); });
  $("ocrImages").addEventListener("change",()=>{ ocrObjectUrls.forEach(URL.revokeObjectURL); const selected=[...$("ocrImages").files].filter(file=>file.type.startsWith("image/")).slice(0,2); ocrFiles=selected; ocrObjectUrls=selected.map(URL.createObjectURL); $("ocrImagePreview").innerHTML=ocrObjectUrls.map((url,index)=>`<figure><img src="${url}" alt="待辨識截圖 ${index+1}"><figcaption>截圖 ${index+1}</figcaption></figure>`).join(""); $("runOcrBtn").disabled=!selected.length; $("clearOcrBtn").hidden=!selected.length; $("ocrReview").hidden=true; $("ocrStatus").textContent=selected.length?`已選擇 ${selected.length} 張，按「開始辨識」。`:"尚未選擇圖片"; if($("ocrImages").files.length>2) $("ocrStatus").textContent="一次最多辨識 2 張，已取前 2 張。"; });
  $("runOcrBtn").addEventListener("click",recognizeArkScreenshots); $("clearOcrBtn").addEventListener("click",resetOcrImport); $("applyOcrBtn").addEventListener("click",applyOcrRows);
  $("sampleBtn").addEventListener("click",loadSample); $("saveBtn").addEventListener("click",()=>saveDailySnapshot()); $("syncBtn").addEventListener("click",()=>syncCentralData());
}
async function init(){ $("strategyVersion").textContent=CONFIG.strategyVersion; restoreState(); bind(); if(location.protocol==="file:"){ $("ocrStatus").textContent="圖片辨識需要本機網頁伺服器：請改為雙擊「啟動網站.cmd」開啟。"; } renderDashboard(); renderHistory(); runSelfTests(); const cached=await dataProvider.getCentralData(); if(cached){applyCentralData(cached);$("syncStatus").textContent=`使用快取 · ${new Date(cached.syncedAt).toLocaleDateString("zh-TW")}`;} if(CONFIG.googleSheets?.webAppUrl) syncCentralData({silent:true}); else $("syncStatus").textContent="待設定 Google 同步"; }
document.addEventListener("DOMContentLoaded",init);

window.ARKStrategyLab={calculateGap,calculateArkTrend,calculateArkPeak,determineRegime,calculateBuyMultiplier,calculateBuyTrendFactor,calculateSellFillRate,calculateMarketModifier,calculateConcentrationFactor,calculatePremiumDecision,calculateETFOrders,reconcileExecutionBudget,evaluatePremiumCounterfactual,predictMarketPosition,quantile,getAnnualArkRecords,getAnnualArkLevelRecords,buildArkLevelEvents,summarizeArkEvents,saveDailySnapshot,loadHistory,runSelfTests,getInput,LocalDataProvider,GoogleSheetsDataProvider};
