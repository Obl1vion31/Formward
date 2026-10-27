import { z } from "zod";

export const metrics = ["caloriesKcal", "proteinG", "carbsG", "fatG"] as const;
export type Metric = typeof metrics[number];
export const metricLabels: Record<Metric, string> = { caloriesKcal: "热量", proteinG: "蛋白质", carbsG: "碳水", fatG: "脂肪" };
export const sourceLabels = { reference: "标签／成分表", label: "营养标签", composition_table: "成分表", estimated: "预估", unknown: "未知", initialization: "初始化" };
export const decimal = z.string().regex(/^\d{1,7}(?:\.\d{1,4})?$/).refine(v => Number(v) <= 1000000, "数值超出范围");
export const nutritionSchema = z.object({ caloriesKcal: decimal.nullable(), proteinG: decimal.nullable(), carbsG: decimal.nullable(), fatG: decimal.nullable() }).strict();
export type Nutrition = z.infer<typeof nutritionSchema>;
export const emptyNutrition = (): Nutrition => ({ caloriesKcal: null, proteinG: null, carbsG: null, fatG: null });
const text = (max: number) => z.string().trim().max(max).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), "文字包含无效字符");
const source = z.enum(["label", "composition_table", "reference", "estimated", "unknown"]);
const evidence = z.string().max(2000).url().refine(v => /^https?:\/\//.test(v), "来源链接须为 HTTP 或 HTTPS").nullable().optional();
const imageIds = z.array(z.string().uuid()).max(8).refine(ids => new Set(ids).size === ids.length, "照片不能重复引用").optional();
const evidenceNote = z.object({ source: z.enum(["user", "label", "food_library", "composition_table", "estimate", "unknown"]), basis: text(2000).min(1), uncertainty: text(1000).nullable().optional() }).strict();
export const reviewExplanationSchema = z.object({ identity: evidenceNote.optional(), amount: evidenceNote.optional(), cooking: evidenceNote.optional(), nutrition: evidenceNote.optional() }).strict();
export type ReviewExplanation = z.infer<typeof reviewExplanationSchema>;
export const photoReviewSchema = z.object({ dateConfirmed: z.boolean(), mealTypeConfirmed: z.boolean(), identityConfirmed: z.boolean(), amountConfirmed: z.boolean(), cookingConfirmed: z.boolean(), questions: z.array(text(500).min(1)).max(20).default([]) }).strict().meta({deprecated:true,description:"旧照片核对格式，仅留档兼容；不要求逐项勾选，不阻止文字保存。"});
export const foodDraftSchema = z.object({
  id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  category: z.enum(["meal", "ingredient"]).optional(),
  name: text(200).min(1), brand: text(200).nullable().optional(), preparation: text(200).nullable().optional(),
  servingQuantity:decimal.refine(v=>Number(v)>0).nullable().optional(), servingUnit:text(30).min(1).nullable().optional(),
  baseQuantity: decimal.refine(v => Number(v) > 0, "基准数量须大于0"), unit: text(30).min(1),
  imageIds, expectedImageCount: z.number().int().min(0).max(8).optional(), nutrition: nutritionSchema, sourceKind: source, basis: text(4000).nullable().optional(), evidenceUrl: evidence,
}).strict();
export type FoodDraft = z.infer<typeof foodDraftSchema>;
export const itemSchema = z.object({
  originalItemId: z.string().uuid().optional(),
  foodRef: z.string().min(1).max(120).optional(),
  kind: z.enum(["food", "misc", "whole"]), name: text(200).min(1),
  quantity: decimal.refine(v => Number(v) > 0, "食用量须大于0").nullable().optional(), unit: text(30).nullable().optional(),
  amountDecision: z.enum(["provided", "estimate_accepted", "unknown_accepted"]).optional(), foodId: z.string().uuid().optional(), foodVersion: z.number().int().positive().optional(), foodDraft: foodDraftSchema.optional(),
  nutritionBasis:z.enum(["consumed_total","per_portion"]).optional(), perPortionNutrition:nutritionSchema.optional(),
  nutrition: nutritionSchema.optional(), sourceKind: source.default("estimated"), basis: text(4000).nullable().optional(), evidenceUrl: evidence, reviewExplanation: reviewExplanationSchema.optional(),
}).strict();
export type ItemDraft = z.infer<typeof itemSchema>;
export const mealDraftSchema = z.object({
  id: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), mealType: text(50).min(1),
  timezone: text(100).nullable().optional(), occurredAt: z.string().datetime({ offset: true }).nullable().optional(),
  imageIds, expectedImageCount: z.number().int().min(0).max(8).optional(), photoReview: photoReviewSchema.optional(), notes: text(12000).nullable().optional(), items: z.array(itemSchema).min(1).max(50), allowDuplicate: z.boolean().optional(),
}).strict();
export type MealDraft = z.infer<typeof mealDraftSchema>;
export const actionSchema = z.discriminatedUnion("kind", [
  mealDraftSchema.extend({ kind: z.literal("save_meal") }), foodDraftSchema.extend({ kind: z.literal("save_food") }),
  ...(["delete_meal", "restore_meal", "delete_food", "restore_food"] as const).map(kind => z.object({ kind: z.literal(kind), id: z.string().uuid(), version: z.number().int().positive() }).strict()),
]);
export type MealAction = z.infer<typeof actionSchema>;
export const operationSchema = z.object({ operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/), actions: z.array(actionSchema).min(1).max(100) }).strict();
export type MealInput = z.infer<typeof operationSchema>;
export const publicMealInputSchema = operationSchema.extend({ actions: z.array(z.union(actionSchema.options.filter(schema => !schema.shape.kind.value.startsWith("delete_") && !schema.shape.kind.value.startsWith("restore_")))).min(1).max(100) });
export type FoodView = FoodDraft & { id: string; version: number; deletedAt: string | null };
export type ItemView = ItemDraft & { id?: string; nutrition: Nutrition; foodSnapshot?: FoodView; sourceKind: ItemDraft["sourceKind"] };
export type Totals = { values: Nutrition; incomplete: Record<Metric, boolean> };
export type MealDayStatus = "complete" | "incomplete" | "unconfirmed";
export type MealDayView = { date: string; status: MealDayStatus; version: number; contentDigest: string; source: string };
export type MealDayInput = { operationId: string; date: string; status: "complete" | "incomplete"; version: number; contentDigest: string };
export const mealDayLabels: Record<MealDayStatus,string> = {complete:"已记完",incomplete:"未记全",unconfirmed:"待确认是否记完"};
export type MealView = Omit<MealDraft, "items"> & { id: string; version: number; day?: MealDayView; items: ItemView[]; totals: Totals; source: "manual" | "ai" | "initialization"; deletedAt: string | null };
export type MealSnapshot = { meals: MealView[]; foods: FoodView[] };
export type MealChanges={added:ItemView[];removed:ItemView[];changed:{before:ItemView;after:ItemView}[];metadata:string[]};
export type PreviewRow = {changes?:MealChanges; excluded?: boolean; before?: FoodView | MealView; review?: { itemId: string; operationId: string; originalInput: unknown; reviewedInput: unknown; editedBy?: { userId: string; at: string } }; action: MealAction; food?: FoodView; meal?: MealView; error?: string; duplicateIds: string[]; warnings: string[]; needsUserInput?: string[] };
export type MealOperationView = { id: string; revision: number; status: string; origin: string; rows: PreviewRow[]; canConfirm: boolean; canConfirmWithoutImages?: boolean; missingImages?: number; needsUserInput?: { index: number; questions: string[] }[]; createdAt: string; expiresAt: string | null; confirmationPath: string; result: { saved: number; message: string } | null };
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function mealOperationStatus(op: Pick<MealOperationView, "status" | "expiresAt">, now = Date.now()) {
  return op.status === "pending" && op.expiresAt && Date.parse(op.expiresAt) <= now ? "expired" : op.status;
}
export function missingMealImages(rows: PreviewRow[]) {
  return rows.reduce((count, row) => {
    if (row.excluded) return count;
    if(row.action.kind!=="save_meal"&&row.action.kind!=="save_food")return count;
    const saved=row.meal?.imageIds?.length??row.food?.imageIds?.length??row.action.imageIds?.length??0;
    return count+Math.max(0,(row.action.expectedImageCount??0)-saved);
  },0);
}
export function foodSpecification(value: string | null | undefined) {
  return value?.replace(/，?不含额外油酱/g, "").replace(/，?不含蛋壳及额外油酱/g, "").replace(/，?外部脂肪修至0/g, "") ?? "";
}

// 用整数保留四位小数，数量换算仅在最终落库时舍入。
export function scaled(value: string, quantity: string, base: string) {
  const integer = (v: string) => BigInt(v.split(".")[0]) * BigInt(10000) + BigInt((v.split(".")[1] ?? "").padEnd(4, "0"));
  const numerator = integer(value) * integer(quantity), divisor = integer(base);
  const units = (numerator + divisor / BigInt(2)) / divisor;
  return `${units / BigInt(10000)}.${String(units % BigInt(10000)).padStart(4, "0")}`;
}
export function nutritionFor(food: FoodDraft, quantity: string, unit=food.unit): Nutrition {
  const amount=unit===food.servingUnit && food.servingQuantity?scaled(quantity,food.servingQuantity,"1"):quantity;
  return Object.fromEntries(metrics.map(metric => [metric, food.nutrition[metric] === null ? null : scaled(food.nutrition[metric]!, amount, food.baseQuantity)])) as Nutrition;
}
export function portionNutrition(nutrition: Nutrition, quantity: string): Nutrition {
 return Object.fromEntries(metrics.map(metric=>[metric,nutrition[metric]===null?null:scaled(nutrition[metric]!,quantity,"1")])) as Nutrition;
}
export function sumNutrition(rows: Nutrition[]): Totals {
  const values = emptyNutrition(), incomplete = {} as Record<Metric, boolean>;
  for (const metric of metrics) {
    const known = rows.flatMap(row => row[metric] === null ? [] : [Math.round(Number(row[metric]) * 10000)]);
    values[metric] = known.length ? (known.reduce((a, b) => a + b, 0) / 10000).toFixed(4) : null;
    incomplete[metric] = rows.length > 0 && known.length !== rows.length;
  }
  return { values, incomplete };
}
export function dailyTotals(meals: MealView[]) {
  const groups = new Map<string, MealView[]>();
  for (const meal of meals.filter(m => !m.deletedAt)) groups.set(meal.date, [...(groups.get(meal.date) ?? []), meal]);
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([date, rows]) => ({ date, meals: rows, day: rows[0]?.day ?? {date,status:"unconfirmed" as const,version:0,contentDigest:"",source:"unconfirmed"}, totals: sumNutrition(rows.flatMap(m => m.items.map(i => i.nutrition))) }));
}
export function formatNutrition(value: string | null, metric: Metric) { return value === null ? "—" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: metric === "caloriesKcal" ? 0 : 1 }); }

/** 计数单位默认一份；重量、体积及未知单位由用户明确填写。 */
export function defaultFoodQuantity(unit: string): string | null {
  return /^(份|勺|只|个|颗|枚|片|包|盒|瓶|杯|碗|袋|块|条|粒|scoops?|servings?)$/i.test(unit.trim()) ? "1" : null;
}
export function suggestedMealType(hour: number) {
  return hour < 5 || hour >= 22 ? "夜宵" : hour < 10 ? "早餐" : hour < 14 ? "午餐" : hour < 17 ? "加餐" : "晚餐";
}
export const macroColors = { proteinG: "#365E78", carbsG: "#6C96B3", fatG: "#AFCDDE" };
export type MacroMode = "grams" | "energy";
/** 分段口径可切换，展示高度仍归一到已记录 kcal，不改写营养事实。 */
export function macroDistribution(totals: Totals | undefined, mode: MacroMode = "grams") {
  const keys = ["proteinG", "carbsG", "fatG"] as const;
  if (!totals || keys.some(k => totals.values[k] === null || totals.incomplete[k])) return null;
  const weighted = keys.map(k => Number(totals.values[k]) * (mode === "grams" ? 1 : k === "fatG" ? 9 : 4)), sum = weighted.reduce((a,b) => a+b, 0);
  if (!sum) return null;
  return keys.map((metric,index) => ({ metric, ratio: weighted[index]/sum, calories: Number(totals.values.caloriesKcal ?? 0) * weighted[index]/sum }));
}
/** 旧调用保留能量口径。 */
export const macroEnergy = (totals: Totals | undefined) => totals?.values.caloriesKcal == null ? null : macroDistribution(totals, "energy");

export function mealTypeLabel(name:string){return ({breakfast:"早餐",lunch:"午餐",dinner:"晚餐",snack:"加餐",supper:"夜宵"} as Record<string,string>)[name.trim().toLowerCase()]??name;}
