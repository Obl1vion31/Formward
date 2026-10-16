import { buildMeasurementDays } from "../measurements/days";
import { dailyTotals, emptyNutrition, type MealView } from "../meals/model";
import { measurementSummary } from "../measurements/summary";
import type { MeasurementDisplay } from "../measurements/entry-state";
export function overview(meals: MealView[], records: MeasurementDisplay[], today: string) {
  const day = dailyTotals(meals).find(row => row.date === today);
  return { today, mealCount: day?.meals.length ?? 0, nutrition: day?.totals ?? { values: emptyNutrition(), incomplete: { caloriesKcal: false, proteinG: false, carbsG: false, fatG: false } },
    body: (["weightKg", "bodyFatPercent"] as const).map(metric => ({ metric, ...measurementSummary(records.filter(row => row.recordDate <= today), metric) })),
    energyBalance: null, activities: null };
}

export type OverviewDay = {
  date: string;
  meals: MealView[];
  nutrition: ReturnType<typeof dailyTotals>[number]["totals"] | null;
  body: Record<"weightKg"|"bodyFatPercent", MeasurementDisplay | null>;
  evening: MeasurementDisplay | null;
  weightDifferenceKg: number | null;
  differenceEstimated: boolean;
  ambiguous: Record<"weightKg"|"bodyFatPercent", boolean>;
};

/** 只聚合已有记录；营养和测量都不补零，多候选不自动挑选。 */
export function overviewDays(meals:MealView[],records:MeasurementDisplay[],dates:string[],showEstimates=false):OverviewDay[] {
  const nutrition=new Map(dailyTotals(meals).map(day=>[day.date,day]));
  const visible=showEstimates?records:records.filter(record=>record.recordKind!=="estimated");
  const weight=new Map(buildMeasurementDays(visible,{},"weightKg").map(day=>[day.date,day]));
  const fat=new Map(buildMeasurementDays(visible,{},"bodyFatPercent").map(day=>[day.date,day]));
  return dates.map(date=>{
    const body={weightKg:null,bodyFatPercent:null} as OverviewDay["body"],ambiguous={weightKg:false,bodyFatPercent:false};
    for(const metric of ["weightKg","bodyFatPercent"] as const){
      const day=(metric==="weightKg"?weight:fat).get(date),record=day?.daytimeRecord;
      if(record?.fasting===true&&record[metric]!==null)body[metric]=record;
      ambiguous[metric]=!!day&&day.daytime.filter(record=>record.recordKind!=="estimated").length>1;
    }
    const day=nutrition.get(date);
    const evening = weight.get(date)?.eveningRecord;
    const validEvening = evening?.fasting === false && evening.weightKg !== null ? evening : null;
    const morning = body.weightKg;
    const difference = morning && validEvening ? (Math.round(Number(validEvening.weightKg)*100)-Math.round(Number(morning.weightKg)*100))/100 : null;
    return {date,meals:day?.meals??[],nutrition:day?.totals??null,body,ambiguous,evening:validEvening,weightDifferenceKg:difference,differenceEstimated:!!(difference!==null&&(morning?.recordKind==="estimated"||validEvening?.recordKind==="estimated"))};
  });
}

export function overviewWeightSeries(days: OverviewDay[]) {
  const baseline = days.find(day => day.body.weightKg !== null)?.body.weightKg ?? null;
  return { baseline, points: days.map(day => ({ day, relativeKg: baseline && day.body.weightKg ? (Math.round(Number(day.body.weightKg.weightKg)*100)-Math.round(Number(baseline.weightKg)*100))/100 : null })) };
}
/** 回填保存时间不影响“最近一次”；晨晚均可，估计不进入摘要。 */
export function latestRealWeight(records: MeasurementDisplay[], today: string) {
  return records.filter(record => record.recordKind !== "estimated" && record.weightKg !== null && record.recordDate <= today)
    .sort((a,b) => b.recordDate.localeCompare(a.recordDate) || Number(b.period==="evening")-Number(a.period==="evening") || b.sourceLocalTime.localeCompare(a.sourceLocalTime) || b.id.localeCompare(a.id))[0] ?? null;
}
