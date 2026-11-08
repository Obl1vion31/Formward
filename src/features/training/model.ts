import { z } from 'zod';
const id = z.string().uuid();
const name = z.string().trim().min(1).max(80);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(value + 'T00:00:00Z'); return value >= '2000-01-01' && value <= '2100-12-31' && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }, '日期不正确');
export const timezoneSchema = z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('zh-CN', { timeZone: value }); return true; } catch { return false; } }, '时区不正确');
export const recordingTypeSchema = z.enum(['reps', 'duration', 'cardio']);
export type RecordingType = z.infer<typeof recordingTypeSchema>;
const catalogFields = { catalogId: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(), recordingType: recordingTypeSchema.optional() };
const values = {
  weightKg: z.number().finite().min(0).max(9999).nullable(),
  reps: z.number().int().min(1).max(999).nullable(),
  durationSeconds: z.number().int().min(1).max(86400).nullable().optional(),
  distanceMeters: z.number().finite().min(0).max(1000000).nullable().optional(),
};
export const targetSchema = z.object(values).strict();
export const setSchema = z.object({ id, ...values, completed: z.boolean() }).strict();
export type TrainingSet = z.infer<typeof setSchema>;
export function completedSetValid(type: RecordingType, set: Pick<TrainingSet, 'reps' | 'durationSeconds' | 'distanceMeters'>) {
  return type === 'reps' ? set.reps !== null : type === 'duration' ? set.durationSeconds != null : set.durationSeconds != null || (set.distanceMeters != null && set.distanceMeters > 0);
}
export const exerciseSchema = z.object({ id, name, ...catalogFields, target: targetSchema.optional(), sets: z.array(setSchema).max(100) }).strict().superRefine((exercise, ctx) => {
  exercise.sets.forEach((set, index) => { if (set.completed && !completedSetValid(exercise.recordingType ?? 'reps', set)) ctx.addIssue({ code: 'custom', path: ['sets', index], message: exercise.recordingType === 'duration' ? '完成组请填写持续时间' : exercise.recordingType === 'cardio' ? '完成组请填写时间或距离' : '完成组请填写次数' }); });
});
export const exercisesSchema = z.array(exerciseSchema).max(50).refine(exercises => {
  const ids = exercises.flatMap(e => [e.id, ...e.sets.map(s => s.id)]);
  return ids.length <= 1050 && new Set(ids).size === ids.length;
}, '动作或组次重复，或数量过多');
export const templateExerciseSchema = z.object({ name, ...catalogFields, sets: z.number().int().min(1).max(100), ...values }).omit({ weightKg: true }).extend({ weightKg: values.weightKg.optional() }).strict();
export const templateSchema = z.object({ name, exercises: z.array(templateExerciseSchema).min(1).max(50) }).strict().refine(t => t.exercises.reduce((n, e) => n + e.sets, 0) <= 1000, '组数过多');
const request = { operationId: id };
const versioned = { id, version: z.number().int().positive() };
export const trainingInputSchema = z.discriminatedUnion("kind", [
  z.object({ ...request, kind: z.literal("start"), id, date, timezone: timezoneSchema, templateId: id.optional(), planId: id.optional() }).strict(),
  z.object({ ...request, ...versioned, kind: z.literal("save"), name, exercises: exercisesSchema }).strict(),
  z.object({ ...request, ...versioned, kind: z.enum(["pause", "resume", "finish", "discard", "delete_completed"]) }).strict(),
  z.object({ ...request, kind: z.literal("template"), id, template: templateSchema }).strict(),
  z.object({ ...request, ...versioned, kind: z.literal("update_template"), template: templateSchema }).strict(),
  z.object({ ...request, ...versioned, kind: z.literal("reschedule"), templateId: id, date }).strict(),
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

export function newTrainingSet(): TrainingSet { return { id: crypto.randomUUID(), weightKg: null, reps: null, durationSeconds: null, distanceMeters: null, completed: false }; }
export function templateExercises(content: TemplateContent): TrainingExercise[] {
  return content.exercises.map(e => ({ id: crypto.randomUUID(), name: e.name, ...(e.catalogId ? { catalogId: e.catalogId } : {}), ...(e.recordingType ? { recordingType: e.recordingType } : {}), target: { weightKg: e.weightKg ?? null, reps: e.reps, durationSeconds: e.durationSeconds ?? null, distanceMeters: e.distanceMeters ?? null }, sets: Array.from({ length: e.sets }, newTrainingSet) }));
}
export function setDescription(type: RecordingType, set: Pick<TrainingSet, 'weightKg' | 'reps' | 'durationSeconds' | 'distanceMeters'>) {
  const time = set.durationSeconds == null ? '' : set.durationSeconds + '秒';
  return type === 'duration' ? time || '时长未记' : type === 'cardio' ? [time, set.distanceMeters == null ? '' : set.distanceMeters + '米'].filter(Boolean).join(' · ') || '时间 / 距离未记' : [set.weightKg == null ? '' : set.weightKg + ' kg', set.reps == null ? '' : set.reps + '次'].filter(Boolean).join(' · ') || '次数未记';
}
export function templateDescription(e: TemplateContent['exercises'][number]) { const type=e.recordingType??'reps', hasTarget=type==='reps'?e.reps!=null||e.weightKg!=null:type==='duration'?e.durationSeconds!=null:e.durationSeconds!=null||e.distanceMeters!=null;return e.sets + '组 · ' + (hasTarget?setDescription(type, { weightKg:e.weightKg??null,reps:e.reps,durationSeconds:e.durationSeconds,distanceMeters:e.distanceMeters }):'自定目标'); }
export function exerciseToTemplate(e: TrainingExercise): TemplateContent['exercises'][number] {
  const first = e.sets.find(s => s.completed) ?? e.sets[0];
  return { name: e.name, ...(e.catalogId ? { catalogId: e.catalogId } : {}), recordingType: e.recordingType ?? 'reps', sets: Math.max(1, e.sets.length), reps: first?.reps ?? null, weightKg: first?.weightKg ?? null, durationSeconds: first?.durationSeconds ?? null, distanceMeters: first?.distanceMeters ?? null };
}

/** 今日入口只选择一项具体训练；同日多场按实际结束时间取最近一场。 */
export function trainingEntry(snapshot: TrainingSnapshot, today: string) {
  const active = snapshot.sessions.find(s => s.status === 'active' || s.status === 'paused');
  if (active) return { kind: 'active' as const, session: active };
  const plan = snapshot.plans.find(p => p.date === today && p.status === 'planned');
  if (plan) return { kind: 'plan' as const, plan };
  const completed = snapshot.sessions.filter(s => s.status === 'completed' && s.date === today).sort((a, b) => Date.parse(b.endedAt ?? b.startedAt) - Date.parse(a.endedAt ?? a.startedAt) || b.id.localeCompare(a.id))[0];
  return completed ? { kind: 'completed' as const, session: completed } : { kind: 'free' as const };
}
