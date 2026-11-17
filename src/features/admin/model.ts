import { z } from "zod";
import { ApiError } from "../auth/ai-identity";
import { securityDay } from "../auth/security-time";

export const adminFilterSchema = z.object({ from: z.string().optional(), to: z.string().optional(), userId: z.string().min(1).max(128).optional(), provider: z.enum(["qwen", "mimo", "glm"]).optional(), purpose: z.enum(["chat", "meal_entry"]).optional(), search: z.string().max(100).optional(), sort: z.enum(["cost", "requests", "records", "email"]).default("cost"), page: z.number().int().min(1).max(200).default(1) }).strict();
export type AdminFilter = z.input<typeof adminFilterSchema>;
export function normalizeAdminFilter(input: AdminFilter, now = new Date()) {
  const parsed = adminFilterSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "invalid_filter", "筛选条件无效。");
  const to = parsed.data.to ?? securityDay(now), from = parsed.data.from ?? shiftDate(to, -29);
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
  if (!valid(from) || !valid(to) || from > to || to > securityDay(now) || Date.parse(to) - Date.parse(from) > 365 * 86400000) throw new ApiError(400, "invalid_filter", "请选择今天及以前、最长366天的有效日期区间。");
  return { ...parsed.data, from, to, search: parsed.data.search?.trim() ?? "" };
}
export function shiftDate(value: string, days: number) { const date = new Date(value + "T00:00:00Z"); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function adminMoney(value: string | number | null) {
  if (value === null) return "未知";
  const number = Number(value); if (!Number.isFinite(number)) return "未知";
  return number > 0 && number < .0001 ? "小于0.0001" : number.toFixed(4);
}
export function adminCurrency(value:string|number|null){const formatted=adminMoney(value);return formatted==="未知"?formatted:formatted.startsWith("小于")?formatted+"元":"¥"+formatted;}
export type CostMetrics = { spent: string; reserved: string; uncertain: string; requests: number; input: string | null; cached: string | null; output: string | null; unknownUsage: number };
export const emptyCost = (): CostMetrics => ({ spent: "0", reserved: "0", uncertain: "0", requests: 0, input: "0", cached: "0", output: "0", unknownUsage: 0 });
export type RecordCount = { kind: string; total: number; added: number; bytes: string };
