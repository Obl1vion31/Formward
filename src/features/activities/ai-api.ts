import type { Database } from "../../db/client";
import { ApiError } from "../auth/ai-identity";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { systemMeasurementTimezone, validateMeasurementTimezone } from "../measurements/timezone";
import { localMeasurementDate } from "../measurements/entry-state";
import { readEnergySnapshot } from "./records";
import { energyDays, activityReadings } from "./model";
import { boundedQueryPage } from "../records/ai-query";
import { type AiIdentity } from "../auth/ai-identity";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { readMealSnapshot } from "../meals/records";
import { dailyTotals } from "../meals/model";
import { balanceStatistics, energyStatistics } from "../records/ai-statistics";
export async function queryEnergy(db: Database, userId: string, params: URLSearchParams, identity?: AiIdentity) {
  const keys = ["from", "to", "timezone", "view", "includeMeals"];
  if ([...params.keys()].some(key => !keys.includes(key)) || keys.some(key => params.getAll(key).length > 1)) throw new ApiError(400, "invalid_input", "查询仅支持from、to、timezone、view和includeMeals。");
  if (params.has("includeMeals") && !["true", "false"].includes(params.get("includeMeals")!)) throw new ApiError(400, "invalid_input", "includeMeals只能为true或false。");
  const includeMeals = params.get("includeMeals") === "true";
  if (includeMeals) {
    if (!identity || identity.userId !== userId) throw new ApiError(403, "insufficient_scope", "联合统计须校验本账号饮食与消耗查询权限。");
    await db.transaction(async tx => { await requireActiveAiToken(tx, identity, false, "meals"); await requireActiveAiToken(tx, identity, false, "energy"); });
  }
  const balance = async (days: ReturnType<typeof energyDays>, window: { from: string; to: string }) => includeMeals ? { balance: balanceStatistics(dailyTotals((await readMealSnapshot(db, userId, days.map(day => day.date), { images: false })).meals.filter(meal => !meal.deletedAt)), days, window) } : {};
  const timezone = params.get("timezone") ?? systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE); validateMeasurementTimezone(timezone);
  const today = localMeasurementDate(new Date(), timezone), to = params.get("to") ?? today, from = params.get("from") ?? addCalendarDays(to, -29);
  if (params.has("view")) {
    const query = boundedQueryPage(params, today), snapshot = await readEnergySnapshot(db, userId, query.dates);
    const days = energyDays(snapshot, [], query.dates);
    return { context: { timezone, localDate: today }, range: { from: query.from, to: query.to }, page: query.page, view: query.view,
      statistics: energyStatistics(days, { from: query.from, to: query.end }), ...await balance(days, { from: query.from, to: query.end }),
      days: days.map(day => ({ date: day.date, totalKcal: day.totalKcal, restingKcal: day.restingKcal, activeKcal: day.activeKcal, steps: day.steps, cumulative: day.cumulative, estimated: day.estimated, recordedTotalKcal: day.recordedTotalKcal, recordedActiveKcal: day.recordedActiveKcal, additionalKcal: day.additionalKcal, totalSource: day.totalSource, activeSource: day.activeSource, activities: day.activities.length })),
      records: query.view === "details" ? snapshot.days.filter(record => !record.deletedAt) : [],
      activities: query.view === "details" ? snapshot.activities.filter(record => !record.deletedAt).map(record => ({ ...record, ...activityReadings(record) })) : [],
      profiles: [], formula: { date: today, estimate: null, retired: true },
      units: { calories: "kcal", duration: "minutes", steps: "steps" },
      rules: "days为正式规则采用结果；只记录运动不代表全天消耗完整。未知null，明确0保留；今天累计值用cumulative标识。details返回原值、包含关系及id/version，不能把全天总数再加included运动。page.hasMore时继续读取下一段。" };
  }
  const length = calendarOrdinal(to) - calendarOrdinal(from) + 1;
  if (length < 1 || length > 3661) throw new ApiError(400, "invalid_input", "日期区间无效，最长 10 年。");
  const dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)), inRange = (date: string) => date >= from && date <= to;
  const snapshot = await readEnergySnapshot(db, userId, dates);
  const days = energyDays(snapshot, [], dates);
  const statistics = energyStatistics(days, { from, to }), combined = await balance(days, { from, to });
  return { context: { timezone, localDate: today }, units: { calories: "kcal", duration: "minutes", steps:"steps" }, range: { from, to }, statistics, ...combined, days, records: snapshot.days.filter(record => inRange(record.date)), activities: snapshot.activities.filter(record => inRange(record.date)).map(record=>({...record,...activityReadings(record)})), profiles: [], formula: { date: today, estimate: null, retired: true }, rules: "steps为可空步数，未知不补零。record.adoption说明来源同步或手动保护及结构化采用来源；来源日总数不再叠加运动。sourceDetails保留已采用运动的来源总热量、BMR和明细，不自行相减推算纯运动热量；今天来源日值是累计值。运动calorieMode=components只计exerciseActiveKcal，exerciseRestingKcal保留供查看；total或旧请求采用caloriesKcal原值，不推算静息，activities同时返回totalKcal和countedKcal。每日取值采用显式录入模式：components为静息加活动；total采用录入总数加明确标为额外增加的运动。activityMode=total采用活动合计加额外运动，activities累计全部有效完成明细。included已包含的运动只保留明细，additional额外增加，未确定时须先核对，不按大小猜测；旧明细沿用原结果。公式与资料功能已撤下，旧资料仅内部留存；没有记录的日期保持null。新分项无人工合计时使用activityMode=activities累计运动，不能把空值补成人工0；total模式的null及未知热量明细仍未知。日常默认值已停用。修改已有记录先查id和version；单独消耗或实际运动用preview_energy，组合任务用preview_record_bundle；原待审草稿用update_preview修改，等待网页登录确认。" };
}
