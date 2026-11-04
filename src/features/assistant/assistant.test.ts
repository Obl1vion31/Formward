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
import { readAssistantContext } from "./server";
import { readMealSnapshot, submitMealOperation, decideMealOperation } from "../meals/records";
import { readEnergySnapshot, submitEnergyOperation, decideEnergyOperation } from "../activities/records";

const blank: ReminderCatalog = { body: [], meals: [], energy: [] };
const now = new Date("2024-08-02T12:00:00Z"), created = "2024-07-01T00:00:00Z";
const context = (catalog = blank, date = now, createdAt = created, timezone = "Asia/Shanghai") => assistantContext(catalog, date, timezone, createdAt);

test("无记录属于可补充，不计入待处理；新账号不追讨昨日", () => {
  const result = context(); assert.equal(result.pending.length, 0); assert.equal(result.suggestions.length, 4);
  assert.deepEqual(context(blank, now, now.toISOString()).suggestions.map(item => item.category), ["body", "body"]);
});
test("已有饮食未确认／未记全／修改后失效需要核对，已记全营养未知不重问", () => {
  for (const status of ["unconfirmed", "incomplete", "complete"]) {
    const result = context({ ...blank, meals: [{ date: "2024-08-01", status, source: "record_change", complete: status === "complete" }] });
    assert.equal(result.pending.length, status === "complete" ? 0 : 1);
    if (result.pending.length) assert.equal(result.pending[0].action.href, "/dashboard/meals?date=2024-08-01");
  }
});
test("消耗部分和未知仅建议补充，明确0的可用总数不提示", () => {
  assert.equal(context({ ...blank, energy: [{ date: "2024-08-01", hasTotal: true }] }).suggestions.some(item => item.category === "energy"), false);
  assert.match(context({ ...blank, energy: [{ date: "2024-08-01", hasTotal: false }] }).suggestions.find(item => item.category === "energy")!.title, /暂不可得/);
});
test("身体实测、估计及旧空腹异常区分，建议遵守06／18点边界", () => {
  const at = (clock: string) => new Date(`2024-08-02T${clock}+08:00`);
  for (const [clock, count] of [["05:59:59", 0], ["06:00:00", 1], ["17:59:59", 1], ["18:00:00", 2]] as const) assert.equal(context(blank, at(clock), now.toISOString()).suggestions.filter(item => item.category === "body").length, count);
  const catalog: ReminderCatalog = { ...blank, body: [{ date: "2024-08-02", period: "daytime", recorded: false, estimated: true, blocked: false }, { date: "2024-08-02", period: "evening", recorded: true, estimated: false, blocked: false }] };
  assert.match(context(catalog).suggestions.find(item => item.category === "body")!.title, /尚无实测/);
  catalog.body[0].blocked = true; assert.equal(context(catalog).suggestions.some(item => item.category === "body"), false);
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
  assert.equal(result.pending.length, 1); assert.equal(result.suggestions.some(item => item.category === "energy"), false);
  assert.deepEqual(await readAssistantContext(db, users[0], "Asia/Shanghai", now), result);
  assert.deepEqual(await db.select().from(schema.meal), beforeMeals); assert.deepEqual(await db.select().from(schema.mealEvent), beforeEvents);
  const emptyUser = { id: randomUUID(), createdAt: new Date(created) }; await db.insert(schema.user).values({ ...emptyUser, name: "虚构空账号", email: `${emptyUser.id}@example.test` });
  assert.equal((await readAssistantContext(db, emptyUser, "Asia/Shanghai", now)).pending.length, 0);
});
