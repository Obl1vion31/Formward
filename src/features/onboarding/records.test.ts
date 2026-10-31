import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { loadPersonalProfile,savePersonalProfile,advanceOnboarding,requireOnboardingOwner } from "./records";
import { validateProfile,profileAge,profileToday } from "./model";
import { provisionAccount } from "../auth/provision";
import { requireSessionProof,webSessionContext } from "../auth/account-security";

const pg=new PGlite(),db=drizzle(pg,{schema});
before(async()=>{await migrate(db,{migrationsFolder:"./drizzle"});});
after(async()=>{await pg.close();});
async function identity(old=false,owner=false){
  const id=randomUUID(),sessionId=randomUUID();
  await db.insert(schema.user).values({id,email:id+"@onboarding.example.test",name:"虚构用户",role:owner?"owner":"user"});
  await db.insert(schema.session).values({id:sessionId,userId:id,token:randomUUID(),expiresAt:new Date(Date.now()+3600_000)});
  if(!old)await db.insert(schema.personalProfile).values({userId:id,onboardingStep:"profile"});
  return {userId:id,sessionId,accessVersion:0};
}
test("旧账号缺资料仍为已完成，不回填2058、体重或公式",async()=>{
  const p=await identity(true);const profile=await loadPersonalProfile(db,p);
  assert.equal(profile.onboardingStep,"complete");assert.equal(profile.heightCm,null);assert.equal(profile.version,0);
  assert.equal((await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,p.userId))).length,0);
});
test("维护创建新账号在同事务开启引导；重复创建不重置",async()=>{
  const credentials={email:"created@onboarding.example.test",password:"fictional-onboarding-password"};
  const account=await provisionAccount(db,credentials);
  const row=(await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,account.id)))[0];
  assert.equal(row.onboardingStep,"profile");
  await db.update(schema.personalProfile).set({onboardingStep:"complete"}).where(eq(schema.personalProfile.userId,account.id));
  assert.equal((await provisionAccount(db,credentials)).created,false);
  assert.equal((await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,account.id)))[0].onboardingStep,"complete");
});
test("资料保存→说明→完成；重复保存和完成幂等",async()=>{
  const p=await identity();
  const input={expectedVersion:1,heightCm:"172",birthDate:"1997-04-12",continueOnboarding:true};
  const tutorial=await savePersonalProfile(db,p,input);assert.equal(tutorial.onboardingStep,"tutorial");assert.equal(tutorial.version,2);
  assert.deepEqual(await savePersonalProfile(db,p,input),tutorial);
  const complete=await advanceOnboarding(db,p,{expectedVersion:2,step:"complete"});
  assert.equal(complete.onboardingStep,"complete");assert.equal(complete.heightCm,"172");
  assert.deepEqual(await advanceOnboarding(db,p,{expectedVersion:2,step:"complete"}),complete);
  assert.deepEqual(await advanceOnboarding(db,p,{expectedVersion:3,step:"profile"}),complete);
});
test("跳过保持未知，可返回资料，不强迫填满",async()=>{
  const p=await identity(),t=await advanceOnboarding(db,p,{expectedVersion:1,step:"tutorial"});
  assert.equal(t.heightCm,null);assert.equal(t.birthDate,null);
  const back=await advanceOnboarding(db,p,{expectedVersion:t.version,step:"profile"});
  const only=await savePersonalProfile(db,p,{expectedVersion:back.version,heightCm:"168",birthDate:null,continueOnboarding:true});
  assert.equal(only.birthDate,null);assert.equal(only.heightCm,"168");
});
test("既有账号填写、清空不会重新引导或影响健康表",async()=>{
  const p=await identity(true);
  const before=await db.execute(sql`SELECT (SELECT count(*) FROM measurements)::int AS body, (SELECT count(*) FROM energy_days)::int AS energy, (SELECT count(*) FROM energy_profiles)::int AS formula`);
  const saved=await savePersonalProfile(db,p,{expectedVersion:0,heightCm:"170.50",birthDate:"2000-02-29"});
  assert.equal(saved.onboardingStep,"complete");
  const clear=await savePersonalProfile(db,p,{expectedVersion:saved.version,heightCm:null,birthDate:null});
  assert.equal(clear.heightCm,null);assert.equal(clear.birthDate,null);assert.equal(clear.onboardingStep,"complete");
  assert.deepEqual(await db.execute(sql`SELECT (SELECT count(*) FROM measurements)::int AS body, (SELECT count(*) FROM energy_days)::int AS energy, (SELECT count(*) FROM energy_profiles)::int AS formula`),before);
});
test("版本冲突拒绝覆盖；另一账号资料与会话不可借用",async()=>{
  const a=await identity(),b=await identity();
  await savePersonalProfile(db,a,{expectedVersion:1,heightCm:"172",birthDate:null});
  await assert.rejects(savePersonalProfile(db,a,{expectedVersion:1,heightCm:"180",birthDate:null}),/其他页面修改/);
  assert.equal((await loadPersonalProfile(db,b)).heightCm,null);
  await assert.rejects(loadPersonalProfile(db,{...a,userId:b.userId}),/登录已失效/);
  await assert.rejects(savePersonalProfile(db,a,{expectedVersion:2,heightCm:"182",birthDate:null,userId:b.userId}));
  await assert.rejects(webSessionContext.run(b,()=>savePersonalProfile(db,a,{expectedVersion:2,heightCm:"183",birthDate:null})),/其他账号/);
});
test("撤销、停用与伪造会话不能读写，失败事务不留部分修改",async()=>{
  const a=await identity();
  await db.update(schema.user).set({accessVersion:1}).where(eq(schema.user.id,a.userId));
  await assert.rejects(savePersonalProfile(db,a,{expectedVersion:1,heightCm:"177",birthDate:null}),/登录已失效/);
  assert.equal((await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,a.userId)))[0].heightCm,null);
  const b=await identity();await db.update(schema.user).set({banned:true}).where(eq(schema.user.id,b.userId));
  await assert.rejects(loadPersonalProfile(db,b),/失效/);
});
test("owner演练权限与普通用户区分，不要求后台再次验密",async()=>{
  const owner=await identity(true,true),person=await identity();
  await requireOnboardingOwner(db,owner);await requireSessionProof(db,owner);
  await assert.rejects(requireOnboardingOwner(db,person),/仅供管理员/);
  assert.equal((await loadPersonalProfile(db,owner)).version,0);
});
test("未看说明不能直接完成；非法进度和无效日期不写入",async()=>{
  const p=await identity();
  await assert.rejects(advanceOnboarding(db,p,{expectedVersion:1,step:"complete"}),/先继续/);
  for(const birthDate of ["2000-02-30","2027-01-01","01/01/2000"]){await assert.rejects(savePersonalProfile(db,p,{expectedVersion:1,heightCm:null,birthDate}));}
  await assert.rejects(advanceOnboarding(db,p,{expectedVersion:1,step:"unknown"}));
  assert.equal((await loadPersonalProfile(db,p)).version,1);
});
test("生日按年月日算年龄；上海跨零点与闰年",()=>{
  assert.equal(profileAge("2004-06-03","2026-06-02"),21);
  assert.equal(profileAge("2004-06-03","2026-06-03"),22);
  assert.equal(profileAge(null,"2026-11-01"),null);
  assert.equal(profileToday(new Date("2026-10-31T16:01:00Z")),"2026-11-01");
  assert.throws(()=>validateProfile({expectedVersion:1,heightCm:"0",birthDate:null}));
  assert.equal(validateProfile({expectedVersion:1,heightCm:"",birthDate:""}).heightCm,null);
});
