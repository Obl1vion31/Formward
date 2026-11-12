import type { Database } from "../../db/client";
import { ApiError } from "../auth/ai-identity";
import { dailyTotals } from "./model";
import { calendarOrdinal } from "../measurements/trend";
import { localMeasurementDate } from "../measurements/entry-state";
import { validateMeasurementTimezone } from "../measurements/timezone";
import { readMealSnapshot, searchFoods } from "./records";
import { foodLibraryRules } from "./food-description";
import { boundedQueryPage } from "../records/ai-query";
import { mealStatistics } from "../records/ai-statistics";
export async function queryFoods(db: Database, userId: string, query = "") {
  return { foods: await searchFoods(db, userId, query), presets: [] as import("./model").FoodDraft[], foodLibraryRules };
}
export async function queryMeals(db: Database, userId: string, params: URLSearchParams) {
  if ([...params.keys()].some(k => !["from", "to", "timezone", "view"].includes(k)) || ["from", "to", "timezone", "view"].some(k => params.getAll(k).length > 1)) throw new ApiError(400, "invalid_input", "查询仅支持from、to日期、timezone和view。");
  const from = params.get("from"), to = params.get("to");
  if (from) calendarOrdinal(from); if (to) calendarOrdinal(to);
  if (from && to && from > to) throw new ApiError(400, "invalid_input", "日期区间无效。");
  const timezone=params.get("timezone")??process.env.FORMWARD_TIMEZONE??"Asia/Shanghai"; validateMeasurementTimezone(timezone);
  if (params.has("view")) {
    const localDate = localMeasurementDate(new Date(), timezone), query = boundedQueryPage(params, localDate);
    const state = await readMealSnapshot(db, userId, query.dates, { images: query.view === "details" });
    const meals = state.meals.filter(meal => !meal.deletedAt), days = dailyTotals(meals);
    return { context: { timezone, localDate }, range: { from: query.from, to: query.to }, page: query.page, view: query.view,
      days, statistics: mealStatistics(days, { from: query.from, to: query.end }), meals: query.view === "details" ? meals : [],
      units: { caloriesKcal: "kcal", proteinG: "g", carbsG: "g", fatG: "g" },
      rules: "days只统计已有记录日，不补零；未知null，incomplete保留部分合计；day.status区分已记全与待确认。需要修改时使用view=details取得meal.id/version及item.id。page.hasMore时用nextFrom至原to继续查询，不能把一页当全部结果。" };
  }
  const state = await readMealSnapshot(db, userId), meals = state.meals.filter(m => !m.deletedAt && (!from || m.date >= from) && (!to || m.date <= to));
  const statistics = mealStatistics(dailyTotals(meals), { from, to });
  return { context:{timezone,localDate:localMeasurementDate(new Date(),timezone)}, meals, days: dailyTotals(meals), statistics, units: { caloriesKcal: "kcal", proteinG: "g", carbsG: "g", fatG: "g" }, rules: "杂只包含未单列的剩余食物；只有杂时代表整餐。whole整餐估算不能与其他项相加。无记录不等于零摄入。days.day.status为complete表示用户已确认当天记完；incomplete或unconfirmed保留摄入但不参与总览盈余。保存或更改餐次后需由用户重新确认全天状态。食材查找后使用稳定foodId和foodVersion，未知值为null。AI写入只提交预览，等待网页登录确认。" };
}
