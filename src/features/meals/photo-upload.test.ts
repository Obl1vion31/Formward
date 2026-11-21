import assert from "node:assert/strict";
import {test,before,after} from "node:test";
import { createHash } from "node:crypto";
import { uploadPrivateMealPhoto,stagePrivateMealPhoto } from "./photo-upload";

const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII=","base64");
const previousXHR=globalThis.XMLHttpRequest;
class FetchXHR{
 upload:{onprogress:((event:ProgressEvent)=>void)|null}={onprogress:null};timeout=0;status=0;responseText="";onload:(()=>void)|null=null;onerror:(()=>void)|null=null;ontimeout:(()=>void)|null=null;onabort:(()=>void)|null=null;url="";method="";headers:Record<string,string>={};controller=new AbortController();response:Response|null=null;
 open(method:string,url:string){this.method=method;this.url=url;}setRequestHeader(key:string,value:string){this.headers[key]=value;}getResponseHeader(key:string){return this.response?.headers.get(key)??null;}abort(){this.controller.abort();}
 send(body:Blob|FormData){void fetch(this.url,{method:this.method,body,headers:this.headers,signal:this.controller.signal}).then(async response=>{this.response=response;this.status=response.status;this.responseText=await response.text();this.onload?.();},()=>this.onerror?.());}
}
before(()=>{globalThis.XMLHttpRequest=FetchXHR as unknown as typeof XMLHttpRequest;});
after(()=>{globalThis.XMLHttpRequest=previousXHR;});
test("临时File在申请凭据后不可读时，仍上传读取并校验过的同一份字节", async () => {
  const previous = globalThis.fetch, calls: unknown[] = [], progress: string[] = [];
  const bytes = new Uint8Array(png), file = new File([bytes], "虚构照片.png", { type: "image/png" });
  try {
    globalThis.fetch = async (url, options) => {
      if (url === "https://fictional.test/upload") {
        const uploaded = (options!.body as FormData).get("file") as File;
        assert.notEqual(uploaded, file);
        assert.equal(uploaded.name, file.name);
        assert.equal(uploaded.type, file.type);
        assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), bytes);
        return new Response(null, { status: 204 });
      }
      if(options?.method!=="POST")return Response.json({defaultRegion:"cn",routes:[]});
      const body = JSON.parse(String(options!.body)); calls.push(body);
      if (body.step === "prepare") {
        assert.equal(body.file.sha256, createHash("sha256").update(bytes).digest("hex"));
        Object.defineProperty(file, "arrayBuffer", { value: async () => { throw new DOMException("File no longer available", "NotReadableError"); } });
        return Response.json({ provider: "cos", pathname: "fictional", ticket: "fixture-ticket" });
      }
      if (body.step === "complete") return Response.json({ id: "fictional-image" });
      return Response.json({ url: "https://fictional.test/upload", fields: { key: "fictional" } });
    };
    assert.deepEqual(await uploadPrivateMealPhoto(file, label => progress.push(label)), { id: "fictional-image", notice: undefined });
    assert.equal(calls.length, 3);
    assert.deepEqual(progress, ["正在读取照片…", "正在选择上传通道…", "正在申请上传凭据…", "正在上传照片…", "正在核对原图…", "照片已就绪"]);
  } finally { globalThis.fetch = previous; }
});

test("COS拒绝保留状态、错误码和请求号，不暴露XML中的签名或对象路径，不登记失败附件", async () => {
  const previous = globalThis.fetch; let completed = false;
  try {
    globalThis.fetch = async (url, options) => {
      if (url === "https://fictional.test/upload") return new Response("<Error><Code>EntityTooSmall</Code><Message>secret-signature-and-private-path</Message><RequestId>fictional-request-id</RequestId></Error>", { status: 400 });
      if(options?.method!=="POST")return Response.json({defaultRegion:"cn",routes:[]});
      const body = JSON.parse(String(options!.body));
      if (body.step === "complete") completed = true;
      return Response.json(body.step === "prepare" ? { provider: "cos", pathname: "fictional", ticket: "fixture" } : { url: "https://fictional.test/upload", fields: {} });
    };
    await assert.rejects(uploadPrivateMealPhoto(new File([png], "fixture.png", { type: "image/png" })), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 400，EntityTooSmall/);
      assert.match(error.message, /fictional-request-id/);
      assert.doesNotMatch(error.message, /secret-signature|private-path/);
      return true;
    });
    assert.equal(completed, false);
  } finally { globalThis.fetch = previous; }
});

test("文件未完整读取时不申请凭据、不上传，不把空内容当成成功", async () => {
  const previous = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw Error("unexpected"); };
    const file = new File(["fixture"], "fixture.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
    await assert.rejects(uploadPrivateMealPhoto(file), /照片内容未完整读取/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test("上传网络失败与服务端拒绝分别表达，不重发或complete", async () => {
  const previous = globalThis.fetch; let completed = false;
  try {
    globalThis.fetch = async (url, options) => {
      if (url === "https://fictional.test/upload") throw new DOMException("timeout", "TimeoutError");
      if(options?.method!=="POST")return Response.json({defaultRegion:"cn",routes:[]});
      const body = JSON.parse(String(options!.body));
      if (body.step === "complete") completed = true;
      return Response.json(body.step === "prepare" ? { provider: "cos", pathname: "fictional", ticket: "fixture" } : { url: "https://fictional.test/upload", fields: {} });
    };
    await assert.rejects(uploadPrivateMealPhoto(new File([png], "fixture.png", { type: "image/png" })), /照片上传连接未完成/);
    assert.equal(completed, false);
  } finally { globalThis.fetch = previous; }
});

test("多张照片在选图时读取，排队及选择器失效后仍复用原图，不提前请求网络",async()=>{
 const previous=globalThis.fetch,files=[new File([png],"1.png",{type:"image/png"}),new File([png],"2.png",{type:"image/png"})];let calls=0;
 try{
  globalThis.fetch=async(url,options)=>{if(options?.method!=="POST")return Response.json({defaultRegion:"cn",routes:[]});calls++;if(url==="https://fictional.test/upload"){const image=(options!.body as FormData).get("file") as File;assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);return new Response(null,{status:204});}const body=JSON.parse(String(options!.body));return Response.json(body.step==="prepare"?{provider:"cos",pathname:"fixture",ticket:"fixture"}:body.step==="complete"?{id:"photo"}:{url:"https://fictional.test/upload",fields:{}});};
  const staged=files.map(file=>stagePrivateMealPhoto(file));await Promise.all(staged);assert.equal(calls,0);
  for(const file of files)Object.defineProperty(file,"arrayBuffer",{value:async()=>{throw Error("temporary file unavailable");}});
  for(const file of files)assert.equal((await uploadPrivateMealPhoto(file)).id,"photo");
  assert.equal(calls,8);
 }finally{globalThis.fetch=previous;}
});

test("国际原图单次PUT，凭据与核对各自受控，不通过SDK重传",async()=>{
 const original=globalThis.fetch,bytes=new Uint8Array(png),file=new File([bytes],"隔离原图.png",{type:"image/png"});let transfers=0,completes=0;
 try{globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith("https://vercel.com/api/blob/")){transfers++;assert.equal(init?.method,"PUT");assert.deepEqual(new Uint8Array(await(init?.body as Blob).arrayBuffer()),bytes);return new Response(null,{status:200});}
  const input=JSON.parse(String(init?.body));if(input.step==="prepare")return Response.json({provider:"blob",ticket:"owned-fictional-ticket",pathname:"meal-tmp-v2/fixture/image"});
  if(input.step==="sign_direct")return Response.json({provider:"blob",method:"PUT",url:"https://vercel.com/api/blob/?pathname=owned-fictional"});
  if(input.step==="complete"){completes++;return Response.json({id:"owned-fixture-id"});}return new Response(null,{status:204});
 };assert.equal((await uploadPrivateMealPhoto(file,()=>{},{region:"global"})).id,"owned-fixture-id");assert.equal(transfers,1);assert.equal(completes,1);
 }finally{globalThis.fetch=original;}
});
test("国际签名不能指向第三方地址，网络失败不静默再次发送照片",async()=>{
 const original=globalThis.fetch;let uploads=0;let foreign=true;
 try{globalThis.fetch=async(url,init)=>{if(String(url).startsWith("https://vercel.com/api/blob")){uploads++;throw new TypeError("network");}const input=JSON.parse(String(init?.body));if(input.step==="prepare")return Response.json({provider:"blob",ticket:"fixture",pathname:"owned"});if(input.step==="sign_direct")return Response.json({provider:"blob",method:"PUT",url:foreign?"https://untrusted.test/upload":"https://vercel.com/api/blob/?pathname=owned"});return new Response(null,{status:204});};
 await assert.rejects(uploadPrivateMealPhoto(new File([png],"a.png",{type:"image/png"}),()=>{},{region:"global"}),/国际上传地址无效/);assert.equal(uploads,0);foreign=false;
 await assert.rejects(uploadPrivateMealPhoto(new File([png],"b.png",{type:"image/png"}),()=>{},{region:"global"}),/连接未完成/);assert.equal(uploads,1);
 }finally{globalThis.fetch=original;}
});


test("国际网页入口不把20MiB国内备用上传送入受限函数，失败仍可手动换通道",async()=>{
 const original=globalThis.fetch;let sent=0;const file=()=>new File([png],"fixture.png",{type:"image/png"});
 try{globalThis.fetch=async(url,init)=>{if(url==="https://fictional.test/upload"){sent++;throw new TypeError("network");}const body=JSON.parse(String(init?.body));if(body.step==="prepare")return Response.json({provider:"cos",ticket:"owned-fictional-ticket",pathname:"owned",relayAvailable:false});return Response.json({url:"https://fictional.test/upload",fields:{}});};
 await assert.rejects(uploadPrivateMealPhoto(file(),()=>{},{region:"cn"}),error=>{assert.equal((error as import("./photo-transfer").PhotoTransferError).allowRelay,false);return true;});assert.equal(sent,1);
 await assert.rejects(uploadPrivateMealPhoto(file(),()=>{},{region:"cn",transport:"relay"}),/改用国际通道/);assert.equal(sent,1);
 }finally{globalThis.fetch=original;}
});

test("系统选择器误报或未提供MIME时，两条上传通道沿用原始字节的类型、摘要和大小",async()=>{
 const original=globalThis.fetch;
 try{
  for(const region of ["cn","global"] as const){
   for(const reportedType of ["image/jpeg","application/octet-stream",""]){
    const file=new File([png],"系统所选照片.jpg",{type:reportedType});let prepared=false,uploaded=false;
    const staged=await stagePrivateMealPhoto(file);assert.equal(staged.type,"image/png");assert.deepEqual(Buffer.from(await staged.arrayBuffer()),png);
    Object.defineProperty(file,"arrayBuffer",{value:async()=>{throw Error("picker file released");}});
    globalThis.fetch=async(url,init)=>{
     if(url==="https://fictional.test/upload"||String(url).startsWith("https://vercel.com/api/blob/")){
      const body=region==="cn"?(init!.body as FormData).get("file") as File:init!.body as Blob;
      assert.equal(body.type,"image/png");assert.deepEqual(Buffer.from(await body.arrayBuffer()),png);
      if(region==="global")assert.equal((init!.headers as Record<string,string>)["Content-Type"],"image/png");
      uploaded=true;return new Response(null,{status:200});
     }
     const body=JSON.parse(String(init?.body));
     if(body.step==="prepare"){
      assert.equal(body.file.mimeType,"image/png");assert.equal(body.file.size,png.length);assert.equal(body.file.sha256,createHash("sha256").update(png).digest("hex"));
      prepared=true;return Response.json({provider:region==="cn"?"cos":"blob",ticket:"fictional-ticket",pathname:"fictional"});
     }
     if(body.step==="sign_direct")return Response.json({provider:"blob",method:"PUT",url:"https://vercel.com/api/blob/?pathname=fictional"});
     if(body.step==="complete")return Response.json({id:"fictional-id"});
     return Response.json({url:"https://fictional.test/upload",fields:{}});
    };
    assert.equal((await uploadPrivateMealPhoto(file,()=>{},{region,route:Promise.resolve({region:region==="cn"?"global":"cn",elapsedMs:0})})).id,"fictional-id");assert.ok(prepared&&uploaded);assert.equal(file.type,reportedType);
   }
  }
 }finally{globalThis.fetch=original;}
});

test("声明为图片的非图片内容在上传前拒绝，原图格式校验不依赖扩展名",async()=>{
 const original=globalThis.fetch;let requests=0;
 try{
  globalThis.fetch=async()=>{requests++;throw Error("unexpected upload");};
  for(const bytes of ["<svg/>","not an image",new Uint8Array([137,80,78,71])]){
   await assert.rejects(uploadPrivateMealPhoto(new File([bytes],"invalid.png",{type:"image/png"})),/支持 JPEG、PNG、WebP/);
  }
  assert.equal(requests,0);
 }finally{globalThis.fetch=original;}
});

test("同一原图由直传改为人工备用时复用凭据，不再次占用上传名额",async()=>{
 const original=globalThis.fetch,file=new File([png],"retry.png",{type:"image/png"});let prepares=0,completes=0;
 try{
  globalThis.fetch=async(url,init)=>{
   if(url==="https://fictional.test/upload")throw new TypeError("network");
   if((init?.headers as Record<string,string>)?.["x-image-upload-ticket"]){assert.equal((init!.headers as Record<string,string>)["x-image-upload-ticket"],"same-owned-ticket");assert.deepEqual(Buffer.from(await(init!.body as Blob).arrayBuffer()),png);return Response.json({uploaded:true});}
   const body=JSON.parse(String(init?.body));
   if(body.step==="prepare"){prepares++;return Response.json({provider:"cos",ticket:"same-owned-ticket",pathname:"owned"});}
   if(body.step==="complete"){completes++;return Response.json({id:"one-image"});}
   return Response.json({url:"https://fictional.test/upload",fields:{}});
  };
  await assert.rejects(uploadPrivateMealPhoto(file,()=>{},{region:"cn"}),/连接未完成/);
  assert.equal((await uploadPrivateMealPhoto(file,()=>{},{region:"cn",transport:"relay"})).id,"one-image");
  assert.equal(prepares,1);assert.equal(completes,1);
 }finally{globalThis.fetch=original;}
});

test("切换通道分别签发凭据，原通道重试和核对响应失败沿用原票据",async()=>{
 const original=globalThis.fetch,file=new File([png],"regions.png",{type:"image/png"});const prepared:string[]=[],used:string[]=[];let failComplete=true;
 try{
  globalThis.fetch=async(url,init)=>{
   if(url==="https://fictional.test/upload")throw new TypeError("network");
   const relay=(init?.headers as Record<string,string>)?.["x-image-upload-ticket"];
   if(relay){used.push(relay);return Response.json({uploaded:true});}
   const body=JSON.parse(String(init?.body));
   if(body.step==="prepare"){prepared.push(body.region);return Response.json({provider:body.region==="cn"?"cos":"blob",ticket:body.region+"-owned",pathname:"owned"});}
   if(body.step==="sign_direct")return Response.json({error:"国际入口尚未配置。"},{status:400});
   if(body.step==="complete"){if(failComplete){failComplete=false;return Response.json({error:"暂未确认"},{status:503});}return Response.json({id:"same-image"});}
   return Response.json({url:"https://fictional.test/upload",fields:{}});
  };
  await assert.rejects(uploadPrivateMealPhoto(file,()=>{},{region:"global"}),/尚未配置/);
  await assert.rejects(uploadPrivateMealPhoto(file,()=>{},{region:"cn"}),/连接未完成/);
  await assert.rejects(uploadPrivateMealPhoto(file,()=>{},{region:"cn",transport:"relay"}),/暂未确认/);
  assert.equal((await uploadPrivateMealPhoto(file,()=>{},{region:"cn",transport:"relay"})).id,"same-image");
  assert.deepEqual(prepared,["global","cn"]);assert.deepEqual(used,["cn-owned","cn-owned"]);
 }finally{globalThis.fetch=original;}
});

test("服务端拒绝会话或过期票据后重新申请，成功后也不沿用旧票据",async()=>{
 const original=globalThis.fetch;
 try{for(const status of [401,403,409]){
  const file=new File([png],"session.png",{type:"image/png"});let prepares=0,signs=0,uploaded=false;
  globalThis.fetch=async(url,init)=>{
   if(url==="https://fictional.test/upload"){if(!uploaded){uploaded=true;throw new TypeError("network");}return new Response(null,{status:204});}
   const body=JSON.parse(String(init?.body));
   if(body.step==="prepare"){prepares++;return Response.json({provider:"cos",ticket:"ticket-"+prepares,pathname:"owned"});}
   if(body.step==="complete")return Response.json({id:"owned-image"});
   signs++;if(signs===2)return Response.json({error:"授权已失效"},{status});
   assert.equal(body.payload.clientPayload,signs===1?"ticket-1":"ticket-"+prepares);
   return Response.json({url:"https://fictional.test/upload",fields:{}});
  };
  await assert.rejects(uploadPrivateMealPhoto(file,()=>{},{region:"cn"}),/连接未完成/);
  await assert.rejects(uploadPrivateMealPhoto(file,()=>{},{region:"cn"}),/授权已失效/);
  assert.equal((await uploadPrivateMealPhoto(file,()=>{},{region:"cn"})).id,"owned-image");assert.equal(prepares,2);
  assert.equal((await uploadPrivateMealPhoto(file,()=>{},{region:"cn"})).id,"owned-image");assert.equal(prepares,3);
 }}finally{globalThis.fetch=original;}
});

test("重试缓存到期重新申请，不能无限复用旧上传票据",async()=>{
 const original=globalThis.fetch,realNow=Date.now,file=new File([png],"expired.png",{type:"image/png"});let prepares=0;
 try{
  globalThis.fetch=async(url,init)=>{if(url==="https://fictional.test/upload")throw new TypeError("network");const body=JSON.parse(String(init?.body));if(body.step==="prepare"){prepares++;return Response.json({provider:"cos",ticket:"owned-"+prepares,pathname:"owned"});}return Response.json({url:"https://fictional.test/upload",fields:{}});};
  await assert.rejects(uploadPrivateMealPhoto(file,()=>{},{region:"cn"}),/连接未完成/);
  Date.now=()=>realNow()+600001;
  await assert.rejects(uploadPrivateMealPhoto(file,()=>{},{region:"cn"}),/连接未完成/);assert.equal(prepares,2);
 }finally{Date.now=realNow;globalThis.fetch=original;}
});
