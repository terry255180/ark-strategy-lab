"use strict";

function calculateReturns(symbol,body){
  const result=body?.chart?.result?.[0];
  if(!result)throw new Error(body?.chart?.error?.description||"查無歷史行情");
  const timestamps=result.timestamp||[],adj=result.indicators?.adjclose?.[0]?.adjclose||[],closes=result.indicators?.quote?.[0]?.close||[];
  const declaredSplits=Object.entries(result.events?.splits||{}).map(([key,event])=>{const numerator=Number(event.numerator),denominator=Number(event.denominator);return {timestamp:Number(event.date||key),ratio:denominator>0?numerator/denominator:NaN};}).filter(event=>Number.isFinite(event.timestamp)&&Number.isFinite(event.ratio)&&event.ratio>0);
  const inferredSplits=[];
  for(let index=1;index<timestamps.length;index++){
    const previous=Number(closes[index-1]),current=Number(closes[index]),elapsed=Number(timestamps[index])-Number(timestamps[index-1]);
    if(!(previous>0)||!(current>0)||!(elapsed>0)||elapsed>14*86400)continue;
    const forward=previous/current,reverse=current/previous;
    if(forward>=1.8){const rounded=Math.round(forward);if(rounded>=2&&Math.abs(forward-rounded)/rounded<=.18)inferredSplits.push({timestamp:Number(timestamps[index]),ratio:rounded,inferred:true});}
    else if(reverse>=1.8){const rounded=Math.round(reverse);if(rounded>=2&&Math.abs(reverse-rounded)/rounded<=.18)inferredSplits.push({timestamp:Number(timestamps[index]),ratio:1/rounded,inferred:true});}
  }
  const splits=inferredSplits.slice();
  for(const event of declaredSplits)if(!splits.some(inferred=>Math.abs(inferred.timestamp-event.timestamp)<=7*86400))splits.push(event);
  const dividends=Object.entries(result.events?.dividends||{}).map(([key,event])=>({timestamp:Number(event.date||key),amount:Number(event.amount)})).filter(event=>Number.isFinite(event.timestamp)&&Number.isFinite(event.amount));
  const lastTimestamp=Number(timestamps.at(-1)||0),splitFactorAfter=timestamp=>splits.filter(event=>event.timestamp>timestamp&&event.timestamp<=lastTimestamp).reduce((factor,event)=>factor*event.ratio,1),hasSplit=splits.some(event=>event.timestamp<=lastTimestamp);
  const points=timestamps.map((timestamp,index)=>{const rawClose=Number(closes[index]),yahooAdjusted=Number(adj[index]),splitAdjusted=rawClose>0?rawClose/splitFactorAfter(Number(timestamp)):NaN;return {timestamp:Number(timestamp),value:hasSplit?splitAdjusted:yahooAdjusted,rawClose};}).filter(point=>Number.isFinite(point.timestamp)&&Number.isFinite(point.value)&&point.value>0);
  if(points.length<2)throw new Error("歷史資料不足");
  const latest=points.at(-1),latestDate=new Date(latest.timestamp*1000),atOrBefore=target=>{const time=Math.floor(target.getTime()/1000);for(let index=points.length-1;index>=0;index--)if(points[index].timestamp<=time)return points[index];return null;};
  const yearStart=new Date(Date.UTC(latestDate.getUTCFullYear(),0,1)),oneYearStart=new Date(Date.UTC(latestDate.getUTCFullYear()-1,latestDate.getUTCMonth(),latestDate.getUTCDate())),threeYearStart=new Date(Date.UTC(latestDate.getUTCFullYear()-3,latestDate.getUTCMonth(),latestDate.getUTCDate()));
  const ytdBase=atOrBefore(new Date(yearStart.getTime()-1000)),oneYearBase=atOrBefore(oneYearStart),threeYearBase=atOrBefore(threeYearStart);
  const dividendsAfter=base=>base?dividends.filter(event=>event.timestamp>base.timestamp&&event.timestamp<=latest.timestamp).reduce((sum,event)=>sum+event.amount/splitFactorAfter(event.timestamp),0):0;
  const pct=base=>base?Math.round(((latest.value+(hasSplit?dividendsAfter(base):0))/base.value-1)*10000)/100:null,threeYear=pct(threeYearBase);
  return {symbol,latestDate:formatTaipeiDate(latestDate),latestPrice:Math.round((latest.rawClose>0?latest.rawClose:latest.value)*100)/100,ytd:pct(ytdBase),oneYear:pct(oneYearBase),threeYear,threeYearAnnualized:threeYear===null?null:Math.round((Math.pow(1+threeYear/100,1/3)-1)*10000)/100,historyStart:formatTaipeiDate(new Date(points[0].timestamp*1000)),adjustmentMethod:hasSplit?"split_adjusted_close_plus_dividends":"yahoo_adjusted_close",splitsApplied:splits.length,inferredSplits:inferredSplits.length};
}

function formatTaipeiDate(date){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
function normalizeSymbols(value){return [...new Set(String(value||"").toUpperCase().split(",").map(symbol=>symbol.replace(/[^0-9A-Z]/g,"")).filter(symbol=>/^\d{4,6}[A-Z]?$/.test(symbol)))].slice(0,40);}

module.exports={calculateReturns,normalizeSymbols};
