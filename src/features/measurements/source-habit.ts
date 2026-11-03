import {adoptedMeasurements} from "./days";
import type {MeasurementDisplay,EntryPeriod} from "./entry-state";
/** 晨晚共用最近三次采用的实测；补录只看目标时段之前。 */
export function habitualMeasurementSource(records:MeasurementDisplay[],sources:string[],date:string,period:EntryPeriod){
 const key=(d:string,p:EntryPeriod)=>d+":"+ (p==="daytime"?"0":"1");
 const previous=adoptedMeasurements(records).filter(row=>row.recordKind==="observed"&&(row.weightKg!==null||row.bodyFatPercent!==null)&&row.fasting===(row.period==="daytime")&&key(row.recordDate,row.period)<key(date,period)).sort((a,b)=>key(b.recordDate,b.period).localeCompare(key(a.recordDate,a.period))).slice(0,3);
 if(previous.length!==3)return "";
 const label=previous[0].deviceLabel?.trim()??"";
 return label&&sources.includes(label)&&previous.every(row=>row.deviceLabel?.trim()===label)?label:"";
}
