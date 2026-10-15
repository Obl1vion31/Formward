import { randomUUID } from "node:crypto";
import { and,eq,isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { food,meal,mealItem,mealOperation,mealEvent } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { lockOwner } from "../auth/owner-lock";
import { foodDraftSchema,type FoodView,type MealView,type MealInput,type PreviewRow } from "./model";
import { readMealSnapshot,digest,foodIdentity } from "./records";
import { foodAction,mealAction } from "./text-maintenance";
const schema=z.object({operationId:z.string().regex(/^[a-zA-Z0-9-]{8,120}$/),updateMealDescriptions:z.boolean().optional(),changes:z.array(z.object({id:z.string().uuid(),version:z.number().int().positive(),name:z.string().trim().min(1).max(200).optional(),preparation:z.string().max(200),basis:z.string().max(4000),baseQuantity:z.string().optional(),unit:z.string().optional()}).strict()).min(1).max(50)}).strict();
export type FoodMaintenance=z.infer<typeof schema>;
async function prepare(db:Pick<Database,"select">,userId:string,raw:unknown){
 const request=schema.parse(raw),before=await readMealSnapshot(db,userId),ids=new Set(request.changes.map(change=>change.id));
 if(ids.size!==request.changes.length)throw new ApiError(400,"invalid_input","目标食材重复。");
 const afterFoods=request.changes.map(change=>{
  const current=before.foods.find(entry=>entry.id===change.id&&!entry.deletedAt);
  if(!current)throw new ApiError(404,"not_found","食材不属于当前账号。");
  if(current.version!==change.version)throw new ApiError(409,"version_conflict","食材版本已改变。");
  const {deletedAt,...draft}=current;void deletedAt;
  const updated=foodDraftSchema.parse({...draft,...change,baseQuantity:change.baseQuantity??current.baseQuantity,unit:change.unit??current.unit});
  return {...updated,id:current.id,version:current.version+1,deletedAt:null} as FoodView;
 });
 const identities=[...before.foods.filter(entry=>!ids.has(entry.id)),...afterFoods].map(entry=>foodIdentity(entry));
 if(new Set(identities).size!==identities.length)throw new ApiError(409,"duplicate_food","更新规格与已有食材冲突。");
 const affected=request.updateMealDescriptions===false?[]:before.meals.filter(record=>!record.deletedAt&&record.items.some(item=>item.foodId&&ids.has(item.foodId)));
 return {request,before,afterFoods,affected,digest:digest({request,foods:before.foods.filter(entry=>ids.has(entry.id)),meals:affected})};
}
export async function previewFoodMaintenance(db:Database,userId:string,raw:unknown){
 const plan=await prepare(db,userId,raw);
 return {digest:plan.digest,foods:plan.afterFoods.map(after=>({before:plan.before.foods.find(entry=>entry.id===after.id),after})),affectedMeals:plan.affected.length};
}
export async function applyFoodMaintenance(db:Database,userId:string,raw:unknown,expectedDigest:string){
 const request=schema.parse(raw),requestDigest=digest(request);
 return db.transaction(async tx=>{
  await lockOwner(tx,userId);
  const [previous]=await tx.select().from(mealOperation).where(and(eq(mealOperation.userId,userId),eq(mealOperation.operationId,request.operationId)));
  if(previous){if(previous.requestDigest!==requestDigest||previous.status!=="confirmed")throw new ApiError(409,"operation_conflict","操作标识已被其他请求使用。");return {id:previous.id,repeated:true};}
  const plan=await prepare(tx,userId,request);if(plan.digest!==expectedDigest)throw new ApiError(409,"version_conflict","预览已改变，请重新核对。");
  const now=new Date(),changedMeals:MealView[]=[];
  for(const updated of plan.afterFoods)await tx.update(food).set({name:updated.name,preparation:updated.preparation,basis:updated.basis,baseQuantity:updated.baseQuantity,unit:updated.unit,identityKey:foodIdentity(updated),version:updated.version,updatedAt:now}).where(and(eq(food.userId,userId),eq(food.id,updated.id)));
  for(const before of plan.affected){
   let changed=false;
   const items=before.items.map(item=>{
    const old=plan.before.foods.find(entry=>entry.id===item.foodId),next=plan.afterFoods.find(entry=>entry.id===item.foodId),snapshot=item.foodSnapshot;
    // 仅精简与当前来源完全匹配的文字；旧营养、基准量、单位和营养版本都保留。
    if(!old||!next||!snapshot||snapshot.version!==old.version||snapshot.basis!==old.basis||snapshot.preparation!==old.preparation)return item;
    changed=true;return {...item,basis:item.basis===old.basis?next.basis:item.basis,foodSnapshot:{...snapshot,preparation:next.preparation,basis:next.basis}};
   });
   if(!changed)continue;
   const after={...before,items,version:before.version+1};changedMeals.push(after);
   await tx.update(meal).set({version:after.version,updatedAt:now}).where(and(eq(meal.userId,userId),eq(meal.id,before.id)));
   await tx.update(mealItem).set({deletedAt:now}).where(and(eq(mealItem.userId,userId),eq(mealItem.mealId,before.id),isNull(mealItem.deletedAt)));
   await tx.insert(mealItem).values(items.map((item,position)=>({id:randomUUID(),userId,mealId:before.id,position,kind:item.kind,name:item.name,quantity:item.quantity??null,unit:item.unit??null,amountDecision:item.amountDecision??null,reviewExplanation:item.reviewExplanation??null,foodId:item.foodId??null,foodSnapshot:item.foodSnapshot,...item.nutrition,sourceKind:item.sourceKind,basis:item.basis,evidenceUrl:item.evidenceUrl})));
  }
  const actions=[...plan.afterFoods.map(foodAction),...changedMeals.map(mealAction)],payload:MealInput={operationId:request.operationId,actions},id=randomUUID();
  const preview:PreviewRow[]=[...plan.afterFoods.map((record,index)=>({action:actions[index],food:record,duplicateIds:[],warnings:[]})),...changedMeals.map((record,index)=>({action:actions[plan.afterFoods.length+index],meal:record,duplicateIds:[],warnings:[]}))];
  await tx.insert(mealOperation).values({id,userId,operationId:request.operationId,origin:"manual",requestDigest,snapshotDigest:plan.digest,payload,draft:payload,preview,status:"confirmed",confirmedAt:now,result:{saved:actions.length,message:"已更新指定食材说明与规格，历史营养与食用量保持。"}});
  for(const record of [...plan.afterFoods,...changedMeals])await tx.insert(mealEvent).values({id:randomUUID(),userId,recordId:record.id,recordType:plan.afterFoods.some(entry=>entry.id===record.id)?"food":"meal",operationId:id,actorType:"ai",actorId:"codex",confirmedBy:userId,snapshot:{origin:"food-maintenance",reason:"用户授权整理食材客观说明与估算依据；仅按指定请求更新当前规格，历史数值与原始请求保留。",request,before:[...plan.before.foods,...plan.before.meals].find(entry=>entry.id===record.id),after:record}});
  return {id,repeated:false};
 });
}
