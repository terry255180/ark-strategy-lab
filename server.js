"use strict";

const http=require("http");
const fs=require("fs");
const path=require("path");
const {URL}=require("url");

const root=__dirname;
const port=4173;
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".wasm":"application/wasm",".gz":"application/gzip",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml"};

const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
  const requested=pathname==="/"?"index.html":pathname.replace(/^\/+/,"");
  const filePath=path.resolve(root,requested);
  if(!filePath.startsWith(root+path.sep)&&filePath!==path.join(root,"index.html")){response.writeHead(403);response.end("Forbidden");return;}
  fs.readFile(filePath,(error,data)=>{
    if(error){response.writeHead(error.code==="ENOENT"?404:500,{"Content-Type":"text/plain; charset=utf-8"});response.end(error.code==="ENOENT"?"Not found":"Server error");return;}
    response.writeHead(200,{"Content-Type":mime[path.extname(filePath).toLowerCase()]||"application/octet-stream","Cache-Control":"no-cache"});
    response.end(data);
  });
});

server.listen(port,"127.0.0.1",()=>console.log(`ARK Strategy Lab 已啟動：http://127.0.0.1:${port}`));
