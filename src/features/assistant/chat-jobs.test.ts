import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,createHash} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq} from "drizzle-orm";
import * as schema from "../../db/schema";
import type {Database} from "../../db/client";
import {chatAttachmentBinding,chatImageContent} from "./chat-attachments";
import {claimChatJob,executeChatJob} from "./chat-jobs";
import {chatRunStream} from "./chat-stream";
import {startChatRun,currentConversation,chatSnapshot,controlChat,reapChatRuns,reserveChatUsage,type ChatSend} from "./chat-store";
const pg=new PGlite(),testDb=drizzle(pg,{schema}),db=testDb as unknown as Database,userId=randomUUID(),other=randomUUID();
const prior=new Map<string,string|undefined>();
before(async()=>{for(const[k,v]of Object.entries({FORMWARD_CHAT_ENABLED:"1",FORMWARD_CHAT_PILOT_USER_ID:userId,QWEN_API_KEY:"fictional-key",MIMO_API_KEY:"fictional-key",BETTER_AUTH_URL:"http://localhost:3000"})){prior.set(k,process.env[k]);process.env[k]=v;}await migrate(testDb,{migrationsFolder:"drizzle"});await db.insert(schema.user).values([{id:userId,name:"后台隔离账号",email:userId+"@example.test",role:"owner",membershipTier:"plus"},{id:other,name:"其他隔离账号",email:other+"@example.test"}]);});
after(async()=>{await pg.close();for(const[k,v]of prior)if(v===undefined)delete process.env[k];else process.env[k]=v;});
async function begin(extra:Partial<ChatSend>={}){await controlChat(db,userId,{action:"new"});const c=await currentConversation(db,userId);const input:ChatSend={action:"send",requestId:randomUUID(),provider:"qwen",conversationId:c.id,text:"100毫升牛奶和100克鸭锁骨，按图片标签",timezone:"Asia/Shanghai",...extra};return {input,...await startChatRun(db,userId,input)};}
function completion(text="后台结果已保存"){return new Response(JSON.stringify({model:"qwen3.8-flash",choices:[{message:{content:text},finish_reason:"stop"}],usage:{prompt_tokens:100,completion_tokens:20}}),{headers:{"content-type":"application/json","x-request-id":"isolated-request-id"}});}
async function image(owner=userId){const id=randomUUID(),bytes=Buffer.concat([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64"),Buffer.from(id)]);await db.insert(schema.mealImage).values({id,userId:owner,pathname:"isolated/"+id,sha256:createHash("sha256").update(bytes).digest("hex"),mimeType:"image/png",byteSize:bytes.length,fileName:"虚构标签.png",source:"manual",createdBy:owner});return {id,bytes};}
test("浏览器取消订阅不取消后台任务，恢复读取同一任务且不重复调用",async()=>{
 const job=await begin(),abort=new AbortController(),stream=chatRunStream(db,userId,job.input,new Request("http://localhost/api/assistant-chat",{signal:abort.signal}),job,{skipSessionCheck:true}),reader=stream.getReader();await reader.read();await reader.cancel();abort.abort();
 const claimed=await claimChatJob(db,"worker-a");assert.equal(claimed!.id,job.row.id);assert.equal(await claimChatJob(db,"worker-b"),null);let calls=0;
 await executeChatJob(db,claimed!,new AbortController().signal,{fetcher:async()=>{calls++;return completion();}});
 const s=await chatSnapshot(db,userId);assert.equal(s.activeRunId,null);assert.equal(s.messages.at(-1)!.text,"后台结果已保存");assert.equal(s.messages.at(-1)!.state,"complete");assert.equal(s.messages.at(-1)!.provider,"qwen");
 const duplicate=await startChatRun(db,userId,job.input);assert.equal(duplicate.started,false);assert.equal(duplicate.row.id,job.row.id);assert.equal(calls,1);
 const [run]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.id,job.row.id));assert.equal(run.requestDiagnostics[0].providerRequestId,"isolated-request-id");assert.equal(run.requestDiagnostics[0].returnedModel,"qwen3.8-flash");assert.doesNotMatch(JSON.stringify(run.requestDiagnostics),/fictional-key|100毫升/);
});
test("主动停止已领取任务，取消静默模型连接，保留已知任务状态",async()=>{
 const job=await begin(),claimed=await claimChatJob(db,"worker-stop");let started!:()=>void;const pending=new Promise<void>(resolve=>{started=resolve;});
 const running=executeChatJob(db,claimed!,new AbortController().signal,{fetcher:async(_url,init)=>{started();return new Promise<Response>((_resolve,reject)=>{init!.signal!.addEventListener("abort",()=>reject(new DOMException("stopped","AbortError")),{once:true});});}});
 await pending;await controlChat(db,userId,{action:"stop",runId:job.row.id});await running;const s=await chatSnapshot(db,userId);assert.equal(s.messages.at(-1)!.state,"stopped");assert.equal(s.activeRunId,null);
});
test("停止尚未领取任务不会发出模型请求",async()=>{const job=await begin();await controlChat(db,userId,{action:"stop",runId:job.row.id});assert.equal(await claimChatJob(db,"worker"),null);});
test("排队任务不按浏览器断线回收；异常执行任务不会自动重放或清零未知费用",async()=>{
 const job=await begin();await db.update(schema.assistantRun).set({heartbeatAt:new Date(Date.now()-200000)}).where(eq(schema.assistantRun.id,job.row.id));await reapChatRuns(db,userId);assert.equal((await chatSnapshot(db,userId)).activeRunId,job.row.id);
 const claimed=await claimChatJob(db,"worker-dead");await reserveChatUsage(db,userId,claimed!,0.01);await db.update(schema.assistantRun).set({heartbeatAt:new Date(Date.now()-200000)}).where(eq(schema.assistantRun.id,job.row.id));await reapChatRuns(db,userId);
 assert.equal(await claimChatJob(db,"worker-next"),null);const costs=await db.select().from(schema.assistantUsageRequest).where(eq(schema.assistantUsageRequest.runId,job.row.id));assert.equal(costs[0].state,"unknown");
});
test("已停用账号排队任务在调用供应商前拒绝",async()=>{await begin();const claimed=await claimChatJob(db,"worker-auth");await db.update(schema.user).set({banned:true}).where(eq(schema.user.id,userId));let calls=0;try{await executeChatJob(db,claimed!,new AbortController().signal,{fetcher:async()=>{calls++;return completion();}});assert.equal(calls,0);}finally{await db.update(schema.user).set({banned:false}).where(eq(schema.user.id,userId));}assert.equal((await chatSnapshot(db,userId)).messages.at(-1)!.state,"error");});
test("新图优先、绑定固定；两张图片字节和顺序保持、诊断不含原图",async()=>{
 const a=await image(),b=await image();const job=await begin({imageIds:[b.id,a.id]});assert.deepEqual(job.row.executionInput!.attachmentImageIds,[b.id,a.id]);
 const prepared=await chatImageContent(db,userId,job.input.text!,job.row.executionInput!,async(_db,_owner,id)=>({stream:new ReadableStream({start(c){c.enqueue(id===a.id?a.bytes:b.bytes);c.close();}}),mimeType:"image/png"}));
 assert.ok(Array.isArray(prepared.content));assert.deepEqual(prepared.images.map(i=>i.id),[b.id,a.id]);assert.equal(prepared.content[0].type,"text");assert.equal(Buffer.from(prepared.content[1].type==="image_url"?prepared.content[1].image_url.url.split(",")[1]:"","base64").compare(b.bytes),0);
 assert.doesNotMatch(JSON.stringify(prepared.images),/base64|data:image/);await controlChat(db,userId,{action:"stop",runId:job.row.id});
});
test("跨账号附件不可创建任务；错字节及空图片明确拒绝",async()=>{
 const foreign=await image(other);await assert.rejects(()=>begin({imageIds:[foreign.id]}),/照片/);
 const a=await image(),binding={attachmentSourceId:randomUUID(),attachmentImageIds:[a.id]};
 await assert.rejects(()=>chatImageContent(db,userId,"原文",binding,async()=>({stream:new ReadableStream({start(c){c.enqueue(Buffer.from("not-an-image"));c.close();}}),mimeType:"image/png"})),/图片|照片|格式/);
 await assert.rejects(()=>chatImageContent(db,userId,"原文",binding,async()=>({stream:new ReadableStream({start(c){c.close();}}),mimeType:"image/png"})),/照片为空/);
 const altered=Buffer.from(a.bytes);altered[altered.length-1]^=1;await assert.rejects(()=>chatImageContent(db,userId,"原文",binding,async()=>({stream:new ReadableStream({start(c){c.enqueue(altered);c.close();}}),mimeType:"image/png"})),/登记不一致/);
});
test("引用从原回答关联的用户消息取图，新问题不隐式拿历史图片",async()=>{
 const a=await image(),first=await begin({imageIds:[a.id]});await controlChat(db,userId,{action:"stop",runId:first.row.id});
 const question={id:randomUUID(),conversationId:first.row.conversationId,text:"这张标签",imageIds:[],replyToId:first.row.assistantMessageId};
 const binding=await chatAttachmentBinding(db,userId,question);assert.deepEqual(binding.attachmentImageIds,[a.id]);assert.equal(binding.attachmentSourceId,first.row.userMessageId);
 const unrelated=await chatAttachmentBinding(db,userId,{...question,replyToId:null,text:"最近体重怎么样"});assert.deepEqual(unrelated.attachmentImageIds,[]);
 const followup=await chatAttachmentBinding(db,userId,{...question,replyToId:null},first.row.userMessageId);assert.deepEqual(followup.attachmentImageIds,[a.id]);
 const b=await image();assert.deepEqual((await chatAttachmentBinding(db,userId,{...question,imageIds:[b.id]},first.row.userMessageId)).attachmentImageIds,[b.id]);
});
test("手动改模型只影响下一条，原回答实际模型不被覆盖",async()=>{
 await begin();const claimed=await claimChatJob(db,"worker-model");await executeChatJob(db,claimed!,new AbortController().signal,{fetcher:async()=>completion()});await controlChat(db,userId,{action:"select_model",provider:"mimo"});const s=await chatSnapshot(db,userId);assert.equal(s.provider,"mimo");assert.equal(s.messages.at(-1)!.provider,"qwen");
});

test("补充任务重试沿用首次绑定的照片，不被已清除的追问状态改变",async()=>{
 const a=await image(),first=await begin({imageIds:[a.id]});await controlChat(db,userId,{action:"stop",runId:first.row.id});
 await db.update(schema.assistantRun).set({executionInput:{...first.row.executionInput!,attachmentSourceId:first.row.userMessageId,attachmentImageIds:[a.id]}}).where(eq(schema.assistantRun.id,first.row.id));
 await db.update(schema.assistantMessage).set({imageIds:[]}).where(eq(schema.assistantMessage.id,first.row.userMessageId));
 const retried=await startChatRun(db,userId,{...first.input,requestId:randomUUID(),action:"retry",messageId:first.row.assistantMessageId,provider:"mimo",imageIds:[]});
 assert.deepEqual(retried.row.executionInput!.attachmentImageIds,[a.id]);assert.equal(retried.row.executionInput!.attachmentSourceId,first.row.userMessageId);await controlChat(db,userId,{action:"stop",runId:retried.row.id});
});

test("区域部署的后台来源由服务器配置，不依赖浏览器Cookie或请求头",async()=>{
 await begin();const job=await claimChatJob(db,"regional-worker");const keys=["FORMWARD_REGIONAL","FORMWARD_CN_ORIGIN"],saved=keys.map(key=>process.env[key]);process.env.FORMWARD_REGIONAL="1";process.env.FORMWARD_CN_ORIGIN="https://cn.formward.top";let calls=0;
 try{await executeChatJob(db,job!,new AbortController().signal,{fetcher:async()=>{calls++;return completion();}});assert.equal(calls,1);assert.equal((await chatSnapshot(db,userId)).messages.at(-1)!.state,"complete");}finally{keys.forEach((key,index)=>{if(saved[index]===undefined)delete process.env[key];else process.env[key]=saved[index];});}
});

test("多图超出预算时只允许从同一消息的原附件里继续分批", async () => {
  const images = await Promise.all(Array.from({length:4},()=>image()));
  const job = await begin({imageIds:images.map(item=>item.id)});
  const claimed = await claimChatJob(db,"worker-photo-limit");
  let calls = 0;
  await executeChatJob(db,claimed!,new AbortController().signal,{fetcher:async()=>{calls++;return completion();}});
  assert.equal(calls,0);
  const current = await chatSnapshot(db,userId);
  const failed = current.messages.at(-1)!;
  assert.deepEqual(failed.photoLimit?.imageIds,images.map(item=>item.id));
  assert.ok(failed.photoLimit!.maxPhotos < images.length);
  const retry:ChatSend={action:"retry",requestId:randomUUID(),provider:"qwen",conversationId:current.conversationId,
    timezone:"Asia/Shanghai",messageId:failed.id,imageSubset:[randomUUID()]};
  await assert.rejects(()=>startChatRun(db,userId,retry),/照片已变化/);
  const next = await startChatRun(db,userId,{...retry,imageSubset:[images[0].id]});
  assert.equal(next.row.userMessageId,job.row.userMessageId);
  assert.deepEqual(next.row.executionInput?.attachmentImageIds,[images[0].id]);
  assert.equal(next.row.executionInput?.photoBatchOf,failed.id);
  await controlChat(db,userId,{action:"stop",runId:next.row.id});
});
