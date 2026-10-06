import { buildMeasurementDays, type DailyMeasurement } from "./days";
import { addCalendarDays, type MeasurementMetric } from "./trend";

/** 摘要始终取最新空腹状态，不随图表历史区间变化；每个归属日最多一个代表值。 */
export function measurementSummary<T extends DailyMeasurement>(records: T[], metric: MeasurementMetric, choices: Record<string, string> = {}) {
  const fasting = buildMeasurementDays(records.filter((row) => row.recordKind !== "estimated"), choices).map((day) => day.daytimeRecord)
    .filter((row): row is T => row !== null && row.fasting === true);
  const valid = fasting.filter((row) => row[metric] !== null);
  const current = valid[0] ?? null;
  const companionMetric: MeasurementMetric = metric === "weightKg" ? "bodyFatPercent" : "weightKg";
  const companion = fasting.find((row) => row[companionMetric] !== null) ?? null;
  const start = current ? addCalendarDays(current.analysisDate, -6) : null;
  const window = start ? valid.filter((row) => row.analysisDate >= start) : [];
  const first = window.at(-1) ?? null;
  const cents = window.map((row) => Math.round(Number(row[metric]) * 100));
  return {
    current, companion, companionMetric, start, end: current?.analysisDate ?? null,
    changeStart: window.length >= 2 ? first!.analysisDate : null,
    change: window.length >= 2 ? (cents[0] - cents.at(-1)!) / 100 : null,
    average: cents.length ? Math.round(cents.reduce((sum, value) => sum + value, 0) / cents.length) / 100 : null,
    coverage: window.length,
  };
}
