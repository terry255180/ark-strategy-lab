"use strict";
// Rebalance V1: pure strategy functions above the UI boundary. All parameters are heuristic.
(() => {
const C=CONFIG.rebalance, money=n=>`NT$${Math.round(n).toLocaleString("zh-TW")}`;
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
const finite=n=>Number.isFinite(Number(n))?Number(n):0;
const optional=n=>n===""||n==null?null:Number.isFinite(Number(n))?Number(n):null;
const cap=(n,a,b)=>Math.max(a,Math.min(b,n));
const defaultHolding=()=>({identifier:"",symbol:"",name:"",shares:0,averageCost:0,costBasis:0,currentPrice:0,marketValue:0,profitAmount:0,profitPercent:0,assetType:"ETF",marketRegion:"TW",exposureGroup:"OTHER",leveraged:false,inArkToday:false,arkRank:null,daysOutOfArk:0,arkPresence5D:0,valueTag:"",heatingTag:"",periodReturns:null});
let state={holdings:[],totalAssets:0,targetOverride:null,usRsi:null,usBias:null,usPercentile:null,usReturn:null,oddLot:C.optimizer.defaultOddLot,allowFullExit:C.optimizer.defaultFullExit},lastPlan=null,autoTarget=0,performanceLoading=false;
const api=window.ARKStrategyLab;

// The sell engine returns an execution target in allocation percent, not currency.
function calculateTargetReduction(decision,actualAllocation,totalAssets){
  return decision?.action==="SELL"&&totalAssets>0?Math.max(0,(actualAllocation-decision.target)*totalAssets/100):0;
}
function calculateUSMarketRegime(cnn,more={}){
  const band=C.usCnnBands.find(x=>cnn<=x.max)||C.usCnnBands.at(-1),u=C.usSignals;
  const signals=[];let factor=band.factor;
  if(more.rsi!=null){if(more.rsi>=u.rsiHot){factor+=u.modifierStep;signals.push("美股 RSI 偏熱");}else if(more.rsi<=u.rsiCold){factor-=u.modifierStep;signals.push("美股 RSI 偏冷");}}
  if(more.bias!=null){if(more.bias>=u.biasHot)factor+=u.modifierStep;else if(more.bias<=u.biasCold)factor-=u.modifierStep;}
  if(more.percentile!=null){if(more.percentile>=u.percentileHot)factor+=u.modifierStep;else if(more.percentile<=u.percentileCold)factor-=u.modifierStep;}
  if(more.recentReturn!=null){if(more.recentReturn>=u.returnHot)factor+=u.modifierStep;else if(more.recentReturn<=u.returnCold)factor-=u.modifierStep;}
  return {label:band.label,factor:cap(Math.round(factor*100)/100,u.minFactor,u.maxFactor),signals,source:"CNN；美股技術指標若未輸入則不使用"};
}
function calculateTaiwanMarketRegime(metrics){
  const t=C.taiwan;let score=0;const signals=[];
  const add=(ok,points,label)=>{if(ok){score+=points;signals.push(label);}};
  add(metrics.rsi!=null&&metrics.rsi>=t.rsiHot,2,"台股 RSI 高檔");
  add(metrics.rsi!=null&&metrics.rsi>=t.rsiWarm&&metrics.rsi<t.rsiHot,1,"台股 RSI 偏高");
  add(metrics.rsi!=null&&metrics.rsi<=t.rsiCold,-2,"台股 RSI 低檔");
  add(metrics.bias!=null&&metrics.bias>=t.biasHot,2,"20 日正乖離高");
  add(metrics.bias!=null&&metrics.bias>=t.biasWarm&&metrics.bias<t.biasHot,1,"20 日正乖離");
  add(metrics.bias!=null&&metrics.bias<=t.biasCold,-2,"20 日負乖離高");
  add(metrics.percentile!=null&&metrics.percentile>=t.percentileHot,2,"近 20 筆區間高位");
  add(metrics.percentile!=null&&metrics.percentile>=t.percentileWarm&&metrics.percentile<t.percentileHot,1,"近 20 筆區間偏高");
  add(metrics.percentile!=null&&metrics.percentile<=t.percentileCold,-2,"近 20 筆區間低位");
  add(metrics.recentReturn!=null&&metrics.recentReturn>=t.returnHot,2,"近期漲幅偏高");
  add(metrics.recentReturn!=null&&metrics.recentReturn>=t.returnWarm&&metrics.recentReturn<t.returnHot,1,"近期上漲");
  add(metrics.recentReturn!=null&&metrics.recentReturn<=t.returnCold,-2,"近期下跌");
  add(metrics.margin!=null&&metrics.margin>=t.marginHot,2,"融資維持率偏高");
  add(metrics.margin!=null&&metrics.margin>=t.marginWarm&&metrics.margin<t.marginHot,1,"融資維持率偏熱");
  const label=score>=t.scoreExtreme?"EXTREME HOT":score>=t.scoreHot?"HOT":score>=t.scoreWarm?"WARM":score<=t.scoreCold?"COLD":"NORMAL";
  return {label,score,factor:cap(Math.round((1+score*t.step)*100)/100,t.minFactor,t.maxFactor),signals};
}
function calculateMarketSellFactor(region,markets,group=""){
  if(region==="TW")return markets.tw.factor;
  if(region==="US")return markets.us.factor;
  if(region==="GLOBAL")return group.startsWith("US_")||group.includes("SEMICONDUCTOR")?Math.round((.7*markets.us.factor+.3*markets.tw.factor)*100)/100:Math.round((.5*markets.us.factor+.5*markets.tw.factor)*100)/100;
  return 1;
}
function calculateArkPersistence(h){
  const days=Math.max(0,finite(h.daysOutOfArk)),band=C.daysOutBands.find(x=>days<=x.max)||C.daysOutBands.at(-1);
  return {days,points:h.inArkToday?0:band.points,presence:cap(finite(h.arkPresence5D),0,5),strongExit:!h.inArkToday&&days>C.daysOutBands.at(-2).max&&finite(h.arkPresence5D)<=1};
}
function calculateSingleConcentration(h,total){return total>0?finite(h.marketValue)/total:0;}
function calculateExposureGroupConcentration(h,holdings,total){return total>0?holdings.filter(x=>x.exposureGroup===h.exposureGroup).reduce((n,x)=>n+finite(x.marketValue),0)/total:0;}
function calculateProfitBuffer(h){return cap(Math.max(0,finite(h.profitPercent))*C.priority.profitPerPercent,0,C.priority.profitMax);}
function calculatePerformanceScores(holdings){
  const cfg=C.performance||{},weights=cfg.weights||{};
  const metrics=[['ytd',weights.ytd??.25],['oneYear',weights.oneYear??.35],['threeYearAnnualized',weights.threeYearAnnualized??.4]];
  const result=new Map();
  for(const h of holdings){
    let weighted=0,totalWeight=0,available=0;
    for(const [key,weight] of metrics){
      const value=optional(h.periodReturns?.[key]);if(value==null)continue;
      const peers=holdings.filter(peer=>optional(peer.periodReturns?.[key])!=null).map(peer=>Number(peer.periodReturns[key])).sort((a,b)=>a-b);
      if(peers.length<(cfg.minimumPeers||2))continue;
      const below=peers.filter(peerValue=>peerValue<value).length,equal=peers.filter(peerValue=>peerValue===value).length;
      weighted+=((below+Math.max(0,equal-1)/2)/(peers.length-1))*weight;totalWeight+=weight;available++;
    }
    if(!totalWeight){result.set(h.symbol,{percentile:null,points:0,available});continue;}
    const percentile=weighted/totalWeight;
    const points=percentile<.5?Math.round((.5-percentile)*2*(cfg.weakMaxPoints||6)): -Math.round((percentile-.5)*2*(cfg.strongMaxDiscount||4));
    result.set(h.symbol,{percentile,points,available});
  }
  const ranked=[...result.entries()].filter(([,value])=>value.percentile!=null).sort((a,b)=>b[1].percentile-a[1].percentile||String(a[0]).localeCompare(String(b[0])));
  ranked.forEach(([symbol,value],index)=>result.set(symbol,{...value,rank:index+1,total:ranked.length}));
  return result;
}
function generateSellReasons(h,x){
  const reasons=[];const lim=C.concentration;
  if(x.singleWeight>=lim.singleHigh)reasons.push("單檔高度集中");else if(x.singleWeight>=lim.singleWarm)reasons.push("單檔配置偏高");
  if(x.groupWeight>=lim.groupHigh)reasons.push(`${h.exposureGroup} 曝險高度重疊`);else if(x.groupWeight>=lim.groupWarm)reasons.push(`${h.exposureGroup} 曝險偏高`);
  if(h.leveraged)reasons.push("槓桿曝險");
  if(h.inArkToday)reasons.push("仍在今日 ARK；非自動禁賣");else reasons.push(`離開 ARK ${x.persistence.days} 日；近 5 日入選 ${x.persistence.presence}/5`);
  if(x.persistence.strongExit)reasons.push("持續離開 ARK");
  if(x.marketFactor>1.05)reasons.push(`${h.marketRegion} 市場偏熱`);else if(x.marketFactor<.95)reasons.push(`${h.marketRegion} 市場偏冷；降低優先度但不禁賣`);
  if(finite(h.profitPercent)<0)reasons.push("帳面虧損不構成禁賣條件");else if(x.profitBuffer>0)reasons.push(`獲利緩衝 +${finite(h.profitPercent).toFixed(1)}%（次要）`);
  if(x.smallCleanup)reasons.push("小部位整理");
  return reasons;
}
function calculateSellPriority(h,context){
  const p=C.priority,lim=C.concentration,total=context.totalAssets||context.holdings.reduce((n,x)=>n+finite(x.marketValue),0);
  const singleWeight=calculateSingleConcentration(h,total),groupWeight=calculateExposureGroupConcentration(h,context.holdings,total),persistence=calculateArkPersistence(h);
  const marketFactor=calculateMarketSellFactor(h.marketRegion,context.markets,h.exposureGroup),profitBuffer=calculateProfitBuffer(h);
  const risk=context.regime==="RISK_OFF"?p.riskOff:0;
  let score=p.base+risk+persistence.points+(persistence.strongExit?p.strongExit:0)+(h.inArkToday?-p.inArkDiscount:p.arkOut);
  if(h.inArkToday&&finite(h.arkRank)>p.arkRankWeakAfter)score+=p.arkRankWeak;
  if(!h.inArkToday&&persistence.presence<=1)score+=p.presenceWeak;
  score+=(singleWeight>=lim.singleHigh?p.singleHigh:singleWeight>=lim.singleWarm?p.singleWarm:0);
  score+=(groupWeight>=lim.groupHigh?p.groupHigh:groupWeight>=lim.groupWarm?p.groupWarm:0);
  if(h.leveraged)score+=p.leverage+(singleWeight>=lim.singleHigh&&groupWeight>=lim.groupHigh&&marketFactor>1?p.leverageCluster:0);
  const smallCleanup=!h.inArkToday&&h.valueTag!=="YES"&&singleWeight<C.priority.smallPositionRatio;
  if(smallCleanup)score+=p.smallCleanup;
  const performance=context.performanceScores?.get(h.symbol)||{percentile:null,points:0,available:0,rank:null,total:0};
  score=cap(Math.round(score*marketFactor+profitBuffer+performance.points),0,100);
  const priorityLevel=score>=p.levels.veryHigh?"VERY_HIGH":score>=p.levels.high?"HIGH":score>=p.levels.medium?"MEDIUM":score>=p.levels.watch?"WATCH":"LOW";
  const detail={...h,singleWeight,groupWeight,persistence,marketFactor,profitBuffer,performance,smallCleanup,sellPriorityScore:score,priorityLevel};
  if(performance.rank!=null&&performance.points>0)detail.performanceReason=`庫存多期報酬第 ${performance.rank}/${performance.total} 名，表現偏弱，調節順位 +${performance.points}`;
  else if(performance.rank!=null&&performance.points<0)detail.performanceReason=`庫存多期報酬第 ${performance.rank}/${performance.total} 名，表現偏強，調節順位 ${performance.points}`;
  else if(performance.rank!=null)detail.performanceReason=`庫存多期報酬第 ${performance.rank}/${performance.total} 名，對調節順位影響中性`;
  detail.sellReasons=generateSellReasons(h,detail);return detail;
}
function marketMetrics(records,rsi,margin){
  const values=(records||[]).map(x=>finite(x.taiwanIndex)).filter(x=>x>0).slice(-20),last=values.at(-1),min=Math.min(...values),max=Math.max(...values);
  const ma=values.length>=20?values.reduce((a,b)=>a+b,0)/values.length:null;
  return {rsi:optional(rsi),margin:optional(margin),bias:ma?100*(last/ma-1):null,percentile:values.length>=5&&max>min?(last-min)/(max-min):null,recentReturn:values.length>=6?100*(last/values.at(-6)-1):null,available:values.length};
}
function allocateReductionAcrossMarkets(target,scored){
  const buckets={TW:0,"US / GLOBAL":0,OTHER:0};
  for(const h of scored){const k=h.marketRegion==="TW"?"TW":h.marketRegion==="US"||h.marketRegion==="GLOBAL"?"US / GLOBAL":"OTHER";buckets[k]+=Math.max(0,finite(h.marketValue))*Math.max(.05,h.sellPriorityScore/100)*h.marketFactor;}
  const sum=Object.values(buckets).reduce((a,b)=>a+b,0);
  return Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,{share:sum?v/sum:0,amount:sum?target*v/sum:0}]));
}
function calculateHoldingMetrics(holding,latestPrice){
  const shares=Math.max(0,Math.floor(finite(holding?.shares))),price=Math.max(0,finite(latestPrice));
  const legacyCost=Math.max(0,finite(holding?.marketValue)-finite(holding?.profitAmount)),enteredAverage=Math.max(0,finite(holding?.averageCost));
  const costBasis=Math.round(Math.max(0,enteredAverage>0?shares*enteredAverage:finite(holding?.costBasis)||legacyCost)*100)/100;
  const averageCost=enteredAverage>0?enteredAverage:shares>0&&costBasis>0?Math.round(costBasis/shares*10000)/10000:0;
  const marketValue=Math.round(shares*price*100)/100,profitAmount=Math.round((marketValue-costBasis)*100)/100;
  const profitPercent=costBasis>0?Math.round(profitAmount/costBasis*10000)/100:0;
  return {shares,averageCost,costBasis,currentPrice:price,marketValue,profitAmount,profitPercent};
}
function normalizedHolding(h){const x={...defaultHolding(),...h};for(const k of ["marketValue","shares","averageCost","costBasis","currentPrice","profitAmount","profitPercent","arkRank","daysOutOfArk","arkPresence5D"])x[k]=optional(x[k])??0;Object.assign(x,calculateHoldingMetrics(x,x.currentPrice));x.identifier=String(x.identifier||x.symbol||x.name||"");x.leveraged=Boolean(x.leveraged);x.inArkToday=Boolean(x.inArkToday);return x;}
function eligibleShares(h,options){
  const shares=Math.max(0,Math.floor(finite(h.shares))),lot=h.marketRegion==="TW"&&!options.oddLot?1000:1;
  let max=Math.floor(shares/lot)*lot;
  if(!options.allowFullExit&&!h.persistence.strongExit&&options.regime!=="RISK_OFF")max=Math.max(0,Math.floor((shares-1)/lot)*lot);
  return {max,lot};
}
function optimizeSellShares(target,scored,options={}){
  const ordered=[...scored].filter(x=>x.currentPrice>0&&x.shares>0).sort((a,b)=>b.sellPriorityScore-a.sellPriorityScore);
  const result=[];let remaining=Math.max(0,target),steps=0;
  // Priority tier first; fill with highest priority holding before moving to lower tiers.
  for(const h of ordered){
    const {max,lot}=eligibleShares(h,options);if(!max||remaining<=0)continue;
    const units=Math.min(max/lot,Math.floor(remaining/(h.currentPrice*lot)));
    if(units>0){result.push({...h,sellShares:units*lot,sellAmount:units*lot*h.currentPrice});remaining-=units*lot*h.currentPrice;}
  }
  // One-step correction may overshoot, but only within the same or adjacent priority tier.
  let candidate=null;
  for(const h of ordered){if(++steps>C.optimizer.maxSteps)break;const prior=result.find(x=>x.symbol===h.symbol),{max,lot}=eligibleShares(h,options),used=prior?.sellShares||0,extra=h.currentPrice*lot;
    if(used+lot>max||!extra||Math.abs(remaining-extra)>=Math.abs(remaining))continue;
    if(prior&&h.sellPriorityScore<ordered[0].sellPriorityScore-15)continue;
    if(!candidate||h.sellPriorityScore>candidate.h.sellPriorityScore||h.sellPriorityScore===candidate.h.sellPriorityScore&&Math.abs(remaining-extra)<candidate.error)candidate={h,lot,extra,error:Math.abs(remaining-extra)};
  }
  if(candidate){const row=result.find(x=>x.symbol===candidate.h.symbol);if(row){row.sellShares+=candidate.lot;row.sellAmount+=candidate.extra;}else result.push({...candidate.h,sellShares:candidate.lot,sellAmount:candidate.extra});}
  const actual=result.reduce((n,x)=>n+x.sellAmount,0);return {soldHoldings:result,actualReduction:actual,difference:actual-target,accuracy:target>0?Math.max(0,100*(1-Math.abs(actual-target)/target)):100};
}
function generateAlternativePlans(target,scored,options){
  const plans=[];const variants=[{name:"ARK 持續退出優先",rows:[...scored].map(x=>({...x,sellPriorityScore:cap(x.sellPriorityScore+(x.persistence.strongExit?15:0),0,100)}))},{name:"減少交易檔數",rows:[...scored].map(x=>({...x,sellPriorityScore:cap(x.sellPriorityScore+Math.min(12,x.marketValue/100000),0,100)}))}];
  for(const v of variants){const plan=optimizeSellShares(target,v.rows,options),sig=plan.soldHoldings.map(x=>`${x.symbol}:${x.sellShares}`).join("|");if(sig&&sig!==options.primarySignature&&!plans.some(p=>p.signature===sig))plans.push({...plan,name:v.name,signature:sig});}return plans.slice(0,2);
}
function buildPlan(decision,input,holdings,settings,records){
  const target=optionsTarget(decision,input.actualAllocation,settings),twMetrics=marketMetrics(records,input.rsi,input.margin);
  const markets={tw:calculateTaiwanMarketRegime(twMetrics),us:calculateUSMarketRegime(input.cnn,{rsi:settings.usRsi,bias:settings.usBias,percentile:settings.usPercentile,recentReturn:settings.usReturn})};
  const clean=holdings.map(normalizedHolding).filter(x=>x.symbol&&x.shares>0&&x.currentPrice>0).slice(0,C.optimizer.maxHoldings),totalAssets=settings.totalAssets||clean.reduce((n,x)=>n+x.marketValue,0);
  const performanceScores=calculatePerformanceScores(clean),context={holdings:clean,totalAssets,markets,regime:decision.regime,performanceScores};const scored=clean.map(x=>calculateSellPriority(x,context)).sort((a,b)=>b.sellPriorityScore-a.sellPriorityScore);
  const allocations=allocateReductionAcrossMarkets(target,scored),options={oddLot:settings.oddLot,allowFullExit:settings.allowFullExit,regime:decision.regime};
  const primary=optimizeSellShares(target,scored,options),primarySignature=primary.soldHoldings.map(x=>`${x.symbol}:${x.sellShares}`).join("|");
  const alternatives=generateAlternativePlans(target,scored,{...options,primarySignature});
  return {target,decision,input,twMetrics,markets,allocations,scored,primary,alternatives,settings};
}
function optionsTarget(decision,actual,settings){return settings.targetOverride!=null?Math.max(0,settings.targetOverride):calculateTargetReduction(decision,actual,settings.totalAssets);}
function saveRebalanceSnapshot(plan){
  const date=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"});const key=C.storageKeys.history;
  let history=[];try{history=JSON.parse(localStorage.getItem(key)||"[]");}catch{}if(!Array.isArray(history))history=[];
  const snap={date,strategyVersion:C.strategyVersion,parameterStatus:C.status,targetReduction:plan.target,actualReduction:plan.primary.actualReduction,arkTarget:plan.input.todayArk,actualAllocation:plan.input.actualAllocation,sellRegime:plan.decision.regime,twMarketRegime:plan.markets.tw.label,twSellFactor:plan.markets.tw.factor,usMarketRegime:plan.markets.us.label,usSellFactor:plan.markets.us.factor,CNN:plan.input.cnn,TW_RSI:plan.twMetrics.rsi,TW_Bias20D:plan.twMetrics.bias,TW_Percentile20D:plan.twMetrics.percentile,soldHoldings:plan.primary.soldHoldings.map(x=>({symbol:x.symbol,shares:x.sellShares,sellAmount:x.sellAmount,sellPriority:x.sellPriorityScore,sellReasons:x.sellReasons,inArkToday:x.inArkToday,daysOutOfArk:x.daysOutOfArk,arkPresence5D:x.arkPresence5D,profitPercent:x.profitPercent,singleWeight:x.singleWeight,groupWeight:x.groupWeight,marketRegion:x.marketRegion,marketSellFactor:x.marketFactor,return5D:null,return10D:null,return20D:null,sellOpportunityCost:null}))};
  history.push(snap);localStorage.setItem(key,JSON.stringify(history.slice(-100)));return snap;
}
function renderMarketRegime(plan){return `<div class="rebalance-mini"><strong>市場狀態</strong><span>台股 ${safe(plan.markets.tw.label)} · 賣出因子 ×${plan.markets.tw.factor.toFixed(2)}</span><span>美股 ${safe(plan.markets.us.label)} · 賣出因子 ×${plan.markets.us.factor.toFixed(2)}</span><small>台股由台灣指數 / RSI / 融資判斷；CNN 不直接控制純台股。</small></div>`;}
function renderSellPlan(plan){
  const p=plan.primary;const rows=p.soldHoldings.map(x=>`<div class="rebalance-sell-row"><strong>${safe(x.symbol)} ${safe(x.name)}</strong><span>賣 ${x.sellShares.toLocaleString("zh-TW")} 股 · 約 ${money(x.sellAmount)}</span><span>${x.priorityLevel} · ${x.sellPriorityScore}/100</span><small>${[...x.sellReasons,x.performanceReason].filter(Boolean).map(safe).join("、")}</small></div>`).join("")||`<p class="note">沒有符合股數與價格條件的可執行賣單。</p>`;
  const alternatives=plan.alternatives.map((a,i)=>`<div class="rebalance-alt"><strong>替代方案 ${i+1} · ${safe(a.name)}</strong><span>${a.soldHoldings.map(x=>`${safe(x.symbol)} ${x.sellShares} 股`).join("、")} · ${money(a.actualReduction)}</span></div>`).join("");
  return `<div class="rebalance-plan"><h3>建議調節方案 · PRIMARY PLAN</h3>${rows}<div class="rebalance-totals"><span>實際調節 ${money(p.actualReduction)}</span><span>目標 ${money(plan.target)}</span><span>差額 ${money(p.difference)}</span><span>接近度 ${p.accuracy.toFixed(1)}%</span></div>${alternatives}</div>`;
}
const returnPct=value=>value==null||!Number.isFinite(Number(value))?"—":`${Number(value)>=0?"+":""}${Number(value).toFixed(1)}%`;
const returnClass=value=>value==null||!Number.isFinite(Number(value))?"":Number(value)>0?"positive":Number(value)<0?"negative":"";
const returnHtml=value=>`<span class="return-value ${returnClass(value)}">${returnPct(value)}</span>`;
function rankHoldingsByReturn(holdings,key){
  return (holdings||[]).filter(h=>optional(h.periodReturns?.[key])!=null).sort((a,b)=>Number(b.periodReturns[key])-Number(a.periodReturns[key])||String(a.symbol).localeCompare(String(b.symbol))).map((h,index)=>({...h,returnRank:index+1,returnValue:Number(h.periodReturns[key])}));
}
function renderReturnRanking(holdings,key,title){
  const ranked=rankHoldingsByReturn(holdings,key),rows=ranked.map(h=>`<div class="return-rank-row"><strong>${h.returnRank}</strong><span><b>${safe(h.symbol)}</b><small>${safe(h.name)}</small></span><em class="${returnClass(h.returnValue)}">${returnPct(h.returnValue)}</em></div>`).join("");
  return `<section class="return-rank-card"><h4>${safe(title)}</h4>${rows||`<p class="note">尚無可排名資料</p>`}</section>`;
}
function renderPerformanceComparison(plan){
  const rows=plan.scored.map(h=>{const r=h.periodReturns||{},adjustment=r.adjustmentMethod==="split_adjusted_close_plus_dividends"?`分割調整 ×${r.splitsApplied||0}`:r.adjustmentMethod==="yahoo_adjusted_close"?"Yahoo 調整價":"舊版資料";return `<tr><td><strong>${safe(h.symbol)}</strong><small>${safe(h.name)}</small><small>${adjustment}</small></td><td>${returnHtml(h.profitPercent)}</td><td>${returnHtml(r.ytd)}</td><td>${returnHtml(r.oneYear)}</td><td>${returnHtml(r.threeYear)}</td><td>${returnHtml(r.threeYearAnnualized)}</td></tr>`;}).join("");
  const loaded=plan.scored.some(h=>h.periodReturns&&!h.periodReturns.error);
  const status=performanceLoading?"正在取得期間報酬…":loaded?"以含息調整價估算；今年至今 25%、1 年 35%、3 年年化 40% 納入建議，弱勢標的提高調節優先度、強勢標的降低優先度。":"期間報酬尚未取得；目前方案仍可依其他風控條件計算。";
  const rankings=`<div class="return-rank-grid">${renderReturnRanking(plan.scored,"ytd","今年至今排名")}${renderReturnRanking(plan.scored,"oneYear","1 年排名")}${renderReturnRanking(plan.scored,"threeYear","3 年累積排名")}</div>`;
  return `<div class="rebalance-plan rebalance-performance"><h3>庫存報酬比較與排行</h3>${rankings}<div class="rebalance-table-wrap"><table><thead><tr><th>標的</th><th>持有報酬</th><th>今年至今</th><th>1 年</th><th>3 年累積</th><th>3 年年化</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">${status}</p></div>`;
}
function renderSellExplanation(plan){const top=plan.primary.soldHoldings[0];const markets=plan.allocations;return `<div class="rebalance-mini"><strong>為何如此調節</strong><p>ARK 賣出引擎狀態：${safe(regimeZh(plan.decision.regime))}。台股分配約 ${(markets.TW.share*100).toFixed(0)}%、美股／全球約 ${(markets["US / GLOBAL"].share*100).toFixed(0)}%；這是依市場與持股風險動態估算，非固定比例。${top?`優先處理 ${safe(top.symbol)}：${top.sellReasons.slice(0,4).map(safe).join("、")}。`:"請提供有效持股資料以產生實際賣單。"}市場冷熱只調整順序，不單獨決定買賣。</p></div>`;}
function renderRebalanceCalculator(){
  const input=window.ARKStrategyLab?.getInput?.(),decision=window.currentDecision;
  if(!input||!decision)return;
  autoTarget=calculateTargetReduction(decision,input.actualAllocation,state.totalAssets);
  $("rebalanceSummary").innerHTML=`<div><span>ARK 目標</span><strong>${pct(input.todayArk)}</strong></div><div><span>實際配置</span><strong>${pct(input.actualAllocation,2)}</strong></div><div><span>超額缺口</span><strong>${Math.max(0,-decision.gap).toFixed(2)}%</strong></div><div><span>賣出狀態</span><strong>${safe(regimeZh(decision.regime))}</strong></div><div><span>自動目標</span><strong>${money(autoTarget)}</strong></div>`;
  if(document.activeElement!==$("rebalanceTarget"))$("rebalanceTarget").placeholder=autoTarget?money(autoTarget):"尚無自動調節目標；可手動覆寫";
  if(!lastPlan)return;
  const plan=buildPlan(decision,input,state.holdings,state,window.centralRecords||[]);lastPlan=plan;renderResults(plan);
}
function renderResults(plan){
  const alloc=plan.allocations;$("rebalanceResults").innerHTML=`<div class="rebalance-result-grid">${renderMarketRegime(plan)}<div class="rebalance-mini"><strong>市場調節分配</strong><span>台股 ${money(alloc.TW.amount)} · ${(alloc.TW.share*100).toFixed(0)}%</span><span>美股／全球 ${money(alloc["US / GLOBAL"].amount)} · ${(alloc["US / GLOBAL"].share*100).toFixed(0)}%</span></div></div>${renderSellPlan(plan)}${renderPerformanceComparison(plan)}${renderSellExplanation(plan)}`;
  $("rebalanceNotice").textContent=plan.decision.action!=="SELL"&&state.targetOverride==null?"目前賣出引擎沒有調節訊號；如要研究假設情境，可手動輸入目標金額。":plan.target>0?`已計算 ${money(plan.target)} 調節目標。請核對持股、價格及股數，方案不會自動下單。`:"調節目標為 0；不產生賣單。";
}
function renderHoldingEditor(){
  $("rebalanceHoldings").innerHTML=state.holdings.map((h,i)=>`<div class="rebalance-holding"><details ${i===state.holdings.length-1?"open":""}><summary>${safe(h.symbol||"新持股")} ${safe(h.name)} · ${money(h.marketValue||h.shares*h.currentPrice)}</summary><div class="rebalance-fields">
    ${field(i,"identifier","股票代號（或名稱）",h.identifier||h.symbol||h.name,"text","請輸入個股名稱或代號")}${field(i,"shares","持有股數",h.shares||"","number","請輸入股數")}${field(i,"averageCost","成本均價",h.averageCost||"","number","請輸入成交均價")}
    ${calculatedTextField("股票名稱",h.name||"待查詢")}${calculatedField("目前價格",h.currentPrice)}${calculatedField("持有總成本",h.costBasis)}${calculatedField("目前總市值",h.marketValue)}${calculatedField("總損益",h.profitAmount)}${calculatedField("報酬率 %",h.profitPercent)}
  </div><details class="rebalance-advanced"><summary>進階設定（選填）</summary><div class="rebalance-fields">${yesNoField(i,"valueTag","價值標籤",h.valueTag)}${yesNoField(i,"heatingTag","升溫標籤",h.heatingTag)}
      <label>市場<select data-holding="${i}" data-field="marketRegion">${["TW","US","GLOBAL","OTHER"].map(x=>`<option ${h.marketRegion===x?"selected":""}>${x}</option>`).join("")}</select></label>
      <label>曝險群組<select data-holding="${i}" data-field="exposureGroup">${["TAIWAN_LARGE_CAP","TAIWAN_TECH","TAIWAN_FINANCIAL","US_TECH","US_SEMICONDUCTOR","US_BROAD_MARKET","GLOBAL_TECH","GLOBAL_THEME","OTHER"].map(x=>`<option ${h.exposureGroup===x?"selected":""}>${x}</option>`).join("")}</select></label>
      <label>資產類型<input data-holding="${i}" data-field="assetType" value="${safe(h.assetType)}"></label><label class="check"><input type="checkbox" data-holding="${i}" data-field="leveraged" ${h.leveraged?"checked":""}>槓桿標的</label><label class="check"><input type="checkbox" data-holding="${i}" data-field="inArkToday" ${h.inArkToday?"checked":""}>今日在 ARK</label>
  </div></details></details><button type="button" class="rebalance-remove" data-remove-holding="${i}" aria-label="移除 ${safe(h.symbol||"此筆持股")}" title="移除此筆">×</button></div>`).join("")||`<p class="note">尚無持股。按「新增持股」後，只要輸入股票代號（或名稱）、持有股數與成本均價。</p>`;
}
function field(i,k,label,value,type="number",placeholder=""){return `<label>${label}<input data-holding="${i}" data-field="${k}" type="${type}" ${type==="number"?'step="any" min="0"':""} value="${safe(value??"")}" placeholder="${safe(placeholder)}"></label>`;}
function calculatedField(label,value){return `<label>${label}<input type="text" value="${safe(Number(value||0).toLocaleString("zh-TW",{maximumFractionDigits:2}))}" readonly></label>`;}
function calculatedTextField(label,value){return `<label>${label}<input type="text" value="${safe(value||"")}" readonly></label>`;}
function yesNoField(i,k,label,value){return `<label>${label}<select data-holding="${i}" data-field="${k}"><option value="" ${value!=="YES"&&value!=="NO"?"selected":""}>未設定</option><option value="YES" ${value==="YES"?"selected":""}>YES</option><option value="NO" ${value==="NO"?"selected":""}>NO</option></select></label>`;}
async function resolveHoldingIdentifier(index,query){
  const holding=state.holdings[index],raw=String(query||"").trim();if(!holding||!raw)return;
  $("rebalanceNotice").textContent=`正在查詢「${raw}」並取得最新行情…`;
  try{
    const known=(window.currentETFs||[]).find(item=>String(item.symbol||"").toUpperCase()===raw.toUpperCase()||String(item.name||"").trim()===raw),endpoint=CONFIG.securitySearchEndpoint||"/api/search";
    let item=known?{symbol:String(known.symbol).toUpperCase(),name:known.name,marketRegion:known.marketRegion||"TW"}:null;
    if(!item){const url=new URL(endpoint,location.href);url.searchParams.set("q",raw);const response=await fetch(url,{cache:"no-store"}),data=await response.json();if(!response.ok||!data.ok||!data.item)throw new Error(data.error||`HTTP ${response.status}`);item=data.item;}
    if(state.holdings[index]!==holding||String(holding.identifier).trim()!==raw)return;
    const metadata=(window.currentETFs||[]).find(etf=>String(etf.symbol||"").toUpperCase()===String(item.symbol).toUpperCase());
    Object.assign(holding,{symbol:String(item.symbol||"").toUpperCase(),name:item.name||metadata?.name||item.symbol,marketRegion:metadata?.marketRegion||item.marketRegion||"TW",exposureGroup:metadata?.exposureGroup||holding.exposureGroup,assetType:metadata?.assetType||item.assetType||holding.assetType,leveraged:Boolean(metadata?.leverage>1||metadata?.assetType==="LEVERAGED_TW"||holding.leveraged),periodReturns:null,currentPrice:0,marketValue:0,profitAmount:0,profitPercent:0});
    saveState();renderHoldingEditor();await refreshPerformance(true);
    $("rebalanceNotice").textContent=`已找到 ${holding.symbol} ${holding.name}，並以最近交易日收盤價自動計算。`;
  }catch(error){holding.symbol="";holding.name="";holding.currentPrice=0;Object.assign(holding,calculateHoldingMetrics(holding,0));saveState();renderHoldingEditor();$("rebalanceNotice").textContent=`找不到「${raw}」：${String(error?.message||error)} 請改用股票代號。`;}
}
function importHoldingRows(rows){
  const merged=new Map(state.holdings.filter(h=>h.symbol).map(h=>[String(h.symbol).toUpperCase(),h]));
  for(const row of rows){const symbol=String(row.symbol||"").toUpperCase().trim();if(!symbol||!Number.isInteger(Number(row.shares))||Number(row.shares)<=0||!(Number(row.costBasis)>0))continue;
    const prior=merged.get(symbol)||defaultHolding();
    const fields=Object.fromEntries(Object.entries(row).filter(([,value])=>value!==null&&value!==undefined&&value!==""));
    if(Number(fields.costBasis)>0&&Number(fields.shares)>0)fields.averageCost=Math.round(Number(fields.costBasis)/Number(fields.shares)*10000)/10000;
    merged.set(symbol,normalizedHolding({...prior,...fields,symbol}));
  }
  state.holdings=[...merged.values(),...state.holdings.filter(h=>!h.symbol)].slice(0,C.optimizer.maxHoldings);saveState();renderHoldingEditor();lastPlan=null;$("rebalanceResults").innerHTML="";renderRebalanceCalculator();void refreshPerformance();return state.holdings.length;
}
function saveState(){localStorage.setItem(C.storageKeys.state,JSON.stringify(state));}
function loadPerformanceCache(){try{return JSON.parse(localStorage.getItem(C.storageKeys.performance)||"null");}catch{return null;}}
function applyPerformance(items){const map=new Map((items||[]).map(item=>[String(item.symbol||"").toUpperCase(),item]));state.holdings=state.holdings.map(h=>{const quote=map.get(String(h.symbol).toUpperCase()),periodReturns=quote||h.periodReturns||null;return {...h,...calculateHoldingMetrics(h,quote?.latestPrice??h.currentPrice),periodReturns};});saveState();renderHoldingEditor();if(lastPlan)renderRebalanceCalculator();}
async function refreshPerformance(force=false){
  const symbols=[...new Set(state.holdings.map(h=>String(h.symbol||"").toUpperCase()).filter(Boolean))];if(!symbols.length||!C.performance?.enabled)return;
  const cached=loadPerformanceCache(),maxAge=(C.performance.cacheHours||12)*3600000;
  const cachedSymbols=new Set((cached?.items||[]).filter(item=>!item.error&&Number(item.latestPrice)>0&&[item.ytd,item.oneYear,item.threeYear].some(value=>optional(value)!=null)).map(item=>String(item.symbol||"").toUpperCase()));
  if(!force&&cached?.savedAt&&Date.now()-cached.savedAt<maxAge&&symbols.every(symbol=>cachedSymbols.has(symbol))){applyPerformance(cached.items);return;}
  const endpoint=CONFIG.performanceEndpoint||CONFIG.imageImport?.visionEndpoint||CONFIG.googleSheets?.webAppUrl;if(!endpoint)return;
  performanceLoading=true;if(lastPlan)renderRebalanceCalculator();
  try{const url=new URL(endpoint,location.href);url.searchParams.set("symbols",symbols.join(","));const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();if(!data.ok||!Array.isArray(data.items))throw new Error(data.error||"期間報酬格式錯誤");applyPerformance(data.items);localStorage.setItem(C.storageKeys.performance,JSON.stringify({savedAt:Date.now(),items:data.items,source:data.source,asOf:data.asOf}));}
  catch(error){console.warn("ETF performance unavailable",error);}
  finally{performanceLoading=false;if(lastPlan)renderRebalanceCalculator();}
}
function readInputs(){state.totalAssets=Math.max(0,finite($("rebalanceTotalAssets").value));state.targetOverride=optional($("rebalanceTarget").value);state.usRsi=optional($("rebalanceUsRsi").value);state.usBias=optional($("rebalanceUsBias").value);state.usPercentile=optional($("rebalanceUsPercentile").value);state.usReturn=optional($("rebalanceUsReturn").value);state.oddLot=$("rebalanceOddLot").checked;state.allowFullExit=$("rebalanceFullExit").checked;saveState();}
function loadState(){try{const saved=JSON.parse(localStorage.getItem(C.storageKeys.state)||"null");if(saved&&typeof saved==="object")state={...state,...saved,holdings:Array.isArray(saved.holdings)?saved.holdings.slice(0,C.optimizer.maxHoldings).map(normalizedHolding):[]};}catch{}
  for(const [id,value] of [["rebalanceTotalAssets",state.totalAssets],["rebalanceTarget",state.targetOverride],["rebalanceUsRsi",state.usRsi],["rebalanceUsBias",state.usBias],["rebalanceUsPercentile",state.usPercentile],["rebalanceUsReturn",state.usReturn]])$(id).value=value??"";
  $("rebalanceOddLot").checked=state.oddLot;$("rebalanceFullExit").checked=state.allowFullExit;}
function runRebalanceSelfTests(){const tests=[],test=(name,fn)=>{try{tests.push({name,ok:Boolean(fn())});}catch{tests.push({name,ok:false});}};
  const tw={factor:1.2},us=calculateUSMarketRegime(33),markets={tw,us};const raw=[{...defaultHolding(),symbol:"00631L",marketValue:210300,shares:1000,currentPrice:210.3,profitPercent:40.34,leveraged:true,inArkToday:true,exposureGroup:"TAIWAN_LARGE_CAP"},{...defaultHolding(),symbol:"0050",marketValue:143000,shares:1000,currentPrice:143,profitPercent:27.86,inArkToday:true,exposureGroup:"TAIWAN_LARGE_CAP"},{...defaultHolding(),symbol:"006208",marketValue:128800,shares:1000,currentPrice:128.8,profitPercent:232.58,inArkToday:true,exposureGroup:"TAIWAN_LARGE_CAP"}];
  const context={holdings:raw,totalAssets:1000000,markets,regime:"RISK_OFF"},scored=raw.map(h=>calculateSellPriority(h,context));
  test("CNN 33 降低美股因子",()=>us.factor===.8);
  test("CNN 不直接影響純台股",()=>calculateMarketSellFactor("TW",markets)===1.2);
  test("台股高熱可提高優先度",()=>calculateTaiwanMarketRegime({rsi:75,bias:7,percentile:.9,recentReturn:7,margin:205}).factor>1);
  test("00631L 有集中與槓桿警示",()=>scored[0].sellReasons.some(x=>x.includes("單檔"))&&scored[0].sellReasons.some(x=>x.includes("槓桿"))&&scored[0].groupWeight>.48);
  test("在 ARK 不自動禁賣",()=>optimizeSellShares(40000,scored,{oddLot:true,allowFullExit:false,regime:"RISK_OFF"}).soldHoldings.length>0);
  test("剛離開 ARK 不強制賣",()=>calculateArkPersistence({...raw[0],inArkToday:false,daysOutOfArk:1}).strongExit===false);
  test("虧損不自動保護",()=>calculateSellPriority({...raw[0],profitPercent:-20},context).sellPriorityScore>0);
  const performanceScores=calculatePerformanceScores([{symbol:"LOW",exposureGroup:"TEST",periodReturns:{ytd:-5,oneYear:0,threeYearAnnualized:2}},{symbol:"HIGH",exposureGroup:"TEST",periodReturns:{ytd:15,oneYear:20,threeYearAnnualized:18}}]);
  test("庫存多期弱勢提高、強勢降低調節順位",()=>performanceScores.get("LOW").points===C.performance.weakMaxPoints&&performanceScores.get("LOW").rank===2&&performanceScores.get("HIGH").points===-C.performance.strongMaxDiscount&&performanceScores.get("HIGH").rank===1);
  const ranked=[{symbol:"A",periodReturns:{ytd:20,oneYear:5,threeYear:30}},{symbol:"B",periodReturns:{ytd:10,oneYear:25,threeYear:40}}];
  test("今年、1年、3年報酬各自獨立排名",()=>rankHoldingsByReturn(ranked,"ytd")[0].symbol==="A"&&rankHoldingsByReturn(ranked,"oneYear")[0].symbol==="B"&&rankHoldingsByReturn(ranked,"threeYear")[0].symbol==="B");
  test("價格、股數與成本可計算市值損益報酬",()=>{const x=calculateHoldingMetrics({shares:100,costBasis:15000},200);return x.marketValue===20000&&x.profitAmount===5000&&x.profitPercent===33.33;});
  test("成本均價可換算持有總成本",()=>{const x=calculateHoldingMetrics({shares:100,averageCost:150},200);return x.costBasis===15000&&x.marketValue===20000&&x.profitAmount===5000&&x.profitPercent===33.33;});
  const opt=optimizeSellShares(40000,scored,{oddLot:true,allowFullExit:false,regime:"RISK_OFF"});
  test("股數不超過庫存",()=>opt.soldHoldings.every(x=>x.sellShares<=x.shares));
  test("零股方案接近 40000",()=>Math.abs(opt.actualReduction-40000)<500);
  test("關閉零股只賣整張",()=>optimizeSellShares(40000,scored,{oddLot:false,allowFullExit:false,regime:"RISK_OFF"}).soldHoldings.every(x=>x.sellShares%1000===0));
  test("非強退不完整清空",()=>optimizeSellShares(999999,scored,{oddLot:true,allowFullExit:false,regime:"DISTRIBUTION"}).soldHoldings.every(x=>x.sellShares<x.shares));
  return {passed:tests.filter(x=>x.ok).length,total:tests.length,tests};
}
function init(){loadState();const cached=loadPerformanceCache();if(cached?.items)applyPerformance(cached.items);renderHoldingEditor();renderRebalanceCalculator();
  for(const id of ["rebalanceTotalAssets","rebalanceTarget","rebalanceUsRsi","rebalanceUsBias","rebalanceUsPercentile","rebalanceUsReturn","rebalanceOddLot","rebalanceFullExit"])$(id).addEventListener("change",()=>{readInputs();renderRebalanceCalculator();});
  $("rebalanceAddHolding").addEventListener("click",()=>{if(state.holdings.length>=C.optimizer.maxHoldings)return;state.holdings.push(defaultHolding());saveState();renderHoldingEditor();});
  $("rebalanceHoldings").addEventListener("change",async e=>{const i=Number(e.target.dataset.holding),key=e.target.dataset.field;if(!key||!state.holdings[i])return;state.holdings[i][key]=e.target.type==="checkbox"?e.target.checked:e.target.type==="number"?finite(e.target.value):e.target.value;if(key==="identifier"){state.holdings[i].symbol="";state.holdings[i].name="";saveState();await resolveHoldingIdentifier(i,state.holdings[i].identifier);renderRebalanceCalculator();return;}if(key==="shares"||key==="averageCost")Object.assign(state.holdings[i],calculateHoldingMetrics(state.holdings[i],state.holdings[i].currentPrice));saveState();if(key==="shares"||key==="averageCost")renderHoldingEditor();renderRebalanceCalculator();});
  $("rebalanceHoldings").addEventListener("click",e=>{const b=e.target.closest("[data-remove-holding]");if(!b)return;state.holdings.splice(Number(b.dataset.removeHolding),1);saveState();renderHoldingEditor();renderRebalanceCalculator();});
  $("rebalanceCalculate").addEventListener("click",async()=>{readInputs();const input=api.getInput(),decision=window.currentDecision;lastPlan=buildPlan(decision,input,state.holdings,state,window.centralRecords||[]);renderResults(lastPlan);await refreshPerformance();});
  $("rebalanceSave").addEventListener("click",()=>{if(!lastPlan){$("rebalanceNotice").textContent="請先計算調節方案。";return;}saveRebalanceSnapshot(lastPlan);$("rebalanceNotice").textContent="已將本次方案與策略版本儲存於此裝置。";});
  // Existing engine is left untouched; observe completed renders.
  const observer=new MutationObserver(()=>renderRebalanceCalculator());observer.observe($("targetExecution"),{childList:true});
  window.RebalanceCalculator={calculateTargetReduction,calculateUSMarketRegime,calculateTaiwanMarketRegime,calculateMarketSellFactor,calculateArkPersistence,calculateSingleConcentration,calculateExposureGroupConcentration,calculateProfitBuffer,calculateHoldingMetrics,calculatePerformanceScores,rankHoldingsByReturn,calculateSellPriority,generateSellReasons,allocateReductionAcrossMarkets,optimizeSellShares,generateAlternativePlans,saveRebalanceSnapshot,renderRebalanceCalculator,renderMarketRegime,renderSellPlan,renderSellExplanation,renderPerformanceComparison,runRebalanceSelfTests,buildPlan,importHoldingRows,refreshPerformance,resolveHoldingIdentifier};
  const tests=runRebalanceSelfTests(),list=$("selfTestList");if(list){list.insertAdjacentHTML("beforeend",tests.tests.map(x=>`<li>${x.ok?"通過":"失敗"} · 調節：${safe(x.name)}</li>`).join(""));const counts=$("selfTestBadge").textContent.match(/(\d+)\s*\/\s*(\d+)/),old=Number(counts?.[1]||0),total=Number(counts?.[2]||0);$("selfTestBadge").textContent=`${old+tests.passed} / ${total+tests.total} 通過`;$("selfTestBadge").className=`badge ${old+tests.passed===total+tests.total?"buy":"sell"}`;}
}
document.addEventListener("DOMContentLoaded",init);
})();
