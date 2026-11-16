import { z } from "zod";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { adoptedMeasurements, type DailyMeasurement } from "../measurements/days";

export const restingMethods = ["manual", "device", "estimate"] as const;
export const calculationMethods = ["auto", "cunningham", "mifflin-st-jeor"] as const;
export const activityLevels = [
  { id: "sedentary", label: "久坐少动", factor: 1.3, example: "大部分时间坐着，只有少量起身、室内走动。" },
  { id: "light", label: "日常走动", factor: 1.5, example: "通勤、散步、逛街或家务，走动比久坐日多。" },
  { id: "moderate", label: "较多活动", factor: 1.7, example: "较长时间走动，或进行中等量有氧、力量训练。" },
  { id: "high", label: "大量活动", factor: 1.9, example: "体力工作、长时间运动或高训练量的一天。" },
] as const;
export type ActivityLevel = typeof activityLevels[number]["id"];
export type CalculationMethod = typeof calculationMethods[number];
export type RestingMethod = typeof restingMethods[number];
export const calculationRequestSchema = z.object({
  kind: z.enum(["resting", "daily"]), method: z.enum(calculationMethods).default("auto"),
  activityLevel: z.enum(["sedentary", "light", "moderate", "high"]).optional(),
  basisKey: z.string().max(5000).optional(),
}).strict();
export type CalculationRequest = z.infer<typeof calculationRequestSchema>;
export type CalculationMeasurement = DailyMeasurement & { updatedAt: string; deviceLabel?: string | null; sourceSystem?: string | null };
export type CalculationProfile = { heightCm: string | null; birthDate: string | null; sexForCalculation: "male" | "female" | null; version: number };
export type MeasurementReference = { id: string; version: string; date: string; period: "daytime" | "evening"; value: string; source: string | null };
export type CalculationContext = { date: string; profile: CalculationProfile | null; weight: MeasurementReference | null; bodyFat: MeasurementReference | null; preferences: { restingMethod: RestingMethod; formula: CalculationMethod } };
export type CalculationSnapshot = {
  version: 1; date: string; requestedMethod: CalculationMethod; method: "cunningham" | "mifflin-st-jeor";
  kind: "resting" | "daily"; profile: (CalculationProfile & { age: number }) | null;
  weight: MeasurementReference; bodyFat: MeasurementReference | null;
  activityLevel: ActivityLevel | null; factor: number | null; restingKcal: string; totalKcal: string | null; basisKey: string;
};
export type CalculationResult = { ok: true; snapshot: CalculationSnapshot } | { ok: false; message: string; missing: ("weight" | "bodyFat" | "profile")[] };
export const formulaLabel = (method: CalculationMethod) => method === "auto" ? "自动选择" : method === "cunningham" ? "体脂公式 · Cunningham" : "常规公式 · Mifflin–St Jeor";
export const calculationAmount = (value: number) => (Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4);

/** 每项独立选择最近实测，同日晨间优先；不复活已被同一时段新记录替代的候选。 */
export function calculationReferences(date: string, rows: CalculationMeasurement[]) {
  calendarOrdinal(date);
  const from = addCalendarDays(date, -30);
  const adopted = adoptedMeasurements(rows).filter(row => row.recordDate >= from && row.recordDate <= date)
    .sort((a, b) => b.recordDate.localeCompare(a.recordDate) || (a.period === b.period ? 0 : a.period === "daytime" ? -1 : 1));
  const pick = (metric: "weightKg" | "bodyFatPercent"): MeasurementReference | null => {
    const row = adopted.find(row => row[metric] !== null && (metric === "weightKg" ? Number(row[metric]) > 0 : Number(row[metric]) >= 0 && Number(row[metric]) <= 100));
    return row ? { id: row.id, version: row.updatedAt, date: row.recordDate, period: row.period, value: row[metric]!, source: row.deviceLabel ?? row.sourceSystem ?? null } : null;
  };
  return { weight: pick("weightKg"), bodyFat: pick("bodyFatPercent") };
}
export function calculateEnergy(context: CalculationContext, request: CalculationRequest): CalculationResult {
  const { date, weight, bodyFat, profile } = context;
  calendarOrdinal(date);
  if (!weight) return { ok: false, message: "需要该日期及此前30天内的实测体重。", missing: ["weight"] };
  const method = request.method === "auto" ? bodyFat ? "cunningham" : "mifflin-st-jeor" : request.method;
  if (method === "cunningham" && !bodyFat) return { ok: false, message: "体脂公式需要该日期及此前30天内的实测体脂率。", missing: ["bodyFat"] };
  const age = profile?.birthDate ? Number(date.slice(0, 4)) - Number(profile.birthDate.slice(0, 4)) - Number(date.slice(5) < profile.birthDate.slice(5)) : null;
  if (method === "mifflin-st-jeor" && (!profile?.heightCm || !profile.sexForCalculation || age === null || age < 18 || age > 120)) return { ok: false, message: "常规公式需要身高、出生日期和计算用性别，适用18–120岁成人。", missing: ["profile"] };
  if (request.kind === "resting" && request.activityLevel !== undefined) return { ok: false, message: "静息估算不使用活动档位。", missing: [] };
  const level = request.kind === "daily" ? activityLevels.find(level => level.id === request.activityLevel) : null;
  if (request.kind === "daily" && !level) return { ok: false, message: "请选择这一天的活动量。", missing: [] };
  const usedProfile = method === "mifflin-st-jeor" ? { ...profile!, age: age! } : null;
  const usedFat = method === "cunningham" ? bodyFat : null;
  const rawResting = method === "cunningham" ? 500 + 22 * Number(weight.value) * (1 - Number(bodyFat!.value) / 100) : 10 * Number(weight.value) + 6.25 * Number(profile!.heightCm) - 5 * age! + (profile!.sexForCalculation === "male" ? 5 : -161);
  if (!Number.isFinite(rawResting) || rawResting <= 0) return { ok: false, message: "这些资料无法得到有效估算，请核对后重试。", missing: ["profile"] };
  // 自动选择也绑定本次使用的候选，新增近期体脂会使旧的自动预览失效。
  const basisKey = JSON.stringify([1, date, request.method, method, weight, request.method === "auto" || method === "cunningham" ? bodyFat : null, usedProfile]);
  if (request.basisKey !== undefined && request.basisKey !== basisKey) return { ok: false, message: "计算依据已改变，请重新计算并核对后保存。", missing: [] };
  return { ok: true, snapshot: { version: 1, date, requestedMethod: request.method, method, kind: request.kind, profile: usedProfile, weight, bodyFat: usedFat, activityLevel: level?.id ?? null, factor: level?.factor ?? null, restingKcal: calculationAmount(rawResting), totalKcal: level ? calculationAmount(rawResting * level.factor) : null, basisKey } };
}
/** 普通AI查询只说明来源与日期，不暴露生日、性别和原始计算资料。 */
export function publicCalculation(snapshot: CalculationSnapshot | null | undefined) {
  return snapshot ? { source: "system-estimate", method: snapshot.method, requestedMethod: snapshot.requestedMethod, version: snapshot.version, kind: snapshot.kind, activityLevel: snapshot.activityLevel, factor: snapshot.factor, restingKcal: snapshot.restingKcal, totalKcal: snapshot.totalKcal, weightDate: snapshot.weight.date, bodyFatDate: snapshot.bodyFat?.date ?? null } : null;
}
