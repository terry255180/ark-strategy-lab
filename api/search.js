"use strict";
const {ETF_NAMES}=require("../lib/gemini");

function normalizeQuote(quote){
  const rawSymbol=String(quote?.symbol||"").toUpperCase(),match=rawSymbol.match(/^([0-9]{4,6}[A-Z]?)\.(TW|TWO)$/);
  if(!match)return null;
  return {symbol:match[1],name:ETF_NAMES[match[1]]||String(quote.longname||quote.shortname||match[1]).trim(),exchangeSuffix:match[2],marketRegion:"TW",assetType:String(quote.quoteType||"").toUpperCase()==="ETF"?"ETF":"STOCK"};
}

module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"只接受 GET。"});
  const query=String(req.query?.q||"").trim().slice(0,50);
  if(!query)return res.status(400).json({ok:false,error:"請輸入股票代號或名稱。"});
  try{
    const url=`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0&enableFuzzyQuery=true`;
    const response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; ARKStrategyLab/1.0)"}});
    if(!response.ok)throw new Error(`Yahoo HTTP ${response.status}`);
    const items=(await response.json()).quotes?.map(normalizeQuote).filter(Boolean)||[],normalized=query.toUpperCase().replace(/\.(TW|TWO)$/i,"");
    items.sort((a,b)=>(a.symbol===normalized?-1:b.symbol===normalized?1:0));
    if(!items.length)return res.status(404).json({ok:false,error:`找不到台股「${query}」。`});
    res.setHeader("Cache-Control","s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ok:true,item:items[0],items:items.slice(0,8)});
  }catch(error){return res.status(502).json({ok:false,error:String(error?.message||error)});}
};

module.exports.normalizeQuote=normalizeQuote;
