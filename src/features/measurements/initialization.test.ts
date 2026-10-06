import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { DailyMeasurement } from "./days";
import { buildHistoricalEstimates, buildInitializationEstimates, isInitializationEstimate } from "./estimation";
import { estimateCalculation, estimateLabel } from "./estimate-explanation";
import { applyHistoricalInitialization, previewHistoricalInitialization, initializationReportMarkdown } from "./initialization";
import { saveReportedMeasurements, saveImportedMeasurements, listMeasurements, type ReportedMeasurement } from "./records";
import { applyEstimationRebuild, previewEstimationRebuild } from "./rebuild";
import { previewHistoricalCompletion, applyHistoricalCompletion } from "./completion";
import { restoreMeasurement } from "./maintenance";

const date = (day: number) => `2024-01-${String(day).padStart(2, "0")}`;
const range = { start: date(3), end: date(13) }, generatedAt = "2024-02-01T00:00:00.000Z";
function row(day: number, period: "daytime" | "evening", weightKg: string, bodyFatPercent: string | null): DailyMeasurement {
  return { id: `${day}:${period}`, analysisDate: date(day), period, weightKg, bodyFatPercent, recordKind: "observed", fasting: period === "daytime", sourceLocalTime: date(day) };
}
const real = [row(5, "daytime", "80.00", "24.00"), row(5, "evening", "81.00", "24.40"), row(7, "daytime", "82.00", "25.00"), row(7, "evening", "83.00", "25.40"), row(12, "daytime", "83.00", "26.00"), row(12, "evening", "85.00", "26.60")];
const initialize = (records = real, targetRange = range) => buildInitializationEstimates(records, targetRange, { batchId: "fictional-batch", sourceDigest: "a".repeat(64) }, generatedAt);

test("初始化用全范围真实配对反推早期晨间；正常模式不使用后续数据", () => {
  const records = [...real, row(3, "evening", "85.00", "26.00")];
  const estimates = initialize(records).estimates;
  const morning = estimates.find(r => r.analysisDate === date(3) && r.period === "daytime")!;
  assert.equal(morning.weightKg, "84.00"); assert.equal(morning.bodyFatPercent, "25.60");
  assert.ok(isInitializationEstimate(morning.estimation));
  assert.equal(morning.estimation.weightKg!.typicalDifference!.samples.length, 3);
  assert.equal(morning.estimation.weightKg!.usesFutureData, true);
  assert.equal(morning.estimation.method, "historical-initialization-v1");
  assert.equal(estimateLabel(morning.estimation), "历史初始化估计");
  assert.equal(estimateCalculation(morning.estimation.weightKg!, date(3), "weightKg").formula, "85.00 − (1.00) = 84.00 kg");
  assert.equal(buildHistoricalEstimates(records, { start: date(3), end: date(3) }).estimates.length, 0);
});

test("相邻晨间插值按日历距离，边界最近三个样本回归，指标独立", () => {
  const estimates = initialize().estimates;
  const at = (day: number, period: string) => estimates.find(r => r.analysisDate === date(day) && r.period === period)!;
  assert.equal(at(6, "daytime").weightKg, "81.00"); assert.equal(at(6, "evening").weightKg, "82.00");
  assert.equal(at(6, "daytime").bodyFatPercent, "24.50"); assert.equal(at(6, "evening").bodyFatPercent, "24.90");
  assert.equal(at(8, "daytime").weightKg, "82.20");
  assert.equal(at(4, "daytime").weightKg, "80.13");
  assert.equal(at(4, "daytime").estimation.weightKg!.extrapolation, true);
  assert.deepEqual(at(4, "daytime").estimation.weightKg!.trend!.samples.map(r => r.date), [date(5), date(7), date(12)]);
  assert.equal(at(13, "daytime").estimation.weightKg!.usesFutureData, false);
  const partial = initialize([...real, row(8, "daytime", "82.50", null)]).estimates.find(r => r.analysisDate === date(8) && r.period === "daytime")!;
  assert.equal(partial.weightKg, null); assert.equal(partial.bodyFatPercent, "25.20");
});

test("初始化忽略范围外实测和已有估计；两点插值可用，配对与外推不足留空", () => {
  const noise = [...real, row(1, "daytime", "900.00", "90.00"), row(14, "daytime", "900.00", "90.00"), { ...row(6, "daytime", "900.00", "90.00"), recordKind: "estimated" as const }];
  assert.deepEqual(initialize(noise), initialize());
  const two = initialize(real.slice(0, 4));
  assert.equal(two.estimates.find(r => r.analysisDate === date(6))!.weightKg, "81.00");
  assert.ok(!two.estimates.some(r => r.analysisDate === date(4)));
  assert.ok(!two.estimates.some(r => r.analysisDate === date(6) && r.period === "evening"));
  assert.ok(two.outcomes.find(r => r.date === date(6) && r.period === "evening")!.reason?.includes("不足 3 日"));
  assert.equal(initialize(real, { start: date(20), end: date(20) }).estimates.length, 0);
  const oversizedGap = [row(1, "daytime", "80.00", null), { ...row(31, "daytime", "82.00", null), analysisDate: "2024-02-01" }];
  assert.equal(initialize(oversizedGap, { start: date(1), end: "2024-02-01" }).estimates.length, 0);
});

test("正常模式晚间配对不足时降级晨间趋势，说明样本和精度", () => {
  const history = [row(1, "daytime", "80.00", "24.00"), row(2, "daytime", "81.00", "25.00"), row(3, "daytime", "82.00", "26.00"), row(4, "evening", "84.00", "28.00")];
  const estimate = buildHistoricalEstimates(history, { start: date(4), end: date(4) }).estimates[0];
  assert.equal(estimate.weightKg, "83.00"); assert.equal(estimate.bodyFatPercent, "27.00");
  assert.equal(estimate.estimation.mode, "normal"); assert.equal(estimate.estimation.method, "morning-baseline-v3");
  assert.match(estimate.estimation.weightKg!.fallbackReason!, /仅 0 日/);
  const explanation = estimateCalculation(estimate.estimation.weightKg!, date(4), "weightKg");
  assert.equal(explanation.formula, "80 + (1) × 3 ≈ 83.00 kg"); assert.equal(explanation.references.length, 3);
});

test("中位差保留第三位小数，算式明确显示最终舍入", () => {
  const records = ["80.10", "80.15", "80.16", "80.20"].flatMap((value, index) => [row(index + 1, "daytime", "80.00", null), row(index + 1, "evening", value, null)]);
  const estimate = buildHistoricalEstimates([...records, row(5, "evening", "80.11", null)], { start: date(5), end: date(5) }).estimates[0];
  assert.equal(estimate.estimation.weightKg!.typicalDifference!.value, .155);
  assert.equal(estimate.weightKg, "79.96");
  assert.equal(estimateCalculation(estimate.estimation.weightKg!, date(5), "weightKg").formula, "80.11 − (0.155) = 79.955 → 79.96 kg");
});

const pg = new PGlite(), db = drizzle(pg, { schema });
before(async () => { await migrate(db, { migrationsFolder: "./drizzle" }); });
after(async () => { await pg.close(); });
function reported(day: number, period: "daytime" | "evening", weightKg: string, bodyFatPercent: string | null = null): ReportedMeasurement { return { analysisDate: date(day), period, weightKg, bodyFatPercent, fasting: period === "daytime" }; }
async function write(owner: string, records: ReportedMeasurement[]) { return saveReportedMeasurements(db, { userId: owner, actorId: owner, requestKey: randomUUID().replaceAll("-", "").repeat(2), entryChannel: "api", records }); }
async function recordsFor(owner: string) { return (await listMeasurements(db, owner)).sort((a, b) => a.id.localeCompare(b.id)); }
async function setup(name: string) {
  const owner = `fictional-initialization-${name}`;
  await db.insert(schema.user).values({ id: owner, name: "虚构用户", email: `${name}@example.test` });
  await write(owner, real.map(r => reported(Number(r.analysisDate.slice(-2)), r.period, r.weightKg!, r.bodyFatPercent)));
  const request = { operationId: "fictional-normal-rebuild", range: { start: date(13), end: date(13) } }, preview = await previewEstimationRebuild(db, owner, request);
  await applyEstimationRebuild(db, { userId: owner, actorId: owner, request, digest: preview.digest });
  return owner;
}
async function perform(owner: string, operationId = "fictional-initialization") {
  const request = { operationId, range }, preview = await previewHistoricalInitialization(db, owner, request);
  assert.equal(preview.alreadyApplied, false);
  if (preview.alreadyApplied) throw new Error("预期新初始化");
  return applyHistoricalInitialization(db, { userId: owner, actorId: owner, actorType: "ai", request, digest: preview.digest });
}

test("独立初始化批次替换旧估计，报告追溯实际来源，真实与范围外不变", async () => {
  const owner = await setup("report"), other = await setup("report-other");
  await write(owner, [reported(20, "evening", "84.20", "27.00")]);
  const before = await recordsFor(owner), otherBefore = await recordsFor(other);
  const result = await perform(owner), after = await recordsFor(owner);
  assert.equal(result.report.generatedRecords.length, 16); assert.equal(result.report.replacedEstimates.length, 2);
  assert.equal(result.report.outcomes.filter(r => r.status === "missing").length, 0);
  assert.deepEqual(after.filter(r => r.recordKind === "observed"), before.filter(r => r.recordKind === "observed"));
  assert.deepEqual(after.filter(r => r.analysisDate > range.end), before.filter(r => r.analysisDate > range.end));
  assert.deepEqual(await recordsFor(other), otherBefore);
  assert.ok(after.filter(r => r.recordKind === "estimated" && r.analysisDate <= range.end).every(r => isInitializationEstimate(r.estimation) && r.estimation.batchId === result.importId && r.assignmentRuleVersion === "historical-initialization-v1"));
  const [batch] = await db.select().from(schema.measurementImport).where(eq(schema.measurementImport.id, result.importId));
  assert.deepEqual(batch.initializationMetadata!.report, result.report);
  assert.match(initializationReportMarkdown(result.report), /真实晨间趋势（相邻插值）/);
  await assert.rejects(db.insert(schema.measurementImport).values({ ...batch, id: randomUUID(), fileDigest: "d".repeat(64) }), error => error instanceof Error && /unique|duplicate/i.test(String(error.cause)));
});

test("未来新增保持历史；补晨间体重只移除对应估计，体脂和晚间冻结不变", async () => {
  const owner = await setup("frozen"); await perform(owner);
  const before = await recordsFor(owner);
  await write(owner, [reported(14, "daytime", "70.00", "15.00"), reported(14, "evening", "90.00", "35.00")]);
  assert.deepEqual((await recordsFor(owner)).filter(r => r.analysisDate <= range.end), before);
  const morningBefore = before.find(r => r.analysisDate === date(6) && r.period === "daytime")!;
  await write(owner, [reported(6, "daytime", "81.25")]);
  const after = await recordsFor(owner), morningAfter = after.find(r => r.id === morningBefore.id)!;
  assert.equal(morningAfter.weightKg, null); assert.equal(morningAfter.bodyFatPercent, morningBefore.bodyFatPercent);
  assert.ok(isInitializationEstimate(morningAfter.estimation)); assert.equal(morningAfter.estimation.weightKg, null);
  assert.deepEqual(morningAfter.estimation.bodyFatPercent, morningBefore.estimation!.bodyFatPercent);
  assert.deepEqual(after.filter(r => r.analysisDate <= range.end && !(r.analysisDate === date(6) && r.period === "daytime")), before.filter(r => !(r.analysisDate === date(6) && r.period === "daytime")));
  await write(owner, [reported(6, "daytime", "81.25", "24.70")]);
  assert.ok(!(await recordsFor(owner)).some(r => r.id === morningBefore.id));
});

test("普通补全跳过冻结日期，重建与恢复旧估计被阻止，实测恢复按指标替代", async () => {
  const owner = await setup("entrypoints"); const result = await perform(owner);
  const before = await recordsFor(owner);
  const request = { operationId: "fictional-completion", range: { start: date(6), end: date(6) }, trainingRange: range, deviceName: "fictional-scale", companionApp: "fictional-app", records: [reported(6, "daytime", "81.25")] };
  const preview = await previewHistoricalCompletion(db, owner, request);
  assert.equal(preview.estimates.length, 0);
  await applyHistoricalCompletion(db, { userId: owner, actorId: owner, request, digest: preview.digest });
  let after = await recordsFor(owner);
  assert.equal(after.find(r => r.analysisDate === date(6) && r.recordKind === "estimated" && r.period === "daytime")!.bodyFatPercent, "24.50");
  assert.deepEqual(after.find(r => r.analysisDate === date(6) && r.period === "evening"), before.find(r => r.analysisDate === date(6) && r.period === "evening"));
  await assert.rejects(previewEstimationRebuild(db, owner, { operationId: "blocked", range }), /冻结/);
  await assert.rejects(restoreMeasurement(db, { userId: owner, actorId: owner, id: result.report.replacedEstimates[0].id }), /冻结/);
  const observed = after.find(r => r.analysisDate === date(6) && r.recordKind === "observed")!;
  await db.update(schema.measurement).set({ deletedAt: new Date() }).where(eq(schema.measurement.id, observed.id));
  await restoreMeasurement(db, { userId: owner, actorId: owner, id: observed.id });
  after = await recordsFor(owner);
  assert.equal(after.find(r => r.analysisDate === date(6) && r.recordKind === "estimated" && r.period === "daytime")!.bodyFatPercent, "24.50");
  assert.deepEqual(after.find(r => r.analysisDate === date(6) && r.period === "evening"), before.find(r => r.analysisDate === date(6) && r.period === "evening"));
});

test("导入冻历史只替代真实指标，空缺也保持冻结", async () => {
  const owner = await setup("import"); await perform(owner);
  const before = await recordsFor(owner);
  await saveImportedMeasurements(db, { userId: owner, actorId: owner, fileDigest: "c".repeat(64), sourceLabel: "fictional.tsv", captureChannel: "file", records: [{ sourceLocalTime: `${date(6)} 08:00:00`, weightKg: "81.25", bmi: null, bodyFatPercent: null, sourceRow: 2, fasting: true, fastingSource: "user_confirmed" }] });
  assert.deepEqual((await recordsFor(owner)).find(r => r.analysisDate === date(6) && r.period === "evening"), before.find(r => r.analysisDate === date(6) && r.period === "evening"));
  const empty = "fictional-initialization-empty";
  await db.insert(schema.user).values({ id: empty, name: "虚构用户", email: "empty@example.test" });
  const initialized = await perform(empty);
  assert.equal(initialized.report.generatedRecords.length, 0); assert.equal(initialized.report.outcomes.length, 44);
  await write(empty, [reported(6, "daytime", "81.25")]);
  assert.equal((await recordsFor(empty)).filter(r => r.recordKind === "estimated").length, 0);
});

test("重复及并发返回原报告，不同请求不能重新初始化，账号与快照校验", async () => {
  const owner = await setup("idempotent"), other = await setup("isolation");
  const request = { operationId: "once", range }, preview = await previewHistoricalInitialization(db, owner, request);
  if (preview.alreadyApplied) throw new Error("预期新初始化");
  await assert.rejects(applyHistoricalInitialization(db, { userId: other, actorId: owner, request, digest: preview.digest }), /操作者/);
  await assert.rejects(applyHistoricalInitialization(db, { userId: other, actorId: other, request, digest: preview.digest }), /记录已变化/);
  const results = await Promise.all([1, 2].map(() => applyHistoricalInitialization(db, { userId: owner, actorId: owner, request, digest: preview.digest })));
  assert.equal(results.filter(r => r.repeated).length, 1); assert.deepEqual(results[0].report, results[1].report);
  assert.equal((await previewHistoricalInitialization(db, owner, request)).alreadyApplied, true);
  await assert.rejects(previewHistoricalInitialization(db, owner, { ...request, operationId: "another" }), /不能重新/);
  await assert.rejects(applyHistoricalInitialization(db, { userId: owner, actorId: owner, request: { ...request, operationId: "another" }, digest: preview.digest }), /不能重新/);
  await write(other, [reported(20, "evening", "85.00")]);
  const otherPreview = await previewHistoricalInitialization(db, other, request);
  if (otherPreview.alreadyApplied) throw new Error("预期新初始化");
  await write(other, [reported(21, "evening", "85.10")]);
  await assert.rejects(applyHistoricalInitialization(db, { userId: other, actorId: other, request, digest: otherPreview.digest }), /记录已变化/);
  await assert.rejects(previewHistoricalInitialization(db, other, { ...request, range: { start: date(7), end: date(3) } }), /无效/);
});

test("审计失败回滚旧估计删除、批次和冻结状态", async () => {
  const owner = await setup("rollback");
  const before = await recordsFor(owner);
  await pg.exec(`CREATE FUNCTION reject_initialization_audit() RETURNS trigger AS $$ BEGIN IF NEW.user_id = 'fictional-initialization-rollback' AND NEW.action = 'estimate' THEN RAISE EXCEPTION 'fictional audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_initialization_audit BEFORE INSERT ON measurement_events FOR EACH ROW EXECUTE FUNCTION reject_initialization_audit();`);
  try { await assert.rejects(perform(owner), error => error instanceof Error && /fictional audit failure/.test(String(error.cause))); }
  finally { await pg.exec("DROP TRIGGER reject_initialization_audit ON measurement_events; DROP FUNCTION reject_initialization_audit();"); }
  assert.deepEqual(await recordsFor(owner), before);
  assert.equal((await db.select().from(schema.measurementImport).where(eq(schema.measurementImport.userId, owner))).filter(r => r.initializationMetadata !== null).length, 0);
});
