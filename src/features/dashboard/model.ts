import { dailyTotals, emptyNutrition, type MealView } from "../meals/model";
import { measurementSummary } from "../measurements/summary";
import type { MeasurementDisplay } from "../measurements/entry-state";
export function overview(meals: MealView[], records: MeasurementDisplay[], today: string) {
  const day = dailyTotals(meals).find(row => row.date === today);
  return { today, mealCount: day?.meals.length ?? 0, nutrition: day?.totals ?? { values: emptyNutrition(), incomplete: { caloriesKcal: false, proteinG: false, carbsG: false, fatG: false } },
    body: (["weightKg", "bodyFatPercent"] as const).map(metric => ({ metric, ...measurementSummary(records.filter(row => row.recordDate <= today), metric) })),
    energyBalance: null, activities: null };
}
