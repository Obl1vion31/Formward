import {activitySummary} from "../activities/activity-summary";
import {readEnergySnapshot} from "../activities/records";
import {formatIntegerNumber} from "../../components/number-format";
import {readMealSnapshot} from "../meals/records";
import {eq} from "drizzle-orm";
import type {Database} from "../../db/client";
import {measurement,meal,food,activity,energyDay,mealDay} from "../../db/schema";
import {adoptedMeasurements} from "../measurements/days";
import {mealTypeLabel} from "../meals/model";
import {recordNumber,type RecordStamp} from "./change-state";
/** 只读取本人记录的版本、日期和名称，不轮询完整健康内容。 */
export async function recordStamps(db:Database,userId:string,details=false):Promise<RecordStamp[]> {
 if(!userId)throw new Error("请先登录。");
 const [body,meals,foods,activities,days,status]=await Promise.all([
  db.select().from(measurement).where(eq(measurement.userId,userId)),
  db.select({id:meal.id,date:meal.localDate,name:meal.mealType,version:meal.version,deletedAt:meal.deletedAt}).from(meal).where(eq(meal.userId,userId)),
  db.select({id:food.id,name:food.name,caloriesKcal:food.caloriesKcal,baseQuantity:food.baseQuantity,unit:food.unit,version:food.version,deletedAt:food.deletedAt}).from(food).where(eq(food.userId,userId)),
  db.select({id:activity.id,date:activity.date,name:activity.name,caloriesKcal:activity.caloriesKcal,calorieMode:activity.calorieMode,exerciseActiveKcal:activity.exerciseActiveKcal,exerciseRestingKcal:activity.exerciseRestingKcal,source:activity.sourceSystem,version:activity.version,deletedAt:activity.deletedAt}).from(activity).where(eq(activity.userId,userId)),
  db.select({id:energyDay.id,date:energyDay.date,restingKcal:energyDay.restingKcal,activeKcal:energyDay.activeKcal,totalKcal:energyDay.totalKcal,entryMode:energyDay.entryMode,source:energyDay.sourceSystem,version:energyDay.version,deletedAt:energyDay.deletedAt}).from(energyDay).where(eq(energyDay.userId,userId)),
  db.select({id:mealDay.id,date:mealDay.date,status:mealDay.status,version:mealDay.version}).from(mealDay).where(eq(mealDay.userId,userId))]);
 const nutrition=details?await readMealSnapshot(db,userId):null;
 const energy=details?await readEnergySnapshot(db,userId):null;
 return [
 ...adoptedMeasurements(body).map(row=>({key:`measurement:${row.recordDate}:${row.period}:${row.recordKind}`,id:row.id,date:row.recordDate,title:row.period==="daytime"?"晨间身体记录":"晚间身体记录",...(details?{summary:`体重 ${recordNumber(row.weightKg)} kg · 体脂 ${recordNumber(row.bodyFatPercent)}%`}:{}),version:row.id+":"+row.updatedAt.toISOString(),href:"/dashboard/measurements?date="+row.recordDate})),
 ...meals.filter(r=>!r.deletedAt).map(r=>({key:"meal:"+r.id,id:r.id,date:r.date,title:mealTypeLabel(r.name),...(details?{summary:`${formatIntegerNumber(nutrition?.meals.find(m=>m.id===r.id)?.totals.values.caloriesKcal)} 千卡`}:{}),version:String(r.version),href:"/dashboard/meals?date="+r.date})),
 ...foods.filter(r=>!r.deletedAt).map(r=>({key:"food:"+r.id,id:r.id,date:"",title:r.name,...(details?{summary:`每 ${r.baseQuantity}${r.unit} · ${formatIntegerNumber(r.caloriesKcal)} 千卡`}:{}),version:String(r.version),href:"/dashboard/meals"})),
 ...activities.filter(r=>!r.deletedAt).map(r=>({key:"activity:"+r.id,id:r.id,date:r.date,title:r.name,...(details?{summary:(()=>{const saved=energy?.activities.find(row=>row.id===r.id);if(!saved)return "运动记录已修改";const reading=activitySummary(saved,energy?.days.find(day=>day.date===r.date&&!day.deletedAt));return "本次 "+formatIntegerNumber(reading.totalKcal)+" 千卡；"+reading.effect+(r.source?" · "+r.source:"");})()}:{}),version:String(r.version),href:"/dashboard/energy?date="+r.date})),
 ...days.filter(r=>!r.deletedAt).map(r=>({key:"energyDay:"+r.date,id:r.id,date:r.date,title:"每日消耗",...(details?{summary:r.entryMode==="total"?`录入总数 ${formatIntegerNumber(r.totalKcal)} 千卡`:`静息 ${formatIntegerNumber(r.restingKcal)} · 活动合计 ${formatIntegerNumber(r.activeKcal)} 千卡`}:{}),version:String(r.version),href:"/dashboard/energy?date="+r.date})),
 ...status.map(r=>({key:"mealDay:"+r.date,id:r.id,date:r.date,title:"饮食是否已记全",...(details?{summary:r.status==="complete"?"已记全":r.status==="incomplete"?"未记全":"需要重新确认是否已记全"}:{}),version:String(r.version),href:"/dashboard/meals?date="+r.date}))];
}
