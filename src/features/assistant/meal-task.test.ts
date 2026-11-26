import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import type { Database } from "../../db/client";
import { createMealTask, getMealTask, createMealTaskPreview, applyMealTask, saveMealTask, startMealTaskRun, controlMealTask, startPhotoHandoff, continueMealByHand } from "./meal-task";
import { chatIdentity, chatSnapshot, currentConversation, startChatRun, controlChat } from "./chat-store";
import { budgetDate } from "./chat-model";
import { revokeAiToken } from "../auth/ai-tokens";
import { readMealSnapshot } from "../meals/records";
import { reviewWebRecord } from "../records/web-review";
import type { MealDraft } from "../meals/model";

const client=new PGlite(),connection=drizzle(client,{schema}),db=connection as unknown as Database,owner=randomUUID(),other=randomUUID(),env=new Map<string,string|undefined>();
function draft(name="手填食物"):MealDraft{return {date:budgetDate(),mealType:"测试餐次",items:[{kind:"food",name,quantity:"1",unit:"份",sourceKind:"estimated",nutritionBasis:"consumed_total",nutrition:{caloriesKcal:"120",proteinG:"10",carbsG:"11",fatG:"4"}}]};}
function proposal(){return {operationId:randomUUID(),meals:[{date:"today",mealType:"其他名称不会覆盖应用绑定",foods:[{name:"识别食物",quantity:"1",unit:"份",sourceKind:"estimated",amountDecision:"provided",caloriesKcal:"290",proteinG:"20",carbsG:"30",fatG:"10",basis:"隔离测试示例"}]}]};}

test("饮食任务权限、上下文与人工保存链路",async t=>{
 for(const [key,value] of Object.entries({FORMWARD_CHAT_ENABLED:"1",FORMWARD_CHAT_PILOT_USER_ID:owner,QWEN_API_KEY:"fictional-key",MIMO_API_KEY:"fictional-key",BETTER_AUTH_URL:"http://localhost:3000"})){env.set(key,process.env[key]);process.env[key]=value;}
 await migrate(connection,{migrationsFolder:"drizzle"});
 await db.insert(schema.user).values([{id:owner,name:"隔离试用",email:"meal-ai-owner@example.test",role:"owner"},{id:other,name:"其他账号",email:"meal-ai-other@example.test",role:"owner"}]);
 try{
await t.test("任务不占用主聊天，创建重试复用草稿，其他账号和外来图片拒绝",async()=>{
 const main=await currentConversation(db,owner),key=randomUUID(),id=await createMealTask(db,owner,key,draft());
 assert.equal((await currentConversation(db,owner)).id,main.id);assert.equal((await getMealTask(db,owner,id)).active,false);
 assert.equal(await createMealTask(db,owner,key,draft()),id);assert.equal((await chatSnapshot(db,owner)).conversationId,main.id);
 await assert.rejects(()=>getMealTask(db,other,id),/不属于/);
 process.env.FORMWARD_CHAT_PILOT_USER_ID=other;await assert.rejects(()=>getMealTask(db,other,id),/不属于/);process.env.FORMWARD_CHAT_PILOT_USER_ID=owner;
 await assert.rejects(()=>createMealTask(db,owner,randomUUID(),{...draft(),imageIds:[randomUUID()]}),/照片/);
});
await t.test("识别保留手填食物与绑定餐次，回填不保存；人工保存及重试只产生一餐",async()=>{
 const id=await createMealTask(db,owner,randomUUID(),draft()),identity=await chatIdentity(db,owner,"qwen",true);
 await createMealTaskPreview(db,identity,id,proposal());
 const applied=await applyMealTask(db,owner,id);
 assert.equal(applied.draft.mealType,"测试餐次");assert.deepEqual(applied.draft.items.map(item=>item.name),["手填食物","识别食物"]);
 assert.equal((await readMealSnapshot(db,owner)).meals.length,0);
 const result=await saveMealTask(db,owner,id,applied.operation.revision,applied.draft);
 assert.equal(result.operation.status,"confirmed");assert.equal(result.snapshot.meals.length,1);assert.equal(result.snapshot.meals[0].items.length,2);
 const repeated=await saveMealTask(db,owner,id,applied.operation.revision,applied.draft);assert.equal(repeated.snapshot.meals.length,1);
 await assert.rejects(()=>saveMealTask(db,owner,id,applied.operation.revision,{...applied.draft,mealType:"不同内容"}),/已经保存/);
});
await t.test("每账号一个生成任务，主聊天与饮食任务相互排斥，停止不写健康记录",async()=>{
 const main=await currentConversation(db,owner),normal=await startChatRun(db,owner,{action:"send",requestId:randomUUID(),provider:"qwen",conversationId:main.id,text:"查询",timezone:"Asia/Shanghai"});
 const id=await createMealTask(db,owner,randomUUID(),draft()),input={action:"run" as const,taskId:id,requestId:randomUUID(),provider:"qwen" as const,imageIds:[],text:"一份食物",timezone:"Asia/Shanghai"};
 await assert.rejects(()=>startMealTaskRun(db,owner,input),/正在生成/);
 await controlChat(db,owner,{action:"stop",runId:normal.row.id});
 const running=await startMealTaskRun(db,owner,input);assert.equal(running.started.started,true);assert.equal((await chatSnapshot(db,owner)).activeRunId,running.started.row.id);
 assert.equal((await currentConversation(db,owner)).id,main.id);await controlMealTask(db,owner,id);
});
await t.test("旧修订、过期和取消不能落库，停止后的运行不能新建预览",async()=>{
 const id=await createMealTask(db,owner,randomUUID(),draft()),identity=await chatIdentity(db,owner,"mimo",true);
 await createMealTaskPreview(db,identity,id,proposal(),"mimo");let applied=await applyMealTask(db,owner,id);
 const before=(await readMealSnapshot(db,owner)).meals.length;
 await assert.rejects(()=>saveMealTask(db,owner,id,applied.operation.revision+1,{...applied.draft,mealType:"新改的餐次"}),/变化/);
 const [operation]=await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id,applied.operation.id));
 await db.update(schema.mealOperation).set({expiresAt:new Date(Date.now()-1000)}).where(eq(schema.mealOperation.id,operation.mealOperationId!));
 await assert.rejects(()=>saveMealTask(db,owner,id,applied.operation.revision,applied.draft));
 const id2=await createMealTask(db,owner,randomUUID(),draft());await createMealTaskPreview(db,identity,id2,proposal(),"mimo");applied=await applyMealTask(db,owner,id2);await controlMealTask(db,owner,id2,true);
 await assert.rejects(()=>saveMealTask(db,owner,id2,applied.operation.revision,applied.draft),/变化/);
 const id3=await createMealTask(db,owner,randomUUID(),draft()),running=await startMealTaskRun(db,owner,{action:"run",taskId:id3,requestId:randomUUID(),provider:"mimo",imageIds:[],text:"一份",timezone:"Asia/Shanghai"});await controlMealTask(db,owner,id3);
 await assert.rejects(()=>createMealTaskPreview(db,identity,id3,proposal(),"mimo",running.started.row.id),/停止/);
 assert.equal((await readMealSnapshot(db,owner)).meals.length,before);
});
await t.test("拍照提交在同事务绑定原草稿、照片和首条消息，付费会话可续聊",async()=>{
 const imageId=randomUUID();
 await db.insert(schema.mealImage).values({id:imageId,userId:owner,pathname:"isolated/"+imageId,sha256:"a".repeat(64),mimeType:"image/png",byteSize:64,fileName:"虚构照片.png",source:"manual",createdBy:owner});
 const packet={action:"handoff" as const,requestId:randomUUID(),draftKey:randomUUID(),draft:draft("原来手填"),imageIds:[imageId],provider:"qwen" as const,text:"  一份鸡肉  ",timezone:"Asia/Shanghai"};
 await assert.rejects(()=>startPhotoHandoff(db,other,packet),/照片/);
 const main=await currentConversation(db,owner),result=await startPhotoHandoff(db,owner,packet);
 assert.notEqual(result.taskId,main.id);
 assert.deepEqual(await startPhotoHandoff(db,owner,packet),result);
 await assert.rejects(()=>startPhotoHandoff(db,owner,{...packet,text:"不同说明"}),/变化/);
 const view=await chatSnapshot(db,owner);
 assert.equal(view.conversationId,result.taskId);
 assert.equal(view.photoHandoff?.restricted,false);
 assert.equal(view.messages[0]?.text,packet.text);
 assert.deepEqual(view.messages[0]?.imageIds,[imageId]);
 assert.equal(view.messages[1]?.mealTask,true);
 assert.equal(view.messages.length,2);
 await controlMealTask(db,owner,result.taskId);
 const next=await startChatRun(db,owner,{action:"send",requestId:randomUUID(),provider:"qwen",conversationId:result.taskId,text:"查看体重",timezone:"Asia/Shanghai"});
 assert.equal(next.row.conversationId,result.taskId);
 await controlChat(db,owner,{action:"stop",runId:next.row.id});
 const identity=await chatIdentity(db,owner,"qwen",true,"meal_entry");
 await createMealTaskPreview(db,identity,result.taskId,proposal());
 const {operation}=await applyMealTask(db,owner,result.taskId);
 await reviewWebRecord(db,owner,operation.id,{kind:"cancel",revision:operation.revision});
 assert.equal((await chatSnapshot(db,owner)).photoHandoff?.cancelled,true);
 const restored=await continueMealByHand(db,owner,result.taskId);
 assert.deepEqual(restored.draft,packet.draft);
 assert.equal((await chatSnapshot(db,owner)).photoHandoff?.cancelled,true);
});
await t.test("仅有识图权限的对话能回看，普通发送被拒绝，额度不足不创建会话",async()=>{
 const imageId=randomUUID();
 await db.insert(schema.mealImage).values({id:imageId,userId:other,pathname:"isolated/"+imageId,sha256:"b".repeat(64),mimeType:"image/png",byteSize:64,fileName:"第二张虚构照片.png",source:"manual",createdBy:other});
 const packet={action:"handoff" as const,requestId:randomUUID(),draftKey:randomUUID(),draft:draft(),imageIds:[imageId],provider:"qwen" as const,text:"一份",timezone:"Asia/Shanghai"};
 await db.update(schema.user).set({aiDailyRecognitionLimit:0}).where(eq(schema.user.id,other));
 await assert.rejects(()=>startPhotoHandoff(db,other,packet),/额度/);
 assert.equal((await db.select().from(schema.assistantConversation).where(eq(schema.assistantConversation.userId,other))).length,0);
 await db.update(schema.user).set({aiDailyRecognitionLimit:1}).where(eq(schema.user.id,other));
 const {taskId}=await startPhotoHandoff(db,other,packet),view=await chatSnapshot(db,other);
 assert.equal(view.photoHandoff?.restricted,true);
 assert.equal(view.conversationId,taskId);
 assert.equal(view.entitlement?.chat,false);
 assert.equal(view.usage.recognition?.remaining,0);
 await assert.rejects(()=>startChatRun(db,other,{action:"send",requestId:randomUUID(),provider:"qwen",conversationId:taskId,text:"查看体重",timezone:"Asia/Shanghai"}),/暂未开放聊天/);
 await continueMealByHand(db,other,taskId);
 assert.equal((await chatSnapshot(db,other)).usage.recognition?.remaining,1);
});
await t.test("撤销授权后待核对餐次不能保存；原手填草稿与其他记录保持",async()=>{
 const id=await createMealTask(db,owner,randomUUID(),draft("保留的手填")),identity=await chatIdentity(db,owner,"qwen",true);
 await createMealTaskPreview(db,identity,id,proposal());const applied=await applyMealTask(db,owner,id),before=(await readMealSnapshot(db,owner)).meals.length;
 await revokeAiToken(db,owner,identity.tokenId!);
 await assert.rejects(()=>saveMealTask(db,owner,id,applied.operation.revision,applied.draft));
 assert.equal((await readMealSnapshot(db,owner)).meals.length,before);assert.equal((await getMealTask(db,owner,id)).context.draft.items[0].name,"保留的手填");
});

 }finally{await client.close();for(const [key,value] of env)if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

// 在0037真实结构与旧会话上执行版本化迁移，同时验证旧应用回退可读取的列和值。
test("0038迁移保留既有结构、会话与消息，默认主聊天且重复执行不改账本", async()=>{
 const prior=await mkdtemp(join(tmpdir(),"formward-meal-migration-")),pg=new PGlite(),connection=drizzle(pg,{schema});
 try{
  await mkdir(join(prior,"meta"));
  const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));
  const entries=journal.entries.filter((entry:{idx:number})=>entry.idx<38);
  await writeFile(join(prior,"meta/_journal.json"),JSON.stringify({...journal,entries}));
  for(const entry of entries)await copyFile("drizzle/"+entry.tag+".sql",join(prior,entry.tag+".sql"));
  await migrate(connection,{migrationsFolder:prior});
  await pg.query("insert into users(id,name,email) values ('migration-user','迁移验收','migration@example.test')");
  await pg.query("insert into assistant_conversations(id,user_id,provider,sequence,followup) values ('migration-chat','migration-user','mimo',2,'{\"prompt\":\"保留追问\"}')");
  await pg.query("insert into assistant_messages(id,user_id,conversation_id,seq,role,text) values ('migration-message','migration-user','migration-chat',1,'user','保留原消息')");
  const columns=async()=> (await pg.query<{table_name:string;column_name:string;data_type:string;is_nullable:string;column_default:string|null}>("select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
  const beforeColumns=await columns(),beforeConversation=(await pg.query("select to_jsonb(t) as value from assistant_conversations t")).rows;
  const beforeMessages=(await pg.query("select to_jsonb(t) as value from assistant_messages t")).rows;
  const ledgerBefore=(await pg.query("select * from drizzle.__drizzle_migrations order by id")).rows;
  const target=join(prior,"through-0038");await mkdir(join(target,"meta"),{recursive:true});const currentEntries=journal.entries.filter((entry:{idx:number})=>entry.idx<=38);await writeFile(join(target,"meta/_journal.json"),JSON.stringify({...journal,entries:currentEntries}));for(const entry of currentEntries)await copyFile("drizzle/"+entry.tag+".sql",join(target,entry.tag+".sql"));await migrate(connection,{migrationsFolder:target});
  assert.deepEqual((await columns()).filter((row)=>!(row.table_name==="assistant_conversations"&&["purpose","context"].includes(String(row.column_name)))),beforeColumns);
  assert.deepEqual((await pg.query("select to_jsonb(t)-'purpose'-'context' as value from assistant_conversations t")).rows,beforeConversation);
  assert.deepEqual((await pg.query("select to_jsonb(t) as value from assistant_messages t")).rows,beforeMessages);
  assert.deepEqual((await pg.query("select purpose,context from assistant_conversations")).rows,[{purpose:"chat",context:null}]);
  const ledgerAfter=(await pg.query("select * from drizzle.__drizzle_migrations order by id")).rows;
  assert.equal(ledgerAfter.length,ledgerBefore.length+1);assert.deepEqual(ledgerAfter.slice(0,-1),ledgerBefore);
  await migrate(connection,{migrationsFolder:target});
  assert.deepEqual((await pg.query("select * from drizzle.__drizzle_migrations order by id")).rows,ledgerAfter);
  // 旧INSERT不提供新增列仍有效；饮食任务不抢占主聊天唯一位置。
  await pg.query("insert into assistant_conversations(id,user_id,active) values ('migration-inactive','migration-user',false)");
  assert.deepEqual((await pg.query("select purpose,context from assistant_conversations where id='migration-inactive'")).rows,[{purpose:"chat",context:null}]);
 }finally{await pg.close();await rm(prior,{recursive:true,force:true});}
});
