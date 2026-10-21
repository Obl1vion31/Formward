import type { Database } from "../../db/client";
import { ApiError } from "../auth/ai-identity";
import { listMeasurements } from "../measurements/records";
import { measurementDisplay } from "../measurements/editing";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { systemMeasurementTimezone, validateMeasurementTimezone } from "../measurements/timezone";
import { localMeasurementDate } from "../measurements/entry-state";
import { readEnergySnapshot } from "./records";
import { energyDays } from "./model";
export async function queryEnergy(db: Database, userId: string, params: URLSearchParams) {
  if ([...params.keys()].some(key => !["from", "to", "timezone"].includes(key)) || ["from", "to", "timezone"].some(key => params.getAll(key).length > 1)) throw new ApiError(400, "invalid_input", "查询仅支持 from、to 和 timezone。");
  const timezone = params.get("timezone") ?? systemMeasurementTimezone(new Date(), process.env.FORMWARD_TIMEZONE); validateMeasurementTimezone(timezone);
  const today = localMeasurementDate(new Date(), timezone), to = params.get("to") ?? today, from = params.get("from") ?? addCalendarDays(to, -29);
  const length = calendarOrdinal(to) - calendarOrdinal(from) + 1;
  if (length < 1 || length > 3661) throw new ApiError(400, "invalid_input", "日期区间无效，最长 10 年。");
  const snapshot = await readEnergySnapshot(db, userId), measurements = (await listMeasurements(db, userId)).map(measurementDisplay).filter(record => record.recordDate <= today);
  const dates = Array.from({ length }, (_, index) => addCalendarDays(from, index)), inRange = (date: string) => date >= from && date <= to;
  return { context: { timezone, localDate: today }, units: { calories: "kcal", duration: "minutes" }, range: { from, to }, days: energyDays(snapshot, measurements, dates), records: snapshot.days.filter(record => inRange(record.date)), activities: snapshot.activities.filter(record => inRange(record.date)), profiles: snapshot.profiles.filter(profile => profile.effectiveFrom <= to), defaults: snapshot.defaults ?? [], rules: "活动热量按用户提供原值使用，不拆分或扣减静息，不估算其他日常活动。全天总消耗优先；否则静息加活动合计，活动合计缺少时汇总已完成活动。未知为null；用户启用zeroActivityFrom后，该日起未录活动按0，已有未知热量明细仍为空。公式仅派生查询，不写入身体估计。修改已有记录先查询id和version。写入使用submit_record_operation，等待网页登录确认。" };
}
