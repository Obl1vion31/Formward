import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { saveMeasurementDay, type SaveMeasurementDayInput } from "./editing";
import { listMeasurements, saveReportedMeasurements } from "./records";
import { fillMissingMeasurementSources, listMeasurementSources } from "./sources";
import { measurementDayAction } from "./entry-state";

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
async function owner() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: "虚构来源用户", email: `${id}@example.test` });
  return { userId: id, actorId: id };
}
const input = (periods: SaveMeasurementDayInput["periods"], date = "2024-04-04") => ({ date, timezone: "Asia/Shanghai", periods, operationId: randomUUID() });

test("实测来源必填，来源不能单独创建测量；无效与整日失败不留下建议", async () => {
  const actor = await owner();
  for (const deviceLabel of [undefined, null, "", " ", "x".repeat(301), "bad\nsource"]) {
    await assert.rejects(saveMeasurementDay(db, actor, input({ daytime: { weightKg: "70", fasting: true, deviceLabel } })), /数据来源/);
  }
  await assert.rejects(saveMeasurementDay(db, actor, input({ daytime: { deviceLabel: "虚构秤" } })), /至少/);
  await assert.rejects(saveMeasurementDay(db, actor, input({ daytime: { weightKg: "70", fasting: true, deviceLabel: "失败来源" }, evening: { weightKg: "invalid", deviceLabel: "另一失败来源" } })));
  assert.deepEqual(await listMeasurementSources(db, actor.userId), []);
  assert.deepEqual(await listMeasurements(db, actor.userId), []);
  assert.deepEqual(await db.select().from(schema.measurementImport).where(eq(schema.measurementImport.userId, actor.userId)), []);
});

test("晨晚独立来源、名称去空白与最近排序；只改来源保留原始录入方式、时间和值", async () => {
  const actor = await owner();
  await saveMeasurementDay(db, actor, input({ daytime: { weightKg: "70", fasting: true, deviceLabel: " 虚构晨间秤-应用 " }, evening: { bodyFatPercent: "20", deviceLabel: "虚构晚间秤" } }));
  let rows = await listMeasurements(db, actor.userId);
  assert.equal(rows.find(row => row.period === "daytime")!.deviceLabel, "虚构晨间秤-应用");
  assert.equal(rows.find(row => row.period === "evening")!.deviceLabel, "虚构晚间秤");
  const preciseDate = "2024-04-05";
  await saveReportedMeasurements(db, { ...actor, requestKey: "1".repeat(64), entryChannel: "api", deviceLabel: "虚构晨间秤-应用", records: [{ analysisDate: preciseDate, period: "daytime", fasting: true, weightKg: "70.20", bodyFatPercent: null, measuredAt: `${preciseDate} 08:30:00`, timezone: "Asia/Shanghai" }] });
  const before = (await listMeasurements(db, actor.userId)).find(row => row.analysisDate === preciseDate)!;
  await saveMeasurementDay(db, actor, input({ daytime: { recordId: before.id, version: before.updatedAt.toISOString(), deviceLabel: "新虚构来源" } }, preciseDate));
  rows = await listMeasurements(db, actor.userId);
  const after = rows.find(row => row.id === before.id)!;
  for (const field of Object.keys(before) as (keyof typeof before)[]) if (field !== "deviceLabel" && field !== "updatedAt") assert.deepEqual(after[field], before[field], field);
  assert.equal(rows.find(row => row.analysisDate === "2024-04-04" && row.period === "daytime")!.deviceLabel, "虚构晨间秤-应用", "名称快照不联动历史");
  assert.equal((await listMeasurementSources(db, actor.userId))[0], "新虚构来源");
  const events = await db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.measurementId, before.id));
  assert.equal(events.at(-1)!.actorId, actor.userId);
  assert.equal((events.at(-1)!.snapshot.after as typeof after).deviceLabel, "新虚构来源");
});

test("重复与并发不重复来源，跨账号读取、编辑与旧版本受保护", async () => {
  const actor = await owner(), other = await owner();
  const request = input({ daytime: { bodyFatPercent: "20", fasting: true, deviceLabel: "虚构重复来源" } });
  const results = await Promise.all([saveMeasurementDay(db, actor, request), saveMeasurementDay(db, actor, request)]);
  assert.equal(results.filter(result => result.repeated).length, 1);
  assert.deepEqual(await listMeasurementSources(db, actor.userId), ["虚构重复来源"]);
  assert.deepEqual(await listMeasurementSources(db, other.userId), []);
  const row = (await listMeasurements(db, actor.userId))[0];
  const edit = { daytime: { recordId: row.id, version: row.updatedAt.toISOString(), deviceLabel: "虚构新来源" } };
  await assert.rejects(saveMeasurementDay(db, other, input(edit)), /不存在/);
  await saveMeasurementDay(db, actor, input(edit));
  await assert.rejects(saveMeasurementDay(db, actor, input(edit)), /已变化/);
  assert.deepEqual(await listMeasurementSources(db, other.userId), []);
});

test("来源历史写入失败回滚测量、批次和审计；授权补齐仅修改目标账号未知实测", async () => {
  const actor = await owner(), other = await owner();
  await pg.exec("CREATE FUNCTION reject_source() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fictional failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_source BEFORE INSERT ON measurement_sources FOR EACH ROW EXECUTE FUNCTION reject_source();");
  try { await assert.rejects(saveMeasurementDay(db, actor, input({ evening: { weightKg: "70", deviceLabel: "回滚来源" } }))); }
  finally { await pg.exec("DROP TRIGGER reject_source ON measurement_sources; DROP FUNCTION reject_source();"); }
  assert.deepEqual(await listMeasurements(db, actor.userId), []);
  assert.deepEqual(await listMeasurementSources(db, actor.userId), []);
  assert.deepEqual(await db.select().from(schema.measurementEvent).where(eq(schema.measurementEvent.userId, actor.userId)), []);
  for (const target of [actor, other]) await saveReportedMeasurements(db, { ...target, requestKey: "2".repeat(64), entryChannel: "development_backend", records: [{ analysisDate: "2024-04-04", period: "evening", weightKg: "70", bodyFatPercent: null, fasting: false }] });
  const before = (await listMeasurements(db, actor.userId))[0];
  assert.equal((await fillMissingMeasurementSources(db, actor, "虚构已确认秤-应用")).updated, 1);
  assert.equal((await fillMissingMeasurementSources(db, actor, "虚构已确认秤-应用")).updated, 0);
  const after = (await listMeasurements(db, actor.userId))[0];
  for (const field of Object.keys(before) as (keyof typeof before)[]) if (field !== "deviceLabel" && field !== "updatedAt") assert.deepEqual(after[field], before[field]);
  assert.equal((await listMeasurements(db, other.userId))[0].deviceLabel, null);
});

test("操作列覆盖今天、过去、部分实测、仅体脂及估计共存", () => {
  const date = "2024-04-04";
  const row = { id: "fictional", analysisDate: date, period: "evening" as const, weightKg: null, bodyFatPercent: "20", fasting: false, sourceLocalTime: date, recordKind: "estimated" as "estimated" | "observed" };
  assert.equal(measurementDayAction([], date, date), "录入");
  assert.equal(measurementDayAction([], date, "2024-04-05"), "补录");
  assert.equal(measurementDayAction([row], date, date), "录入");
  assert.equal(measurementDayAction([row], date, "2024-04-05"), "补录");
  assert.equal(measurementDayAction([{ ...row, recordKind: "observed" }], date, date), "编辑");
  assert.equal(measurementDayAction([row, { ...row, recordKind: "observed" }], date, "2024-04-05"), "编辑");
});
