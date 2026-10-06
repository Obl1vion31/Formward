import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { applyHistoricalCompletion, previewHistoricalCompletion, type HistoricalCompletionRequest } from "./completion";
import { getMeasurement, listMeasurements, saveImportedMeasurements, saveReportedMeasurements } from "./records";
import { restoreMeasurement } from "./maintenance";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const owner = "fictional-completion-owner", other = "fictional-completion-other";
const request: HistoricalCompletionRequest = {
  operationId: "fictional-history", range: { start: "2024-01-01", end: "2024-01-06" }, trainingRange: { start: "2024-01-01", end: "2024-01-07" },
  deviceName: "虚构蓝牙秤", companionApp: "虚构应用", records: [
    { analysisDate: "2024-01-07", period: "daytime", weightKg: "79.2", bodyFatPercent: "24.2", fasting: true, timezone: "Asia/Shanghai", assumedTime: "08:00" },
    { analysisDate: "2024-01-07", period: "evening", weightKg: "80.2", bodyFatPercent: "24.8", fasting: false, timezone: "Asia/Shanghai", assumedTime: "20:00" },
  ],
};
let originals: Awaited<ReturnType<typeof listMeasurements>>;
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.user).values([{ id: owner, name: "虚构用户", email: "completion@example.test" }, { id: other, name: "虚构其他用户", email: "completion-other@example.test" }]);
  await saveImportedMeasurements(db, { userId: owner, actorId: owner, fileDigest: "a".repeat(64), sourceLabel: "fictional.tsv", captureChannel: "file", records: [1, 3, 5].flatMap((day) => (["daytime", "evening"] as const).map((period, index) => ({ sourceLocalTime: `2024-01-0${day} ${period === "daytime" ? "08" : "20"}:00:00`, weightKg: (80 - day / 10 + index).toFixed(2), bodyFatPercent: (25 - day / 10 + index / 2).toFixed(2), bmi: "25.00", sourceRow: day * 2 + index, fasting: period === "daytime", fastingSource: "user_confirmed" as const, timezone: "Asia/Shanghai" }))) });
  originals = await listMeasurements(db, owner);
});
after(async () => { await pg.close(); });

test("预览只读；补全来源与占位时间独立保存，原始实测保留，写入审计完整", async () => {
  const preview = await previewHistoricalCompletion(db, owner, request);
  assert.equal(preview.additions.length, 2);
  assert.equal(preview.estimates.length, 2);
  assert.equal(preview.annotateIds.length, 6);
  assert.equal((await listMeasurements(db, owner)).length, 6);
  const result = await applyHistoricalCompletion(db, { userId: owner, actorId: owner, actorType: "ai", request, digest: preview.digest });
  assert.deepEqual([result.observedInserted, result.estimatesInserted, result.annotated], [2, 2, 6]);
  const rows = await listMeasurements(db, owner);
  assert.equal(rows.length, 10);
  for (const original of originals) {
    const row = rows.find((row) => row.id === original.id)!;
    assert.deepEqual([row.weightKg, row.bodyFatPercent, row.sourceLocalTime, row.originalValues, row.sourceType, row.createdAt], [original.weightKg, original.bodyFatPercent, original.sourceLocalTime, original.originalValues, original.sourceType, original.createdAt]);
    assert.equal(row.recordKind, "observed"); assert.equal(row.entryChannel, "development_backend");
    assert.equal(row.deviceName, request.deviceName);
  }
  const reported = rows.find((row) => row.analysisDate === "2024-01-07" && row.period === "daytime")!;
  assert.equal(reported.recordKind, "observed"); assert.equal(reported.timePrecision, "assumed"); assert.equal(reported.occurredAt, null);
  assert.equal(reported.originalValues.reportedTime, null); assert.equal(reported.originalValues.assumedTime, "08:00");
  for (const row of rows.filter((row) => row.recordKind === "estimated")) {
    assert.equal(row.timePrecision, "day_period"); assert.equal(row.occurredAt, null); assert.equal(row.bmi, null); assert.equal(row.deviceName, null);
    assert.equal(row.estimation!.method, "morning-baseline-v3");
    if (row.estimation!.method !== "morning-baseline-v3") throw new Error("预期新模型");
    assert.equal(row.estimation!.weightKg!.trend!.sampleCount, 3);
    assert.ok(row.estimation!.weightKg!.trend!.samples.every((sample) => sample.date < row.analysisDate && rows.some((actual) => actual.id === sample.id && actual.recordKind === "observed")));
  }
  const events = await db.select().from(schema.measurementEvent);
  assert.equal(events.filter((event) => event.action === "estimate").length, 2);
  assert.equal(events.filter((event) => event.action === "estimate")[0].actorType, "ai");
});

test("完成批次重复与并发重试幂等，摘要不能跨账号使用", async () => {
  const preview = await previewHistoricalCompletion(db, owner, request);
  assert.equal(preview.alreadyApplied, true);
  const counts = (await db.select().from(schema.measurementEvent)).length;
  const results = await Promise.all([1, 2].map(() => applyHistoricalCompletion(db, { userId: owner, actorId: owner, request, digest: preview.digest })));
  assert.ok(results.every((result) => result.repeated && result.estimatesInserted === 0));
  assert.equal((await db.select().from(schema.measurementEvent)).length, counts);
  assert.deepEqual(await listMeasurements(db, other), []);
  assert.equal(await getMeasurement(db, other, originals[0].id), null);
  await assert.rejects(applyHistoricalCompletion(db, { userId: other, actorId: owner, request, digest: preview.digest }));
  await assert.rejects(applyHistoricalCompletion(db, { userId: other, actorId: other, request, digest: preview.digest }), /记录已变化/);
  assert.equal((await db.select().from(schema.measurementImport)).filter((batch) => batch.userId === other).length, 0);
});

test("无效范围、数值、时段及预览后修改拒绝写入", async () => {
  await assert.rejects(previewHistoricalCompletion(db, owner, { ...request, range: { start: "2024-01-10", end: "2024-01-01" } }));
  await assert.rejects(previewHistoricalCompletion(db, owner, { ...request, records: [{ ...request.records[0], weightKg: "0" }] }));
  await assert.rejects(previewHistoricalCompletion(db, owner, { ...request, records: [{ ...request.records[0], assumedTime: "20:00" }] }));
  const changedRequest = { ...request, operationId: "fictional-stale" };
  const preview = await previewHistoricalCompletion(db, owner, changedRequest);
  await db.update(schema.measurement).set({ updatedAt: new Date("2024-02-01T00:00:00Z") }).where(eq(schema.measurement.id, originals[0].id));
  await assert.rejects(applyHistoricalCompletion(db, { userId: owner, actorId: owner, request: changedRequest, digest: preview.digest }), /记录已变化/);
});

test("审计失败时整个补录回滚，随后 API 实测替代估计且不可恢复覆盖实测", async () => {
  const estimate = (await listMeasurements(db, owner)).find((row) => row.analysisDate === "2024-01-06" && row.period === "daytime")!;
  const actual = { analysisDate: "2024-01-06", period: "daytime" as const, weightKg: "79.85", bodyFatPercent: "24.8", fasting: true };
  const batchCount = (await db.select().from(schema.measurementImport)).length;
  await pg.exec("CREATE FUNCTION reject_estimate_delete() RETURNS trigger AS $$ BEGIN IF NEW.action = 'delete' THEN RAISE EXCEPTION 'fictional audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_estimate_delete BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_estimate_delete();");
  try { await assert.rejects(saveReportedMeasurements(db, { userId: owner, actorId: owner, requestKey: "b".repeat(64), entryChannel: "api", records: [actual] })); }
  finally { await pg.exec("DROP TRIGGER reject_estimate_delete ON measurement_events; DROP FUNCTION reject_estimate_delete();"); }
  assert.equal((await db.select().from(schema.measurementImport)).length, batchCount);
  assert.equal((await getMeasurement(db, owner, estimate.id))!.recordKind, "estimated");
  const result = await saveReportedMeasurements(db, { userId: owner, actorId: owner, requestKey: "b".repeat(64), entryChannel: "api", records: [actual] });
  assert.equal(result.inserted, 1); assert.equal(await getMeasurement(db, owner, estimate.id), null);
  const row = (await listMeasurements(db, owner)).find((row) => row.analysisDate === actual.analysisDate && row.period === "daytime")!;
  assert.equal(row.recordKind, "observed"); assert.equal(row.entryChannel, "api"); assert.equal(row.occurredAt, null); assert.equal(row.timePrecision, "day_period");
  await assert.rejects(restoreMeasurement(db, { userId: owner, actorId: owner, id: estimate.id }), /已有有效记录/);
  assert.equal((await saveReportedMeasurements(db, { userId: owner, actorId: owner, requestKey: "b".repeat(64), entryChannel: "api", records: [actual] })).repeated, true);
});

test("历史补全事务中估计审计失败也不留下新批次或来源变更", async () => {
  const changedRequest = { ...request, operationId: "fictional-rollback", deviceName: "另一个虚构设备", range: { start: "2024-01-08", end: "2024-01-08" }, trainingRange: { start: "2024-01-01", end: "2024-01-08" }, records: [] };
  const preview = await previewHistoricalCompletion(db, owner, changedRequest);
  const before = await listMeasurements(db, owner);
  const batches = (await db.select().from(schema.measurementImport)).length;
  await pg.exec("CREATE FUNCTION reject_estimate_insert() RETURNS trigger AS $$ BEGIN IF NEW.action = 'estimate' THEN RAISE EXCEPTION 'fictional estimate failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_estimate_insert BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_estimate_insert();");
  try { await assert.rejects(applyHistoricalCompletion(db, { userId: owner, actorId: owner, request: changedRequest, digest: preview.digest })); }
  finally { await pg.exec("DROP TRIGGER reject_estimate_insert ON measurement_events; DROP FUNCTION reject_estimate_insert();"); }
  assert.deepEqual(await listMeasurements(db, owner), before);
  assert.equal((await db.select().from(schema.measurementImport)).length, batches);
});
