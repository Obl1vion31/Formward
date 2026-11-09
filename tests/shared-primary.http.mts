import assert from "node:assert/strict";
import {request} from "node:https";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {regionalFixture} from "./regional-fixture.mjs";
import {oauthConnection} from "../src/db/schema";
const fixture=await regionalFixture({singleWeb:process.env.FORMWARD_SINGLE_WEB==="1"}),checks:string[]=[];
try{
 const ca=await readFile(join(fixture.folder,"localhost-cert.pem"));
 async function call(path:string,method="GET",headers:Record<string,string>={},body?:string){
  return new Promise<{status:number;body:string;headers:import("node:http").IncomingHttpHeaders}>((resolve,reject)=>{
   const req=request(new URL(path,fixture.global),{method,ca,rejectUnauthorized:true,headers},res=>{
    const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));res.on("end",()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString("utf8"),headers:res.headers}));
   });
   req.setTimeout(20000,()=>req.destroy(new Error("TLS gateway check timed out")));req.on("error",reject);if(body)req.write(body);req.end();
  });
 }
 const originalConnections=(await fixture.db.select().from(oauthConnection)).map(row=>row.id).sort();
 const session=await call("/api/auth/get-session","GET",{Cookie:fixture.oldCookie});
 assert.equal(session.status,200);assert.equal(JSON.parse(session.body).user.id,fixture.personId);
 checks.push("迁移前普通认证实例创建的原会话 Cookie，经真实 TLS 国际网关进入区域业务实例后仍识别同一账号");
 const rpcHeaders={Authorization:"Bearer "+fixture.oldTokens.access_token,Accept:"application/json, text/event-stream","Content-Type":"application/json","MCP-Protocol-Version":"2025-03-26"};
 const profile=await call("/api/mcp","POST",rpcHeaders,JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_profile",arguments:{}}}));
 assert.equal(profile.status,200,profile.body);assert.ok(profile.body.includes(fixture.personId));assert.equal(profile.headers["cache-control"],"private, no-store");
 checks.push("原访问 JWT 经 TLS 国际回源校验成功，MCP 查询保留原账号且响应不公开缓存");
 const form=new URLSearchParams({grant_type:"refresh_token",client_id:fixture.clientId,refresh_token:fixture.oldTokens.refresh_token,resource:fixture.global+"/api/mcp"});
 const refreshed=await call("/api/auth/oauth2/token","POST",{"Content-Type":"application/x-www-form-urlencoded"},form.toString());
 assert.equal(refreshed.status,200,refreshed.body);
 const tokens=JSON.parse(refreshed.body),oldClaims=JSON.parse(Buffer.from(fixture.oldTokens.access_token.split(".")[1],"base64url").toString()),newClaims=JSON.parse(Buffer.from(tokens.access_token.split(".")[1],"base64url").toString());
 for(const key of ["iss","aud","sub"])assert.deepEqual(newClaims[key],oldClaims[key]);
 assert.notEqual(tokens.refresh_token,fixture.oldTokens.refresh_token);
 assert.deepEqual((await fixture.db.select().from(oauthConnection)).map(row=>row.id).sort(),originalConnections);
 const nextProfile=await call("/api/mcp","POST",{...rpcHeaders,Authorization:"Bearer "+tokens.access_token},JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"get_profile",arguments:{}}}));
 assert.equal(nextProfile.status,200,nextProfile.body);assert.ok(nextProfile.body.includes(fixture.personId));
 checks.push("原刷新令牌通过国际网关正常轮换，issuer／resource／账号与连接编号保持，不要求重新授权");
 console.log(JSON.stringify({environment:"隔离虚构账号／真实PostgreSQL／生产构建／受信任测试CA",checks},null,2));
}finally{await fixture.close();}
