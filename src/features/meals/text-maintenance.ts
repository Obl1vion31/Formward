import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { food, meal, mealItem, mealOperation, mealEvent } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { lockOwner } from "../auth/owner-lock";
import { digest, foodIdentity, readMealSnapshot } from "./records";
import { type FoodView, type MealAction, type MealInput, type MealView, type PreviewRow } from "./model";

// 仅由已获授权的维护脚本调用；不对网页、HTTP 或 MCP 开放。
const replacement = z.object({ before: z.string().min(1), after: z.string().trim().min(1) }).strict();
const requestSchema = z.object({
  operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/), foodId: z.string().uuid(), foodVersion: z.number().int().positive(),
  preparation: replacement, basis: replacement,
  notes: z.array(z.object({mealId:z.string().uuid(),mealVersion:z.number().int().positive(),before:z.string().nullable(),after:z.string().trim().max(12000).nullable()}).strict()).max(50).optional(),
  items: z.array(z.object({ id: z.string().uuid(), mealId: z.string().uuid(), mealVersion: z.number().int().positive() }).strict()).min(1).max(50),
}).strict();
export type MealTextCorrection = z.infer<typeof requestSchema>;
async function prepare(db: Pick<Database, "select">, userId: string, raw: unknown) {
  const request = requestSchema.parse(raw);
  if (request.preparation.after.length > 200 || request.basis.after.length > 4000 || new Set(request.items.map(item => item.id)).size !== request.items.length) throw new ApiError(400, "invalid_input", "修正文案过长或目标重复。");
  const [entry] = await db.select().from(food).where(and(eq(food.userId,userId),eq(food.id,request.foodId),isNull(food.deletedAt)));
  if (!entry) throw new ApiError(404,"not_found","目标食材不存在。");
  if (entry.version !== request.foodVersion || entry.preparation !== request.preparation.before || entry.basis !== request.basis.before) throw new ApiError(409,"version_conflict","食材版本或原文已改变。");
  const before = await readMealSnapshot(db,userId), changes = [];
  for (const target of request.items) {
    const [item] = await db.select().from(mealItem).where(and(eq(mealItem.userId,userId),eq(mealItem.id,target.id),eq(mealItem.mealId,target.mealId),isNull(mealItem.deletedAt)));
    const parent = before.meals.find(record=>record.id===target.mealId&&!record.deletedAt);
    if (!item || !parent) throw new ApiError(404,"not_found","目标餐项不存在。");
    if (parent.version !== target.mealVersion || item.foodId !== entry.id || item.basis !== request.basis.before || item.foodSnapshot?.id !== entry.id || item.foodSnapshot.version !== entry.version || item.foodSnapshot.preparation !== request.preparation.before || item.foodSnapshot.basis !== request.basis.before) throw new ApiError(409,"version_conflict","餐项版本、来源或原文已改变。");
    changes.push(item);
  }
  const notes=request.notes??[], foodChanged=entry.preparation!==request.preparation.after||entry.basis!==request.basis.after;
  if(new Set(notes.map(note=>note.mealId)).size!==notes.length||(!foodChanged&&!notes.some(note=>note.before!==note.after)))throw new ApiError(400,"invalid_input","备注目标重复或没有文字变化。");
  for(const note of notes){
    const parent=before.meals.find(record=>record.id===note.mealId&&!record.deletedAt);
    if(!parent||!request.items.some(item=>item.mealId===note.mealId))throw new ApiError(404,"not_found","备注目标不在指定餐项范围。");
    if(parent.version!==note.mealVersion||parent.notes!==note.before)throw new ApiError(409,"version_conflict","餐次备注版本或原文已改变。");
  }
  const identity = foodIdentity({...before.foods.find(record=>record.id===entry.id)!,preparation:request.preparation.after});
  const [collision] = await db.select({id:food.id}).from(food).where(and(eq(food.userId,userId),eq(food.identityKey,identity)));
  if (collision && collision.id !== entry.id) throw new ApiError(409,"duplicate_food","修正规格与已有食材冲突。");
  return {request,entry,changes,before,identity,foodChanged,digest:digest({request,entry,changes,meals:before.meals.filter(record=>request.items.some(item=>item.mealId===record.id))})};
}
export async function previewMealTextCorrection(db: Database, userId: string, raw: unknown) {
  const prepared = await prepare(db,userId,raw);
  return {digest:prepared.digest,foodId:prepared.entry.id,items:prepared.changes.map(item=>item.id),preparation:prepared.request.preparation,basis:prepared.request.basis,notes:prepared.request.notes,foodChanged:prepared.foodChanged};
}
export function foodAction(record: FoodView): MealAction {
  const {id,version,category,name,brand,preparation,baseQuantity,unit,nutrition,sourceKind,basis,evidenceUrl,imageIds}=record;
  return {kind:"save_food",id,version,category,name,brand,preparation,baseQuantity,unit,nutrition,sourceKind,basis,evidenceUrl,imageIds};
}
export function mealAction(record: MealView): MealAction {
  const {id,version,date,mealType,timezone,occurredAt,notes,imageIds}=record;
  return {kind:"save_meal",id,version,date,mealType,timezone,occurredAt,notes,imageIds,items:record.items.map(item=>{
    const {kind,name,quantity,unit,amountDecision,reviewExplanation,foodId,foodVersion,sourceKind,basis,evidenceUrl,nutrition}=item;
    const draft={originalItemId:item.id,kind,name,quantity,unit,amountDecision,reviewExplanation,foodId,foodVersion,sourceKind,basis,evidenceUrl};
    return foodId||item.foodSnapshot?draft:{...draft,nutrition};
  })};
}
export async function applyMealTextCorrection(db: Database, userId: string, raw: unknown, expectedDigest: string) {
  const request = requestSchema.parse(raw), requestDigest=digest(request);
  return db.transaction(async tx=>{
    await lockOwner(tx,userId);
    const [existing]=await tx.select().from(mealOperation).where(and(eq(mealOperation.userId,userId),eq(mealOperation.operationId,request.operationId)));
    if(existing){if(existing.requestDigest!==requestDigest||existing.status!=="confirmed")throw new ApiError(409,"operation_conflict","维护请求已被其他内容使用。");return {id:existing.id,repeated:true};}
    const plan=await prepare(tx,userId,request);
    if(plan.digest!==expectedDigest)throw new ApiError(409,"version_conflict","预览已改变，请重新核对。");
    const now=new Date(),operationId=randomUUID();
    if(plan.foodChanged)await tx.update(food).set({preparation:request.preparation.after,basis:request.basis.after,identityKey:plan.identity,version:plan.entry.version+1,updatedAt:now}).where(and(eq(food.userId,userId),eq(food.id,request.foodId)));
    for(const item of plan.foodChanged?plan.changes:[]){
      await tx.update(mealItem).set({deletedAt:now}).where(and(eq(mealItem.userId,userId),eq(mealItem.id,item.id)));
      await tx.insert(mealItem).values({...item,id:randomUUID(),deletedAt:null,basis:request.basis.after,foodSnapshot:{...item.foodSnapshot!,preparation:request.preparation.after,basis:request.basis.after,version:plan.entry.version+1}});
    }
    const mealIds=[...new Set([...(plan.foodChanged?request.items.map(item=>item.mealId):[]),...(request.notes??[]).filter(note=>note.before!==note.after).map(note=>note.mealId)])];
    for(const id of mealIds){const parent=plan.before.meals.find(record=>record.id===id)!;await tx.update(meal).set({version:parent.version+1,updatedAt:now,...(request.notes?.some(note=>note.mealId===id)?{notes:request.notes.find(note=>note.mealId===id)!.after}:{})}).where(and(eq(meal.userId,userId),eq(meal.id,id)));}
    const after=await readMealSnapshot(tx,userId),updatedFood=after.foods.find(record=>record.id===request.foodId)!,updatedMeals=after.meals.filter(record=>mealIds.includes(record.id));
    const actions=[...(plan.foodChanged?[foodAction(updatedFood)]:[]),...updatedMeals.map(mealAction)],payload:MealInput={operationId:request.operationId,actions};
    const preview:PreviewRow[]=[...(plan.foodChanged?[{action:actions[0],food:updatedFood,duplicateIds:[],warnings:[]}]:[]),...updatedMeals.map((record,index)=>({action:actions[index+(plan.foodChanged?1:0)],meal:record,duplicateIds:[],warnings:[]}))];
    await tx.insert(mealOperation).values({id:operationId,userId,operationId:request.operationId,origin:"manual",requestDigest,snapshotDigest:plan.digest,payload,draft:payload,preview,status:"confirmed",revision:1,confirmedAt:now,result:{saved:actions.length,message:"已修正说明文字，营养、份量与照片保持。"}});
    for(const record of [...(plan.foodChanged?[updatedFood]:[]),...updatedMeals])await tx.insert(mealEvent).values({id:randomUUID(),userId,recordId:record.id,recordType:record.id===updatedFood.id?"food":"meal",operationId,actorType:"ai",actorId:"codex",confirmedBy:userId,snapshot:{origin:"text-maintenance",reason:"按用户要求删除无关排除项，区分照片估算与用户确认。",request,before:[...plan.before.foods,...plan.before.meals].find(previous=>previous.id===record.id),after:record}});
    return {id:operationId,repeated:false};
  });
}
