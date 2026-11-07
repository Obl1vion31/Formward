import type { Database } from '../../db/client';
import { requireActiveAiToken } from '../auth/ai-tokens';
import type { AiIdentity } from '../auth/ai-identity';
import { ApiError } from '../auth/ai-identity';
import { localMeasurementDate } from '../measurements/entry-state';
import { addCalendarDays } from '../measurements/calendar';
import { timezoneSchema } from './model';
import { readTraining } from './records';
export async function queryTraining(db: Database, identity: AiIdentity, args: { from?: string; to?: string; timezone?: string }) {
  await requireActiveAiToken(db as unknown as Parameters<typeof requireActiveAiToken>[0], identity, false, 'training');
  const timezone = args.timezone ?? process.env.FORMWARD_TIMEZONE ?? 'Asia/Shanghai';
  if (!timezoneSchema.safeParse(timezone).success) throw new ApiError(400, 'invalid_input', '时区不正确。');
  const today = localMeasurementDate(new Date(), timezone), from = args.from ?? addCalendarDays(today, -30), to = args.to ?? addCalendarDays(today, 90);
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
  if (!valid(from) || !valid(to) || from > to) throw new ApiError(400, 'invalid_input', '请选择有效日期范围。');
  const snapshot = await readTraining(db, identity.userId), inRange = (item: { date: string }) => item.date >= from && item.date <= to;
  return { context: { localDate: today, timezone, from, to }, templates: snapshot.templates, plans: snapshot.plans.filter(inRange), sessions: snapshot.sessions.filter(inRange), requiresWebConfirmation: true };
}
