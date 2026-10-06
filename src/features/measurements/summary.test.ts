import assert from "node:assert/strict";
import { test } from "node:test";
import { measurementSummary } from "./summary";
import type { DailyMeasurement } from "./days";

const row = (id: string, date: string, weightKg: string, bodyFatPercent: string | null = "25.00"): DailyMeasurement => ({
  id, analysisDate: date, period: "daytime", weightKg, bodyFatPercent, fasting: true, sourceLocalTime: `${date} 11:00:00`,
});

test("7 日摘要以最新空腹日为截止，按实际记录日首末和均值计算，缺测不补零", () => {
  const records = [row("old", "2025-01-03", "80.00"), row("a", "2025-01-04", "75.03"), row("b", "2025-01-10", "74.01"), { ...row("night", "2025-01-11", "76.00"), period: "evening" as const, fasting: false }];
  const summary = measurementSummary(records, "weightKg");
  assert.equal(summary.current?.id, "b");
  assert.equal(summary.start, "2025-01-04");
  assert.equal(summary.end, "2025-01-10");
  assert.equal(summary.changeStart, "2025-01-04");
  assert.equal(summary.change, -1.02);
  assert.equal(summary.average, 74.52);
  assert.equal(summary.coverage, 2);
});

test("体脂摘要取最新有值空腹日，变化为百分点，另一指标保留自身日期", () => {
  const records = [row("a", "2025-01-04", "75.00", "25.11"), row("b", "2025-01-10", "74.00", "25.01"), row("c", "2025-01-11", "73.90", null)];
  const fat = measurementSummary(records, "bodyFatPercent");
  assert.equal(fat.current?.id, "b");
  assert.equal(fat.companion?.id, "c");
  assert.equal(fat.companionMetric, "weightKg");
  assert.equal(fat.change, -.1);
  assert.equal(fat.average, 25.06);
  assert.equal(fat.coverage, 2);
  assert.equal(measurementSummary(records, "weightKg").companion?.id, "b");
});

test("不足两天不报变化，单点仍计算均值，无空腹或无有效指标返回空值", () => {
  const one = measurementSummary([row("a", "2025-01-10", "75.00")], "weightKg");
  assert.equal(one.change, null);
  assert.equal(one.average, 75);
  assert.equal(one.coverage, 1);
  const empty = measurementSummary([], "weightKg");
  assert.equal(empty.current, null);
  assert.equal(empty.change, null);
  assert.equal(empty.average, null);
  assert.equal(empty.coverage, 0);
  const unknown = measurementSummary([{ ...row("a", "2025-01-10", "75.00"), fasting: null }], "weightKg");
  assert.equal(unknown.current, null);
  const missing = measurementSummary([row("a", "2025-01-10", "75.00", null)], "bodyFatPercent");
  assert.equal(missing.current, null);
  assert.equal(missing.companion?.weightKg, "75.00");
});

test("同日多条未选代表时排除，选择只计一个日值，均值按百分之一四舍五入", () => {
  const records = [row("a", "2025-01-09", "75.00"), row("b", "2025-01-10", "75.01"), row("c", "2025-01-10", "80.00")];
  assert.equal(measurementSummary(records, "weightKg").current?.id, "a");
  const chosen = measurementSummary(records, "weightKg", { "2025-01-10:daytime": "b" });
  assert.equal(chosen.current?.id, "b");
  assert.equal(chosen.coverage, 2);
  assert.equal(chosen.average, 75.01);
  assert.equal(chosen.change, .01);
});
