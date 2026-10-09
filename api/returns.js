"use strict";
const {calculateReturns,normalizeSymbols}=require("../lib/yahoo");

module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"只接受 GET。"});
  const symbols=normalizeSymbols(req.query?.symbols);
  if(!symbols.length)return res.status(200).json({ok:true,source:"Yahoo Finance adjusted close",items:[]});
  const now=Math.floor(Date.now()/1000),start=now-5*366*86400;
  const items=await Promise.all(symbols.map(async symbol=>{
    try{
      let lastError;
      for(const suffix of ["TW","TWO"]){
        const ticker=`${symbol}.${suffix}`,url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${start}&period2=${now+86400}&interval=1d&events=div%2Csplits`,response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; ARKStrategyLab/1.0)"}});
        if(!response.ok){lastError=new Error(`Yahoo HTTP ${response.status}`);continue;}
        try{return {...calculateReturns(symbol,await response.json()),exchangeSuffix:suffix};}catch(error){lastError=error;}
      }
      throw lastError||new Error("查無行情");
    }catch(error){return {symbol,error:String(error?.message||error)};}
  }));
  res.setHeader("Cache-Control","s-maxage=43200, stale-while-revalidate=86400");
  return res.status(200).json({ok:true,source:"Yahoo Finance adjusted close via Vercel",returnType:"adjusted_total_return_estimate",asOf:new Date().toISOString(),items});
};
