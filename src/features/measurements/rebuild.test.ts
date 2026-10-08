import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { saveReportedMeasurements, saveImportedMeasurements, listMeasurements, validateReportedMeasurement, type ReportedMeasurement } from "./records";
import { applyEstimationRebuild, previewEstimationRebuild } from "./rebuild";
import { restoreMeasurement } from "./maintenance";
import { buildMeasurementDays } from "./days";

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
let requestNumber = 100;
function record(day: number, period: "daytime" | "evening", weightKg: string, bodyFatPercent: string | null = "23.00"): ReportedMeasurement {
  return { recordDate: `2024-01-${String(day).padStart(2, "0")}`, period, weightKg, bodyFatPercent, fasting: period === "daytime" };
}
async function write(userId: string, records: ReportedMeasurement[], requestKey = (++requestNumber).toString(16).padStart(64, "0")) {
  return saveReportedMeasurements(db, { userId, actorId: userId, requestKey, entryChannel: "api", records });
}
async function setup(name: string) {
  const userId = `fictional-${name}`;
  await db.insert(schema.user).values({ id: userId, name: "虚构用户", email: `${name}@example.test` });
  await write(userId, [1, 2, 3].flatMap(day => [record(day, "daytime", (68 + (day - 1) / 10).toFixed(2), (23 + (day - 1) / 10).toFixed(2)), record(day, "evening", (68.59 + (day - 1) / 10).toFixed(2), (23.2 + (day - 1) / 10).toFixed(2))]));
  return userId;
}
const rebuildRequest = (start: string, end: string, operationId = randomUUID()) => ({ operationId, range: { start, end } });
async function rebuild(userId: string, start: string, end: string) {
  const request = rebuildRequest(start, end), preview = await previewEstimationRebuild(db, userId, request);
  return applyEstimationRebuild(db, { userId, actorId: userId, request, digest: preview.digest });
}

test("实测新增不自动估计；明确重建及后续补录保留其他指标快照", async () => {
  const owner = await setup("automatic");
  await write(owner, [record(4, "daytime", "68.27", "23.27")]);
  await write(owner, [record(5, "evening", "69.17", "24.60")]);
  assert.equal((await listMeasurements(db, owner)).filter(row => row.recordKind === "estimated").length, 0);
  await rebuild(owner, "2024-01-04", "2024-01-06");
  const before = (await listMeasurements(db, owner)).filter(row => row.recordKind === "estimated");
  assert.equal(before.find(r => r.recordDate === "2024-01-04")!.weightKg, "68.86");
  assert.equal(before.find(r => r.recordDate === "2024-01-05")!.weightKg, "68.58");
  assert.equal(before.filter(r => r.recordDate === "2024-01-06").length, 2);
  const requestKey = "e".repeat(64), future = [record(7, "daytime", "50.00"), record(7, "evening", "80.00")];
  await write(owner, future, requestKey);
  assert.equal((await write(owner, future, requestKey)).repeated, true);
  assert.deepEqual((await listMeasurements(db, owner)).filter(r => r.recordKind === "estimated" && r.recordDate < "2024-01-07"), before);
  await write(owner, [record(6, "daytime", "68.27", null)]);
  const after = await listMeasurements(db, owner);
  assert.deepEqual(after.filter(r => r.recordKind === "estimated" && r.recordDate < "2024-01-06"), before.filter(r => r.recordDate < "2024-01-06"));
  assert.deepEqual(after.find(r => r.recordDate === "2024-01-06" && r.period === "evening"), before.find(r => r.recordDate === "2024-01-06" && r.period === "evening"));
  const sameDay = buildMeasurementDays(after).find(d => d.date === "2024-01-06")!;
  assert.equal(sameDay.daytimeRecord!.weightKg, "68.27");
  assert.equal(sameDay.daytimeRecord!.recordKind, "observed");
  assert.equal(buildMeasurementDays(after, {}, "bodyFatPercent").find(d => d.date === "2024-01-06")!.daytimeRecord!.recordKind, "estimated");
  assert.ok(before.filter(r => r.recordDate === "2024-01-06").every(r => after.some(a => a.id === r.id)));
});

test("体脂缺项显式估计；实测恢复不重算，补录仅替代对应指标", async () => {
  const owner = await setup("partial");
  await write(owner, [record(4, "daytime", "68.27", null), record(4, "evening", "69.17", "24.60")]);
  assert.equal((await listMeasurements(db, owner)).filter(row => row.recordKind === "estimated").length, 0);
  await rebuild(owner, "2024-01-04", "2024-01-04");
  const before = await listMeasurements(db, owner);
  const actual = before.find(r => r.recordDate === "2024-01-04" && r.period === "daytime" && r.recordKind === "observed")!;
  const estimate = before.find(r => r.recordDate === "2024-01-04" && r.recordKind === "estimated")!;
  assert.equal(estimate.weightKg, null); assert.equal(estimate.bodyFatPercent, "24.40");
  assert.equal(actual.bodyFatPercent, null);
  await db.update(schema.measurement).set({ deletedAt: new Date() }).where(eq(schema.measurement.id, actual.id));
  assert.equal((await restoreMeasurement(db, { userId: owner, actorId: owner, id: actual.id })).restored, true);
  const rows = await listMeasurements(db, owner);
  assert.deepEqual(rows.find(r => r.id === estimate.id), estimate);
  const restored = rows.find(r => r.id === actual.id)!;
  assert.deepEqual([restored.weightKg, restored.bodyFatPercent, restored.originalValues], [actual.weightKg, null, actual.originalValues]);
  const eventsBefore = (await db.select().from(schema.measurementEvent)).length;
  assert.equal((await restoreMeasurement(db, { userId: owner, actorId: owner, id: actual.id })).restored, false);
  assert.equal((await db.select().from(schema.measurementEvent)).length, eventsBefore);
  const result = await write(owner, [record(4, "daytime", "68.27", "23.42")]);
  assert.equal(result.updated, 1); assert.equal(result.inserted, 0);
  const completed = await listMeasurements(db, owner);
  assert.equal(completed.find(r => r.id === actual.id)!.bodyFatPercent, "23.42");
  assert.deepEqual(completed.find(r => r.id === actual.id)!.originalValues, actual.originalValues);
  assert.ok(!completed.some(r => r.recordDate === "2024-01-04" && r.period === "daytime" && r.recordKind === "estimated"));
  assert.equal(completed.find(r => r.recordDate === "2024-01-04" && r.period === "evening")!.bodyFatPercent, "24.60");
  assert.equal((await write(owner, [record(4, "daytime", "68.27", "23.42")])).skipped, 1);
  await assert.rejects(write(owner, [record(4, "daytime", "68.27", "23.43")]), /已有不同实测/);
  const update = (await db.select().from(schema.measurementEvent)).find(e => e.measurementId === actual.id && e.snapshot.reason === "reported_missing_metrics")!;
  assert.ok(update.snapshot.before && update.snapshot.after && update.snapshot.reportedValues);
});

test("按时间导入不自动补估计，并保持账户隔离", async () => {
  const owner = await setup("import-auto"), other = await setup("import-other");
  const otherBefore = await listMeasurements(db, other);
  await saveImportedMeasurements(db, { userId: owner, actorId: owner, fileDigest: "f".repeat(64), sourceLabel: "fictional.tsv", captureChannel: "file", records: [{ sourceLocalTime: "2024-01-04 08:00:00", weightKg: "68.27", bodyFatPercent: null, sourceRow: 2, fasting: true, fastingSource: "user_confirmed" }] });
  const rows = await listMeasurements(db, owner);
  assert.ok(!rows.some(r => r.recordDate === "2024-01-04" && r.recordKind === "estimated"));
  assert.deepEqual(await listMeasurements(db, other), otherBefore);
});

test("重建清理旧版和样本不足估计，保留真实及范围外记录，重复和并发幂等", async () => {
  const owner = await setup("rebuild"), other = await setup("rebuild-other");
  await rebuild(owner, "2024-01-04", "2024-01-05");
  const active = await listMeasurements(db, owner), outside = active.filter(r => r.recordDate === "2024-01-05"), real = active.filter(r => r.recordKind === "observed");
  const template = active.find(r => r.recordKind === "estimated")!;
  const legacy = { method: "linear-trend-v1" as const, confidenceLevel: .95 as const, trainingRange: { start: "2024-01-01", end: "2024-01-05" }, weightKg: { value: "88.88", lower: "88.00", upper: "89.00", model: { sampleCount: 3, meanDate: 19725, meanValue: 88.88, slope: 0, sumSquaredDates: 2, residualVariance: 1, criticalValue: 12.706, samples: [] } }, bodyFatPercent: null };
  const [old] = await db.insert(schema.measurement).values({ ...template, id: randomUUID(), recordDate: "2024-01-01", sourceLocalTime: "2024-01-01", period: "evening", weightKg: "88.88", bodyFatPercent: null, estimation: legacy, deduplicationKey: randomUUID() }).returning();
  assert.equal((await listMeasurements(db, owner)).find(r => r.id === old.id)!.estimation!.method, "linear-trend-v1");
  const request = rebuildRequest("2024-01-01", "2024-01-04"), preview = await previewEstimationRebuild(db, owner, request);
  assert.equal(preview.removedIds.length, 3);
  assert.equal(preview.estimates.length, 2);
  await assert.rejects(applyEstimationRebuild(db, { userId: other, actorId: owner, request, digest: preview.digest }));
  await assert.rejects(applyEstimationRebuild(db, { userId: other, actorId: other, request, digest: preview.digest }), /记录已变化/);
  const results = await Promise.all([1, 2].map(() => applyEstimationRebuild(db, { userId: owner, actorId: owner, request, digest: preview.digest })));
  assert.equal(results.filter(r => r.repeated).length, 1);
  const result = results.find(r => !r.repeated)!;
  assert.equal(result.removed, 3); assert.equal(result.inserted, 2);
  const after = await listMeasurements(db, owner);
  assert.deepEqual(after.filter(r => r.recordKind === "observed"), real);
  assert.deepEqual(after.filter(r => r.recordDate === "2024-01-05"), outside);
  assert.ok(!after.some(r => r.id === old.id));
  assert.equal(after.filter(r => r.recordKind === "estimated" && r.recordDate === "2024-01-01").length, 0);
  assert.equal((await previewEstimationRebuild(db, owner, request)).alreadyApplied, true);
});

test("预览后变化、无效范围和审计失败不留下部分重建", async () => {
  const owner = await setup("rebuild-rollback");
  await rebuild(owner, "2024-01-04", "2024-01-04");
  await assert.rejects(previewEstimationRebuild(db, owner, rebuildRequest("2024-01-05", "2024-01-04")));
  const request = rebuildRequest("2024-01-04", "2024-01-04"), stale = await previewEstimationRebuild(db, owner, request);
  await write(owner, [record(8, "daytime", "67.00")]);
  await assert.rejects(applyEstimationRebuild(db, { userId: owner, actorId: owner, request, digest: stale.digest }), /记录已变化/);
  const preview = await previewEstimationRebuild(db, owner, request), before = await listMeasurements(db, owner), batches = (await db.select().from(schema.measurementImport)).length;
  await pg.exec("CREATE FUNCTION reject_rebuild_event() RETURNS trigger AS $$ BEGIN IF NEW.action = 'estimate' THEN RAISE EXCEPTION 'fictional rebuild failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_rebuild_event BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_rebuild_event();");
  try { await assert.rejects(applyEstimationRebuild(db, { userId: owner, actorId: owner, request, digest: preview.digest })); }
  finally { await pg.exec("DROP TRIGGER reject_rebuild_event ON measurement_events; DROP FUNCTION reject_rebuild_event();"); }
  assert.deepEqual(await listMeasurements(db, owner), before);
  assert.equal((await db.select().from(schema.measurementImport)).length, batches);
});

test("数据库允许仅体脂实测，拒绝两项主要指标均为空", async () => {
  const owner = await setup("metric-presence");
  const template = (await listMeasurements(db, owner))[0];
  await db.insert(schema.measurement).values({ ...template, id: randomUUID(), weightKg: null, deduplicationKey: randomUUID() });
  await assert.rejects(db.insert(schema.measurement).values({ ...template, id: randomUUID(), weightKg: null, bodyFatPercent: null, deduplicationKey: randomUUID() }));
  await rebuild(owner, "2024-01-04", "2024-01-04");
  const estimate = (await listMeasurements(db, owner)).find(r => r.recordKind === "estimated")!;
  await assert.rejects(db.insert(schema.measurement).values({ ...estimate, id: randomUUID(), recordDate: "2024-01-05", weightKg: null, bodyFatPercent: null, deduplicationKey: randomUUID() }));
});

test("实测准确时间替换占位时间，跨午夜归前日晚间，数值及原始输入保留", async () => {
  const owner = await setup("exact-time");
  await write(owner, [{ ...record(4, "daytime", "78.20", "25.00"), assumedTime: "08:00", timezone: "Asia/Shanghai" }]);
  const before = (await listMeasurements(db, owner)).find(r => r.recordDate === "2024-01-04" && r.recordKind === "observed")!;
  const input = [{ ...record(4, "daytime", "78.20", "25.00"), measuredAt: "2024-01-04 10:15:00", timezone: "Asia/Shanghai" },
    { ...record(4, "evening", "78.50", "25.20"), measuredAt: "2024-01-05 01:10:00", timezone: "Asia/Shanghai" }];
  const result = await write(owner, input);
  assert.equal(result.updated, 1); assert.equal(result.inserted, 1);
  const rows = await listMeasurements(db, owner), morning = rows.find(r => r.id === before.id)!, evening = rows.find(r => r.recordDate === "2024-01-04" && r.period === "evening")!;
  assert.equal(morning.sourceLocalTime, "2024-01-04 10:15:00"); assert.equal(morning.timePrecision, "second");
  assert.equal(morning.occurredAt!.toISOString(), "2024-01-04T02:15:00.000Z");
  assert.deepEqual(morning.originalValues, before.originalValues);
  assert.equal(evening.sourceLocalTime.slice(0, 10), "2024-01-05"); assert.equal(evening.recordDate, "2024-01-04");
  assert.equal(evening.occurredAt!.toISOString(), "2024-01-04T17:10:00.000Z");
  assert.equal(evening.originalValues.reportedTime, "2024-01-05 01:10:00");
  assert.equal(evening.recordKind, "observed"); assert.equal(evening.fasting, false);
  assert.equal(buildMeasurementDays(rows)[0].weightDifferenceKg, .3);
  assert.ok(!rows.some(r => r.recordDate === "2024-01-04" && r.recordKind === "estimated"));
  assert.equal((await write(owner, input)).skipped, 2);
  assert.throws(() => validateReportedMeasurement({ ...input[0], assumedTime: "08:00" }));
  assert.throws(() => validateReportedMeasurement({ ...input[1], recordDate: "2024-01-05" }));
});
