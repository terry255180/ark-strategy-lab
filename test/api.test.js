"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeArkItems,normalizeHoldingItems}=require("../lib/gemini");
const {calculateReturns,normalizeSymbols}=require("../lib/yahoo");
const returnsHandler=require("../api/returns");
const searchHandler=require("../api/search");
const {normalizeQuote}=searchHandler;
const visionHandler=require("../api/vision");

function responseRecorder(){return {statusCode:200,headers:{},payload:null,status(code){this.statusCode=code;return this;},setHeader(key,value){this.headers[key]=value;return this;},json(payload){this.payload=payload;return this;}};}
function yahooFixture(){
  const day=86400,start=Math.floor(Date.UTC(2022,0,3)/1000),timestamp=Array.from({length:1100},(_,index)=>start+index*day),close=timestamp.map((_,index)=>100+index*.1);
  return {chart:{result:[{timestamp,indicators:{quote:[{close}],adjclose:[{adjclose:close}]},events:{dividends:{},splits:{}}}]}};
}

test("Gemini ETF 結果會校正代號並合併",()=>{
  const rows=normalizeArkItems([{symbol:"00631",name:""},{symbol:"00631L",positionShares:1000}]);
  assert.equal(rows.length,1);assert.equal(rows[0].symbol,"00631L");assert.equal(rows[0].positionShares,1000);
});

test("持股 OCR 只保留名稱、代號、股數與總成本",()=>{
  const rows=normalizeHoldingItems([{symbol:"O050",name:"元大台灣50",shares:"100",costBasis:"15000",currentPrice:200,marketValue:20000}]);
  assert.deepEqual(rows,[{symbol:"0050",name:"元大台灣50",shares:100,costBasis:15000}]);
});

test("Yahoo 報酬結果包含最新價格與三段期間",()=>{
  const item=calculateReturns("0050",yahooFixture());
  assert.ok(item.latestPrice>0);assert.equal(typeof item.ytd,"number");assert.equal(typeof item.oneYear,"number");assert.equal(typeof item.threeYear,"number");
});

test("代號清理會去重並排除無效內容",()=>assert.deepEqual(normalizeSymbols("0050,0050,abc,00631L"),["0050","00631L"]));

test("Yahoo 台股搜尋結果會移除交易所尾碼",()=>assert.deepEqual(normalizeQuote({symbol:"2330.TW",longname:"台灣積體電路製造股份有限公司",quoteType:"EQUITY"}),{symbol:"2330",name:"台灣積體電路製造股份有限公司",exchangeSuffix:"TW",marketRegion:"TW",assetType:"STOCK"}));

test("已知 ETF 優先顯示中文名稱",()=>assert.equal(normalizeQuote({symbol:"0050.TW",longname:"Yuanta/P-shares Taiwan Top 50 ETF",quoteType:"ETF"}).name,"元大台灣50"));

test("股票名稱可經 search API 找到台股代號",async()=>{
  const originalFetch=global.fetch;global.fetch=async()=>({ok:true,json:async()=>({quotes:[{symbol:"2330.TW",longname:"台灣積體電路製造股份有限公司"}]})});
  try{const res=responseRecorder();await searchHandler({method:"GET",query:{q:"台積電"}},res);assert.equal(res.statusCode,200);assert.equal(res.payload.item.symbol,"2330");}finally{global.fetch=originalFetch;}
});

test("returns API 可取得並回傳行情",async()=>{
  const originalFetch=global.fetch;global.fetch=async()=>({ok:true,json:async()=>yahooFixture()});
  try{const res=responseRecorder();await returnsHandler({method:"GET",query:{symbols:"0050"}},res);assert.equal(res.statusCode,200);assert.equal(res.payload.ok,true);assert.equal(res.payload.items[0].symbol,"0050");assert.equal(res.payload.items[0].name,"元大台灣50");assert.ok(res.headers["Cache-Control"].includes("s-maxage=900"));}finally{global.fetch=originalFetch;}
});

test("vision API 驗證密碼並正規化 Gemini 回應",async()=>{
  const originalFetch=global.fetch,originalKey=process.env.GEMINI_API_KEY,originalToken=process.env.VISION_ACCESS_TOKEN;
  process.env.GEMINI_API_KEY="test-key";process.env.VISION_ACCESS_TOKEN="test-token";
  global.fetch=async()=>({ok:true,text:async()=>JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({items:[{symbol:"0050",name:"元大台灣50",shares:100,costBasis:15000,currentPrice:200}]})}]}}]})});
  try{
    const res=responseRecorder();
    await visionHandler({method:"POST",body:{action:"rebalanceVision",token:"test-token",images:[{mimeType:"image/jpeg",data:"AA=="}]}},res);
    assert.equal(res.statusCode,200);assert.equal(res.payload.ok,true);assert.deepEqual(res.payload.items,[{symbol:"0050",name:"元大台灣50",shares:100,costBasis:15000}]);
  }finally{
    global.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey;
    if(originalToken===undefined)delete process.env.VISION_ACCESS_TOKEN;else process.env.VISION_ACCESS_TOKEN=originalToken;
  }
});
