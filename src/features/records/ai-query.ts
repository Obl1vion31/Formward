import { z } from "zod";
import { ApiError } from "../auth/ai-identity";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { localMeasurementDate } from "../measurements/entry-state";
import { validateMeasurementTimezone } from "../measurements/timezone";

export const queryOptions = {
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  range: z.enum(["today", "yesterday", "last7", "last30"]).optional().describe("相对日期由服务器解析；不能与from/to混用"),
  timezone: z.string().optional(),
  view: z.enum(["summary", "details"]).optional().describe("summary取分析所需摘要，details取带id/version的明细；省略兼容旧完整返回"),
};
/** 统一日期输入与显式分段，健康汇总仍由各feature执行。 */
export function queryParameters(args: { from?: string; to?: string; range?: string; timezone?: string; view?: string }, now = new Date()) {
  const timezone = args.timezone ?? process.env.FORMWARD_TIMEZONE ?? "Asia/Shanghai";
  validateMeasurementTimezone(timezone);
  let { from, to } = args;
  if (args.range) {
    if (from || to) throw new ApiError(400, "invalid_input", "range与from/to不能混用。");
    to = localMeasurementDate(now, timezone);
    if (args.range === "yesterday") to = addCalendarDays(to, -1);
    from = addCalendarDays(to, args.range === "last30" ? -29 : args.range === "last7" ? -6 : 0);
  }
  return new URLSearchParams(Object.entries({ from, to, timezone, view: args.view ?? (args.range ? "summary" : undefined) }).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
export function boundedQueryPage(params: URLSearchParams, today: string, defaultDays = 30) {
  const view = params.get("view");
  if (view !== "summary" && view !== "details") throw new ApiError(400, "invalid_input", "view只支持summary或details。");
  const to = params.get("to") ?? today, from = params.get("from") ?? addCalendarDays(to, 1 - defaultDays);
  const length = calendarOrdinal(to) - calendarOrdinal(from) + 1;
  if (length < 1 || length > 3661) throw new ApiError(400, "invalid_input", "日期区间无效，最长10年。");
  const end = addCalendarDays(from, Math.min(length, view === "summary" ? 366 : 50) - 1);
  const dates = Array.from({ length: calendarOrdinal(end) - calendarOrdinal(from) + 1 }, (_, index) => addCalendarDays(from, index));
  return { view, from, to, end, dates, page: { from, to: end, hasMore: end < to, nextFrom: end < to ? addCalendarDays(end, 1) : null } };
}
