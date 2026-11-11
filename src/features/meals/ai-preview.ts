import { z } from "zod";
import type { Database } from "../../db/client";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { localMeasurementDate } from "../measurements/entry-state";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { validateMeasurementTimezone } from "../measurements/timezone";
import { decimal, emptyNutrition, metrics, publicMealInputSchema, scaled, type ItemDraft, type MealInput, type Nutrition } from "./model";
import { digest, submitMealOperation } from "./records";

const text = (length: number) => z.string().trim().min(1).max(length);
export const aiOperationId = z.string().regex(/^[a-zA-Z0-9-]{8,120}$/).describe("新请求生成新UUID；仅ASCII字母、数字、半角短横线(-)，8至120字符，不能用中文或其他横线；同请求重试沿用，改变内容用新标识");
export const aiDate = z.string().describe("YYYY-MM-DD或today/yesterday；由服务器按timezone解析相对日期");
export const simpleFoodSchema = z.object({
  name: text(200),
  kind: z.enum(["food", "misc", "whole"]).optional().describe("通常省略；misc只代表未单列的剩余食物，whole只能独占整餐"),
  quantity: decimal.optional().describe("实际食用量；数值字符串，不带单位"),
  unit: text(30).optional(),
  foodId: z.string().uuid().optional(),
  foodVersion: z.number().int().positive().optional(),
  nutritionBasis: z.enum(["consumed_total", "per_portion", "per_reference"]).optional().describe("省略为本次总量；per_portion每份，per_reference每referenceQuantity同单位的营养"),
  referenceQuantity: decimal.optional().describe("如每100g填100；单位与实际食用量一致"),
  caloriesKcal: z.string().optional().describe("本次热量kcal；可靠值优先，否则按记餐规则默认估算；明确不估或无合理依据时省略"),
  caloriesKj: decimal.optional().describe("仅包装提供kJ时使用；不能同时填caloriesKcal"),
  proteinG: z.string().optional().describe("本次蛋白质g；通常与热量及其他宏量一起估算，可靠值及明确0保留，未知省略"),
  carbsG: z.string().optional().describe("本次碳水g；通常与热量及其他宏量一起估算，可靠值及明确0保留，未知省略"),
  fatG: z.string().optional().describe("本次脂肪g；通常与热量及其他宏量一起估算，可靠值及明确0保留，未知省略"),
  sourceKind: z.string().optional().describe("label/composition_table/reference/estimated/unknown；来源未知可用unknown，不编造依据"),
  basis: z.string().trim().max(4000).optional().describe("估算须说明实际食量、参考规格或组成与不确定性；区分用户给定值和估算项"),
  evidenceUrl: z.string().url().max(2000).optional(),
  amountDecision: z.enum(["provided", "estimate_accepted", "unknown_accepted"]).optional().describe("只表达食量决策；默认估算营养不等于已接受食量估算，后者须用户明确同意"),
}).strict();
export const mealPreviewSchema = z.object({
  operationId: aiOperationId, date: aiDate, mealType: text(50).describe("按用户指定名称填写；中午写午餐，不能自行换成lunch或snack；修改已有餐保留原餐次"),
  foods: z.array(simpleFoodSchema).min(1).max(50),
  timezone: text(100).optional(), notes: z.string().max(12000).optional(),
  imageIds: z.array(z.string().uuid()).max(8).optional(),
  expectedImageCount: z.number().int().min(0).max(8).optional(),
}).strict();
export type MealPreviewInput = z.infer<typeof mealPreviewSchema>;
export type SimpleFoodInput = z.infer<typeof simpleFoodSchema>;

export function invalidAiInput(field: string, message: string): never {
  throw new ApiError(400, "invalid_input", field + "：" + message);
}
export function resolveAiDate(date: string, timezone?: string, now = new Date()) {
  const zone = timezone ?? process.env.FORMWARD_TIMEZONE ?? "Asia/Shanghai";
  validateMeasurementTimezone(zone);
  const relative = ({ today: 0, "今天": 0, yesterday: 1, "昨天": 1 } as Record<string, number>)[date.trim().toLowerCase()];
  const resolved = relative === undefined ? date : addCalendarDays(localMeasurementDate(now, zone), -relative);
  calendarOrdinal(resolved);
  return { date: resolved, timezone: zone };
}
function nutrient(value: string | undefined, calories: boolean): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  const result = (calories ? /^(\d+(?:\.\d+)?)\s*(?:kcal|千卡)$/i : /^(\d+(?:\.\d+)?)\s*(?:g|克)$/i).exec(trimmed)?.[1] ?? trimmed;
  if (!decimal.safeParse(result).success) invalidAiInput("营养", "请使用不带单位的有效十进制字符串；未知省略，明确零填写0。");
  return result;
}
export function normalizeSimpleFood(raw: SimpleFoodInput, index = 0): ItemDraft {
  const input = simpleFoodSchema.parse(raw), field = "foods." + index;
  const library = input.foodId !== undefined, kind = input.kind ?? "food";
  const source = input.sourceKind?.trim().toLowerCase();
  const sourceKind = ({ package_label: "label", nutrition_label: "label", "包装标签": "label", "营养标签": "label" } as Record<string, string>)[source ?? ""] ?? source ?? "unknown";
  const hasNutrition = metrics.some(metric => input[metric] !== undefined) || input.caloriesKj !== undefined;
  if (input.foodVersion !== undefined && !library) invalidAiInput(field, "foodVersion须与foodId一起使用。");
  if (library && input.foodVersion === undefined) invalidAiInput(field + ".foodVersion", "请先搜索并填写食材版本。");
  if (library && (hasNutrition || input.sourceKind !== undefined || input.nutritionBasis !== undefined || input.referenceQuantity !== undefined || input.evidenceUrl !== undefined)) invalidAiInput(field, "引用食材后由服务器换算，不另填营养、来源或计算口径。");
  if (input.amountDecision === "unknown_accepted") {
    if (input.quantity !== undefined || input.nutritionBasis && input.nutritionBasis !== "consumed_total") invalidAiInput(field, "食量未知时不能按份量换算。");
    if (library && !input.unit) invalidAiInput(field + ".unit", "引用食材仍须保留规格单位；数量保持未知。");
  } else if (!input.quantity || !input.unit || Number(input.quantity) <= 0) invalidAiInput(field, "请提供实际食用量及单位；仅在用户明确食量未知时使用unknown_accepted。");
  if (sourceKind === "estimated" && hasNutrition && !input.basis?.trim()) invalidAiInput(field + ".basis", "请说明估算组成、食用量和不确定性。");
  if (input.caloriesKcal !== undefined && input.caloriesKj !== undefined) invalidAiInput(field, "热量只填写kcal或kJ其中一种。");
  const base = {
    kind, name: input.name, quantity: input.quantity ?? null, unit: input.unit,
    amountDecision: input.amountDecision, foodId: input.foodId, foodVersion: input.foodVersion,
    sourceKind, basis: input.basis, evidenceUrl: input.evidenceUrl,
  };
  if (library) return base as ItemDraft;
  let nutrition: Nutrition = { ...emptyNutrition(), ...Object.fromEntries(metrics.map(metric => [metric, nutrient(input[metric], metric === "caloriesKcal")])) };
  if (input.caloriesKj !== undefined) nutrition.caloriesKcal = scaled(input.caloriesKj, "1000", "4184");
  const nutritionBasis = input.nutritionBasis ?? "consumed_total";
  if (hasNutrition && ["label", "composition_table"].includes(sourceKind) && !base.basis && !base.evidenceUrl) {
    const scope = nutritionBasis === "per_portion" ? "每1" + (input.unit ?? "份") : nutritionBasis === "per_reference" ? "每" + input.referenceQuantity + (input.unit ?? "") : "本次食用" + (input.quantity ?? "未知量") + (input.unit ?? "");
    base.basis = (sourceKind === "label" ? "营养标签" : "成分表") + "转录（按本次提交字段）：" + scope + "，" + metrics.map(metric => metric + "=" + (nutrition[metric] ?? "未知")).join("，") + (input.caloriesKj !== undefined ? "；原热量" + input.caloriesKj + "kJ，由服务器换为kcal。" : "。");
  }
  if (nutritionBasis !== "per_reference" && input.referenceQuantity !== undefined) invalidAiInput(field, "referenceQuantity仅用于per_reference。");
  if (nutritionBasis === "per_portion") return { ...base, nutritionBasis, perPortionNutrition: nutrition } as ItemDraft;
  if (nutritionBasis === "per_reference") {
    if (!input.referenceQuantity || Number(input.referenceQuantity) <= 0 || !input.quantity || !input.unit) invalidAiInput(field, "按参考量换算须提供正数referenceQuantity及同单位实际食用量。");
    const original = metrics.map(metric => metric + "=" + (nutrition[metric] ?? "未知")).join("，");
    const basis = "每" + input.referenceQuantity + input.unit + "：" + original + "；实际" + input.quantity + input.unit + "，由服务器按比例换算。" + (input.basis ?? "");
    if (basis.length > 4000) invalidAiInput(field + ".basis", "换算依据过长，请缩短原说明。");
    nutrition = Object.fromEntries(metrics.map(metric => [metric, nutrition[metric] === null ? null : scaled(nutrition[metric]!, input.quantity!, input.referenceQuantity!)])) as Nutrition;
    return { ...base, basis, nutritionBasis: "consumed_total", nutrition } as ItemDraft;
  }
  return { ...base, nutritionBasis, nutrition } as ItemDraft;
}
export function mealPreviewOperation(raw: MealPreviewInput, now = new Date()): MealInput {
  const parsed = mealPreviewSchema.safeParse(raw);
  if (!parsed.success) invalidAiInput("参数", "请按单餐格式提供日期、餐次及食物清单。");
  const { foods, operationId, ...meal } = parsed.data;
  const input = { operationId, actions: [{ ...meal, ...resolveAiDate(meal.date, meal.timezone, now), kind: "save_meal", items: foods.map(normalizeSimpleFood) }] };
  const result = publicMealInputSchema.safeParse(input);
  if (!result.success) invalidAiInput("餐次", result.error.issues[0]?.message ?? "内容无效。");
  return result.data;
}
export async function previewMeal(db: Database, identity: AiIdentity, raw: MealPreviewInput, now = new Date()) {
  const input = mealPreviewSchema.parse(raw);
  // 原始相对日期参与幂等摘要：跨零点重试仍返回首次创建的预览。
  return submitMealOperation(db, { userId: identity.userId, origin: "ai", identity }, mealPreviewOperation(input, now), undefined, { requestDigest: digest({ tool: "preview_meal", input }) });
}
