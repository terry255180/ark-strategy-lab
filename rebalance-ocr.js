"use strict";
// Portfolio screenshot OCR is deliberately separate from ARK's fixed-layout screenshot parser.
(() => {
const $=id=>document.getElementById(id),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
const number=s=>{const source=String(s??"").trim();const raw=source.replace(/[Ｏ０Oo]/g,"0").replace(/[ＩｌIl|]/g,"1").replace(/[，,\s$＄NT元股]/g,"").replace(/[−－]/g,"-").replace(/[%％]/g,"").replace(/[：:]/g,source.includes("%")||source.includes("％")?".":":");const n=Number(raw);return raw&&Number.isFinite(n)?n:null;};
const profitNumber=s=>number(String(s??"").replace(/^[=＝](?=\s*\d)/,"-"));
const twSymbol=s=>{const x=String(s??"").trim().toUpperCase().replace(/[Ｏ０O]/g,"0").replace(/[ＩｌI|]/g,"1");return /^\d{4,6}[A-Z]?$/.test(x)?x:null;};
const ticker=s=>{const tw=twSymbol(s);if(tw)return tw;const x=String(s??"").trim().toUpperCase();return /^[A-Z]{1,5}$/.test(x)&&!/^(?:TW|US|ETF|NAV|USD|TWD|TOTAL|QTY|PRICE|VALUE|SHARE|SHARES|PCT|COST|PROFIT|LOSS|RSI|PNL|ARK)$/.test(x)?x:null;};
const aliases={shares:/股數|庫存量|持有量|持有股數|數量|QTY|SHARES|QUANTITY/i,currentPrice:/現價|成交價|目前價格|市價|股價|PRICE|LAST/i,marketValue:/市值|現值|目前市值|庫存市值|MARKET\s*VALUE|VALUE/i,profitAmount:/損益金額|累計損益|未實現損益|總損益|損益|P\/L|PROFIT/i,profitPercent:/報酬率|損益率|獲利率|收益率|RETURN\s*%|P\/L\s*%/i};
const sampleNames={"2383":"台光電","006208":"富邦台50","00631L":"元大台灣50正2","0050":"元大台灣50","00911":"兆豐洲際半導體","00876":"元大全球5G","00861":"元大全球未來通訊","0053":"元大電子","0052":"富邦科技","0056":"元大高股息","2454":"聯發科","00830":"國泰費城半導體","0055":"元大MSCI金融","0057":"富邦摩台","006203":"元大MSCI台灣","6757":"台灣虎航","1432":"大魯閣","00988A":"主動統一全球創新"};
let files=[],urls=[],rows=[],busy=false;
const empty=s=>({symbol:s,name:"",shares:null,currentPrice:null,marketValue:null,profitAmount:null,profitPercent:null,marketRegion:/^[A-Z]{1,5}$/.test(s)?"US":"OTHER",exposureGroup:"OTHER",warnings:[]});
function normalizeWords(blocks){const out=[];for(const b of blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[])for(const w of l.words||[]){if(!w.text?.trim()||!w.bbox)continue;out.push({text:String(w.text).trim(),x:(w.bbox.x0+w.bbox.x1)/2,y:(w.bbox.y0+w.bbox.y1)/2});}return out;}
function findColumns(words){const header=words.filter(w=>Object.values(aliases).some(re=>re.test(w.text)));return Object.fromEntries(Object.entries(aliases).map(([key,re])=>[key,header.filter(w=>re.test(w.text)).sort((a,b)=>a.y-b.y)[0]||null]));}
function inferTriplet(tokens){
  const nums=tokens.map(t=>number(t.text)).filter(n=>n!==null&&n>0);let match=null;
  // Only infer unlabeled columns when price × integer shares corroborates market value.
  for(let i=0;i<nums.length;i++)for(let j=0;j<nums.length;j++)for(let k=0;k<nums.length;k++){
    if(i===j||i===k||j===k)continue;const shares=nums[i],price=nums[j],value=nums[k];
    if(!Number.isInteger(shares)||shares<1||shares>1e8||price<.01||price>1e6||value<1)continue;
    const error=Math.abs(shares*price-value)/Math.max(value,1);
    if(error<.03&&(!match||error<match.error))match={shares,currentPrice:price,marketValue:value,error};
  }return match;
}
function parseArkPortfolioWords(words,width){
  // 方舟「調節庫存」：左欄代號、中欄總損益/報酬率、右欄總成本/持有股數。
  const headerY=words.filter(w=>w.x<width*.35&&/股票|名稱/.test(w.text)).reduce((max,w)=>Math.max(max,w.y),-Infinity);
  const anchors=words.map(w=>({...w,symbol:twSymbol(w.text)})).filter(w=>w.symbol&&w.x<width*.36&&w.y>headerY+width*.01).sort((a,b)=>a.y-b.y),result=[];
  for(let i=0;i<anchors.length;i++){
    const a=anchors[i],previous=anchors[i-1],next=anchors[i+1],top=previous?(previous.y+a.y)/2:a.y-Math.max(65,next?(next.y-a.y)*.75:100),bottom=next?(a.y+next.y)/2:a.y+Math.max(45,previous?(a.y-previous.y)*.30:80);
    const band=words.filter(w=>w.y>=top&&w.y<bottom),middle=band.filter(w=>w.x>=width*.37&&w.x<width*.65),right=band.filter(w=>w.x>=width*.66&&w.x<width*.94);
    const amounts=middle.filter(w=>profitNumber(w.text)!==null&&!/[%％]/.test(w.text)).sort((x,y)=>x.y-y.y),percents=middle.filter(w=>/[%％]/.test(w.text)&&number(w.text)!==null).sort((x,y)=>x.y-y.y),positions=right.filter(w=>number(w.text)!==null&&!/[%％]/.test(w.text)).sort((x,y)=>x.y-y.y);
    const row=empty(a.symbol),cost=positions.length?number(positions[0].text):null,shareParts=positions.slice(1).sort((x,y)=>x.x-y.x),shareText=shareParts.map(w=>w.text.replace(/[^0-9]/g,"")).join(""),shares=shareText?Number(shareText):null;
    row.name=band.filter(w=>w.x<width*.36&&w!==a&&/[\u3400-\u9fff]/.test(w.text)&&!/^現股$|^價值$/.test(w.text)).sort((x,y)=>x.y-y.y||x.x-y.x).map(w=>w.text).join("").slice(0,30);
    const reportedPercent=percents.length?number(percents[0].text):null,percentEstimate=reportedPercent!==null?Math.round(cost*reportedPercent/100):null,amountRead=amounts.length?profitNumber(amounts[0].text):null;
    row.shares=Number.isInteger(shares)&&shares>0?shares:null;row.profitPercent=reportedPercent??(cost>0&&amountRead!==null?Math.round(amountRead/cost*10000)/100:null);row.profitAmount=amountRead;
    if(cost===null||cost<0||reportedPercent===null&&amountRead===null){result.push(checkRow(row));continue;}
    const amountConsistent=amountRead!==null&&percentEstimate!==null&&Math.abs(amountRead-percentEstimate)<=Math.max(10,Math.abs(percentEstimate)*.05);
    const costFromProfit=amountRead!==null&&reportedPercent!==null&&Math.abs(reportedPercent)>1?Math.round(amountRead/(reportedPercent/100)):null;
    const estimatedCost=cost>1000&&Math.abs(amountRead??0)>1000&&costFromProfit>1000&&Math.abs(cost-costFromProfit)/cost>.15;
    const adjustedCost=estimatedCost?costFromProfit:cost;
    const profitAmount=estimatedCost?amountRead:amountConsistent||percentEstimate===null?amountRead:percentEstimate;
    if(profitAmount===null){result.push(checkRow(row));continue;}
    const marketValue=Math.round(adjustedCost+profitAmount);if(marketValue<=0){result.push(checkRow(row));continue;}
    Object.assign(row,{currentPrice:row.shares?Math.round(marketValue/row.shares*100)/100:null,marketValue,profitAmount,estimatedValue:true,estimatedProfit:!estimatedCost&&!amountConsistent&&percentEstimate!==null,estimatedCost,source:"ARK_PORTFOLIO"});
    result.push(checkRow(row));
  }
  return result;
}
async function recoverArkShares(worker,canvas,words,items){
  const factor=canvas.width/1206,anchors=words.map(w=>({...w,symbol:twSymbol(w.text)})).filter(w=>w.symbol&&w.x<canvas.width*.36);
  const missing=items.filter(r=>r.source==="ARK_PORTFOLIO"&&!(r.shares>0));if(!missing.length)return;
  await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SINGLE_WORD,tessedit_char_whitelist:"0123456789"});
  for(const row of missing){const anchor=anchors.find(w=>w.symbol===row.symbol);if(!anchor)continue;
    const percentY=words.filter(w=>w.x>canvas.width*.37&&w.x<canvas.width*.65&&Math.abs(w.y-anchor.y)<85*factor&&/[%％]/.test(w.text)).sort((a,b)=>Math.abs(a.y-anchor.y)-Math.abs(b.y-anchor.y))[0]?.y;
    const center=percentY??anchor.y,crop=document.createElement("canvas");crop.width=1000;crop.height=300;
    crop.getContext("2d").drawImage(canvas,850*factor,center-45*factor,250*factor,75*factor,0,0,1000,300);
    const result=await worker.recognize(crop),raw=String(result.data.text||"").trim();crop.width=1;crop.height=1;
    if(!/^\d{1,7}$/.test(raw)||Number(raw)<1)continue;
    row.shares=Number(raw);row.recoveredShares=true;if(row.marketValue>0)row.currentPrice=Math.round(row.marketValue/row.shares*100)/100;
    row.warnings=checkRow(row).warnings;
  }
  await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT,tessedit_char_whitelist:""});
}
function parseHoldingWords(words,width){
  const columns=findColumns(words),anchors=words.map(w=>({...w,symbol:ticker(w.text)})).filter(w=>w.symbol&&w.x<width*.42).sort((a,b)=>a.y-b.y),found=[];
  for(let i=0;i<anchors.length;i++){
    const a=anchors[i];if(found.some(x=>x.symbol===a.symbol))continue;
    const spacing=i<anchors.length-1?anchors[i+1].y-a.y:i? a.y-anchors[i-1].y:100;
    const top=i?(anchors[i-1].y+a.y)/2:a.y-Math.max(25,spacing*.5),bottom=i<anchors.length-1?(a.y+anchors[i+1].y)/2:a.y+Math.max(25,spacing*.5);
    const line=words.filter(w=>w.y>=top&&w.y<bottom&&w!==a),row=empty(a.symbol);
    row.name=line.filter(w=>w.x<width*.42&&/[\u3400-\u9fff]/.test(w.text)&&!Object.values(aliases).some(re=>re.test(w.text))).map(w=>w.text).join("").slice(0,30);
    for(const [key,head] of Object.entries(columns)){
      if(!head)continue;
      const candidates=line.filter(w=>Math.abs(w.x-head.x)<width*.085&&w.y>head.y+8&&number(w.text)!==null);
      const selected=candidates.sort((first,second)=>Math.abs(first.y-a.y)-Math.abs(second.y-a.y))[0];
      if(selected)row[key]=number(selected.text);
    }
    const percent=line.filter(w=>/[%％]/.test(w.text)).map(w=>number(w.text)).filter(n=>n!==null&&Math.abs(n)<=1000);
    if(row.profitPercent===null&&percent.length===1)row.profitPercent=percent[0];
    if(row.shares===null||row.currentPrice===null||row.marketValue===null){const guess=inferTriplet(line);if(guess)for(const key of ["shares","currentPrice","marketValue"])row[key]??=guess[key];}
    found.push(checkRow(row));
  }
  return found;
}
function parseHoldingText(text){
  const lines=String(text||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean),result=[];
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(/(?:^|\s)(\d{4,6}[A-Z]?|[A-Z]{1,5})(?=\s|$)/i);if(!match)continue;
    const s=ticker(match[1]);if(!s)continue;
    const row=empty(s),line=lines[i],rest=line.replace(match[0]," ");
    row.name=(rest.match(/[\u3400-\u9fff]{2,}/g)||[]).join("").slice(0,30);
    const nearby=[line];for(let offset=1;offset<=2;offset++){const next=lines[i+offset]||"";if(/(?:^|\s)(?:\d{4,6}[A-Z]?|[A-Z]{1,5})(?=\s|$)/.test(next))break;nearby.push(next);}const combined=nearby.join(" ");
    const percent=[...combined.matchAll(/[-+−]?\d+(?:[.,]\d+)?\s*[%％]/g)].map(x=>number(x[0])).filter(x=>x!==null);
    if(percent.length===1)row.profitPercent=percent[0];
    const tokens=[...combined.matchAll(/[-+−]?\d[\d,]*(?:\.\d+)?/g)].map(x=>({text:x[0]})).filter(x=>x.text!==s);
    const guess=inferTriplet(tokens);if(guess)Object.assign(row,guess);
    result.push(checkRow(row));
  }return result;
}
function checkRow(row){
  const warnings=[];if(!row.shares||!Number.isInteger(row.shares))warnings.push("股數待核對");if(!(row.currentPrice>0))warnings.push("價格待核對");
  if(row.shares>0&&row.currentPrice>0&&row.marketValue>0&&Math.abs(row.shares*row.currentPrice-row.marketValue)/row.marketValue>.08)warnings.push("股數 × 價格與市值不符");
  if(row.estimatedValue)warnings.push("市值／單價由成本＋損益估算，請與券商現值核對");
  if(row.estimatedProfit)warnings.push("損益金額由成本與報酬率估算，請核對");
  if(row.estimatedCost)warnings.push("成本辨識與報酬率不符，已反推估算，請核對");
  if(row.recoveredShares)warnings.push("股數由局部放大補辨，請與截圖核對");
  if(row.inferredRegion)warnings.push("市場分類依名稱推定，請核對");
  if(row.conflicts?.length)warnings.push("多張圖片數值不一致，請核對");
  if(row.marketRegion==="OTHER")warnings.push("請確認市場分類");return {...row,warnings};
}
function mergeRows(items){const map=new Map();for(const row of items){if(!row.symbol)continue;const old=map.get(row.symbol)||empty(row.symbol),next={...old};const conflicts=[...(old.conflicts||[])];
    for(const [key,value] of Object.entries(row)){if(key==="warnings"||key==="error"||key==="conflicts"||value===null||value===""||value===undefined)continue;
      if(next[key]===null||next[key]===""||next[key]===undefined||key==="marketRegion"&&next[key]==="OTHER"&&value!=="OTHER")next[key]=value;
      else if(["shares","currentPrice","marketValue"].includes(key)&&Number(next[key])!==Number(value))conflicts.push(key);
    }next.conflicts=[...new Set(conflicts)];map.set(row.symbol,checkRow(next));}
  return [...map.values()];}
function enrichFromExistingETF(items,etfs){
  const bySymbol=new Map((etfs||[]).filter(e=>e.symbol).map(e=>[String(e.symbol).toUpperCase(),e]));
  const region={TAIWAN_EQUITY:"TW",LEVERAGED_TW:"TW",US_EQUITY:"US",GLOBAL_EQUITY:"GLOBAL"};
  return items.map(row=>{const etf=bySymbol.get(row.symbol),name=etf?.name||sampleNames[row.symbol]||row.name||"";
    const inferred=/費城/.test(name)?"US":/全球|洲際/.test(name)?"GLOBAL":/^\d{4}$/.test(row.symbol)||/台灣|台50|摩台|金融|電子|科技|高股息/.test(name)?"TW":"OTHER";
    const marketRegion=row.marketRegion==="OTHER"?region[etf?.assetType]||inferred:row.marketRegion;
    const group=/台灣50|台50|摩台|MSCI台灣/.test(name)?"TAIWAN_LARGE_CAP":/金融/.test(name)?"TAIWAN_FINANCIAL":/半導體/.test(name)?marketRegion==="TW"?"TAIWAN_TECH":"US_SEMICONDUCTOR":/科技|電子/.test(name)&&marketRegion==="TW"?"TAIWAN_TECH":/全球/.test(name)?"GLOBAL_THEME":"OTHER";
    return checkRow({...row,name,marketRegion,inferredRegion:row.marketRegion==="OTHER"&&!region[etf?.assetType]&&inferred!=="OTHER",exposureGroup:row.exposureGroup==="OTHER"?etf?.exposureGroup||group:row.exposureGroup,...(etf?.leverage>1||etf?.assetType==="LEVERAGED_TW"?{leveraged:true}:{}),...(etf?.assetType?{assetType:etf.assetType}:{})});});
}
function setStatus(s){$("rebalanceOcrStatus").textContent=s;}
function clear(){urls.forEach(URL.revokeObjectURL);urls=[];files=[];rows=[];$("rebalanceOcrImages").value="";$("rebalanceOcrPreview").innerHTML="";$("rebalanceOcrProgress").hidden=true;$("rebalanceClearOcr").hidden=true;$("rebalanceRunOcr").disabled=true;setStatus("尚未選擇圖片");}
async function prepare(file){const bitmap=await createImageBitmap(file),scale=Math.min(1.6,2000/bitmap.width,Math.sqrt(5000000/(bitmap.width*bitmap.height))),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas;}
async function recognize(){
  if(busy)return;if(location.protocol==="file:"){setStatus("請透過本機伺服器或 GitHub Pages 開啟網站後辨識。");return;}
  if(!window.Tesseract){setStatus("本機 OCR 模型未載入，請確認 vendor/tesseract 檔案已部署。");return;}
  busy=true;$("rebalanceRunOcr").disabled=true;$("rebalanceOcrProgress").hidden=false;$("rebalanceOcrProgressBar").style.width="2%";let worker;
  try{
    const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    worker=await Tesseract.createWorker(["eng"],Tesseract.OEM.LSTM_ONLY,{workerPath:"vendor/tesseract/worker.min.js",langPath:"vendor/tesseract/lang",corePath:"vendor/tesseract",logger:msg=>{if(msg.progress!=null)$("rebalanceOcrProgressBar").style.width=`${Math.round(msg.progress*80)}%`;}});
    await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT,preserve_interword_spaces:"1"});
    const detected=[];for(let i=0;i<files.length;i++){setStatus(`正在辨識第 ${i+1}/${files.length} 張…`);let canvas;try{canvas=await prepare(files[i]);const result=await worker.recognize(canvas,{}, {text:true,blocks:true}),words=normalizeWords(result.data.blocks),layout=parseArkPortfolioWords(words,canvas.width),generic=[...parseHoldingWords(words,canvas.width),...parseHoldingText(result.data.text)].filter(r=>r.shares>0&&r.currentPrice>0);if(layout.length)await recoverArkShares(worker,canvas,words,layout);detected.push(...(layout.length?layout:generic));}finally{if(canvas){canvas.width=1;canvas.height=1;}}}
    rows=enrichFromExistingETF(mergeRows(detected),window.currentETFs);$("rebalanceOcrProgressBar").style.width="100%";
    if(rows.length){const {accepted,skipped}=eligible(rows);if(accepted.length)window.RebalanceCalculator.importHoldingRows(accepted.map(({warnings,...r})=>r));const missing=skipped.map(r=>r.symbol||"未辨識代號").join("、");setStatus(`已套用 ${accepted.length} 檔持股，請展開下方逐筆核對股數、價格與估算市值。${skipped.length?`${skipped.length} 檔（${missing}）資料不足，未套用；請補拍或手動新增。`:""}${mobile?"手機版名稱可能需要手動修正。":""}`);urls.forEach(URL.revokeObjectURL);urls=[];$("rebalanceOcrPreview").innerHTML="";if(accepted.length)$("rebalanceHoldings").scrollIntoView({behavior:"smooth",block:"start"});}else setStatus("未找到可確認的持股代號；請使用包含代號與持股欄位的清晰庫存截圖。");
  }catch(e){console.error(e);setStatus(`辨識失敗：${String(e?.message||e).slice(0,130)}。請換清晰截圖再試。`);}finally{if(worker)await worker.terminate();$("rebalanceOcrProgress").hidden=true;busy=false;$("rebalanceRunOcr").disabled=!files.length;}
}
function eligible(items){const accepted=[],skipped=[];for(const row of items){if(row.symbol&&Number.isInteger(row.shares)&&row.shares>0&&row.currentPrice>0&&row.marketRegion!=="OTHER"&&!row.conflicts?.length&&!(row.marketValue>0&&Math.abs(row.shares*row.currentPrice-row.marketValue)/row.marketValue>.08))accepted.push(row);else skipped.push(row);}return {accepted,skipped};}
function runOcrSelfTests(){const cases=[],test=(name,fn)=>{try{cases.push([name,Boolean(fn())]);}catch{cases.push([name,false]);}};
  test("台股代號含 006208、00631L、6757、00988A",()=>twSymbol("006208")==="006208"&&twSymbol("00631L")==="00631L"&&twSymbol("6757")==="6757"&&twSymbol("00988A")==="00988A");
  test("台光電報酬率冒號誤辨可修正",()=>{const word=(text,x,y)=>({text,x,y}),items=[word("+174,536",530,100),word("+1,163:19%",530,130),word("15,005",810,100),word("39",810,130),word("2383",120,130)];return parseArkPortfolioWords(items,1000)[0]?.profitPercent===1163.19;});
  test("負損益等號誤辨可由成本反推報酬率",()=>{const word=(text,x,y)=>({text,x,y}),items=[word("=2",550,100),word("17",820,100),word("1",820,130),word("1432",140,130)];const row=parseArkPortfolioWords(items,1000)[0];return row?.profitAmount===-2&&row?.profitPercent===-11.76&&row?.marketValue===15;});
  test("方舟庫存兩層欄位可推算股數與估算單價",()=>{const word=(text,x,y)=>({text,x,y}),items=[word("+109,952",550,115),word("+38.02%",550,145),word("289,232",820,115),word("10,363",820,145),word("00631L",160,150)];const row=parseArkPortfolioWords(items,1000)[0];return row?.shares===10363&&row?.marketValue===399184&&row?.estimatedValue===true;});
  test("頁首損益不當作股票代號",()=>twSymbol("+19,254")===null&&twSymbol("1,913,520")===null);
  test("拆開的股數仍可合併",()=>{const word=(text,x,y)=>({text,x,y}),items=[word("+57,772",520,100),word("+26.73%",520,125),word("216,149",770,100),word("2",750,125),word("449",820,127),word("0050",120,130)];return parseArkPortfolioWords(items,1000)[0]?.shares===2449;});
  test("股數辨識不到時保留待核對",()=>{const word=(text,x,y)=>({text,x,y}),items=[word("+152",520,100),word("+8.15%",520,125),word("1,853",800,100),word("0057",120,130)];const row=parseArkPortfolioWords(items,1000)[0];return row?.symbol==="0057"&&row?.shares===null;});
  test("美股代號可匯入但排除欄位標題",()=>ticker("AAPL")==="AAPL"&&ticker("PRICE")===null);
  test("股數、價格、市值交叉驗證",()=>inferTriplet([{text:"100"},{text:"50.25"},{text:"5,025"}]).shares===100);
  test("缺股數不憑空補零",()=>parseHoldingText("006208 富邦台50")[0].shares===null);
  test("重複截圖相同代號合併",()=>mergeRows([{...empty("0050"),shares:100},{...empty("0050"),currentPrice:120}]).length===1);
  test("代號旁市值不符會提示",()=>checkRow({...empty("0050"),shares:100,currentPrice:50,marketValue:9000}).warnings.some(x=>x.includes("不符")));
  test("既有 ETF 分類可帶入但不推測持股股數",()=>{const r=enrichFromExistingETF([empty("0050")],[{symbol:"0050",assetType:"TAIWAN_EQUITY",exposureGroup:"TAIWAN_LARGE_CAP"}])[0];return r.marketRegion==="TW"&&r.exposureGroup==="TAIWAN_LARGE_CAP"&&r.shares===null;});
  return {passed:cases.filter(x=>x[1]).length,total:cases.length,cases};
}
function init(){
  $("rebalanceOcrImages").addEventListener("change",()=>{urls.forEach(URL.revokeObjectURL);files=[...$("rebalanceOcrImages").files].filter(f=>f.type.startsWith("image/")).slice(0,4);urls=files.map(URL.createObjectURL);$("rebalanceOcrPreview").innerHTML=urls.map((u,i)=>`<figure><img src="${u}" alt="持股截圖 ${i+1}"><figcaption>截圖 ${i+1}</figcaption></figure>`).join("");$("rebalanceRunOcr").disabled=!files.length;$("rebalanceClearOcr").hidden=!files.length;setStatus(files.length?`已選擇 ${files.length} 張，按「開始辨識」。`:"尚未選擇圖片");});
  $("rebalanceRunOcr").addEventListener("click",recognize);$("rebalanceClearOcr").addEventListener("click",clear);
  window.RebalanceHoldingOCR={parseHoldingWords,parseHoldingText,mergeRows,checkRow,runOcrSelfTests};
  const r=runOcrSelfTests(),badge=$("selfTestBadge"),counts=badge.textContent.match(/(\d+)\s*\/\s*(\d+)/),old=Number(counts?.[1]||0),total=Number(counts?.[2]||0);
  $("selfTestList").insertAdjacentHTML("beforeend",r.cases.map(([name,ok])=>`<li>${ok?"通過":"失敗"} · 庫存截圖：${esc(name)}</li>`).join(""));badge.textContent=`${old+r.passed} / ${total+r.total} 通過`;badge.className=`badge ${old+r.passed===total+r.total?"buy":"sell"}`;
}
document.addEventListener("DOMContentLoaded",init);
})();
