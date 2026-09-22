"use strict";
// Portfolio screenshot OCR is deliberately separate from ARK's fixed-layout screenshot parser.
(() => {
const $=id=>document.getElementById(id),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
const number=s=>{const raw=String(s??"").trim().replace(/[Ｏ０Oo]/g,"0").replace(/[ＩｌIl|]/g,"1").replace(/[，,\s$＄NT元股]/g,"").replace(/[−－]/g,"-").replace(/[%％]/g,"");const n=Number(raw);return raw&&Number.isFinite(n)?n:null;};
const twSymbol=s=>{const x=String(s??"").toUpperCase().replace(/[Ｏ０O]/g,"0").replace(/[ＩｌI|]/g,"1").replace(/[^A-Z0-9]/g,"");return /^0\d{3,5}L?$/.test(x)?x:null;};
const ticker=s=>{const tw=twSymbol(s);if(tw)return tw;const x=String(s??"").trim().toUpperCase();return /^[A-Z]{1,5}$/.test(x)&&!/^(?:TW|US|ETF|NAV|USD|TWD|TOTAL|QTY|PRICE|VALUE|SHARE|SHARES|PCT|COST|PROFIT|LOSS|RSI|PNL|ARK)$/.test(x)?x:null;};
const aliases={shares:/股數|庫存量|持有量|持有股數|數量|QTY|SHARES|QUANTITY/i,currentPrice:/現價|成交價|目前價格|市價|股價|PRICE|LAST/i,marketValue:/市值|現值|目前市值|庫存市值|MARKET\s*VALUE|VALUE/i,profitAmount:/損益金額|累計損益|未實現損益|總損益|損益|P\/L|PROFIT/i,profitPercent:/報酬率|損益率|獲利率|收益率|RETURN\s*%|P\/L\s*%/i};
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
    const match=lines[i].match(/(?:^|\s)(0\d{3,5}L?|[A-Z]{1,5})(?=\s|$)/i);if(!match)continue;
    const s=ticker(match[1]);if(!s)continue;
    const row=empty(s),line=lines[i],rest=line.replace(match[0]," ");
    row.name=(rest.match(/[\u3400-\u9fff]{2,}/g)||[]).join("").slice(0,30);
    const nearby=[line];for(let offset=1;offset<=2;offset++){const next=lines[i+offset]||"";if(/(?:^|\s)(?:0\d{3,5}L?|[A-Z]{1,5})(?=\s|$)/.test(next))break;nearby.push(next);}const combined=nearby.join(" ");
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
  return items.map(row=>{const etf=bySymbol.get(row.symbol);if(!etf)return row;return checkRow({...row,name:row.name||etf.name||"",marketRegion:row.marketRegion==="OTHER"?region[etf.assetType]||"OTHER":row.marketRegion,exposureGroup:row.exposureGroup==="OTHER"?etf.exposureGroup||"OTHER":row.exposureGroup,...(etf.leverage>1||etf.assetType==="LEVERAGED_TW"?{leveraged:true}:{}),...(etf.assetType?{assetType:etf.assetType}:{})});});
}
function setStatus(s){$("rebalanceOcrStatus").textContent=s;}
function clear(){urls.forEach(URL.revokeObjectURL);urls=[];files=[];rows=[];$("rebalanceOcrImages").value="";$("rebalanceOcrPreview").innerHTML="";$("rebalanceOcrReview").hidden=true;$("rebalanceOcrProgress").hidden=true;$("rebalanceClearOcr").hidden=true;$("rebalanceRunOcr").disabled=true;setStatus("尚未選擇圖片");}
async function prepare(file){const bitmap=await createImageBitmap(file),scale=Math.min(1.6,2000/bitmap.width,Math.sqrt(5000000/(bitmap.width*bitmap.height))),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas;}
function review(){
  $("rebalanceOcrReview").hidden=!rows.length;
  $("rebalanceOcrGrid").innerHTML=rows.map((r,i)=>`<article class="ocr-result-card rebalance-ocr-card"><strong>${esc(r.symbol)}</strong><p class="rebalance-ocr-warning">${esc(r.warnings.join("；")||"請逐欄核對後套用")}</p><div class="ocr-fields">
    ${input(i,"symbol","代號",r.symbol,"text")}${input(i,"name","名稱",r.name,"text")}${input(i,"shares","持有股數 *",r.shares)}${input(i,"currentPrice","現價 *",r.currentPrice)}${input(i,"marketValue","市值",r.marketValue)}${input(i,"profitAmount","損益金額",r.profitAmount)}${input(i,"profitPercent","損益 %",r.profitPercent)}
    <label>市場分類<select data-rebalance-ocr-index="${i}" data-rebalance-ocr-field="marketRegion">${["OTHER","TW","US","GLOBAL"].map(v=>`<option value="${v}" ${r.marketRegion===v?"selected":""}>${v==="OTHER"?"待確認":v}</option>`).join("")}</select></label>
    <label>曝險群組<select data-rebalance-ocr-index="${i}" data-rebalance-ocr-field="exposureGroup">${["OTHER","TAIWAN_LARGE_CAP","TAIWAN_TECH","TAIWAN_FINANCIAL","US_TECH","US_SEMICONDUCTOR","US_BROAD_MARKET","GLOBAL_TECH","GLOBAL_THEME"].map(v=>`<option value="${v}" ${r.exposureGroup===v?"selected":""}>${v}</option>`).join("")}</select></label>
  </div></article>`).join("");
}
function input(i,key,label,value,type="number"){return `<label>${label}<input data-rebalance-ocr-index="${i}" data-rebalance-ocr-field="${key}" type="${type}" ${type==="number"?'step="any"':""} value="${esc(value??"")}"></label>`;}
async function recognize(){
  if(busy)return;if(location.protocol==="file:"){setStatus("請透過本機伺服器或 GitHub Pages 開啟網站後辨識。");return;}
  if(!window.Tesseract){setStatus("本機 OCR 模型未載入，請確認 vendor/tesseract 檔案已部署。");return;}
  busy=true;$("rebalanceRunOcr").disabled=true;$("rebalanceOcrProgress").hidden=false;$("rebalanceOcrProgressBar").style.width="2%";let worker;
  try{
    const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    worker=await Tesseract.createWorker(mobile?["eng"]:["chi_tra","eng"],Tesseract.OEM.LSTM_ONLY,{workerPath:"vendor/tesseract/worker.min.js",langPath:"vendor/tesseract/lang",corePath:"vendor/tesseract",logger:msg=>{if(msg.progress!=null)$("rebalanceOcrProgressBar").style.width=`${Math.round(msg.progress*80)}%`;}});
    await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT,preserve_interword_spaces:"1"});
    const detected=[];for(let i=0;i<files.length;i++){setStatus(`正在辨識第 ${i+1}/${files.length} 張…`);let canvas;try{canvas=await prepare(files[i]);const result=await worker.recognize(canvas,{}, {text:true,blocks:true}),words=normalizeWords(result.data.blocks);detected.push(...parseHoldingWords(words,canvas.width),...parseHoldingText(result.data.text));}finally{if(canvas){canvas.width=1;canvas.height=1;}}}
    rows=enrichFromExistingETF(mergeRows(detected),window.currentETFs);review();$("rebalanceOcrProgressBar").style.width="100%";
    setStatus(rows.length?`辨識到 ${rows.length} 檔；請核對空白與警示欄位後套用。${mobile?"手機版優先辨識數字，名稱可能需要手動修正。":""}`:"未找到可確認的持股代號；請使用包含代號與持股欄位的清晰庫存截圖。");
  }catch(e){console.error(e);setStatus(`辨識失敗：${String(e?.message||e).slice(0,130)}。請換清晰截圖再試。`);}finally{if(worker)await worker.terminate();busy=false;$("rebalanceRunOcr").disabled=!files.length;}
}
function apply(){const numeric=["shares","currentPrice","marketValue","profitAmount","profitPercent"],reviewed=rows.map((r,i)=>{const item={...r};document.querySelectorAll(`[data-rebalance-ocr-index="${i}"]`).forEach(el=>{const key=el.dataset.rebalanceOcrField;item[key]=numeric.includes(key)?number(el.value):el.value.trim();});item.symbol=ticker(item.symbol);return item;});
  const invalid=reviewed.filter(r=>!r.symbol||!Number.isInteger(r.shares)||r.shares<=0||!(r.currentPrice>0));
  if(invalid.length){setStatus(`有 ${invalid.length} 筆代號、股數或價格尚未確認；請修正後再套用。`);return;}
  const unknown=reviewed.filter(r=>r.marketRegion==="OTHER");if(unknown.length){setStatus(`有 ${unknown.length} 筆市場分類仍為「待確認」，請先指定 TW、US 或 GLOBAL。`);return;}
  const inconsistent=reviewed.filter(r=>r.marketValue>0&&Math.abs(r.shares*r.currentPrice-r.marketValue)/r.marketValue>.08);
  if(inconsistent.length){setStatus(`有 ${inconsistent.length} 筆股數 × 價格與市值相差超過 8%；請核對後修正市值（或清空由系統重算）。`);return;}
  const count=window.RebalanceCalculator.importHoldingRows(reviewed.map(({warnings,...r})=>r));setStatus(`已套用 ${reviewed.length} 筆，計算機現有 ${count} 筆持股；請核對 ARK 狀態與曝險群組。`);$("rebalanceHoldings").scrollIntoView({behavior:"smooth",block:"start"});
}
function runOcrSelfTests(){const cases=[],test=(name,fn)=>{try{cases.push([name,Boolean(fn())]);}catch{cases.push([name,false]);}};
  test("台股代號含 006208 與 00631L",()=>twSymbol("006208")==="006208"&&twSymbol("00631L")==="00631L");
  test("美股代號可匯入但排除欄位標題",()=>ticker("AAPL")==="AAPL"&&ticker("PRICE")===null);
  test("股數、價格、市值交叉驗證",()=>inferTriplet([{text:"100"},{text:"50.25"},{text:"5,025"}]).shares===100);
  test("缺股數不憑空補零",()=>parseHoldingText("006208 富邦台50")[0].shares===null);
  test("重複截圖相同代號合併",()=>mergeRows([{...empty("0050"),shares:100},{...empty("0050"),currentPrice:120}]).length===1);
  test("代號旁市值不符會提示",()=>checkRow({...empty("0050"),shares:100,currentPrice:50,marketValue:9000}).warnings.some(x=>x.includes("不符")));
  test("既有 ETF 分類可帶入但不推測持股股數",()=>{const r=enrichFromExistingETF([empty("0050")],[{symbol:"0050",assetType:"TAIWAN_EQUITY",exposureGroup:"TAIWAN_LARGE_CAP"}])[0];return r.marketRegion==="TW"&&r.exposureGroup==="TAIWAN_LARGE_CAP"&&r.shares===null;});
  return {passed:cases.filter(x=>x[1]).length,total:cases.length,cases};
}
function init(){
  $("rebalanceOcrImages").addEventListener("change",()=>{urls.forEach(URL.revokeObjectURL);files=[...$("rebalanceOcrImages").files].filter(f=>f.type.startsWith("image/")).slice(0,4);urls=files.map(URL.createObjectURL);$("rebalanceOcrPreview").innerHTML=urls.map((u,i)=>`<figure><img src="${u}" alt="持股截圖 ${i+1}"><figcaption>截圖 ${i+1}</figcaption></figure>`).join("");$("rebalanceRunOcr").disabled=!files.length;$("rebalanceClearOcr").hidden=!files.length;$("rebalanceOcrReview").hidden=true;setStatus(files.length?`已選擇 ${files.length} 張，按「開始辨識」。`:"尚未選擇圖片");});
  $("rebalanceRunOcr").addEventListener("click",recognize);$("rebalanceClearOcr").addEventListener("click",clear);$("rebalanceApplyOcr").addEventListener("click",apply);
  window.RebalanceHoldingOCR={parseHoldingWords,parseHoldingText,mergeRows,checkRow,runOcrSelfTests};
  const r=runOcrSelfTests(),badge=$("selfTestBadge"),old=Number(badge.textContent.split("/")[0])||0,total=Number(badge.textContent.split("/")[1])||0;
  $("selfTestList").insertAdjacentHTML("beforeend",r.cases.map(([name,ok])=>`<li>${ok?"通過":"失敗"} · 庫存截圖：${esc(name)}</li>`).join(""));badge.textContent=`${old+r.passed} / ${total+r.total} 通過`;badge.className=`badge ${old+r.passed===total+r.total?"buy":"sell"}`;
}
document.addEventListener("DOMContentLoaded",init);
})();
