import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { sevenDays, type Capture, type Json } from "../garmin/client";
import { addCalendarDays } from "../measurements/calendar";
import { activityReadings, energyDays } from "../activities/model";
import { decideEnergyOperation, readEnergySnapshot, submitEnergyOperation } from "../activities/records";
import { bindPersonalSource, configureConnection } from "./mutations";
import { loadSources, loadSourceSettings } from "./state";
import { synchronizeSource } from "./sync";

const pg = new PGlite(), db = drizzle(pg, { schema }), now = new Date(), today = sevenDays(now).to;
before(async () => { process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY = "b".repeat(64); await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { delete process.env.FORMWARD_DATA_SOURCE_USER_ID; delete process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY; await pg.close(); });
async function owner() {
  const id = randomUUID(); await db.insert(schema.user).values({ id, name: "虚构同步验收", email: id + "@example.test" });
  process.env.FORMWARD_DATA_SOURCE_USER_ID = id;
  await bindPersonalSource(db, id, { apiKey: "fictional-new-workflow-key", version: 0 });
  return id;
}
function workout(id: number, date = today, name = "虚构训练"): Json { return { activityId: id, activityName: name, activityType: { typeKey: "strength_training" }, startTimeLocal: date + " 10:00:00", startTimeGMT: date + " 02:00:00", duration: 1800, calories: 300, bmrCalories: 40, distance: 0, averageHR: 110 }; }
function capture(from = addCalendarDays(today, -6), activities: Json[] = [], total = 2400): Capture {
  const dates: string[] = []; for (let d = from; d <= today; d = addCalendarDays(d, 1)) dates.push(d);
  const data = { data: dates.map(date => ({ calendarDate: date, calories: { burnedTotal: total, burnedResting: 2000, burnedActive: total - 2000 }, movement: { steps: { value: 0 } }, wellnessChronology: { endTimestampGmt: date + "T06:00:00.0" } })) };
  return { mode: "demo", fetchedAt: now.toISOString(), region: "global", window: { from, to: today, timeZone: "Asia/Shanghai", dates }, daily: { ok: true, data, rawText: JSON.stringify(data) }, activityPages: [{ ok: true, data: activities, rawText: JSON.stringify(activities) }], activitiesComplete: true };
}
async function run(id: string, value: Capture, minute = 0, extra: { activate?: boolean; from?: string } = {}) { return synchronizeSource(db, id, { ...extra, now: new Date(+now + minute * 60000), capture: async () => value }); }

test("连接并同步一次完成首次载入，相似手工运动独立保留且不重复计热量", async () => {
  const id = await owner(), manualId = randomUUID();
  await db.insert(schema.activity).values({ id: manualId, userId: id, timezone:"Asia/Shanghai", date: today, name: "虚构训练", durationMinutes: "30", caloriesKcal: "300", sourceSystem: "虚构手工" });
  const value = capture(undefined, [workout(3001)]), result = await run(id, value, 0, { activate: true });
  assert.equal(result.status, "synced");
  const snapshot = await readEnergySnapshot(db, id);
  assert.equal(snapshot.activities.length, 2); assert.equal(snapshot.activities.find(a => a.id === manualId)?.sourceSystem, "虚构手工");
  assert.equal(Number(energyDays(snapshot, [], [today])[0].totalKcal), 2400);
  assert.equal((await loadSources(db, id, now)).conflicts.length, 0);
  const original = snapshot.activities.map(a => [a.id, a.version]);
  await run(id, value, 6);
  assert.deepEqual((await readEnergySnapshot(db, id)).activities.map(a => [a.id, a.version]), original);
});

test("21天历史汇总与6条运动全部载入，两条相似记录不阻挡且原日编号备注保留", async () => {
  const id = await owner(), from = addCalendarDays(today, -20), oldDayId = randomUUID();
  await db.insert(schema.energyDay).values({ id: oldDayId, userId: id, timezone:"Asia/Shanghai", date: from, entryMode: "total", activityMode: "total", totalKcal: "2400", notes: "原历史备注" });
  const offsets = [18, 17, 15, 11, 9, 8], activities = offsets.map((offset, i) => workout(4000 + i, addCalendarDays(today, -offset), "虚构训练" + i));
  const originals: string[] = [];
  for (const i of [0, 2]) { const manualId = randomUUID(); originals.push(manualId); await db.insert(schema.activity).values({ id: manualId, userId: id, timezone:"Asia/Shanghai", date: addCalendarDays(today, -offsets[i]), name: "虚构训练" + i, durationMinutes: "30", caloriesKcal: "300", sourceSystem:"虚构手工" }); }
  const value = capture(from, activities); let requestedFrom: string | undefined;
  const result = await synchronizeSource(db, id, { now, activate: true, from, capture: async input => { requestedFrom = input.from; return value; } });
  assert.equal(requestedFrom, from); assert.equal(result.status, "synced"); assert.equal(result.loaded?.days, 21); assert.equal(result.loaded?.activities, 6);
  const snapshot = await readEnergySnapshot(db, id), imported = snapshot.activities.filter(a => a.sourceSystem?.startsWith("Garmin Personal:"));
  assert.equal(snapshot.days.length, 21); assert.equal(imported.length, 6); assert.equal(snapshot.activities.length, 8);
  assert.equal(snapshot.days.find(d => d.date === from)?.id, oldDayId); assert.equal(snapshot.days.find(d => d.id === oldDayId)?.notes, "原历史备注");
  for (const original of originals) assert.equal(snapshot.activities.find(a => a.id === original)?.sourceSystem, "虚构手工");
  for (const day of energyDays(snapshot, [], value.window.dates)) assert.equal(Number(day.totalKcal), 2400);
  for (const item of imported) { assert.equal(activityReadings(item).totalKcal, "300"); assert.equal(item.sourceDetails?.averageHR, 110); assert.equal(item.inclusion, "included"); }
  const versions = snapshot.days.map(d => [d.id, d.version]);
  await run(id, value, 6, { from, activate: true });
  const repeated = await readEnergySnapshot(db, id); assert.equal(repeated.activities.length, 8); assert.deepEqual(repeated.days.map(d => [d.id, d.version]), versions);
  assert.equal((await loadSources(db, id, now)).conflicts.length, 0);
});

test("手动保护日可追加全新来源运动，但不覆盖汇总、步数或复活已删除明细", async () => {
  const id = await owner(); await run(id, capture(), 0, { activate: true });
  const [before] = (await readEnergySnapshot(db, id)).days;
  const op = await submitEnergyOperation(db, { userId: id, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", id: before.id, version: before.version, date: today, totalKcal: "2500", steps: 700 }] });
  assert.ok(op.canConfirm); await decideEnergyOperation(db, id, op.id, op.revision, "confirm");
  const protectedVersion = (await readEnergySnapshot(db, id)).days.find(d => d.date === today)!.version;
  const value = capture(undefined, [workout(5001)], 2600); await run(id, value, 6);
  const state = await readEnergySnapshot(db, id), day = state.days.find(d => d.date === today)!;
  assert.equal(day.totalKcal, "2500.0000"); assert.equal(day.steps, 700); assert.equal(day.version, protectedVersion); assert.equal(day.adoption?.mode, "manual"); assert.equal(state.activities.length, 1);
  await db.delete(schema.activity).where(and(eq(schema.activity.userId, id), eq(schema.activity.id, state.activities[0].id)));
  await run(id, value, 12); assert.equal((await readEnergySnapshot(db, id)).activities.length, 0);
});

test("历史手动日总数不一致时保留旧值，仍载入有效运动和来源事实", async () => {
  const id = await owner(), date = addCalendarDays(today, -10), dayId = randomUUID();
  await db.insert(schema.energyDay).values({ id: dayId, userId: id, timezone:"Asia/Shanghai", date, entryMode: "total", activityMode: "total", totalKcal: "2700", notes: "手工总数" });
  const result = await run(id, capture(date, [workout(6001, date)]), 0, { from: date, activate: true }); assert.equal(result.status, "synced");
  const snapshot = await readEnergySnapshot(db, id), day = snapshot.days.find(d => d.id === dayId)!;
  assert.equal(day.totalKcal, "2700.0000"); assert.equal(day.version, 1); assert.equal(day.notes, "手工总数"); assert.equal(day.adoption?.mode, "manual");
  assert.equal(snapshot.activities.length, 1); assert.equal(Number(energyDays(snapshot, [], [date])[0].totalKcal), 2700);
});

test("同步勾选直接映射来源，取消及重新开启恢复对应字段，不需要再次选来源", async () => {
  const id = await owner(); let connection = (await loadSourceSettings(db, id)).connections[0];
  await configureConnection(db, id, connection.id, { version: connection.version, metrics: ["resting", "active", "steps"], active: true });
  let state = await loadSources(db, id, now); assert.equal(state.policy.strategy, "components"); assert.equal(state.policy.sources.total, null); assert.equal(state.policy.sources.activities, null);
  connection = state.connections[0]; await configureConnection(db, id, connection.id, { version: connection.version, metrics: ["total", "resting", "active", "steps", "activities"], active: true });
  state = await loadSources(db, id, now); assert.equal(state.policy.strategy, "total"); for (const source of Object.values(state.policy.sources)) assert.equal(source, connection.id);
});

test("仅开启一个消耗分项不补零或拼成全天总数，步数0仍完整保留", async () => {
  const id = await owner(), connection = (await loadSourceSettings(db, id)).connections[0];
  await configureConnection(db, id, connection.id, { version: connection.version, metrics: ["resting", "steps"], active: true });
  await run(id, capture(), 0, { activate: true });
  const day = energyDays(await readEnergySnapshot(db, id), [], [today])[0];
  assert.equal(day.restingKcal, "2000.0000"); assert.equal(day.activeKcal, null); assert.equal(day.totalKcal, null); assert.equal(day.steps, 0);
});

test("无权限的连接页面不查询健康资料；正常设置响应没有对照、凭据或历史数据", async () => {
  const id = await owner(), view = await loadSourceSettings(db, id);
  assert.deepEqual(Object.keys(view).sort(), ["connections", "enabled", "today"]);
  assert.ok(!JSON.stringify(view).includes("fictional-new-workflow-key"));
  const other = randomUUID(), locked = { select() { throw Error("Unexpected read"); } } as unknown as Parameters<typeof loadSourceSettings>[0];
  assert.equal((await loadSourceSettings(locked, other)).enabled, false);
});

test("历史范围无效不读取上游，也不能通过历史入口访问别人的账号", async () => {
  const id = await owner(); let calls = 0;
  await assert.rejects(synchronizeSource(db, id, { from: "2026-02-30", capture: async () => { calls++; return capture(); } }), /有效/);
  await assert.rejects(synchronizeSource(db, randomUUID(), { from: addCalendarDays(today, -20), activate: true }), /暂未/);
  assert.equal(calls, 0);
});
