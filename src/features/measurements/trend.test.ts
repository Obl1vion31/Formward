import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMeasurementDays, recentMeasurementDays, type DailyMeasurement } from "./days";
import { addCalendarDays, calendarOrdinal, measurementDateTicks, measurementRange, measurementTrend, metricDifference, normalScale } from "./trend";

const row = (id: string, date: string, period: "daytime" | "evening", weightKg = "75.00", bodyFatPercent: string | null = "25.00"): DailyMeasurement => ({
  id, analysisDate: date, period, weightKg, bodyFatPercent, fasting: period === "daytime", sourceLocalTime: `${date} ${period === "daytime" ? "11" : "20"}:00:00`,
});

test("两指标高值在上，跨度至少为 3，单点与极值都留在刻度内", () => {
  for (const values of [[75, 76], [24, 26], [75, 75], [45, 120], [.1, .2]]) {
    const scale = normalScale(values);
    assert.ok(scale.high - scale.low >= 3);
    assert.ok(scale.position(76) < scale.position(75));
    assert.ok(values.every((value) => scale.position(value) > 0 && scale.position(value) < 1));
    assert.ok(scale.ticks.length <= 8);
    assert.ok(scale.ticks.every((tick, index) => !index || tick < scale.ticks[index - 1]));
  }
});

test("7/30/90 天包含截止日，跨年和闰年按日历计算", () => {
  assert.deepEqual(measurementRange("2024-03-01", "7d"), { start: "2024-02-24", end: "2024-03-01" });
  assert.deepEqual(measurementRange("2025-01-10", "30d"), { start: "2024-12-12", end: "2025-01-10" });
  assert.equal(calendarOrdinal(measurementRange("2025-01-01", "90d").end) - calendarOrdinal(measurementRange("2025-01-01", "90d").start), 89);
  assert.equal(addCalendarDays("2025-01-01", -1), "2024-12-31");
  assert.throws(() => calendarOrdinal("2025-02-29"));
});

test("全部与自定义使用显式边界，校验非法和倒置日期，支持单日", () => {
  const interval = { start: "2024-01-01", end: "2025-07-14" };
  assert.deepEqual(measurementRange("2025-07-14", "all", interval), interval);
  assert.deepEqual(measurementRange("2025-07-14", "custom", interval), interval);
  assert.throws(() => measurementRange("2025-07-14", "custom", { start: "2025-07-15", end: "2025-07-14" }));
  assert.throws(() => measurementRange("2025-07-14", "custom", { start: "2025-02-29", end: "2025-07-14" }));
  assert.throws(() => measurementRange("2025-07-14", "all"));
  const single = { start: "2025-07-14", end: "2025-07-14" };
  assert.deepEqual(measurementDateTicks(single), [single.start]);
});

test("长区间只生成少量刻度，包含边界，按真实日历间距定位", () => {
  const interval = { start: "1000-01-01", end: "9999-12-31" };
  const ticks = measurementDateTicks(interval, 4);
  assert.equal(ticks.length, 4);
  assert.equal(ticks[0], interval.start);
  assert.equal(ticks.at(-1), interval.end);
  assert.deepEqual(measurementDateTicks(measurementRange("2024-03-01", "7d")), ["2024-02-24", "2024-02-25", "2024-02-26", "2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01"]);
});

test("缺测段只连接真实空腹端点，不生成读数", () => {
  const records = [row("a", "2025-01-01", "daytime"), row("b", "2025-01-02", "daytime"), row("c", "2025-01-05", "daytime")];
  const trend = measurementTrend(records, "weightKg", false);
  assert.equal(trend.points.length, 3);
  assert.equal(trend.segments.length, 2);
  assert.equal(trend.segments[0].missingDayCount, 0);
  assert.equal(trend.segments[1].missingDayCount, 2);
  assert.equal(trend.segments[1].a.id, "b");
  assert.equal(trend.segments[1].b.id, "c");
});

test("晚间连线和同日配对保留异常数值，开关只影响图", () => {
  const records = [row("a", "2025-01-01", "daytime", "76.00"), row("b", "2025-01-01", "evening", "75.00"), row("c", "2025-01-02", "daytime"), row("d", "2025-01-02", "evening")];
  const trend = measurementTrend(records, "weightKg", true);
  assert.equal(trend.points.length, 4);
  assert.equal(trend.pairs.length, 2);
  assert.equal(trend.segments.length, 2);
  assert.equal(trend.segments.filter((segment) => segment.period === "daytime").length, 1);
  assert.equal(trend.segments.filter((segment) => segment.period === "evening").length, 1);
  assert.equal(metricDifference(records[0], records[1], "weightKg"), -1);
  const hidden = measurementTrend(records, "weightKg", false);
  assert.equal(hidden.points.length, 2);
  assert.equal(hidden.pairs.length, 0);
  assert.equal(hidden.segments.length, 1);
  assert.equal(buildMeasurementDays(records).length, 2);
});

test("体脂缺项只影响体脂图，差值按百分点计算，未知空腹不混入主趋势", () => {
  const records = [row("a", "2025-01-01", "daytime", "75.00", "25.01"), row("b", "2025-01-01", "evening", "75.90", "25.11"), row("c", "2025-01-02", "daytime", "75.00", null), { ...row("d", "2025-01-03", "daytime"), fasting: null }];
  assert.equal(measurementTrend(records, "weightKg", true).points.length, 3);
  assert.equal(measurementTrend(records, "bodyFatPercent", true).points.length, 2);
  assert.equal(metricDifference(records[0], records[1], "bodyFatPercent"), .1);
  assert.equal(metricDifference(records[2], records[1], "bodyFatPercent"), null);
});

test("候选不参与主线与差值，不越过待选择日连线，选择后各视图同步", () => {
  const records = [row("a", "2025-01-01", "daytime"), row("b", "2025-01-02", "daytime", "76.00"), row("c", "2025-01-02", "daytime", "77.00"), row("d", "2025-01-03", "daytime"), row("n", "2025-01-02", "evening", "78.00")];
  const unresolved = measurementTrend(records, "weightKg", true);
  assert.equal(unresolved.segments.length, 0);
  assert.ok(!unresolved.points.some((point) => point.id === "b" || point.id === "c"));
  const choices = { "2025-01-02:daytime": "b" };
  const selected = buildMeasurementDays(records, choices).find((day) => day.date === "2025-01-02")!;
  assert.equal(selected.daytimeRecord?.id, "b");
  assert.equal(selected.weightDifferenceKg, 2);
  assert.equal(selected.needsSelection, false);
  const trend = measurementTrend(records, "weightKg", true, choices);
  assert.equal(trend.segments.length, 2);
  assert.ok(!trend.points.some((point) => point.id === "c"));
  assert.equal(trend.pairs.length, 1);
  assert.equal(measurementTrend([], "weightKg", true).points.length, 0);
});

test("最近记录取当前区间最新 10 个日历日，漏记昨日与连续缺测保持空值", () => {
  const records = Array.from({ length: 12 }, (_, index) => row(String(index), addCalendarDays("2025-01-01", index * 2), "evening"));
  const recent = recentMeasurementDays(records, measurementRange("2025-01-23", "30d"));
  assert.equal(recent.length, 10);
  assert.equal(recent[0].date, "2025-01-23");
  assert.equal(recent.at(-1)?.date, "2025-01-14");
  assert.equal(recent[1].date, "2025-01-22");
  assert.deepEqual(recent[1].records, []);
  assert.equal(recent[1].daytimeRecord, null);
  const blank = recentMeasurementDays(records, { start: "2025-01-24", end: "2025-01-25" });
  assert.equal(blank.length, 2);
  assert.ok(blank.every(day => !day.records.length && day.weightDifferenceKg === null));
});
