import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
if(process.env.FORMWARD_ENVIRONMENT!=="preview"||process.env.FORMWARD_EXPECTED_DATABASE!=="formward_preview")throw new Error("预览目标环境配置无效。");
const manifest=JSON.parse(await readFile(process.argv[2],"utf8")),origin=process.env.FORMWARD_HEALTH_ORIGIN??"http://127.0.0.1:3000";
const headers={Authorization:"Bearer "+process.env.FORMWARD_READINESS_SECRET};
if(process.env.FORMWARD_REGIONAL==="1"){
 const {createHmac}=await import("node:crypto");const path="/api/internal/readiness",source=process.env.BETTER_AUTH_URL,time=String(Date.now()),ip="";
 Object.assign(headers,{Host:new URL(process.env.FORMWARD_ORIGIN_URL).host,"x-formward-source":source,"x-formward-time":time,"x-formward-ip":ip,"x-formward-service":createHmac("sha256",process.env.FORMWARD_GATEWAY_SECRET).update(["formward-regional-v1","GET",path,source,time,ip].join("\n")).digest("base64url")});
}
const target=new URL("/api/internal/readiness",origin);
const {status,body}=await new Promise((resolve,reject)=>{const req=(target.protocol==="https:"?https:http).get(target,{headers,signal:AbortSignal.timeout(5000)},res=>{const chunks=[];res.on("data",chunk=>chunks.push(chunk));res.on("end",()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));});req.on("error",reject);});const data=JSON.parse(body);
if(status!==200||!data.ready||data.environment!=="preview"||data.database!=="formward_preview"||["commit","buildId","protocol","schema"].some(k=>data[k]!==manifest[k]))throw new Error("实际发布版本、数据库或协议检查失败。");
console.log("实际版本及数据库检查通过。");
