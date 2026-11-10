import type { Database } from '../../db/client';
import { requireActiveAiToken } from '../auth/ai-tokens';
import type { AiIdentity } from '../auth/ai-identity';
import { ApiError } from '../auth/ai-identity';
import { localMeasurementDate } from '../measurements/entry-state';
import { addCalendarDays } from '../measurements/calendar';
import { timezoneSchema } from './model';
import { readTraining } from './records';
import { boundedQueryPage } from '../records/ai-query';
export async function queryTraining(db: Database, identity: AiIdentity, args: { from?: string; to?: string; timezone?: string }) {
  await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, 'training');
  const timezone = args.timezone ?? process.env.FORMWARD_TIMEZONE ?? 'Asia/Shanghai';
  if (!timezoneSchema.safeParse(timezone).success) throw new ApiError(400, 'invalid_input', '时区不正确。');
  const today = localMeasurementDate(new Date(), timezone), from = args.from ?? addCalendarDays(today, -30), to = args.to ?? addCalendarDays(today, 90);
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
  if (!valid(from) || !valid(to) || from > to) throw new ApiError(400, 'invalid_input', '请选择有效日期范围。');
  const snapshot = await readTraining(db, identity.userId, { from, to }), inRange = (item: { date: string }) => item.date >= from && item.date <= to;
  return { context: { localDate: today, timezone, from, to }, templates: snapshot.templates, plans: snapshot.plans.filter(inRange), sessions: snapshot.sessions.filter(inRange), requiresWebConfirmation: true };
}

export async function queryTrainingPage(db: Database, identity: AiIdentity, params: URLSearchParams) {
  await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, 'training');
  const timezone = params.get('timezone') ?? process.env.FORMWARD_TIMEZONE ?? 'Asia/Shanghai';
  if (!timezoneSchema.safeParse(timezone).success) throw new ApiError(400, 'invalid_input', '时区不正确。');
  const today = localMeasurementDate(new Date(), timezone), query = boundedQueryPage(params, today);
  const snapshot = await readTraining(db, identity.userId, { from: query.from, to: query.end });
  return { context: { localDate: today, timezone }, range: { from: query.from, to: query.to }, page: query.page, view: query.view,
    templates: query.view === 'details' ? snapshot.templates : snapshot.templates.map(template => ({ id: template.id, version: template.version, name: template.name })),
    plans: query.view === 'details' ? snapshot.plans : snapshot.plans.map(plan => ({ id: plan.id, version: plan.version, date: plan.date, status: plan.status, templateId: plan.templateId })),
    sessions: query.view === 'details' ? snapshot.sessions : snapshot.sessions.map(session => ({ id: session.id, version: session.version, date: session.date, name: session.name, status: session.status, elapsedSeconds: session.elapsedSeconds })),
    requiresWebConfirmation: true, rules: '模板是可复用目标，plans是计划，sessions才是实际训练；不据此自动生成全天消耗。修改模板与排期先读取details。page.hasMore时继续读取下一段。' };
}
