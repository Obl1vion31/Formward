import type {RecordStamp} from "../records/change-state";
import type {EnergyAction,EnergyPreview,EnergySnapshot} from "./model";

export class EnergySaveError extends Error {}
export type EnergyExpectedVersion={key:string;id:string|null;version:string|null};

/** 日期是记录的位置；编辑时始终以原编号定位版本，不能采用目标日的编号。 */
function recordKey(action:EnergyAction,state:EnergySnapshot){
 if(action.kind.includes("energy_day")){
  if(action.id){
   const original=state.days.find(row=>row.id===action.id);
   if(!original)throw new EnergySaveError("原记录已变化，请重新打开记录；当前输入已保留。");
   return "energyDay:"+original.date;
  }
  return "date" in action?"energyDay:"+action.date:null;
 }
 return action.id?"activity:"+action.id:null;
}
export function energySaveExpectations(actions:EnergyAction[],state:EnergySnapshot):EnergyExpectedVersion[]{
 return actions.flatMap(action=>{
  const key=recordKey(action,state);
  return key?[{key,id:action.id??null,version:action.version?String(action.version):null}]:[];
 });
}
export function applyEnergyVersions(actions:EnergyAction[],state:EnergySnapshot,latest:Map<string,RecordStamp>):EnergyAction[]{
 return actions.map(action=>{
  const key=recordKey(action,state),stamp=key?latest.get(key):undefined;
  if(!stamp)return action;
  if(!action.id||stamp.id!==action.id)throw new EnergySaveError("记录位置已被其他记录占用，请重新查看；当前输入已保留。");
  return {...action,version:Number(stamp.version)};
 });
}

/** 网页日编辑只允许整体移到空日；公开 AI 批次的既有规则不由此收紧。 */
export function energyDateMoveIssue(actions:EnergyAction[],state:EnergySnapshot):string|null{
 for(const action of actions){
  if(action.kind!=="save_energy_day")continue;
  const original=state.days.find(row=>row.id===action.id&&!row.deletedAt);
  const fromDates=original?[original.date]:actions.flatMap(item=>{
   if(item.kind!=="save_activity"||item.date!==action.date||!item.id)return [];
   const before=state.activities.find(row=>row.id===item.id&&!row.deletedAt);
   return before?[before.date]:[];
  });
  for(const from of new Set(fromDates)){
   if(from===action.date)continue;
   if(state.days.some(row=>!row.deletedAt&&row.id!==action.id&&row.date===action.date)||state.activities.some(row=>!row.deletedAt&&row.date===action.date))return "目标日期已有消耗或运动记录，暂不能合并。请先查看该日期；当前输入已保留。";
   const sourceItems=state.activities.filter(row=>!row.deletedAt&&row.date===from);
   if(sourceItems.some(row=>!actions.some(item=>item.id===row.id&&(item.kind==="delete_activity"||item.kind==="save_activity"&&item.date===action.date))))return "改期需要同时移动当天运动，请重新打开记录后重试；当前输入已保留。";
  }
 }
 return null;
}
export function energyChangedKeys(rows:EnergyPreview[]):string[]{
 return [...new Set(rows.filter(row=>!row.excluded).flatMap(row=>[row.before,row.after].flatMap(record=>record&&"date" in record?["name" in record?"activity:"+record.id:"energyDay:"+record.date]:[])))];
}
