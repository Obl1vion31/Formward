import { submissionSourceResolver } from "../auth/ai-access-overview";
import type {EnergyPreview} from "../activities/model";
import { type RecordAction } from "../records/model";
import { type PreviewRow, mealTypeLabel } from "../meals/model";
import {chatAllowed,chatCapabilities} from "./chat-config";
import { assistantConversation,assistantMessage } from "../../db/schema";
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

export function reviewSummary(actions:RecordAction[],rows:PreviewRow[]=[],energyRows:EnergyPreview[]=[]){
  const meal=rows.find(row=>!row.excluded&&row.meal)?.meal;
  if(meal){const n=meal.totals.values,show=(v:string|null)=>v===null?"—":String(Number(v));return {title:mealTypeLabel(meal.mealType)+(actions.length>1?"等 "+actions.length+" 项":""),value:(meal.totals.incomplete.caloriesKcal?"已知 ":"")+show(n.caloriesKcal)+" 千卡",detail:`蛋白质 ${show(n.proteinG)}g · 碳水 ${show(n.carbsG)}g · 脂肪 ${show(n.fatG)}g`};}
  const body=actions.find(a=>a.kind==="save_record");
  if(body?.kind==="save_record")return {title:body.period==="evening"?"晚间测量":"晨间测量",value:body.weightKg!=null?Number(body.weightKg).toFixed(2)+" kg":body.bodyFatPercent!=null?Number(body.bodyFatPercent)+"% 体脂":"测量数值未知",detail:body.deviceLabel?"来源 "+body.deviceLabel:""};
  const energy=energyRows.find(row=>!row.excluded&&!row.error&&row.day)?.day;
  if(energy)return {title:"每日消耗",value:energy.totalKcal===null?"总消耗未知":Number(energy.totalKcal)+" 千卡",detail:`静息 ${energy.restingKcal===null?"—":Number(energy.restingKcal)} 千卡 · 活动 ${energy.activeKcal===null?"—":Number(energy.activeKcal)} 千卡`};
  const template=actions.find(action=>action.kind==="save_training_template");
  if(template?.kind==="save_training_template")return {title:"训练计划",value:template.template.name,detail:actions.length>1?actions.length+" 项待核对":"待核对"};
  if(actions.some(action=>action.kind==="schedule_training"))return {title:"训练排期",value:actions.length+" 项待核对",detail:""};
  return {title:actions.length>1?"组合提交":"待确认提交",value:actions.length+" 项待核对",detail:""};
}

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
  const {source}=await submissionSourceResolver(db,userId);
  const origin=(grants:Parameters<typeof source>[0])=>{const value=source(grants);return value.kind==="embedded"?"站内助手 · "+(value.compactLabel??value.label):value.compactLabel??value.label;};
  if (summaries.length) {
    const roots = await db.select({
      id: recordOperation.id, draft: recordOperation.draft, mealPreview:mealOperation.preview, energyPreview:energyOperation.preview,
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
      result.push({ id: "ai:" + summary.id, category: "ai", date: summary.dates[0] ?? today, title: "AI 提交待你确认", detail: summary.summary, review:{...(root.draft.some(item=>item.persisted)?{title:"待确认提交",value:summary.pendingCount+" 项待核对",detail:summary.summary}:reviewSummary(root.draft.filter(item=>!item.excluded&&!item.persisted).map(item=>item.action),root.mealPreview??[],root.energyPreview??[])),source:origin([...(root.bodyId?[{tokenId:root.bodyToken,oauthConnectionId:root.bodyConnection}]:[]),...(root.mealId?[{tokenId:root.mealToken,oauthConnectionId:root.mealConnection}]:[]),...(root.energyId?[{tokenId:root.energyToken,oauthConnectionId:root.energyConnection}]:[]),...root.draft.filter(item=>item.trainingGrant).map(item=>item.trainingGrant)])}, action: { label: "查看并确认", href: summary.confirmationPath }, ...(summary.expiresAt ? { expiresAt: summary.expiresAt } : {}) });
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
    result.push({ id: "ai:body:" + row.id, category: "ai", date: view.preview.date, title: "AI 身体记录待确认", detail: `${view.counts.pending} 项尚未保存`, review:{source:origin([row]),...reviewSummary(view.items.filter(item=>item.status==="pending").map(item=>item.input))}, action: { label: "查看并确认", href: view.confirmationPath }, expiresAt: row.expiresAt.toISOString() });
  }
  const meals = await db.select().from(mealOperation).where(and(
    eq(mealOperation.userId, userId), eq(mealOperation.origin, "ai"), eq(mealOperation.status, "pending"), gt(mealOperation.expiresAt, now),
    notExists(db.select({ id: recordOperation.id }).from(recordOperation).where(and(eq(recordOperation.userId, userId), eq(recordOperation.mealOperationId, mealOperation.id)))),
  )).orderBy(desc(mealOperation.createdAt)).limit(100);
  for (const row of meals) {
    if (!await authorized(row.tokenId, row.oauthConnectionId, "meals")) continue;
    const date = row.draft.actions.flatMap(action => "date" in action ? action.date : []).find(Boolean) ?? today;
    result.push({ id: "ai:meal:" + row.id, category: "ai", date, title: "AI 饮食记录待确认", detail: "核对本次提交后再保存", review:{source:origin([row]),...reviewSummary([],row.preview)}, action: { label: "查看并确认", href: "/dashboard/meals/review/" + row.id }, ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}) });
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
  const tasks=await db.select({id:assistantConversation.id,context:assistantConversation.context}).from(assistantConversation).where(eq(assistantConversation.userId,user.id));
  const answers=await db.select({references:assistantMessage.references}).from(assistantMessage).where(and(eq(assistantMessage.userId,user.id),eq(assistantMessage.role,"assistant"))).limit(1000);
  const chatPreviews=new Set(answers.flatMap(answer=>answer.references.flatMap(ref=>ref.kind==="preview"&&ref.operationId?[ref.operationId]:[])));
  for(const item of reviews){
    const id=item.action.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];if(!id)continue;
    const task=tasks.find(task=>task.context?.previewId===id&&!task.context.cancelled);
    if(task?.context&&chatAllowed(user)&&chatCapabilities().mealEntry)item.action={label:"核对并保存",href:"/dashboard/meals?entry=1&date="+encodeURIComponent(task.context.draft.date)+"&aiTask="+task.id};
    else if(chatPreviews.has(id)&&chatAllowed(user)&&chatCapabilities().inlinePreviews)item.action={...item.action,previewId:id};
  }
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
