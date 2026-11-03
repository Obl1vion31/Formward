import {adoptedMeasurements} from "../measurements/days";
import {addCalendarDays} from "../measurements/calendar";
import type {MeasurementDisplay} from "../measurements/entry-state";
import {dailyTotals,type MealView} from "../meals/model";
import {energyDays,type EnergySnapshot} from "../activities/model";
export type ReminderCatalog={
 body:{date:string;period:"daytime"|"evening";recorded:boolean;estimated:boolean;blocked:boolean}[];
 energy:{date:string;hasTotal:boolean}[];meals:{date:string;complete:boolean}[];
};
export function reminderCatalog(meals:MealView[],records:MeasurementDisplay[],energy:EnergySnapshot):ReminderCatalog{
 const adopted=adoptedMeasurements(records),keys=[...new Set(adopted.map(row=>row.recordDate+":"+row.period))];
 const dates=[...new Set([...energy.days.map(row=>row.date),...energy.activities.map(row=>row.date)])].sort();
 return {body:keys.map(key=>{
  const rows=adopted.filter(row=>row.recordDate+":"+row.period===key),observed=rows.find(row=>row.recordKind==="observed"),period=rows[0].period;
  return {date:rows[0].recordDate,period,recorded:!!observed&&observed.fasting===(period==="daytime")&&(observed.weightKg!==null||observed.bodyFatPercent!==null),blocked:period==="daytime"&&!!observed&&observed.fasting!==true,estimated:rows.some(row=>row.recordKind==="estimated"&&(row.weightKg!==null||row.bodyFatPercent!==null))};
 }),energy:energyDays(energy,records,dates).map(day=>({date:day.date,hasTotal:day.totalKcal!==null})),meals:dailyTotals(meals).map(day=>({date:day.date,complete:day.day.status==="complete"}))};
}
export type DailyReminder={key:string;label:string;action:string;href:string};
export function dailyReminders(catalog:ReminderCatalog,today:string,hour:number,createdOn:string):DailyReminder[]{
 const yesterday=addCalendarDays(today,-1),items:DailyReminder[]=[];
 if(yesterday>=createdOn){
  if(!catalog.energy.some(day=>day.date===yesterday&&day.hasTotal))items.push({key:"energy",label:"昨日消耗尚未记录全天总数",action:"去补录",href:"/dashboard/energy?date="+yesterday+"&entry=1"});
  const meal=catalog.meals.find(day=>day.date===yesterday);
  if(!meal?.complete)items.push({key:"meals",label:meal?"昨日饮食尚未确认已记全":"昨日饮食尚未记录",action:meal?"查看并确认":"去补录",href:"/dashboard/meals?date="+yesterday+(meal?"":"&entry=1")});
 }
 for(const period of ["daytime","evening"] as const){
  if(hour<(period==="daytime"?6:18))continue;
  const slot=catalog.body.find(row=>row.date===today&&row.period===period);
  if(slot?.recorded||slot?.blocked)continue;
  items.push({key:period,label:"今日"+(period==="daytime"?"晨间":"晚间")+(slot?.estimated?"尚无实测":"尚未记录"),action:"去录入",href:"/dashboard/measurements?date="+today+"&entry="+period});
 }
 return items;
}
