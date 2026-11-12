import { aiToolForHttp, withAiFieldDefinitions } from "../records/ai-field-definitions";
import { currentMeasurementFacts } from "./retirement";
import {adoptedMeasurements} from "./days";
import type { Database } from "../../db/client";
import { ApiError, authenticateAi, type AiIdentity } from "../auth/ai-tokens";
import { confirmationPageUrl } from "../auth/web-entry";
import { listMeasurements } from "./records";
import { listMeasurementDates, measurementDisplay } from "./editing";
import { listMeasurementSources, MeasurementSourceError } from "./sources";
import { buildMeasurementDays } from "./days";
import { measurementSummary, measurementSummaryAt } from "./summary";
import { calendarOrdinal, measurementTrend, metricDifference } from "./trend";
import { systemMeasurementTimezone, timezoneLabel, validateMeasurementTimezone } from "./timezone";
import { localMeasurementDate } from "./entry-state";
import { boundedQueryPage } from "../records/ai-query";
import { addCalendarDays } from "./calendar";
import { z } from "zod";
import { invalidAiSchema } from "../records/ai-errors";

export function aiRequestTimezone(request: Request, configuredTimezone = process.env.FORMWARD_TIMEZONE) {
  const timezone = request.headers.get("x-formward-timezone") ?? systemMeasurementTimezone(new Date(), configuredTimezone);
  validateMeasurementTimezone(timezone);
  return timezone;
}

export function safeAiError(error: unknown) {
  if (error instanceof z.ZodError) { try { invalidAiSchema(error); } catch (formatted) { return safeAiError(formatted); } }
  if (error instanceof MeasurementSourceError) return { status: 400, error: { code: error.code, message: error.message } };
  if (error instanceof ApiError) return { status: error.status, error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } };
  if (error instanceof Error && !["query", "code", "cause"].some(key => key in error)) return { status: 400, error: { code: "invalid_input", message: error.message } };
  return { status: 500, error: { code: "unavailable", message: "操作未完成，请稍后重试。" } };
}
export async function aiApiResponse(request: Request, db: Database, write: boolean, work: (identity: AiIdentity) => Promise<unknown>) {
  const responseHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    const identity = await authenticateAi(db, request.headers.get("authorization"), write);
    const data = await work(identity), tool = aiToolForHttp(request);
    return Response.json(tool && data !== null && typeof data === "object" && !Array.isArray(data) ? withAiFieldDefinitions(tool, data as Record<string, unknown>) : data, { headers: responseHeaders });
  } catch (error) {
    const failure = safeAiError(error);
    return Response.json({ error: failure.error }, { status: failure.status, headers: { ...responseHeaders, ...(failure.status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } });
  }
}
export function aiConfirmationUrl(request: Request, path: string) {
  return confirmationPageUrl(request, path);
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
  const raw=await listMeasurements(db,userId);
  const all = adoptedMeasurements(raw).map(measurementDisplay), dates = await listMeasurementDates(db, userId), sources = await listMeasurementSources(db, userId);
  let choices: Record<string, string> = {};
  if (params.has("choices")) {
    try { choices = JSON.parse(params.get("choices")!); } catch { throw new ApiError(400, "invalid_input", "choices 须为 JSON 对象。"); }
    if (!choices || Array.isArray(choices) || typeof choices !== "object" || Object.entries(choices).some(([key, id]) => typeof id !== "string" || !raw.some(row => row.recordKind === "observed" && row.id === id && key === `${row.recordDate}:${row.period}`))) throw new ApiError(400, "invalid_input", "候选须来自本账号对应日期时段的实测。");
  }
  choices={};
  const visible = (date: string) => (!from || date >= from) && (!to || date <= to), records = all.filter(row => visible(row.recordDate));
  const analyses = Object.fromEntries((["weightKg", "bodyFatPercent"] as const).map(metric => [metric, {
    summary: { ...measurementSummary(all.filter(row=>row.recordDate<=localMeasurementDate(new Date(),timezone)), metric, choices), scope: "latest_available_seven_days" as const }, trend: measurementTrend(records, metric, true, choices),
    days: buildMeasurementDays(records, choices, metric, dates.filter(row => visible(row.date)).map(row => row.date)).map(day => ({ date: day.date, needsSelection: day.needsSelection, daytime: day.daytimeRecord, evening: day.eveningRecord, candidates: { daytime: day.daytime, evening: day.evening }, difference: metricDifference(day.daytimeRecord, day.eveningRecord, metric) })),
  }]));
  return currentMeasurementFacts({ context: { timezone, timezoneLabel: timezoneLabel(timezone), localDate: localMeasurementDate(new Date(), timezone) }, units: { weightKg: "kg", bodyFatPercent: "%", bodyFatDifference: "percentage_points" }, range: { from, to }, records, dates: dates.filter(row => visible(row.date)), sources, analyses,
    rules: "晨间只接受明确空腹实测；摘要仅统计实测。同一天晨间／晚间各采用最后保存的一条实测，新录入覆盖已有值，未知字段保留；未来身体日期禁止写入。未知值为 null。测量来源须由用户提供；未提供先询问补填或明确留空，不能用 ChatGPT／手动提供／设备未注明等代填。sources 只供用户选择，不擅自沿用；明确留空使用 deviceLabel:null 和 sourceUnspecifiedConfirmed:true。" });
}

/** 新摘要不混入当前最新读数；七日统计明确锚定本页结束日期。 */
export async function queryAiMeasurementPage(db: Database, userId: string, params: URLSearchParams, timezone = systemMeasurementTimezone()) {
  validateMeasurementTimezone(timezone);
  if ([...params.keys()].some(key => !["from", "to", "view", "timezone"].includes(key)) || ["from", "to", "view", "timezone"].some(key => params.getAll(key).length > 1)) throw new ApiError(400, "invalid_input", "身体摘要仅支持日期、view和timezone。");
  const today = localMeasurementDate(new Date(), timezone), query = boundedQueryPage(params, today);
  const lookback = Array.from({ length: 6 }, (_, index) => addCalendarDays(query.from, -6 + index));
  const raw = await listMeasurements(db, userId, [...lookback, ...query.dates]);
  const all = adoptedMeasurements(raw).map(measurementDisplay), records = all.filter(record => record.recordDate >= query.from);
  const days = buildMeasurementDays(records, {}, "weightKg", query.dates).map(day => ({
    date: day.date,
    daytime: day.daytimeRecord ? { weightKg: day.daytimeRecord.weightKg, bodyFatPercent: day.daytimeRecord.bodyFatPercent } : null,
    evening: day.eveningRecord ? { weightKg: day.eveningRecord.weightKg, bodyFatPercent: day.eveningRecord.bodyFatPercent } : null,
  }));
  return currentMeasurementFacts({
    context: { timezone, localDate: today }, range: { from: query.from, to: query.to }, page: query.page, view: query.view,
    units: { weightKg: "kg", bodyFatPercent: "%", bodyFatDifference: "percentage_points" },
    days,
    sevenDay: { scope: "seven_days_ending_on_page_to", anchorDate: query.end,
      window: { from: addCalendarDays(query.end, -6), to: query.end },
      weightKg: measurementSummaryAt(all, "weightKg", query.end), bodyFatPercent: measurementSummaryAt(all, "bodyFatPercent", query.end) },
    ...(query.view === "details" ? { records, sources: [...new Set(records.map(record => record.deviceLabel).filter((source): source is string => !!source))] } : {}),
    rules: "仅实测；每天每时段采用最后保存值，缺测为null。sevenDay按本页结束日及前六天统计，可能读取区间前最多六天作统计，不冒充整段平均或当前最新。修改用details的id/updatedAt版本，来源仍需用户明确提供或确认留空。page.hasMore时继续读取下一段。",
  });
}
