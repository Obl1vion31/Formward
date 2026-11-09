import { and, desc, eq, gt, inArray, notExists } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assistantReminderDismissal, mealDay, measurementOperation, mealOperation, energyOperation, recordOperation, trainingPlan, trainingSession } from "../../db/schema";
import { readMealSnapshot } from "../meals/records";
import { readEnergySnapshot } from "../activities/records";
import { listMeasurements } from "../measurements/records";
import { operationDisplay } from "../measurements/ai-operations";
import { containsRetiredBodyEstimate } from "../measurements/retirement";
import { measurementDisplay } from "../measurements/editing";
import { localMeasurementDate } from "../measurements/entry-state";
import { addCalendarDays } from "../measurements/calendar";
import { reminderCatalog } from "../dashboard/daily-reminders";
import { listRecordOperations } from "../records/operations";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { lockOwner } from "../auth/owner-lock";
import { ApiError } from "../auth/ai-identity";
import { assistantContext, assistantTimezone, type AssistantItem } from "./model";

async function pendingReviews(db: Database, userId: string, today: string, now: Date): Promise<AssistantItem[]> {
  const result: AssistantItem[] = [], checked = new Map<string, boolean>();
  async function authorized(tokenId: string | null | undefined, oauthConnectionId: string | null | undefined, domain: "measurements" | "meals" | "energy" | "training") {
    if (!tokenId && !oauthConnectionId) return false;
    const key = [tokenId, oauthConnectionId, domain].join(":");
    if (checked.has(key)) return checked.get(key)!;
    try {
      const identity = oauthConnectionId ? { userId, oauthConnectionId, permission: "write" as const } : { userId, tokenId: tokenId!, permission: "write" as const };
      await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, domain);
      checked.set(key, true); return true;
    } catch { checked.set(key, false); return false; }
  }
  const summaries = await listRecordOperations(db, userId, true);
  if (summaries.length) {
    const roots = await db.select({
      id: recordOperation.id, draft: recordOperation.draft,
      bodyId: recordOperation.measurementOperationId, bodyToken: measurementOperation.tokenId, bodyConnection: measurementOperation.oauthConnectionId,
      mealId: recordOperation.mealOperationId, mealToken: mealOperation.tokenId, mealConnection: mealOperation.oauthConnectionId,
      energyId: recordOperation.energyOperationId, energyToken: energyOperation.tokenId, energyConnection: energyOperation.oauthConnectionId,
    }).from(recordOperation)
      .leftJoin(measurementOperation, and(eq(measurementOperation.id, recordOperation.measurementOperationId), eq(measurementOperation.userId, userId)))
      .leftJoin(mealOperation, and(eq(mealOperation.id, recordOperation.mealOperationId), eq(mealOperation.userId, userId)))
      .leftJoin(energyOperation, and(eq(energyOperation.id, recordOperation.energyOperationId), eq(energyOperation.userId, userId)))
      .where(and(eq(recordOperation.userId, userId), inArray(recordOperation.id, summaries.map(row => row.id))));
    for (const summary of summaries) {
      if (summary.expired || !summary.pendingCount) continue;
      const root = roots.find(row => row.id === summary.id);
      if (!root) continue;
      let allowed = true;
      if (root.bodyId) allowed &&= await authorized(root.bodyToken, root.bodyConnection, "measurements");
      if (root.mealId) allowed &&= await authorized(root.mealToken, root.mealConnection, "meals");
      if (root.energyId) allowed &&= await authorized(root.energyToken, root.energyConnection, "energy");
      for (const item of root.draft.filter(item => !item.excluded && !item.persisted && (item.action.kind === "save_training_template" || item.action.kind === "schedule_training"))) {
        allowed &&= await authorized(item.trainingGrant?.tokenId, item.trainingGrant?.oauthConnectionId, "training");
      }
      if (!allowed) continue;
      result.push({ id: "ai:" + summary.id, category: "ai", date: summary.dates[0] ?? today, title: "AI 提交待你确认", detail: summary.summary, action: { label: "查看并确认", href: summary.confirmationPath }, ...(summary.expiresAt ? { expiresAt: summary.expiresAt } : {}) });
    }
  }
  // 旧独立审核入口仍可使用；已归入统一批次的子操作不重复计数。
  const bodies = await db.select().from(measurementOperation).where(and(
    eq(measurementOperation.userId, userId), inArray(measurementOperation.status, ["pending", "partially_confirmed"]), gt(measurementOperation.expiresAt, now),
    notExists(db.select({ id: recordOperation.id }).from(recordOperation).where(and(eq(recordOperation.userId, userId), eq(recordOperation.measurementOperationId, measurementOperation.id)))),
  )).orderBy(desc(measurementOperation.createdAt)).limit(100);
  for (const row of bodies) {
    if (containsRetiredBodyEstimate(row.payload) || !await authorized(row.tokenId, row.oauthConnectionId, "measurements")) continue;
    const view = operationDisplay(row); if (!view.counts.pending) continue;
    result.push({ id: "ai:body:" + row.id, category: "ai", date: view.preview.date, title: "AI 身体记录待确认", detail: `${view.counts.pending} 项尚未保存`, action: { label: "查看并确认", href: view.confirmationPath }, expiresAt: row.expiresAt.toISOString() });
  }
  const meals = await db.select().from(mealOperation).where(and(
    eq(mealOperation.userId, userId), eq(mealOperation.origin, "ai"), eq(mealOperation.status, "pending"), gt(mealOperation.expiresAt, now),
    notExists(db.select({ id: recordOperation.id }).from(recordOperation).where(and(eq(recordOperation.userId, userId), eq(recordOperation.mealOperationId, mealOperation.id)))),
  )).orderBy(desc(mealOperation.createdAt)).limit(100);
  for (const row of meals) {
    if (!await authorized(row.tokenId, row.oauthConnectionId, "meals")) continue;
    const date = row.draft.actions.flatMap(action => "date" in action ? action.date : []).find(Boolean) ?? today;
    result.push({ id: "ai:meal:" + row.id, category: "ai", date, title: "AI 饮食记录待确认", detail: "核对本次提交后再保存", action: { label: "查看并确认", href: "/dashboard/meals/review/" + row.id }, ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}) });
  }
  return result;
}

export async function readAssistantContext(db: Database, user: { id: string; createdAt: Date }, timezone: string, now = new Date()) {
  const zone = assistantTimezone(timezone), today = localMeasurementDate(now, zone), yesterday = addCalendarDays(today, -1), dates = [yesterday, today];
  const meals = await readMealSnapshot(db, user.id, dates);
  const energy = await readEnergySnapshot(db, user.id, dates);
  const records = await listMeasurements(db, user.id, dates);
  const context = assistantContext(reminderCatalog(meals.meals, records.map(measurementDisplay), energy), now, zone, user.createdAt.toISOString());
  const ignored = await db.select().from(assistantReminderDismissal).where(and(eq(assistantReminderDismissal.userId, user.id), eq(assistantReminderDismissal.date, yesterday)));
  const day = await db.select().from(mealDay).where(and(eq(mealDay.userId, user.id), eq(mealDay.date, yesterday)));
  if (ignored.length || day[0]?.status === "complete") context.pending = context.pending.filter(item => item.category !== "meals");
  const plans = await db.select({ id: trainingPlan.id, content: trainingPlan.content }).from(trainingPlan).where(and(eq(trainingPlan.userId, user.id), eq(trainingPlan.date, today), eq(trainingPlan.status, "planned")));
  const started = plans.length ? await db.select({ planId: trainingSession.planId }).from(trainingSession).where(and(eq(trainingSession.userId, user.id), inArray(trainingSession.planId, plans.map(row => row.id)), inArray(trainingSession.status, ["active", "paused", "completed"]))) : [];
  const upcoming = plans.filter(plan => !started.some(session => session.planId === plan.id));
  const reviews = await pendingReviews(db, user.id, today, now);
  context.pending.unshift(...reviews);
  if (upcoming.length) context.pending.push({ id: "training:" + today, category: "training", date: today, title: "有训练计划待开始", detail: upcoming.map(plan => plan.content.name).join("、"), action: { label: "查看计划", href: "/dashboard/training?date=" + today } });
  return context;
}

export async function dismissAssistantMealReminder(db: Database, user: { id: string; createdAt: Date }, id: unknown, timezone: string, now = new Date()) {
  const zone = assistantTimezone(timezone), yesterday = addCalendarDays(localMeasurementDate(now, zone), -1);
  if (typeof id !== "string" || id !== "meals:" + yesterday || yesterday < localMeasurementDate(user.createdAt, zone)) throw new ApiError(400, "invalid_reminder", "这条提醒已不属于昨天，请重新查看。");
  return db.transaction(async tx => {
    await lockOwner(tx, user.id);
    await tx.insert(assistantReminderDismissal).values({ userId: user.id, date: yesterday, ignoredAt: now }).onConflictDoNothing();
  });
}
