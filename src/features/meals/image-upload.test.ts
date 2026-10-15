import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
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
 const removed:string[]=[],deps={read:async()=>png,remove:async(p:string|string[])=>{removed.push(String(p));},secret};
 const first=await completeImageUpload(db,id,prepared.ticket,deps),repeat=await completeImageUpload(db,id,prepared.ticket,deps);
 assert.equal(first.id,repeat.id);assert.equal(repeat.repeated,true);assert.deepEqual(removed,[]);
 assert.equal((await prepareImageUpload(db,id,input,secret)).image?.id,first.id);
 await assert.rejects(completeImageUpload(db,await owner(),prepared.ticket,deps),/账号/);
 const failedOwner=await owner(),bad=await prepareImageUpload(db,failedOwner,input,secret);assert.ok(bad.ticket);
 await assert.rejects(completeImageUpload(db,failedOwner,bad.ticket,{...deps,read:async()=>Buffer.concat([png,Buffer.from([0])])}),/不一致/);
 assert.deepEqual(removed,[bad.pathname]);assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.userId,failedOwner))).length,0);
 const retry=await completeImageUpload(db,failedOwner,bad.ticket,deps);assert.ok(retry.id);
});
