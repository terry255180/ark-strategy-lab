"use strict";

const ETF_NAMES = {
  "0055":"元大MSCI金融","00960":"野村全球航運龍頭","00875":"國泰網路資安","0056":"元大高股息","0050":"元大台灣50",
  "00830":"國泰費城半導體","00631L":"元大台灣50正2","0052":"富邦科技","00911":"兆豐洲際半導體","0053":"元大電子",
  "006208":"富邦台50","0057":"富邦摩台","00988A":"主動統一全球創新","00913":"兆豐台灣晶圓製造","00935":"野村臺灣新科技50",
  "00947":"台新臺灣IC設計","00891":"中信關鍵半導體","00981A":"主動統一台股增長","00728":"第一金工業30","00690":"兆豐藍籌30",
  "00927":"群益半導體收益","00894":"中信小資高價30","00910":"第一金太空衛星"
};
const BLOCKED_SYMBOLS = /^(?:TW|US|ETF|NAV|USD|TWD|TOTAL|QTY|PRICE|VALUE|SHARE|PCT|COST|PROFIT|LOSS|RSI|PNL|ARK)$/;
const numberOrNull = value => {
  if(value===null||value===""||value===undefined)return null;
  const number=Number(String(value).replace(/[%,$，\s]/g,""));
  return Number.isFinite(number)?number:null;
};
const integerOrNull = value => {
  const number=numberOrNull(value);
  return number===null?null:Math.max(0,Math.round(number));
};

const arkPrompt = [
  "你正在辨識台灣券商 App 的「價值佈局」ETF 清單截圖。多張圖片可能有重疊列，最後只保留每個 ETF 一筆。",
  "辨識圖片中所有可見 ETF，不限固定清單。股票代號通常為 4 至 6 位數字，部分主動式或槓桿 ETF 會在尾端帶英文字母，例如 00981A、00631L。",
  "逐列讀取：股票代號與中文名稱；即時淨值下方紅色或綠色的折溢價%；位階股數欄上方黃色數字；位階布局金額欄上方黃色數字；同欄下方灰色的風控股數與風控布局金額。",
  "0 是合法值，不可因為是 0 而省略。不要把即時淨值當作布局金額，也不要把黃色與灰色數字交換。",
  "若兩張圖出現同一 ETF，合併為一筆並採用最清楚完整的數值。逐列掃描，不可只辨識既有或熟悉的 ETF，也不要生成圖片中不存在的 ETF。僅回傳符合指定 JSON schema 的結果。"
].join("\n");

const holdingPrompt = [
  "你正在辨識券商 App 的持股庫存或庫存損益截圖。多張圖片可能有重疊列，最後只保留每個股票或 ETF 一筆。",
  "逐列只讀取股票代號、名稱、持有股數、持有總成本。持有總成本是整筆部位的成本，不是每股成本。",
  "台股代號通常是 4 至 6 位數字，可能帶尾端英文字母；美股代號通常是 1 至 5 位英文字母。不要把欄位標題、幣別、日期或總計當成代號。",
  "不要辨識或回傳目前價格、市值、損益金額、報酬率；這些欄位將由系統使用即時價格計算。",
  "不要將目前市值誤填成持有總成本。看不清楚的欄位保留空值，不可補零或虛構資料。逐列掃描圖片中所有持股，僅回傳符合指定 JSON schema 的結果。"
].join("\n");

const arkSchema={type:"object",properties:{items:{type:"array",items:{type:"object",properties:{symbol:{type:"string"},name:{type:"string"},premiumPercent:{type:"number"},positionShares:{type:"integer"},positionAmount:{type:"integer"},riskShares:{type:"integer"},riskAmount:{type:"integer"}},required:["symbol","name"]}}},required:["items"]};
const holdingSchema={type:"object",properties:{items:{type:"array",items:{type:"object",properties:{symbol:{type:"string"},name:{type:"string"},shares:{type:"integer"},costBasis:{type:"number"}},required:["symbol","name"]}}},required:["items"]};

function normalizeArkItems(rawItems){
  const map=new Map();
  for(const raw of rawItems||[]){
    let symbol=String(raw.symbol||"").toUpperCase().replace(/[^0-9A-Z]/g,"").replace(/^O/,"0");
    if(symbol==="00631")symbol="00631L";
    if(!/^\d{4,6}[A-Z]?$/.test(symbol))continue;
    const item={symbol,name:ETF_NAMES[symbol]||String(raw.name||"").trim()||symbol,premiumPercent:numberOrNull(raw.premiumPercent),positionShares:integerOrNull(raw.positionShares),positionAmount:integerOrNull(raw.positionAmount),riskShares:integerOrNull(raw.riskShares),riskAmount:integerOrNull(raw.riskAmount)};
    mergeItem(map,item);
  }
  return [...map.values()];
}

function normalizeHoldingItems(rawItems){
  const map=new Map();
  for(const raw of rawItems||[]){
    const symbol=String(raw.symbol||"").toUpperCase().replace(/[^0-9A-Z]/g,"").replace(/^O(?=\d)/,"0");
    if(!/^(?:\d{4,6}[A-Z]?|[A-Z]{1,5})$/.test(symbol)||BLOCKED_SYMBOLS.test(symbol))continue;
    const shares=integerOrNull(raw.shares),costBasis=numberOrNull(raw.costBasis);
    mergeItem(map,{symbol,name:ETF_NAMES[symbol]||String(raw.name||"").trim()||symbol,shares:shares>0?shares:null,costBasis:costBasis>0?costBasis:null});
  }
  return [...map.values()];
}

function mergeItem(map,item){
  const old=map.get(item.symbol);
  if(!old){map.set(item.symbol,item);return;}
  for(const [key,value] of Object.entries(item))if((old[key]===null||old[key]==="")&&value!==null&&value!=="")old[key]=value;
}

function visionConfig(action){
  return action==="rebalanceVision"?{prompt:holdingPrompt,schema:holdingSchema,normalize:normalizeHoldingItems,maxImages:4}:{prompt:arkPrompt,schema:arkSchema,normalize:normalizeArkItems,maxImages:5};
}

module.exports={ETF_NAMES,visionConfig,normalizeArkItems,normalizeHoldingItems};
