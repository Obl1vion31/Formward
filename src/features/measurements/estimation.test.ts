import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHistoricalEstimates, fitMeasurementModel, predictMeasurement, typicalMorningEveningDifference } from "./estimation";
import { buildMeasurementDays, type DailyMeasurement } from "./days";
import { measurementSummary } from "./summary";
import { measurementTrend, metricDifference } from "./trend";

const generatedAt = "2024-02-01T00:00:00.000Z";
const options = { generatedAt, preserveExisting: false };
const range = { start: "2024-01-04", end: "2024-01-04" };
function row(day: number, period: "daytime" | "evening", weightKg: string | null, bodyFatPercent: string | null): DailyMeasurement {
  const date = `2024-01-${String(day).padStart(2, "0")}`;
  return { id: `${day}:${period}`, recordDate: date, period, weightKg, bodyFatPercent, fasting: period === "daytime", sourceLocalTime: `${date} ${period === "daytime" ? "08" : "20"}:00:00`, recordKind: "observed" };
}
function history() {
  return [1, 2, 3].flatMap((day) => [row(day, "daytime", (68 + (day - 1) / 10).toFixed(2), (23 + (day - 1) / 10).toFixed(2)),
    row(day, "evening", (68.59 + (day - 1) / 10).toFixed(2), (23.2 + (day - 1) / 10).toFixed(2))]);
}

test("A 晨晚都真实，不生成估计；只有之后日期可使用该配对", () => {
  const real = [...history(), row(4, "daytime", "68.27", "23.27"), row(4, "evening", "69.17", "23.47")];
  assert.deepEqual(buildHistoricalEstimates(real, range, options).estimates, []);
  assert.equal(typicalMorningEveningDifference(real, range.start, "weightKg")!.samples.length, 3);
  assert.equal(typicalMorningEveningDifference(real, "2024-01-05", "weightKg")!.samples.length, 4);
});

test("B 晚间实测反推晨间，体重与体脂采用各自真实晨晚差", () => {
  const result = buildHistoricalEstimates([...history(), row(4, "evening", "69.17", "24.60")], range, options);
  assert.deepEqual(result.estimates.map((r) => [r.period, r.weightKg, r.bodyFatPercent]), [["daytime", "68.58", "24.40"]]);
  assert.equal(result.estimates[0].estimation.weightKg!.basis, "same-day-evening");
  assert.equal(result.estimates[0].estimation.weightKg!.typicalDifference!.value, .59);
});

test("C 晨间实测推出晚间，不使用晚间独立回归", () => {
  const result = buildHistoricalEstimates([...history(), row(4, "daytime", "68.27", "23.27")], range, options);
  assert.deepEqual(result.estimates.map((r) => [r.period, r.weightKg, r.bodyFatPercent]), [["evening", "68.86", "23.47"]]);
  assert.equal(result.estimates[0].estimation.weightKg!.basis, "same-day-morning");
  assert.equal(result.estimates[0].estimation.weightKg!.trend, null);
});

test("D 双缺测先拟合真实晨间，再用个人晨晚差推晚间", () => {
  const result = buildHistoricalEstimates(history(), range, options);
  assert.deepEqual(result.estimates.map((r) => [r.period, r.weightKg, r.bodyFatPercent]), [["daytime", "68.30", "23.30"], ["evening", "68.89", "23.50"]]);
  assert.equal(result.estimates[0].estimation.weightKg!.trend!.sampleCount, 3);
  assert.equal(result.estimates[1].estimation.weightKg!.basis, "morning-trend-plus-difference");
});

test("中位数抵抗单个异常值，负晨晚差保留，偶数样本不提前舍入", () => {
  const records = history();
  records[5].weightKg = "90.00";
  assert.equal(typicalMorningEveningDifference(records, range.start, "weightKg")!.value, .59);
  records[1].weightKg = "67.41"; records[3].weightKg = "67.52"; records[5].weightKg = "48.20";
  assert.equal(typicalMorningEveningDifference(records, range.start, "weightKg")!.value, -.59);
  const real = [...history(), row(4, "daytime", "68.00", null), row(4, "evening", "68.60", null)];
  real[1].weightKg = "68.58";
  assert.equal(typicalMorningEveningDifference(real, "2024-01-05", "weightKg")!.value, .59);
});

test("未来实测及已有估计不参与模型；历史补全默认保留旧估计", () => {
  const first = buildHistoricalEstimates(history(), range, options);
  const fake: DailyMeasurement = { ...row(3, "daytime", "999.00", "99.00"), id: "fake", recordKind: "estimated" };
  const future = [row(5, "daytime", "400.00", "90.00"), row(5, "evening", "500.00", "95.00")];
  assert.deepEqual(buildHistoricalEstimates([...history(), fake, ...future], range, options), first);
  const saved: DailyMeasurement = { ...row(4, "daytime", "66.66", "22.22"), recordKind: "estimated" };
  assert.equal(buildHistoricalEstimates([...history(), saved], range, { generatedAt }).estimates.filter(r => r.period === "daytime").length, 0);
  assert.equal(buildHistoricalEstimates([...history(), saved], range, options).estimates[0].weightKg, "68.30");
  assert.deepEqual(measurementSummary([...history(), saved], "weightKg"), measurementSummary(history(), "weightKg"));
});

test("不足三组配对时晚间留空，趋势足够仍可补晨间；趋势超过七天停止", () => {
  const lessPairs = history().filter(r => r.id !== "3:evening");
  const result = buildHistoricalEstimates(lessPairs, range, options);
  assert.equal(result.estimates.length, 1); assert.equal(result.estimates[0].period, "daytime");
  assert.ok(result.warnings.some(w => w.includes("evening")));
  assert.equal(buildHistoricalEstimates(history(), { start: "2024-01-10", end: "2024-01-10" }, options).estimates.length, 2);
  assert.equal(buildHistoricalEstimates(history(), { start: "2024-01-11", end: "2024-01-11" }, options).estimates.length, 0);
  assert.equal(buildHistoricalEstimates(history().slice(0, 4), range, options).estimates.length, 0);
  assert.equal(buildHistoricalEstimates(history(), { start: "2023-12-31", end: "2023-12-31" }, options).estimates.length, 0);
});

test("28天窗口与最近七个晨间样本限制实际生效", () => {
  const recent = Array.from({ length: 8 }, (_, index) => row(index + 1, "daytime", index === 0 ? "999.00" : (68 + index / 10).toFixed(2), null));
  const result = buildHistoricalEstimates(recent, { start: "2024-01-09", end: "2024-01-09" }, options);
  assert.equal(result.estimates[0].weightKg, "68.80");
  assert.equal(result.estimates[0].estimation.weightKg!.trend!.sampleCount, 7);
  assert.ok(result.estimates[0].estimation.weightKg!.trend!.samples.every(r => r.date !== "2024-01-01"));
  assert.equal(typicalMorningEveningDifference(history(), "2024-02-01", "weightKg"), null);
});

test("每个指标独立补缺；实测体重不受估计体脂影响，关闭估计恢复缺项", () => {
  const real = [...history(), row(4, "daytime", "68.27", null), row(4, "evening", "69.17", "24.60")];
  const estimated = buildHistoricalEstimates(real, range, options).estimates;
  assert.deepEqual(estimated.map(r => [r.period, r.weightKg, r.bodyFatPercent]), [["daytime", null, "24.40"]]);
  const rows = [...real, ...estimated.map((r, i) => ({ ...r, id: `estimate:${i}`, fasting: r.period === "daytime", sourceLocalTime: r.recordDate, recordKind: "estimated" as const }))];
  assert.equal(buildMeasurementDays(rows)[0].daytimeRecord!.recordKind, "observed");
  assert.equal(buildMeasurementDays(rows, {}, "bodyFatPercent")[0].daytimeRecord!.recordKind, "estimated");
  assert.equal(buildMeasurementDays(real, {}, "bodyFatPercent")[0].daytimeRecord!.bodyFatPercent, null);
  assert.equal(measurementTrend(rows, "bodyFatPercent", true).pairs.length, 3);
  assert.equal(metricDifference(rows.at(-1)!, real.at(-1)!, "bodyFatPercent"), null);
  assert.equal(buildMeasurementDays(rows)[0].records.length, 3);
});

test("未解决候选、非空腹与未知条件不被估计冒充替代，也不贡献统计", () => {
  const conflicted = [...history(), row(4, "daytime", "68.27", null), { ...row(4, "daytime", "68.30", "24.00"), id: "second" }];
  assert.ok(buildHistoricalEstimates(conflicted, range, options).estimates.every(r => r.period !== "daytime"));
  const unknown = [...history(), { ...row(4, "daytime", "68.27", null), fasting: null }];
  assert.deepEqual(buildHistoricalEstimates(unknown, range, options).estimates, []);
  assert.equal(typicalMorningEveningDifference(history().map(r => r.id === "1:daytime" ? { ...r, fasting: false } : r), range.start, "weightKg"), null);
});

test("有效范围与舍入：非法回归结果留空，不截断，不把未知值变成零", () => {
  const records = [row(1, "daytime", "3.00", "0.30"), row(2, "daytime", "2.00", "0.20"), row(3, "daytime", "1.00", "0.10")];
  const result = buildHistoricalEstimates(records, range, options);
  assert.equal(result.estimates[0].weightKg, null); assert.equal(result.estimates[0].bodyFatPercent, "0.00");
  assert.ok(result.warnings.some(w => w.includes("超出有效范围")));
  assert.throws(() => buildHistoricalEstimates(history(), { start: "2024-01-04", end: "2024-01-03" }));
  assert.equal(fitMeasurementModel([{ id: "1", date: "2024-01-01", value: "80" }, { id: "2", date: "2024-01-03", value: "79" }]), null);
  const model = fitMeasurementModel([2, 4, 5, 4, 5].map((value, i) => ({ id: String(i), date: `2024-01-0${i+1}`, value: String(value) })))!;
  assert.equal(model.slope, .6); assert.equal(predictMeasurement(model, "2024-01-06"), 5.8);
});
