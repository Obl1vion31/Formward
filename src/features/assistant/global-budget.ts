import { eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { aiBudgetDay, assistantUsageRequest, securityEvent } from "../../db/schema";
import { securityDay } from "../auth/security-usage";

export const GLOBAL_AI_DAILY_CNY = 10;
export async function globalBudget(db: Pick<Database, "select">, date = securityDay()) {
  const [totals] = await db.select({
    spent: sql<string>`coalesce(sum(CASE WHEN ${assistantUsageRequest.state}='settled' THEN ${assistantUsageRequest.costCny} ELSE 0 END),0)::text`,
    reserved: sql<string>`coalesce(sum(CASE WHEN ${assistantUsageRequest.state}='reserved' THEN ${assistantUsageRequest.reservedCny} ELSE 0 END),0)::text`,
    uncertain: sql<string>`coalesce(sum(CASE WHEN ${assistantUsageRequest.state}='unknown' OR (${assistantUsageRequest.state}='settled' AND ${assistantUsageRequest.costCny} IS NULL) THEN ${assistantUsageRequest.reservedCny} ELSE 0 END),0)::text`,
  }).from(assistantUsageRequest).where(eq(assistantUsageRequest.date, date));
  return { date, limit: GLOBAL_AI_DAILY_CNY, ...totals, available: Math.max(0, GLOBAL_AI_DAILY_CNY - Number(totals.spent) - Number(totals.reserved) - Number(totals.uncertain)) };
}
export async function lockGlobalBudget(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], date: string) {
  await tx.insert(aiBudgetDay).values({ date }).onConflictDoNothing();
  await tx.select().from(aiBudgetDay).where(eq(aiBudgetDay.date, date)).for("update");
}
export async function budgetAlert(db: Database, date: string, level: 80 | 100) {
  await db.insert(securityEvent).values({ id: `budget:${date}:${level}`, category: "global_budget", details: { date, percent: level } }).onConflictDoNothing();
}
