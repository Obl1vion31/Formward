import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import * as s from "../../db/schema";
import { saveMembership,archiveMembership,changeMembershipAssignment,loadMembershipSettings } from "./memberships";
import { requireActiveAccount } from "../auth/account-security";
import { accountEntitlements } from "../auth/entitlements";
import { provisionAccount } from "../auth/provision";
import { reserveChatUsage } from "../assistant/chat-store";
import { loadAdminConsole,loadAdminDay } from "./queries";
import { securityDay } from "../auth/security-time";

test("数据库档位：统一生效、个人覆盖、默认分配、改名增删、幂等冲突与权限隔离",async()=>{
 const pg=new PGlite(),db=drizzle(pg,{schema:s}) as unknown as Database,owner=randomUUID(),a=randomUUID(),b=randomUUID(),sid=randomUUID();
 const prior=process.env.FORMWARD_MANAGED_MEMBERSHIP_REQUIRED,chat=process.env.FORMWARD_CHAT_ENABLED;process.env.FORMWARD_MANAGED_MEMBERSHIP_REQUIRED="1";process.env.FORMWARD_CHAT_ENABLED="1";
 try{
  await migrate(db as never,{migrationsFolder:"drizzle"});
  await db.insert(s.user).values([{id:owner,email:"tier-owner@example.test",name:"虚构管理员",role:"owner"},{id:a,email:"tier-a@example.test",name:"继承用户",membershipTierId:"beta"},{id:b,email:"tier-b@example.test",name:"覆盖用户",membershipTierId:"beta",aiDailyBudgetCents:90,aiDailyRecognitionLimit:7}]);
  await db.insert(s.session).values([{id:sid,userId:owner,token:randomUUID(),expiresAt:new Date(Date.now()+600000),adminVerifiedAt:new Date()},{id:a,userId:a,token:randomUUID(),expiresAt:new Date(Date.now()+600000),adminVerifiedAt:new Date()}]);
  const proof={userId:owner,sessionId:sid,accessVersion:0},settings=await loadMembershipSettings(db,proof),beta=settings.find(p=>p.id==="beta")!;
  assert.equal(beta.users,2);assert.equal(beta.overrides,1);
  const input={id:"beta",name:"内测体验",active:true,isDefault:false,dailyBudgetCents:35,dailyRecognitionLimit:2,chatEnabled:true,mealRecognitionEnabled:true,version:0,requestId:randomUUID()};
  assert.equal((await saveMembership(db,proof,input)).repeated,false);assert.equal((await saveMembership(db,proof,input)).repeated,true);
  await assert.rejects(saveMembership(db,proof,{...input,name:"不能重复编号"}),/同一请求编号/);
  await assert.rejects(saveMembership(db,proof,{...input,requestId:randomUUID()}),/档位已被更新/);
  const entitlement=async(id:string)=>accountEntitlements(await requireActiveAccount(db,id));
  assert.equal((await entitlement(a)).dailyBudgetCny,.35);assert.equal((await entitlement(a)).dailyRecognitionLimit,2);assert.equal((await entitlement(a)).label,"内测体验");
  assert.equal((await entitlement(b)).dailyBudgetCny,.9);assert.equal((await entitlement(b)).dailyRecognitionLimit,7);
  const created=await saveMembership(db,proof,{...input,id:undefined,version:undefined,name:"Elite",isDefault:true,dailyBudgetCents:60,requestId:randomUUID()});
  const person=await provisionAccount(db,{email:"tier-default@example.test",password:"fictional-tier-password-123"});
  assert.equal((await requireActiveAccount(db,person.id)).membershipTierId,created.id);assert.equal((await entitlement(person.id)).dailyBudgetCny,.6);
  const assignment={userId:a,tierId:created.id,version:1,requestId:randomUUID()};assert.equal((await changeMembershipAssignment(db,proof,assignment)).repeated,false);assert.equal((await changeMembershipAssignment(db,proof,assignment)).repeated,true);
  assert.equal((await entitlement(a)).dailyBudgetCny,.6);assert.equal((await db.select().from(s.user).where(eq(s.user.id,a)))[0].role,"user");
  await assert.rejects(changeMembershipAssignment(db,proof,{...assignment,tierId:"admin",version:2,requestId:randomUUID()}),/普通会员档位/);
  await assert.rejects(changeMembershipAssignment(db,proof,{...assignment,userId:owner,requestId:randomUUID()}),/管理员/);
  await assert.rejects(loadMembershipSettings(db,{userId:a,sessionId:a,accessVersion:0}),/没有管理权限/);
  await assert.rejects(saveMembership(db,{userId:a,sessionId:a,accessVersion:0},{...input,version:1,requestId:randomUUID()}),/没有管理权限/);
  await assert.rejects(saveMembership(db,proof,{...input,version:1,dailyBudgetCents:1001,requestId:randomUUID()}));
  await assert.rejects(saveMembership(db,proof,{...input,version:1,name:"Elite",requestId:randomUUID()}),/名称已存在/);
  await assert.rejects(archiveMembership(db,proof,{id:created.id,version:0,requestId:randomUUID()}),/接替档位/);
  const removal={id:created.id,replacementId:"beta",version:0,requestId:randomUUID()};await archiveMembership(db,proof,removal);assert.equal((await archiveMembership(db,proof,removal)).repeated,true);
  assert.equal((await requireActiveAccount(db,a)).membershipTierId,"beta");assert.equal((await requireActiveAccount(db,person.id)).membershipTierId,"beta");assert.equal((await entitlement(b)).dailyBudgetCny,.9);
  const final=await loadMembershipSettings(db,proof);assert.ok(final.find(p=>p.id==="beta")?.isDefault);assert.ok(!final.some(p=>p.id===created.id));
  await assert.rejects(archiveMembership(db,proof,{id:"admin",version:0,requestId:randomUUID()}),/专用档位需保留/);
  await db.update(s.session).set({adminVerifiedAt:new Date(Date.now()-300001)}).where(eq(s.session.id,sid));await assert.rejects(saveMembership(db,proof,{...input,version:2,requestId:randomUUID()}),/再次输入密码/);
 }finally{if(prior===undefined)delete process.env.FORMWARD_MANAGED_MEMBERSHIP_REQUIRED;else process.env.FORMWARD_MANAGED_MEMBERSHIP_REQUIRED=prior;if(chat===undefined)delete process.env.FORMWARD_CHAT_ENABLED;else process.env.FORMWARD_CHAT_ENABLED=chat;await pg.close();}
});

test("停用档位停止待执行任务，保留未知占用；恢复与改名不会重放收费任务",async()=>{
 const pg=new PGlite(),db=drizzle(pg,{schema:s}) as unknown as Database,owner=randomUUID(),person=randomUUID(),sid=randomUUID(),run=randomUUID(),conversation=randomUUID(),q=randomUUID(),a=randomUUID();
 const previous=process.env.FORMWARD_CHAT_ENABLED;process.env.FORMWARD_CHAT_ENABLED="1";
 try{
  await migrate(db as never,{migrationsFolder:"drizzle"});await db.insert(s.user).values([{id:owner,email:"tier-stop-owner@example.test",name:"虚构管理员",role:"owner"},{id:person,email:"tier-stop-user@example.test",name:"虚构用户",membershipTierId:"beta"}]);
  await db.insert(s.session).values({id:sid,userId:owner,token:randomUUID(),expiresAt:new Date(Date.now()+600000),adminVerifiedAt:new Date()});const proof={userId:owner,sessionId:sid,accessVersion:0};
  await db.insert(s.assistantConversation).values({id:conversation,userId:person,provider:"qwen",purpose:"chat"});await db.insert(s.assistantMessage).values([{id:q,userId:person,conversationId:conversation,seq:1,role:"user",text:"不返回的虚构正文"},{id:a,userId:person,conversationId:conversation,seq:2,role:"assistant"}]);
  const [running]=await db.insert(s.assistantRun).values({id:run,userId:person,conversationId:conversation,userMessageId:q,assistantMessageId:a,provider:"qwen",model:"qwen3.6-plus",requestId:randomUUID(),requestDigest:"fixture"}).returning();await reserveChatUsage(db,person,running,.05);
  const setting={id:"beta",name:"内测版",active:false,isDefault:false,dailyBudgetCents:100,dailyRecognitionLimit:null,chatEnabled:true,mealRecognitionEnabled:true,version:0,requestId:randomUUID()};await saveMembership(db,proof,setting);
  assert.equal((await db.select().from(s.assistantRun).where(eq(s.assistantRun.id,run)))[0].state,"stopped");assert.equal((await db.select().from(s.assistantUsageRequest).where(eq(s.assistantUsageRequest.runId,run)))[0].state,"unknown");
  await assert.rejects(reserveChatUsage(db,person,running,.01),/暂未开放/);
  await saveMembership(db,proof,{...setting,name:"Elite体验",active:true,version:1,requestId:randomUUID()});assert.equal((await db.select().from(s.assistantRun).where(eq(s.assistantRun.id,run)))[0].state,"stopped");assert.equal(accountEntitlements(await requireActiveAccount(db,person)).chat,true);
  const today=securityDay(),visible=await loadAdminConsole(db,proof,{from:today,to:today,userId:person});assert.equal(visible.totals.spent,"0");assert.equal(Number(visible.totals.uncertain),.05);assert.equal(visible.highlights.models[0].label,"qwen3.6-plus");
  const day=await loadAdminDay(db,proof,{from:today,to:today,userId:person},{dimension:"models",page:1});assert.equal(day.rows[0].label,"qwen3.6-plus");assert.equal(day.rows[0].input,null);assert.equal(day.rows[0].unknownUsage,1);assert.equal(Number(day.total.uncertain),.05);assert.ok(!JSON.stringify(day).includes("不返回的虚构正文"));
  await assert.rejects(loadAdminDay(db,proof,{from:"2024-01-01",to:today},{dimension:"users",page:1}));
 }finally{if(previous===undefined)delete process.env.FORMWARD_CHAT_ENABLED;else process.env.FORMWARD_CHAT_ENABLED=previous;await pg.close();}
});
