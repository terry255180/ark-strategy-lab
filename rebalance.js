"use strict";
// Rebalance V1: pure strategy functions above the UI boundary. All parameters are heuristic.
(() => {
const C=CONFIG.rebalance, money=n=>`NT$${Math.round(n).toLocaleString("zh-TW")}`;
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
const finite=n=>Number.isFinite(Number(n))?Number(n):0;
const optional=n=>n===""||n==null?null:Number.isFinite(Number(n))?Number(n):null;
const cap=(n,a,b)=>Math.max(a,Math.min(b,n));
const defaultHolding=()=>({symbol:"",name:"",marketValue:0,shares:0,currentPrice:0,profitAmount:0,profitPercent:0,assetType:"ETF",marketRegion:"TW",exposureGroup:"OTHER",leveraged:false,inArkToday:false,arkRank:null,daysOutOfArk:0,arkPresence5D:0,valueTag:"",heatingTag:""});
let state={holdings:[],totalAssets:0,targetOverride:null,usRsi:null,usBias:null,usPercentile:null,usReturn:null,oddLot:C.optimizer.defaultOddLot,allowFullExit:C.optimizer.defaultFullExit},lastPlan=null,autoTarget=0;
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
  score=cap(Math.round(score*marketFactor+profitBuffer),0,100);
  const priorityLevel=score>=p.levels.veryHigh?"VERY_HIGH":score>=p.levels.high?"HIGH":score>=p.levels.medium?"MEDIUM":score>=p.levels.watch?"WATCH":"LOW";
  const detail={...h,singleWeight,groupWeight,persistence,marketFactor,profitBuffer,smallCleanup,sellPriorityScore:score,priorityLevel};
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
function normalizedHolding(h){const x={...defaultHolding(),...h};for(const k of ["marketValue","shares","currentPrice","profitAmount","profitPercent","arkRank","daysOutOfArk","arkPresence5D"])x[k]=optional(x[k])??0;x.shares=Math.max(0,Math.floor(x.shares));x.currentPrice=Math.max(0,x.currentPrice);x.marketValue=Math.max(0,x.marketValue||x.shares*x.currentPrice);x.leveraged=Boolean(x.leveraged);x.inArkToday=Boolean(x.inArkToday);return x;}
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
  const context={holdings:clean,totalAssets,markets,regime:decision.regime};const scored=clean.map(x=>calculateSellPriority(x,context)).sort((a,b)=>b.sellPriorityScore-a.sellPriorityScore);
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
  const p=plan.primary;const rows=p.soldHoldings.map(x=>`<div class="rebalance-sell-row"><strong>${safe(x.symbol)} ${safe(x.name)}</strong><span>賣 ${x.sellShares.toLocaleString("zh-TW")} 股 · 約 ${money(x.sellAmount)}</span><span>${x.priorityLevel} · ${x.sellPriorityScore}/100</span><small>${x.sellReasons.map(safe).join("、")}</small></div>`).join("")||`<p class="note">沒有符合股數與價格條件的可執行賣單。</p>`;
  const alternatives=plan.alternatives.map((a,i)=>`<div class="rebalance-alt"><strong>替代方案 ${i+1} · ${safe(a.name)}</strong><span>${a.soldHoldings.map(x=>`${safe(x.symbol)} ${x.sellShares} 股`).join("、")} · ${money(a.actualReduction)}</span></div>`).join("");
  return `<div class="rebalance-plan"><h3>建議調節方案 · PRIMARY PLAN</h3>${rows}<div class="rebalance-totals"><span>實際調節 ${money(p.actualReduction)}</span><span>目標 ${money(plan.target)}</span><span>差額 ${money(p.difference)}</span><span>接近度 ${p.accuracy.toFixed(1)}%</span></div>${alternatives}</div>`;
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
  const alloc=plan.allocations;$("rebalanceResults").innerHTML=`<div class="rebalance-result-grid">${renderMarketRegime(plan)}<div class="rebalance-mini"><strong>市場調節分配</strong><span>台股 ${money(alloc.TW.amount)} · ${(alloc.TW.share*100).toFixed(0)}%</span><span>美股／全球 ${money(alloc["US / GLOBAL"].amount)} · ${(alloc["US / GLOBAL"].share*100).toFixed(0)}%</span></div></div>${renderSellPlan(plan)}${renderSellExplanation(plan)}`;
  $("rebalanceNotice").textContent=plan.decision.action!=="SELL"&&state.targetOverride==null?"目前賣出引擎沒有調節訊號；如要研究假設情境，可手動輸入目標金額。":plan.target>0?`已計算 ${money(plan.target)} 調節目標。請核對持股、價格及股數，方案不會自動下單。`:"調節目標為 0；不產生賣單。";
}
function renderHoldingEditor(){
  $("rebalanceHoldings").innerHTML=state.holdings.map((h,i)=>`<div class="rebalance-holding"><details ${i===state.holdings.length-1?"open":""}><summary>${safe(h.symbol||"新持股")} ${safe(h.name)} · ${money(h.marketValue||h.shares*h.currentPrice)}</summary><div class="rebalance-fields">
    ${field(i,"symbol","代號",h.symbol,"text")}${field(i,"name","名稱",h.name,"text")}${field(i,"shares","持有股數",h.shares)}${field(i,"currentPrice","目前價格",h.currentPrice)}${field(i,"marketValue","市值（可留 0 自算）",h.marketValue)}${field(i,"profitAmount","損益金額",h.profitAmount)}${field(i,"profitPercent","損益 %",h.profitPercent)}${yesNoField(i,"valueTag","價值標籤",h.valueTag)}${yesNoField(i,"heatingTag","升溫標籤",h.heatingTag)}
    <label>市場<select data-holding="${i}" data-field="marketRegion">${["TW","US","GLOBAL","OTHER"].map(x=>`<option ${h.marketRegion===x?"selected":""}>${x}</option>`).join("")}</select></label>
    <label>曝險群組<select data-holding="${i}" data-field="exposureGroup">${["TAIWAN_LARGE_CAP","TAIWAN_TECH","TAIWAN_FINANCIAL","US_TECH","US_SEMICONDUCTOR","US_BROAD_MARKET","GLOBAL_TECH","GLOBAL_THEME","OTHER"].map(x=>`<option ${h.exposureGroup===x?"selected":""}>${x}</option>`).join("")}</select></label>
    <label>資產類型<input data-holding="${i}" data-field="assetType" value="${safe(h.assetType)}"></label><label class="check"><input type="checkbox" data-holding="${i}" data-field="leveraged" ${h.leveraged?"checked":""}>槓桿標的</label><label class="check"><input type="checkbox" data-holding="${i}" data-field="inArkToday" ${h.inArkToday?"checked":""}>今日在 ARK</label>
  </div></details><button type="button" class="rebalance-remove" data-remove-holding="${i}" aria-label="移除 ${safe(h.symbol||"此筆持股")}" title="移除此筆">×</button></div>`).join("")||`<p class="note">尚無持股。按「新增持股」輸入資料；既有 ETF 買進資料不包含實際持股股數與成本，因此不會被當成真實持股。</p>`;
}
function field(i,k,label,value,type="number"){return `<label>${label}<input data-holding="${i}" data-field="${k}" type="${type}" ${type==="number"?'step="any"':""} value="${safe(value??"")}"></label>`;}
function yesNoField(i,k,label,value){return `<label>${label}<select data-holding="${i}" data-field="${k}"><option value="" ${value!=="YES"&&value!=="NO"?"selected":""}>未設定</option><option value="YES" ${value==="YES"?"selected":""}>YES</option><option value="NO" ${value==="NO"?"selected":""}>NO</option></select></label>`;}
function importHoldingRows(rows){
  const merged=new Map(state.holdings.filter(h=>h.symbol).map(h=>[String(h.symbol).toUpperCase(),h]));
  for(const row of rows){const symbol=String(row.symbol||"").toUpperCase().trim();if(!symbol||!Number.isInteger(Number(row.shares))||Number(row.shares)<=0||!(Number(row.currentPrice)>0))continue;
    const prior=merged.get(symbol)||defaultHolding();
    const fields=Object.fromEntries(Object.entries(row).filter(([,value])=>value!==null&&value!==undefined&&value!==""));
    merged.set(symbol,normalizedHolding({...prior,...fields,symbol,marketValue:fields.marketValue??Number(row.shares)*Number(row.currentPrice)}));
  }
  state.holdings=[...merged.values(),...state.holdings.filter(h=>!h.symbol)].slice(0,C.optimizer.maxHoldings);saveState();renderHoldingEditor();lastPlan=null;$("rebalanceResults").innerHTML="";renderRebalanceCalculator();return state.holdings.length;
}
function saveState(){localStorage.setItem(C.storageKeys.state,JSON.stringify(state));}
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
  const opt=optimizeSellShares(40000,scored,{oddLot:true,allowFullExit:false,regime:"RISK_OFF"});
  test("股數不超過庫存",()=>opt.soldHoldings.every(x=>x.sellShares<=x.shares));
  test("零股方案接近 40000",()=>Math.abs(opt.actualReduction-40000)<500);
  test("關閉零股只賣整張",()=>optimizeSellShares(40000,scored,{oddLot:false,allowFullExit:false,regime:"RISK_OFF"}).soldHoldings.every(x=>x.sellShares%1000===0));
  test("非強退不完整清空",()=>optimizeSellShares(999999,scored,{oddLot:true,allowFullExit:false,regime:"DISTRIBUTION"}).soldHoldings.every(x=>x.sellShares<x.shares));
  return {passed:tests.filter(x=>x.ok).length,total:tests.length,tests};
}
function init(){loadState();renderHoldingEditor();renderRebalanceCalculator();
  for(const id of ["rebalanceTotalAssets","rebalanceTarget","rebalanceUsRsi","rebalanceUsBias","rebalanceUsPercentile","rebalanceUsReturn","rebalanceOddLot","rebalanceFullExit"])$(id).addEventListener("change",()=>{readInputs();renderRebalanceCalculator();});
  $("rebalanceAddHolding").addEventListener("click",()=>{if(state.holdings.length>=C.optimizer.maxHoldings)return;state.holdings.push(defaultHolding());saveState();renderHoldingEditor();});
  $("rebalanceHoldings").addEventListener("change",e=>{const i=Number(e.target.dataset.holding),key=e.target.dataset.field;if(!key||!state.holdings[i])return;state.holdings[i][key]=e.target.type==="checkbox"?e.target.checked:e.target.type==="number"?finite(e.target.value):e.target.value;saveState();renderRebalanceCalculator();});
  $("rebalanceHoldings").addEventListener("click",e=>{const b=e.target.closest("[data-remove-holding]");if(!b)return;state.holdings.splice(Number(b.dataset.removeHolding),1);saveState();renderHoldingEditor();renderRebalanceCalculator();});
  $("rebalanceCalculate").addEventListener("click",()=>{readInputs();const input=api.getInput(),decision=window.currentDecision;lastPlan=buildPlan(decision,input,state.holdings,state,window.centralRecords||[]);renderResults(lastPlan);});
  $("rebalanceSave").addEventListener("click",()=>{if(!lastPlan){$("rebalanceNotice").textContent="請先計算調節方案。";return;}saveRebalanceSnapshot(lastPlan);$("rebalanceNotice").textContent="已將本次方案與策略版本儲存於此裝置。";});
  // Existing engine is left untouched; observe completed renders.
  const observer=new MutationObserver(()=>renderRebalanceCalculator());observer.observe($("targetExecution"),{childList:true});
  window.RebalanceCalculator={calculateTargetReduction,calculateUSMarketRegime,calculateTaiwanMarketRegime,calculateMarketSellFactor,calculateArkPersistence,calculateSingleConcentration,calculateExposureGroupConcentration,calculateProfitBuffer,calculateSellPriority,generateSellReasons,allocateReductionAcrossMarkets,optimizeSellShares,generateAlternativePlans,saveRebalanceSnapshot,renderRebalanceCalculator,renderMarketRegime,renderSellPlan,renderSellExplanation,runRebalanceSelfTests,buildPlan,importHoldingRows};
  const tests=runRebalanceSelfTests(),list=$("selfTestList");if(list){list.insertAdjacentHTML("beforeend",tests.tests.map(x=>`<li>${x.ok?"通過":"失敗"} · 調節：${safe(x.name)}</li>`).join(""));const counts=$("selfTestBadge").textContent.match(/(\d+)\s*\/\s*(\d+)/),old=Number(counts?.[1]||0),total=Number(counts?.[2]||0);$("selfTestBadge").textContent=`${old+tests.passed} / ${total+tests.total} 通過`;$("selfTestBadge").className=`badge ${old+tests.passed===total+tests.total?"buy":"sell"}`;}
}
document.addEventListener("DOMContentLoaded",init);
})();
