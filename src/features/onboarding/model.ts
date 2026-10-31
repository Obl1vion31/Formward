import { z } from "zod";

export type OnboardingStep = "profile" | "tutorial" | "complete";
export type PersonalProfile = { heightCm: string | null; birthDate: string | null; onboardingStep: OnboardingStep; version: number; updatedAt: string | null };
export const emptyProfile: PersonalProfile = { heightCm: null, birthDate: null, onboardingStep: "complete", version: 0, updatedAt: null };

export function profileToday(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function profileAge(birthDate: string | null, today: string) {
  if (!birthDate) return null;
  const [y,m,d] = birthDate.split("-").map(Number), [ty,tm,td] = today.split("-").map(Number);
  return ty-y-(tm<m || tm===m && td<d ? 1 : 0);
}
const optionalText = z.union([z.string().trim().transform(value => value || null), z.null()]);
export const profileInput = z.object({ expectedVersion: z.number().int().min(0), heightCm: optionalText, birthDate: optionalText, continueOnboarding: z.boolean().optional() }).strict();
export function validateProfile(input: unknown, today = profileToday()) {
  const value = profileInput.parse(input);
  if (value.heightCm !== null && (!/^\d{1,3}(\.\d{1,2})?$/.test(value.heightCm) || Number(value.heightCm)<30 || Number(value.heightCm)>300)) throw new Error("身高请填写30–300厘米，最多两位小数。");
  if (value.birthDate !== null) {
    const parsed = new Date(value.birthDate+"T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value.birthDate || value.birthDate<"1900-01-01" || value.birthDate>today) throw new Error("请选择有效的出生日期，不能晚于今天。");
  }
  return { ...value, heightCm: value.heightCm===null ? null : String(Number(value.heightCm)) };
}
