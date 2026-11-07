import { z } from "zod";

const id = z.string().uuid();
const name = z.string().trim().min(1).max(80);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(value + "T00:00:00Z"); return value >= "2000-01-01" && value <= "2100-12-31" && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }, "日期不正确");
export const timezoneSchema = z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("zh-CN", { timeZone: value }); return true; } catch { return false; } }, "时区不正确");
export const setSchema = z.object({
  id, weightKg: z.number().finite().min(0).max(9999).nullable(),
  reps: z.number().int().min(1).max(999).nullable(), completed: z.boolean(),
}).strict().refine(value => !value.completed || value.reps !== null, "完成组请填写次数");
export const exerciseSchema = z.object({ id, name, sets: z.array(setSchema).max(100) }).strict();
export const exercisesSchema = z.array(exerciseSchema).max(50).refine(exercises => {
  const ids = exercises.flatMap(e => [e.id, ...e.sets.map(s => s.id)]);
  return ids.length <= 1050 && new Set(ids).size === ids.length;
}, "动作或组次重复，或数量过多");
export const templateSchema = z.object({
  name, exercises: z.array(z.object({ name, sets: z.number().int().min(1).max(100), reps: z.number().int().min(1).max(999).nullable() }).strict()).min(1).max(50),
}).strict().refine(t => t.exercises.reduce((n, e) => n + e.sets, 0) <= 1000, "组数过多");
const request = { operationId: id };
const versioned = { id, version: z.number().int().positive() };
export const trainingInputSchema = z.discriminatedUnion("kind", [
  z.object({ ...request, kind: z.literal("start"), id, date, timezone: timezoneSchema, templateId: id.optional(), planId: id.optional() }).strict(),
  z.object({ ...request, ...versioned, kind: z.literal("save"), name, exercises: exercisesSchema }).strict(),
  z.object({ ...request, ...versioned, kind: z.enum(["pause", "resume", "finish", "discard"]) }).strict(),
  z.object({ ...request, kind: z.literal("template"), id, template: templateSchema }).strict(),
  z.object({ ...request, kind: z.literal("schedule"), id, templateId: id, date }).strict(),
  z.object({ ...request, ...versioned, kind: z.literal("unschedule") }).strict(),
]);
export type TrainingInput = z.infer<typeof trainingInputSchema>;
export type TrainingExercise = z.infer<typeof exerciseSchema>;
export type TemplateContent = z.infer<typeof templateSchema>;
export type TrainingSession = {
  id: string; date: string; timezone: string; name: string; status: "active" | "paused" | "completed" | "discarded";
  exercises: TrainingExercise[]; version: number; elapsedSeconds: number; startedAt: string; resumedAt: string | null; endedAt: string | null; planId: string | null;
};
export type TrainingTemplate = TemplateContent & { id: string; version: number };
export type TrainingPlan = { id: string; date: string; templateId: string; content: TemplateContent; status: "planned" | "completed" | "skipped"; version: number };
export type TrainingSnapshot = { sessions: TrainingSession[]; templates: TrainingTemplate[]; plans: TrainingPlan[] };
export type TrainingResult = { ok: true; snapshot: TrainingSnapshot; entityId?: string } | { ok: false; error: string; conflict?: boolean };
export function sessionSeconds(session: Pick<TrainingSession, "elapsedSeconds" | "resumedAt" | "status">, now = Date.now()) {
  return session.elapsedSeconds + (session.status === "active" && session.resumedAt ? Math.max(0, Math.floor((now - Date.parse(session.resumedAt)) / 1000)) : 0);
}
export function completedSetCount(exercises: TrainingExercise[]) { return exercises.reduce((n, e) => n + e.sets.filter(s => s.completed).length, 0); }
export function templateExercises(content: TemplateContent): TrainingExercise[] {
  return content.exercises.map(e => ({ id: crypto.randomUUID(), name: e.name, sets: Array.from({ length: e.sets }, () => ({ id: crypto.randomUUID(), weightKg: null, reps: null, completed: false })) }));
}
