import type { Capture, Json } from "./client";

type ObjectJson = { [key: string]: Json };
export type FieldRule = { group: "daily" | "activity"; path: string; label: string; unit: string; target: string; note: string };
export const fieldRules: FieldRule[] = [
  { group: "daily", path: "calendarDate", label: "汇总日期", unit: "当地日历日", target: "recordDate（待接入）", note: "保留来源日期，不按服务器时区移动。" },
  { group: "daily", path: "calories.burnedTotal", label: "每日总消耗", unit: "kcal", target: "totalKcal（待接入）", note: "直接读取来源总数，不与运动列表相加；缺失时不补算。" },
  { group: "daily", path: "calories.burnedResting", label: "每日静息消耗", unit: "kcal", target: "restingKcal（待接入）", note: "官方 V2 字段；保留空值和明确零。" },
  { group: "daily", path: "calories.burnedActive", label: "每日活动消耗", unit: "kcal", target: "activityKcal（待接入）", note: "全天活动汇总，不能再加单次运动热量。" },
  { group: "daily", path: "includesWellnessData", label: "包含全天健康数据", unit: "布尔值", target: "来源状态", note: "不等于当天已记录完整。" },
  { group: "daily", path: "includesActivityData", label: "包含运动数据", unit: "布尔值", target: "来源状态", note: "不据此推算活动热量。" },
  { group: "daily", path: "wellnessChronology.endTimestampGmt", label: "汇总覆盖结束时间", unit: "来源 GMT 时间", target: "来源时间", note: "覆盖时间不冒充设备最后同步时间。" },
  { group: "daily", path: "movement.steps.value", label: "步数", unit: "步", target: "仅核对", note: "本阶段不进入正式记录。" },
  { group: "daily", path: "source", label: "汇总来源", unit: "文本", target: "sourceSystem（待接入）", note: "区分佳明和其他来源；同日多份不自动合并。" },
  { group: "activity", path: "activityId", label: "运动记录标识", unit: "int64", target: "sourceRecordId（待接入）", note: "用于去重；预览和脱敏样本替换为本次别名。" },
  { group: "activity", path: "activityType.typeKey", label: "运动类型", unit: "类型代码", target: "活动类型（待接入）", note: "保留原类型，不推断无氧比例。" },
  { group: "activity", path: "startTimeLocal", label: "当地开始时间", unit: "当地时间，无 UTC 后缀", target: "来源日期／时间", note: "不能直接当 UTC 解析。" },
  { group: "activity", path: "startTimeGMT", label: "UTC 开始时间", unit: "UTC 时间", target: "occurredAt（待接入）", note: "官方定义为 GMT；源字符串可能没有 Z 后缀。" },
  { group: "activity", path: "duration", label: "运动计时时长", unit: "秒", target: "durationMinutes（待接入）", note: "显示时除以 60；不混用 elapsedDuration 或毫秒。" },
  { group: "activity", path: "calories", label: "单次运动总消耗", unit: "kcal", target: "运动来源总数", note: "可能包含运动期间静息，不当作纯活动热量。" },
  { group: "activity", path: "bmrCalories", label: "运动期间 BMR 热量", unit: "kcal", target: "来源分项（仅核对）", note: "保留来源命名，本阶段不自动相减后入账。" },
  { group: "activity", path: "averageHR", label: "平均心率", unit: "次／分钟", target: "运动详情（待接入）", note: "未返回时保持未知。" },
  { group: "activity", path: "distance", label: "运动距离", unit: "米", target: "运动详情（待接入）", note: "不按设备显示单位猜测。" },
  { group: "activity", path: "caloriesEstimated", label: "来源估计能量", unit: "kJ", target: "暂不采用", note: "官方单位是千焦，不能直接当 kcal。" },
  { group: "activity", path: "isParent", label: "多项运动父记录", unit: "布尔值", target: "包含关系", note: "请求排除子活动，仍保留返回的父子标记供核对。" },
  { group: "activity", path: "parentId", label: "父活动标识", unit: "int64", target: "包含关系", note: "预览使用别名；不把父子活动热量重复累加。" },
];

export function object(value: Json | undefined): ObjectJson | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null; }
export function at(value: Json, path: string): Json | undefined { let current: Json | undefined = value; for (const key of path.split(".")) { const record = object(current); if (!record || !Object.hasOwn(record, key)) return undefined; current = record[key]; } return current; }
export function validDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value; }
function number(value: Json | undefined): number | null { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function text(value: Json | undefined): string | null { return typeof value === "string" ? value.slice(0, 200) : null; }
function id(value: Json | undefined): string | null { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : null; }
function kind(value: Json | undefined): string { return value === undefined ? "未返回" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value; }

export type DailyRow = { date: string; total: number | null; resting: number | null; active: number | null; steps: number | null; today: boolean; hasData: boolean; notes: string[] };
export type ActivityRow = { alias: string; date: string | null; time: string | null; type: string | null; seconds: number | null; calories: number | null; bmr: number | null; heartRate: number | null; notes: string[] };
export type FieldObservation = FieldRule & { present: number; missing: number; nulls: number; zeros: number; types: string[]; sample: Json | null };
export type Report = { mode: Capture["mode"]; fetchedAt: string; window: Capture["window"]; daily: DailyRow[]; activities: ActivityRow[]; activitiesComplete: boolean; issues: string[]; fields: FieldObservation[]; unknownFields: { group: string; path: string; types: string[]; count: number }[]; sample: Json; schemaVersion: string };

function dateFromActivity(row: ObjectJson, timeZone: string): { date: string | null; time: string | null; inferred: boolean } {
  const local = text(row.startTimeLocal);
  if (local && /^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(local) && validDate(local.slice(0, 10))) return { date: local.slice(0, 10), time: local.slice(11), inferred: false };
  const gmt = text(row.startTimeGMT);
  if (gmt && /^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(gmt) && validDate(gmt.slice(0, 10))) {
    const date = new Date(gmt.replace(" ", "T") + "Z");
    if (Number.isFinite(+date)) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date), part = (key: string) => parts.find(p => p.type === key)!.value; return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}:${part("second")}`, inferred: true }; }
  }
  return { date: null, time: null, inferred: false };
}

// 白名单披露数值，未知字段仅观察类型。活动名称、身份、坐标、设备号和自由文本均不进入报告。
function safeSample(row: ObjectJson, group: FieldRule["group"], aliasFor: (value: Json | undefined) => string): ObjectJson {
  const output: ObjectJson = {};
  for (const rule of fieldRules.filter(r => r.group === group)) {
    let value = at(row, rule.path); if (value === undefined) continue;
    if (rule.path === "activityId" || rule.path === "parentId") value = value === null ? null : aliasFor(value);
    if (typeof value === "string" && !["activityId", "parentId"].includes(rule.path)) {
      const allowed = /^(?:\d{4}-\d{2}-\d{2}(?:[ T][\d:.Z+-]+)?|[a-zA-Z0-9_-]{1,64})$/;
      value = allowed.test(value) ? value : "[已隐藏非结构化文本]";
    }
    if (value !== null && typeof value === "object") value = "[结构与预期不符，值未披露]";
    const keys = rule.path.split("."); let target = output;
    for (const key of keys.slice(0, -1)) { if (!object(target[key])) target[key] = {}; target = target[key] as ObjectJson; }
    target[keys.at(-1)!] = value;
  }
  return output;
}

export function makeReport(capture: Capture): Report {
  const issues: string[] = [], dailyRecords: ObjectJson[] = [], activityRecords: ObjectJson[] = [];
  if (!capture.daily.ok) issues.push(`每日汇总：${capture.daily.message}`);
  else {
    const data = object(capture.daily.data)?.data;
    if (!Array.isArray(data)) issues.push("每日汇总结构与 V2 文档不同；保留原始响应，未将其当作空数据。");
    else { for (const row of data) { const item = object(row); if (item) dailyRecords.push(item); else issues.push("每日汇总包含无法识别的条目。"); } }
  }
  for (const page of capture.activityPages) {
    if (!page.ok) { issues.push(`活动列表：${page.message}`); continue; }
    if (!Array.isArray(page.data)) { issues.push("活动列表不是预期数组；未将其当作没有活动。"); continue; }
    for (const row of page.data) { const item = object(row); if (item) activityRecords.push(item); else issues.push("活动列表包含无法识别的条目。"); }
  }
  const daily = capture.window.dates.map(date => {
    const rows = dailyRecords.filter(r => r.calendarDate === date), row = rows.length === 1 ? rows[0] : null, notes: string[] = [];
    const value = (path: string) => row ? number(at(row, path)) : null;
    const total = value("calories.burnedTotal"), resting = value("calories.burnedResting"), active = value("calories.burnedActive");
    if (rows.length > 1) notes.push("同日多份来源汇总，未自动选择或合并");
    if (row?.includesWellnessData === false) notes.push("来源标记未包含全天健康数据");
    if (row?.includesActivityData === false) notes.push("来源标记未包含运动数据");
    if (total !== null && resting !== null && active !== null && Math.abs(total - resting - active) > 1) notes.push(`分项与总数相差 ${Math.round((total - resting - active) * 100) / 100} kcal，需核对`);
    for (const path of ["calories.burnedTotal", "calories.burnedResting", "calories.burnedActive"]) if (row && at(row, path) != null && number(at(row, path)) === null) notes.push(`${path} 类型或数值不符合预期`);
    return { date, total, resting, active, steps: value("movement.steps.value"), today: date === capture.window.to, hasData: rows.length > 0, notes };
  });
  if (dailyRecords.some(r => !validDate(r.calendarDate) || !capture.window.dates.includes(String(r.calendarDate)))) issues.push("每日汇总有日期无效或超出七日范围的条目，未混入七日读数。");
  const seen = new Set<string>(); let duplicate = 0, outside = 0;
  const activities: ActivityRow[] = [];
  for (const row of activityRecords) {
    const key = id(row.activityId); if (key && seen.has(key)) { duplicate++; continue; } if (key) seen.add(key);
    const when = dateFromActivity(row, capture.window.timeZone);
    if (when.date && !capture.window.dates.includes(when.date)) { outside++; continue; }
    const notes: string[] = [];
    if (!key) notes.push("来源标识缺失或超出安全整数范围");
    if (!when.date) notes.push("开始日期待核对");
    if (when.inferred) notes.push(`日期按配置时区 ${capture.window.timeZone} 换算`);
    if (row.parentId != null) notes.push("来源含父活动标记，不累计父子热量");
    activities.push({ alias: `活动 ${activities.length + 1}`, date: when.date, time: when.time, type: text(at(row, "activityType.typeKey")), seconds: number(row.duration), calories: number(row.calories), bmr: number(row.bmrCalories), heartRate: number(row.averageHR), notes });
  }
  if (duplicate) issues.push(`已忽略 ${duplicate} 条重复活动 ID；未重复计数。`);
  if (outside) issues.push(`${outside} 条活动超出七日窗口，未显示在本次列表。`);
  const aliases = new Map<string, string>();
  const aliasFor = (value: Json | undefined) => { const key = id(value); if (!key) return "[标识待核对]"; if (!aliases.has(key)) aliases.set(key, `activity-${aliases.size + 1}`); return aliases.get(key)!; };
  const safeDaily = dailyRecords.map(r => safeSample(r, "daily", aliasFor)), safeActivities = activityRecords.map(r => safeSample(r, "activity", aliasFor));
  const fields = fieldRules.map(rule => {
    const rows = rule.group === "daily" ? dailyRecords : activityRecords, values = rows.map(r => at(r, rule.path)), present = values.filter(v => v !== undefined).length;
    const safe = rule.group === "daily" ? safeDaily : safeActivities;
    return { ...rule, present, missing: rows.length - present, nulls: values.filter(v => v === null).length, zeros: values.filter(v => v === 0).length, types: [...new Set(values.map(kind))], sample: safe.map(r => at(r, rule.path)).find(v => v !== undefined && v !== null) ?? null };
  });
  const unknown = new Map<string, { group: string; path: string; types: Set<string>; count: number }>();
  let truncated = false;
  const visit = (value: Json, path: string, group: FieldRule["group"], depth = 0) => {
    if (depth > 12 || unknown.size >= 600) { truncated = true; return; }
    if (Array.isArray(value)) { for (const item of value.slice(0, 20)) visit(item, path + "[]", group, depth + 1); if (value.length > 20) truncated = true; }
    else if (value !== null && typeof value === "object" && Object.keys(value).length) { for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key, group, depth + 1); }
    else if (!fieldRules.some(r => r.group === group && r.path === path)) { const key = `${group}:${path}`, item = unknown.get(key) ?? { group, path, types: new Set<string>(), count: 0 }; item.types.add(kind(value)); item.count++; unknown.set(key, item); }
  };
  for (const row of dailyRecords) visit(row, "", "daily"); for (const row of activityRecords) visit(row, "", "activity");
  if (truncated) issues.push("额外字段观察达到安全上限，原始响应仍完整保留；观察表不是完整 schema。");
  return { mode: capture.mode, fetchedAt: capture.fetchedAt, window: capture.window, daily, activities, activitiesComplete: capture.activitiesComplete, issues: [...new Set(issues)], fields, unknownFields: [...unknown.values()].map(v => ({ ...v, types: [...v.types] })), sample: { daily: safeDaily, activities: safeActivities }, schemaVersion: "Garmin Personal OpenAPI 1.0.0 · 2026-11-07 核对" };
}

export function demoCapture(window: Capture["window"]): Capture {
  const data: Json[] = window.dates.filter((_, i) => i !== 2).map((date, i) => ({ calendarDate: date, source: "garmin", includesWellnessData: true, includesActivityData: true, calories: { burnedResting: i === 5 ? 1020 : 1660 + i * 7, burnedActive: i === 1 ? 0 : 220 + i * 61, burnedTotal: (i === 5 ? 1020 : 1660 + i * 7) + (i === 1 ? 0 : 220 + i * 61) }, movement: { steps: { value: 2400 + i * 900 } }, userProfilePk: 987654321, privateNote: "虚构姓名与位置，不应进入报告" }));
  const activity: Json[] = [{ activityId: 1111, activityName: "虚构住址跑步", activityType: { typeKey: "running" }, startTimeLocal: `${window.dates[4]} 18:20:00`, startTimeGMT: `${window.dates[4]} 10:20:00`, duration: 2400.5, calories: 320.25, bmrCalories: 47, averageHR: 132, startLatitude: 12.34567 }, { activityId: 1112, activityType: { typeKey: "strength_training" }, startTimeLocal: `${window.dates[6]} 07:30:00`, duration: 1800, calories: 180, bmrCalories: null, averageHR: null }];
  return { mode: "demo", fetchedAt: new Date().toISOString(), window, region: "global", daily: { ok: true, data: { data }, rawText: JSON.stringify({ data }) }, activityPages: [{ ok: true, data: activity, rawText: JSON.stringify(activity) }], activitiesComplete: true };
}
