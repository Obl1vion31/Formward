import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import { createMeasurementDate, estimateMeasurementCell, listMeasurementDates, saveMeasurementDay, skipMeasurementReminder, type PeriodEdit, type SaveMeasurementDayInput } from "./editing";
import { listMeasurements, saveReportedMeasurements } from "./records";
import { entryMetrics, entryPeriods, localMeasurementDate, missingMeasurementCells } from "./entry-state";
import { applyHistoricalInitialization, previewHistoricalInitialization } from "./initialization";
import { measurementSummary } from "./summary";
import { eq } from "drizzle-orm";

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
async function owner(name: string, seed = false) {
  const id = `fictional-entry-${name}`;
  await db.insert(schema.user).values({ id, name: "虚构用户", email: `${id}@example.test` });
  const actor = { userId: id, actorId: id };
  if (seed) await saveReportedMeasurements(db, { ...actor, requestKey: randomUUID().replaceAll("-", "").padEnd(64, "a"), entryChannel: "manual", records: [1, 2, 3].flatMap(day => entryPeriods.map(period => ({ recordDate: `2024-04-0${day}`, period, weightKg: (70 + day / 10 + (period === "evening" ? .5 : 0)).toFixed(2), bodyFatPercent: (20 + day / 10 + (period === "evening" ? .4 : 0)).toFixed(2), fasting: period === "daytime" }))) });
  return actor;
}
const input = (date: string, periods: SaveMeasurementDayInput["periods"]): SaveMeasurementDayInput => ({ date, periods: Object.fromEntries(Object.entries(periods).map(([period, edit]) => [period, { deviceLabel: "虚构体重秤", ...edit }])), timezone: "Asia/Shanghai", operationId: randomUUID() });

test("四项全部 15 种非空组合都可保存，补填仅合并剩余指标，不自动估计", async () => {
  const actor = await owner("combinations");
  const cells = entryPeriods.flatMap(period => entryMetrics.map(metric => ({ period, metric })));
  for (let mask = 1; mask < 16; mask++) {
    const date = `2024-03-${String(mask).padStart(2, "0")}`;
    const periods: SaveMeasurementDayInput["periods"] = {};
    cells.forEach((cell, index) => { if (mask & (1 << index)) { const edit = periods[cell.period] ??= {}; edit[cell.metric] = cell.metric === "weightKg" ? "70.00" : "20.00"; edit.fasting = cell.period === "daytime"; } });
    const first = input(date, periods);
    await saveMeasurementDay(db, actor, first);
    assert.equal((await saveMeasurementDay(db, actor, first)).repeated, true);
    const rows = (await listMeasurements(db, actor.userId)).filter(row => row.recordDate === date);
    assert.ok(rows.every(row => row.recordKind === "observed"));
    const empty = missingMeasurementCells(rows, date);
    assert.equal(empty.length, 4 - cells.filter((_, index) => mask & (1 << index)).length);
    const rest: SaveMeasurementDayInput["periods"] = {};
    for (const cell of empty) {
      const row = rows.find(row => row.period === cell.period);
      const edit = rest[cell.period] ??= row ? { recordId: row.id, version: row.updatedAt.toISOString() } : { fasting: cell.period === "daytime" };
      edit[cell.metric] = cell.metric === "weightKg" ? "70.00" : "20.00";
    }
    if (empty.length) await saveMeasurementDay(db, actor, input(date, rest));
    const full = (await listMeasurements(db, actor.userId)).filter(row => row.recordDate === date);
    assert.equal(full.length, 2); assert.equal(missingMeasurementCells(full, date).length, 0);
    for (const row of rows) assert.deepEqual(full.find(after => after.id === row.id)!.originalValues, row.originalValues);
  }
  assert.equal((await listMeasurements(db, actor.userId)).filter(row => row.recordKind === "estimated").length, 0);
});

test("只录体脂参与体脂实测统计，体重保持未知；旧实测入口可独立补体重", async () => {
  const actor = await owner("fat-only");
  await saveReportedMeasurements(db, { ...actor, requestKey: "c".repeat(64), entryChannel: "manual", records: [{ recordDate: "2024-04-04", period: "daytime", weightKg: null, bodyFatPercent: "21.00", fasting: true }] });
  const rows = await listMeasurements(db, actor.userId);
  assert.equal(rows[0].weightKg, null);
  assert.equal(measurementSummary(rows, "weightKg").current, null);
  assert.equal(measurementSummary(rows, "bodyFatPercent").current?.bodyFatPercent, "21.00");
  await saveReportedMeasurements(db, { ...actor, requestKey: "d".repeat(64), entryChannel: "manual", records: [{ recordDate: "2024-04-04", period: "daytime", weightKg: "70.40", bodyFatPercent: null, fasting: true }] });
  const after = await listMeasurements(db, actor.userId);
  assert.equal(after.length, 1); assert.equal(after[0].bodyFatPercent, "21.00"); assert.equal(after[0].weightKg, "70.40");
});

test("晨间录入必须空腹，非空腹／未知／遗漏条件整日回滚，正常与重复写入保持", async () => {
  const actor = await owner("fasting-only");
  for (const fasting of [false, null, undefined]) {
    await assert.rejects(saveMeasurementDay(db, actor, input("2024-04-04", { daytime: { weightKg: "70.00", ...(fasting === undefined ? {} : { fasting }) }, evening: { bodyFatPercent: "20.00" } })), /晨间只记录空腹/);
    assert.deepEqual(await listMeasurements(db, actor.userId), []);
    assert.deepEqual(await listMeasurementDates(db, actor.userId), []);
  }
  const request = input("2024-04-04", { daytime: { bodyFatPercent: "20.00", fasting: true } });
  await saveMeasurementDay(db, actor, request);
  assert.equal((await saveMeasurementDay(db, actor, request)).repeated, true);
  const original = (await listMeasurements(db, actor.userId))[0];
  for (const fasting of [false, null]) await assert.rejects(saveMeasurementDay(db, actor, input(original.recordDate, { daytime: { recordId: original.id, version: original.updatedAt.toISOString(), fasting } })), /晨间只记录空腹/);
  assert.deepEqual((await listMeasurements(db, actor.userId))[0], original);
});

test("旧非空腹／未知晨间保持原样，不能通过新表单改值或变为空腹，晚间仍可录入", async () => {
  const actor = await owner("legacy-fasting");
  for (const [index, fasting] of [false, null].entries()) {
    const date = `2024-04-0${index + 4}`;
    await saveReportedMeasurements(db, { ...actor, requestKey: String(index + 1).repeat(64), entryChannel: "api", records: [{ recordDate: date, period: "daytime", weightKg: "70.00", bodyFatPercent: null, fasting }] });
    const original = (await listMeasurements(db, actor.userId)).find(row => row.recordDate === date)!;
    for (const change of [{ weightKg: "71.00" }, { weightKg: "71.00", fasting: true }]) await assert.rejects(saveMeasurementDay(db, actor, input(date, { daytime: { recordId: original.id, version: original.updatedAt.toISOString(), ...change } })), /保持只读/);
    await saveMeasurementDay(db, actor, input(date, { evening: { weightKg: "71.00" } }));
    assert.deepEqual((await listMeasurements(db, actor.userId)).find(row => row.id === original.id), original);
  }
});

test("先估晚间只保存晚间，后填晨间不改已有估计；先保存晨间则以实测加典型差", async () => {
  const actor = await owner("estimate-order", true);
  await estimateMeasurementCell(db, actor, { date: "2024-04-04", period: "evening", metric: "weightKg", operationId: randomUUID() });
  const estimate = (await listMeasurements(db, actor.userId)).find(row => row.recordDate === "2024-04-04")!;
  assert.equal(estimate.weightKg, "70.90");
  assert.ok(estimate.estimation?.method === "morning-baseline-v3");
  assert.equal(estimate.estimation.weightKg?.basis, "morning-trend-plus-difference");
  assert.equal((await listMeasurements(db, actor.userId)).some(row => row.recordDate === "2024-04-04" && row.period === "daytime"), false);
  await saveMeasurementDay(db, actor, input("2024-04-04", { daytime: { weightKg: "80.00", fasting: true } }));
  assert.deepEqual((await listMeasurements(db, actor.userId)).find(row => row.id === estimate.id), estimate);
  await saveMeasurementDay(db, actor, input("2024-04-05", { daytime: { weightKg: "70.20", fasting: true } }));
  await estimateMeasurementCell(db, actor, { date: "2024-04-05", period: "evening", metric: "weightKg", operationId: randomUUID() });
  const anchored = (await listMeasurements(db, actor.userId)).find(row => row.recordDate === "2024-04-05" && row.period === "evening")!;
  assert.equal(anchored.weightKg, "70.70");
  assert.ok(anchored.estimation?.method === "morning-baseline-v3");
  assert.equal(anchored.estimation.weightKg?.basis, "same-day-morning");
});

test("单项估算保留其他空项，按指标合并依据；补录实测只替代对应估计", async () => {
  const actor = await owner("cell", true), date = "2024-04-04";
  const request = { date, period: "evening" as const, metric: "weightKg" as const, operationId: randomUUID() };
  await estimateMeasurementCell(db, actor, request);
  assert.equal((await estimateMeasurementCell(db, actor, request)).repeated, true);
  let rows = (await listMeasurements(db, actor.userId)).filter(row => row.recordDate === date);
  assert.equal(rows.length, 1); assert.equal(rows[0].weightKg, "70.90"); assert.equal(rows[0].bodyFatPercent, null);
  assert.equal(missingMeasurementCells(rows, date).length, 3);
  const first = rows[0];
  await estimateMeasurementCell(db, actor, { date, period: "evening", metric: "bodyFatPercent", operationId: randomUUID() });
  rows = (await listMeasurements(db, actor.userId)).filter(row => row.recordDate === date);
  assert.equal(rows.length, 1); assert.equal(rows[0].id, first.id); assert.equal(rows[0].bodyFatPercent, "20.80");
  assert.deepEqual(rows[0].estimation?.weightKg, first.estimation?.weightKg);
  const fatEvidence = rows[0].estimation?.bodyFatPercent;
  await saveMeasurementDay(db, actor, input(date, { evening: { weightKg: "71.00" } }));
  rows = (await listMeasurements(db, actor.userId)).filter(row => row.recordDate === date);
  const remaining = rows.find(row => row.recordKind === "estimated")!;
  assert.equal(remaining.weightKg, null); assert.equal(remaining.bodyFatPercent, "20.80"); assert.deepEqual(remaining.estimation?.bodyFatPercent, fatEvidence);
  assert.equal(missingMeasurementCells(rows, date).length, 2);
  await assert.rejects(estimateMeasurementCell(db, actor, { ...request, operationId: randomUUID() }), /已有数值/);
});

test("历史编辑保留准确时间和来源；显式清空与遗漏区分，不能清空整条测量", async () => {
  const actor = await owner("precise-edit"), date = "2024-04-04";
  await saveReportedMeasurements(db, { ...actor, requestKey: "e".repeat(64), entryChannel: "api", records: [{ recordDate: date, period: "daytime", weightKg: "70.00", bodyFatPercent: "20.00", fasting: true, measuredAt: `${date} 08:30:00`, timezone: "Asia/Shanghai" }] });
  const original = (await listMeasurements(db, actor.userId))[0];
  await saveMeasurementDay(db, actor, { ...input(date, { daytime: { recordId: original.id, version: original.updatedAt.toISOString(), weightKg: "70.10" } }), timezone: "America/New_York" });
  let current = (await listMeasurements(db, actor.userId))[0];
  for (const field of ["bodyFatPercent", "fasting", "sourceLocalTime", "recordDate", "period", "timezone", "occurredAt", "utcOffsetMinutes", "timePrecision", "sourceType", "entryChannel", "originalValues", "createdBy", "createdAt"] as const) assert.deepEqual(current[field], original[field], field);
  await saveMeasurementDay(db, actor, input(date, { daytime: { recordId: current.id, version: current.updatedAt.toISOString(), weightKg: null } }));
  current = (await listMeasurements(db, actor.userId))[0];
  assert.equal(current.weightKg, null); assert.equal(current.bodyFatPercent, "20.00");
  await assert.rejects(saveMeasurementDay(db, actor, input(date, { daytime: { recordId: current.id, version: current.updatedAt.toISOString(), bodyFatPercent: null } })), /至少/);
  assert.deepEqual((await listMeasurements(db, actor.userId))[0], current, "无效清空事务不改变数据");
});

test("网页仅修改 API 实测时区，数值与原始时间保持，版本和账号隔离生效", async () => {
  const actor = await owner("timezone-only"), other = await owner("timezone-other"), date = "2024-04-04";
  await saveReportedMeasurements(db, { ...actor, requestKey: "a".repeat(64), entryChannel: "api", deviceLabel: "虚构 API 秤", records: [
    { recordDate: date, period: "daytime", weightKg: "70.20", bodyFatPercent: "20.10", fasting: true },
    { recordDate: date, period: "evening", weightKg: "70.80", bodyFatPercent: "20.30", fasting: false, measuredAt: "2024-04-05 00:30:00", timezone: "Asia/Shanghai" },
  ] });
  const before = await listMeasurements(db, actor.userId), morning = before.find(row => row.period === "daytime")!, evening = before.find(row => row.period === "evening")!;
  const request: SaveMeasurementDayInput = { date, timezone: null, operationId: randomUUID(), periods: {
    daytime: { recordId: morning.id, version: morning.updatedAt.toISOString(), timezone: "+08:00" },
    evening: { recordId: evening.id, version: evening.updatedAt.toISOString(), timezone: "+07:00" },
  } };
  await assert.rejects(saveMeasurementDay(db, other, request), /不属于/);
  await assert.rejects(saveMeasurementDay(db, actor, { ...request, operationId: randomUUID(), periods: { daytime: { ...request.periods.daytime, timezone: "+14:15" } } }), /时区/);
  assert.deepEqual(await listMeasurements(db, actor.userId), before);
  await saveMeasurementDay(db, actor, request); assert.equal((await saveMeasurementDay(db, actor, request)).repeated, true);
  const after = await listMeasurements(db, actor.userId);
  for (const row of before) for (const field of ["weightKg", "bodyFatPercent", "fasting", "sourceLocalTime", "recordDate", "period", "deviceLabel", "entryChannel", "originalValues", "timePrecision"] as const) assert.deepEqual(after.find(item => item.id === row.id)![field], row[field], field);
  const updatedMorning = after.find(row => row.id === morning.id)!, updatedEvening = after.find(row => row.id === evening.id)!;
  assert.equal(updatedMorning.timezone, "+08:00"); assert.equal(updatedMorning.occurredAt, null); assert.equal(updatedMorning.utcOffsetMinutes, null);
  assert.equal(updatedEvening.timezone, "+07:00"); assert.equal(updatedEvening.occurredAt!.toISOString(), "2024-04-04T17:30:00.000Z"); assert.equal(updatedEvening.utcOffsetMinutes, 420);
  await assert.rejects(saveMeasurementDay(db, actor, { ...request, operationId: randomUUID() }), /记录已变化/);
  const events = await db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.measurementId, morning.id));
  assert.equal(events.filter(event => event.action === "update").length, 1);
  assert.equal(events.find(event => event.action === "update")!.actorType, "user");
});

test("初始化冻结仍禁止估算，允许仅体脂补录，保留体重及另一时段快照", async () => {
  const actor = await owner("frozen", true), date = "2024-04-04";
  const request = { operationId: randomUUID(), range: { start: "2024-04-01", end: date } };
  const preview = await previewHistoricalInitialization(db, actor.userId, request);
  assert.equal(preview.alreadyApplied, false);
  if (preview.alreadyApplied) throw new Error("初始化预览已执行");
  await applyHistoricalInitialization(db, { ...actor, request, digest: preview.digest });
  const prior = (await listMeasurements(db, actor.userId)).filter(row => row.recordDate === date);
  await assert.rejects(estimateMeasurementCell(db, actor, { date, period: "daytime", metric: "weightKg", operationId: randomUUID() }), /固定/);
  await saveMeasurementDay(db, actor, input(date, { daytime: { bodyFatPercent: "21.00", fasting: true } }));
  const after = (await listMeasurements(db, actor.userId)).filter(row => row.recordDate === date);
  assert.deepEqual(after.find(row => row.period === "evening"), prior.find(row => row.period === "evening"));
  const morning = after.find(row => row.period === "daytime" && row.recordKind === "estimated")!;
  assert.equal(morning.bodyFatPercent, null); assert.equal(morning.weightKg, prior.find(row => row.period === "daytime")!.weightKg);
});

test("空白日期和当天停止提醒持久化、账号隔离，不伪造测量；时区日期正确", async () => {
  const actor = await owner("dates"), other = await owner("dates-other");
  await Promise.all([1, 2].map(() => createMeasurementDate(db, actor, "2024-04-04")));
  assert.equal((await listMeasurementDates(db, actor.userId)).length, 1);
  assert.deepEqual(await listMeasurements(db, actor.userId), []);
  const today = localMeasurementDate(new Date(), "Asia/Shanghai");
  await skipMeasurementReminder(db, actor, today, "Asia/Shanghai");
  assert.equal((await listMeasurementDates(db, actor.userId)).find(row => row.date === today)?.reminderSkipped, true);
  await createMeasurementDate(db, actor, today);
  assert.equal((await listMeasurementDates(db, actor.userId)).find(row => row.date === today)?.reminderSkipped, true);
  assert.deepEqual(await listMeasurementDates(db, other.userId), []);
  await assert.rejects(skipMeasurementReminder(db, actor, "2024-04-04", "Asia/Shanghai"));
  assert.equal(localMeasurementDate(new Date("2024-04-04T17:00:00Z"), "Asia/Shanghai"), "2024-04-05");
  assert.equal(localMeasurementDate(new Date("2024-04-04T17:00:00Z"), "America/New_York"), "2024-04-04");
});

test("无效、跨账号、旧版本、请求键内容冲突及并发重试均受保护", async () => {
  const actor = await owner("guards"), other = await owner("guards-other");
  const request = input("2024-04-04", { daytime: { weightKg: "70.00", fasting: true } });
  const results = await Promise.all([1, 2].map(() => saveMeasurementDay(db, actor, request)));
  assert.equal(results.filter(result => result.repeated).length, 1);
  const row = (await listMeasurements(db, actor.userId))[0];
  const edit: PeriodEdit = { recordId: row.id, version: row.updatedAt.toISOString(), weightKg: "71.00" };
  await assert.rejects(saveMeasurementDay(db, other, input(row.recordDate, { daytime: edit })), /不存在/);
  await assert.rejects(saveMeasurementDay(db, { ...actor, actorId: other.userId }, request), /不一致/);
  await assert.rejects(saveMeasurementDay(db, actor, { ...request, periods: { daytime: { weightKg: "72.00" } } }), /不同内容/);
  await saveMeasurementDay(db, actor, input(row.recordDate, { daytime: edit }));
  await assert.rejects(saveMeasurementDay(db, actor, input(row.recordDate, { daytime: edit })), /已变化/);
  await assert.rejects(saveMeasurementDay(db, actor, input("invalid-date", { daytime: { weightKg: "70" } })));
  await assert.rejects(saveMeasurementDay(db, actor, input("2024-04-05", { daytime: { weightKg: "abc" } })));
  await assert.rejects(saveMeasurementDay(db, actor, input("2024-04-05", { daytime: { deviceLabel: "虚构体重秤" } })), /至少/);
  assert.equal((await listMeasurements(db, actor.userId)).length, 1);
});

test("审计失败整日回滚；估算不足不填零；多个候选不视为空白", async () => {
  const actor = await owner("rollback");
  await pg.exec("CREATE FUNCTION reject_entry_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fictional entry failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_entry_audit BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_entry_audit();");
  try { await assert.rejects(saveMeasurementDay(db, actor, input("2024-04-04", { daytime: { weightKg: "70", fasting: true }, evening: { bodyFatPercent: "20" } }))); }
  finally { await pg.exec("DROP TRIGGER reject_entry_audit ON measurement_events; DROP FUNCTION reject_entry_audit();"); }
  assert.deepEqual(await listMeasurements(db, actor.userId), []); assert.deepEqual(await listMeasurementDates(db, actor.userId), []);
  const estimate = await estimateMeasurementCell(db, actor, { date: "2024-04-04", period: "daytime", metric: "weightKg", operationId: randomUUID() });
  assert.match(estimate.message, /保持空白/); assert.deepEqual(await listMeasurements(db, actor.userId), []);
  const rows = [1, 2].map(index => ({ id: `candidate-${index}`, recordDate: "2024-04-04", period: "daytime" as const, weightKg: "70.00", bodyFatPercent: null, fasting: true, sourceLocalTime: "2024-04-04" }));
  assert.deepEqual(missingMeasurementCells(rows, "2024-04-04"), entryMetrics.map(metric => ({ period: "evening", metric })));
});
