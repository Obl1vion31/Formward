import type { Database } from "../../db/client";
import { ApiError } from "../auth/ai-identity";
import { listMeasurements } from "../measurements/records";
import { measurementDisplay } from "../measurements/editing";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { systemMeasurementTimezone, validateMeasurementTimezone } from "../measurements/timezone";
import { localMeasurementDate } from "../measurements/entry-state";
import { readEnergySnapshot } from "./records";
import { energyDays, restingEstimate } from "./model";
export async function queryEnergy(db: Database, userId: string, params: URLSearchParams) {
  if ([...params.keys()].some(key => !["from", "to", "timezone"].includes(key)) || ["from", "to", "timezone"].some(key => params.getAll(key).length > 1)) throw new ApiError(400, "invalid_input", "查询仅支持 from、to 和 timezone。");
  const timezone = params.get("timezone") ?? systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE); validateMeasurementTimezone(timezone);
  const today = localMeasurementDate(new Date(), timezone), to = params.get("to") ?? today, from = params.get("from") ?? addCalendarDays(to, -29);
  const length = calendarOrdinal(to) - calendarOrdinal(from) + 1;
  if (length < 1 || length > 3661) throw new ApiError(400, "invalid_input", "日期区间无效，最长 10 年。");
  const snapshot = await readEnergySnapshot(db, userId), measurements = (await listMeasurements(db, userId)).map(measurementDisplay).filter(record => record.recordDate <= today);
  const dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)), inRange = (date: string) => date >= from && date <= to;
  return { context: { timezone, localDate: today }, units: { calories: "kcal", duration: "minutes" }, range: { from, to }, days: energyDays(snapshot, measurements, dates), records: snapshot.days.filter(record => inRange(record.date)), activities: snapshot.activities.filter(record => inRange(record.date)), profiles: snapshot.profiles.filter(profile => profile.effectiveFrom <= to), formula: { date: today, estimate: restingEstimate(today, snapshot.profiles, measurements) }, rules: "每日取值采用显式录入模式：components为静息加活动，total仅用总数。activityMode=total使用活动合计，activities只累计已完成有效明细，不重复叠加。公式只作独立对照，不自动计入每日消耗；没有记录的日期保持null。新分项记录省略活动合计时记0，显式null及未知热量明细仍未知。日常默认值已停用。修改已有记录先查id和version；写入通过submit_record_operation，等待网页登录确认。" };
}
