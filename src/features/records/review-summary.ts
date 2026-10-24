import { category, type RecordAction, type RecordItem, type RecordRow } from "./model";

const labels = { body: "身体", meals: "摄入", foods: "食材库", energy: "消耗" } as const;
type SummaryItem = Pick<RecordItem, "key" | "action" | "excluded" | "persisted"> & { businessDate?: string | null; skipped?: boolean };
export function actionDate(action: RecordAction): string | null {
  const value = "date" in action ? action.date : "effectiveFrom" in action ? action.effectiveFrom : "restingFrom" in action ? action.restingFrom : null;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
export function reviewDate(row: RecordRow): string | null {
  const record = row.meal?.meal ?? row.meal?.before ?? row.energy?.after ?? row.energy?.before;
  return actionDate(row.action) ?? (record && "date" in record ? record.date : record && "effectiveFrom" in record ? record.effectiveFrom : null);
}
/** 只组织已存在的日期和类型，不将多日／修改前后营养相加。 */
export function summarizeRecordItems(items: SummaryItem[], status: string) {
  const pending = status === "pending" ? items.filter(item => !item.excluded && !item.persisted && !item.skipped) : [];
  const selected = status === "confirmed" ? items.filter(item => item.persisted) : status === "pending" ? pending : items;
  const dates = [...new Set(selected.flatMap(item => item.businessDate ?? actionDate(item.action) ?? []))].sort();
  const counts = { body: 0, meals: 0, foods: 0, energy: 0 };
  for (const item of selected) counts[category(item.action)]++;
  const types = (Object.keys(labels) as (keyof typeof labels)[]).filter(key => counts[key]).map(key => labels[key]);
  const description = (Object.keys(labels) as (keyof typeof labels)[]).filter(key => counts[key]).map(key => labels[key] + counts[key] + (key === "meals" && selected.filter(item => category(item.action) === key).every(item => item.action.kind === "save_meal") ? "餐" : "项")).join("、");
  const range = dates.length > 1 ? dates[0] + "—" + dates.at(-1) : dates[0];
  return { dates, types, summary: [range, description || "没有待保存内容"].filter(Boolean).join(" · "), pendingCount: pending.length, excludedCount: items.filter(item => item.excluded).length };
}
export function recordReceipt(rows: RecordRow[]) {
  const groups = new Map<string, { date: string | null; type: string; count: number; href: string }>();
  for (const row of rows.filter(row => row.persisted)) {
    const date = reviewDate(row), kind = category(row.action), key = kind + ":" + (date ?? "");
    const existing = groups.get(key);
    if (existing) { existing.count++; continue; }
    const path = kind === "body" ? "/dashboard/measurements" : kind === "energy" ? "/dashboard/energy" : "/dashboard/meals";
    groups.set(key, { date, type: labels[kind], count: 1, href: path + (date && kind !== "foods" ? "?date=" + date : "") });
  }
  return [...groups.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
