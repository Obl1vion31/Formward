import type { MeasurementPeriod } from "./assignment";

export type DailyMeasurement = {
  id: string;
  analysisDate: string;
  period: MeasurementPeriod;
  weightKg: string;
  bodyFatPercent: string | null;
  fasting: boolean | null;
  sourceLocalTime: string;
  recordKind?: "observed" | "estimated";
};

export function measurementWeightDifference(daytime: DailyMeasurement | null, evening: DailyMeasurement | null) {
  return daytime && evening
    ? (Math.round(Number(evening.weightKg) * 100) - Math.round(Number(daytime.weightKg) * 100)) / 100
    : null;
}

/** 同时段多次测量先保留候选，不擅自取平均、最低值或最后一条。 */
export function buildMeasurementDays<T extends DailyMeasurement>(records: T[], choices: Record<string, string> = {}) {
  const groups = new Map<string, { date: string; daytime: T[]; evening: T[] }>();
  for (const record of records) {
    const group = groups.get(record.analysisDate) ?? { date: record.analysisDate, daytime: [], evening: [] };
    group[record.period].push(record);
    groups.set(record.analysisDate, group);
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date)).map((group) => {
    for (const period of ["daytime", "evening"] as const) {
      if (group[period].some((row) => row.recordKind !== "estimated")) group[period] = group[period].filter((row) => row.recordKind !== "estimated");
    }
    const pick = (period: MeasurementPeriod) => group[period].find((row) => row.id === choices[`${group.date}:${period}`])
      ?? (group[period].length === 1 ? group[period][0] : null);
    const daytime = pick("daytime");
    const evening = pick("evening");
    return {
      ...group, daytimeRecord: daytime, eveningRecord: evening,
      weightDifferenceKg: measurementWeightDifference(daytime, evening),
      needsSelection: (group.daytime.length > 1 && !daytime) || (group.evening.length > 1 && !evening),
    };
  });
}

/** 只显示有测量的归属日，空白日期仍由趋势的日历坐标表达。 */
export function recentMeasurementDays<T extends DailyMeasurement>(records: T[], interval: { start: string; end: string }, choices: Record<string, string> = {}, limit = 10) {
  return buildMeasurementDays(records.filter((row) => row.analysisDate >= interval.start && row.analysisDate <= interval.end), choices).slice(0, limit);
}
