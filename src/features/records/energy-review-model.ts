import { energyModes, type EnergyRecord } from "../activities/model";
import { category, isBody, type RecordRow } from "./model";
import { reviewDate } from "./review-summary";

const numericFields = new Set(["restingKcal", "activeKcal", "totalKcal", "caloriesKcal", "exerciseActiveKcal", "exerciseRestingKcal", "durationMinutes"]);
const labels: Record<string, string> = {
  completed: "记录状态", date: "日期", name: "运动名称", restingKcal: "静息", activeKcal: "活动合计", totalKcal: "全天总消耗",
  caloriesKcal: "运动总消耗", exerciseActiveKcal: "纯运动", exerciseRestingKcal: "期间静息",
  durationMinutes: "时长", sourceSystem: "来源", restingSourceSystem: "静息来源", activeSourceSystem: "活动来源",
  timezone: "时区", notes: "备注", entryMode: "记录方式", activityMode: "活动记录方式", calorieMode: "运动填写方式",
};
export type EnergyChange = { key: string; label: string; before: unknown; after: unknown; numeric: boolean };
/** 比较原始十进制值，不能用取整后的显示值判断是否修改。 */
export function comparableEnergyValue(value: unknown): unknown {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return value;
  const [whole, fraction = ""] = value.split(".");
  const normalized = whole.replace(/^0+(?=\d)/, "");
  const decimal = fraction.replace(/0+$/, "");
  return normalized + (decimal ? "." + decimal : "");
}
function visibleFields(record: EnergyRecord): Record<string, unknown> {
  if ("name" in record) {
    const common = { completed: record.completed, date: record.date, name: record.name, durationMinutes: record.durationMinutes, sourceSystem: record.sourceSystem, timezone: record.timezone, calorieMode: record.calorieMode ?? "total" };
    return record.calorieMode === "components"
      ? { ...common, exerciseActiveKcal: record.exerciseActiveKcal ?? null, exerciseRestingKcal: record.exerciseRestingKcal ?? null }
      : { ...common, caloriesKcal: record.caloriesKcal };
  }
  if ("date" in record) {
    const modes = energyModes(record);
    return { date: record.date, ...modes, notes: record.notes ?? null, timezone: record.timezone,
      ...(modes.entryMode === "total" ? { totalKcal: record.totalKcal, sourceSystem: record.sourceSystem }
        : { restingKcal: record.restingKcal, restingSourceSystem: record.restingSourceSystem ?? record.sourceSystem,
          ...(modes.activityMode === "total" ? { activeKcal: record.activeKcal, activeSourceSystem: record.activeSourceSystem ?? record.sourceSystem } : {}) }) };
  }
  return {};
}
export function energyChanges(row: RecordRow): EnergyChange[] {
  const before = row.energy?.before, after = row.energy?.after;
  if (!before || !after) return [];
  const prior = visibleFields(before), next = visibleFields(after);
  return [...new Set([...Object.keys(prior), ...Object.keys(next)])]
    .filter(key => numericFields.has(key) ? comparableEnergyValue(prior[key]) !== comparableEnergyValue(next[key]) : (prior[key] ?? null) !== (next[key] ?? null))
    .map(key => ({ key, label: labels[key] ?? key, before: prior[key] ?? null, after: next[key] ?? null, numeric: numericFields.has(key) }));
}
export function onlyInclusionChanged(row: RecordRow) {
  return row.action.kind === "save_activity" && !!row.energy?.before && energyChanges(row).length === 0
    && (row.inclusionReview === true || row.action.inclusion != null);
}
export function energyReviewGroups(rows: RecordRow[]) {
  const groups = new Map<string | null, RecordRow[]>();
  for (const row of rows.filter(row => category(row.action) === "energy")) {
    const date = reviewDate(row);
    groups.set(date, [...(groups.get(date) ?? []), row]);
  }
  return [...groups].map(([date, items]) => ({ date, rows: items }));
}
export function pendingChangesLabel(rows: RecordRow[]) {
  const groups = new Map<string, number>();
  for (const row of rows.filter(row => !row.excluded && !row.persisted && row.body?.status !== "skipped")) {
    const update = !!(row.energy?.before ?? row.meal?.before ?? row.body?.preview.rows[0]?.before);
    const kind = row.action.kind === "save_activity" ? "项运动" : category(row.action) === "energy" ? "条消耗"
      : isBody(row.action) ? "条身体记录" : category(row.action) === "foods" ? "项食材" : "餐";
    const key = (update ? "更新" : "新增") + ":" + kind;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].map(([key, count]) => { const [verb, kind] = key.split(":"); return verb + count + kind; }).join(" · ");
}
