import {activityReadings,energyBaseline,energyModes,energyValue,type ActivityRecord,type EnergyDayRecord} from "./model";
type Activity = Partial<Pick<ActivityRecord,"calorieMode"|"caloriesKcal"|"exerciseActiveKcal"|"exerciseRestingKcal"|"completed"|"inclusion"|"inclusionBasis">>;
/** 解释已有读数与包含关系，不改变每天的计算。 */
export function activitySummary(activity:Activity,day?:EnergyDayRecord|null,options:{relation?:"included"|"additional"|null;pending?:boolean}={}){
 const readings=activityReadings({...activity,caloriesKcal:activity.caloriesKcal??null}),baseline=energyBaseline(day),modes=energyModes(day);
 const relation=options.relation===undefined?(baseline&&activity.inclusionBasis===baseline?activity.inclusion:null):options.relation;
 const target="当天"+(modes.entryMode==="total"?"总消耗 ":"活动合计 ")+energyValue(modes.entryMode==="total"?day?.totalKcal:day?.activeKcal)+" 千卡";
 const breakdown=activity.calorieMode==="components"?energyValue(activity.exerciseActiveKcal)+" 运动 ＋ "+energyValue(activity.exerciseRestingKcal)+" 期间静息":null;
 let effect:string,status:string;
 if(activity.completed===false){
  effect="历史未计入，原记录保持。";status="历史未计入";
 }else if(baseline){
  if(options.pending){effect="待核对是否已包含在"+target+"中。";status="待核对包含关系";}
  else if(relation==="included"){effect="已包含在"+target+"中，本次不再额外增加。";status="已含在"+(modes.entryMode==="total"?"全天总数":"活动合计");}
  else if(relation==="additional"){effect="在"+target+"之外，额外增加 "+energyValue(readings.countedKcal)+" 千卡。";status=readings.countedKcal===null?"额外热量未知":"额外增加 "+energyValue(readings.countedKcal)+" kcal";}
  else{effect="沿用原记录，不在录入总数上另加。";status="沿用原计入方式";}
 }else if(modes.entryMode==="components"&&modes.activityMode==="activities"){
  effect=readings.countedKcal===null?"运动热量未知，暂不能合计。":"由运动明细累计 "+energyValue(readings.countedKcal)+" 千卡。";
  status=readings.countedKcal===null?"运动热量未知":"按运动明细累计";
 }else{
  effect="当天总数尚未填写，当前未额外增加。";status="全天总数未填写";
 }
 return {...readings,breakdown,effect,status};
}
