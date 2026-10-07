import { buildMeasurementDays, isRealMeasurementPair, type DailyMeasurement } from "./days";
import { addCalendarDays, calendarOrdinal } from "./calendar";
export { addCalendarDays, calendarOrdinal } from "./calendar";

export type MeasurementMetric = "weightKg" | "bodyFatPercent";
export type MeasurementRange = "7d" | "30d" | "90d" | "all" | "custom";
export type MeasurementInterval = { start: string; end: string };

export function measurementRange(anchor: string, mode: MeasurementRange, interval?: MeasurementInterval): MeasurementInterval {
  const result = mode === "all" || mode === "custom" ? interval : {
    start: addCalendarDays(anchor, mode === "7d" ? -6 : mode === "30d" ? -29 : -89), end: anchor,
  };
  if (!result || calendarOrdinal(result.start) > calendarOrdinal(result.end)) throw new Error("起始日期不能晚于结束日期。");
  return result;
}

/** 仅生成可读刻度，长区间不为每个空白日分配元素。 */
export function measurementDateTicks(interval: MeasurementInterval, maximum = 7) {
  const start = calendarOrdinal(interval.start);
  const span = calendarOrdinal(interval.end) - start;
  const count = Math.min(span + 1, Math.max(2, Math.floor(maximum)));
  return Array.from({ length: count }, (_, index) => addCalendarDays(interval.start, count === 1 ? 0 : Math.round(span * index / (count - 1))));
}

export function metricDifference(daytime: DailyMeasurement | null, evening: DailyMeasurement | null, metric: MeasurementMetric) {
  const morning = daytime?.[metric];
  const night = evening?.[metric];
  return isRealMeasurementPair(daytime, evening) && morning != null && night != null ? (Math.round(Number(night) * 100) - Math.round(Number(morning) * 100)) / 100 : null;
}

/** SVG 坐标向下增长：高值对应较小 position；两种指标的最小跨度均为 3。 */
export function normalScale(values: number[]) {
  const finite = values.filter(Number.isFinite);
  const minimum = finite.reduce((a, b) => Math.min(a, b), finite[0] ?? 0);
  const maximum = finite.reduce((a, b) => Math.max(a, b), finite[0] ?? 0);
  const span = Math.max(3, (maximum - minimum) * 1.2 + .6);
  const middle = (minimum + maximum) / 2;
  const magnitude = 10 ** Math.floor(Math.log10(span / 5));
  const step = [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= span / 5)! * magnitude;
  const low = Math.floor((middle - span / 2) / step) * step;
  const high = Math.ceil((middle + span / 2) / step) * step;
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => high - index * step);
  return { low, high, ticks, position: (value: number) => (high - value) / (high - low) };
}

export function measurementTrend<T extends DailyMeasurement>(records: T[], metric: MeasurementMetric, showEvening: boolean, choices: Record<string, string> = {}) {
  const days = buildMeasurementDays(records, choices, metric).reverse();
  const morning = days.map((day) => day.daytimeRecord)
    .filter((row): row is T => row !== null && row.fasting === true && row[metric] !== null);
  const evening = showEvening ? days.map((day) => day.eveningRecord).filter((row): row is T => row !== null && row[metric] !== null) : [];
  const connect = (points: T[], period: "daytime" | "evening") => points.slice(1).flatMap((b, index) => {
    const a = points[index];
    const unresolved = days.some((day) => day.date > a.analysisDate && day.date < b.analysisDate && day[period].length > 1 && !(period === "daytime" ? day.daytimeRecord : day.eveningRecord));
    return unresolved ? [] : [{ a, b, period, estimated: a.recordKind === "estimated" || b.recordKind === "estimated", missingDayCount: calendarOrdinal(b.analysisDate) - calendarOrdinal(a.analysisDate) - 1 }];
  });
  const segments = [...connect(morning, "daytime"), ...connect(evening, "evening")];
  const pairs = showEvening ? days.filter((day) => metricDifference(day.daytimeRecord, day.eveningRecord, metric) !== null) : [];
  return { points: [...morning, ...evening], segments, pairs };
}
