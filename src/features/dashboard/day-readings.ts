import { signedRecordNumber } from "@/components/number-format";
import type { OverviewDay } from "./model";

export function hasExpenditureRecord({ energy }: OverviewDay) {
  return energy.totalKcal !== null || energy.record !== null || energy.activities.length > 0;
}

export function hasEnergyRecord(day: OverviewDay) {
  return day.meals.length > 0 || day.nutrition?.values.caloriesKcal != null || hasExpenditureRecord(day);
}

export function balanceLabel(balance: number | null) {
  if (balance === null) return "收支未计算";
  if (balance === 0) return "收支持平";
  return balance < 0 ? "缺口" : "盈余";
}

export function missingBalanceReason(day: OverviewDay): string | undefined {
  if (day.energyBalance !== null) return;
  if (!day.meals.length) return "没有饮食记录";
  if (day.mealDayStatus === "incomplete") return "饮食未记全";
  if (day.mealDayStatus !== "complete") return "饮食未确认";
  if (day.nutrition?.values.caloriesKcal == null) return "摄入热量未知";
  if (day.energy.cumulative) return "消耗仍在累计";
  return "缺全天消耗";
}

export const shortDate = (date: string) => date.slice(5).replace("-", ".");

export function morningChangeReading(day: OverviewDay) {
  if (day.ambiguous) return "晨重待核对";
  if (day.weightChangeKg !== null) {
    return day.weightChangeKg === 0 ? "无变化" : signedRecordNumber(day.weightChangeKg) + " kg";
  }
  const hasMorning = day.morning?.weightKg != null;
  const hasNextMorning = day.nextMorning?.weightKg != null;
  if (!hasMorning && !hasNextMorning) return "无晨重记录";
  if (hasMorning && hasNextMorning) return "晨重待核对";
  return "缺 " + shortDate(hasMorning ? day.nextDate : day.date) + " 晨重";
}
