import { metrics, type Nutrition, type dailyTotals } from "../meals/model";
import type { EnergyDay } from "../activities/model";

// 正式记录最多四位小数；汇总用整数，均值只在最后一步四舍五入。
const units = (value: string) => { const negative = value.startsWith("-"); const [whole, fraction = ""] = value.replace(/^-/, "").split("."); return (BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"))) * (negative ? -BigInt(1) : BigInt(1)); };
const decimal = (value: bigint) => (value < BigInt(0) ? "-" : "") + (value < BigInt(0) ? -value : value) / BigInt(10000) + "." + String((value < BigInt(0) ? -value : value) % BigInt(10000)).padStart(4, "0");
export function decimalStatistics(values: (string | null)[]) {
  const known = values.filter((value): value is string => value !== null).map(units);
  const sum = known.reduce((total, value) => total + value, BigInt(0)), count = known.length;
  const mean = count ? (sum < BigInt(0) ? -BigInt(1) : BigInt(1)) * (((sum < BigInt(0) ? -sum : sum) + BigInt(count) / BigInt(2)) / BigInt(count)) : null;
  return { count, sum: count ? decimal(sum) : null, mean: mean === null ? null : decimal(mean), min: count ? decimal(known.reduce((a, b) => a < b ? a : b)) : null, max: count ? decimal(known.reduce((a, b) => a > b ? a : b)) : null };
}
type MealDays = ReturnType<typeof dailyTotals>;
export function mealStatistics(days: MealDays, window: { from: string | null; to: string | null }) {
  const summarize = (rows: MealDays) => Object.fromEntries(metrics.map(metric => [metric, { ...decimalStatistics(rows.map(day => day.totals.values[metric])), incompleteDates: rows.filter(day => day.totals.incomplete[metric]).map(day => day.date) }])) as Record<keyof Nutrition, ReturnType<typeof decimalStatistics> & { incompleteDates: string[] }>;
  return { window, scope: "returned_page", recordedDays: days.length, completeDays: days.filter(day => day.day.status === "complete").length, recorded: summarize(days), complete: summarize(days.filter(day => day.day.status === "complete")) };
}
export function energyStatistics(days: EnergyDay[], window: { from: string; to: string }) {
  return { window, scope: "returned_page", finalDays: decimalStatistics(days.filter(day => !day.cumulative).map(day => day.totalKcal)), cumulativeDates: days.filter(day => day.cumulative).map(day => day.date) };
}
export function balanceStatistics(meals: MealDays, energy: EnergyDay[], window: { from: string; to: string }) {
  const byDate = new Map(meals.map(day => [day.date, day]));
  const days = energy.map(day => {
    const meal = byDate.get(day.date), intake = meal?.totals.values.caloriesKcal ?? null;
    const reasons = [!meal || meal.day.status !== "complete" ? "intake_not_complete" : null, intake === null || meal?.totals.incomplete.caloriesKcal ? "intake_unknown_or_partial" : null, day.totalKcal === null ? "expenditure_unknown" : null, day.cumulative ? "expenditure_cumulative" : null].filter((value): value is string => value !== null);
    return { date: day.date, included: reasons.length === 0, reasons, intakeKcal: intake, expenditureKcal: day.totalKcal, netKcal: reasons.length ? null : decimal(units(intake!) - units(day.totalKcal!)) };
  });
  const included = days.filter(day => day.included);
  return { window, scope: "returned_page", days, coveredDays: included.length, excludedDates: days.filter(day => !day.included).map(day => day.date), intake: decimalStatistics(included.map(day => day.intakeKcal)), expenditure: decimalStatistics(included.map(day => day.expenditureKcal)), net: decimalStatistics(included.map(day => day.netKcal)) };
}
