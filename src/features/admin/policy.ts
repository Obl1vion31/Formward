import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client";
import { accountEvent, assistantMessage, assistantRun, assistantUsageRequest, user } from "../../db/schema";
import { requireSessionProof, type SessionProof } from "../auth/account-security";
import { ApiError } from "../auth/ai-identity";

export const aiPolicySchema = z.object({ userId: z.string().min(1).max(128), paused: z.boolean(), dailyBudgetCents: z.number().int().min(0).max(1000).nullable(), dailyRecognitionLimit: z.number().int().min(0).max(100).nullable(), version: z.number().int().min(0), requestId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }).strict();
export type AiPolicyInput = z.infer<typeof aiPolicySchema>;
export async function changeUserAiPolicy(db: Database, proof: SessionProof, input: AiPolicyInput) {
  const parsed = aiPolicySchema.safeParse(input); if (!parsed.success) throw new ApiError(400,"invalid_policy","请填写有效额度和调整原因。");
  const value = parsed.data;
  return db.transaction(async tx => {
    // 与既有账号管理一致，先锁操作者，再锁目标账号。
    await tx.select().from(user).where(eq(user.id,proof.userId)).for("update");
    if(value.userId!==proof.userId)await tx.select().from(user).where(eq(user.id,value.userId)).for("update");
    const actor = await requireSessionProof(tx,proof,true);
    const requestId = `ai-policy:${proof.userId}:${value.requestId}`;
    const [previous] = await tx.select().from(accountEvent).where(eq(accountEvent.requestId,requestId));
    if(previous){ if(previous.userId!==value.userId || !isDeepStrictEqual(previous.details?.input,value))throw new ApiError(409,"request_conflict","同一请求编号不能用于其他修改。");return {repeated:true}; }
    const [target]=await tx.select().from(user).where(eq(user.id,value.userId));
    if(!target)throw new ApiError(404,"not_found","用户不存在。");
    if(target.entitlementVersion!==value.version)throw new ApiError(409,"policy_changed","用户权益已变化，请读取最新值后重试。输入已保留。");
    const before={paused:target.aiPaused,dailyBudgetCents:target.aiDailyBudgetCents,dailyRecognitionLimit:target.aiDailyRecognitionLimit};
    await tx.update(user).set({aiPaused:value.paused,aiDailyBudgetCents:value.dailyBudgetCents,aiDailyRecognitionLimit:value.dailyRecognitionLimit,entitlementVersion:sql`${user.entitlementVersion}+1`,updatedAt:new Date()}).where(eq(user.id,value.userId));
    if(value.paused){
      const stopped=await tx.update(assistantRun).set({state:"stopped"}).where(and(eq(assistantRun.userId,value.userId),eq(assistantRun.state,"running"))).returning({id:assistantRun.id,answer:assistantRun.assistantMessageId});
      for(const row of stopped){await tx.update(assistantMessage).set({state:"stopped",error:"管理员已暂停站内 AI，已有内容保留。"}).where(eq(assistantMessage.id,row.answer));await tx.update(assistantUsageRequest).set({state:"unknown"}).where(and(eq(assistantUsageRequest.runId,row.id),eq(assistantUsageRequest.state,"reserved")));}
    }
    await tx.insert(accountEvent).values({id:randomUUID(),actorId:actor.user.id,userId:value.userId,email:target.email,action:"ai_policy_changed",reason:value.reason,requestId,details:{input:value,before,after:{paused:value.paused,dailyBudgetCents:value.dailyBudgetCents,dailyRecognitionLimit:value.dailyRecognitionLimit}}});
    return {repeated:false};
  });
}
