import type { DailyMeasurement } from "./days";
import type { MeasurementMetric } from "./trend";
import type { EstimationMetadata } from "./estimation";
import type { SaveMeasurementDayInput, EstimateCellInput } from "./editing";

export const entryPeriods = ["daytime", "evening"] as const;
export const entryMetrics = ["weightKg", "bodyFatPercent"] as const;
export type EntryPeriod = typeof entryPeriods[number];
export type EntryCell = { period: EntryPeriod; metric: MeasurementMetric };
export type MeasurementDateDisplay = { date: string; reminderSkipped: boolean };
export type MeasurementDisplay = DailyMeasurement & {
  bmi: string | null; timezone: string | null; localDate: string;
  sourceType: string; sourceSystem: string | null; sourceRecordId: string | null;
  recordKind: "observed" | "estimated"; entryChannel: "api" | "manual" | "development_backend" | null;
  deviceName: string | null; companionApp: string | null; estimation: EstimationMetadata | null;
  timePrecision: string; updatedAt: string;
};
export type EntryResult = { ok: true; records: MeasurementDisplay[]; dates: MeasurementDateDisplay[]; message: string } | { ok: false; error: string };
export type MeasurementActions = {
  save: (input: SaveMeasurementDayInput) => Promise<EntryResult>;
  estimate: (input: EstimateCellInput) => Promise<EntryResult>;
  createDate: (date: string) => Promise<EntryResult>;
  skipReminder: (date: string, timezone: string) => Promise<EntryResult>;
};

export function localMeasurementDate(now = new Date(), timezone?: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 候选未确定时要求选择已有记录，不能把它当空值再次录入。 */
export function measurementEntryState<T extends DailyMeasurement>(records: T[], date: string, choices: Record<string, string> = {}) {
  return entryPeriods.map(period => {
    const rows = records.filter(row => row.analysisDate === date && row.period === period);
    const observed = rows.filter(row => row.recordKind !== "estimated");
    const selected = observed.find(row => row.id === choices[`${date}:${period}`]) ?? (observed.length === 1 ? observed[0] : null);
    const pending = observed.length > 1 && !selected;
    const fields = Object.fromEntries(entryMetrics.map(metric => {
      const row = selected?.[metric] != null ? selected : rows.find(row => row.recordKind === "estimated" && row[metric] != null);
      return [metric, { value: pending ? null : row?.[metric] ?? null, kind: pending ? "pending" as const : row ? row.recordKind === "estimated" ? "estimated" as const : "observed" as const : "missing" as const }];
    })) as Record<MeasurementMetric, { value: string | null; kind: "pending" | "missing" | "observed" | "estimated" }>;
    return { period, observed: selected, candidates: observed, pending, fields };
  });
}

export function missingMeasurementCells(records: DailyMeasurement[], date: string, choices: Record<string, string> = {}): EntryCell[] {
  return measurementEntryState(records, date, choices).flatMap(group => entryMetrics.filter(metric => group.fields[metric].kind === "missing").map(metric => ({ period: group.period, metric })));
}
