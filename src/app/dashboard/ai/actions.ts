"use server";
import {reviewWebRecord} from "@/features/records/web-review";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { withCurrentSession } from "@/features/auth/server";
import { createAiToken, revokeAiToken } from "@/features/auth/ai-tokens";
import { getDatabase } from "@/db/client";
import { revokeOauthConnection } from "@/features/auth/oauth-connections";
import { safeAiError } from "@/features/measurements/ai-api";
import { decideAiMeasurementOperation, getAiMeasurementOperation, reviewAiMeasurementOperation, type ReviewAction } from "@/features/measurements/ai-operations";

async function perform<T>(work: (userId: string) => Promise<T>,mode:"read"|"write"="write") {
  try {
    return await withCurrentSession(await headers(), async user => {
    const data = await work(user.id);
    revalidatePath("/dashboard/ai", "layout"); revalidatePath("/dashboard"); revalidatePath("/dashboard/energy"); revalidatePath("/dashboard/training"); revalidatePath("/dashboard/measurements");
    return { ok: true as const, data };
    },mode);
  } catch (error) { return { ok: false as const, error: safeAiError(error).error.message }; }
}
export async function createTokenAction(name: string, permission: "read" | "write", options: import("@/features/auth/ai-tokens").TokenOptions = {days:7,domains:["measurements","meals","energy","training"]}) {
  return perform(userId => createAiToken(getDatabase(), userId, name, permission, options));
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
  return perform(userId => getAiMeasurementOperation(getDatabase(), userId, id),"read");
}

export async function reviewRecordAction(id:string,source:"body"|"meal"|undefined,action:import("@/features/records/model").RecordReviewAction){
  return perform(async userId=>{const result=await reviewWebRecord(getDatabase(),userId,id,action,source);revalidatePath("/dashboard/meals");return result;});
}
export async function loadRecordReviewAction(id: string, source?: "body" | "meal") {
  return perform(async userId => { const { loadRecordReview } = await import("@/features/records/operations"); return loadRecordReview(getDatabase(), userId, id, source); },"read");
}
