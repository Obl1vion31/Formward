import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assistantConversation, assistantRecognition, assistantRun, assistantUsageRequest } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { accountEntitlements } from "../auth/entitlements";
import { requireActiveAccount } from "../auth/account-security";
import { budgetDate, nextBudgetReset } from "./chat-model";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function recognitionUsage(db: Pick<Database, "select">, userId: string, now = new Date()) {
  const date = budgetDate(now);
  const [row] = await db.select({ used: count() }).from(assistantRecognition).where(and(eq(assistantRecognition.userId, userId), eq(assistantRecognition.date, date), inArray(assistantRecognition.state, ["reserved", "used"])));
  return { used: row.used, limit: 4, remaining: Math.max(0, 4 - row.used), resetAt: nextBudgetReset(date) };
}
/** 已持有账号锁；创建任务不扣次数，首次真实模型请求才预占。 */
export async function prepareRecognition(tx: Tx, task: typeof assistantConversation.$inferSelect, inputDigest: string, followup: boolean) {
  const [last] = await tx.select().from(assistantRecognition).where(and(eq(assistantRecognition.userId, task.userId), eq(assistantRecognition.conversationId, task.id))).orderBy(desc(assistantRecognition.createdAt), desc(assistantRecognition.id)).limit(1);
  if (followup) {
    if (!last || !["used", "reserved"].includes(last.state)) throw new ApiError(409, "followup_changed", "识别补充任务已变化，请重新读取，已填写内容保留。");
    return last.id;
  }
  // 技术失败的相同业务输入可重试；完成后主动再次识别始终创建新任务。
  if (last?.state === "refunded" && last.inputDigest === inputDigest) return last.id;
  const id = randomUUID();
  await tx.insert(assistantRecognition).values({ id, userId: task.userId, conversationId: task.id, inputDigest, date: budgetDate() });
  return id;
}
export async function reserveRecognition(tx: Tx, run: typeof assistantRun.$inferSelect) {
  if (!run.recognitionId) throw new ApiError(409, "recognition_missing", "本次识别任务未能恢复，请重新打开拍照录入，照片与手填内容保留。");
  const [job] = await tx.select().from(assistantRecognition).where(and(eq(assistantRecognition.id, run.recognitionId), eq(assistantRecognition.userId, run.userId), eq(assistantRecognition.conversationId, run.conversationId)));
  if (!job) throw new ApiError(404, "recognition_missing", "识别任务不存在或不属于当前账号。");
  const entitlement = accountEntitlements(await requireActiveAccount(tx, run.userId));
  if (entitlement.tier === "free") {
    const [requests] = await tx.select({ total: count() }).from(assistantUsageRequest).innerJoin(assistantRun, and(eq(assistantRun.id, assistantUsageRequest.runId), eq(assistantRun.userId, run.userId))).where(eq(assistantRun.recognitionId, job.id));
    if (requests.total >= 8) throw new ApiError(429, "recognition_steps", "本次识别已达到处理步骤上限，已有结果保留，请手动核对填写。");
    if (["prepared", "refunded"].includes(job.state) && (await recognitionUsage(tx, run.userId)).remaining < 1) throw new ApiError(429, "daily_recognition_limit", "今日4次识图额度已用完，可以继续手动填写，明日北京时间零点重置。");
  }
  if (["prepared", "refunded"].includes(job.state)) await tx.update(assistantRecognition).set({ state: "reserved", date: budgetDate(), updatedAt: new Date() }).where(eq(assistantRecognition.id, job.id));
}
export async function markRecognitionUsed(db: Database, userId: string, runId: string) {
  const [run] = await db.select({ recognitionId: assistantRun.recognitionId }).from(assistantRun).where(and(eq(assistantRun.id, runId), eq(assistantRun.userId, userId)));
  if (run?.recognitionId) await db.update(assistantRecognition).set({ state: "used", updatedAt: new Date() }).where(and(eq(assistantRecognition.id, run.recognitionId), eq(assistantRecognition.userId, userId), inArray(assistantRecognition.state, ["reserved", "used"])));
}
export async function refundUnfinishedRecognition(db: Database, userId: string, run: typeof assistantRun.$inferSelect) {
  if (run.recognitionId) await db.update(assistantRecognition).set({ state: "refunded", updatedAt: new Date() }).where(and(eq(assistantRecognition.id, run.recognitionId), eq(assistantRecognition.userId, userId), inArray(assistantRecognition.state, ["prepared", "reserved"])));
}
