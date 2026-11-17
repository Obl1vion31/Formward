import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import type { Database } from "../../db/client";
import { loadAdminConsole,loadAdminDay } from "./queries";
import { changeUserAiPolicy } from "./policy";
import { normalizeAdminFilter, adminMoney } from "./model";
import { securityDay } from "../auth/security-usage";
import { boundedSecurityJson, pageSecurity } from "../auth/http-security";
import { eq } from "drizzle-orm";

test("管理员统计只输出元数据，精确费用、策略幂等与普通账号拒绝", async () => {
  const pg=new PGlite(), connection=drizzle(pg,{schema}),db=connection as unknown as Database;
  try{
    await migrate(connection,{migrationsFolder:"drizzle"});
    const id=randomUUID(), other=randomUUID(),sid=randomUUID(),today=securityDay();
    await db.insert(schema.user).values([{id,name:"虚构管理员",email:"admin-console@example.test",role:"owner"},{id:other,name:"虚构普通账号",email:"ordinary-console@example.test"}]);
    await db.insert(schema.session).values({id:sid,userId:id,token:randomUUID(),expiresAt:new Date(Date.now()+600000),adminVerifiedAt:new Date(),securityVerifiedAt:new Date()});
    const proof={userId:id,sessionId:sid,accessVersion:0};
    const value=await loadAdminConsole(db,proof,{from:today,to:today});
    assert.equal(value.users.length,2);assert.equal(value.totals.spent,"0");assert.equal(value.global.limit,10);
    const initialUser=value.users.find(person=>person.id===other)!;
    assert.equal(initialUser.defaultDailyBudget,null);assert.equal(initialUser.defaultDailyRecognitionLimit,4);
    assert.ok(!JSON.stringify(value).includes("backupCodes"));assert.ok(!JSON.stringify(value).includes("weightKg"));
    await assert.rejects(loadAdminConsole(db,{...proof,userId:other}),/登录已失效/);
    const input={userId:other,paused:true,dailyBudgetCents:50,dailyRecognitionLimit:2,version:0,requestId:randomUUID(),reason:"虚构配额验收"};
    assert.equal((await changeUserAiPolicy(db,proof,input)).repeated,false);assert.equal((await changeUserAiPolicy(db,proof,input)).repeated,true);
    await assert.rejects(changeUserAiPolicy(db,proof,{...input,requestId:randomUUID()}),/权益已变化/);
    const updated=await loadAdminConsole(db,proof,{from:today,to:today,userId:other});
    assert.equal(updated.users[0].aiPaused,true);assert.equal(updated.users[0].dailyBudget,.5);assert.equal(updated.users[0].dailyRecognitionLimit,2);
    assert.equal(updated.users[0].defaultDailyBudget,null);assert.equal(updated.users[0].defaultDailyRecognitionLimit,4);
    assert.equal(adminMoney("0.00000001"),"小于0.0001");assert.throws(()=>normalizeAdminFilter({from:"2026-02-31",to:today}));
  }finally{await pg.close();}
});

test("北京时间跨午夜、精确小额、失败未知、多轮请求与停用用户筛选可核对",async()=>{
 const pg=new PGlite(),connection=drizzle(pg,{schema}),db=connection as unknown as Database;
 try{
  await migrate(connection,{migrationsFolder:"drizzle"});
  const actor=randomUUID(),person=randomUUID(),sid=randomUUID(),conversationId=randomUUID(),question=randomUUID(),answer=randomUUID(),run=randomUUID();
  await db.insert(schema.user).values([{id:actor,name:"虚构owner",email:"ledger-owner@example.test",role:"owner"},{id:person,name:"虚构停用用户",email:"ledger-person@example.test",banned:true}]);
  await db.insert(schema.session).values({id:sid,userId:actor,token:randomUUID(),expiresAt:new Date(Date.now()+600000),adminVerifiedAt:new Date()});
  const proof={userId:actor,sessionId:sid,accessVersion:0};
  await db.insert(schema.assistantConversation).values({id:conversationId,userId:person,active:false,purpose:"chat"});
  await db.insert(schema.assistantMessage).values([{id:question,userId:person,conversationId,seq:1,role:"user",text:"不可返回的虚构聊天正文",createdAt:new Date("2024-01-01T16:00:00Z")},{id:answer,userId:person,conversationId,seq:2,role:"assistant"}]);
  await db.insert(schema.assistantRun).values({id:run,userId:person,conversationId,userMessageId:question,assistantMessageId:answer,provider:"qwen",model:"fictional",requestId:randomUUID(),requestDigest:"fictional",state:"complete",createdAt:new Date("2024-01-01T16:00:00Z")});
  for(const [date,state,cost,usage]of [["2024-01-01","settled","0.00000001",{prompt_tokens:11,completion_tokens:3,prompt_tokens_details:{cached_tokens:5}}],["2024-01-02","settled","0.00000002",{prompt_tokens:7,completion_tokens:2}],["2024-01-02","unknown",null,null],["2024-01-02","reserved",null,null]]as const){await db.insert(schema.assistantUsageRequest).values({id:randomUUID(),userId:person,runId:run,provider:"qwen",date,state,costCny:cost,reservedCny:".01",usage,rates:{input:1,cachedInput:.1,output:2}});}
  await db.insert(schema.meal).values({id:randomUUID(),userId:person,localDate:"2023-12-01",mealType:"晚餐",source:"manual",notes:"不可返回的虚构餐食正文",createdAt:new Date("2024-01-01T16:00:00Z")});
  const first=await loadAdminConsole(db,proof,{from:"2024-01-01",to:"2024-01-01",userId:person});assert.equal(first.tasks.count,0);assert.equal(first.records.find(r=>r.kind==="餐次")?.added,0);
  const all=await loadAdminConsole(db,proof,{from:"2024-01-01",to:"2024-01-02",userId:person,provider:"qwen",purpose:"chat"});
  assert.equal(all.totals.spent,"0.00000003");assert.equal(all.tasks.count,1);assert.equal(all.totals.requests,4);assert.equal(all.totals.input,"18");assert.equal(all.totals.cached,"5");assert.equal(all.totals.output,"5");assert.equal(all.totals.unknownUsage,2);assert.equal(all.users[0].banned,true);assert.equal(all.records.find(r=>r.kind==="餐次")?.added,1);
  assert.equal(Number(all.totals.reserved),.01);assert.equal(Number(all.totals.uncertain),.01);assert.equal(adminMoney(all.totals.spent),"小于0.0001");assert.ok(!JSON.stringify(all).includes("虚构聊天正文"));assert.ok(!JSON.stringify(all).includes("虚构餐食正文"));
  const filtered=await loadAdminConsole(db,proof,{from:"2024-01-01",to:"2024-01-02",provider:"mimo"});assert.equal(filtered.totals.requests,0);assert.equal(filtered.tasks.count,0);
  const extraRun=randomUUID();await db.insert(schema.assistantRun).values({id:extraRun,userId:person,conversationId,userMessageId:question,assistantMessageId:answer,provider:"qwen",model:"fictional-other",requestId:randomUUID(),requestDigest:"fixture",state:"complete"});
  await db.insert(schema.assistantUsageRequest).values({id:randomUUID(),userId:person,runId:extraRun,provider:"qwen",date:"2024-01-02",state:"settled",costCny:".125",reservedCny:".2",usage:{prompt_tokens:50,completion_tokens:10},rates:{input:1,cachedInput:0,output:1}});
  const modelDay=await loadAdminDay(db,proof,{from:"2024-01-02",to:"2024-01-02",userId:person},{dimension:"models",page:1});assert.equal(modelDay.count,2);assert.equal(modelDay.total.spent,"0.12500002");assert.equal(modelDay.rows.find(r=>r.label==="fictional")?.unknownUsage,2);
  const exactModel=await loadAdminConsole(db,proof,{from:"2024-01-02",to:"2024-01-02",model:"fictional-other",provider:"qwen"});assert.equal(exactModel.totals.spent,"0.12500000");assert.equal(exactModel.totals.requests,1);assert.equal(exactModel.tasks.count,1);assert.equal(exactModel.highlights.models.length,1);assert.equal(exactModel.highlights.models[0].label,"fictional-other");
  const userDay=await loadAdminDay(db,proof,{from:"2024-01-02",to:"2024-01-02",model:"fictional-other"},{dimension:"users",page:1});assert.equal(userDay.rows[0].key,person);assert.equal(userDay.total.spent,exactModel.totals.spent);assert.equal(userDay.rows[0].spent,exactModel.highlights.models[0].spent);
  await db.update(schema.session).set({adminVerifiedAt:new Date(Date.now()-300001)}).where(eq(schema.session.id,sid));await assert.rejects(loadAdminConsole(db,proof),/再次输入密码/);
 }finally{await pg.close();}
});

test("CSP使用nonce并禁止嵌入；无长度头的JSON流也受边界限制",async()=>{
 const policy=pageSecurity("fictional-nonce",false);assert.match(policy,/nonce-fictional-nonce/);assert.match(policy,/frame-ancestors 'none'/);assert.ok(!policy.includes("unsafe-eval"));
 await assert.rejects(boundedSecurityJson(new Request("https://example.test",{method:"POST",body:'{"oversized":"'+"x".repeat(9000)+'"}'})),/请求过大/);
 await assert.rejects(boundedSecurityJson(new Request("https://example.test",{method:"POST",body:"{"})),/请求内容无效/);
 assert.deepEqual(await boundedSecurityJson(new Request("https://example.test",{method:"POST",body:'{"step":"prepare"}'})),{step:"prepare"});
});
