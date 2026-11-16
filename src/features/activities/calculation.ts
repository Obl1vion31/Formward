import { and, eq, gte, lte, isNull, isNotNull } from "drizzle-orm";
import type { Database } from "../../db/client";
import { accountPreferences, measurement, personalProfile } from "../../db/schema";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { calculationReferences, type CalculationContext, type RestingMethod, type CalculationMethod } from "./calculation-model";
import type { Transaction } from "../auth/owner-lock";
export async function loadEnergyPreferences(db:Pick<Database,"select">,userId:string){
 const [saved]=await db.select({restingMethod:accountPreferences.energyRestingMethod,formula:accountPreferences.energyFormula}).from(accountPreferences).where(eq(accountPreferences.userId,userId));
 return saved??{restingMethod:"estimate" as const,formula:"auto" as const};
}

export async function loadCalculationContext(db: Pick<Database, "select">, userId: string, date: string): Promise<CalculationContext> {
  calendarOrdinal(date);
  const [profile] = await db.select().from(personalProfile).where(eq(personalProfile.userId, userId));
  const [preferences] = await db.select().from(accountPreferences).where(eq(accountPreferences.userId, userId));
  const rows = await db.select().from(measurement).where(and(eq(measurement.userId, userId), eq(measurement.recordKind, "observed"), isNull(measurement.deletedAt), gte(measurement.recordDate, addCalendarDays(date, -30)), lte(measurement.recordDate, date)));
  return { date, profile: profile ? { heightCm: profile.heightCm, birthDate: profile.birthDate, sexForCalculation: profile.sexForCalculation, version: profile.version } : null, ...calculationReferences(date, rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString(), deletedAt: null }))), preferences: { restingMethod: preferences?.energyRestingMethod ?? "estimate", formula: preferences?.energyFormula ?? "auto" } };
}
export async function calculationContexts(db: Pick<Database, "select">, userId: string, actions: { kind: string; date?: string; calculation?: unknown }[]) {
  const result: Record<string, CalculationContext> = {};
  for (const action of actions) if (action.kind === "save_energy_day" && action.calculation && action.date && !result[action.date]) result[action.date] = await loadCalculationContext(db, userId, action.date);
  return result;
}
/** 成功保存才记忆方式；不改变身体指标显示偏好，不记忆活动档位。 */
export async function rememberCalculationPreferences(tx: Transaction, userId: string, method: RestingMethod, formula?: CalculationMethod) {
  const [saved] = await tx.select().from(accountPreferences).where(eq(accountPreferences.userId, userId));
  formula ??= saved?.energyFormula ?? "auto";
  if (saved?.energyRestingMethod === method && saved.energyFormula === formula) return;
  if (saved) await tx.update(accountPreferences).set({ energyRestingMethod: method, energyFormula: formula, version: saved.version + 1, updatedAt: new Date() }).where(eq(accountPreferences.userId, userId));
  else {
    const [fat] = await tx.select({ id: measurement.id }).from(measurement).where(and(eq(measurement.userId, userId), eq(measurement.recordKind, "observed"), isNull(measurement.deletedAt), isNotNull(measurement.bodyFatPercent))).limit(1);
    await tx.insert(accountPreferences).values({ userId, showBodyFat: !!fat, energyRestingMethod: method, energyFormula: formula });
  }
}
