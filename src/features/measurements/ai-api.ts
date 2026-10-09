import type { Database } from "../../db/client";
import { ApiError, authenticateAi, type AiIdentity } from "../auth/ai-tokens";
import { listMeasurements } from "./records";
import { listMeasurementDates, measurementDisplay } from "./editing";
import { listMeasurementSources } from "./sources";
import { buildMeasurementDays } from "./days";
import { measurementSummary } from "./summary";
import { calendarOrdinal, measurementTrend, metricDifference } from "./trend";
import { estimateUserExplanation } from "./estimate-explanation";
import { systemMeasurementTimezone, timezoneLabel, validateMeasurementTimezone } from "./timezone";
import { localMeasurementDate } from "./entry-state";

export function aiRequestTimezone(request: Request) {
  const timezone = request.headers.get("x-formward-timezone") ?? systemMeasurementTimezone();
  validateMeasurementTimezone(timezone);
  return timezone;
}

export function safeAiError(error: unknown) {
  if (error instanceof ApiError) return { status: error.status, error: { code: error.code, message: error.message } };
  if (error instanceof Error && !["query", "code", "cause"].some(key => key in error)) return { status: 400, error: { code: "invalid_input", message: error.message } };
  return { status: 500, error: { code: "unavailable", message: "操作未完成，请稍后重试。" } };
}
export async function aiApiResponse(request: Request, db: Database, write: boolean, work: (identity: AiIdentity) => Promise<unknown>) {
  const responseHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    const identity = await authenticateAi(db, request.headers.get("authorization"), write);
    return Response.json(await work(identity), { headers: responseHeaders });
  } catch (error) {
    const failure = safeAiError(error);
    return Response.json({ error: failure.error }, { status: failure.status, headers: { ...responseHeaders, ...(failure.status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } });
  }
}
export function aiConfirmationUrl(request: Request, path: string) {
  // Next 的内部 request.url 可能使用 localhost；保留实际请求 Host，避免丢失 127.0.0.1 的会话。
  const url = new URL(request.url);
  url.host = request.headers.get("host") ?? url.host;
  return new URL(path, url).href;
}
export async function readAiJson(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new ApiError(415, "invalid_input", "请使用 application/json。");
  const chunks: Uint8Array[] = [], reader = request.body?.getReader();
  let bytes = 0;
  if (!reader) throw new ApiError(400, "invalid_input", "缺少 JSON 请求内容。");
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 65536) { await reader.cancel(); throw new ApiError(413, "invalid_input", "单次操作内容超过 64 KiB。"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new ApiError(400, "invalid_input", "JSON 格式无效。"); }
}
export async function queryAiMeasurements(db: Database, userId: string, params: URLSearchParams, timezone = systemMeasurementTimezone()) {
  validateMeasurementTimezone(timezone);
  if ([...params.keys()].some(key => !["from", "to", "choices"].includes(key)) || ["from", "to", "choices"].some(key => params.getAll(key).length > 1)) throw new ApiError(400, "invalid_input", "查询仅支持 from、to 和 choices。");
  const from = params.get("from"), to = params.get("to");
  if (from) calendarOrdinal(from); if (to) calendarOrdinal(to);
  if (from && to && from > to) throw new ApiError(400, "invalid_input", "日期区间无效。");
  const all = (await listMeasurements(db, userId)).map(measurementDisplay), dates = await listMeasurementDates(db, userId), sources = await listMeasurementSources(db, userId);
  let choices: Record<string, string> = {};
  if (params.has("choices")) {
    try { choices = JSON.parse(params.get("choices")!); } catch { throw new ApiError(400, "invalid_input", "choices 须为 JSON 对象。"); }
    if (!choices || Array.isArray(choices) || typeof choices !== "object" || Object.entries(choices).some(([key, id]) => typeof id !== "string" || !all.some(row => row.recordKind === "observed" && row.id === id && key === `${row.recordDate}:${row.period}`))) throw new ApiError(400, "invalid_input", "候选须来自本账号对应日期时段的实测。");
  }
  const visible = (date: string) => (!from || date >= from) && (!to || date <= to), records = all.filter(row => visible(row.recordDate));
  const analyses = Object.fromEntries((["weightKg", "bodyFatPercent"] as const).map(metric => [metric, {
    summary: measurementSummary(all, metric, choices), trend: measurementTrend(records, metric, true, choices),
    days: buildMeasurementDays(records, choices, metric, dates.filter(row => visible(row.date)).map(row => row.date)).map(day => ({ date: day.date, needsSelection: day.needsSelection, daytime: day.daytimeRecord, evening: day.eveningRecord, candidates: { daytime: day.daytime, evening: day.evening }, difference: metricDifference(day.daytimeRecord, day.eveningRecord, metric) })),
  }]));
  return { context: { timezone, timezoneLabel: timezoneLabel(timezone), localDate: localMeasurementDate(new Date(), timezone) }, units: { weightKg: "kg", bodyFatPercent: "%", bodyFatDifference: "percentage_points" }, range: { from, to }, records: records.map(row => ({ ...row, estimateExplanation: row.estimation ? { weightKg: estimateUserExplanation(row.estimation, row.recordDate, "weightKg"), bodyFatPercent: estimateUserExplanation(row.estimation, row.recordDate, "bodyFatPercent") } : null })), dates: dates.filter(row => visible(row.date)), sources, analyses,
    rules: "晨间只接受明确空腹实测；摘要仅统计实测。多候选须明确选择，choices 仅影响本次查询。未知值为 null。" };
}
