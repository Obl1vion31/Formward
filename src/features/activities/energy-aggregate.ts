import {activityCalories,energyDays,energyValue,type ActivityRecord,type EnergyDayRecord} from "./model";

/** 切换前后的预览复用正式每日计算；只取当前草稿中仍有效的运动。 */
export function activityAccumulationPreview(day:EnergyDayRecord,records:ActivityRecord[]){
 const activities=records.filter(row=>row.date===day.date&&!row.deletedAt&&row.completed&&row.name.trim());
 const record={...day,entryMode:"components" as const,activityMode:"activities" as const};
 const result=energyDays({days:[record],activities,profiles:[]},[],[day.date])[0];
 return {activities,activeKcal:result.activeKcal,totalKcal:result.totalKcal};
}
export function activityAccumulationMessage(current:string|null,beforeTotal:string|null,after:ReturnType<typeof activityAccumulationPreview>,review=false){
 const lines=["当前活动合计："+energyValue(current)+" 千卡"];
 if(!after.activities.length)lines.push("当天没有运动明细，切换后为 0 千卡。");
 else{
  lines.push("运动明细：");
  for(const row of after.activities)lines.push("• "+row.name+"："+(activityCalories(row)==null?"热量未知":energyValue(activityCalories(row))+" 千卡"));
  lines.push("相加后的活动合计："+(after.activeKcal==null?"未知":energyValue(after.activeKcal)+" 千卡"));
 }
 lines.push("当天总消耗："+energyValue(beforeTotal)+" → "+energyValue(after.totalKcal)+" 千卡",review?"应用修改返回后，还需在确认页面统一确认保存。":"点击顶部“保存”后才正式保存。");
 return lines.join("\n");
}
