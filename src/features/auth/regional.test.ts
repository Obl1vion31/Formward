import assert from "node:assert/strict";
import { test } from "node:test";
import { serviceHeaders,verifyService,forwardRegionalRequest } from "./regional-transport";
import { withOAuthMaterials,oauthMetadataFetch } from "./oauth-network";
import { proxy } from "../../proxy";
import { NextRequest } from "next/server";
const env={FORMWARD_REGIONAL:"1",BETTER_AUTH_URL:"https://formward-ten.vercel.app",FORMWARD_GATEWAY_SECRET:"fictional-service-key-32-characters-long"};
async function configured(work:()=>Promise<void>|void){const old={...process.env};Object.assign(process.env,env);try{await work();}finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}}
test("区域服务证明绑定来源、方法、路径、时间与客户端地址，拒绝伪造",()=>configured(()=>{
 const headers=new Headers(serviceHeaders("POST","/api/auth/sign-in/email","https://global.formward.top","203.0.113.1"));
 assert.equal(verifyService(headers,"POST","/api/auth/sign-in/email")?.origin,"https://global.formward.top");
 assert.equal(verifyService(headers,"GET","/api/auth/sign-in/email"),null);
 assert.equal(verifyService(headers,"POST","/api/auth/oauth2/token"),null);
 headers.set("x-formward-ip","203.0.113.2");assert.equal(verifyService(headers,"POST","/api/auth/sign-in/email"),null);
}));
test("区域proxy清除外来身份头，拒绝未认证回源与未知Host，主域名不转发令牌",()=>configured(()=>{
 const direct=proxy(new NextRequest("https://cn.formward.top/dashboard",{headers:{host:"cn.formward.top","x-formward-public-origin":"https://evil.example","x-formward-region":"global"}}));
 assert.equal(direct.headers.get("x-middleware-request-x-formward-public-origin"),"https://cn.formward.top");
 assert.equal(direct.headers.get("x-middleware-request-x-formward-region"),"cn");
 assert.equal(proxy(new NextRequest("https://origin.formward.top/",{headers:{host:"origin.formward.top"}})).status,403);
 assert.equal(proxy(new NextRequest("https://evil.example/",{headers:{host:"evil.example"}})).status,421);
 assert.equal(proxy(new NextRequest("https://formward.top/account/claim?token=fictional",{headers:{host:"formward.top"}})).status,404);
 const root=proxy(new NextRequest("https://formward.top/?token=fictional",{headers:{host:"formward.top"}}));
 assert.equal(root.headers.get("x-middleware-request-x-formward-selector"),"1");
 assert.equal(root.headers.get("x-middleware-rewrite"),null);
}));
test("网关保留原始Cookie/Bearer和多个Set-Cookie，私有响应不缓存且失败不重放",()=>configured(async()=>{
 let calls=0;
 const fake:typeof fetch=async(input,init)=>{
  calls++;const headers=new Headers(init?.headers);assert.equal(new URL(String(input)).origin,"https://origin.formward.top");
  assert.equal(headers.get("cookie"),"fictional-session=1");assert.equal(headers.get("authorization"),"Bearer fictional");
  assert.equal(headers.get("x-formward-public-origin"),null);assert.ok(verifyService(headers,"POST","/dashboard?x=1"));
  const output=new Headers({"Content-Type":"text/plain","Cache-Control":"public"});output.append("set-cookie","one=1; HttpOnly; Secure; SameSite=Lax");output.append("set-cookie","two=2; HttpOnly; Secure; SameSite=Lax");
  return new Response("fictional",{headers:output});
 };
 const response=await forwardRegionalRequest(new Request("https://global.formward.top/dashboard?x=1",{method:"POST",headers:{cookie:"fictional-session=1",authorization:"Bearer fictional","x-formward-public-origin":"https://evil.example"},body:"draft"}),fake);
 assert.equal(await response.text(),"fictional");assert.equal(response.headers.getSetCookie().length,2);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(calls,1);
 await assert.rejects(forwardRegionalRequest(new Request("https://global.formward.top/dashboard",{method:"POST",body:"draft"}),async()=>{calls++;throw new Error("offline");}),/offline/);assert.equal(calls,2);
}));
test("OAuth外部材料并发隔离、重复读取各有独立流，未批准地址失败",async()=>{
 const a={url:"https://client.example/a",body:'{"keys":[]}',contentType:"application/json"};
 const b={url:"https://client.example/b",body:'{"name":"fictional"}',contentType:"application/json"};
 await Promise.all([a,b].map(material=>withOAuthMaterials([material],async()=>{
  await new Promise(resolve=>setTimeout(resolve,5));
  const first=await oauthMetadataFetch(material.url),second=await fetch(material.url);
  assert.equal(await first.text(),material.body);assert.equal(await second.text(),material.body);
  await assert.rejects(fetch("https://client.example/unapproved"),/未通过预检/);
 })));
});
