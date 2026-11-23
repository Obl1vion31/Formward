import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,createHash} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq} from "drizzle-orm";
import {chatContextLimitNotice} from "./chat-model";
import {fitChatContext} from "./chat-context";
import type {ProtocolMessage} from "./chat-provider";
import * as schema from "../../db/schema";
import type {Database} from "../../db/client";
import {chatAttachmentBinding,chatImageContent} from "./chat-attachments";
import {claimChatJob,executeChatJob} from "./chat-jobs";
import {chatRunStream} from "./chat-stream";
import {startChatRun,currentConversation,chatSnapshot,controlChat,listChatConversations,removeChatConversation,reapChatRuns,reserveChatUsage,resumeChatInNewConversation,type ChatSend} from "./chat-store";
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
test("停止尚未领取的指定任务，旧空编号、会话不符和迟到点击保持幂等", async () => {
  const job = await begin();
  const { conversationId } = job.input;
  assert.equal(await controlChat(db, userId, { action: "stop" }), undefined);
  assert.equal(await controlChat(db, userId, { action: "stop", conversationId: randomUUID(), runId: job.row.id }), undefined);
  assert.equal(await controlChat(db, userId, { action: "stop", conversationId, runId: randomUUID() }), undefined);
  assert.equal((await chatSnapshot(db, userId)).activeRunId, job.row.id);
  assert.equal(await controlChat(db, userId, { action: "stop", conversationId, runId: job.row.id }), job.row.id);
  assert.equal(await controlChat(db, userId, { action: "stop", conversationId, runId: job.row.id }), undefined);
  assert.equal((await chatSnapshot(db, userId)).messages.at(-1)?.state, "stopped");
  assert.equal(await claimChatJob(db, "worker"), null);
});
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

test("历史手动分批消息仍只允许选择原附件的未处理部分", async () => {
  const images = await Promise.all(Array.from({length:6},()=>image()));
  const job = await begin({imageIds:images.map(item=>item.id)});
  const {photoBatch: _newState, ...legacy} = job.row.executionInput!;
  assert.deepEqual(_newState,[]);
  await db.update(schema.assistantRun).set({state:"error",executionInput:legacy,requestDiagnostics:[{
    state:"prepared",requestSha256:"legacy",round:1,provider:"qwen",model:job.row.model,
    messageId:job.row.userMessageId,attachmentSourceId:job.row.userMessageId,images:[],textSha256:"legacy",maxPhotos:2,
  }]}).where(eq(schema.assistantRun.id,job.row.id));
  await db.update(schema.assistantMessage).set({state:"error",error:"本轮照片超出可处理范围。可分批继续，其余照片仍保留。"})
    .where(eq(schema.assistantMessage.id,job.row.assistantMessageId));
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
  for (let index = 0; index < images.length; index++) {
    const selected = index === 0 ? next : await startChatRun(db,userId,{
      ...retry,requestId:randomUUID(),imageSubset:[images[index].id],
    });
    await db.update(schema.assistantRun).set({state:"complete"}).where(eq(schema.assistantRun.id,selected.row.id));
    await db.update(schema.assistantMessage).set({state:"complete",text:"完成这张照片。"})
      .where(eq(schema.assistantMessage.id,selected.row.assistantMessageId));
    const snapshot = await chatSnapshot(db,userId);
    const original = [...snapshot.messages,...snapshot.photoUpdates??[]].find(message=>message.id===failed.id);
    assert.deepEqual(original?.photoLimit?.imageIds ?? [],images.slice(index+1).map(item=>item.id));
    if (index===images.length-1) {
      assert.equal(original?.state,"complete");
      assert.equal(original?.error,null);
      assert.ok(snapshot.messages.every(message=>!message.error && !message.photoLimit));
    }
  }
  await assert.rejects(()=>startChatRun(db,userId,{
    ...retry,requestId:randomUUID(),imageSubset:[images[0].id],
  }),/照片已变化/);
});

test("已交给模型的照片遇到后续上下文满载，不再次列为待处理",async()=>{
  const photos=await Promise.all([image(),image()]);
  const job=await begin({imageIds:photos.map(photo=>photo.id)});
  const diagnostic = {
    provider:job.row.provider as "qwen",model:job.row.model,
    messageId:job.row.userMessageId,attachmentSourceId:job.row.userMessageId,
    requestSha256:"a".repeat(64),textSha256:"b".repeat(64),
    images:photos.map(photo=>({id:photo.id,byteSize:photo.bytes.length,mimeType:"image/png",sha256:"c".repeat(64)})),
  };
  await db.update(schema.assistantRun).set({state:"error",requestDiagnostics:[
    {...diagnostic,round:1,state:"completed"},{...diagnostic,round:2,state:"prepared",maxPhotos:1},
  ]}).where(eq(schema.assistantRun.id,job.row.id));
  await db.update(schema.assistantMessage).set({
    state:"error",text:"两张图的部分结果。",error:"本轮照片超出可处理范围。可分批继续，其余照片仍保留。",
  }).where(eq(schema.assistantMessage.id,job.row.assistantMessageId));
  const answer=(await chatSnapshot(db,userId)).messages.at(-1)!;
  assert.equal(answer.contextLimited,true);
  assert.equal(answer.photoLimit,undefined);
  assert.equal(answer.text,"两张图的部分结果。");
  assert.equal(answer.error,chatContextLimitNotice);
});

test("本人移出历史后不再可打开、重新激活或重复发送，原文与用量保留",async()=>{
  const job=await begin();
  const id=job.row.conversationId;
  await assert.rejects(()=>removeChatConversation(db,other,id),/找不到/);
  await assert.rejects(()=>removeChatConversation(db,userId,id),/正在生成/);
  const claimed=await claimChatJob(db,"worker-remove");
  await executeChatJob(db,claimed!,new AbortController().signal,{fetcher:async()=>completion()});
  await removeChatConversation(db,userId,id);
  await removeChatConversation(db,userId,id);
  assert.ok((await listChatConversations(db,userId)).items.every(item=>item.id!==id));
  assert.notEqual((await currentConversation(db,userId)).id,id);
  await assert.rejects(()=>chatSnapshot(db,userId,undefined,undefined,id),/不属于/);
  await assert.rejects(()=>controlChat(db,userId,{action:"select_conversation",conversationId:id}),/不存在/);
  await assert.rejects(()=>startChatRun(db,userId,job.input),/移出历史/);
  const stored=await db.select().from(schema.assistantMessage).where(eq(schema.assistantMessage.conversationId,id));
  assert.equal(stored.length,2);
  assert.ok(stored.some(message=>message.text==="后台结果已保存"));
  const usage=await db.select().from(schema.assistantUsageRequest).where(eq(schema.assistantUsageRequest.runId,job.row.id));
  assert.equal(usage[0].state,"settled");
});

test("原会话错误引用只授权本账号，首次发送接续一条引用且原图保持在原会话",async()=>{
  await db.update(schema.assistantRun).set({createdAt:new Date(Date.now()-120_000)}).where(eq(schema.assistantRun.userId,userId));
  const photo=await image();
  const job=await begin({text:"原问题：请核对晚餐详细记录。",imageIds:[photo.id]});
  const sourceId=job.row.assistantMessageId, origin=job.row.conversationId;
  await db.update(schema.assistantRun).set({state:"error"}).where(eq(schema.assistantRun.id,job.row.id));
  await db.update(schema.assistantMessage).set({state:"error",text:"已核对的部分。",error:"本次请求的上下文已满。"}).where(eq(schema.assistantMessage.id,sourceId));
  const emptyBefore=(await db.select().from(schema.assistantUsageRequest)).length;
  const [newResult, repeated] = await Promise.allSettled([
    controlChat(db,userId,{action:"new",conversationId:origin,contextQuoteId:sourceId}),
    controlChat(db,userId,{action:"new",conversationId:origin,contextQuoteId:sourceId}),
  ]);
  assert.equal([newResult,repeated].filter(result=>result.status==="fulfilled").length,1);
  assert.equal([newResult,repeated].filter(result=>result.status==="rejected").length,1);
  const snapshot=await chatSnapshot(db,userId),target=snapshot.conversationId;
  assert.notEqual(target,origin);
  assert.equal(snapshot.messages.length,0);
  assert.equal(snapshot.pendingContextQuote?.id,sourceId);
  assert.match(snapshot.pendingContextQuote!.text!,/原问题：请核对晚餐详细记录。/);
  assert.match(snapshot.pendingContextQuote!.text!,/已核对的部分。/);
  assert.deepEqual((await chatSnapshot(db,userId)).pendingContextQuote,snapshot.pendingContextQuote);
  assert.equal((await db.select().from(schema.assistantUsageRequest)).length,emptyBefore);

  const sent=await startChatRun(db,userId,{...job.input,conversationId:target,requestId:randomUUID(),imageIds:[],text:"只回答新版续问。",replyToId:sourceId});
  assert.equal(sent.row.executionInput?.contextQuote,true);
  assert.deepEqual(sent.row.executionInput?.attachmentImageIds,[]);
  assert.equal((await chatSnapshot(db,userId)).pendingContextQuote,undefined);
  const claimed=await claimChatJob(db,"worker-context-quote");
  await executeChatJob(db,claimed!,new AbortController().signal,{fetcher:async (_url,init)=>{
    const body=JSON.parse(String(init?.body));
    const prompt=body.messages[0].content;
    assert.match(prompt,/原问题：请核对晚餐详细记录。/);
    assert.match(prompt,/已核对的部分。/);
    assert.ok(!JSON.stringify(body).includes(photo.id));
    assert.equal(body.messages.filter((item:ProtocolMessage)=>item.role==="user").length,1);
    return completion("〔正文〕这次只答新问题。");
  }});
  const after=await chatSnapshot(db,userId);
  assert.equal(after.messages.at(-1)?.text,"这次只答新问题。");
  assert.equal(after.messages[0].replyTo?.contextQuote,true);
  assert.deepEqual((await chatSnapshot(db,userId,undefined,undefined,origin)).messages[0].imageIds,[photo.id]);

  await db.update(schema.user).set({membershipTier:"plus"}).where(eq(schema.user.id,other));
  try{
    const otherChat=await currentConversation(db,other);
    await assert.rejects(()=>controlChat(db,other,{action:"new",conversationId:otherChat.id,contextQuoteId:sourceId}),/原消息已不可用/);
    await assert.rejects(()=>startChatRun(db,other,{...job.input,conversationId:otherChat.id,requestId:randomUUID(),imageIds:[],replyToId:sourceId}),/引用消息不在/);
  }finally{await db.update(schema.user).set({membershipTier:"free"}).where(eq(schema.user.id,other));}

  await controlChat(db,userId,{action:"select_conversation",conversationId:origin});
  await controlChat(db,userId,{action:"new",conversationId:origin,contextQuoteId:sourceId});
  const next=(await currentConversation(db,userId)).id;
  await removeChatConversation(db,userId,origin);
  assert.deepEqual((await chatSnapshot(db,userId)).pendingContextQuote,{id:sourceId,text:null});
  await assert.rejects(()=>startChatRun(db,userId,{...job.input,conversationId:next,requestId:randomUUID(),imageIds:[],replyToId:sourceId}),/原消息已不可用/);
  await controlChat(db,userId,{action:"clear_context_quote",conversationId:next});
  assert.equal((await chatSnapshot(db,userId)).pendingContextQuote,undefined);
  const plain=await startChatRun(db,userId,{...job.input,conversationId:next,requestId:randomUUID(),imageIds:[],text:"普通发送。"});
  assert.equal(plain.row.executionInput?.contextQuote,undefined);
  await controlChat(db,userId,{action:"stop",runId:plain.row.id});
});

test("新对话一键续答事务防重，并保留原问题、原时区和已读附件",async()=>{
  await db.update(schema.assistantRun).set({createdAt:new Date(Date.now()-120_000)}).where(eq(schema.assistantRun.userId,userId));
  const photo=await image(), originalTime=new Date("2026-11-19T15:56:00.000Z");
  const job=await begin({text:"昨天的晚餐，按这张照片继续核对。",imageIds:[photo.id]});
  const {id,conversationId,assistantMessageId,userMessageId}=job.row;
  await db.update(schema.assistantMessage).set({createdAt:originalTime}).where(eq(schema.assistantMessage.id,userMessageId));
  await db.update(schema.assistantMessage).set({state:"error",error:chatContextLimitNotice}).where(eq(schema.assistantMessage.id,assistantMessageId));
  const execution=job.row.executionInput!;
  await db.update(schema.assistantRun).set({state:"error",executionInput:{...execution,photoBatch:[{imageId:photo.id,notes:"已核对菜品。"}]}})
    .where(eq(schema.assistantRun.id,id));
  await db.update(schema.user).set({membershipTier:"plus"}).where(eq(schema.user.id,other));
  try {
    await assert.rejects(()=>resumeChatInNewConversation(db,other,conversationId,assistantMessageId),/原对话已不可用/);
  } finally {
    await db.update(schema.user).set({membershipTier:"free"}).where(eq(schema.user.id,other));
  }
  const results=await Promise.all([1,2].map(()=>resumeChatInNewConversation(db,userId,conversationId,assistantMessageId)));
  assert.equal(results[0],results[1]);
  assert.notEqual(results[0],conversationId);
  const started=await chatSnapshot(db,userId);
  assert.equal(started.conversationId,results[0]);
  assert.equal(started.messages[0].text,job.input.text);
  assert.equal(started.messages[0].createdAt,originalTime.toISOString());
  assert.deepEqual(started.messages[0].imageIds,[photo.id]);
  assert.equal(started.pendingContextQuote,undefined);
  assert.equal(started.messages[1].resumingTask,true);
  const claimed=await claimChatJob(db,"context-resume");
  assert.equal(claimed?.id,started.activeRunId);
  await executeChatJob(db,claimed!,new AbortController().signal,{
    imageLoader:async()=>assert.fail("已经处理的照片应复用"),
    fetcher:async(_url,init)=>{
      const body=String(init?.body);
      assert.match(body,/2026-11-19T15:56:00.000Z/);
      assert.match(body,/已核对菜品/);
      assert.doesNotMatch(body,/data:image/);
      return completion("已在新会话继续。");
    },
  });
  assert.equal((await chatSnapshot(db,userId)).messages.at(-1)?.text,"已在新会话继续。");
});

test("历史省略和工具明细精简分开计量，原始查询结果保留",()=>{
  const build=(messages:ProtocolMessage[])=>({messages});
  const current:ProtocolMessage[]=[{role:"user",content:"请列出每日明细。"}];
  const older:ProtocolMessage[][]=[[{role:"user",content:"最早记录"+"早".repeat(167000)}]];
  const normal=fitChatContext(build,older,current,"",()=>"",0);
  assert.equal(normal.fits,true);
  assert.equal(normal.history.length,0);
  assert.equal(normal.detailLimit,undefined);
  const records=Array.from({length:16},(_,n)=>({date:"日 "+(n+1),notes:"示".repeat(870)}));
  const tool:ProtocolMessage={role:"tool",tool_call_id:"fixture",content:JSON.stringify({records,total:16})};
  const partial=fitChatContext(build,[],[...current,tool],"x".repeat(468000),()=>"",0);
  assert.equal(partial.fits,true);
  assert.equal(partial.detailLimit,8);
  const result=JSON.parse(String(partial.body.messages.at(-1)?.content));
  assert.equal(result.records.length,8);
  assert.equal(result.total,16);
  assert.equal(result.omittedFromContext.records,8);
  assert.match(result.contextNote,/实际日期或明细范围/);
  assert.equal(JSON.parse(String(tool.content)).records.length,16);
});

test("四图自动分批，第二批失败后从检查点续跑并复用原回复", async () => {
  const images = await Promise.all(Array.from({length:4},()=>image()));
  const ids = images.map(item=>item.id);
  const text = "前两张和后两张请合起来核对，两个角度的食物只算一次。";
  const job = await begin({text,imageIds:ids});
  const read = async () => (await chatSnapshot(db,userId)).messages.at(-1)!;
  assert.deepEqual((await read()).photoProgress,{read:0,total:4,phase:"reading"});
  const imageLoader: Parameters<typeof chatImageContent>[4] = async (_db,owner,id) => {
    assert.equal(owner,userId);
    const bytes = images.find(image=>image.id===id)!.bytes;
    return {stream:new ReadableStream({start(c){c.enqueue(bytes);c.close();}}),mimeType:"image/png"};
  };
  const requested: number[][] = [];
  function verifyPhotos(init:RequestInit|undefined,expected:number[]) {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.tools,undefined);
    const content = body.messages.at(-1).content;
    assert.equal(content[0].text,text);
    const indexes=content.slice(1).map((part:{image_url:{url:string}})=>images.findIndex(item=>
      item.bytes.equals(Buffer.from(part.image_url.url.split(",").at(-1)!,"base64")))+1);
    assert.deepEqual(indexes,expected);
    requested.push(indexes);
    return body.messages[0].content as string;
  }
  let calls = 0;
  await executeChatJob(db,(await claimChatJob(db,"automatic-start"))!,new AbortController().signal,{imageLoader,fetcher:async(_url,init)=>{
    if (++calls === 1) {
      verifyPhotos(init,[1,2]);
      return completion(JSON.stringify({photos:[{number:1,notes:"照片一的烤鸡"},{number:2,notes:"照片二的标签"}]}));
    }
    assert.match(verifyPhotos(init,[3,4]),/照片一的烤鸡/);
    assert.deepEqual((await read()).photoProgress,{read:2,total:4,phase:"reading"});
    return new Response("temporary provider failure",{status:503});
  }});
  const failed = await read();
  assert.equal(failed.state,"error");
  assert.equal(failed.photoLimit,undefined);
  assert.equal(failed.contextLimited,undefined);
  assert.deepEqual(failed.photoProgress,{read:2,total:4,phase:"reading"});
  assert.equal((await chatSnapshot(db,userId)).messages.length,2);
  assert.ok(!JSON.stringify(failed).includes("照片一的烤鸡"));

  const input:ChatSend={action:"continue",requestId:randomUUID(),provider:"qwen",conversationId:job.input.conversationId,
    timezone:"Asia/Shanghai",messageId:failed.id};
  const resumed=await startChatRun(db,userId,input);
  assert.equal(resumed.row.assistantMessageId,failed.id);
  assert.equal(resumed.row.userMessageId,job.row.userMessageId);
  assert.deepEqual(resumed.row.executionInput?.photoBatch?.map(photo=>photo.imageId),ids.slice(0,2));
  assert.equal((await startChatRun(db,userId,input)).started,false);
  await assert.rejects(()=>startChatRun(db,userId,{...input,requestId:randomUUID()}),/已有回答/);
  await executeChatJob(db,(await claimChatJob(db,"automatic-resume"))!,new AbortController().signal,{imageLoader,fetcher:async(_url,init)=>{
    if (++calls === 3) {
      verifyPhotos(init,[3,4]);
      return completion(JSON.stringify({photos:[{number:3,notes:"照片三的份量"},{number:4,notes:"同一份烤鸡"}]}));
    }
    const body=JSON.parse(String(init?.body));
    assert.equal(body.messages.at(-1).content,text);
    assert.equal(body.tools.length>0,true);
    assert.doesNotMatch(JSON.stringify(body),/data:image/);
    for (const id of ids) assert.ok(body.messages[0].content.includes(id));
    assert.match(body.messages[0].content,/同一份烤鸡/);
    assert.deepEqual((await read()).photoProgress,{read:4,total:4,phase:"combining"});
    return completion("〔正文〕四张照片已一起核对，烤鸡只计算一次。");
  }});
  assert.deepEqual(requested,[[1,2],[3,4],[3,4]]);
  const complete = await read();
  assert.equal(complete.state,"complete");
  assert.equal(complete.id,failed.id);
  assert.match(complete.text,/四张照片已一起核对/);
  assert.equal((await chatSnapshot(db,userId)).messages.length,2);
  const [attempt]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.id,resumed.row.id));
  assert.deepEqual(attempt.requestDiagnostics.map(item=>[item.phase,item.images.map(image=>image.id)]),[["photos",ids.slice(2)],["answer",[]]]);
  assert.deepEqual(attempt.executionInput?.photoBatch?.map(photo=>photo.imageId),ids);
});

test("模型明确拒绝两图输入后按单张读取，汇总重试不再读取照片", async () => {
  const photos = await Promise.all([image(),image()]), ids = photos.map(photo=>photo.id);
  const job = await begin({imageIds:ids});
  let requests = 0;
  const imageLoader: Parameters<typeof chatImageContent>[4] = async (_db,_owner,id) => {
    const bytes = photos.find(photo=>photo.id===id)!.bytes;
    return {stream:new ReadableStream({start(c){c.enqueue(bytes);c.close();}}),mimeType:"image/png"};
  };
  await executeChatJob(db,(await claimChatJob(db,"auto-single"))!,new AbortController().signal,{imageLoader,fetcher:async(_url,init)=>{
    requests++;
    const body = JSON.parse(String(init?.body)), content = body.messages.at(-1).content;
    if (requests === 1) {
      assert.equal(content.length,3);
      return Response.json({error:{code:"context_length_exceeded",message:"maximum context length"}},{status:400});
    }
    if (requests <= 3) {
      assert.equal(content.length,2);
      return completion(JSON.stringify({photos:[{number:requests-1,notes:"测试照片证据"}]}));
    }
    assert.equal(typeof content,"string");
    return new Response("fixture merge unavailable",{status:503});
  }});
  const failed = (await chatSnapshot(db,userId)).messages.at(-1)!;
  assert.equal(failed.state,"error");
  assert.equal(failed.contextLimited,undefined);
  assert.deepEqual(failed.photoProgress,{read:2,total:2,phase:"combining"});
  const [released] = await db.select().from(schema.assistantUsageRequest).where(eq(schema.assistantUsageRequest.runId,job.row.id)).orderBy(schema.assistantUsageRequest.createdAt);
  assert.equal(released.state,"settled");
  assert.equal(Number(released.costCny),0);
  await startChatRun(db,userId,{action:"continue",provider:"qwen",requestId:randomUUID(),conversationId:job.input.conversationId,messageId:failed.id,timezone:"Asia/Shanghai"});
  await executeChatJob(db,(await claimChatJob(db,"auto-merge-retry"))!,new AbortController().signal,{imageLoader:async()=>assert.fail("已完成的图片不能重读"),
    fetcher:async(_url,init)=>{requests++;assert.doesNotMatch(String(init?.body),/data:image/);return completion("汇总完成");}});
  assert.equal(requests,5);
  assert.equal((await chatSnapshot(db,userId)).messages.at(-1)?.text,"汇总完成");
});
