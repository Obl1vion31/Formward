import { adoptedMeasurements, buildMeasurementDays } from "../measurements/days";
import { dailyTotals, emptyNutrition, type MealDayStatus, type MealView } from "../meals/model";
import { measurementSummary } from "../measurements/summary";
import { addCalendarDays } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { emptyEnergy, energyDays, type EnergyDay, type EnergySnapshot } from "../activities/model";

export function overview(meals: MealView[], records: MeasurementDisplay[], today: string, snapshot: EnergySnapshot = emptyEnergy()) {
  const day = dailyTotals(meals).find(row => row.date === today), energy = energyDays(snapshot, records, [today])[0];
  const nutrition = day?.totals ?? { values: emptyNutrition(), incomplete: { caloriesKcal: false, proteinG: false, carbsG: false, fatG: false } };
  return { today, mealCount: day?.meals.length ?? 0, nutrition, energy,
    body: (["weightKg", "bodyFatPercent"] as const).map(metric => ({ metric, ...measurementSummary(records.filter(row => row.recordDate <= today), metric) })),
    energyBalance: day?.day.status === "complete" && nutrition.values.caloriesKcal !== null && energy.totalKcal !== null && !energy.cumulative ? difference(nutrition.values.caloriesKcal, energy.totalKcal, 10000) : null,
    activities: energy.activities };
}
const difference = (a: string, b: string, precision: number) => (Math.round(Number(a) * precision) - Math.round(Number(b) * precision)) / precision;
/** 在服务端选择足够的小数位，使显示出来的减法仍能算对；不改写记录精度。 */
export function energyEquationReadings(intake: string|null, expenditure: string|null, balance: number|null) {
  let precision=0;
  const i=intake===null?null:Math.round(Number(intake)*10000),e=expenditure===null?null:Math.round(Number(expenditure)*10000);
  if(i!==null && e!==null && balance!==null){
    const b=i-e;
    while(precision<4 && Math.round(i/10**(4-precision))-Math.round(e/10**(4-precision))!==Math.round(b/10**(4-precision)))precision++;
  }
  const format=(n:number|null)=>n===null?"—":(n+0).toLocaleString("zh-CN",{maximumFractionDigits:precision});
  return {intake:format(i===null?null:i/10000),expenditure:format(e===null?null:e/10000),balance:balance===null?"—":(balance>0?"+":"")+format(balance),precision};
}
export type OverviewWeek = {
  from: string; through: string; nextDate: string; coveredDays: number; energyBalance: number | null;
  startWeightKg: string | null; endWeightKg: string | null; weightChangeKg: number | null;
  estimated: boolean; missingMorningDates: string[];
};
export type OverviewDay = {
  date: string; nextDate: string; meals: MealView[];
  nutrition: ReturnType<typeof dailyTotals>[number]["totals"] | null;
  morning: MeasurementDisplay | null; nextMorning: MeasurementDisplay | null;
  weightChangeKg: number | null; differenceEstimated: boolean; ambiguous: boolean;
  week?: OverviewWeek; displayEnergy?: ReturnType<typeof energyEquationReadings>; mealDayStatus: MealDayStatus; balanceEligible: boolean; energy: EnergyDay; energyBalance: number | null;
};
/** D日摄入/消耗对应D+1晨重减D晨重；不跨缺日、不生成身体估计。 */
export function overviewDays(meals: MealView[], records: MeasurementDisplay[], dates: string[], showEstimates = false, snapshot: EnergySnapshot = emptyEnergy(), asOf?: string): OverviewDay[] {
  // 统计支持日期独立于绘图区，7D和自定义范围不会裁掉七天所需的事实。
  const calculationDates = [...new Set(dates.flatMap(date => Array.from({ length: 7 }, (_, i) => addCalendarDays(date, -i))))].sort();
  const nutrition = new Map(dailyTotals(meals).map(day => [day.date, day]));
  const visible = records.filter(record => (!asOf || record.recordDate <= asOf) && (showEstimates || record.recordKind !== "estimated"));
  const mornings = new Map(buildMeasurementDays(visible, {}, "weightKg").map(day => [day.date, day]));
  const energy = energyDays(snapshot, records.filter(record => !asOf || record.recordDate <= asOf), calculationDates);
  const morning = (date: string) => { const record = mornings.get(date)?.daytimeRecord; return record?.fasting === true && record.weightKg !== null ? record : null; };
  const rows: OverviewDay[] = calculationDates.map((date, index) => {
    const nextDate = addCalendarDays(date, 1), current = morning(date), next = morning(nextDate), day = nutrition.get(date), expenditure = energy[index];
    const ambiguous = [date, nextDate].some(date => (mornings.get(date)?.daytime.filter(record => record.recordKind !== "estimated").length ?? 0) > 1);
    const energyBalance=day?.day.status === "complete" && day?.totals.values.caloriesKcal != null && expenditure.totalKcal !== null && !expenditure.cumulative ? difference(day.totals.values.caloriesKcal, expenditure.totalKcal, 10000) : null;
    return { displayEnergy:energyEquationReadings(day?.totals.values.caloriesKcal??null,expenditure.totalKcal,energyBalance),date, nextDate, meals: day?.meals ?? [], nutrition: day?.totals ?? null, morning: current, nextMorning: next,
      weightChangeKg: !ambiguous && current?.weightKg != null && next?.weightKg != null ? difference(next.weightKg, current.weightKg, 100) : null,
      differenceEstimated: !!(current && next && (current.recordKind === "estimated" || next.recordKind === "estimated")), ambiguous, mealDayStatus:day?.day.status??"unconfirmed",balanceEligible:day?.day.status==="complete", energy: expenditure,
      energyBalance };
  });
  const byDate = new Map(rows.map(day => [day.date, day]));
  return dates.map(date => {
    const day = byDate.get(date)!;
    const from = addCalendarDays(date, -6), start = byDate.get(from)!;
    const balances = Array.from({ length: 7 }, (_, i) => byDate.get(addCalendarDays(from, i))?.energyBalance).filter((n): n is number => n != null);
    const first = start.morning, last = day.nextMorning;
    const validWeights = !start.ambiguous && !day.ambiguous && first?.weightKg != null && last?.weightKg != null;
    const week: OverviewWeek = {
      from, through: date, nextDate: day.nextDate, coveredDays: balances.length,
      energyBalance: balances.length ? balances.reduce((sum, value) => sum + Math.round(value * 10000), 0) / 10000 : null,
      startWeightKg: first?.weightKg ?? null, endWeightKg: last?.weightKg ?? null,
      weightChangeKg: validWeights ? difference(last!.weightKg!, first!.weightKg!, 100) : null,
      estimated: !!(first && last && (first.recordKind === "estimated" || last.recordKind === "estimated")),
      missingMorningDates: [!first?.weightKg ? from : null, !last?.weightKg ? day.nextDate : null].filter((value): value is string => value !== null)
    };
    return { ...day, week };
  });
}
export function latestRealWeight(records: MeasurementDisplay[], today: string) {
  return adoptedMeasurements(records).filter(record => record.recordKind !== "estimated" && record.weightKg !== null && record.recordDate <= today)
    .sort((a,b) => b.recordDate.localeCompare(a.recordDate) || Number(b.period==="evening")-Number(a.period==="evening") || b.sourceLocalTime.localeCompare(a.sourceLocalTime) || b.id.localeCompare(a.id))[0] ?? null;
}
export function latestMorningWeight(records: MeasurementDisplay[], today: string) {
  return latestRealWeight(adoptedMeasurements(records).filter(record => record.period === "daytime" && record.fasting === true), today);
}
