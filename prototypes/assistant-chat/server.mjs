import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root=process.cwd(),out=resolve(root,".codex/assistant-chat/build");
await mkdir(out,{recursive:true});
await build({entryPoints:["prototypes/assistant-chat/app.tsx"],bundle:true,outdir:out,entryNames:"demo",platform:"browser",format:"esm",jsx:"automatic",external:["/icons/*"],define:{"process.env.NODE_ENV":'"development"'},logLevel:"warning",metafile:true}).then(result=>writeFile(resolve(out,"metafile.json"),JSON.stringify(result.metafile)));
if(process.argv.includes("--build")){console.log("本地原型资源已构建。");process.exit(0);}
const html='<!doctype html><html lang="zh-CN" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>Formward · 小助手本地原型</title><link rel="icon" href="/icons/formward-mark.svg"><link rel="stylesheet" href="/demo.css"><body><div id="root"></div><script type="module" src="/demo.js"></script></body></html>';
const assets=new Map([["/demo.js",[resolve(out,"demo.js"),"text/javascript"]],["/demo.css",[resolve(out,"demo.css"),"text/css"]],["/icons/formward-mark.svg",[resolve(root,"public/icons/formward-mark.svg"),"image/svg+xml"]]]);
createServer(async(req,res)=>{
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'");
 if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405).end();return;}
 const path=new URL(req.url??"/","http://127.0.0.1").pathname;
 if(path==="/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}).end(req.method==="HEAD"?undefined:html);return;}
 const asset=assets.get(path);if(!asset){res.writeHead(404).end();return;}
 try{const body=await readFile(asset[0]);res.writeHead(200,{"Content-Type":asset[1]}).end(req.method==="HEAD"?undefined:body);}catch{res.writeHead(500).end();}
}).listen(4177,"127.0.0.1",()=>console.log("本地原型：http://localhost:4177（仅虚构数据，无模型／业务API请求）"));
