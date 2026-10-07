import type { MeasurementPeriod } from "./assignment";
import { measurementCalendarPage } from "./calendar";

export type DailyMeasurement = {
  id: string;
  analysisDate: string;
  period: MeasurementPeriod;
  weightKg: string | null;
  bodyFatPercent: string | null;
  fasting: boolean | null;
  sourceLocalTime: string;
  recordKind?: "observed" | "estimated";
};

/** 晨晚差只能来自同归属日的真实、条件明确的配对。 */
export function isRealMeasurementPair(daytime: DailyMeasurement | null, evening: DailyMeasurement | null) {
  return !!daytime && !!evening && daytime.analysisDate === evening.analysisDate
    && daytime.period === "daytime" && evening.period === "evening"
    && daytime.fasting === true && evening.fasting === false
    && daytime.recordKind !== "estimated" && evening.recordKind !== "estimated";
}

export function measurementWeightDifference(daytime: DailyMeasurement | null, evening: DailyMeasurement | null) {
  return isRealMeasurementPair(daytime, evening) && daytime?.weightKg != null && evening?.weightKg != null
    ? (Math.round(Number(evening.weightKg) * 100) - Math.round(Number(daytime.weightKg) * 100)) / 100
    : null;
}

/** 同时段多次测量先保留候选，不擅自取平均、最低值或最后一条。 */
export function buildMeasurementDays<T extends DailyMeasurement>(records: T[], choices: Record<string, string> = {}, metric: "weightKg" | "bodyFatPercent" = "weightKg", dates: string[] = []) {
  const groups = new Map<string, { date: string; daytime: T[]; evening: T[] }>();
  for (const record of records) {
    const group = groups.get(record.analysisDate) ?? { date: record.analysisDate, daytime: [], evening: [] };
    group[record.period].push(record);
    groups.set(record.analysisDate, group);
  }
  for (const date of dates) if (!groups.has(date)) groups.set(date, { date, daytime: [], evening: [] });
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date)).map((group) => {
    const allRecords = [...group.daytime, ...group.evening];
    const estimates = allRecords.filter((row) => row.recordKind === "estimated");
    for (const period of ["daytime", "evening"] as const) {
      if (group[period].some((row) => row.recordKind !== "estimated")) group[period] = group[period].filter((row) => row.recordKind !== "estimated");
    }
    const pick = (period: MeasurementPeriod) => {
      const candidates = group[period];
      const observed = candidates.filter((row) => row.recordKind !== "estimated");
      const selected = observed.find((row) => row.id === choices[`${group.date}:${period}`])
        ?? (observed.length === 1 ? observed[0] : null);
      if (observed.length && !selected) return null;
      if (selected && (selected[metric] !== null || selected.fasting !== (period === "daytime"))) return selected;
      return estimates.find((row) => row.period === period && row[metric] !== null) ?? selected;
    };
    const daytime = pick("daytime");
    const evening = pick("evening");
    return {
      ...group, records: allRecords, daytimeRecord: daytime, eveningRecord: evening,
      weightDifferenceKg: measurementWeightDifference(daytime, evening),
      needsSelection: (["daytime", "evening"] as const).some((period) => group[period].filter((row) => row.recordKind !== "estimated").length > 1 && !group[period].some((row) => row.recordKind !== "estimated" && row.id === choices[`${group.date}:${period}`])),
    };
  });
}

/** 当前区间内最新的日历日，空行仅在展示时推导。 */
export function recentMeasurementDays<T extends DailyMeasurement>(records: T[], interval: { start: string; end: string }, choices: Record<string, string> = {}, limit = 10, metric: "weightKg" | "bodyFatPercent" = "weightKg") {
  const dates = measurementCalendarPage(interval, limit);
  const visible = new Set(dates);
  return buildMeasurementDays(records.filter(row => visible.has(row.analysisDate)), choices, metric, dates);
}
