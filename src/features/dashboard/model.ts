import { buildMeasurementDays } from "../measurements/days";
import { dailyTotals, emptyNutrition, type MealView } from "../meals/model";
import { measurementSummary } from "../measurements/summary";
import { addCalendarDays } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { emptyEnergy, energyDays, type EnergyDay, type EnergySnapshot } from "../activities/model";

export function overview(meals: MealView[], records: MeasurementDisplay[], today: string, snapshot: EnergySnapshot = emptyEnergy()) {
  const day = dailyTotals(meals).find(row => row.date === today), energy = energyDays(snapshot, records, [today])[0];
  const nutrition = day?.totals ?? { values: emptyNutrition(), incomplete: { caloriesKcal: false, proteinG: false, carbsG: false, fatG: false } };
  return { today, mealCount: day?.meals.length ?? 0, nutrition, energy,
    body: (["weightKg", "bodyFatPercent"] as const).map(metric => ({ metric, ...measurementSummary(records.filter(row => row.recordDate <= today), metric) })),
    energyBalance: nutrition.values.caloriesKcal !== null && energy.totalKcal !== null ? difference(nutrition.values.caloriesKcal, energy.totalKcal, 10000) : null,
    activities: energy.activities };
}
const difference = (a: string, b: string, precision: number) => (Math.round(Number(a) * precision) - Math.round(Number(b) * precision)) / precision;
export type OverviewDay = {
  date: string; nextDate: string; meals: MealView[];
  nutrition: ReturnType<typeof dailyTotals>[number]["totals"] | null;
  morning: MeasurementDisplay | null; nextMorning: MeasurementDisplay | null;
  weightChangeKg: number | null; differenceEstimated: boolean; ambiguous: boolean;
  energy: EnergyDay; energyBalance: number | null;
};
/** D日摄入/消耗对应D+1晨重减D晨重；不跨缺日、不生成身体估计。 */
export function overviewDays(meals: MealView[], records: MeasurementDisplay[], dates: string[], showEstimates = false, snapshot: EnergySnapshot = emptyEnergy(), asOf?: string): OverviewDay[] {
  const nutrition = new Map(dailyTotals(meals).map(day => [day.date, day]));
  const visible = records.filter(record => (!asOf || record.recordDate <= asOf) && (showEstimates || record.recordKind !== "estimated"));
  const mornings = new Map(buildMeasurementDays(visible, {}, "weightKg").map(day => [day.date, day]));
  const energy = energyDays(snapshot, records.filter(record => !asOf || record.recordDate <= asOf), dates);
  const morning = (date: string) => { const record = mornings.get(date)?.daytimeRecord; return record?.fasting === true && record.weightKg !== null ? record : null; };
  return dates.map((date, index) => {
    const nextDate = addCalendarDays(date, 1), current = morning(date), next = morning(nextDate), day = nutrition.get(date), expenditure = energy[index];
    const ambiguous = [date, nextDate].some(date => (mornings.get(date)?.daytime.filter(record => record.recordKind !== "estimated").length ?? 0) > 1);
    return { date, nextDate, meals: day?.meals ?? [], nutrition: day?.totals ?? null, morning: current, nextMorning: next,
      weightChangeKg: !ambiguous && current?.weightKg != null && next?.weightKg != null ? difference(next.weightKg, current.weightKg, 100) : null,
      differenceEstimated: !!(current && next && (current.recordKind === "estimated" || next.recordKind === "estimated")), ambiguous, energy: expenditure,
      energyBalance: day?.totals.values.caloriesKcal != null && expenditure.totalKcal !== null ? difference(day.totals.values.caloriesKcal, expenditure.totalKcal, 10000) : null };
  });
}
export function latestRealWeight(records: MeasurementDisplay[], today: string) {
  return records.filter(record => record.recordKind !== "estimated" && record.weightKg !== null && record.recordDate <= today)
    .sort((a,b) => b.recordDate.localeCompare(a.recordDate) || Number(b.period==="evening")-Number(a.period==="evening") || b.sourceLocalTime.localeCompare(a.sourceLocalTime) || b.id.localeCompare(a.id))[0] ?? null;
}
export function latestMorningWeight(records: MeasurementDisplay[], today: string) {
  return latestRealWeight(records.filter(record => record.period === "daytime" && record.fasting === true), today);
}
