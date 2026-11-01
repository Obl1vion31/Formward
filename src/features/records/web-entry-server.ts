import {and,eq} from "drizzle-orm";
import {mealOperation,energyOperation} from "../../db/schema";
import type {Database} from "../../db/client";
import {ApiError} from "../auth/ai-identity";
import {operationSchema,type MealInput,type MealDraft} from "../meals/model";
import {digest,prepareMealActions,readMealSnapshot,type MealPlanner} from "../meals/records";
import {energyInputSchema,energyModes,type EnergyInput} from "../activities/model";
import {planEnergyActions,readEnergySnapshot} from "../activities/records";
import {energyWebIssue,mealWebIssue,sameEnergyAmounts,sameMealAmounts} from "./web-entry";

/** 只由网页手工入口调用。公开提交／预览／确认不收紧未知和0的兼容。 */
export async function checkWebMeals(db:Database,userId:string,input:MealInput,planner:MealPlanner=prepareMealActions,targetKey?:string){
 const parsed=operationSchema.safeParse(input);
 if(!parsed.success)throw new ApiError(400,"invalid_input","请检查录入内容。");
 const [repeated]=await db.select().from(mealOperation).where(and(eq(mealOperation.userId,userId),eq(mealOperation.operationId,parsed.data.operationId)));
 if(repeated?.status==="confirmed"&&repeated.origin==="manual"&&repeated.requestDigest===digest(parsed.data))return;
 const state=await readMealSnapshot(db,userId),rows=planner(parsed.data,state,"manual");
 for(const row of rows)if(row.action.kind==="save_meal"&&(!targetKey||row.review?.itemId===targetKey)){
  if(row.error)throw new ApiError(400,"invalid_input",row.error);
  if(!row.meal)throw new ApiError(400,"invalid_input","请检查餐次内容。");
  const before=row.before&&"items" in row.before?row.before:undefined;
  const unchanged=!!before&&row.action.version===before.version&&sameMealAmounts(row.meal,before);
  const issue=mealWebIssue(row.action as MealDraft,row.meal.totals.values,unchanged);
  if(issue)throw new ApiError(400,"invalid_input",issue);
 }
}
export async function checkWebEnergy(db:Database,userId:string,input:EnergyInput,targetIndex?:number){
 const parsed=energyInputSchema.safeParse(input);
 if(!parsed.success)throw new ApiError(400,"invalid_input","请检查录入内容。");
 const [repeated]=await db.select().from(energyOperation).where(and(eq(energyOperation.userId,userId),eq(energyOperation.operationId,parsed.data.operationId)));
 if(repeated?.status==="confirmed"&&repeated.origin==="manual"&&repeated.requestDigest===digest(parsed.data))return;
 const state=await readEnergySnapshot(db,userId),rows=planEnergyActions(parsed.data.actions,state);
 const activityChanged=(date:string)=>rows.some(row=>row.action.kind.endsWith("activity")&&((row.before&&"date" in row.before&&row.before.date===date)||("date" in row.action&&row.action.date===date))&&(!row.before||!row.after||!("name" in row.before)||!("name" in row.after)||JSON.stringify([row.before.date,row.before.name,row.before.caloriesKcal,row.before.exerciseActiveKcal,row.before.exerciseRestingKcal,row.before.calorieMode,row.before.completed,row.before.inclusion])!==JSON.stringify([row.after.date,row.after.name,row.after.caloriesKcal,row.after.exerciseActiveKcal,row.after.exerciseRestingKcal,row.after.calorieMode,row.after.completed,row.after.inclusion])));
 for(const [index,row] of rows.entries())if(row.action.kind==="save_energy_day"&&(targetIndex===undefined||index===targetIndex)){
  if(row.error)throw new ApiError(400,"invalid_input",row.error);
  const after=row.after&&"date" in row.after&&"restingKcal" in row.after?row.after:undefined;
  const before=row.before&&"date" in row.before&&"restingKcal" in row.before?row.before:undefined;
  const unchanged=!!before&&!!after&&!activityChanged(row.action.date)&&row.action.version===before.version&&sameEnergyAmounts(after,before);
  const adopted=after?{...row.action,...energyModes(after),restingKcal:after.restingKcal,activeKcal:after.activeKcal,totalKcal:after.totalKcal}:row.action;
  const issue=energyWebIssue(adopted,row.day?.activeKcal,unchanged);
  if(issue)throw new ApiError(400,"invalid_input",issue);
 }
}
