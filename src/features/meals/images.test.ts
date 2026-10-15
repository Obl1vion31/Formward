import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { imageMime, validateImageDownloadUrl, downloadMealImage, saveMealImage, ownedMealImage, importMealImages, MAX_IMAGE_BYTES } from "./images";
import { submitMealOperation, decideMealOperation, reviseMealOperation, readMealSnapshot } from "./records";
import { createAiToken, authenticateAi, revokeAiToken } from "../auth/ai-tokens";
import { emptyNutrition, type MealAction } from "./model";
const pg=new PGlite(), db=drizzle(pg,{schema});
before(async()=>{await migrate(db,{migrationsFolder:"./drizzle"});});after(async()=>{await pg.close();});
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII=","base64");
const store=async()=>{};
async function owner(){const id=randomUUID();await db.insert(schema.user).values({id,name:"虚构照片用户",email:`${id}@example.test`});return id;}
const reject=(promise:Promise<unknown>,code:string)=>assert.rejects(promise,e=>e instanceof Error&&"code" in e&&e.code===code);
const review={dateConfirmed:true,mealTypeConfirmed:true,identityConfirmed:true,amountConfirmed:true,cookingConfirmed:true,questions:[]};
const action=(imageIds:string[],photoReview?:typeof review):MealAction=>({kind:"save_meal",date:"2024-08-01",mealType:"午餐",imageIds,photoReview,items:[{kind:"misc",name:"杂",sourceKind:"unknown",nutrition:emptyNutrition()}]});
test("原图类型、尺寸和外部下载地址受约束",async()=>{
 assert.equal(imageMime(png),"image/png");assert.throws(()=>imageMime(Buffer.from("<svg/>")),/JPEG/);assert.throws(()=>imageMime(new Uint8Array(20971521)),/20 MiB/);
 for(const url of ["http://files.oaiusercontent.com/a","https://127.0.0.1/a","https://files.oaiusercontent.com.evil.test/a","https://user:pass@files.oaiusercontent.com/a","https://files.oaiusercontent.com:8443/a"])assert.throws(()=>validateImageDownloadUrl(url));
 assert.equal(validateImageDownloadUrl("https://files.oaiusercontent.com/a").hostname,"files.oaiusercontent.com");
 await reject(downloadMealImage("https://files.oaiusercontent.com/a",async()=>new Response(null,{status:302,headers:{location:"http://127.0.0.1/private"}})),"image_url");
 await reject(downloadMealImage("https://files.oaiusercontent.com/a",async()=>new Response(null,{status:403})),"image_url_expired");
 await reject(downloadMealImage("https://files.oaiusercontent.com/a",async()=>new Response("x",{headers:{"content-length":"20971521"}})),"image_size");
 assert.deepEqual(Buffer.from(await downloadMealImage("https://files.oaiusercontent.com/a",async()=>new Response(png))),png);
});
test("原图重复保存幂等，跨账号读取和关联拒绝，组合外键防止越权",async()=>{
 const id=await owner(),other=await owner();let puts=0;
 const image=await saveMealImage(db,id,png,{fileName:"虚构原图.png",source:"manual",actorId:id},async()=>{puts++;});
 const repeat=await saveMealImage(db,id,png,{fileName:"同图.png",source:"manual",actorId:id},async()=>{puts++;});assert.equal(image.id,repeat.id);assert.equal(puts,1);assert.equal(repeat.repeated,true);
 await reject(ownedMealImage(db,other,image.id),"not_found");
 const op=await submitMealOperation(db,{userId:other,origin:"manual"},{operationId:randomUUID(),actions:[action([image.id])]});assert.equal(op.canConfirm,false);await reject(decideMealOperation(db,other,op.id,op.revision,"confirm"),"review_required");
 await assert.rejects(db.insert(schema.mealImageLink).values({id:randomUUID(),userId:other,imageId:image.id,mealId:randomUUID(),position:0}));
});
test("原图上传后数据库写入失败时清理文件，不依赖静态读写令牌",async()=>{
 const id=await owner(),uploaded:string[]=[],removed:string[]=[];
 await reject(saveMealImage(db,id,png,{fileName:"虚构失败照片.png",source:"manual",actorId:null as unknown as string},async(pathname)=>{uploaded.push(pathname);},async(pathname)=>{removed.push(pathname);}),"image_unavailable");
 assert.equal(uploaded.length,1);assert.deepEqual(removed,uploaded);
 assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.userId,id))).length,0);
});
test("照片餐次未核对不可保存，网页修订后保存且编辑删除恢复保留原图",async()=>{
 const id=await owner(),token=await createAiToken(db,id,"虚构图片令牌","write"),identity=await authenticateAi(db,`Bearer ${token.rawToken}`);
 const image=await saveMealImage(db,id,png,{fileName:"虚构原图.png",source:"ai",actorId:token.token.id,identity},store);
 let op=await submitMealOperation(db,{userId:id,origin:"ai",identity},{operationId:randomUUID(),actions:[action([image.id])]});assert.equal(op.canConfirm,false);assert.equal(op.needsUserInput?.[0].questions.length,5);
 await reject(decideMealOperation(db,id,op.id,op.revision,"confirm"),"review_required");
 op={...op,...await reviseMealOperation(db,id,op.id,op.revision,[action([image.id],review)])};assert.equal(op.canConfirm,true);await decideMealOperation(db,id,op.id,op.revision,"confirm");
 let meal=(await readMealSnapshot(db,id)).meals[0];assert.deepEqual(meal.imageIds,[image.id]);
 for(const kind of ["delete_meal","restore_meal"] as const){const change=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[{kind,id:meal.id,version:meal.version}]});await decideMealOperation(db,id,change.id,change.revision,"confirm");meal=(await readMealSnapshot(db,id)).meals[0];assert.deepEqual(meal.imageIds,[image.id]);}
 const edit=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[{...action([]),imageIds:undefined,id:meal.id,version:meal.version,notes:"只改备注"}]});await decideMealOperation(db,id,edit.id,edit.revision,"confirm");assert.deepEqual((await readMealSnapshot(db,id)).meals[0].imageIds,[image.id]);
 const pending=await submitMealOperation(db,{userId:id,origin:"ai",identity},{operationId:randomUUID(),actions:[{...action([image.id],review),notes:"另一次进食"}]});await revokeAiToken(db,id,token.token.id);await reject(decideMealOperation(db,id,pending.id,pending.revision,"confirm"),"invalid_token");
 await reject(saveMealImage(db,id,png,{fileName:"虚构.png",source:"ai",actorId:token.token.id,identity},store),"invalid_token");
});
test("食材原图保留历史快照，未知食用量不被换算成零或一份",async()=>{
 const id=await owner(),image=await saveMealImage(db,id,png,{fileName:"虚构包装.png",source:"manual",actorId:id},store);
 const add=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_food",name:"虚构牛肉",baseQuantity:"100",unit:"g",nutrition:{caloriesKcal:"150",proteinG:"20",carbsG:"0",fatG:"5"},sourceKind:"label",basis:"虚构标签每100g",imageIds:[image.id]}]});await decideMealOperation(db,id,add.id,add.revision,"confirm");
 const f=(await readMealSnapshot(db,id)).foods[0];assert.deepEqual(f.imageIds,[image.id]);
 const m:MealAction={kind:"save_meal",date:"2024-08-01",mealType:"晚餐",items:[{kind:"food",name:f.name,foodId:f.id,foodVersion:f.version,unit:"g",quantity:null,amountDecision:"unknown_accepted",sourceKind:"label"}]};
 const op=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[m]});assert.equal(op.canConfirm,true);await decideMealOperation(db,id,op.id,op.revision,"confirm");
 const meal=(await readMealSnapshot(db,id)).meals[0];assert.equal(meal.items[0].amountDecision,"unknown_accepted");assert.equal(meal.totals.values.caloriesKcal,null);assert.equal(meal.totals.incomplete.caloriesKcal,true);assert.deepEqual(meal.items[0].foodSnapshot?.imageIds,[image.id]);
 assert.equal((await db.select().from(schema.mealImage).where(eq(schema.mealImage.userId,id))).length,1);
});

test("食用量估算独立于标签营养依据，须说明估算依据",async()=>{
 const id=await owner();const fop=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_food",name:"虚构标签鸡肉",baseQuantity:"100",unit:"g",nutrition:{caloriesKcal:"100",proteinG:"20",carbsG:"0",fatG:"1"},sourceKind:"label",basis:"虚构标签每100g"}]});await decideMealOperation(db,id,fop.id,fop.revision,"confirm");
 const f=(await readMealSnapshot(db,id)).foods[0],item={kind:"food" as const,name:f.name,foodId:f.id,foodVersion:f.version,quantity:"150",unit:"g",sourceKind:"label" as const,amountDecision:"estimate_accepted" as const};
 const base={kind:"save_meal" as const,date:"2024-08-01",mealType:"晚餐",items:[item]};
 const missing=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[base]});assert.equal(missing.canConfirm,false);
 const op=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[{...base,items:[{...item,basis:"用户接受按可见份量估150g"}]}]});assert.equal(op.canConfirm,true);await decideMealOperation(db,id,op.id,op.revision,"confirm");
 const saved=(await readMealSnapshot(db,id)).meals[0].items[0];assert.equal(saved.nutrition.caloriesKcal,"150.0000");assert.equal(saved.sourceKind,"label");assert.match(saved.basis!,/150g/);assert.equal(saved.amountDecision,"estimate_accepted");
});

test("旧餐项未注明食量决策时读取省略字段，编辑可正常保存",async()=>{
 const id=await owner(),op=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[action([])]});await decideMealOperation(db,id,op.id,op.revision,"confirm");
 const m=(await readMealSnapshot(db,id)).meals[0];assert.equal(m.items[0].amountDecision,undefined);
 const edit=await submitMealOperation(db,{userId:id,origin:"manual"},{operationId:randomUUID(),actions:[{kind:"save_meal",id:m.id,version:m.version,date:m.date,mealType:m.mealType,items:m.items,notes:"修改旧餐项备注"}]});assert.equal(edit.canConfirm,true,edit.rows[0].error);await decideMealOperation(db,id,edit.id,edit.revision,"confirm");assert.equal((await readMealSnapshot(db,id)).meals[0].notes,"修改旧餐项备注");
});

test("GPT多图导入保留成功项并明确逐文件失败，重试不重复附件", async () => {
 const id=await owner(),token=await createAiToken(db,id,"虚构批量照片","write"),identity=await authenticateAi(db,"Bearer "+token.rawToken);
 const files=[{file_id:"good",download_url:"https://files.oaiusercontent.com/good"},{file_id:"expired",download_url:"https://files.oaiusercontent.com/expired"}];
 const {ApiError}=await import("../auth/ai-identity");
 const dependencies={download:async(url:string)=>{if(url.endsWith("expired"))throw new ApiError(400,"image_url_expired","地址失效");return png;},save:((database,userId,bytes,metadata)=>saveMealImage(database,userId,bytes,metadata,store)) as typeof saveMealImage};
 const first=await importMealImages(db,identity,{files},dependencies);
 assert.equal(first.status,"partial");assert.equal(first.images.length,1);assert.equal(first.failures[0].code,"image_url_expired");assert.equal(first.failures[0].index,1);
 const repeated=await importMealImages(db,identity,{files:[files[0]]},dependencies);assert.equal(repeated.status,"complete");assert.equal(repeated.images[0].id,first.images[0].id);
 const failed=await importMealImages(db,identity,{files:[files[1]]},dependencies);assert.equal(failed.status,"failed");assert.equal(failed.images.length,0);
 await revokeAiToken(db,id,token.token.id);await reject(importMealImages(db,identity,{files},dependencies),"invalid_token");
});

test("20 MiB边界及网络下载重试保留原始字节",async()=>{
 const large=Buffer.alloc(MAX_IMAGE_BYTES);png.copy(large);assert.equal(imageMime(large),"image/png");
 assert.throws(()=>imageMime(Buffer.alloc(MAX_IMAGE_BYTES+1)),/20 MiB/);
 let calls=0;const downloaded=await downloadMealImage("https://files.oaiusercontent.com/retry",async()=>{calls++;if(calls===1)throw new TypeError("fictional network");return new Response(png);});
 assert.equal(calls,2);assert.deepEqual(Buffer.from(downloaded),png);
});
