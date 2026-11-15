import {test} from "node:test";
import assert from "node:assert/strict";
import {choosePhotoRoute} from "./photo-route";
const routes={defaultRegion:"cn",routes:[{region:"cn",url:"https://fictional-123.cos.ap-shanghai.myqcloud.com/"},{region:"global",url:"https://blob.vercel-storage.com/"},{region:"global",url:"https://untrusted.test/"}]};
test("每批重新探测受控无照片地址，按可达延迟选择；手动仅覆盖本次",async()=>{
 const seen:{url:string;init?:RequestInit}[]=[];let fast="global";
 const fetcher=(async(url:RequestInfo|URL,init?:RequestInit)=>{seen.push({url:String(url),init});if(String(url).startsWith("/api/"))return Response.json(routes);if(String(url).includes(fast==="global"?"blob.":".cos."))return new Response();await new Promise(r=>setTimeout(r,8));return new Response();}) as typeof fetch;
 assert.equal((await choosePhotoRoute({fetcher})).region,"global");fast="cn";assert.equal((await choosePhotoRoute({fetcher})).region,"cn");
 assert.equal(seen.filter(x=>x.url.startsWith("/api/")).length,2);assert.ok(!seen.some(x=>x.url.includes("untrusted")));assert.ok(seen.filter(x=>x.init?.method==="HEAD").every(x=>!x.init?.body&&x.init?.credentials==="omit"&&(!x.init.redirect||x.init.redirect==="follow")));
 const before=seen.length;assert.equal((await choosePhotoRoute({fetcher,region:"global"})).region,"global");assert.equal(seen.length,before);
});
test("探测全失败回到当前入口，不自动重传照片",async()=>{
 const fetcher=(async(url:RequestInfo|URL)=>{if(String(url).startsWith("/api/"))return Response.json(routes);throw new TypeError("network");}) as typeof fetch;
 assert.deepEqual(await choosePhotoRoute({fetcher}),{region:"cn",elapsedMs:null});
});
