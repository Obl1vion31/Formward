import type { OverviewDay } from "./model";

export function rangeCoverage(days: OverviewDay[], today: string) {
  const occurred = days.filter(day => day.date <= today);
  const gaps = occurred.filter(day => day.energyBalance === null).map(day => ({
    date: day.date,
    meals: !day.nutrition ? "尚无饮食记录" : day.mealDayStatus !== "complete" ? "饮食尚未确认已记全" : day.nutrition.values.caloriesKcal === null ? "摄入热量未知" : null,
    energy: day.energy.totalKcal === null ? "全天消耗未知" : null,
  }));
  return { total: occurred.length, covered: occurred.length - gaps.length, gaps };
}
