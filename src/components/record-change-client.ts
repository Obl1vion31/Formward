"use client";
import {confirmAction} from "./confirmation-state";
import type {MeasurementDisplay} from "@/features/measurements/entry-state";
import type {MealSnapshot} from "@/features/meals/model";
import type {EnergySnapshot} from "@/features/activities/model";
import {adoptedMeasurements} from "@/features/measurements/days";
import {activitySummary} from "@/features/activities/activity-summary";
import {formatIntegerNumber} from "./number-format";
import {recordNumber} from "@/features/records/change-state";
import type {RecordStamp} from "@/features/records/change-state";
export async function fetchRecordStamps(keys?:string[]):Promise<RecordStamp[]>{const response=await fetch("/api/record-changes"+(keys?"?keys="+encodeURIComponent(keys.join("|")):""),{cache:"no-store",credentials:"same-origin"});if(!response.ok)throw new Error("暂时无法核对最新记录，请重试，输入已保留。");return (await response.json()).records;}
export type VersionStamp={key:string;version:string;summary?:string};
export function measurementVersions(records:MeasurementDisplay[]):VersionStamp[]{return adoptedMeasurements(records).map(row=>({summary:`体重 ${recordNumber(row.weightKg)} kg · 体脂 ${recordNumber(row.bodyFatPercent)}%`,key:`measurement:${row.recordDate}:${row.period}:${row.recordKind}`,version:row.id+":"+row.updatedAt}));}
export function mealVersions(snapshot:MealSnapshot):VersionStamp[]{return [...snapshot.meals.filter(row=>!row.deletedAt).flatMap(row=>[{key:"meal:"+row.id,version:String(row.version),summary:formatIntegerNumber(row.totals.values.caloriesKcal)+" 千卡"},...(row.day?[{key:"mealDay:"+row.date,version:String(row.day.version),summary:row.day.status==="complete"?"已记全":"需要重新确认是否已记全"}]:[])]),...snapshot.foods.filter(row=>!row.deletedAt).map(row=>({key:"food:"+row.id,version:String(row.version),summary:formatIntegerNumber(row.nutrition.caloriesKcal)+" 千卡"}))];}
export function energyVersions(snapshot:EnergySnapshot):VersionStamp[]{return [...snapshot.days.filter(row=>!row.deletedAt).map(row=>({key:"energyDay:"+row.date,version:String(row.version),summary:row.entryMode==="total"?`录入总数 ${formatIntegerNumber(row.totalKcal)} 千卡`:`静息 ${formatIntegerNumber(row.restingKcal)} · 活动合计 ${formatIntegerNumber(row.activeKcal)} 千卡`})),...snapshot.activities.filter(row=>!row.deletedAt).map(row=>({key:"activity:"+row.id,version:String(row.version),summary:`本次 ${formatIntegerNumber(activitySummary(row,snapshot.days.find(day=>day.date===row.date&&!day.deletedAt)).totalKcal)} 千卡；${activitySummary(row,snapshot.days.find(day=>day.date===row.date&&!day.deletedAt)).effect}`}))];}
export function acknowledgeRecordChanges(keys:string[],versions:VersionStamp[]){window.dispatchEvent(new CustomEvent("formward-record-saved",{detail:keys.map(key=>({key,version:versions.find(row=>row.key===key)?.version??null}))}));}
/** 保存前核对；只有用户明确继续才采用最新版本，后端仍检查原子写入版本。 */
export async function verifyRecordVersions(expected:{key:string;version:string|null;summary?:string}[]) {
 if(!expected.length)return new Map<string,RecordStamp>();
 const latest=await fetchRecordStamps(),byKey=new Map(latest.map(row=>[row.key,row]));
 const changed=expected.filter(row=>(byKey.get(row.key)?.version??null)!==row.version);
 if(changed.length){
  const details=await fetchRecordStamps(changed.map(row=>row.key));
  const lines=changed.map(row=>{const now=details.find(r=>r.key===row.key);return now?now.date+" "+now.title+"已修改"+(row.summary?"\n原来："+row.summary:"")+(now.summary?"\n最新："+now.summary:""):"这条记录已删除";}).join("\n");
  if(changed.some(row=>!byKey.has(row.key)))throw new Error(lines+"，请查看最新记录；输入已保留。");
  if(!await confirmAction({title:"这条记录已在别处修改",message:lines+"。\n当前输入已保留，可取消并查看最新记录，或仍保存当前内容。",confirmLabel:"仍保存当前内容"}))throw new Error("尚未保存，当前输入已保留，可查看最新记录。");
 }
 return byKey;
}
