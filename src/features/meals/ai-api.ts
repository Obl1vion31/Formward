import type { Database } from "../../db/client";
import { ApiError } from "../auth/ai-identity";
import { dailyTotals } from "./model";
import { calendarOrdinal } from "../measurements/trend";
import { localMeasurementDate } from "../measurements/entry-state";
import { validateMeasurementTimezone } from "../measurements/timezone";
import { readMealSnapshot, searchFoods } from "./records";
import { foodLibraryRules } from "./food-description";
export async function queryFoods(db: Database, userId: string, query = "") {
  return { foods: await searchFoods(db, userId, query), presets: [] as import("./model").FoodDraft[], foodLibraryRules };
}
export async function queryMeals(db: Database, userId: string, params: URLSearchParams) {
  if ([...params.keys()].some(k => !["from", "to", "timezone"].includes(k)) || ["from", "to", "timezone"].some(k => params.getAll(k).length > 1)) throw new ApiError(400, "invalid_input", "查询仅支持from、to日期和timezone。");
  const from = params.get("from"), to = params.get("to");
  if (from) calendarOrdinal(from); if (to) calendarOrdinal(to);
  if (from && to && from > to) throw new ApiError(400, "invalid_input", "日期区间无效。");
  const timezone=params.get("timezone")??process.env.FORMWARD_TIMEZONE??"Asia/Shanghai"; validateMeasurementTimezone(timezone);
  const state = await readMealSnapshot(db, userId), meals = state.meals.filter(m => !m.deletedAt && (!from || m.date >= from) && (!to || m.date <= to));
  return { context:{timezone,localDate:localMeasurementDate(new Date(),timezone)}, meals, days: dailyTotals(meals), units: { caloriesKcal: "kcal", proteinG: "g", carbsG: "g", fatG: "g" }, rules: "杂只包含未单列的剩余食物；只有杂时代表整餐。whole整餐估算不能与其他项相加。无记录不等于零摄入。食材查找后使用稳定foodId和foodVersion，未知值为null。AI写入只提交预览，等待网页登录确认。" };
}
