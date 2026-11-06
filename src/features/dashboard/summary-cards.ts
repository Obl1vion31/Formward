import { metricTrendModel } from "@/components/metric-trend-model";
import type { MetricCard } from "@/components/metric-card-rail";
import { formatRecordNumber } from "@/components/number-format";
import { normalScale } from "../measurements/trend";
import { addCalendarDays } from "../measurements/calendar";
import { formatNutrition } from "../meals/model";
import { energyValue } from "../activities/model";
import type { OverviewPresentation } from "./presentation";
import { intakeTrendPoint } from "../meals/trend-preview";

export function summaryCards(data: OverviewPresentation, today: string): MetricCard[] {
  const intake=data.latestIntake, body=data.body, energy=data.latestEnergy;
  const byDate=new Map(data.days.map(day=>[day.date,day]));
  const points=(date:string, value:(day:OverviewPresentation["days"][number]|undefined)=>number|null)=>Array.from({length:7},(_,index)=>{
    const key=addCalendarDays(date,index-6),day=byDate.get(key);return {date:key,value:value(day),partial:day?.nutrition?day.mealDayStatus!=="complete"||day.nutrition.incomplete.caloriesKcal:false};
  });
  const intakeDate=intake?.date??today, weightDate=body?.recordDate??today, energyDate=energy?.date??today;
  const weight=points(weightDate,day=>day?.morning?.weightKg!=null?Number(day.morning.weightKg):null).map(({date,value})=>({date,value}));
  const destination=(path:string,date:string)=>`${path}?view=trend&date=${date}&from=${addCalendarDays(date,-6)}&to=${date}`;
  return [
    {title:intakeDate===today?"今日摄入":"最近摄入",value:formatNutrition(intake?.totals.values.caloriesKcal??null,"caloriesKcal"),unit:"kcal",date:intake?.date??"",fact:intake?`${intake.meals.length}餐`:undefined,href:destination("/dashboard/meals",intakeDate),trend:metricTrendModel("intake",points(intakeDate,()=>null).map(point=>{const day=byDate.get(point.date);return intakeTrendPoint(point.date,day?.nutrition,day?.mealDayStatus);}))},
    {title:weightDate===today?"今晨体重":"最近晨重",value:formatRecordNumber(body?.weightKg),unit:"kg",date:body?.recordDate??"",href:destination("/dashboard/measurements",weightDate),trend:metricTrendModel("morning-weight",weight,normalScale(weight.flatMap(point=>point.value===null?[]:[point.value])))},
    {title:energyDate===today?"今日消耗":"最近消耗",value:energyValue(energy?.totalKcal),unit:"kcal",date:energy?.date??"",href:"/dashboard/energy",trend:metricTrendModel("energy",points(energyDate,day=>day?.energy.totalKcal!=null?Number(day.energy.totalKcal):null).map(({date,value})=>({date,value})))},
  ];
}
