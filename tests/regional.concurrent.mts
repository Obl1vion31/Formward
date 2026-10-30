import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {createServer} from "node:net";
import {createServer as httpServer} from "node:http";
import {once} from "node:events";
import {createHash,randomUUID} from "node:crypto";
import {eq} from "drizzle-orm";
import postgres from "postgres";
import {migrate} from "drizzle-orm/postgres-js/migrator";
import {createDatabase} from "../src/db/client";
import * as schema from "../src/db/schema";
import {provisionAccount} from "../src/features/auth/provision";
import {createAuth} from "../src/features/auth/auth";
import {webSessionContext,revokeAccountAccess} from "../src/features/auth/account-security";
import {lockOwner} from "../src/features/auth/owner-lock";
import {prepareImageUpload,completeImageUpload} from "../src/features/meals/image-upload";
import {createAiToken,authenticateAi} from "../src/features/auth/ai-tokens";
import {submitRecordOperation,appendPendingImages,getRecordOperation} from "../src/features/records/operations";
import {cosPostPolicy} from "../src/features/meals/image-storage";

const {default:EmbeddedPostgres}=await import(pathToFileURL(process.env.FORMWARD_EMBEDDED_POSTGRES_MODULE??"/tmp/formward-account-tooling/node_modules/embedded-postgres/dist/index.js").href);
const folder=await mkdtemp(join(tmpdir(),"formward-regional-"));
const probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const address=probe.address();assert.ok(address&&typeof address==="object");const port=address.port;await new Promise<void>(r=>probe.close(()=>r()));
const cluster=new EmbeddedPostgres({databaseDir:join(folder,"cluster"),user:"postgres",password:"fictional-regional-password",port,persistent:false,onLog:()=>{},onError:()=>{}});
const objects=new Map<string,Buffer>(),removed:string[]=[];
let releaseWrite:(()=>void)|undefined,announce:(()=>void)|undefined;
const mock=httpServer(async(req,res)=>{
 const path=new URL(req.url!,"http://fixed.test").pathname.slice(1);
 if(req.method==="PUT"){const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));objects.set(path,Buffer.concat(chunks));announce?.();if(releaseWrite)await new Promise<void>(resolve=>{releaseWrite=resolve;});res.end();return;}
 if(req.method==="DELETE"){removed.push(path);objects.delete(path);res.end();return;}
 if(!objects.has(path)){res.statusCode=404;res.end();return;}res.end(objects.get(path));
});
mock.listen(0,"127.0.0.1");await once(mock,"listening");const ma=mock.address();assert.ok(ma&&typeof ma==="object");const mockOrigin="http://127.0.0.1:"+ma.port;
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII=","base64"),secret="fictional-image-ticket-more-than-32-characters";
const file={fileName:"虚构照片.png",size:png.length,mimeType:"image/png",sha256:createHash("sha256").update(png).digest("hex")};
const deps={secret,read:async(path:string)=>new Uint8Array(await (await fetch(mockOrigin+"/"+path)).arrayBuffer()),write:async(path:string,bytes:Uint8Array)=>{const response=await fetch(mockOrigin+"/"+path,{method:"PUT",body:Buffer.from(bytes)});assert.equal(response.status,200);},remove:async(path:string)=>{await fetch(mockOrigin+"/"+path,{method:"DELETE"});}};
let database:ReturnType<typeof createDatabase>|undefined,other:ReturnType<typeof postgres>|undefined;
const checks:string[]=[];
try{
 await cluster.initialise();const cfg=join(folder,"cluster/postgresql.conf");await writeFile(cfg,(await readFile(cfg,"utf8"))+"\nlisten_addresses = '127.0.0.1'\n");
 await cluster.start();await cluster.createDatabase("formward_regional_test");
 const url="postgresql://postgres:fictional-regional-password@127.0.0.1:"+port+"/formward_regional_test";
 database=createDatabase(url+"?max=6");other=postgres(url,{max:1,prepare:false});const db=database.db;
 assert.notEqual((await db.$client`select pg_backend_pid() as id`)[0].id,(await other`select pg_backend_pid() as id`)[0].id);
 await migrate(db,{migrationsFolder:"./drizzle"});
 const person=await provisionAccount(db,{email:"regional@example.test",password:"fictional-regional-password"});
 const auth=createAuth(db,{secret:"fictional-auth-secret-more-than-32-characters",baseURL:"http://localhost:3000",rateLimit:false});
 async function login(){
  const response=await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email",{method:"POST",headers:{Origin:"http://localhost:3000","Content-Type":"application/json"},body:JSON.stringify({email:"regional@example.test",password:"fictional-regional-password"})}));assert.equal(response.status,200);
  const cookie=response.headers.getSetCookie().map(c=>c.split(";")[0]).join(";"),result=await auth.api.getSession({headers:new Headers({cookie})});assert.ok(result);
  return {userId:person.id,sessionId:result.session.id,accessVersion:result.session.accessVersion};
 }
 let proof=await login();
 const prepare=()=>webSessionContext.run(proof,()=>prepareImageUpload(db,person.id,file,secret));
 const prepared=await prepare();assert.ok(prepared.ticket&&prepared.pathname);objects.set(prepared.pathname,png);
 const first=await webSessionContext.run(proof,()=>completeImageUpload(db,person.id,prepared.ticket!,deps));
 const [stored]=await db.select().from(schema.mealImage).where(eq(schema.mealImage.id,first.id));assert.ok(objects.has(stored.pathname));
 await db.transaction(async tx=>{await lockOwner(tx,person.id);await revokeAccountAccess(tx,person.id);});
 await assert.rejects(webSessionContext.run(proof,()=>completeImageUpload(db,person.id,prepared.ticket!,deps)));
 assert.ok(objects.has(stored.pathname));assert.ok(!removed.includes(stored.pathname));assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.id,first.id))).length,1);
 checks.push("真实HTTP暂存／正式存储：成功上传→撤销→迟到完成，正式对象与附件行仍存在");
 proof=await login();const distinct=Buffer.concat([png,Buffer.from("fictional-distinct")]),secondFile={...file,size:distinct.length,sha256:createHash("sha256").update(distinct).digest("hex")};
 const pending=await webSessionContext.run(proof,()=>prepareImageUpload(db,person.id,secondFile,secret));assert.ok(pending.ticket&&pending.pathname);objects.set(pending.pathname,distinct);
 const entered=new Promise<void>(resolve=>{announce=resolve;});releaseWrite=()=>{};
 const inFlight=webSessionContext.run(proof,()=>completeImageUpload(db,person.id,pending.ticket!,deps));
 await entered;announce=undefined;
 // 独立连接拿到相同行锁，证明撤销在正式登记之前提交。
 await other.begin(async tx=>{await tx`select id from users where id=${person.id} for update`;await tx`update users set access_version=access_version+1 where id=${person.id}`;await tx`delete from sessions where user_id=${person.id}`;});
 const resume=releaseWrite;releaseWrite=undefined;resume!();await assert.rejects(inFlight);
 assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.sha256,secondFile.sha256))).length,0);
 assert.ok([...objects.keys()].some(path=>path.startsWith("meal-formal-v2/")&&path!==stored.pathname));checks.push("独立PostgreSQL连接：上传保存与访问撤销竞争，撤销后不能登记，未知正式对象保留待核对");
 const token=await createAiToken(db,person.id,"虚构附件授权","write"),identity=await authenticateAi(db,"Bearer "+token.rawToken,true);
 const request={operationId:randomUUID(),items:[{key:"meal",kind:"save_meal",date:"2026-01-02",mealType:"lunch",timezone:"+08:00",expectedImageCount:1,items:[{kind:"food",name:"虚构食物",quantity:"1",unit:"份",nutrition:{caloriesKcal:"120",proteinG:"10",carbsG:"12",fatG:"4"},nutritionBasis:"consumed_total",sourceKind:"estimated"}]}]};
 const preview=await submitRecordOperation(db,identity,request);
 const before=await getRecordOperation(db,identity,preview.id);
 const appended=await appendPendingImages(db,identity,{id:preview.id,revision:before.revision,key:"meal",imageIds:[first.id]});
 assert.equal(appended.revision,before.revision+1);
 const repeat=await appendPendingImages(db,identity,{id:preview.id,revision:before.revision,key:"meal",imageIds:[first.id]});assert.equal(repeat.repeated,true);
 const [parent]=await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id,preview.id));assert.deepEqual(parent.payload.items,request.items);
 const [meal]=await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.id,parent.mealOperationId!));assert.equal(parent.mealRevision,meal.revision);assert.equal(parent.status,"pending");
 const foreign=await provisionAccount(db,{email:"other-regional@example.test",password:"fictional-other-password"}),foreignToken=await createAiToken(db,foreign.id,"虚构其他授权","write"),foreignIdentity=await authenticateAi(db,"Bearer "+foreignToken.rawToken,true);
 await assert.rejects(appendPendingImages(db,foreignIdentity,{id:preview.id,revision:parent.revision,key:"meal",imageIds:[first.id]}));
 checks.push("补齐待审附件：原始文字不变、审核版本同步、重复追加幂等、跨账号拒绝、没有正式保存");
 Object.assign(process.env,{FORMWARD_COS_BUCKET:"fictional-1250000000",FORMWARD_COS_REGION:"ap-shanghai",FORMWARD_COS_SECRET_ID:"fictional-id",FORMWARD_COS_SECRET_KEY:"fictional-secret"});
 const policy=cosPostPolicy("meal-tmp-v2/fictional/path",68,"image/png",Date.now()+600000),decoded=JSON.parse(Buffer.from(policy.fields.policy,"base64").toString());
 assert.ok(decoded.conditions.some((v:unknown)=>JSON.stringify(v)===JSON.stringify(["content-length-range",68,68])));assert.equal((policy.fields as Record<string,string>).key,"meal-tmp-v2/fictional/path");assert.equal((policy.fields as Record<string,string>)["Content-Type"],"image/png");
 checks.push("COS策略约束精确临时路径、MIME、字节数与期限；真实COS尚未接入");
 console.log(JSON.stringify({database:"独立真实PostgreSQL",checks},null,2));
}finally{
 releaseWrite?.();await other?.end();await database?.close();await cluster.stop().catch(()=>{});mock.closeAllConnections();await new Promise<void>(r=>mock.close(()=>r()));
}
