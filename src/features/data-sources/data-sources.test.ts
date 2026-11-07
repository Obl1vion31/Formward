import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { sevenDays, type Capture, type Json } from "../garmin/client";
import { readEnergySnapshot, submitEnergyOperation, decideEnergyOperation } from "../activities/records";
import { activityReadings, energyDays } from "../activities/model";
import { revokeAccountAccess } from "../auth/account-security";
import { bindPersonalSource, configureConnection, configurePolicy } from "./mutations";
import { adoptSourceDays, resolveSourceConflict } from "./adoption";
import { synchronizeSource } from "./sync";
import { loadSources } from "./state";
import { normalizeGarmin } from "./garmin-adapter";
import { decryptCredential, encryptCredential } from "./credentials";
import { sourceMetrics, sourcePilotEnabled } from "./model";

const pg = new PGlite(), db = drizzle(pg, { schema }), now = new Date(), window = sevenDays(now), today = window.to;
before(async () => { process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY = "a".repeat(64); await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { delete process.env.FORMWARD_DATA_SOURCE_USER_ID; delete process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY; await pg.close(); });
async function owner(bind = true) {
  const userId = randomUUID(); await db.insert(schema.user).values({ id: userId, name: "虚构来源用户", email: `${userId}@example.test` });
  process.env.FORMWARD_DATA_SOURCE_USER_ID = userId;
  if (bind) await bindPersonalSource(db, userId, { apiKey: "fictional-personal-key-for-tests", version: 0 });
  return userId;
}
function sample(total = 2300, steps: number | null = 6500, activities: Json[] = []): Capture {
  const daily = { data: [{ calendarDate: today, calories: { burnedTotal: total, burnedResting: 2000, burnedActive: total - 2000 }, movement: { steps: { value: steps } }, wellnessChronology: { endTimestampGmt: `${today}T06:00:00.0` }, userProfilePk: 999, coordinates: { latitude: 12 } }] };
  return { mode: "demo", fetchedAt: now.toISOString(), window, region: "global", daily: { ok: true, data: daily, rawText: JSON.stringify(daily) }, activityPages: [{ ok: true, data: activities, rawText: JSON.stringify(activities) }], activitiesComplete: true };
}
const activity = (patch: Record<string, Json> = {}): Json => ({ activityId: 10001, activityName: "虚构跑步", activityType: { typeKey: "running" }, startTimeLocal: `${today} 10:00:00`, startTimeGMT: `${today} 02:00:00`, duration: 1800, calories: 300, bmrCalories: 40, averageHR: 133, ...patch });
async function sync(userId: string, capture = sample(), minutes = 0) { return synchronizeSource(db, userId, { now: new Date(+now + minutes * 60000), capture: async () => capture }); }
async function adopt(userId: string) { const view = await loadSources(db, userId, now), row = view.comparison.find(d => d.date === today)!; return adoptSourceDays(db, userId, { days: [{ date: today, digest: row.digest, includedActivityIds: row.manualActivities.map(a => a.id) }] }, now); }
async function write(userId: string, patch: Record<string, unknown>) {
  const [day] = (await readEnergySnapshot(db, userId)).days;
  const operation = await submitEnergyOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_energy_day", id: day.id, version: day.version, date: day.date, ...patch }] });
  assert.equal(operation.canConfirm, true, operation.rows[0].error); return decideEnergyOperation(db, userId, operation.id, operation.revision, "confirm");
}

test("固定账号开关默认拒绝，owner 角色不自动获得资格，普通账号只看未开放入口", async () => {
  const userId = await owner(false), other = randomUUID();
  assert.equal(sourcePilotEnabled(userId, undefined), true); assert.equal(sourcePilotEnabled(other), false); assert.equal(sourcePilotEnabled(userId, ""), false);
  await db.insert(schema.user).values({ id: other, name: "虚构其他 owner", email: `${other}@example.test`, role: "owner" });
  const view = await loadSources(db, other, now); assert.equal(view.enabled, false); assert.deepEqual(view.connections, []);
  await assert.rejects(bindPersonalSource(db, other, { apiKey: "fictional-key", version: 0 }), /暂未/);
  await assert.rejects(synchronizeSource(db, other), /暂未/);
  assert.equal((await db.select().from(schema.dataConnection)).filter(c => c.userId === other).length, 0);
});
test("凭据按账号与连接加密，不能换账号解密，浏览器模型不包含凭据", async () => {
  const userId = await owner(), [connection] = await db.select().from(schema.dataConnection).where(eq(schema.dataConnection.userId, userId));
  assert.ok(!connection.credential.includes("fictional")); assert.equal(decryptCredential(connection.credential, userId, connection.id), "fictional-personal-key-for-tests");
  assert.throws(() => decryptCredential(connection.credential, randomUUID(), connection.id), /重新绑定/);
  const encrypted = encryptCredential("fake", userId, connection.id); assert.throws(() => decryptCredential(encrypted.slice(0, -2) + "xx", userId, connection.id));
  const view = JSON.stringify(await loadSources(db, userId, now)); assert.ok(!view.includes(connection.credential)); assert.ok(!view.includes("fictional-personal-key"));
});
test("V2 白名单只保留选中字段，0 与未知分开，秒转分钟且不推算纯运动热量", () => {
  const capture = sample(2000, 0, [activity()]), selected = normalizeGarmin(capture, ["steps"]);
  assert.equal(selected.facts.length, 1); const day = selected.facts[0].payload; assert.equal(day.kind, "day"); if (day.kind !== "day") return;
  assert.equal(day.steps, 0); assert.equal(day.total, null); assert.ok(!JSON.stringify(selected).includes("latitude"));
  const full = normalizeGarmin(capture, [...sourceMetrics]), event = full.facts.find(f => f.kind === "activity")!;
  assert.equal(event.payload.kind, "activity"); if (event.payload.kind !== "activity") return;
  assert.equal(event.payload.durationMinutes, "30"); assert.equal(event.payload.caloriesKcal, "300"); assert.equal(event.payload.bmrKcal, "40");
});
test("重复或不安全活动 ID、多份同日汇总、父子记录和无效时间不擅自合并", () => {
  const capture = sample(2300, 6500, [activity(), activity(), activity({ activityId: 10002, parentId: 10001 }), activity({ activityId: Number.MAX_SAFE_INTEGER + 1 })]);
  const out = normalizeGarmin(capture, [...sourceMetrics]); assert.equal(out.facts.filter(f => f.kind === "activity").length, 1); assert.equal(out.activitiesComplete, false);
  const duplicate = sample(); if (duplicate.daily.ok) duplicate.daily.data = { data: [ { calendarDate: today }, { calendarDate: today } ] };
  assert.equal(normalizeGarmin(duplicate, ["total"]).facts.length, 0);
});
test("首次同步仅保存来源事实，正式记录须经七日对照明确采用", async () => {
  const userId = await owner(), result = await sync(userId); assert.equal(result.status, "synced");
  assert.equal((await readEnergySnapshot(db, userId)).days.length, 0);
  const view = await loadSources(db, userId, now), day = view.comparison.find(d => d.date === today)!;
  assert.equal(day.proposed.total, "2300"); assert.equal(day.proposed.steps, 6500); assert.equal(day.mode, "unadopted");
  await adopt(userId); const snapshot = await readEnergySnapshot(db, userId), resolved = energyDays(snapshot, [], [today])[0];
  assert.equal(Number(resolved.totalKcal), 2300); assert.equal(resolved.restingKcal, "2000"); assert.equal(resolved.activeKcal, "300"); assert.equal(resolved.steps, 6500); assert.equal(resolved.record?.adoption?.mode, "source");
  assert.equal(snapshot.days[0].entryMode, "total"); assert.equal(snapshot.days[0].totalKcal, "2300.0000"); // 旧应用回退仍读到正确总数。
});
test("来源运动不会再加到日总数，gross 与 BMR 事实保留但不猜纯活动", async () => {
  const userId = await owner(); await sync(userId, sample(2300, 6500, [activity()])); await adopt(userId);
  const snapshot = await readEnergySnapshot(db, userId), day = energyDays(snapshot, [], [today])[0];
  assert.equal(Number(day.totalKcal), 2300); assert.equal(snapshot.activities.length, 1); assert.equal(snapshot.activities[0].inclusion, "included");
  const reading = activityReadings(snapshot.activities[0]); assert.equal(reading.totalKcal, "300"); assert.equal(reading.countedKcal, null);
});
test("重复同步不增加事实或正式版本，后台旧请求不会重置人工备注", async () => {
  const userId = await owner(); await sync(userId); await adopt(userId);
  await write(userId, { notes: "虚构备注" }); const before = (await readEnergySnapshot(db, userId)).days[0];
  await sync(userId, sample(), 6); const after = (await readEnergySnapshot(db, userId)).days[0];
  assert.equal(after.version, before.version); assert.equal(after.notes, "虚构备注"); assert.equal(after.adoption?.mode, "source");
});
test("手动改数保护整天，后续同步保留手动值，重新采用显示最新差异", async () => {
  const userId = await owner(); await sync(userId); await adopt(userId); await write(userId, { totalKcal: "2400", steps: 6800 });
  await sync(userId, sample(2600, 8000), 6);
  const before = energyDays(await readEnergySnapshot(db, userId), [], [today])[0]; assert.equal(Number(before.totalKcal), 2400); assert.equal(before.steps, 6800); assert.equal(before.record?.adoption?.mode, "manual");
  const view = await loadSources(db, userId, now); assert.equal(view.comparison.find(d => d.date === today)?.proposed.total, "2600");
  await adopt(userId); const after = energyDays(await readEnergySnapshot(db, userId), [], [today])[0]; assert.equal(Number(after.totalKcal), 2600); assert.equal(after.record?.adoption?.mode, "source");
});
test("旧对照不能覆盖并发修改，取消对照没有正式写入", async () => {
  const userId = await owner(); await sync(userId); const view = await loadSources(db, userId, now), row = view.comparison.find(d => d.date === today)!;
  await sync(userId, sample(2500), 6);
  await assert.rejects(adoptSourceDays(db, userId, { days: [{ date: today, digest: row.digest, includedActivityIds: [] }] }, now), /已经改变/);
  assert.equal((await readEnergySnapshot(db, userId)).days.length, 0);
});
test("暂停或修改同步内容使在途旧结果失效，不产生正式或来源事实", async () => {
  const userId = await owner(); let release!: (capture: Capture) => void, started!: () => void;
  const ready = new Promise<void>(r => { started = r; }); const wait = new Promise<Capture>(r => { release = r; });
  const run = synchronizeSource(db, userId, { now, capture: async () => { started(); return wait; } }); await ready;
  const [connection] = (await loadSources(db, userId, now)).connections;
  await configureConnection(db, userId, connection.id, { version: connection.version, metrics: ["total"], active: false });
  release(sample()); assert.equal((await run).status, "discarded");
  assert.equal((await db.select().from(schema.dataSourceFact).where(eq(schema.dataSourceFact.userId, userId))).length, 0);
});
test("租约防止并发读取，自动刷新至少间隔五分钟", async () => {
  const userId = await owner(); let release!: (capture: Capture) => void, started!: () => void, calls = 0;
  const ready = new Promise<void>(r => { started = r; }), wait = new Promise<Capture>(r => { release = r; });
  const run = synchronizeSource(db, userId, { now, capture: async () => { calls++; started(); return wait; } }); await ready;
  assert.equal((await sync(userId)).status, "busy"); release(sample()); await run; assert.equal(calls, 1);
  assert.equal((await sync(userId, sample(), 4)).status, "fresh"); assert.equal((await sync(userId, sample(), 6)).status, "synced");
});
test("失败保留上次成功时间与数据，未知不写成零", async () => {
  const userId = await owner(); await sync(userId); await adopt(userId); const before = await loadSources(db, userId, now);
  const capture = sample(); capture.daily = { ok: false, code: "http_429", message: "佳明请求频率受限，请稍后重新读取。" };
  const result = await sync(userId, capture, 6); assert.equal(result.status, "failed");
  const after = await loadSources(db, userId, now); assert.equal(after.connections[0].lastSuccessAt, before.connections[0].lastSuccessAt); assert.equal(Number(after.comparison.find(d => d.date === today)?.current.total), 2300);
});
test("采用来源须属于当前账号且开启相应字段；版本冲突不改设置", async () => {
  const userId = await owner(), view = await loadSources(db, userId, now), input = { ...view.policy, sources: { ...view.policy.sources, total: randomUUID() } };
  const { effectiveFrom, ...raw } = input; void effectiveFrom;
  await assert.rejects(configurePolicy(db, userId, raw), /本账号/);
  await assert.rejects(configurePolicy(db, userId, { ...raw, version: 0 }), /已改变/);
  assert.equal((await loadSources(db, userId, now)).policy.version, view.policy.version);
});
test("疑似重复运动保持待核对，明确关联不新增；跨账号关联拒绝", async () => {
  const userId = await owner(), activityId = randomUUID();
  await db.insert(schema.activity).values({ id: activityId, userId, date: today, name: "虚构跑步", durationMinutes: "30", caloriesKcal: "300", timezone: "Asia/Shanghai" });
  await sync(userId, sample(2300, 6500, [activity()])); let view = await loadSources(db, userId, now); assert.equal(view.conflicts.length, 1);
  await adopt(userId); assert.equal((await readEnergySnapshot(db, userId)).activities.length, 1);
  view = await loadSources(db, userId, now); const conflict = view.conflicts[0];
  await assert.rejects(resolveSourceConflict(db, userId, { id: conflict.id, version: conflict.version, decision: "link", activityId: randomUUID(), activityVersion: 1 }), /不属于/);
  const existing = (await readEnergySnapshot(db, userId)).activities[0];
  await resolveSourceConflict(db, userId, { id: conflict.id, version: conflict.version, decision: "link", activityId: existing.id, activityVersion: existing.version });
  await sync(userId, sample(2350, 6700, [activity()]), 6); assert.equal((await readEnergySnapshot(db, userId)).activities.length, 1); assert.equal((await loadSources(db, userId, now)).conflicts.length, 0);
});
test("撤销全部访问暂停连接，旧任务不写入，重新启用必须重新绑定", async () => {
  const userId = await owner(); let release!: (capture: Capture) => void, started!: () => void;
  const ready = new Promise<void>(r => { started = r; }), wait = new Promise<Capture>(r => { release = r; });
  const run = synchronizeSource(db, userId, { now, capture: async () => { started(); return wait; } }); await ready;
  await db.transaction(tx => revokeAccountAccess(tx, userId)); release(sample()); assert.equal((await run).status, "discarded");
  const [connection] = (await loadSources(db, userId, now)).connections; assert.equal(connection.status, "paused");
  await assert.rejects(configureConnection(db, userId, connection.id, { version: connection.version, metrics: connection.metrics, active: true }), /重新绑定/);
  assert.equal((await db.select().from(schema.dataSourceFact).where(and(eq(schema.dataSourceFact.userId, userId)))).length, 0);
});

test("运动事实人工维护后保护整天，后续来源更新不改变已采用运动明细", async () => {
  const userId = await owner(); await sync(userId, sample(2300, 6500, [activity()])); await adopt(userId);
  const before = (await readEnergySnapshot(db, userId)).activities[0];
  const operation = await submitEnergyOperation(db, { userId, origin: "manual" }, { operationId: randomUUID(), actions: [{ kind: "save_activity", id: before.id, version: before.version, date: today, name: "人工修改跑步", durationMinutes: "31", inclusion: "included" }] });
  assert.equal(operation.canConfirm, true); await decideEnergyOperation(db, userId, operation.id, operation.revision, "confirm");
  await sync(userId, sample(2500, 7000, [activity({ calories: 380, bmrCalories: 45 })]), 6);
  const state = await readEnergySnapshot(db, userId); assert.equal(state.days[0].adoption?.mode, "manual"); assert.equal(state.activities[0].name, "人工修改跑步"); assert.equal(activityReadings(state.activities[0]).totalKcal, "300"); assert.equal(state.activities[0].sourceDetails?.bmrKcal, "40");
});
test("分项策略复用同一日汇总，未知分项不补零也不绘制虚假占比", async () => {
  const userId = await owner(); await sync(userId); let view = await loadSources(db, userId, now);
  await configurePolicy(db, userId, { version: view.policy.version, strategy: "components", sources: view.policy.sources }); await adopt(userId);
  let day = energyDays(await readEnergySnapshot(db, userId), [], [today])[0]; assert.equal(Number(day.totalKcal), 2300); assert.equal(day.record?.entryMode, "components"); assert.equal(day.record?.adoption?.metadata?.compositionKnown, true);
  const capture = sample(); if (capture.daily.ok) capture.daily.data = { data: [{ calendarDate: today, calories: { burnedTotal: 2400, burnedResting: 2000, burnedActive: null }, movement: { steps: { value: 0 } } }] };
  await sync(userId, capture, 6); day = energyDays(await readEnergySnapshot(db, userId), [], [today])[0]; assert.equal(day.activeKcal, null); assert.equal(day.totalKcal, null); assert.equal(day.steps, 0); assert.equal(day.record?.adoption?.metadata?.compositionKnown, false);
  view = await loadSources(db, userId, now); assert.equal(view.comparison.find(d => d.date === today)?.proposed.active, null);
});
