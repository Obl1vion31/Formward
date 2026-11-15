import assert from "node:assert/strict";
import { after, before, test as nodeTest } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { Database } from "../../db/client";
import { accountEntitlements, assertAssistantEntitlement } from "../auth/entitlements";
import { changeAccountTier } from "../auth/account-management";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { currentConversation, chatIdentity, chatUsage, reserveChatUsage, settleChatUsage, startChatRun } from "./chat-store";
import { createMealTask, prepareMealTaskRun, changeMealModelGrant } from "./meal-task";
import { recognitionUsage, markRecognitionUsed, refundUnfinishedRecognition } from "./recognition-quota";

const pg = new PGlite(), connection = drizzle(pg, { schema }), db = connection as unknown as Database;
const ownerId = randomUUID();
const test=(name:string,work:()=>unknown)=>nodeTest(name,async()=>{
 const env=new Map<string,string|undefined>();
 for(const [key,value]of Object.entries({FORMWARD_CHAT_ENABLED:"1",FORMWARD_CHAT_PILOT_USER_ID:ownerId,QWEN_API_KEY:"fictional-key",BETTER_AUTH_URL:"http://localhost:3000"})){env.set(key,process.env[key]);process.env[key]=value;}
 try{await work();}finally{for(const [key,value]of env)if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
before(async()=>{
  await migrate(connection, { migrationsFolder: "drizzle" });
  await db.insert(schema.user).values({ id: ownerId, name: "隔离管理员", email: `${ownerId}@example.test`, role: "owner" });
});
after(async () => { await pg.close(); });
async function person(tier: "free" | "beta" | "plus" = "free") {
  const id = randomUUID(); await db.insert(schema.user).values({ id, name: "隔离账号", email: `${id}@example.test`, membershipTier: tier }); return id;
}
async function proof(userId: string, verified = true) {
  const id = randomUUID(); await db.insert(schema.session).values({ id, userId, token: randomUUID(), expiresAt: new Date(Date.now() + 60000), adminVerifiedAt: verified ? new Date() : null });
  return { userId, sessionId: id, accessVersion: 0 };
}
async function mealRun(userId: string, taskId?: string) {
  const id = taskId ?? await createMealTask(db, userId, randomUUID(), { date: "2026-11-15", mealType: "午餐", items: [] });
  const input = { action: "send" as const, requestId: randomUUID(), provider: "qwen" as const, conversationId: id, mealTask: true, text: "识别当前食物", timezone: "Asia/Shanghai" };
  return { input, ...(await startChatRun(db, userId, input)) };
}
async function finish(row: typeof schema.assistantRun.$inferSelect) { await db.update(schema.assistantRun).set({ state: "complete" }).where(eq(schema.assistantRun.id, row.id)); }

test("档位与管理角色独立，指定管理员2元、内测1元、Plus2元、Free仅识图", () => {
  assert.equal(accountEntitlements({ id: ownerId, role: "owner" }).dailyBudgetCny, 2);
  for (const [tier, limit] of [["free", 0], ["beta", 1], ["plus", 2]] as const) {
    const value = accountEntitlements({ id: "ordinary", role: "user", membershipTier: tier });
    assert.equal(value.dailyBudgetCny, limit); assert.equal(value.chat, tier !== "free"); assert.equal(value.mealRecognition, true);
    assert.equal(value.devices, true);
  }
  assert.throws(() => assertAssistantEntitlement({ id: "ordinary", membershipTier: "free" }), /未开放聊天/);
  assert.equal(accountEntitlements({ id: "ordinary", membershipTier: "pro" }).mealRecognition, false);
  assert.equal(accountEntitlements({ id: ownerId, role: "owner", banned: true }).chat, false);
});

test("管理员改档验证会话、目标、版本及幂等，不撤销登录或改角色", async () => {
  const id = await person(), admin = await proof(ownerId), requestId = randomUUID(), ownProof = await proof(id);
  await assert.rejects(() => changeAccountTier(db, ownProof, id, "plus", 0, randomUUID()), /管理权限/);
  await assert.rejects(() => changeAccountTier(db, admin, id, "pro", 0, randomUUID()), /Pro暂未开放/);
  const changed = await changeAccountTier(db, admin, id, "beta", 0, requestId); assert.equal(changed.version, 1);
  assert.equal((await changeAccountTier(db, admin, id, "beta", 0, requestId)).repeated, true);
  await assert.rejects(() => changeAccountTier(db, admin, id, "plus", 0, requestId), /不同的档位/);
  await assert.rejects(() => changeAccountTier(db, admin, id, "plus", 0, randomUUID()), /已更新/);
  const [account] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  assert.equal(account.role, "user"); assert.equal(account.accessVersion, 0); assert.equal(account.membershipTier, "beta");
  const unverified = await proof(ownerId, false);
  await assert.rejects(() => changeAccountTier(db, unverified, id, "plus", 1, randomUUID()), /再次输入密码/);
});

test("Free无需主聊天即可识图，4次并发预占，补充不再计次，技术失败退次但成本保留", async () => {
  const id = await person(); await assert.rejects(() => currentConversation(db, id), /未开放聊天/);
  const first = await mealRun(id), token = await chatIdentity(db, id, "qwen", true, "meal_entry");
  await assert.rejects(() => db.transaction(tx => requireActiveAiToken(tx, token, false, "measurements")), /仅用于饮食/);
  await db.transaction(tx => requireActiveAiToken(tx, token, false, "meals"));
  assert.equal((await recognitionUsage(db, id)).used, 0);
  const reservation = await reserveChatUsage(db, id, first.row, .1); assert.equal((await recognitionUsage(db, id)).used, 1);
  await settleChatUsage(db, id, reservation, { prompt_tokens: 100, completion_tokens: 10 });
  await refundUnfinishedRecognition(db, id, first.row); await finish(first.row);
  assert.equal((await recognitionUsage(db, id)).used, 0); assert.ok((await chatUsage(db, id)).spent > 0);
  const retry = await mealRun(id, first.row.conversationId); assert.equal(retry.row.recognitionId, first.row.recognitionId);
  await reserveChatUsage(db, id, retry.row, .1); await markRecognitionUsed(db, id, retry.row.id); await finish(retry.row);
  await db.update(schema.assistantConversation).set({ followup: { question: "这次吃了多少？", subject: "份量", messageId: retry.row.userMessageId, questions: [{ id: "amount", prompt: "这次吃了多少", allowText: true }] } }).where(eq(schema.assistantConversation.id, retry.row.conversationId));
  const continued = await startChatRun(db, id, { ...retry.input, requestId: randomUUID(), followup: { messageId: retry.row.userMessageId, answers: [{ questionId: "amount", text: "半份" }] } });
  assert.equal(continued.row.recognitionId, retry.row.recognitionId); await reserveChatUsage(db, id, continued.row, .1); await finish(continued.row);
  assert.equal((await recognitionUsage(db, id)).used, 1);
  for (let i = 0; i < 3; i++) { const next = await mealRun(id); await reserveChatUsage(db, id, next.row, .1); await markRecognitionUsed(db, id, next.row.id); await finish(next.row); }
  assert.equal((await recognitionUsage(db, id)).used, 4);
  const fifth = await mealRun(id); await assert.rejects(() => reserveChatUsage(db, id, fifth.row, .1), /4次识图额度/); await finish(fifth.row);
  assert.equal((await recognitionUsage(db, id)).used, 4); assert.equal((await recognitionUsage(db, await person())).used, 0);
});

test("两模型金额共用，改档不清空费用，降档后新调用按最新限额阻止", async () => {
  const id = await person("plus"), conversation = await currentConversation(db, id);
  const { row } = await startChatRun(db, id, { action: "send", requestId: randomUUID(), provider: "qwen", conversationId: conversation.id, text: "查询", timezone: "Asia/Shanghai" });
  const reservation = await reserveChatUsage(db, id, row, .1);
  await db.update(schema.assistantUsageRequest).set({ state: "settled", costCny: "1.10000000" }).where(eq(schema.assistantUsageRequest.id, reservation));
  await changeAccountTier(db, await proof(ownerId), id, "beta", 0, randomUUID());
  const usage = await chatUsage(db, id); assert.equal(usage.limit, 1); assert.equal(usage.percent, "110%");
  await assert.rejects(() => reserveChatUsage(db, id, row, .01), /今日可用额度不足/); await finish(row);
});

test("Free餐次入口不能绕过为无图片聊天，过期授权重新启用须本人明确操作",async()=>{
 const id=await person(),taskId=await createMealTask(db,id,randomUUID(),{date:"2026-11-15",mealType:"早餐",items:[]});
 await assert.rejects(prepareMealTaskRun(db,id,{action:"run",taskId,requestId:randomUUID(),provider:"qwen",imageIds:[],text:"替我闲聊",timezone:"Asia/Shanghai"}),/先添加照片/);
 const identity=await chatIdentity(db,id,"qwen",true,"meal_entry");await db.update(schema.aiToken).set({expiresAt:new Date(0)}).where(eq(schema.aiToken.id,identity.tokenId!));await assert.rejects(chatIdentity(db,id,"qwen",true,"meal_entry"),/过期/);
 await changeMealModelGrant(db,id,taskId,"qwen",true);const current=await chatIdentity(db,id,"qwen",false,"meal_entry");assert.notEqual(current.tokenId,identity.tokenId);assert.equal((await recognitionUsage(db,id)).used,0);
 const other=await person();await assert.rejects(changeMealModelGrant(db,other,taskId,"qwen",true),/不属于/);
});

test("两设备不能并行生成，识别运行的复合外键拒绝其他账号任务",async()=>{
 const first=await person(),second=await person(),a=await mealRun(first),b=await mealRun(second);assert.ok(a.row.recognitionId);assert.ok(b.row.recognitionId);await assert.rejects(db.update(schema.assistantRun).set({recognitionId:a.row.recognitionId}).where(eq(schema.assistantRun.id,b.row.id)));
 const task=await createMealTask(db,first,randomUUID(),{date:"2026-11-15",mealType:"晚餐",items:[]});await assert.rejects(mealRun(first,task),/已有|正在/);assert.equal((await recognitionUsage(db,first)).used,0);await finish(a.row);await finish(b.row);
});
