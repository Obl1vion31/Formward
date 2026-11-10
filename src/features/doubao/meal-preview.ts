import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Database } from "../../db/client";
import { ApiError, type AiIdentity } from "../auth/ai-identity";
import { MEALS_WRITE_SCOPE } from "../auth/oauth-connections";
import { emptyNutrition, metrics, publicMealInputSchema, type MealInput } from "../meals/model";
import { submitMealOperation } from "../meals/records";
import { aiConfirmationUrl, safeAiError } from "../measurements/ai-api";
import { localMeasurementDate } from "../measurements/entry-state";
import { calendarOrdinal } from "../measurements/trend";
import { validateMeasurementTimezone } from "../measurements/timezone";

// 模型只表达一餐；组合操作、营养换算和正式保存继续由原业务功能负责。
const foodInput = z.object({
  name: z.string(),
  quantity: z.string().describe("实际食用量的十进制字符串，不带单位").optional(),
  unit: z.string().optional(),
  foodId: z.string().optional(),
  foodVersion: z.number().optional(),
  caloriesKcal: z.string().describe("本次总kcal，不带单位；未知省略").optional(),
  proteinG: z.string().describe("本次总蛋白质g，不带单位；未知省略").optional(),
  carbsG: z.string().describe("本次总碳水g，不带单位；未知省略").optional(),
  fatG: z.string().describe("本次总脂肪g，不带单位；未知省略").optional(),
  sourceKind: z.string().describe("label=包装营养标签，composition_table=成分表，reference=已有参考，estimated=估算，unknown=未知").optional(),
  basis: z.string().optional(),
  evidenceUrl: z.string().optional(),
  amountDecision: z.enum(["provided", "estimate_accepted", "unknown_accepted"]).optional(),
}).strict();

export const mealPreviewSchema = z.object({
  operationId: z.string().describe("8–120位字母、数字或连字符；同内容重试保持不变"),
  date: z.string().describe("明确日期YYYY-MM-DD；今天传today、昨天传yesterday，由服务器按timezone解析，不自行猜日期"),
  mealType: z.string().describe("如午餐"),
  foods: z.array(foodInput).min(1).max(50),
  timezone: z.string().optional(),
  notes: z.string().optional(),
  imageIds: z.array(z.string()).max(8).optional(),
  expectedImageCount: z.number().optional(),
}).strict();
export type MealPreviewInput = z.infer<typeof mealPreviewSchema>;

function invalid(field: string, message: string): never {
  throw new ApiError(400, "invalid_input", field + "：" + message);
}

function nutritionValue(value: string | undefined, calories: boolean) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  // 只兼容数值后明确的同单位后缀，不猜测或换算不同单位。
  return (calories ? /^(\d+(?:\.\d+)?)\s*(?:kcal|千卡)$/i : /^(\d+(?:\.\d+)?)\s*(?:g|克)$/i).exec(trimmed)?.[1] ?? trimmed;
}

function sourceKind(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === undefined ? undefined : ({ package_label: "label", nutrition_label: "label", "包装标签": "label", "营养标签": "label" } as Record<string, string>)[normalized] ?? normalized;
}

export function mealPreviewOperation(raw: MealPreviewInput, now = new Date()): MealInput {
  const parsed = mealPreviewSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // 不回显用户输入或未知字段名。
    invalid(issue?.path.filter(part => typeof part === "number" || ["foods", ...Object.keys(foodInput.shape), ...Object.keys(mealPreviewSchema.shape)].includes(String(part))).join(".") || "参数", "请按新增一餐的参数格式填写。");
  }
  const { foods, operationId, ...meal } = parsed.data;
  const relative = ({ today: 0, "今天": 0, yesterday: 1, "昨天": 1 } as Record<string, number>)[meal.date.trim().toLowerCase()];
  if (relative !== undefined) {
    const timezone = meal.timezone ?? process.env.FORMWARD_TIMEZONE ?? "Asia/Shanghai";
    try {
      validateMeasurementTimezone(timezone);
      const today = localMeasurementDate(now, timezone);
      meal.date = new Date((calendarOrdinal(today) - relative) * 86400000).toISOString().slice(0, 10);
      meal.timezone = timezone;
    } catch { invalid("timezone", "请填写有效的用户时区。"); }
  }
  const items = foods.map((input, index) => {
    const food = { ...input, sourceKind: sourceKind(input.sourceKind) };
    const field = "foods." + index, library = food.foodId !== undefined;
    const hasNutrition = metrics.some(metric => food[metric] !== undefined);
    if (!library && food.foodVersion !== undefined) invalid(field + ".foodVersion", "引用食材版本时须同时提供查询返回的foodId。");
    if (library && food.foodVersion === undefined) invalid(field + ".foodVersion", "请填写食材搜索返回的版本。");
    if (library && (hasNutrition || food.sourceKind !== undefined || food.evidenceUrl !== undefined)) invalid(field, "引用食材时不另填营养和来源，由服务器按规格换算。");
    if (food.amountDecision === "unknown_accepted") {
      if (food.quantity !== undefined) invalid(field + ".quantity", "已明确食量未知时请省略数量。");
    } else if (!food.quantity?.trim() || !food.unit?.trim()) {
      invalid(field + ".quantity", "请填写实际食用量及单位；仅在用户明确食量未知时使用unknown_accepted。");
    }
    if (!library && hasNutrition && (!food.sourceKind || food.sourceKind === "unknown")) invalid(field + ".sourceKind", "填写营养数值时须说明来源；估算使用estimated并填写basis。");
    if (!library && hasNutrition && food.sourceKind === "estimated" && !food.basis?.trim()) invalid(field + ".basis", "请说明本次食用量、组成及营养估算的不确定性。");
    const { caloriesKcal, proteinG, carbsG, fatG, ...details } = food;
    return {
      ...details, kind: "food" as const,
      quantity: food.quantity ?? null,
      sourceKind: food.sourceKind ?? "unknown" as const,
      ...(!library ? { nutritionBasis: "consumed_total" as const, nutrition: { ...emptyNutrition(), ...Object.fromEntries(Object.entries({ caloriesKcal, proteinG, carbsG, fatG }).filter(([, value]) => value !== undefined).map(([metric, value]) => [metric, nutritionValue(value, metric === "caloriesKcal")])) } } : {}),
    };
  });
  const result = publicMealInputSchema.safeParse({ operationId, actions: [{ ...meal, kind: "save_meal", items }] });
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.filter(part => part !== "actions" && part !== "nutrition").map((part, index) => index === 0 && part === 0 ? undefined : part === "items" ? "foods" : part).filter(part => part !== undefined).join(".");
    invalid(path || "参数", issue?.message ?? "饮食数据无效。");
  }
  return result.data;
}

export function registerDoubaoMealPreview(server: McpServer, db: Database, identity: AiIdentity, scopes: string[], request: Request) {
  server.registerTool("preview_meal", {
    title: "新增一餐预览",
    description: "新增单餐首选。只填写date、mealType、foods，不传actions、kind或nutrition嵌套。数值为十进制字符串，营养是实际食用总量；未知字段省略，明确零用字符串0。引用食材先搜索，提供foodId、foodVersion、数量及单位，不另填营养。自由食物有营养时须sourceKind，估算须basis。不新建食材库、不修改历史；修改继续使用submit_meal_operation。重复请求保持operationId与内容。只生成待确认预览，完整返回confirmationUrl，请用户登录网页确认，不能声称已保存。",
    inputSchema: mealPreviewSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: [MEALS_WRITE_SCOPE] }] },
  }, async args => {
    try {
      if (!scopes.includes(MEALS_WRITE_SCOPE)) throw new ApiError(403, "insufficient_scope", "当前账号连接缺少饮食提交权限，请重新授权。");
      const operation = await submitMealOperation(db, { userId: identity.userId, origin: "ai", identity }, mealPreviewOperation(args));
      const result = { ...operation, confirmationUrl: aiConfirmationUrl(request, operation.confirmationPath) };
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result, ...(operation.status === "failed" ? { isError: true } : {}) };
    } catch (error) {
      const failure = safeAiError(error);
      return { content: [{ type: "text" as const, text: failure.error.message }], structuredContent: { error: failure.error }, isError: true };
    }
  });
}
