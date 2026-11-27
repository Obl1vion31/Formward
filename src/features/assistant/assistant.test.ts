import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import { assistantContext, assistantTimezone, assistantAvailable } from "./model";
import { assistantAlreadyShown, assistantAutoEnabled, markAssistantShown, assistantAutoKey } from "./preferences";
import type { ReminderCatalog } from "../dashboard/daily-reminders";
import { dismissAssistantReminder, readAssistantContext, reviewSummary } from "./server";
import { readMealSnapshot, submitMealOperation, decideMealOperation } from "../meals/records";
import { readEnergySnapshot, submitEnergyOperation, decideEnergyOperation } from "../activities/records";

const blank: ReminderCatalog = { body: [], meals: [], energy: [] };
const now = new Date("2024-08-02T12:00:00Z"), created = "2024-07-01T00:00:00Z";
const context = (catalog = blank, date = now, createdAt = created, timezone = "Asia/Shanghai") => assistantContext(catalog, date, timezone, createdAt);

test("日常待办按本地日期出现，新账号不追讨昨日", () => {
  const result = context();
  assert.deepEqual(result.pending.map(item => item.category), ["body", "meals", "energy"]);
  assert.ok(result.pending.every(item => item.dismissible));
  assert.equal(context(blank, new Date("2024-08-02T14:00:00Z")).pending.length, 3);
  assert.deepEqual(context(blank, now, now.toISOString()).pending.map(item => item.category), ["body"]);
});
test("饮食未确认和未记全区分，带餐数和原确认版本", () => {
  const confirmation = { version: 2, contentDigest: "a".repeat(64) };
  for (const status of ["unconfirmed", "incomplete", "complete"]) {
    const result = context({ ...blank, meals: [{ date: "2024-08-01", status, complete: status === "complete", count:2, confirmation }] });
    const item = result.pending.find(row => row.category === "meals");
    if (status === "complete") { assert.equal(item, undefined); continue; }
    assert.equal(item?.action.href, "/dashboard/meals?date=2024-08-01&intent=edit");
    assert.equal(item?.title, status === "unconfirmed" ? "饮食未确认" : "饮食未记全");
    assert.equal(item?.detail, "已记 2 餐");
    assert.deepEqual(item?.mealConfirmation, confirmation);
  }
  assert.equal(context().pending.find(item=>item.category==="meals")?.mealConfirmation, undefined);
});
test("昨日仅缺完整消耗才进待办，采用稳定设备时查看同步", () => {
  const item = context().pending.find(item => item.category === "energy");
  assert.equal(item?.action.href, "/dashboard/energy?date=2024-08-01&entry=1");
  const device = assistantContext(blank,now,"Asia/Shanghai",created,{label:"Garmin Personal",status:"failed"}).pending.find(item=>item.category==="energy");
  assert.equal(device?.action.href,"/dashboard/sources");
  assert.equal(device?.detail,"Garmin Personal 同步未完成");
  assert.ok(!context({ ...blank, energy: [{ date: "2024-08-01", hasTotal: true }] }).pending.some(item => item.category === "energy"));
});
test("只有已记录的当日空腹体重完成晨间事项", () => {
  const at = (clock: string) => new Date(`2024-08-02T${clock}+08:00`);
  for (const [clock, expected] of [["05:59:59", false], ["06:00:00", true], ["17:59:59", true], ["18:00:00", true]] as const) {
    assert.equal(context(blank, at(clock)).pending.some(item => item.category==="body"), expected);
  }
  const morning: ReminderCatalog["body"][number]={ date:"2024-08-02", period:"daytime", recorded:true, weightRecorded:false, estimated:false, blocked:false };
  const evening: ReminderCatalog["body"][number]={ date:"2024-08-02", period:"evening", recorded:true, weightRecorded:true, estimated:false, blocked:false };
  assert.ok(context({...blank,body:[morning,evening]}).pending.some(item=>item.category==="body"));
  assert.ok(!context({...blank,body:[{...morning,weightRecorded:true},evening]}).pending.some(item=>item.category==="body"));
  assert.equal(context({...blank,body:[{...morning,blocked:true}]}).pending.find(item=>item.category==="body")?.action.label,"核对记录");
});
test("时区控制当地日期；非法时区拒绝，审核及教程不提供助手入口", () => {
  assert.equal(context(blank, new Date("2024-08-02T23:59:00Z"), created, "Asia/Shanghai").localDate, "2024-08-03");
  assert.equal(context(blank, new Date("2024-08-02T23:59:00Z"), created, "America/Los_Angeles").localDate, "2024-08-02");
  for (const timezone of [null, "", "Mars/Test", "x".repeat(101)]) assert.throws(() => assistantTimezone(timezone));
  assert.equal(assistantAvailable("/dashboard/meals"), true); assert.equal(assistantAvailable("/dashboard/ai/operations/123"), false); assert.equal(assistantAvailable("/dashboard/tutorial"), false);
});
test("当日展示、旧收起、账号与日期隔离；存储不可用仍可使用", () => {
  const values = new Map<string, string>(), store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  markAssistantShown(store, "one", "2024-08-02"); assert.equal(assistantAlreadyShown(store, "one", "2024-08-02"), true);
  assert.equal(assistantAlreadyShown(store, "two", "2024-08-02"), false); assert.equal(assistantAlreadyShown(store, "one", "2024-08-03"), false);
  values.set("formward:reminders:two:2024-08-02", "closed"); assert.equal(assistantAlreadyShown(store, "two", "2024-08-02"), true);
  values.set(assistantAutoKey("one"), "off"); assert.equal(assistantAutoEnabled(store, "one"), false);
  assert.equal(assistantAutoEnabled(null, "one"), true); assert.doesNotThrow(() => markAssistantShown({ getItem() { throw Error(); }, setItem() { throw Error(); } }, "one", "2024-08-02"));
});

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
test("有界读取复用业务口径，重复读取无写入且不泄露其他账号或旧历史", async () => {
  const users = [{ id: randomUUID(), createdAt: new Date(created) }, { id: randomUUID(), createdAt: new Date(created) }];
  for (const user of users) {
    await db.insert(schema.user).values({ ...user, email: `${user.id}@example.test`, name: "虚构助手用户" });
    const pending = await submitMealOperation(db, { userId: user.id, origin: "manual" }, { operationId: randomUUID(), actions: ["2024-07-01", "2024-08-01"].map(date => ({ kind: "save_meal", date, mealType: "午餐", items: [{ kind: "food", name: "虚构餐次", quantity: "1", unit: "份", sourceKind: "reference", nutrition: { caloriesKcal: "560", proteinG: "22", carbsG: null, fatG: null } }] })) });
    await decideMealOperation(db, user.id, pending.id, pending.revision, "confirm");
    const energy = await submitEnergyOperation(db, { userId: user.id, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", date: "2024-07-01", entryMode: "total", totalKcal: "2400" }, { kind: "save_energy_day", date: "2024-08-01", entryMode: "total", totalKcal: "0" }] });
    await decideEnergyOperation(db, user.id, energy.id, energy.revision, "confirm");
  }
  const beforeMeals = await db.select().from(schema.meal), beforeEvents = await db.select().from(schema.mealEvent);
  const snapshot = await readMealSnapshot(db, users[0].id, ["2024-08-01", "2024-08-02"]);
  assert.equal(snapshot.foods.length, 0); assert.equal(snapshot.meals.length, 1); assert.equal(snapshot.meals[0].items.length, 1);
  const energy = await readEnergySnapshot(db, users[0].id, ["2024-08-01", "2024-08-02"]);
  assert.equal(energy.days.length, 1); assert.equal(energy.days[0].totalKcal, "0.0000"); assert.deepEqual(energy.profiles, []);
  const result = await readAssistantContext(db, users[0], "Asia/Shanghai", now);
  assert.deepEqual(result.pending.map(item=>item.category), ["body","meals"]);
  assert.ok(result.pending.find(item=>item.category==="meals")?.mealConfirmation);
  assert.deepEqual(await readAssistantContext(db, users[0], "Asia/Shanghai", now), result);
  assert.deepEqual(await db.select().from(schema.meal), beforeMeals); assert.deepEqual(await db.select().from(schema.mealEvent), beforeEvents);
  const emptyUser = { id: randomUUID(), createdAt: new Date(created) }; await db.insert(schema.user).values({ ...emptyUser, name: "虚构空账号", email: `${emptyUser.id}@example.test` });
  assert.equal((await readAssistantContext(db, emptyUser, "Asia/Shanghai", now)).pending.length, 3);
});


test("逐条忽略按本人日期和类型隔离，可重试且不改健康事实或排期", async () => {
  const owner = { id: randomUUID(), createdAt: new Date(created) };
  const other = { id: randomUUID(), createdAt: new Date(created) };
  for (const row of [owner, other]) {
    await db.insert(schema.user).values({ ...row, name: "虚构提醒账号", email: row.id + "@example.test" });
  }
  const templateId = randomUUID();
  const training = { userId: owner.id, createdBy: owner.id, content: { name: "虚构训练", exercises: [] } };
  await db.insert(schema.trainingTemplate).values({ ...training, id: templateId });
  await db.insert(schema.trainingPlan).values({ ...training, id: randomUUID(), templateId, date: "2024-08-02" });
  const facts = () => Promise.all([
    db.select().from(schema.meal), db.select().from(schema.mealDay), db.select().from(schema.mealEvent),
    db.select().from(schema.measurement), db.select().from(schema.energyDay), db.select().from(schema.trainingPlan),
  ]);
  const before = await facts();
  const zone = "Asia/Shanghai";
  const ids = async (account: typeof owner, at = now) => (await readAssistantContext(db, account, zone, at)).pending.map(row => row.id);
  const body = "body:2024-08-02:daytime", meal = "meals:2024-08-01", energy = "energy:2024-08-01", plan = "training:2024-08-02";
  const dismiss = (id: string) => dismissAssistantReminder(db, owner, id, zone, now);
  assert.deepEqual(await ids(owner), [body, meal, energy, plan]);
  await dismiss(body);
  await dismiss(body);
  assert.deepEqual(await ids(owner), [meal, energy, plan]);
  await dismiss(energy);
  assert.deepEqual(await ids(owner), [meal, plan]);
  assert.equal((await db.select().from(schema.assistantReminderDismissal)).filter(row => row.userId === owner.id).length, 0);
  await dismiss(plan);
  assert.deepEqual(await ids(owner), [meal]);
  await dismiss(meal);
  await dismiss(meal);
  assert.deepEqual(await ids(owner), []);
  assert.deepEqual(await ids(other), [body, meal, energy]);
  assert.equal((await db.select().from(schema.assistantDailyReminderDismissal)).filter(row => row.userId === owner.id).length, 3);
  assert.equal((await db.select().from(schema.assistantReminderDismissal)).filter(row => row.userId === owner.id).length, 1);
  assert.deepEqual(await ids(owner, new Date("2024-08-03T12:00:00Z")), [
    "body:2024-08-03:daytime", "meals:2024-08-02", "energy:2024-08-02",
  ]);
  for (const invalid of ["body:2024-08-02:evening", "energy:2024-07-31", "training:2024-08-03", "ai:invalid"]) {
    await assert.rejects(() => dismiss(invalid), { code: "invalid_reminder" });
  }
  await assert.rejects(() => dismissAssistantReminder(db, { id: randomUUID(), createdAt: new Date(created) }, body, zone, now));
  assert.deepEqual(await facts(), before);
});

test("只有今日尚未开始的真实计划进入角标，开始或跳过后移除",async()=>{
 const owner={id:randomUUID(),createdAt:new Date(created)},templateId=randomUUID(),planId=randomUUID();
 await db.insert(schema.user).values({...owner,name:"虚构训练账号",email:owner.id+"@example.test"});
 await db.insert(schema.trainingTemplate).values({id:templateId,userId:owner.id,createdBy:owner.id,content:{name:"虚构力量训练",exercises:[]}});
 await db.insert(schema.trainingPlan).values({id:planId,userId:owner.id,templateId,date:"2024-08-02",createdBy:owner.id,content:{name:"虚构力量训练",exercises:[]}});
 assert.equal((await readAssistantContext(db,owner,"Asia/Shanghai",now)).pending.filter(row=>row.category==="training").length,1);
 await db.insert(schema.trainingSession).values({id:randomUUID(),userId:owner.id,planId,createdBy:owner.id,date:"2024-08-02",timezone:"Asia/Shanghai",name:"虚构训练",exercises:[],startedAt:now,resumedAt:now});
 assert.equal((await readAssistantContext(db,owner,"Asia/Shanghai",now)).pending.some(row=>row.category==="training"),false);
});

test("AI统一批次仅提醒一次，取消、过期、撤销和其他账号不计入",async()=>{
 const {submitRecordOperation}=await import("../records/operations");
 const {eq}=await import("drizzle-orm");
 const owner={id:randomUUID(),createdAt:new Date(created)},tokenId=randomUUID();
 await db.insert(schema.user).values({...owner,name:"虚构审核账号",email:owner.id+"@example.test"});
 await db.insert(schema.aiToken).values({id:tokenId,userId:owner.id,name:"虚构令牌",tokenHash:randomUUID(),prefix:"fictional",permission:"write",expiresAt:new Date(Date.now()+3600000)});
 const review=await submitRecordOperation(db,{userId:owner.id,tokenId,permission:"write"},{operationId:randomUUID(),items:[{key:"snack",kind:"save_meal",date:"2024-08-02",mealType:"加餐",items:[{kind:"food",name:"虚构加餐",quantity:"1",unit:"份",sourceKind:"reference",nutrition:{caloriesKcal:"100",proteinG:null,carbsG:null,fatG:null}}]}]});
 const pending=await readAssistantContext(db,owner,"Asia/Shanghai",now);
 assert.equal(pending.pending.filter(row=>row.category==="ai").length,1);
 const other={id:randomUUID(),createdAt:new Date(created)};await db.insert(schema.user).values({...other,name:"虚构另一账号",email:other.id+"@example.test"});
 assert.equal((await readAssistantContext(db,other,"Asia/Shanghai",now)).pending.some(row=>row.category==="ai"),false);

 await db.update(schema.aiToken).set({revokedAt:new Date()}).where(eq(schema.aiToken.id,tokenId));
 assert.equal((await readAssistantContext(db,owner,"Asia/Shanghai",now)).pending.some(row=>row.category==="ai"),false);
 await db.update(schema.aiToken).set({revokedAt:null}).where(eq(schema.aiToken.id,tokenId));
 await db.update(schema.recordOperation).set({status:"cancelled"}).where(eq(schema.recordOperation.id,review.id));
 assert.equal((await readAssistantContext(db,owner,"Asia/Shanghai",now)).pending.some(row=>row.category==="ai"),false);
 await db.update(schema.recordOperation).set({status:"pending"}).where(eq(schema.recordOperation.id,review.id));
 const [rootRow]=await db.select().from(schema.recordOperation).where(eq(schema.recordOperation.id,review.id));
 await db.update(schema.mealOperation).set({expiresAt:new Date("2024-08-01T00:00:00Z")}).where(eq(schema.mealOperation.id,rootRow.mealOperationId!));
 assert.equal((await readAssistantContext(db,owner,"Asia/Shanghai",now)).pending.some(row=>row.category==="ai"),false);
});

test("待确认摘要保留身体单项和未知语义，不以0冒充未知",()=>{
 const fat=reviewSummary([{kind:"save_record",date:"2026-11-18",period:"daytime",bodyFatPercent:"16.5"}]);assert.match(fat.value,/16.5/);assert.ok(!fat.value.includes("体重未知"));
 const empty=reviewSummary([{kind:"save_record",date:"2026-11-18",period:"daytime"}]);assert.ok(!empty.value.includes("0"));
});
