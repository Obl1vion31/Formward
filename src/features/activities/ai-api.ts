import type { Database } from "../../db/client";
import { ApiError } from "../auth/ai-identity";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { systemMeasurementTimezone, validateMeasurementTimezone } from "../measurements/timezone";
import { localMeasurementDate } from "../measurements/entry-state";
import { readEnergySnapshot } from "./records";
import { energyDays, activityReadings } from "./model";
export async function queryEnergy(db: Database, userId: string, params: URLSearchParams) {
  if ([...params.keys()].some(key => !["from", "to", "timezone"].includes(key)) || ["from", "to", "timezone"].some(key => params.getAll(key).length > 1)) throw new ApiError(400, "invalid_input", "查询仅支持 from、to 和 timezone。");
  const timezone = params.get("timezone") ?? systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE); validateMeasurementTimezone(timezone);
  const today = localMeasurementDate(new Date(), timezone), to = params.get("to") ?? today, from = params.get("from") ?? addCalendarDays(to, -29);
  const length = calendarOrdinal(to) - calendarOrdinal(from) + 1;
  if (length < 1 || length > 3661) throw new ApiError(400, "invalid_input", "日期区间无效，最长 10 年。");
  const snapshot = await readEnergySnapshot(db, userId);
  const dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)), inRange = (date: string) => date >= from && date <= to;
  return { context: { timezone, localDate: today }, units: { calories: "kcal", duration: "minutes" }, range: { from, to }, days: energyDays(snapshot, [], dates), records: snapshot.days.filter(record => inRange(record.date)), activities: snapshot.activities.filter(record => inRange(record.date)).map(record=>({...record,...activityReadings(record)})), profiles: [], formula: { date: today, estimate: null, retired: true }, rules: "运动calorieMode=components只计exerciseActiveKcal，exerciseRestingKcal保留供查看；total或旧请求采用caloriesKcal原值，不推算静息，activities同时返回totalKcal和countedKcal。每日取值采用显式录入模式：components为静息加活动；total采用录入总数加明确标为额外增加的运动。activityMode=total采用活动合计加额外运动，activities累计全部有效完成明细。included已包含的运动只保留明细，additional额外增加，未确定时须先核对，不按大小猜测；旧明细沿用原结果。公式与资料功能已撤下，旧资料仅内部留存；没有记录的日期保持null。新分项记录省略活动合计时记0，显式null及未知热量明细仍未知。日常默认值已停用。修改已有记录先查id和version；写入通过submit_record_operation，等待网页登录确认。" };
}
