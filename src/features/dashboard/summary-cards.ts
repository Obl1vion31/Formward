import { metricTrendModel } from "@/components/metric-trend-model";
import type { MetricCard } from "@/components/metric-card-rail";
import { formatRecordNumber } from "@/components/number-format";
import { normalScale } from "../measurements/trend";
import { addCalendarDays } from "../measurements/calendar";
import { formatNutrition } from "../meals/model";
import { energyValue } from "../activities/model";
import type { OverviewPresentation } from "./presentation";
import { intakeTrendPoint } from "../meals/trend-preview";
import { energyTrendPoint } from '../activities/trend-preview';
import { energyDeviceStatusLabel } from "../data-sources/energy-coverage";

export function summaryCards(data: OverviewPresentation, today: string): MetricCard[] {
  const body=data.body;
  const byDate=new Map(data.days.map(day=>[day.date,day]));
  const day=byDate.get(today),intake=day?.nutrition,energy=day?.energy;
  const energyFact=energy?.cumulative ? "今日累计"+(data.device?" · "+data.device.label:"")
    : energy?.totalKcal==null ? data.device ? energyDeviceStatusLabel(data.device) : "缺全天消耗"
    : energy.record?.calculationSnapshot ? "系统估算" : energy.record?.sourceSystem??undefined;
  const points=(date:string, value:(day:OverviewPresentation["days"][number]|undefined)=>number|null)=>Array.from({length:7},(_,index)=>{
    const key=addCalendarDays(date,index-6),day=byDate.get(key);return {date:key,value:value(day),partial:day?.nutrition?day.mealDayStatus!=="complete"||day.nutrition.incomplete.caloriesKcal:false};
  });
  const weightDate=body?.recordDate??today;
  const weight=points(weightDate,day=>day?.morning?.weightKg!=null?Number(day.morning.weightKg):null).map(({date,value})=>({date,value}));
  const destination=(path:string,date:string)=>`${path}?view=trend&date=${date}&from=${addCalendarDays(date,-6)}&to=${date}`;
  return [
    {title:"今日摄入",value:formatNutrition(intake?.values.caloriesKcal??null,"caloriesKcal"),unit:"kcal",date:today,readings:intake?{kind:"intake",date:today,totals:intake}:undefined,fact:day?.meals.length?`${day.meals.length}餐`:"尚无餐次",href:destination("/dashboard/meals",today),trend:metricTrendModel("intake",points(today,()=>null).map(point=>{const day=byDate.get(point.date);return intakeTrendPoint(point.date,day?.nutrition,day?.mealDayStatus);}))},
    {title:weightDate===today?"今晨体重":"最近晨重",value:formatRecordNumber(body?.weightKg),unit:"kg",date:body?.recordDate??"",readings:body?{kind:"morning-weight",date:body.recordDate,weightKg:body.weightKg}:undefined,href:destination("/dashboard/measurements",weightDate),trend:metricTrendModel("morning-weight",weight,normalScale(weight.flatMap(point=>point.value===null?[]:[point.value])))},
    {title:"今日消耗",value:energyValue(energy?.totalKcal),unit:"kcal",date:today,readings:energy?{kind:"energy",date:today,totalKcal:energy.totalKcal,restingKcal:energy.record?.adoption?.mode==="source"&&energy.record.adoption.metadata?.compositionKnown===false?null:energy.restingKcal,activeKcal:energy.activeKcal}:undefined,fact:energyFact,href:destination('/dashboard/energy',today),trend:metricTrendModel("energy",points(today,()=>null).map(point=>energyTrendPoint(point.date,byDate.get(point.date)?.energy)))},
  ];
}
