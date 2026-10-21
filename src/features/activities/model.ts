import { z } from "zod";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { buildMeasurementDays } from "../measurements/days";
import type { MeasurementDisplay } from "../measurements/entry-state";

const date = z.string().refine(value => { try { calendarOrdinal(value); return true; } catch { return false; } }, "日期无效。");
const decimal = z.string().regex(/^\d{1,7}(?:\.\d{1,4})?$/).refine(value => Number(value) <= 1000000, "数值超出范围。");
const text = (length: number) => z.string().trim().max(length).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "文字含无效字符。");
const identity = { id: z.string().uuid().optional(), version: z.number().int().positive().optional() };
const provenance = {
  timezone: z.string().max(100).optional(), sourceSystem: text(200).nullable().optional(), sourceRecordId: text(200).nullable().optional(),
  sourceOccurredAt: z.string().datetime({ offset: true }).nullable().optional(), sourceUnit: z.literal("kcal").optional(),
};
export const energyActionSchemas = [
  z.object({ kind: z.literal("save_energy_defaults"), ...identity, restingFrom: date, restingKcal: decimal.nullable(), zeroActivityFrom: date.nullable() }).strict(),
  z.object({ kind: z.literal("save_energy_day"), ...identity, date, restingKcal: decimal.nullable().optional(), activeKcal: decimal.nullable().optional(), activeEstimated: z.boolean().optional(), notes: text(2000).nullable().optional(), totalKcal: decimal.nullable().optional(), ...provenance }).strict(),
  z.object({ kind: z.literal("save_activity"), ...identity, date, name: text(200).min(1, "请填写活动名称。"), durationMinutes: decimal.nullable().optional(), caloriesKcal: decimal.nullable().optional(), completed: z.boolean().optional(), ...provenance }).strict(),
  z.object({ kind: z.literal("save_energy_profile"), ...identity, effectiveFrom: date, heightCm: decimal.refine(value => Number(value) > 0 && Number(value) <= 300, "身高须在 0–300 cm 之间。"), birthDate: date, sex: z.enum(["male", "female"]) }).strict(),
  ...(["delete_energy_defaults", "restore_energy_defaults", "delete_energy_day", "restore_energy_day", "delete_activity", "restore_activity", "delete_energy_profile", "restore_energy_profile"] as const).map(kind => z.object({ kind: z.literal(kind), id: z.string().uuid(), version: z.number().int().positive() }).strict()),
] as const;
export const energyActionSchema = z.union(energyActionSchemas);
export type EnergyAction = z.infer<typeof energyActionSchema>;
export const energyInputSchema = z.object({ operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/), actions: z.array(energyActionSchema).min(1).max(100) }).strict();
export type EnergyInput = z.infer<typeof energyInputSchema>;
export type EnergyProvenance = { timezone: string; sourceSystem: string | null; sourceRecordId: string | null; sourceOccurredAt: string | null; sourceUnit: "kcal"; syncStatus: "confirmed" };
type Versioned = { id: string; version: number; deletedAt: string | null };
export type EnergyDayRecord = Versioned & EnergyProvenance & { date: string; restingKcal: string | null; activeKcal: string | null; totalKcal: string | null; activeEstimated?: boolean; notes?: string | null };
export type ActivityRecord = Versioned & EnergyProvenance & { date: string; name: string; durationMinutes: string | null; caloriesKcal: string | null; completed: boolean };
export type EnergyProfile = Versioned & { effectiveFrom: string; heightCm: string; birthDate: string; sex: "male" | "female" };
export type EnergyDefaults = Versioned & { restingFrom: string; restingKcal: string | null; zeroActivityFrom: string | null };
export type EnergyRecord = EnergyDefaults | EnergyDayRecord | ActivityRecord | EnergyProfile;
export type EnergySnapshot = { days: EnergyDayRecord[]; activities: ActivityRecord[]; profiles: EnergyProfile[]; defaults?: EnergyDefaults[] };
export const emptyEnergy = (): EnergySnapshot => ({ days: [], activities: [], profiles: [] });
export type EnergyPreview = { action: EnergyAction; before?: EnergyRecord; after?: EnergyRecord; error?: string; excluded: boolean };
export type EnergyOperationView = { id: string; revision: number; status: string; rows: EnergyPreview[]; canConfirm: boolean; expiresAt: string | null; createdAt: string; repeated?: boolean };
export type RestingBasis = { method: "mifflin-st-jeor"; profileId: string; profileVersion: number; heightCm: string; age: number; sex: "male" | "female"; weightKg: string; weightDate: string; weightId: string; weightEstimated: boolean; carried: boolean };
export type EnergyDay = { date: string; record: EnergyDayRecord | null; activities: ActivityRecord[]; restingKcal: string | null; activeKcal: string | null; totalKcal: string | null; restingBasis: RestingBasis | null; totalSource: "override" | "sum" | null; activeSource: "override" | "activities" | "default-zero" | null; restingSource: "record" | "average" | "formula" | null; estimated: boolean };
const amount = (value: number) => (Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4);

export function ageOn(birthDate: string, day: string) {
  calendarOrdinal(birthDate); calendarOrdinal(day);
  return Number(day.slice(0, 4)) - Number(birthDate.slice(0, 4)) - Number(day.slice(5) < birthDate.slice(5));
}
export function restingEstimate(date: string, profiles: EnergyProfile[], records: MeasurementDisplay[]): { value: string; basis: RestingBasis } | null {
  const profile = profiles.filter(profile => !profile.deletedAt && profile.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (!profile) return null;
  const age = ageOn(profile.birthDate, date);
  if (age < 18 || age > 120) return null;
  const days = buildMeasurementDays(records.filter(record => record.recordDate <= date), {}, "weightKg");
  const today = days.find(day => day.date === date);
  // 同日多候选是待选择，不能用旧值掩盖这个问题。
  if (today && today.daytime.filter(record => record.recordKind !== "estimated").length > 1) return null;
  let weight = today?.daytimeRecord;
  let carried = false;
  if (!weight || weight.weightKg === null || weight.fasting !== true) {
    const from = addCalendarDays(date, -30);
    const prior = days.filter(day => day.date < date && day.date >= from).sort((a, b) => b.date.localeCompare(a.date));
    for (const day of prior) {
      if (day.daytime.filter(record => record.recordKind !== "estimated").length > 1) continue;
      if (day.daytimeRecord?.weightKg !== null && day.daytimeRecord?.fasting === true) { weight = day.daytimeRecord; carried = true; break; }
    }
  }
  if (!weight || weight.weightKg === null || weight.fasting !== true) return null;
  const calculated = 10 * Number(weight.weightKg) + 6.25 * Number(profile.heightCm) - 5 * age + (profile.sex === "male" ? 5 : -161);
  if (!Number.isFinite(calculated) || calculated <= 0) return null;
  return { value: amount(calculated), basis: { method: "mifflin-st-jeor", profileId: profile.id, profileVersion: profile.version, heightCm: profile.heightCm, age, sex: profile.sex, weightKg: weight.weightKg, weightDate: weight.recordDate, weightId: weight.id, weightEstimated: weight.recordKind === "estimated", carried } };
}

/** 仅派生查询，不写体重估计；用户录入的活动数字原样相加。 */
export function energyDays(snapshot: EnergySnapshot, records: MeasurementDisplay[], dates: string[]): EnergyDay[] {
  return dates.map(date => {
    const record = snapshot.days.find(day => day.date === date && !day.deletedAt) ?? null;
    const activities = snapshot.activities.filter(activity => activity.date === date && !activity.deletedAt && activity.completed);
    const defaults = snapshot.defaults?.find(record => !record.deletedAt);
    const average = defaults && date >= defaults.restingFrom ? defaults.restingKcal : null;
    const estimate = record?.restingKcal != null || average != null ? null : restingEstimate(date, snapshot.profiles, records);
    const restingKcal = record?.restingKcal ?? average ?? estimate?.value ?? null;
    const restingSource = record?.restingKcal != null ? "record" : average != null ? "average" : estimate ? "formula" : null;
    const activityKnown = activities.length > 0 && activities.every(activity => activity.caloriesKcal !== null);
    // 零值仅来自用户明确启用的日期规则；已有未知热量活动仍保持未知。
    const defaultZero = !!defaults?.zeroActivityFrom && date >= defaults.zeroActivityFrom && activities.length === 0;
    const activeKcal = record?.activeKcal ?? (activityKnown ? amount(activities.reduce((sum, activity) => sum + Number(activity.caloriesKcal), 0)) : defaultZero ? "0.0000" : null);
    const totalKcal = record?.totalKcal ?? (restingKcal !== null && activeKcal !== null ? amount(Number(restingKcal) + Number(activeKcal)) : null);
    return { date, record, activities, restingKcal, activeKcal, totalKcal, restingBasis: estimate?.basis ?? null, restingSource, totalSource: record?.totalKcal != null ? "override" : totalKcal !== null ? "sum" : null, activeSource: record?.activeKcal != null ? "override" : activityKnown ? "activities" : defaultZero ? "default-zero" : null, estimated: record?.totalKcal == null && totalKcal !== null && (!!estimate || restingSource === "average" || record?.activeKcal != null && record.activeEstimated === true) };
  });
}
export const energyValue = (value: string | number | null | undefined) => value == null ? "—" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
export const energyKinds = new Set<string>(energyActionSchemas.map(schema => schema.shape.kind.value));
export const isEnergy = (action: { kind: string }): action is EnergyAction => energyKinds.has(action.kind);
