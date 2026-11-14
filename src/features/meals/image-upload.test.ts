import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import {relayImageUpload,readRelayImage,recordImageUploadDiagnostic} from "./image-upload-relay";
import {signImageTicket,type ImageTicket} from "./image-ticket";
import {cleanForwardHeaders} from "../auth/regional-transport";
import {webSessionContext} from "../auth/account-security";
import type {ImageStorage} from "./image-storage";
import { prepareImageUpload, verifyImageUploadTicket, completeImageUpload } from "./image-upload";
const pg=new PGlite(),db=drizzle(pg,{schema}),secret="fictional-image-ticket-secret";
before(async()=>{await migrate(db,{migrationsFolder:"./drizzle"});});after(async()=>{await pg.close();});
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII=","base64");
const input={fileName:"虚构照片.png",size:png.length,mimeType:"image/png",sha256:createHash("sha256").update(png).digest("hex")};
async function owner(){const id=randomUUID();await db.insert(schema.user).values({id,name:"虚构直传用户",email:id+"@example.test"});return id;}
test("直传凭据限定账号、路径和期限，拒绝篡改、跨账号及大文件",async()=>{
 const id=await owner(),prepared=await prepareImageUpload(db,id,input,secret);assert.ok(prepared.ticket);
 const ticket=verifyImageUploadTicket(prepared.ticket,id,secret);assert.equal(ticket.pathname,prepared.pathname);
 assert.throws(()=>verifyImageUploadTicket(prepared.ticket+"x",id,secret),/凭据/);
 assert.throws(()=>verifyImageUploadTicket(prepared.ticket,randomUUID(),secret),/账号/);
 assert.throws(()=>verifyImageUploadTicket(prepared.ticket,id,secret,ticket.expiresAt),/过期/);
 await assert.rejects(prepareImageUpload(db,id,{...input,size:20971521},secret),/20 MiB/);
});
test("直传完成真实校验字节且幂等，重复图片返回已有附件；失败清理暂存",async()=>{
 const id=await owner(),prepared=await prepareImageUpload(db,id,input,secret);assert.ok(prepared.ticket);
 const removed:string[]=[],deps={write:async()=>{},read:async()=>png,remove:async(p:string|string[])=>{removed.push(String(p));},secret};
 const first=await completeImageUpload(db,id,prepared.ticket,deps),repeat=await completeImageUpload(db,id,prepared.ticket,deps);
 assert.equal(first.id,repeat.id);assert.equal(repeat.repeated,true);assert.deepEqual(removed,[prepared.pathname,prepared.pathname]);
 assert.equal((await prepareImageUpload(db,id,input,secret)).image?.id,first.id);
 await assert.rejects(completeImageUpload(db,await owner(),prepared.ticket,deps),/账号/);
 const failedOwner=await owner(),bad=await prepareImageUpload(db,failedOwner,input,secret);assert.ok(bad.ticket);
 await assert.rejects(completeImageUpload(db,failedOwner,bad.ticket,{...deps,read:async()=>Buffer.concat([png,Buffer.from([0])])}),/不一致/);
 assert.deepEqual(removed,[prepared.pathname,prepared.pathname,bad.pathname]);assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.userId,failedOwner))).length,0);
 const retry=await completeImageUpload(db,failedOwner,bad.ticket,deps);assert.ok(retry.id);
});

async function relayFixture(){
 const userId=await owner(),[account]=await db.select().from(schema.user).where(eq(schema.user.id,userId)),sessionId=randomUUID(),id=randomUUID();
 const proof={userId,sessionId,accessVersion:account.accessVersion};
 await db.insert(schema.session).values({id:sessionId,userId,token:randomUUID(),expiresAt:new Date(Date.now()+3600000),accessVersion:account.accessVersion,createdAt:new Date(),updatedAt:new Date()});
 const ticket:ImageTicket={...input,mimeType:"image/png",v:2,id,userId,pathname:"meal-tmp-v2/"+userId+"/"+id,expiresAt:Date.now()+600000,provider:"cos",location:"fictional@ap-shanghai",region:"cn",proof:{kind:"session",sessionId,accessVersion:account.accessVersion}};
 const objects=new Map<string,Uint8Array>(),storage:ImageStorage={ref:{storageProvider:"cos",storageLocation:ticket.location},write:async(path,bytes)=>{objects.set(path,bytes);},read:async path=>new Response(Buffer.from(objects.get(path)!)).body!,remove:async path=>{objects.delete(path);},list:async()=>[]};
 const raw=signImageTicket(ticket,secret),request=(body:Uint8Array=png)=>new Request("http://localhost/api/meal-images/upload",{method:"POST",headers:{"Content-Type":"application/octet-stream","x-image-upload-ticket":raw},body:Buffer.from(body)});
 return {userId,proof,ticket,raw,objects,storage,request};
}
test("同源备用上传校验真实会话与原图，沿用完成登记和幂等",async()=>{
 const f=await relayFixture();
 await webSessionContext.run(f.proof,async()=>{
  assert.deepEqual(await relayImageUpload(db,f.userId,f.request(),{secret,storage:f.storage}),{uploaded:true});
  assert.deepEqual(Buffer.from(f.objects.get(f.ticket.pathname)!),png);
  const deps={secret,read:async(path:string)=>f.objects.get(path)!,write:f.storage.write,remove:f.storage.remove};
  const first=await completeImageUpload(db,f.userId,f.raw,deps),repeat=await completeImageUpload(db,f.userId,f.raw,deps);
  assert.equal(first.id,repeat.id);assert.equal(repeat.repeated,true);
 });
 assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.userId,f.userId))).length,1);
});
test("备用上传拒绝跨账号、内容篡改、过期及传输期间撤销的会话",async()=>{
 const f=await relayFixture();
 await assert.rejects(relayImageUpload(db,await owner(),f.request(),{secret,storage:f.storage}),/账号/);
 await assert.rejects(webSessionContext.run(f.proof,()=>relayImageUpload(db,f.userId,f.request(Buffer.from(png.map((v,i)=>i===20?v^1:v))),{secret,storage:f.storage})),/不一致/);
 const expired=signImageTicket({...f.ticket,expiresAt:Date.now()-1},secret);
 await assert.rejects(relayImageUpload(db,f.userId,new Request("http://localhost/upload",{method:"POST",headers:{"x-image-upload-ticket":expired},body:png}),{secret,storage:f.storage}),/过期/);
 const stream=new ReadableStream<Uint8Array>({async start(controller){await db.delete(schema.session).where(eq(schema.session.id,f.proof.sessionId));controller.enqueue(png);controller.close();}});
 const request=new Request("http://localhost/upload",{method:"POST",headers:{"x-image-upload-ticket":f.raw},body:stream,duplex:"half"} as RequestInit&{duplex:string});
 await assert.rejects(webSessionContext.run(f.proof,()=>relayImageUpload(db,f.userId,request,{secret,storage:f.storage})),/登录已失效/);
 assert.equal(f.objects.size,0);
});
test("备用流严格限制实际大小、完整性、超时和取消",async()=>{
 await assert.rejects(readRelayImage(new Request("http://localhost/upload",{method:"POST",body:"too long"}),1),/大小/);
 await assert.rejects(readRelayImage(new Request("http://localhost/upload",{method:"POST",body:"short"}),20),/完整/);
 const stream=new ReadableStream<Uint8Array>({start(){}}),request=new Request("http://localhost/upload",{method:"POST",body:stream,duplex:"half"} as RequestInit&{duplex:string});
 await assert.rejects(readRelayImage(request,1,10),/中断/);
});
test("浏览器上传诊断不接受名称、内容、凭据或原始URL",()=>{
 assert.throws(()=>recordImageUploadDiagnostic({traceId:randomUUID(),phase:"error",elapsedMs:20,fileName:"private.jpg"}),/格式/);
 const original=console.info,logs:string[]=[];try{console.info=value=>logs.push(String(value));recordImageUploadDiagnostic({traceId:randomUUID(),phase:"upload",elapsedMs:20,loaded:50,total:100});assert.equal(logs.length,1);assert.doesNotMatch(logs[0],/fileName|ticket|https:/);}finally{console.info=original;}
});

test("备用凭据通过普通业务头传递，区域代理继续移除内部伪造头",()=>{const headers=cleanForwardHeaders(new Headers({"x-image-upload-ticket":"fictional-ticket","x-formward-image-ticket":"forged-reserved-header","x-formward-service":"forged-service"}));assert.equal(headers.get("x-image-upload-ticket"),"fictional-ticket");assert.equal(headers.get("x-formward-image-ticket"),null);assert.equal(headers.get("x-formward-service"),null);});
