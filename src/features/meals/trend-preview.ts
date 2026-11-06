import { macroDistribution, macroColors, type dailyTotals } from "./model";
import type { TrendPoint } from "@/components/metric-trend-model";
type Day = ReturnType<typeof dailyTotals>[number];
export function intakeTrendPoint(date:string, totals:Day["totals"]|null|undefined, status:string="unconfirmed", mode:"grams"|"energy"="grams"):TrendPoint {
  return {date,value:totals?.values.caloriesKcal!=null?Number(totals.values.caloriesKcal):null,partial:!!totals&&(status!=="complete"||totals.incomplete.caloriesKcal),segments:macroDistribution(totals??undefined,mode)?.map(segment=>({value:segment.calories,color:macroColors[segment.metric]}))};
}
