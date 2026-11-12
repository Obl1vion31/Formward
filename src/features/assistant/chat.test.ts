import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { Database } from "../../db/client";
import { createDatabase } from "../../db/client";
import { assertChatAllowed, chatProviders } from "./chat-config";
import { budgetDate, usagePercent } from "./chat-model";
import { chatIdentity, chatSnapshot, chatUsage, controlChat, currentConversation, normalizedUsage, reserveChatUsage, settleChatUsage, startChatRun, type ChatSend, type StoredRun } from "./chat-store";
import { executeChatRun } from "./chat-runtime";
import { modelBody, providerFailure, streamModel } from "./chat-provider";
import { chatToolBridge } from "./chat-tools";
import { loadAiAccessOverview } from "../auth/ai-access-overview";
const client = new PGlite(), testDb = drizzle(client,{schema}), db = testDb as unknown as Database, ownerId = randomUUID(), outsider = randomUUID(), secondOwner = randomUUID();
const previousEnv = new Map<string,string|undefined>();
before(async () => {
  for (const [key,value] of Object.entries({FORMWARD_CHAT_ENABLED:"1",FORMWARD_CHAT_PILOT_USER_ID:ownerId,QWEN_API_KEY:"fictional-qwen",MIMO_API_KEY:"fictional-mimo",GLM_API_KEY:"fictional-glm",BETTER_AUTH_URL:"http://localhost:3000"})) { previousEnv.set(key,process.env[key]);process.env[key]=value; }
  await migrate(testDb,{migrationsFolder:"drizzle"});
  await db.insert(schema.user).values([{id:ownerId,name:"试用账号",email:"chat-owner@example.test",role:"owner"},{id:outsider,name:"普通账号",email:"chat-other@example.test",role:"user"},{id:secondOwner,name:"非指定管理账号",email:"chat-other-owner@example.test",role:"owner"}]);
});
after(async () => { await client.close(); for (const[key,value]of previousEnv)if(value===undefined)delete process.env[key];else process.env[key]=value; });
async function fresh() { await controlChat(db,ownerId,{action:"new"}); return currentConversation(db,ownerId); }
async function begin(text="查一下身体记录",provider:ChatSend["provider"]="qwen") { const current=await currentConversation(db,ownerId);const input:ChatSend={action:"send",requestId:randomUUID(),conversationId:current.id,provider,text,timezone:"Asia/Shanghai"};return {input,...await startChatRun(db,ownerId,input)}; }
async function stop(row:StoredRun){await controlChat(db,ownerId,{action:"stop",runId:row.id});}
function completion(text:string,calls?:unknown[]){return new Response("data: "+JSON.stringify({choices:[{delta:{content:text,...(calls?{tool_calls:calls}:{})},finish_reason:calls?"tool_calls":"stop"}]})+"\n\ndata: "+JSON.stringify({choices:[],usage:{prompt_tokens:100,completion_tokens:40,prompt_tokens_details:{cached_tokens:20}}})+"\n\ndata: [DONE]\n\n",{headers:{"Content-Type":"text/event-stream"}});}
test("试用资格同时校验开关、指定账号和owner；普通及其他owner不能读会话",async()=>{
  assert.throws(()=>assertChatAllowed({id:ownerId,role:"user"}));assert.throws(()=>assertChatAllowed({id:secondOwner,role:"owner"}));
  await assert.rejects(()=>chatSnapshot(db,outsider),/暂未开放/);await assert.rejects(()=>chatSnapshot(db,secondOwner),/暂未开放/);
  process.env.FORMWARD_CHAT_ENABLED="0";await assert.rejects(()=>chatSnapshot(db,ownerId),/暂未开放/);process.env.FORMWARD_CHAT_ENABLED="1";
});
test("5条分页限制在当前会话最近50条，游标不能读到旧会话或其他账号",async()=>{
  const current=await fresh();await db.insert(schema.assistantMessage).values(Array.from({length:57},(_,i)=>({id:randomUUID(),userId:ownerId,conversationId:current.id,seq:i+1,role:i%2?"assistant":"user",text:"虚构消息"+(i+1),provider:i%2?"qwen":null})));
  await db.update(schema.assistantConversation).set({sequence:57}).where(eq(schema.assistantConversation.id,current.id));
  let page=await chatSnapshot(db,ownerId),all=page.messages;assert.deepEqual(page.messages.map(row=>row.seq),[53,54,55,56,57]);
  while(page.hasMore){page=await chatSnapshot(db,ownerId,page.before!);all=[...page.messages,...all];}assert.equal(all.length,50);assert.equal(all[0].seq,8);
  assert.equal((await chatSnapshot(db,ownerId,2)).messages.length,0);await fresh();assert.equal((await chatSnapshot(db,ownerId)).messages.length,0);
});
test("切换模型不执行模型，偏好跨新对话保留，忙碌时拒绝切换",async()=>{
  await controlChat(db,ownerId,{action:"select_model",provider:"mimo"});assert.equal((await chatSnapshot(db,ownerId)).provider,"mimo");await fresh();assert.equal((await chatSnapshot(db,ownerId)).provider,"mimo");
  const job=await begin();await assert.rejects(()=>controlChat(db,ownerId,{action:"select_model",provider:"glm"}),/先停止/);await stop(job.row);
});
test("同一请求幂等，篡改内容拒绝；跨账号照片和引用拒绝",async()=>{
  await fresh();const job=await begin();const repeated=await startChatRun(db,ownerId,job.input);assert.equal(repeated.started,false);assert.equal(repeated.row.id,job.row.id);
  const reordered=await startChatRun(db,ownerId,Object.fromEntries(Object.entries(job.input).reverse()) as ChatSend);assert.equal(reordered.row.id,job.row.id);assert.equal(reordered.started,false);
  await assert.rejects(()=>startChatRun(db,ownerId,{...job.input,text:"其他内容"}),/不同内容/);await stop(job.row);
  await assert.rejects(()=>startChatRun(db,ownerId,{...job.input,requestId:randomUUID(),imageIds:[randomUUID()]}),/照片不存在/);
  await assert.rejects(()=>startChatRun(db,ownerId,{...job.input,requestId:randomUUID(),replyToId:randomUUID()}),/引用消息/);
});
test("每模型授权独立，撤销不可自动复活，续期保留旧授权来源",async()=>{
  const first=await chatIdentity(db,ownerId,"glm",true);await controlChat(db,ownerId,{action:"revoke",provider:"glm"});await assert.rejects(()=>chatIdentity(db,ownerId,"glm",true),/撤销/);
  await controlChat(db,ownerId,{action:"enable",provider:"glm"});const next=await chatIdentity(db,ownerId,"glm");assert.notEqual(next.tokenId,first.tokenId);
  const old=await db.select().from(schema.assistantConnection).where(and(eq(schema.assistantConnection.userId,ownerId),eq(schema.assistantConnection.tokenId,first.tokenId)));assert.equal(old.length,1);assert.equal(old[0].enabled,false);
  const [token]=await db.select().from(schema.aiToken).where(eq(schema.aiToken.id,first.tokenId));assert.ok(token.revokedAt);
});
test("跨模型共享预算，预占防超额，结算只计一次；未知费用继续占用",async()=>{
  await fresh();const job=await begin();const one=await reserveChatUsage(db,ownerId,job.row,.9),two=await reserveChatUsage(db,ownerId,job.row,.9);
  await assert.rejects(()=>reserveChatUsage(db,ownerId,job.row,.3),/额度不足/);
  await settleChatUsage(db,ownerId,one,{prompt_tokens:1000000,completion_tokens:0});await settleChatUsage(db,ownerId,one,{prompt_tokens:1,completion_tokens:1});await settleChatUsage(db,ownerId,two,null);
  const usage=await chatUsage(db,ownerId);assert.equal(usage.spent,.8);assert.equal(usage.uncertain,.9);assert.ok(usage.available<.301);assert.equal(usage.percent,"40%");
  await stop(job.row);await db.delete(schema.assistantUsageRequest).where(eq(schema.assistantUsageRequest.userId,ownerId));
});
test("百分比、缓存与思考计费、跨北京时间零点归属",()=>{
  assert.equal(usagePercent(0,2),"0%");assert.equal(usagePercent(.001,2),"<1%");assert.equal(usagePercent(1.9999,2),"99%");assert.equal(usagePercent(2.1,2),"105%");
  assert.equal(normalizedUsage({prompt_tokens:1000,completion_tokens:100,prompt_tokens_details:{cached_tokens:500},completion_tokens_details:{reasoning_tokens:80}},chatProviders.qwen.rates),.00072);
  assert.equal(normalizedUsage({prompt_tokens:-1,completion_tokens:20},chatProviders.qwen.rates),null);
  assert.equal(budgetDate(new Date("2026-11-12T15:59:59Z")),"2026-11-12");assert.equal(budgetDate(new Date("2026-11-12T16:00:00Z")),"2026-11-13");
});
test("流式分片组装工具参数，usage独立尾包，私有思考不作为正文",async()=>{
  let text="",usage:unknown;const stream="data: "+JSON.stringify({choices:[{delta:{reasoning_content:"私有推理",tool_calls:[{index:0,id:"call",function:{name:"query_",arguments:'{"range":'}}]}}]})+"\n\ndata: "+JSON.stringify({choices:[{delta:{content:"真实正文",tool_calls:[{index:0,function:{name:"measurements",arguments:'"last7"}'}}]},finish_reason:"tool_calls"}]})+"\n\ndata: "+JSON.stringify({choices:[],usage:{prompt_tokens:10,completion_tokens:20}})+"\n\n";
  const bytes=new TextEncoder().encode(stream),result=await streamModel("qwen",{},new AbortController().signal,async value=>{text+=value;},async value=>{usage=value;},async()=>new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}),{headers:{"Content-Type":"text/event-stream"}}));
  assert.equal(text,"真实正文");assert.equal(result.calls[0].function.name,"query_measurements");assert.deepEqual(JSON.parse(result.calls[0].function.arguments),{range:"last7"});assert.ok(usage);
  assert.equal((modelBody("glm",[],[]) as Record<string,unknown>).max_tokens,8192);assert.equal((modelBody("mimo",[],[]) as Record<string,unknown>).max_completion_tokens,8192);
  assert.equal(providerFailure(403,{error:{message:"insufficient balance"}}).code,"provider_balance");assert.equal(providerFailure(429,{}).code,"provider_rate_limit");assert.equal(providerFailure(503,{}).code,"provider_unavailable");
  assert.equal(providerFailure(429,{error:{code:"insufficient_quota"}}).code,"provider_quota");
});
test("真实MCP按需调用身体查询，三模型来源固定且无健康写入",async()=>{
  for(const provider of ["qwen","mimo","glm"] as const){await fresh();const job=await begin("最近7天体重怎么样",provider);let round=0;const events:unknown[]=[];
    await executeChatRun(db,job.row,job.input,new Request("http://localhost:3000/api/assistant-chat"),event=>events.push(event),new AbortController().signal,{skipSessionCheck:true,fetcher:async(_url,options)=>{const body=JSON.parse(String(options?.body));assert.equal(body.model,chatProviders[provider].model);round++;return round===1?completion("",[{index:0,id:"load",function:{name:"load_tools",arguments:JSON.stringify({names:["query_measurements"]})}}]):round===2?completion("",[{index:0,id:"query",function:{name:"query_measurements",arguments:JSON.stringify({range:"last7",view:"summary",timezone:"Asia/Shanghai"})}}]):completion("最近7天没有实测记录，缺测保持为空。");}});
    const snapshot=await chatSnapshot(db,ownerId),answer=snapshot.messages.at(-1)!;assert.equal(answer.provider,provider);assert.equal(answer.state,"complete");assert.ok(answer.steps.some(step=>step.name==="query_measurements"&&step.state==="complete"));assert.equal(round,3);assert.ok(events.length>2);
  }
  assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.userId,ownerId))).length,0);
});
test("明确补充状态由控制工具生成，不需要第二个核验模型",async()=>{
  await fresh();const job=await begin("午饭米饭150克和鸡胸肉，帮我记录");let calls=0;
  await executeChatRun(db,job.row,job.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{calls++;return completion("",[{index:0,id:"followup",function:{name:"request_followup",arguments:JSON.stringify({subject:"今天午餐实际食量",question:"鸡胸肉实际吃了多少？米饭150克已保留。"})}}]);}});
  assert.equal(calls,1);assert.match((await chatSnapshot(db,ownerId)).followup!.question,/150克/);assert.equal((await chatSnapshot(db,ownerId)).messages.at(-1)!.text,"鸡胸肉实际吃了多少？米饭150克已保留。");
});
test("真实预览不保存事实，来源依原授权追溯，续期不改旧来源",async()=>{
  await fresh();const job=await begin("米饭150克，生成午餐预览");let round=0;
  await executeChatRun(db,job.row,job.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{round++;return round===1?completion("",[{index:0,id:"load",function:{name:"load_tools",arguments:JSON.stringify({names:["preview_meal"]})}}]):round===2?completion("",[{index:0,id:"meal",function:{name:"preview_meal",arguments:JSON.stringify({operationId:"test-preview-operation",date:"today",mealType:"午餐",timezone:"Asia/Shanghai",foods:[{name:"米饭",quantity:"150",unit:"g",caloriesKcal:"195",proteinG:"3.9",carbsG:"43",fatG:"0.5",sourceKind:"estimated",basis:"虚构验收估算"}]})}}]):completion("已生成预览，请在网页确认保存。");}});
  const snapshot=await chatSnapshot(db,ownerId);assert.ok(snapshot.messages.at(-1)!.references.some(ref=>ref.kind==="preview"));assert.equal((await db.select().from(schema.meal).where(eq(schema.meal.userId,ownerId))).length,0);
  let overview=await loadAiAccessOverview(db,ownerId);assert.ok(overview.submissions.some(item=>item.source.label==="千问 · 站内助手"));assert.equal(overview.tokens.length,0);
  await controlChat(db,ownerId,{action:"revoke",provider:"qwen"});await controlChat(db,ownerId,{action:"enable",provider:"qwen"});overview=await loadAiAccessOverview(db,ownerId);assert.ok(overview.submissions.some(item=>item.source.label==="千问 · 站内助手"));
});
test("国服站内预览保留入口验证及同一确认链接，缺少来源验证时不创建草稿",async()=>{
  const settings={FORMWARD_REGIONAL:"1",FORMWARD_CN_ORIGIN:"https://43.142.148.58",BETTER_AUTH_URL:"https://formward-ten.vercel.app"}, previous=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));
  for(const[key,value]of Object.entries(settings))process.env[key]=value;
  const identity=await chatIdentity(db,ownerId,"qwen");
  let bridge:ReturnType<typeof chatToolBridge>|undefined;
  try {
    const before=(await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.userId,ownerId))).length;
    assert.throws(()=>chatToolBridge(db,identity,new Request("https://43.142.148.58/api/assistant-chat")),/来源尚未验证/);
    assert.equal((await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.userId,ownerId))).length,before);
    const request=new Request("https://origin.formward.top/api/assistant-chat",{headers:{"x-formward-public-origin":"https://43.142.148.58","x-formward-region":"cn"}});
    bridge=chatToolBridge(db,identity,request);
    await bridge.rpc("initialize",{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"fictional-regional-chat",version:"1"}});
    const params={name:"preview_meal",arguments:{operationId:randomUUID(),date:"2024-08-01",mealType:"午餐",timezone:"Asia/Shanghai",foods:[{name:"虚构米饭",quantity:"150",unit:"g",caloriesKcal:"195",proteinG:"3.9",carbsG:"43",fatG:"0.5",sourceKind:"estimated",basis:"隔离来源验证"}]}};
    const first=await bridge.rpc("tools/call",params),again=await bridge.rpc("tools/call",params);
    assert.notEqual(first.isError,true);assert.match(first.structuredContent.confirmationUrl,/^https:\/\/43\.142\.148\.58\/dashboard\/meals\/review\//);
    assert.equal(again.structuredContent.confirmationUrl,first.structuredContent.confirmationUrl);
    assert.equal((await db.select().from(schema.mealOperation).where(eq(schema.mealOperation.userId,ownerId))).length,before+1);
    assert.equal((await db.select().from(schema.meal).where(eq(schema.meal.userId,ownerId))).length,0);
  } finally {await bridge?.close();for(const[key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test("跨模型可读历史保持原文，导航定位元数据不冒充助手正文",async()=>{
  const current=await fresh(),userMessageId=randomUUID(),answerId=randomUUID(),href="/dashboard/meals/review/"+randomUUID();
  await db.insert(schema.assistantMessage).values([{id:userMessageId,userId:ownerId,conversationId:current.id,seq:1,role:"user",text:"查一下昨天的记录"},{id:answerId,userId:ownerId,conversationId:current.id,seq:2,role:"assistant",provider:"qwen",text:"已查到记录，正式保存仍需你确认。",references:[{href,kind:"preview",title:"查看提交"}]}]);
  await db.update(schema.assistantConversation).set({sequence:2}).where(eq(schema.assistantConversation.id,current.id));
  const job=await begin("继续解释这条记录","mimo");
  await executeChatRun(db,job.row,job.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async(_url,options)=>{
    const body=JSON.parse(String(options?.body)),history=body.messages.find((row:{role:string})=>row.role==="assistant");
    assert.equal(history.content,"已查到记录，正式保存仍需你确认。");
    assert.ok(body.messages[0].content.includes(href));assert.ok(body.messages[0].content.includes("不属于用户或助手的原话"));
    assert.equal(body.messages.filter((row:{role:string;content:unknown})=>row.role!=="system"&&JSON.stringify(row.content).includes(href)).length,0);
    return completion("我会按原记录说明，保存仍由你确认。");
  }});
  const [saved]=await db.select().from(schema.assistantMessage).where(eq(schema.assistantMessage.id,answerId));assert.equal(saved.provider,"qwen");assert.equal(saved.text,"已查到记录，正式保存仍需你确认。");
});

test("正式PostgreSQL驱动支持会话读取、过期运行回收与发送限流日期",async()=>{
  await fresh();const socket=new PGLiteSocketServer({db:client,host:"127.0.0.1",port:0,maxConnections:1});await socket.start();
  const connection=createDatabase(`postgresql://postgres:postgres@${socket.getServerConn()}/postgres?max=1`);
  try {
    const snapshot=await chatSnapshot(connection.db,ownerId);
    const input:ChatSend={action:"send",requestId:randomUUID(),conversationId:snapshot.conversationId,provider:"qwen",text:"虚构驱动回归",timezone:"Asia/Shanghai"};
    const job=await startChatRun(connection.db,ownerId,input);
    await connection.db.update(schema.assistantRun).set({heartbeatAt:new Date(Date.now()-160000)}).where(eq(schema.assistantRun.id,job.row.id));
    const restored=await chatSnapshot(connection.db,ownerId);assert.equal(restored.activeRunId,null);assert.equal(restored.messages.at(-1)!.state,"stopped");
    const concurrent=await Promise.allSettled([startChatRun(connection.db,ownerId,{...input,requestId:randomUUID()}),startChatRun(connection.db,ownerId,{...input,requestId:randomUUID()})]);assert.equal(concurrent.filter(row=>row.status==="fulfilled").length,1);assert.equal(concurrent.filter(row=>row.status==="rejected").length,1);const active=await chatSnapshot(connection.db,ownerId);await controlChat(connection.db,ownerId,{action:"stop",runId:active.activeRunId!});
  } finally {await connection.close();await socket.stop();}
});
test("平台明确拒绝释放预占，中断未知保留；跨日结算仍计入请求开始日",async()=>{
  await fresh();const job=await begin(),first=await reserveChatUsage(db,ownerId,job.row,.04),second=await reserveChatUsage(db,ownerId,job.row,.05);
  await settleChatUsage(db,ownerId,first,null,402);await settleChatUsage(db,ownerId,second,null);
  const ledger=await db.select().from(schema.assistantUsageRequest).where(eq(schema.assistantUsageRequest.runId,job.row.id));
  assert.equal(ledger.find(row=>row.id===first)!.costCny,"0.00000000");assert.equal(ledger.find(row=>row.id===second)!.state,"unknown");
  const past=await reserveChatUsage(db,ownerId,job.row,.05);await db.update(schema.assistantUsageRequest).set({date:"2026-11-11"}).where(eq(schema.assistantUsageRequest.id,past));await settleChatUsage(db,ownerId,past,{prompt_tokens:1000,completion_tokens:0});
  assert.equal((await chatUsage(db,ownerId,new Date("2026-11-11T04:00:00Z"))).spent,.0008);await stop(job.row);
});
test("跨模型重试保留旧尝试及预览，只生成一条用户消息且不重复提交",async()=>{
  await fresh();const first=await begin("米饭150克，生成预览");let round=0;
  const args={operationId:"any",date:"today",mealType:"午餐",timezone:"Asia/Shanghai",foods:[{name:"米饭",quantity:"150",unit:"g",caloriesKcal:"195",proteinG:"3.9",carbsG:"43",fatG:"0.5",sourceKind:"estimated",basis:"虚构重试验收"}]};
  await executeChatRun(db,first.row,first.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{round++;if(round===3)throw new TypeError("fixture interruption");return round===1?completion("",[{index:0,id:"load",function:{name:"load_tools",arguments:'{"names":["preview_meal"]}'}}]):completion("",[{index:0,id:"preview",function:{name:"preview_meal",arguments:JSON.stringify(args)}}]);}});
  const failed=(await chatSnapshot(db,ownerId)).messages.at(-1)!;assert.equal(failed.state,"error");const preview=failed.references.find(ref=>ref.kind==="preview")!;assert.ok(preview);
  const input:ChatSend={...first.input,action:"retry",provider:"mimo",requestId:randomUUID(),messageId:failed.id};const second=await startChatRun(db,ownerId,input);round=0;
  await executeChatRun(db,second.row,input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{round++;return round===1?completion("",[{index:0,id:"load2",function:{name:"load_tools",arguments:'{"names":["preview_meal"]}'}}]):round===2?completion("",[{index:0,id:"preview2",function:{name:"preview_meal",arguments:JSON.stringify({...args,operationId:"different",foods:[{...args.foods[0],quantity:"200"}]})}}]):completion("沿用已有预览，等待网页确认。");}});
  const messages=(await chatSnapshot(db,ownerId)).messages;assert.equal(messages.filter(row=>row.role==="user").length,1);assert.equal(messages.filter(row=>row.role==="assistant").length,2);assert.equal(messages[1].provider,"qwen");assert.equal(messages[2].provider,"mimo");assert.equal(messages[2].references.find(ref=>ref.kind==="preview")!.href,preview.href);
  const outcomes=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.userMessageId,first.row.userMessageId));assert.equal(outcomes.reduce((sum,row)=>sum+row.toolResults.filter(tool=>tool.name==="preview_meal").length,0),1);
  assert.equal((await db.select().from(schema.meal).where(eq(schema.meal.userId,ownerId))).length,0);
});
test("到期与在途撤销阻止后续工具，不能自动续期或复活旧授权",async()=>{
  const identity=await chatIdentity(db,ownerId,"glm",true);await db.update(schema.aiToken).set({expiresAt:new Date(Date.now()-1000)}).where(eq(schema.aiToken.id,identity.tokenId));
  await assert.rejects(()=>chatIdentity(db,ownerId,"glm",true));await controlChat(db,ownerId,{action:"enable",provider:"glm"});
  await fresh();const job=await begin("查实测","glm");let calls=0;
  await executeChatRun(db,job.row,job.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{calls++;await controlChat(db,ownerId,{action:"revoke",provider:"glm"});return completion("",[{index:0,id:"load",function:{name:"load_tools",arguments:'{"names":["query_measurements"]}'}}]);}});
  assert.equal(calls,1);assert.equal((await chatSnapshot(db,ownerId)).activeRunId,null);assert.equal((await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.id,job.row.id)))[0].toolResults.length,0);
});
test("已有的其他账号消息、图片和运行不能被指定管理员借用",async()=>{
  const conversationId=randomUUID(),messageId=randomUUID(),imageId=randomUUID();
  await db.insert(schema.assistantConversation).values({id:conversationId,userId:outsider});await db.insert(schema.assistantMessage).values({id:messageId,userId:outsider,conversationId,seq:1,role:"user",text:"不能被读取的另一账号消息"});
  await db.insert(schema.mealImage).values({id:imageId,userId:outsider,pathname:"meal-formal-v2/"+outsider+"/private.png",sha256:"a".repeat(64),mimeType:"image/png",byteSize:64,fileName:"其他账号私有图片.png",source:"manual",createdBy:outsider});
  const current=await fresh(),input:ChatSend={action:"send",requestId:randomUUID(),provider:"qwen",conversationId:current.id,text:"查询",timezone:"Asia/Shanghai"};
  await assert.rejects(()=>startChatRun(db,ownerId,{...input,replyToId:messageId}),/引用消息/);await assert.rejects(()=>startChatRun(db,ownerId,{...input,imageIds:[imageId]}),/照片不存在/);await assert.rejects(()=>startChatRun(db,ownerId,{...input,conversationId}),/会话已变化/);
  assert.equal((await chatSnapshot(db,ownerId)).messages.length,0);
});
test("模型回合上限和过长上下文明确停止，不隐式重试或丢失原消息",async()=>{
  await fresh();const job=await begin("有限回合");let calls=0;
  await executeChatRun(db,job.row,job.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{calls++;return completion("",[{index:0,id:"load-"+calls,function:{name:"load_tools",arguments:'{"names":["query_measurements"]}'}}]);}});
  assert.equal(calls,8);assert.equal((await chatSnapshot(db,ownerId)).messages.at(-1)!.state,"truncated");
  const current=await fresh();await db.insert(schema.assistantMessage).values([{id:randomUUID(),userId:ownerId,conversationId:current.id,seq:1,role:"user",text:"虚构长内容".repeat(18000)},{id:randomUUID(),userId:ownerId,conversationId:current.id,seq:2,role:"assistant",provider:"qwen",text:"虚构长答复".repeat(18000)}]);await db.update(schema.assistantConversation).set({sequence:2}).where(eq(schema.assistantConversation.id,current.id));
  const long=await begin("继续查询");calls=0;await executeChatRun(db,long.row,long.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{calls++;return completion("不应发出");}});const snapshot=await chatSnapshot(db,ownerId);assert.equal(calls,0);assert.match(snapshot.messages.at(-1)!.error!,/上下文或照片/);assert.equal(snapshot.messages[0].text.length,90000);
});
test("跨模型继承的回执保留原授权，撤销后不借新授权复活旧预览",async()=>{
  await db.update(schema.assistantRun).set({createdAt:new Date(Date.now()-61000)}).where(eq(schema.assistantRun.userId,ownerId));
  await fresh();const first=await begin("米饭150克，生成午餐预览"),args={operationId:"receipt-origin",date:"today",mealType:"午餐",timezone:"Asia/Shanghai",foods:[{name:"米饭",quantity:"150",unit:"g",caloriesKcal:"195",proteinG:"3.9",carbsG:"43",fatG:"0.5",sourceKind:"estimated",basis:"虚构授权回归"}]};let round=0;
  const tool=(name:string,args:unknown)=>completion("",[{index:0,id:"step-"+round,function:{name,arguments:JSON.stringify(args)}}]);
  await executeChatRun(db,first.row,first.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{round++;if(round===3)throw Error("fixture interruption");return round===1?tool("load_tools",{names:["preview_meal"]}):tool("preview_meal",args);}});
  const original=(await chatSnapshot(db,ownerId)).messages.at(-1)!,oldId=original.references.find(ref=>ref.kind==="preview")!.operationId!;
  const retry:ChatSend={...first.input,action:"retry",provider:"mimo",requestId:randomUUID(),messageId:original.id};const second=await startChatRun(db,ownerId,retry);round=0;
  await executeChatRun(db,second.row,retry,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>{round++;if(round===4)throw Error("fixture interruption");return round===1?tool("load_tools",{names:["query_measurements","preview_meal"]}):round===2?tool("query_measurements",{range:"last7",view:"summary",timezone:"Asia/Shanghai"}):tool("preview_meal",args);}});
  const [run]=await db.select().from(schema.assistantRun).where(eq(schema.assistantRun.id,second.row.id));assert.ok(run.toolResults.some(result=>result.name==="preview_meal"&&result.tokenId!==run.tokenId));
  await controlChat(db,ownerId,{action:"revoke",provider:"qwen"});const thirdInput={...retry,requestId:randomUUID()},third=await startChatRun(db,ownerId,thirdInput);round=0;
  await executeChatRun(db,third.row,thirdInput,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async(_url,options)=>{round++;assert.equal(String(options?.body).includes(oldId),false);return round===1?tool("load_tools",{names:["preview_meal"]}):round===2?tool("preview_meal",args):completion("新授权生成独立预览，原失效预览不再使用。");}});
  const answer=(await chatSnapshot(db,ownerId)).messages.at(-1)!;assert.equal(answer.state,"complete");assert.notEqual(answer.references.find(ref=>ref.kind==="preview")!.operationId,oldId);assert.equal((await db.select().from(schema.meal).where(eq(schema.meal.userId,ownerId))).length,0);
});
test("跨模型继续携带原回答正文，保留旧尝试且不再添加用户问题",async()=>{
  await db.update(schema.assistantRun).set({createdAt:new Date(Date.now()-61000)}).where(eq(schema.assistantRun.userId,ownerId));await controlChat(db,ownerId,{action:"enable",provider:"qwen"});await fresh();const first=await begin("说明这次查询");
  await executeChatRun(db,first.row,first.input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async()=>new Response((await completion("第一段。").text()).replace('"finish_reason":"stop"','"finish_reason":"length"'),{headers:{"Content-Type":"text/event-stream"}})});
  const original=(await chatSnapshot(db,ownerId)).messages.at(-1)!;assert.equal(original.state,"truncated");const input:ChatSend={...first.input,action:"continue",messageId:original.id,provider:"mimo",requestId:randomUUID()},next=await startChatRun(db,ownerId,input);
  await executeChatRun(db,next.row,input,new Request("http://localhost:3000/api/assistant-chat"),()=>{},new AbortController().signal,{skipSessionCheck:true,fetcher:async(_url,options)=>{assert.ok(String(options?.body).includes("已经生成：第一段。"));return completion("第二段。");}});
  const messages=(await chatSnapshot(db,ownerId)).messages;assert.equal(messages.filter(row=>row.role==="user").length,1);assert.equal(messages[1].text,"第一段。");assert.equal(messages[1].provider,"qwen");assert.equal(messages[2].text,"第二段。");assert.equal(messages[2].provider,"mimo");
});
