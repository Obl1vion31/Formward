import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client";
import { trainingEvent, trainingPlan, trainingSession, trainingTemplate } from "../../db/schema";
import { lockActiveAccount, requireActiveAccount } from "../auth/account-security";
import { ApiError } from "../auth/ai-identity";
import { completedSetCount, sessionSeconds, templateExercises, trainingInputSchema, type TrainingInput, type TrainingSnapshot } from "./model";

type ReadDb = Pick<Database, "select">;
export async function readTraining(db: ReadDb, userId: string): Promise<TrainingSnapshot> {
  await requireActiveAccount(db, userId);
  // 分开读取以兼容独立 PGlite 单连接；仅返回当前账号。
  const sessions = await db.select().from(trainingSession).where(eq(trainingSession.userId, userId)).orderBy(desc(trainingSession.date));
  const templates = await db.select().from(trainingTemplate).where(eq(trainingTemplate.userId, userId)).orderBy(desc(trainingTemplate.createdAt));
  const plans = await db.select().from(trainingPlan).where(eq(trainingPlan.userId, userId)).orderBy(desc(trainingPlan.date));
  return {
    sessions: sessions.filter(s => s.status !== "discarded").map(s => ({ id: s.id, date: s.date, timezone: s.timezone, name: s.name, status: s.status, exercises: s.exercises, version: s.version, elapsedSeconds: s.elapsedSeconds, startedAt: s.startedAt.toISOString(), resumedAt: s.resumedAt?.toISOString() ?? null, endedAt: s.endedAt?.toISOString() ?? null, planId: s.planId })),
    templates: templates.map(t => ({ id: t.id, version: t.version, ...t.content })),
    plans: plans.filter(p => p.status !== "skipped").map(p => ({ id: p.id, date: p.date, templateId: p.templateId, content: p.content, status: p.status, version: p.version })),
  };
}
export async function mutateTraining(db: Database, userId: string, input: unknown, now = new Date(), origin: "manual" | "ai" = "manual") {
  const parsed = trainingInputSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "invalid_input", parsed.error.issues[0]?.message === "完成组请填写次数" ? "完成组请填写次数。" : "请检查动作、组次、日期和数值。");
  const value = parsed.data, digest = createHash("sha256").update((origin === "ai" ? "ai:" : "") + JSON.stringify(value)).digest("hex");
  return db.transaction(async tx => {
    await lockActiveAccount(tx, userId);
    const [repeated] = await tx.select().from(trainingEvent).where(and(eq(trainingEvent.userId, userId), eq(trainingEvent.operationId, value.operationId)));
    if (repeated) {
      if (repeated.requestDigest !== digest) throw new ApiError(409, "request_conflict", "同一请求不能用于不同修改，请重新提交。");
      return { snapshot: await readTraining(tx, userId), entityId: repeated.entityId };
    }
    async function noChange(entityId: string, row: unknown) {
      await tx.insert(trainingEvent).values({ id: randomUUID(), userId, operationId: value.operationId, requestDigest: digest, entityId, action: value.kind, origin, actorId: userId, snapshot: { before: row, after: row }, createdAt: now });
      return { snapshot: await readTraining(tx, userId), entityId };
    }
    const entityId = value.id; let before: unknown = null, after: unknown;
    if (value.kind === "start") {
      const [active] = await tx.select().from(trainingSession).where(and(eq(trainingSession.userId, userId), inArray(trainingSession.status, ["active", "paused"])));
      if (active) return noChange(active.id, active);
      let content = null, planId: string | null = null;
      if (value.planId) {
        const [plan] = await tx.select().from(trainingPlan).where(and(eq(trainingPlan.id, value.planId), eq(trainingPlan.userId, userId), eq(trainingPlan.status, "planned")));
        if (!plan || plan.date !== value.date) throw new ApiError(409, "invalid_plan", "计划已改变，请重新查看当天安排。");
        content = plan.content; planId = plan.id;
      } else if (value.templateId) {
        const [template] = await tx.select().from(trainingTemplate).where(and(eq(trainingTemplate.id, value.templateId), eq(trainingTemplate.userId, userId)));
        if (!template) throw new ApiError(404, "not_found", "训练模板不存在。");
        content = template.content;
      }
      [after] = await tx.insert(trainingSession).values({ id: value.id, userId, date: value.date, timezone: value.timezone, name: content?.name ?? "自由训练", exercises: content ? templateExercises(content) : [], startedAt: now, resumedAt: now, planId, createdBy: userId }).returning();
    } else if (value.kind === "template") {
      [after] = await tx.insert(trainingTemplate).values({ id: value.id, userId, content: value.template, createdBy: userId }).returning();
    } else if (value.kind === 'update_template') {
      const [template] = await tx.select().from(trainingTemplate).where(and(eq(trainingTemplate.id, value.id), eq(trainingTemplate.userId, userId)));
      if (!template) throw new ApiError(404, 'not_found', '训练模板不存在。');
      if (template.version !== value.version) throw conflict();
      before = template; [after] = await tx.update(trainingTemplate).set({ content: value.template, version: template.version + 1 }).where(and(eq(trainingTemplate.id, value.id), eq(trainingTemplate.userId, userId))).returning();
    } else if (value.kind === 'reschedule') {
      const [plan] = await tx.select().from(trainingPlan).where(and(eq(trainingPlan.id, value.id), eq(trainingPlan.userId, userId)));
      const [template] = await tx.select().from(trainingTemplate).where(and(eq(trainingTemplate.id, value.templateId), eq(trainingTemplate.userId, userId)));
      if (!plan || !template) throw new ApiError(404, 'not_found', '训练计划或模板不存在。');
      if (plan.status !== 'planned' || plan.version !== value.version) throw conflict();
      const [active] = await tx.select().from(trainingSession).where(and(eq(trainingSession.planId, plan.id), eq(trainingSession.userId, userId), inArray(trainingSession.status, ['active', 'paused'])));
      if (active) throw new ApiError(409, 'invalid_plan', '这项计划正在训练中，请先完成当前训练。');
      const [duplicate] = await tx.select().from(trainingPlan).where(and(eq(trainingPlan.userId, userId), eq(trainingPlan.templateId, template.id), eq(trainingPlan.date, value.date), eq(trainingPlan.status, 'planned')));
      if (duplicate && duplicate.id !== plan.id) throw new ApiError(409, 'invalid_plan', '目标日期已有相同模板的计划。');
      before = plan; [after] = await tx.update(trainingPlan).set({ templateId: template.id, date: value.date, content: template.content, version: plan.version + 1, updatedAt: now }).where(and(eq(trainingPlan.id, plan.id), eq(trainingPlan.userId, userId))).returning();
    } else if (value.kind === "schedule") {
      const [template] = await tx.select().from(trainingTemplate).where(and(eq(trainingTemplate.id, value.templateId), eq(trainingTemplate.userId, userId)));
      if (!template) throw new ApiError(404, "not_found", "训练模板不存在。");
      const [existing] = await tx.select().from(trainingPlan).where(and(eq(trainingPlan.userId, userId), eq(trainingPlan.date, value.date), eq(trainingPlan.templateId, template.id), eq(trainingPlan.status, "planned")));
      if (existing) return noChange(existing.id, existing);
      [after] = await tx.insert(trainingPlan).values({ id: value.id, userId, templateId: template.id, date: value.date, content: template.content, createdBy: userId }).returning();
    } else if (value.kind === "unschedule") {
      const [plan] = await tx.select().from(trainingPlan).where(and(eq(trainingPlan.id, value.id), eq(trainingPlan.userId, userId)));
      if (!plan) throw new ApiError(404, "not_found", "训练计划不存在。");
      if (plan.version !== value.version || plan.status !== "planned") throw conflict();
      before = plan; [after] = await tx.update(trainingPlan).set({ status: "skipped", version: plan.version + 1, updatedAt: now }).where(eq(trainingPlan.id, plan.id)).returning();
    } else {
      const [row] = await tx.select().from(trainingSession).where(and(eq(trainingSession.id, value.id), eq(trainingSession.userId, userId)));
      if (!row) throw new ApiError(404, "not_found", "训练记录不存在。");
      if (row.status === "completed" && value.kind === "finish") return noChange(row.id, row);
      if (row.version !== value.version || !["active", "paused"].includes(row.status)) throw conflict();
      before = row;
      const update: Partial<typeof trainingSession.$inferInsert> = { version: row.version + 1, updatedAt: now };
      if (value.kind === "save") { update.name = value.name; update.exercises = value.exercises; }
      else {
        update.elapsedSeconds = sessionSeconds({ elapsedSeconds: row.elapsedSeconds, resumedAt: row.resumedAt?.toISOString() ?? null, status: row.status }, now.getTime());
        update.resumedAt = null;
        if (value.kind === "pause") {
          if (row.status !== "active") throw conflict(); update.status = "paused";
        } else if (value.kind === "resume") {
          if (row.status !== "paused") throw conflict(); update.status = "active"; update.resumedAt = now;
        } else {
          if (value.kind === "finish" && !completedSetCount(row.exercises)) throw new ApiError(400, "empty_training", "请先完成至少一组，或选择放弃本次训练。");
          update.status = value.kind === "finish" ? "completed" : "discarded"; update.endedAt = now;
          if (value.kind === "finish") {
            update.exercises = row.exercises.map(e => ({ ...e, sets: e.sets.filter(s => s.completed) })).filter(e => e.sets.length);
            if (row.planId) await tx.update(trainingPlan).set({ status: "completed", updatedAt: now }).where(and(eq(trainingPlan.id, row.planId), eq(trainingPlan.userId, userId)));
          }
        }
      }
      [after] = await tx.update(trainingSession).set(update).where(and(eq(trainingSession.id, row.id), eq(trainingSession.userId, userId))).returning();
    }
    await tx.insert(trainingEvent).values({ id: randomUUID(), userId, operationId: value.operationId, requestDigest: digest, entityId, action: value.kind, origin, actorId: userId, snapshot: { before, after }, createdAt: now });
    return { snapshot: await readTraining(tx, userId), entityId };
  });
}
function conflict() { return new ApiError(409, "version_conflict", "训练已在其他页面修改。当前输入已保留，请重新载入云端进度后再继续。"); }
export type TrainingMutation = TrainingInput;
