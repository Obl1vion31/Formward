import {formatRecordNumber} from "../../components/number-format";
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
  z.object({ kind: z.literal("save_energy_day"), ...identity, date, entryMode: z.enum(["components", "total"]).optional(), activityMode: z.enum(["total", "activities"]).optional(), restingSourceSystem: text(200).nullable().optional(), activeSourceSystem: text(200).nullable().optional(), restingEstimated: z.boolean().optional(), restingKcal: decimal.nullable().optional(), activeKcal: decimal.nullable().optional(), activeEstimated: z.boolean().optional(), notes: text(2000).nullable().optional(), totalKcal: decimal.nullable().optional(), ...provenance }).strict(),
  z.object({ kind: z.literal("save_activity"), ...identity, date, inclusion:z.enum(["included","additional"]).nullable().optional(), name: text(200).min(1, "请填写活动名称。"), durationMinutes: decimal.nullable().optional(), calorieMode: z.enum(["total", "components"]).optional(), exerciseRestingKcal: decimal.nullable().optional(), exerciseActiveKcal: decimal.nullable().optional(), caloriesKcal: decimal.nullable().optional(), completed: z.boolean().optional(), ...provenance }).strict(),
  z.object({ kind: z.literal("save_energy_profile"), ...identity, effectiveFrom: date, heightCm: decimal.refine(value => Number(value) > 0 && Number(value) <= 300, "身高须在 0–300 cm 之间。"), birthDate: date, sex: z.enum(["male", "female"]) }).strict(),
  ...(["delete_energy_defaults", "restore_energy_defaults", "delete_energy_day", "restore_energy_day", "delete_activity", "restore_activity", "delete_energy_profile", "restore_energy_profile"] as const).map(kind => z.object({ kind: z.literal(kind), id: z.string().uuid(), version: z.number().int().positive(), inclusion:z.enum(["included","additional"]).nullable().optional() }).strict()),
] as const;
export const energyActionSchema = z.union(energyActionSchemas);
export type EnergyAction = z.infer<typeof energyActionSchema>;
export const energyInputSchema = z.object({ operationId: z.string().regex(/^[a-zA-Z0-9-]{8,120}$/), actions: z.array(energyActionSchema).min(1).max(100) }).strict();
export type EnergyInput = z.infer<typeof energyInputSchema>;
export type EnergyProvenance = { timezone: string; sourceSystem: string | null; sourceRecordId: string | null; sourceOccurredAt: string | null; sourceUnit: "kcal"; syncStatus: "confirmed" };
type Versioned = { id: string; version: number; deletedAt: string | null };
export type EnergyDayRecord = Versioned & EnergyProvenance & { date: string; entryMode?: "components" | "total" | null; activityMode?: "total" | "activities" | null; restingSourceSystem?: string | null; activeSourceSystem?: string | null; restingEstimated?: boolean; restingKcal: string | null; activeKcal: string | null; totalKcal: string | null; activeEstimated?: boolean; notes?: string | null };
export type ActivityRecord = Versioned & EnergyProvenance & { inclusion?:"included"|"additional"|null;inclusionBasis?:string|null;date: string; name: string; durationMinutes: string | null; calorieMode?: "total"|"components"|null; exerciseRestingKcal?:string|null; exerciseActiveKcal?:string|null; caloriesKcal: string | null; completed: boolean };
export type EnergyProfile = Versioned & { effectiveFrom: string; heightCm: string; birthDate: string; sex: "male" | "female" };
export type EnergyDefaults = Versioned & { restingFrom: string; restingKcal: string | null; zeroActivityFrom: string | null };
export type EnergyRecord = EnergyDefaults | EnergyDayRecord | ActivityRecord | EnergyProfile;
export type EnergySnapshot = { days: EnergyDayRecord[]; activities: ActivityRecord[]; profiles: EnergyProfile[]; defaults?: EnergyDefaults[] };
export const emptyEnergy = (): EnergySnapshot => ({ days: [], activities: [], profiles: [] });
export type EnergyPreview = { action: EnergyAction; before?: EnergyRecord; after?: EnergyRecord; error?: string; warnings?:string[]; day?:EnergyDay; coverageQuestions?: ActivityRecord[]; excluded: boolean };
export type EnergyOperationView = { id: string; revision: number; status: string; rows: EnergyPreview[]; canConfirm: boolean; expiresAt: string | null; createdAt: string; repeated?: boolean };
export type RestingBasis = { method: "mifflin-st-jeor"; profileId: string; profileVersion: number; heightCm: string; age: number; sex: "male" | "female"; weightKg: string; weightDate: string; weightId: string; weightEstimated: boolean; carried: boolean };
export type EnergyDay = { date: string; record: EnergyDayRecord | null; activities: ActivityRecord[]; restingKcal: string | null; activeKcal: string | null; totalKcal: string | null; restingBasis: RestingBasis | null; totalSource: "override" | "sum" | null; activeSource: "override" | "activities" | "default-zero" | null; restingSource: "record" | "average" | "formula" | null; estimated: boolean; additionalKcal?:string|null; recordedTotalKcal?:string|null;recordedActiveKcal?:string|null };
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
  if(records.filter(r=>r.recordDate===date&&r.recordKind!=="estimated"&&r.period==="daytime").length>1)return null;
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

export function energyModes(record?: Pick<EnergyDayRecord, "entryMode" | "activityMode" | "totalKcal" | "activeKcal"> | null) {
  return { entryMode: record?.entryMode ?? (record?.totalKcal != null ? "total" : "components"), activityMode: record?.activityMode ?? (record?.activeKcal != null ? "total" : "activities") } as const;
}
/** 包含关系绑定采用的记录、日期、方式和总数，不受来源／备注版本变化影响。 */
export function energyBaseline(record?:EnergyDayRecord|null){
 if(!record || record.deletedAt)return null;
 const modes=energyModes(record),value=modes.entryMode==="total"?record.totalKcal:modes.activityMode==="total"?record.activeKcal:null;
 return value==null?null:JSON.stringify([record.id,record.date,modes.entryMode,modes.entryMode==="total"?null:modes.activityMode,Number(value).toFixed(4)]);
}
export const blankEnergyDay = (date: string): EnergyDay => ({ date, record: null, activities: [], restingKcal: null, activeKcal: null, totalKcal: null, restingBasis: null, restingSource: null, activeSource: null, totalSource: null, estimated: false });
/** 每日正式记录的派生读数。公式仅供独立对照，退役默认规则不参与取值。 */
export function energyDays(snapshot: EnergySnapshot, records: MeasurementDisplay[], dates: string[]): EnergyDay[] {
  void records;
  return dates.map(date => {
    const record = snapshot.days.find(day => day.date === date && !day.deletedAt) ?? null;
    const activities = snapshot.activities.filter(activity => activity.date === date && !activity.deletedAt && activity.completed);
    const modes = energyModes(record), onlyTotal = modes.entryMode === "total";
    const restingKcal = onlyTotal ? null : record?.restingKcal ?? null;
    const restingSource = restingKcal != null ? "record" as const : null;
    const activityKnown = activities.length > 0 && activities.every(activity => activityCalories(activity) !== null);
    const detailSum = activityKnown || record?.activityMode === "activities" && activities.length === 0 ? amount(activities.reduce((sum, activity) => sum + Number(activityCalories(activity)), 0)) : null;
    const baseline=energyBaseline(record),extra=activities.filter(row=>baseline && row.inclusion==="additional" && row.inclusionBasis===baseline);
    const additionalKcal=extra.every(row=>activityCalories(row)!==null)?amount(extra.reduce((sum,row)=>sum+Number(activityCalories(row)),0)):null;
    const activeBase=record?.activeKcal??null;
    const activeKcal = onlyTotal ? null : modes.activityMode === "total" ? activeBase!==null&&additionalKcal!==null?extra.length?amount(Number(activeBase)+Number(additionalKcal)):activeBase:null : detailSum;
    const totalKcal = onlyTotal ? record?.totalKcal!=null&&additionalKcal!==null?extra.length?amount(Number(record.totalKcal)+Number(additionalKcal)):record.totalKcal:null : restingKcal !== null && activeKcal !== null ? amount(Number(restingKcal) + Number(activeKcal)) : null;
    return { additionalKcal:baseline?additionalKcal:null,recordedTotalKcal:record?.totalKcal??null,recordedActiveKcal:activeBase,date, record, activities, restingKcal, activeKcal, totalKcal, restingBasis: null, restingSource, totalSource: totalKcal === null ? null : onlyTotal ? "override" : "sum", activeSource: activeKcal === null ? null : modes.activityMode === "total" ? "override" : "activities", estimated: !onlyTotal && totalKcal !== null && (record?.restingEstimated === true || modes.activityMode === "total" && record?.activeEstimated === true) };
  });
}
/** 旧运动原值照用；只有明确分开填写的新运动采用纯运动分项。 */
export function activityCalories(record: Pick<ActivityRecord,"calorieMode"|"caloriesKcal"|"exerciseActiveKcal">): string|null {
  return record.calorieMode === "components" ? record.exerciseActiveKcal ?? null : record.caloriesKcal;
}
/** 是否改变了当天计入值；来源、名称和期间静息不改变包含关系。 */
export function activityEnergyChanged(before:ActivityRecord,after:ActivityRecord){
 return before.date!==after.date||before.completed!==after.completed||!!before.deletedAt!==!!after.deletedAt||Number(activityCalories(before))!==Number(activityCalories(after))||(activityCalories(before)===null)!==(activityCalories(after)===null);
}
export function activityReadings(record: Pick<ActivityRecord,"calorieMode"|"caloriesKcal"|"exerciseActiveKcal"|"exerciseRestingKcal">) {
  const totalKcal=record.calorieMode==="components" ? record.exerciseActiveKcal!=null&&record.exerciseRestingKcal!=null?amount(Number(record.exerciseActiveKcal)+Number(record.exerciseRestingKcal)):null : record.caloriesKcal;
  return {totalKcal,countedKcal:activityCalories(record)};
}
export function activityCalorieFields(action: {calorieMode?:"total"|"components";caloriesKcal?:string|null;exerciseRestingKcal?:string|null;exerciseActiveKcal?:string|null}, prior?:ActivityRecord) {
  const calorieMode=action.calorieMode??(action.caloriesKcal!==undefined?"total":prior?.calorieMode??"total");
  const exerciseRestingKcal=action.exerciseRestingKcal===undefined?prior?.exerciseRestingKcal??null:action.exerciseRestingKcal;
  const exerciseActiveKcal=action.exerciseActiveKcal===undefined?prior?.exerciseActiveKcal??null:action.exerciseActiveKcal;
  const caloriesKcal=calorieMode==="components" ? exerciseActiveKcal!=null&&exerciseRestingKcal!=null?amount(Number(exerciseActiveKcal)+Number(exerciseRestingKcal)):null : action.caloriesKcal===undefined?prior?.caloriesKcal??null:action.caloriesKcal;
  return {calorieMode,exerciseRestingKcal,exerciseActiveKcal,caloriesKcal};
}
export const energyValue = (value: string | number | null | undefined) => formatRecordNumber(value);
export const energyKinds = new Set<string>(energyActionSchemas.map(schema => schema.shape.kind.value));
export const isEnergy = (action: { kind: string }): action is EnergyAction => energyKinds.has(action.kind);

export const retiredEnergyAction = (kind: string) => kind.includes("energy_defaults") || kind.includes("energy_profile");
