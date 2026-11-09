import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../db/schema";
import { deleteMeasurementCell, createMeasurementDate, listMeasurementDates, saveMeasurementDay, skipMeasurementReminder, type PeriodEdit, type SaveMeasurementDayInput } from "./editing";
import { listMeasurements, saveReportedMeasurements } from "./records";
import { entryMetrics, entryPeriods, localMeasurementDate, missingMeasurementCells } from "./entry-state";
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

test("同槽覆盖保留遗漏项，单项删除保留另一指标，最后一项删除不复活旧值",async()=>{
 const actor=await owner("single-slot-delete");const date="2024-04-04";
 await saveMeasurementDay(db,actor,input(date,{daytime:{weightKg:"70",bodyFatPercent:"20",fasting:true}}));
 await saveMeasurementDay(db,actor,input(date,{daytime:{weightKg:"71",fasting:true}}));
 let rows=await listMeasurements(db,actor.userId);assert.equal(rows.length,1);assert.equal(rows[0].weightKg,"71.00");assert.equal(rows[0].bodyFatPercent,"20.00");
 const deleted={recordId:rows[0].id,version:rows[0].updatedAt.toISOString(),metric:"weightKg" as const,operationId:randomUUID()};await deleteMeasurementCell(db,actor,deleted);await deleteMeasurementCell(db,actor,deleted);
 rows=await listMeasurements(db,actor.userId);assert.equal(rows[0].weightKg,null);assert.equal(rows[0].bodyFatPercent,"20.00");
 await deleteMeasurementCell(db,actor,{recordId:rows[0].id,version:rows[0].updatedAt.toISOString(),metric:"bodyFatPercent",operationId:randomUUID()});assert.equal((await listMeasurements(db,actor.userId)).length,0);
 await saveMeasurementDay(db,actor,input(date,{daytime:{weightKg:"70",fasting:true}}));assert.equal((await listMeasurements(db,actor.userId)).length,1);
 await assert.rejects(saveMeasurementDay(db,actor,input("2999-01-01",{daytime:{weightKg:"70",fasting:true}})),/未来/);
});

test("覆盖旧候选统一归档，删除跨账号／旧版本拒绝且审计失败回滚",async()=>{const actor=await owner("candidate-delete"),other=await owner("candidate-delete-other"),date="2024-04-04";await saveMeasurementDay(db,actor,input(date,{daytime:{weightKg:"70",bodyFatPercent:"20",fasting:true}}));const old=(await listMeasurements(db,actor.userId))[0];const id=randomUUID();await db.insert(schema.measurement).values({...old,id,weightKg:"71.00",updatedAt:new Date(old.updatedAt.getTime()+10),deduplicationKey:randomUUID()});await saveMeasurementDay(db,actor,input(date,{daytime:{bodyFatPercent:"21",fasting:true}}));const current=(await listMeasurements(db,actor.userId))[0];assert.equal(current.id,id);assert.equal(current.weightKg,"71.00");assert.equal((await db.select().from(schema.measurement).where(eq(schema.measurement.id,old.id)))[0].deletedAt!==null,true);const request={recordId:id,version:current.updatedAt.toISOString(),metric:"weightKg" as const,operationId:randomUUID()};await assert.rejects(deleteMeasurementCell(db,other,request),/变化/);await assert.rejects(deleteMeasurementCell(db,actor,{...request,version:old.updatedAt.toISOString(),operationId:randomUUID()}),/变化/);await pg.exec("CREATE FUNCTION reject_delete_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fictional delete failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_delete_audit BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_delete_audit();");try{await assert.rejects(deleteMeasurementCell(db,actor,request));}finally{await pg.exec("DROP TRIGGER reject_delete_audit ON measurement_events; DROP FUNCTION reject_delete_audit();");}assert.equal((await listMeasurements(db,actor.userId))[0].weightKg,"71.00");});
