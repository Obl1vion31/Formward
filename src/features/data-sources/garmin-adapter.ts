import type { Capture, Json } from "../garmin/client";
import { at, object, validDate } from "../garmin/model";
import type { SourceFact, SourceMetric } from "./model";

export type NormalizedFact = { kind: "day" | "activity"; sourceRecordId: string; date: string; occurredAt: Date | null; payload: SourceFact };
const numeric = (value: Json | undefined, max = 1000000) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const decimal = (value: Json | undefined) => { const n = numeric(value); return n === null ? null : String(Math.round(n * 10000) / 10000); };
const safeId = (value: Json | undefined) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null;
const cleanText = (value: Json | undefined, max = 200) => typeof value === "string" && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim().slice(0, max) : null;
export function garminUtc(value: Json | undefined) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z?$/.test(value) || !validDate(value.slice(0, 10))) return null;
  const date = new Date(value.replace(" ", "T").replace(/Z?$/, "Z"));
  return Number.isFinite(+date) ? date : null;
}

/** 只保留选中的健康字段，不存放完整响应、GPS、设备号或身份信息。 */
export function normalizeGarmin(capture: Capture, metrics: SourceMetric[]) {
  const facts: NormalizedFact[] = [], issues: string[] = [], selected = new Set(metrics);
  let dailyComplete = true;
  const daily = capture.daily.ok ? object(capture.daily.data)?.data : null;
  if (metrics.some(m => m !== "activities")) {
    if (!Array.isArray(daily)) { dailyComplete = false; issues.push(capture.daily.ok ? "每日汇总格式发生变化，本次没有覆盖旧值。" : capture.daily.message); }
    else {
      const days = new Map<string, Json[]>();
      for (const value of daily) { const row = object(value), date = row?.calendarDate; if (!validDate(date) || !capture.window.dates.includes(date)) { dailyComplete = false; issues.push("每日汇总含无效或越界日期。 "); continue; } days.set(date, [...(days.get(date) ?? []), value]); }
      for (const [date, rows] of days) {
        if (rows.length !== 1) { dailyComplete = false; issues.push(`${date} 有多份来源汇总，未自动选择。`); continue; }
        const row = rows[0], steps = selected.has("steps") ? numeric(at(row, "movement.steps.value"), 10000000) : null;
        let malformed = false;
        if (["total", "resting", "active"].some(m => selected.has(m as SourceMetric)) && !object(at(row, "calories"))) { malformed = true; dailyComplete = false; issues.push(`${date} 的消耗结构发生变化，保留上次采用值。`); }
        const read = (metric: SourceMetric, path: string) => selected.has(metric) ? decimal(at(row, path)) : null;
        const total = read("total", "calories.burnedTotal"), resting = read("resting", "calories.burnedResting"), active = read("active", "calories.burnedActive");
        for (const [metric, path] of [["total", "calories.burnedTotal"], ["resting", "calories.burnedResting"], ["active", "calories.burnedActive"], ["steps", "movement.steps.value"]] as const) {
          const value = at(row, path);
          if (selected.has(metric) && value != null && (numeric(value, metric === "steps" ? 10000000 : 1000000) === null || metric === "steps" && !Number.isInteger(value))) { malformed = true; dailyComplete = false; issues.push(`${date} 的${metric === "steps" ? "步数" : "消耗"}格式异常。`); }
        }
        if (malformed) continue;
        facts.push({ kind: "day", sourceRecordId: date, date, occurredAt: garminUtc(at(row, "wellnessChronology.endTimestampGmt")), payload: { kind: "day", total, resting, active, steps: steps !== null && Number.isInteger(steps) ? steps : null, coverageUntil: garminUtc(at(row, "wellnessChronology.endTimestampGmt"))?.toISOString() ?? null } });
      }
    }
  }
  let activitiesComplete = capture.activitiesComplete;
  if (selected.has("activities")) {
    const byId = new Map<string, Json[]>();
    for (const page of capture.activityPages) {
      if (!page.ok || !Array.isArray(page.data)) { activitiesComplete = false; issues.push(page.ok ? "运动列表格式发生变化。" : page.message); continue; }
      for (const value of page.data) {
        const row = object(value), id = safeId(row?.activityId);
        if (!row || !id) { activitiesComplete = false; issues.push("运动来源编号无效，未导入该条。 "); continue; }
        byId.set(id, [...(byId.get(id) ?? []), value]);
      }
    }
    for (const [id, rows] of byId) {
      if (rows.some(row => JSON.stringify(row) !== JSON.stringify(rows[0]))) { activitiesComplete = false; issues.push("同一运动编号返回冲突内容，未自动选择。 "); continue; }
      const row = object(rows[0])!, utc = garminUtc(row.startTimeGMT), local = cleanText(row.startTimeLocal);
      const localDate = local && /^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(local) && validDate(local.slice(0, 10)) ? local.slice(0, 10) : null;
      const date = localDate ?? (utc ? new Intl.DateTimeFormat("en-CA", { timeZone: capture.window.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(utc) : null);
      if (!date || !capture.window.dates.includes(date)) { if (!date) { activitiesComplete = false; issues.push("运动开始日期无效，未导入该条。 "); } continue; }
      if (row.parentId != null) continue; // 父记录已经涵盖的子运动不重复导入。
      const type = cleanText(at(row, "activityType.typeKey"), 100), seconds = numeric(row.duration, 60000000);
      facts.push({ kind: "activity", sourceRecordId: id, date, occurredAt: utc, payload: { kind: "activity", name: cleanText(row.activityName) || type || "Garmin 运动", type, durationMinutes: seconds === null ? null : String(Math.round(seconds / 60 * 10000) / 10000), caloriesKcal: decimal(row.calories), bmrKcal: decimal(row.bmrCalories), distanceMeters: numeric(row.distance, 100000000), averageHR: numeric(row.averageHR, 300), localTime: localDate ? local : null, parentId: safeId(row.parentId), isParent: row.isParent === true } });
    }
  }
  return { facts, dailyComplete, activitiesComplete, issues: [...new Set(issues)].slice(0, 12) };
}
