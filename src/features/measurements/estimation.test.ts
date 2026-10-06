import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHistoricalEstimates, fitMeasurementModel, predictMeasurement } from "./estimation";
import { buildMeasurementDays, type DailyMeasurement } from "./days";
import { measurementSummary } from "./summary";
import { measurementTrend } from "./trend";

test("线性拟合及单次读数 95% 预测区间符合固定解析基准，外推区间更宽", () => {
  const model = fitMeasurementModel([2, 4, 5, 4, 5].map((value, index) => ({ id: String(index), date: `2024-01-0${index + 1}`, value: String(value) })))!;
  assert.equal(model.sampleCount, 5);
  assert.equal(model.slope, .6);
  assert.ok(Math.abs(model.residualVariance - .8) < 1e-10);
  assert.equal(model.criticalValue, 3.182);
  const center = predictMeasurement(model, "2024-01-03");
  assert.deepEqual([center.value, center.lower, center.upper], ["4.00", "0.88", "7.12"]);
  const outside = predictMeasurement(model, "2024-01-06");
  assert.deepEqual([outside.value, outside.lower, outside.upper], ["5.80", "1.67", "9.93"]);
  assert.ok(Number(outside.upper) - Number(outside.lower) > Number(center.upper) - Number(center.lower));
});

function rows(): DailyMeasurement[] {
  return [1, 3, 5].flatMap((day) => (["daytime", "evening"] as const).map((period) => ({ id: `${day}:${period}`, analysisDate: `2024-01-0${day}`, period,
    weightKg: String(80 - day / 10 + (period === "evening" ? 1 : 0)), bodyFatPercent: String(25 - day / 10), fasting: period === "daytime", sourceLocalTime: `2024-01-0${day} ${period === "daytime" ? "08" : "20"}:00:00`, recordKind: "observed" })));
}
const range = { start: "2024-01-01", end: "2024-01-05" };

test("仅补空时段，晨晚与两项指标独立训练，估计不会参与训练或摘要", () => {
  const original = rows();
  const first = buildHistoricalEstimates(original, range, range);
  assert.equal(first.estimates.length, 4);
  assert.deepEqual(first.warnings, []);
  assert.deepEqual(first.estimates.filter((row) => row.period === "daytime").map((row) => row.weightKg), ["79.80", "79.60"]);
  assert.deepEqual(first.estimates.filter((row) => row.period === "evening").map((row) => row.weightKg), ["80.80", "80.60"]);
  const estimated: DailyMeasurement = { id: "fake-estimate", analysisDate: "2024-01-06", period: "daytime", weightKg: "99.00", bodyFatPercent: "40", fasting: true, sourceLocalTime: "2024-01-06", recordKind: "estimated" };
  assert.deepEqual(buildHistoricalEstimates([...original, estimated], range, range), first);
  assert.deepEqual(measurementSummary([...original, estimated], "weightKg"), measurementSummary(original, "weightKg"));
});

test("实测优先，未解决候选和非空腹白天不用于模型，也不冒充空缺", () => {
  const original = rows();
  const estimated: DailyMeasurement = { ...original[0], id: "estimate", recordKind: "estimated", weightKg: "99.00" };
  assert.equal(buildMeasurementDays([estimated, ...original]).at(-1)!.daytimeRecord!.id, original[0].id);
  const conflicted = [...original, { ...original[0], id: "second-actual" }];
  const result = buildHistoricalEstimates(conflicted, range, range);
  assert.equal(result.estimates.filter((row) => row.period === "daytime").length, 0);
  assert.ok(result.warnings.length);
  assert.equal(fitMeasurementModel([{ id: "1", date: "2024-01-01", value: "80" }, { id: "2", date: "2024-01-03", value: "79" }]), null);
  assert.throws(() => buildHistoricalEstimates(original, range, { start: "2024-01-01", end: "2024-02-01" }));
});

test("晨晚都有连线，经过估计点标为估计线，关闭晚间不留下晚间段", () => {
  const original = rows();
  const estimated: DailyMeasurement = { ...original[0], id: "estimate", analysisDate: "2024-01-02", sourceLocalTime: "2024-01-02", recordKind: "estimated" };
  const trend = measurementTrend([...original, estimated], "weightKg", true);
  assert.equal(trend.segments.filter((line) => line.period === "evening").length, 2);
  assert.equal(trend.segments.filter((line) => line.estimated).length, 2);
  assert.ok(measurementTrend([...original, estimated], "weightKg", false).segments.every((line) => line.period === "daytime"));
});
