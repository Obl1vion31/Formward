import { addCalendarDays } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
import type { MealView } from "../meals/model";
import { dailyTotals } from "../meals/model";
import { energyDays, type EnergySnapshot } from "../activities/model";
import { latestMorningWeight, overview, overviewDays } from "./model";

/** 服务端生成两种晨重显示口径；切换估计不重算能量，也不写入记录。 */
export function overviewPresentation(meals: MealView[], records: MeasurementDisplay[], snapshot: EnergySnapshot, today: string) {
  const recordDates = [...new Set([...meals.filter(row => !row.deletedAt).map(row => row.date), ...records.map(row => row.recordDate), ...snapshot.days.filter(row => !row.deletedAt).map(row => row.date), ...snapshot.activities.filter(row => !row.deletedAt).map(row => row.date)])].filter(date => date <= today).sort();
  const dates = [...new Set([today, ...recordDates, ...records.flatMap(row => [row.recordDate, addCalendarDays(row.recordDate, -1)])])].sort();
  const latestIntake = dailyTotals(meals).find(day => day.date <= today) ?? null;
  const latestEnergy = energyDays(snapshot, records, recordDates).filter(day => day.record || day.activities.length > 0).at(-1) ?? null;
  return { today, recordDates, days: overviewDays(meals, records, dates, false, snapshot, today), estimatedDays: overviewDays(meals, records, dates, true, snapshot, today), summary: overview(meals, records, today, snapshot), body: latestMorningWeight(records, today), latestIntake, latestEnergy };
}
export type OverviewPresentation = ReturnType<typeof overviewPresentation>;
