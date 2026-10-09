"use strict";
const crypto=require("node:crypto");
const {visionConfig}=require("../lib/gemini");

const json=(res,status,payload)=>{res.status(status);res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store");return res.json(payload);};
const sameToken=(left,right)=>{const a=Buffer.from(String(left||"")),b=Buffer.from(String(right||""));return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);};

module.exports=async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,error:"只接受 POST。"});
  try{
    const apiKey=process.env.GEMINI_API_KEY,accessToken=process.env.VISION_ACCESS_TOKEN;
    if(!apiKey)throw new Error("Vercel 尚未設定 GEMINI_API_KEY。");
    if(!accessToken)throw new Error("Vercel 尚未設定 VISION_ACCESS_TOKEN。");
    const request=typeof req.body==="string"?JSON.parse(req.body||"{}"):req.body||{};
    if(!sameToken(request.token,accessToken))return json(res,401,{ok:false,error:"AI 辨識密碼不正確。"});
    if(!["vision","rebalanceVision"].includes(request.action))return json(res,400,{ok:false,error:"不支援的辨識操作。"});
    const config=visionConfig(request.action),images=Array.isArray(request.images)?request.images.slice(0,config.maxImages):[];
    if(!images.length)throw new Error("沒有收到圖片。");
    let totalLength=0;
    for(const [index,image] of images.entries()){
      if(!image||!/^image\/(jpeg|jpg|png|webp)$/i.test(String(image.mimeType||"")))throw new Error(`第 ${index+1} 張圖片格式不支援。`);
      if(!image.data||String(image.data).length>1600000)throw new Error(`第 ${index+1} 張圖片過大，請使用網站自動壓縮後的圖片。`);
      totalLength+=String(image.data).length;
    }
    if(totalLength>4200000)throw new Error("圖片總大小超過 Vercel 限制，請減少張數或重新截圖。");
    const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";
    const payload={contents:[{role:"user",parts:[{text:config.prompt},...images.map(image=>({inlineData:{mimeType:image.mimeType,data:image.data}}))]}],generationConfig:{temperature:0,responseMimeType:"application/json",responseSchema:config.schema}};
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify(payload)});
    const bodyText=await response.text();
    if(!response.ok){let detail=bodyText;try{detail=JSON.parse(bodyText)?.error?.message||bodyText;}catch{}throw new Error(`Gemini API ${response.status}：${String(detail).slice(0,240)}`);}
    const body=JSON.parse(bodyText),parts=body?.candidates?.[0]?.content?.parts||[],jsonText=parts.map(part=>part.text||"").join("");
    if(!jsonText)throw new Error("Gemini 沒有回傳可用資料。");
    const items=config.normalize(JSON.parse(jsonText).items||[]);
    if(!items.length)throw new Error(request.action==="rebalanceVision"?"Gemini 沒有辨識出持股。":"Gemini 沒有辨識出 ETF。");
    return json(res,200,{ok:true,provider:"gemini-vercel",model,detectedRows:items.length,items});
  }catch(error){return json(res,500,{ok:false,error:String(error?.message||error)});}
};
