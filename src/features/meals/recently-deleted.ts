import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { food, meal, mealItem, mealImageLink, mealOperation, mealEvent } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { lockOwner } from "../auth/owner-lock";
import { foodDraftSchema, type MealInput } from "./model";
import { digest, readMealSnapshot } from "./records";

const requestSchema = z.object({ operationId: z.string().uuid(), recordType: z.enum(["food", "meal"]), id: z.string().uuid(), version: z.number().int().positive() }).strict();
export type PermanentDeletion = z.infer<typeof requestSchema>;
/** 网页专用：只清除回收站条目。原始导入、审计和历史照片保留。 */
export async function permanentlyDeleteMealRecord(db: Database, userId: string, raw: unknown) {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "invalid_input", "永久删除请求无效。");
  const request = parsed.data, requestDigest = digest({ permanentDeletion: request });
  return db.transaction(async tx => {
    await lockOwner(tx, userId);
    const [prior] = await tx.select().from(mealOperation).where(and(eq(mealOperation.userId,userId),eq(mealOperation.operationId,request.operationId)));
    if (prior) {
      if (prior.requestDigest !== requestDigest || prior.status !== "confirmed") throw new ApiError(409,"request_conflict","请求标识已用于其他操作。");
      return { repeated: true, message: prior.result!.message };
    }
    const before = await readMealSnapshot(tx,userId), isFood = request.recordType === "food";
    const record = (isFood ? before.foods : before.meals).find(row => row.id === request.id);
    if (!record) throw new ApiError(404,"not_found","记录不属于当前账号或已永久删除。");
    if (record.version !== request.version) throw new ApiError(409,"version_conflict","记录已改变，请刷新后重试。");
    if (!record.deletedAt) throw new ApiError(409,"state_conflict","请先将记录移到最近删除。");
    const references = isFood ? await tx.select().from(mealItem).where(and(eq(mealItem.userId,userId),eq(mealItem.foodId,record.id))) : [];
    for (const item of references) {
      const snapshot = item.foodSnapshot;
      if (!snapshot || snapshot.id !== record.id) throw new ApiError(409,"snapshot_required","旧餐缺少食材快照，暂不能永久删除。请先修复历史记录。");
      const { deletedAt, ...draft } = snapshot; void deletedAt;
      if (!foodDraftSchema.safeParse(draft).success || (item.quantity && item.unit !== snapshot.unit)) throw new ApiError(409,"snapshot_required","旧餐的食材规格不完整，暂不能永久删除。");
    }
    const id = randomUUID(), now = new Date(), message = `已永久删除${isFood ? "食材库条目" : "餐次"}，无法恢复。`;
    const payload: MealInput = { operationId:request.operationId, actions:[{ kind:isFood ? "delete_food" : "delete_meal",id:record.id,version:record.version }] };
    await tx.insert(mealOperation).values({id,userId,operationId:request.operationId,origin:"manual",requestDigest,snapshotDigest:digest(before),payload,draft:payload,preview:[],status:"confirmed",confirmedAt:now,result:{saved:1,message}});
    const affectedIds = [...new Set(references.map(row => row.mealId))];
    if (isFood) {
      if (references.length) await tx.update(mealItem).set({foodId:null}).where(and(eq(mealItem.userId,userId),eq(mealItem.foodId,record.id)));
      for (const previous of before.meals.filter(row => affectedIds.includes(row.id))) {
        await tx.update(meal).set({version:previous.version+1,updatedAt:now}).where(and(eq(meal.userId,userId),eq(meal.id,previous.id)));
        await tx.insert(mealEvent).values({id:randomUUID(),userId,recordId:previous.id,recordType:"meal",operationId:id,actorType:"user",actorId:userId,confirmedBy:userId,snapshot:{permanentDeletion:true,reason:"食材已永久删除，保留餐项营养和原规格快照。",before:previous,after:{...previous,version:previous.version+1,items:previous.items.map(item => item.foodId===record.id ? {...item,foodId:undefined,foodVersion:undefined}:item)}}});
      }
    } else await tx.delete(mealItem).where(and(eq(mealItem.userId,userId),eq(mealItem.mealId,record.id)));
    await tx.delete(mealImageLink).where(and(eq(mealImageLink.userId,userId),eq(isFood?mealImageLink.foodId:mealImageLink.mealId,record.id)));
    if (isFood) await tx.delete(food).where(and(eq(food.userId,userId),eq(food.id,record.id)));
    else await tx.delete(meal).where(and(eq(meal.userId,userId),eq(meal.id,record.id)));
    await tx.insert(mealEvent).values({id:randomUUID(),userId,recordId:record.id,recordType:request.recordType,operationId:id,actorType:"user",actorId:userId,confirmedBy:userId,snapshot:{permanentDeletion:true,request,before:record,after:null,affectedMealIds:affectedIds}});
    return { repeated:false,message };
  });
}
