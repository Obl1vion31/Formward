import assert from "node:assert/strict";
import { test } from "node:test";
import { serviceHeaders,verifyService,forwardRegionalRequest } from "./regional-transport";
import { withOAuthMaterials,oauthMetadataFetch } from "./oauth-network";
import { proxy } from "../../proxy";
import { NextRequest } from "next/server";

test("真实HTTP fetch响应不可变，网关复制解压流与多条Cookie后仍可返回",async()=>{
 const {createServer}=await import("node:http"),{gzipSync}=await import("node:zlib");
 const server=createServer((_request,response)=>{response.writeHead(200,{"Content-Encoding":"gzip","Set-Cookie":["first=1; Secure; HttpOnly","second=2; Secure; HttpOnly"]});response.end(gzipSync("fictional gzip response"));});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{const address=server.address();assert.ok(address&&typeof address==="object");
 const original=await fetch("http://127.0.0.1:"+address.port);
 const {regionalResponse}=await import("./regional-transport");
 const response=regionalResponse(original);
 assert.equal(response.headers.get("content-encoding"),null);assert.equal(response.headers.getSetCookie().length,2);
 assert.equal(await response.text(),"fictional gzip response");
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
const env={FORMWARD_REGIONAL:"1",BETTER_AUTH_URL:"https://formward-ten.vercel.app",FORMWARD_GATEWAY_SECRET:"fictional-service-key-32-characters-long"};
async function configured(work:()=>Promise<void>|void){const old={...process.env};Object.assign(process.env,env);try{await work();}finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}}
test("图片优化器不带Host读取公开构建图片，来源头被清除且业务请求仍受保护",()=>configured(()=>{
 const request=new NextRequest("http://localhost/_next/static/media/fictional.png",{headers:{"x-formward-public-origin":"https://evil.example","x-formward-region":"global"}});
 const image=proxy(request);
 assert.equal(image.status,200);
 assert.equal(image.headers.get("x-middleware-request-x-formward-public-origin"),null);
 assert.equal(image.headers.get("x-middleware-request-x-formward-region"),null);
 assert.equal(proxy(new NextRequest("http://localhost/api/mcp")).status,421);
 process.env.FORMWARD_MAINTENANCE="1";
 assert.equal(proxy(request).status,200);
 assert.equal(proxy(new NextRequest("https://cn.formward.top/dashboard",{headers:{host:"cn.formward.top"}})).status,503);
}));
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

test("OAuth官方网络传输拒绝回环公钥地址，不访问私有服务",async()=>{await assert.rejects(async()=>await oauthMetadataFetch("https://127.0.0.1/private"),/public-routable/);});

test("公网IP同一HTTPS入口区分直达国服和已签名国际回源，旧身份头不能提升区域",()=>configured(()=>{
 process.env.FORMWARD_CN_ORIGIN="https://203.0.113.10";
 process.env.FORMWARD_ORIGIN_URL="https://203.0.113.10";
 process.env.FORMWARD_GLOBAL_ORIGIN=env.BETTER_AUTH_URL;
 const path="/api/mcp?transport=streamable";
 const direct=proxy(new NextRequest("https://203.0.113.10"+path,{headers:{host:"203.0.113.10","x-formward-source":env.BETTER_AUTH_URL,"x-formward-public-origin":env.BETTER_AUTH_URL,"x-formward-region":"global"}}));
 assert.equal(direct.status,200);
 assert.equal(direct.headers.get("x-middleware-request-x-formward-public-origin"),"https://203.0.113.10");
 assert.equal(direct.headers.get("x-middleware-request-x-formward-region"),"cn");
 const forwarded=proxy(new NextRequest("https://203.0.113.10"+path,{headers:{host:"203.0.113.10",...serviceHeaders("GET",path,env.BETTER_AUTH_URL,"198.51.100.4")}}));
 assert.equal(forwarded.status,200);
 assert.equal(forwarded.headers.get("x-middleware-request-x-formward-public-origin"),env.BETTER_AUTH_URL);
 assert.equal(forwarded.headers.get("x-middleware-request-x-formward-region"),"global");
 const forged=proxy(new NextRequest("https://203.0.113.10"+path,{headers:{host:"203.0.113.10","x-formward-service":"invalid","x-formward-source":env.BETTER_AUTH_URL}}));
 assert.equal(forged.status,403);
}));
