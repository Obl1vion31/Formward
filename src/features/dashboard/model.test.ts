import assert from "node:assert/strict";
import { test } from "node:test";
import { overview, overviewDays, overviewScale, latestMorningWeight } from "./model";
import { prepareMealActions } from "../meals/records";
import { emptyNutrition, type MealView } from "../meals/model";
import { emptyEnergy, type EnergySnapshot } from "../activities/model";
import { linkedDate } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
const observed = (date: string, patch: Partial<MeasurementDisplay> = {}): MeasurementDisplay => ({ id: date, recordDate: date, period: "daytime", weightKg: "70.00", bodyFatPercent: "20.00", fasting: true, sourceLocalTime: date + " 08:00:00", recordKind: "observed", timezone: "Asia/Shanghai", sourceType: "manual", sourceSystem: null, sourceRecordId: null, entryChannel: "manual", deviceLabel: "虚构秤", estimation: null, timePrecision: "minute", updatedAt: date, ...patch });
const meal = (date: string, caloriesKcal: string): MealView => prepareMealActions({ operationId: "fictional-overview", actions: [{ kind: "save_meal", date, mealType: "午餐", items: [{ kind: "food", name: "虚构食物", sourceKind: "reference", nutrition: { ...emptyNutrition(), caloriesKcal } }] }] }, { foods: [], meals: [] }, "manual")[0].meal!;
const expenditure = (date: string, totalKcal: string) => ({ id: date, version: 1, deletedAt: null, date, restingKcal: null, activeKcal: null, totalKcal, timezone: "Asia/Shanghai", sourceSystem: null, sourceRecordId: null, sourceOccurredAt: null, sourceUnit: "kcal" as const, syncStatus: "confirmed" as const });
test("总览仅统计当天有效摄入，未知消耗不制造盈余", () => {
  const record = meal("2024-08-01", "200"), today = overview([record], [], "2024-08-01"), empty = overview([record], [], "2024-08-02");
  assert.equal(today.mealCount, 1); assert.equal(today.nutrition.values.caloriesKcal, "200.0000"); assert.equal(today.nutrition.incomplete.proteinG, true); assert.equal(empty.mealCount, 0); assert.equal(empty.nutrition.values.caloriesKcal, null); assert.equal(today.energyBalance, null);
  assert.equal(overview([{ ...record, deletedAt: "2024-08-02" }], [], "2024-08-01").mealCount, 0);
});
test("跨闰日严格配对D+1与D晨重，末日使用范围外的次日记录", () => {
  const rows = [observed("2024-02-28"), observed("2024-02-29", { weightKg: "70.25" }), observed("2024-03-01", { weightKg: "70.05" })];
  const days = overviewDays([], rows, ["2024-02-28", "2024-02-29"]);
  assert.deepEqual(days.map(day => day.weightChangeKg), [.25, -.2]); assert.equal(days[1].nextDate, "2024-03-01");
  assert.equal(days[1].nextMorning?.recordDate, "2024-03-01");
});
test("缺日不跨越配对，晚间不混入，未来晨重不提前展示", () => {
  const rows = [observed("2024-03-01"), observed("2024-03-03", { weightKg: "69.5" }), observed("2024-03-01", { id: "evening", period: "evening", fasting: false, weightKg: "80" })];
  assert.equal(overviewDays([], rows, ["2024-03-01"])[0].weightChangeKg, null);
  assert.equal(overviewDays([], [observed("2024-03-01"), observed("2024-03-02")], ["2024-03-01"], true, emptyEnergy(), "2024-03-01")[0].weightChangeKg, null);
});
test("已有估计通过开关展示，多候选不擅选，零变化保留", () => {
  const rows = [observed("2024-03-01"), observed("2024-03-02", { recordKind: "estimated", weightKg: "70.2" })];
  assert.equal(overviewDays([], rows, ["2024-03-01"], false)[0].weightChangeKg, null);
  const estimate = overviewDays([], rows, ["2024-03-01"], true)[0]; assert.equal(estimate.weightChangeKg, .2); assert.equal(estimate.differenceEstimated, true);
  const ambiguous = overviewDays([], [...rows, observed("2024-03-01", { id: "second" })], ["2024-03-01"], true)[0]; assert.equal(ambiguous.weightChangeKg, null); assert.equal(ambiguous.ambiguous, true);
  assert.equal(overviewDays([], [observed("2024-03-01"), observed("2024-03-02")], ["2024-03-01"])[0].weightChangeKg, 0);
});
test("摄入减最终消耗得到带符号盈余，未知与实际零不同", () => {
  const energy: EnergySnapshot = { ...emptyEnergy(), days: [expenditure("2024-03-01", "500"), expenditure("2024-03-02", "600"), expenditure("2024-03-03", "0")] };
  const days = overviewDays([meal("2024-03-01", "600"), meal("2024-03-02", "400"), meal("2024-03-03", "0")], [], ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04"], false, energy);
  assert.deepEqual(days.map(day => day.energyBalance), [100, -200, 0, null]);
  assert.equal(days[3].energy.totalKcal, null); assert.equal(days[3].nutrition, null);
  assert.equal(overview([meal("2024-03-01", "600")], [], "2024-03-01", energy).energyBalance, 100);
});
test("两个数值轴的比例保留共同零点并容纳正负数据", () => {
  const energy = { ...emptyEnergy(), days: [expenditure("2024-03-01", "1500")] };
  const days = overviewDays([meal("2024-03-01", "300")], [observed("2024-03-01"), observed("2024-03-02", { weightKg: "69.5" })], ["2024-03-01"], false, energy), scale = overviewScale(days);
  assert.ok(scale.kcalHigh > 1500); assert.ok(scale.kcalLow < -1200); assert.ok(scale.kgLow < -.5);
  assert.ok(Math.abs(scale.kcalHigh / (scale.kcalHigh - scale.kcalLow) - scale.kgHigh / (scale.kgHigh - scale.kgLow)) < 1e-12);
});
test("身体卡仅取真实空腹晨重，晚间与估计不进入", () => {
  const early = observed("2024-03-01", { updatedAt: "2024-04-01" }), morning = observed("2024-03-02"), evening = observed("2024-03-03", { id: "evening", period: "evening", fasting: false }), estimate = observed("2024-03-04", { recordKind: "estimated" });
  assert.equal(latestMorningWeight([early, morning, evening, estimate], "2024-03-04")?.id, morning.id); assert.equal(latestMorningWeight([evening, estimate], "2024-03-04"), null);
});
test("详情链接验证真实日历日期", () => {
  assert.equal(linkedDate("2024-02-29"), "2024-02-29"); for (const date of ["2023-02-29", "2024-13-01", "today", ["2024-03-01"], undefined]) assert.equal(linkedDate(date), null);
});
