import { z } from "zod";
import type { Database } from "../../db/client";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { aiDate, aiOperationId, resolveAiDate } from "../meals/ai-preview";
import { decimal } from "../meals/model";
import { digest } from "../meals/records";
import { publicRecordInputSchema } from "../records/model";
import { submitRecordOperation } from "../records/operations";

const identity = { id: z.string().uuid().optional(), version: z.number().int().positive().optional() };
const amount = decimal.nullable().optional();
const activity = z.object({
  ...identity, name: z.string().trim().min(1).max(200),
  durationMinutes: amount, caloriesKcal: amount,
  calorieMode: z.enum(["total", "components"]).optional(),
  exerciseRestingKcal: amount, exerciseActiveKcal: amount,
  inclusion: z.enum(["included", "additional"]).optional().describe("只按用户确认表达；不知道则省略，由网页核对"),
  sourceSystem: z.string().max(200).optional(),
}).strict();
export const energyPreviewSchema = z.object({
  operationId: aiOperationId, date: aiDate, timezone: z.string().max(100).optional(),
  dayId: z.string().uuid().optional(), dayVersion: z.number().int().positive().optional(),
  entryMode: z.enum(["total", "components"]).optional(),
  totalKcal: amount, restingKcal: amount, activeKcal: amount,
  activityMode: z.enum(["total", "activities"]).optional(),
  steps: z.number().int().min(0).max(10000000).nullable().optional(),
  sourceSystem: z.string().max(200).nullable().optional(),
  restingSourceSystem: z.string().max(200).nullable().optional(),
  activeSourceSystem: z.string().max(200).nullable().optional(),
  restingEstimated: z.boolean().optional(), activeEstimated: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  activities: z.array(activity).max(50).optional().describe("只记录实际完成的运动；计划排期使用训练工具"),
}).strict();
export type EnergyPreviewInput = z.infer<typeof energyPreviewSchema>;
export function energyPreviewOperation(raw: EnergyPreviewInput, now = new Date()) {
  const parsed = energyPreviewSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "invalid_input", "请检查消耗日期、方式及数值，未知留空，明确零填0。");
  const { operationId, date, timezone, dayId, dayVersion, activities = [], ...values } = parsed.data;
  const resolved = resolveAiDate(date, timezone, now);
  const dayFields = Object.values(values).some(value => value !== undefined);
  if (Boolean(dayId) !== (dayVersion !== undefined)) throw new ApiError(400, "invalid_input", "修改日消耗须同时提供dayId及dayVersion。");
  if (values.totalKcal !== undefined && (values.restingKcal !== undefined || values.activeKcal !== undefined)) throw new ApiError(400, "invalid_input", "总数和分项不能混填，请按实际来源选择一种。");
  const items = [
    ...(dayFields || dayId ? [{ key: "day", kind: "save_energy_day", ...resolved, ...values, ...(dayId ? { id: dayId, version: dayVersion } : {}), ...(values.entryMode === undefined && !dayId ? { entryMode: values.totalKcal !== undefined ? "total" : "components" } : {}), ...(values.activityMode === undefined && !dayId ? { activityMode: values.activeKcal !== undefined ? "total" : "activities" } : {}) }] : []),
    ...activities.map((item, index) => {
      if (Boolean(item.id) !== (item.version !== undefined)) throw new ApiError(400, "invalid_input", "修改运动须同时提供id及version。");
      return { key: "activity-" + index, kind: "save_activity", ...resolved, ...item, ...(!item.id && item.calorieMode === undefined ? { calorieMode: item.exerciseActiveKcal !== undefined || item.exerciseRestingKcal !== undefined ? "components" : "total" } : {}), completed: true };
    }),
  ];
  const result = publicRecordInputSchema.safeParse({ operationId, timezone: resolved.timezone, items });
  if (!result.success) throw new ApiError(400, "invalid_input", "至少提供一项全天消耗或实际运动，并检查各字段。");
  return result.data;
}
export async function previewEnergy(db: Database, identity: AiIdentity, raw: EnergyPreviewInput, now = new Date()) {
  const input = energyPreviewSchema.parse(raw);
  return submitRecordOperation(db, identity, energyPreviewOperation(input, now), undefined, { requestDigest: digest({ tool: "preview_energy", input }) });
}
