import type { MeasurementPeriod } from "./assignment";
import { measurementCalendarPage } from "./calendar";

export type DailyMeasurement = {
  id: string;
  recordDate: string;
  period: MeasurementPeriod;
  weightKg: string | null;
  bodyFatPercent: string | null;
  fasting: boolean | null;
  sourceLocalTime: string;
  recordKind?: "observed" | "estimated";
  updatedAt?: string|Date; createdAt?:string|Date; sourceRow?:number|null; deletedAt?:string|Date|null;
};

/** 旧同槽实测按最后保存采用；原始行继续留档。 */
export function latestMeasurement<T extends DailyMeasurement>(rows:T[]):T|null {
  const time=(v:string|Date|undefined)=>v?new Date(v).getTime():0;
  return [...rows].filter(row=>!row.deletedAt).sort((a,b)=>time(b.updatedAt)-time(a.updatedAt)||time(b.createdAt)-time(a.createdAt)||(b.sourceRow??0)-(a.sourceRow??0)||b.sourceLocalTime.localeCompare(a.sourceLocalTime)||b.id.localeCompare(a.id))[0]??null;
}
export function adoptedMeasurements<T extends DailyMeasurement>(rows:T[]):T[] {
  const slots=new Map<string,T[]>();
  for(const row of rows.filter(row=>!row.deletedAt&&row.recordKind!=="estimated")){const key=row.recordDate+":"+row.period;slots.set(key,[...(slots.get(key)??[]),row]);}
  const chosen=new Set([...slots.values()].map(rows=>latestMeasurement(rows)!.id));
  return rows.filter(row=>!row.deletedAt&&(row.recordKind==="estimated"||chosen.has(row.id)));
}
/** 晨晚差只能来自同归属日的真实、条件明确的配对。 */
export function isRealMeasurementPair(daytime: DailyMeasurement | null, evening: DailyMeasurement | null) {
  return !!daytime && !!evening && daytime.recordDate === evening.recordDate
    && daytime.period === "daytime" && evening.period === "evening"
    && daytime.fasting === true && evening.fasting === false
    && daytime.recordKind !== "estimated" && evening.recordKind !== "estimated";
}

export function measurementWeightDifference(daytime: DailyMeasurement | null, evening: DailyMeasurement | null) {
  return isRealMeasurementPair(daytime, evening) && daytime?.weightKg != null && evening?.weightKg != null
    ? (Math.round(Number(evening.weightKg) * 100) - Math.round(Number(daytime.weightKg) * 100)) / 100
    : null;
}

/** 各时段共同采用最后保存的实测，实测优先于估计。 */
export function buildMeasurementDays<T extends DailyMeasurement>(records: T[], _choices: Record<string, string> = {}, metric: "weightKg" | "bodyFatPercent" = "weightKg", dates: string[] = []) {
  void _choices;
  const groups = new Map<string, { date: string; daytime: T[]; evening: T[] }>();
  for (const record of adoptedMeasurements(records)) {
    const group = groups.get(record.recordDate) ?? { date: record.recordDate, daytime: [], evening: [] };
    group[record.period].push(record);
    groups.set(record.recordDate, group);
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
      const selected = latestMeasurement(observed);
      if (observed.length && !selected) return null;
      if (selected && (selected[metric] !== null || selected.fasting !== (period === "daytime"))) return selected;
      return estimates.find((row) => row.period === period && row[metric] !== null) ?? selected;
    };
    const daytime = pick("daytime");
    const evening = pick("evening");
    return {
      ...group, records: allRecords, daytimeRecord: daytime, eveningRecord: evening,
      weightDifferenceKg: measurementWeightDifference(daytime, evening),
      needsSelection: false,
    };
  });
}

/** 当前区间内最新的日历日，空行仅在展示时推导。 */
export function recentMeasurementDays<T extends DailyMeasurement>(records: T[], interval: { start: string; end: string }, choices: Record<string, string> = {}, limit = 10, metric: "weightKg" | "bodyFatPercent" = "weightKg") {
  const dates = measurementCalendarPage(interval, limit);
  const visible = new Set(dates);
  return buildMeasurementDays(records.filter(row => visible.has(row.recordDate)), choices, metric, dates);
}
