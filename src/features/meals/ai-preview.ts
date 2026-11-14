import { z } from "zod";
import type { Database } from "../../db/client";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { localMeasurementDate } from "../measurements/entry-state";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { validateMeasurementTimezone } from "../measurements/timezone";
import { decimal, emptyNutrition, metrics, publicMealInputSchema, scaled, type ItemDraft, type MealInput, type Nutrition } from "./model";
import { digest, submitMealOperation } from "./records";
import { invalidAiSchema } from "../records/ai-errors";

const text = (length: number) => z.string().trim().min(1).max(length);
export const aiOperationId = z.string().regex(/^[a-zA-Z0-9-]{8,120}$/).describe("独立新任务生成新UUID；仅ASCII字母、数字、半角短横线(-)，8至120字符，不能用中文或其他横线。同任务创建及重试沿用原编号；修改已有草稿用update_preview及新的修改编号，不另建批次");
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
  caloriesKcal: z.string().optional().describe("热量kcal数值字段，不能只写进basis；consumed_total填本次总量，per_portion填每份，per_reference填参考量；后两者由服务器换算。明确不估或无依据可省略"),
  caloriesKj: decimal.optional().describe("仅包装提供kJ时使用；不能同时填caloriesKcal"),
  proteinG: z.string().optional().describe("蛋白质g数值字段，按nutritionBasis填写本次／每份／参考量，与热量同口径；可靠值及明确0保留，未知省略；不能只写basis"),
  carbsG: z.string().optional().describe("碳水g数值字段，按nutritionBasis填写本次／每份／参考量，与热量同口径；可靠值及明确0保留，未知省略；不能只写basis"),
  fatG: z.string().optional().describe("脂肪g数值字段，按nutritionBasis填写本次／每份／参考量，与热量同口径；可靠值及明确0保留，未知省略；不能只写basis"),
  sourceKind: z.string().optional().describe("label/composition_table/reference/estimated/unknown；来源未知可用unknown，不编造依据"),
  basis: z.string().trim().max(4000).optional().describe("仅存依据，不能代替营养数值字段；分清用户实际提供的食量与假设的参考规格，不能把中等大小或估算克重说成用户提供；每份／参考量由服务器换算，不再另算一套总量"),
  evidenceUrl: z.string().url().max(2000).optional(),
  amountDecision: z.enum(["provided", "estimate_accepted", "unknown_accepted"]).optional().describe("只表达食量决策；默认估算营养不等于已接受食量估算，后者须用户明确同意"),
}).strict();
// 展示给模型的结构也表达互斥关系，不只依赖长段说明。
const libraryFood = simpleFoodSchema.pick({ name: true, kind: true, foodId: true, foodVersion: true, quantity: true, unit: true, basis: true, amountDecision: true }).extend({
  foodId: z.string().uuid(), foodVersion: z.number().int().positive(),
  nutritionBasis: z.literal("consumed_total").optional().describe("兼容旧请求的无效重复标记；引用食材的营养始终由服务器换算，请省略"),
}).strict();
const freeFood = simpleFoodSchema.omit({ foodId: true, foodVersion: true }).strict();
export const aiFoodSchema = z.union([
  libraryFood.extend({ quantity: decimal, unit: text(30), amountDecision: z.enum(["provided", "estimate_accepted"]).optional() }),
  freeFood.extend({ quantity: decimal, unit: text(30), amountDecision: z.enum(["provided", "estimate_accepted"]).optional() }),
  libraryFood.omit({ quantity: true }).extend({ unit: text(30), amountDecision: z.literal("unknown_accepted") }),
  freeFood.omit({ quantity: true }).extend({ amountDecision: z.literal("unknown_accepted"), nutritionBasis: z.literal("consumed_total").optional() }).describe("自由食物也允许用户明确保留食量未知：name及amountDecision=unknown_accepted即可；省略quantity，单位和营养未知也省略，不传null或空字符串。不是只有库食材才可留空。"),
]).describe("二选一：引用食材库（foodId＋foodVersion＋实际食量＋单位，不传营养或来源）；自由填写（实际食量＋单位，可给营养及估算依据）。库食材和自由食物都支持用户明确接受食量未知：unknown_accepted并省略quantity，不写null或空字符串，不要求补猜数量。");
export const mealPreviewSchema = z.object({
  operationId: aiOperationId, date: aiDate, mealType: text(50).describe("按用户指定名称填写；中午写午餐，不能自行换成lunch或snack；修改已有餐保留原餐次"),
  foods: z.array(aiFoodSchema).min(1).max(50),
  timezone: text(100).optional(), notes: z.string().max(12000).optional(),
  imageIds: z.array(z.string().uuid()).max(8).optional(),
  expectedImageCount: z.number().int().min(0).max(8).optional(),
}).strict();
export type MealPreviewInput = z.infer<typeof mealPreviewSchema>;
export type SimpleFoodInput = z.infer<typeof simpleFoodSchema>;

export function invalidAiInput(field: string, message: string): never {
  throw new ApiError(400, "invalid_input", field + "：" + message, { fields: [{ path: field, message }], nextAction: "correct_arguments_or_ask_user" });
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
  if (raw?.amountDecision !== "unknown_accepted" && raw?.quantity === undefined) invalidAiInput(`foods.${index}.quantity`, "缺少实际食用量，请先问用户，不可自定常见份量。");
  const parsed = aiFoodSchema.safeParse(raw), field = "foods." + index;
  if (!parsed.success) invalidAiSchema(parsed.error, field);
  const input: SimpleFoodInput = parsed.data;
  const library = input.foodId !== undefined, kind = input.kind ?? "food";
  const source = input.sourceKind?.trim().toLowerCase();
  const sourceKind = ({ package_label: "label", nutrition_label: "label", "包装标签": "label", "营养标签": "label" } as Record<string, string>)[source ?? ""] ?? source ?? "unknown";
  const hasNutrition = metrics.some(metric => input[metric] !== undefined) || input.caloriesKj !== undefined;
  if (input.foodVersion !== undefined && !library) invalidAiInput(field, "foodVersion须与foodId一起使用。");
  if (library && input.foodVersion === undefined) invalidAiInput(field + ".foodVersion", "请先搜索并填写食材版本。");
  if (library && (hasNutrition || input.sourceKind !== undefined || input.nutritionBasis && input.nutritionBasis !== "consumed_total" || input.referenceQuantity !== undefined || input.evidenceUrl !== undefined)) invalidAiInput(field, "引用食材后由服务器换算，不另填营养、来源或计算口径。");
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
  for (const [index, food] of (Array.isArray(raw?.foods) ? raw.foods as SimpleFoodInput[] : []).entries()) {
    if (food.foodId && food.foodVersion === undefined) invalidAiInput(`foods.${index}.foodVersion`, "引用食材须提供搜索结果中的版本，不能自行猜版本。");
    if (food.amountDecision !== "unknown_accepted" && food.quantity === undefined) invalidAiInput(`foods.${index}.quantity`, "缺少实际食用量，请先问用户，不可自定常见份量。");
  }
  const parsed = mealPreviewSchema.safeParse(raw);
  if (!parsed.success) invalidAiSchema(parsed.error);
  const { foods, operationId, ...meal } = parsed.data;
  const input = { operationId, actions: [{ ...meal, ...resolveAiDate(meal.date, meal.timezone, now), kind: "save_meal", items: foods.map(normalizeSimpleFood) }] };
  const result = publicMealInputSchema.safeParse(input);
  if (!result.success) invalidAiSchema(result.error);
  return result.data;
}
export async function previewMeal(db: Database, identity: AiIdentity, raw: MealPreviewInput, now = new Date()) {
  const input = mealPreviewSchema.parse(raw);
  // 原始相对日期参与幂等摘要：跨零点重试仍返回首次创建的预览。
  return submitMealOperation(db, { userId: identity.userId, origin: "ai", identity }, mealPreviewOperation(input, now), undefined, { requestDigest: digest({ tool: "preview_meal", input }) });
}
