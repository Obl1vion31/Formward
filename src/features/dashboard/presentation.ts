import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
import type { MealView } from "../meals/model";
import { dailyTotals } from "../meals/model";
import { energyDays, type EnergySnapshot } from "../activities/model";
import { latestMorningWeight, overview, overviewDays } from "./model";
import { adoptedMeasurements } from "../measurements/days";
import type { EnergyDeviceCoverage } from "../data-sources/energy-coverage";

/** 服务端生成两种晨重显示口径；切换估计不重算能量，也不写入记录。 */
export function overviewPresentation(meals: MealView[], records: MeasurementDisplay[], snapshot: EnergySnapshot, today: string, device: EnergyDeviceCoverage | null = null) {
  const recordDates = [...new Set([...meals.filter(row => !row.deletedAt).map(row => row.date), ...records.map(row => row.recordDate), ...snapshot.days.filter(row => !row.deletedAt).map(row => row.date), ...snapshot.activities.filter(row => !row.deletedAt).map(row => row.date)])].filter(date => date <= today).sort();
  const knownDates = [...new Set([today, addCalendarDays(today,1), ...recordDates, ...records.filter(row => row.recordDate <= today).flatMap(row => [row.recordDate, addCalendarDays(row.recordDate, -1)])])].sort();
  const first = knownDates[0] < addCalendarDays(today, -3660) ? addCalendarDays(today, -3660) : knownDates[0];
  const dates = [...new Set([...knownDates, ...Array.from({ length: calendarOrdinal(today) - calendarOrdinal(first) + 1 }, (_, i) => addCalendarDays(first, i))])].sort();
  const intake = dailyTotals(meals);
  const latestIntake = intake.find(day => day.date <= today) ?? null;
  const latestEnergy = energyDays(snapshot, records, recordDates).filter(day => day.record || day.activities.length > 0).at(-1) ?? null;
  const weights = adoptedMeasurements(records).filter(row => row.weightKg != null);
  // 客户端的日历日期可能和服务器相差一天。快捷录入使用该日的事实，独立于图表选日。
  const todayOptions = energyDays(snapshot, records, [-1, 0, 1].map(offset => addCalendarDays(today, offset))).map(energy => {
    const diet = intake.find(day => day.date === energy.date);
    return { date: energy.date, mealCount: diet?.meals.length ?? 0, hasWeight: weights.some(row => row.recordDate === energy.date),
      canEstimate: (energy.totalKcal === null || !!energy.cumulative) && !device };
  });
  return { today, recordDates, days: overviewDays(meals, records, dates, snapshot, today), summary: overview(meals, records, today, snapshot), body: latestMorningWeight(records, today), latestIntake, latestEnergy, todayOptions, device };
}
export type OverviewPresentation = ReturnType<typeof overviewPresentation>;
