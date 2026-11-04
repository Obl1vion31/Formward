import {adoptedMeasurements} from "../measurements/days";
import type {MeasurementDisplay} from "../measurements/entry-state";
import {dailyTotals,type MealView} from "../meals/model";
import {energyDays,type EnergySnapshot} from "../activities/model";
export type ReminderCatalog={
 body:{date:string;period:"daytime"|"evening";recorded:boolean;estimated:boolean;blocked:boolean}[];
 energy:{date:string;hasTotal:boolean}[];meals:{date:string;complete:boolean;status?:string;source?:string}[];
};
export function reminderCatalog(meals:MealView[],records:MeasurementDisplay[],energy:EnergySnapshot):ReminderCatalog{
 const adopted=adoptedMeasurements(records),keys=[...new Set(adopted.map(row=>row.recordDate+":"+row.period))];
 const dates=[...new Set([...energy.days.map(row=>row.date),...energy.activities.map(row=>row.date)])].sort();
 return {body:keys.map(key=>{
  const rows=adopted.filter(row=>row.recordDate+":"+row.period===key),observed=rows.find(row=>row.recordKind==="observed"),period=rows[0].period;
  return {date:rows[0].recordDate,period,recorded:!!observed&&observed.fasting===(period==="daytime")&&(observed.weightKg!==null||observed.bodyFatPercent!==null),blocked:period==="daytime"&&!!observed&&observed.fasting!==true,estimated:rows.some(row=>row.recordKind==="estimated"&&(row.weightKg!==null||row.bodyFatPercent!==null))};
 }),energy:energyDays(energy,records,dates).map(day=>({date:day.date,hasTotal:day.totalKcal!==null})),meals:dailyTotals(meals).map(day=>({date:day.date,complete:day.day.status==="complete",status:day.day.status,source:day.day.source}))};
}
