import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client";
import type { RecordReviewAction } from "./model";
import { loadRecordReview, recordMealPlanner, reviewRecordOperation } from "./operations";
import { checkWebEnergy, checkWebMeals } from "./web-entry-server";

/** 网页及站内确认卡共用同一份人工编辑校验；模型不能调用此入口。 */
export async function reviewWebRecord(db:Database,userId:string,id:string,action:RecordReviewAction,source?:"body"|"meal"){
  if(action.kind==="update"){
    const current=await loadRecordReview(db,userId,id,source),target=current.rows.find(item=>item.key===action.key);
    if(!target||target.persisted||current.revision!==action.revision)throw new Error("预览已改变，请刷新后修改。");
    if(action.action.kind==="save_meal"){
      const items=current.rows.map(item=>item.key===action.key?{...item,action:action.action}:item);
      await checkWebMeals(db,userId,{operationId:randomUUID(),actions:[action.action]},recordMealPlanner(items,current.id),action.key);
    }
    if(action.action.kind==="save_energy_day"){
      const entries=current.rows.filter(item=>(item.key===action.key||!item.excluded&&!item.persisted)&&(item.action.kind==="save_energy_day"||item.action.kind==="save_activity"));
      const actions=entries.map(item=>item.key===action.key?action.action:item.action) as import("../activities/model").EnergyAction[];
      await checkWebEnergy(db,userId,{operationId:randomUUID(),actions},entries.findIndex(item=>item.key===action.key));
    }
  }
  return reviewRecordOperation(db,userId,id,action,source);
}
