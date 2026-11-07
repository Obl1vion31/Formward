"use server";
import {checkWebMeals,checkWebEnergy} from "@/features/records/web-entry-server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { withCurrentSession } from "@/features/auth/server";
import { createAiToken, revokeAiToken } from "@/features/auth/ai-tokens";
import { getDatabase } from "@/db/client";
import { revokeOauthConnection } from "@/features/auth/oauth-connections";
import { safeAiError } from "@/features/measurements/ai-api";
import { decideAiMeasurementOperation, getAiMeasurementOperation, reviewAiMeasurementOperation, type ReviewAction } from "@/features/measurements/ai-operations";

async function perform<T>(work: (userId: string) => Promise<T>) {
  try {
    return await withCurrentSession(await headers(), async user => {
    const data = await work(user.id);
    revalidatePath("/dashboard/ai", "layout"); revalidatePath("/dashboard"); revalidatePath("/dashboard/energy"); revalidatePath("/dashboard/training"); revalidatePath("/dashboard/measurements");
    return { ok: true as const, data };
    });
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function createTokenAction(name: string, permission: "read" | "write") {
  return perform(userId => createAiToken(getDatabase(), userId, name, permission));
}
export async function revokeTokenAction(id: string) {
  return perform(async userId => { await revokeAiToken(getDatabase(), userId, id); return { id }; });
}
export async function revokeConnectionAction(id: string) {
  return perform(async userId => { await revokeOauthConnection(getDatabase(), userId, id); return { id }; });
}
export async function decideOperationAction(id: string, decision: "confirm" | "cancel") {
  return perform(userId => decideAiMeasurementOperation(getDatabase(), userId, id, decision));
}
export async function reviewOperationAction(id: string, action: ReviewAction) {
  return perform(userId => reviewAiMeasurementOperation(getDatabase(), userId, id, action));
}
export async function loadOperationAction(id: string) {
  return perform(userId => getAiMeasurementOperation(getDatabase(), userId, id));
}

export async function reviewRecordAction(id: string, source: "body" | "meal" | undefined, action: import("@/features/records/model").RecordReviewAction) {
  return perform(async userId => { const { reviewRecordOperation } = await import("@/features/records/operations"); const db=getDatabase();
    if(action.kind==="update"){
      const {loadRecordReview}=await import("@/features/records/operations");
      const current=await loadRecordReview(db,userId,id,source);
      const target=current.rows.find(item=>item.key===action.key);
      if(!target||target.persisted||current.revision!==action.revision)throw new Error("预览已改变，请刷新后修改。");
      if(action.action.kind==="save_meal"){
        const {recordMealPlanner}=await import("@/features/records/operations");
        const items=current.rows.map(item=>item.key===action.key?{...item,action:action.action}:item);
        await checkWebMeals(db,userId,{operationId:crypto.randomUUID(),actions:[action.action]},recordMealPlanner(items,current.id),action.key);
      }
      if(action.action.kind==="save_energy_day"){
        const entries=current.rows.filter(item=>(item.key===action.key||!item.excluded&&!item.persisted)&&(item.action.kind==="save_energy_day"||item.action.kind==="save_activity"));
        const actions=entries.map(item=>item.key===action.key?action.action:item.action) as import("@/features/activities/model").EnergyAction[];
        await checkWebEnergy(db,userId,{operationId:crypto.randomUUID(),actions},entries.findIndex(item=>item.key===action.key));
      }
    }
    const result = await reviewRecordOperation(db, userId, id, action, source); revalidatePath("/dashboard/meals"); return result; });
}
export async function loadRecordReviewAction(id: string, source?: "body" | "meal") {
  return perform(async userId => { const { loadRecordReview } = await import("@/features/records/operations"); return loadRecordReview(getDatabase(), userId, id, source); });
}
