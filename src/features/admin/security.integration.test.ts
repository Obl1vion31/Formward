import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase, type Database } from "../../db/client";
import * as s from "../../db/schema";
import { reserveChatUsage, settleChatUsage } from "../assistant/chat-store";
import { globalBudget } from "../assistant/global-budget";
import { securityDay, reserveImageQuota, completeImageQuota, consumeSecurityRate } from "../auth/security-usage";
import { assertPendingCapacity } from "../records/pending-limit";
import { loadAdminConsole } from "./queries";
import { changeUserAiPolicy } from "./policy";
import { accountEntitlements } from "../auth/entitlements";

async function task(db:Database,userId:string,provider="qwen",purpose="chat"){
  const conversationId=randomUUID(),question=randomUUID(),answer=randomUUID();
  await db.insert(s.assistantConversation).values({id:conversationId,userId,provider,active:false,purpose});
  await db.insert(s.assistantMessage).values([{id:question,userId,conversationId,seq:1,role:"user",text:"虚构内容，不得进入管理响应"},{id:answer,userId,conversationId,seq:2,role:"assistant"}]);
  const [run]=await db.insert(s.assistantRun).values({id:randomUUID(),userId,conversationId,userMessageId:question,assistantMessageId:answer,requestId:randomUUID(),requestDigest:"fictional",provider,model:"fictional-model"}).returning();return run;
}

test("原生PostgreSQL：并发全站预算、个人额度、暂停、精确统计及资源原子配额",{skip:!process.env.FORMWARD_TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.FORMWARD_TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1","localhost"].includes(url.hostname)&&url.pathname==="/formward_security_test","只允许专用回环虚构测试库");
  const connection=createDatabase(url.href),db=connection.db;
  const previousChat=process.env.FORMWARD_CHAT_ENABLED;process.env.FORMWARD_CHAT_ENABLED="1";
  try{
    await migrate(db,{migrationsFolder:"drizzle"});
    // 专用可重建测试库，无生产连接和用户数据。
    await db.execute(sql`TRUNCATE users CASCADE`);
    await db.delete(s.rateLimit);await db.delete(s.securityEvent);
    const owner=randomUUID(),a=randomUUID(),b=randomUUID(),c=randomUUID(),sid=randomUUID(),today=securityDay();
    await db.insert(s.user).values([{id:owner,name:"虚构管理员",email:"owner-native@example.test",role:"owner"},...[a,b,c].map((id,i)=>({id,name:"虚构预算用户",email:`native-${i}@example.test`,membershipTier:"beta" as const,aiDailyBudgetCents:1000}))]);
    await db.insert(s.session).values({id:sid,userId:owner,token:randomUUID(),expiresAt:new Date(Date.now()+600000),adminVerifiedAt:new Date(),securityVerifiedAt:new Date()});
    const proof={userId:owner,sessionId:sid,accessVersion:0};
    const runs=await Promise.all([a,b,c].map(id=>task(db,id)));
    const race=await Promise.allSettled(runs.map(run=>reserveChatUsage(db,run.userId,run,6)));
    assert.equal(race.filter(r=>r.status==="fulfilled").length,1);
    assert.equal((await globalBudget(db)).available,4);
    const winner=race.findIndex(r=>r.status==="fulfilled"),id=(race[winner] as PromiseFulfilledResult<string>).value;
    await settleChatUsage(db,runs[winner].userId,id,null);
    assert.equal(Number((await globalBudget(db)).uncertain),6);
    const loser=(winner+1)%3,extra=await reserveChatUsage(db,runs[loser].userId,runs[loser],4);
    await assert.rejects(reserveChatUsage(db,runs[(winner+2)%3].userId,runs[(winner+2)%3],.0001),/全站/);
    await settleChatUsage(db,runs[winner].userId,id,{prompt_tokens:1000,completion_tokens:100,prompt_tokens_details:{cached_tokens:500}});
    assert.equal(Number((await globalBudget(db)).spent),.00072);
    await settleChatUsage(db,runs[loser].userId,extra,null,429);
    const visible=await loadAdminConsole(db,proof,{from:today,to:today});
    assert.equal(visible.totals.spent,"0.00072000");assert.equal(visible.totals.requests,2);assert.equal(visible.totals.input,"1000");assert.equal(visible.totals.cached,"500");assert.equal(visible.totals.unknownUsage,1);
    assert.ok(!JSON.stringify(visible).includes("虚构内容，不得进入管理响应"));
    const change={userId:a,paused:true,dailyBudgetCents:0,dailyRecognitionLimit:0,version:0,requestId:randomUUID(),reason:"虚构暂停验收"};
    const changes=await Promise.allSettled([changeUserAiPolicy(db,proof,change),changeUserAiPolicy(db,proof,{...change,requestId:randomUUID(),dailyBudgetCents:100})]);
    assert.equal(changes.filter(r=>r.status==="fulfilled").length,1);
    const [paused]=await db.select().from(s.user).where(eq(s.user.id,a));assert.ok(paused.aiPaused);assert.equal((await db.select().from(s.assistantRun).where(eq(s.assistantRun.id,runs[0].id)))[0].state,"stopped");
    await assert.rejects(reserveChatUsage(db,a,runs[0],.01),/暂未开放|不可用/);
    await changeUserAiPolicy(db,proof,{...change,paused:false,dailyBudgetCents:null,dailyRecognitionLimit:null,version:1,requestId:randomUUID()});
    assert.equal((await db.select().from(s.assistantRun).where(eq(s.assistantRun.id,runs[0].id)))[0].state,"stopped");
    assert.equal(accountEntitlements({id:a,membershipTier:"free",aiDailyBudgetCents:500}).chat,false);
    assert.equal(accountEntitlements({id:a,membershipTier:"free"}).dailyRecognitionLimit,4);
    const uploads=Array.from({length:5},()=>randomUUID());
    const uploadRace=await Promise.allSettled(uploads.map(id=>db.transaction(async tx=>{await tx.select().from(s.user).where(eq(s.user.id,b)).for("update");await reserveImageQuota(tx,b,id,20*1048576);} )));
    assert.equal(uploadRace.filter(r=>r.status==="fulfilled").length,4);
    for(let i=0;i<uploads.length;i++)if(uploadRace[i].status==="fulfilled")await completeImageQuota(db,b,uploads[i],20*1048576);
    for(let i=0;i<6;i++)await db.transaction(async tx=>{await tx.select().from(s.user).where(eq(s.user.id,b)).for("update");const image=randomUUID();await reserveImageQuota(tx,b,image,20*1048576);await completeImageQuota(tx,b,image,20*1048576);});
    await assert.rejects(db.transaction(async tx=>{await tx.select().from(s.user).where(eq(s.user.id,b)).for("update");await reserveImageQuota(tx,b,randomUUID(),1);}),/200 MiB/);
    const rates=await Promise.allSettled(Array.from({length:31},()=>consumeSecurityRate(db,"write",c,30)));
    assert.equal(rates.filter(r=>r.status==="fulfilled").length,30);
    await db.insert(s.recordOperation).values(Array.from({length:100},()=>({id:randomUUID(),userId:c,operationId:randomUUID(),requestDigest:"fictional",payload:{operationId:randomUUID(),items:[]},draft:[]})));
    await assert.rejects(assertPendingCapacity(db,c,true),/100个/);
    console.info("原生PostgreSQL并发验收通过：预算、晚到用量、策略冲突、无重放、上传4／200MiB、写入30、预览100。");
  }finally{process.env.FORMWARD_CHAT_ENABLED=previousChat;await connection.close();}
});
