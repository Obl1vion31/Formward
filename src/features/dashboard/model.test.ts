import { overviewPresentation } from "./presentation";
import { preferredRecordedDate } from "../../components/record-dates";
import { chartScale } from "../../components/chart-scale";
import assert from "node:assert/strict";
import { test } from "node:test";
import { overview, overviewDays, latestMorningWeight } from "./model";
import { prepareMealActions } from "../meals/records";
import { emptyNutrition, type MealView } from "../meals/model";
import { emptyEnergy, type EnergySnapshot } from "../activities/model";
import { linkedDate } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
const observed = (date: string, patch: Partial<MeasurementDisplay> = {}): MeasurementDisplay => ({ id: date, recordDate: date, period: "daytime", weightKg: "70.00", bodyFatPercent: "20.00", fasting: true, sourceLocalTime: date + " 08:00:00", recordKind: "observed", timezone: "Asia/Shanghai", sourceType: "manual", sourceSystem: null, sourceRecordId: null, entryChannel: "manual", deviceLabel: "虚构秤", estimation: null, timePrecision: "minute", updatedAt: date, ...patch });
const meal = (date: string, caloriesKcal: string): MealView => prepareMealActions({ operationId: "fictional-overview", actions: [{ kind: "save_meal", date, mealType: "午餐", items: [{ kind: "food", name: "虚构食物", sourceKind: "reference", nutrition: { ...emptyNutrition(), caloriesKcal } }] }] }, { foods: [], meals: [] }, "manual")[0].meal!;
const expenditure = (date: string, totalKcal: string) => ({ id: date, version: 1, deletedAt: null, date, restingKcal: null, activeKcal: null, totalKcal, timezone: "Asia/Shanghai", sourceSystem: null, sourceRecordId: null, sourceOccurredAt: null, sourceUnit: "kcal" as const, syncStatus: "confirmed" as const });

test("总览卡片各取最近记录日，跨零点保留昨日餐次且不影响当天汇总", () => {
  const meals = [meal("2024-08-02", "200"), meal("2024-08-02", "300"), meal("2024-08-01", "400")];
  const snapshot = { ...emptyEnergy(), days: [expenditure("2024-08-01", "2400")] };
  const result = overviewPresentation(meals, [], snapshot, "2024-08-03");
  assert.equal(result.latestIntake?.date, "2024-08-02"); assert.equal(result.latestIntake?.meals.length, 2);
  assert.equal(result.latestIntake?.totals.values.caloriesKcal, "500.0000");
  assert.equal(result.latestEnergy?.date, "2024-08-01"); assert.equal(result.summary.mealCount, 0);
  assert.equal(overviewPresentation([...meals, meal("2024-07-01", "800")], [], snapshot, "2024-08-03").latestIntake?.date, "2024-08-02");
});
test("最新日的未知、零和部分保留，删除与未来记录不挤掉有效历史", () => {
  const known = meal("2024-08-01", "100"), unknown = { ...meal("2024-08-02", "0"), items: [] };
  const partial = { ...expenditure("2024-08-02", "0"), totalKcal: null, restingKcal: "2000" };
  const snapshot = { ...emptyEnergy(), days: [expenditure("2024-08-01", "2400"), partial, expenditure("2024-08-04", "9000")] };
  const result = overviewPresentation([known, unknown, meal("2024-08-04", "9000")], [], snapshot, "2024-08-03");
  assert.equal(result.latestIntake?.date, "2024-08-02"); assert.equal(result.latestIntake?.totals.values.caloriesKcal, null);
  assert.equal(result.latestEnergy?.date, "2024-08-02"); assert.equal(result.latestEnergy?.totalKcal, null);
  const zero = overviewPresentation([meal("2024-08-03", "0")], [], { ...emptyEnergy(), days: [expenditure("2024-08-03", "0")] }, "2024-08-03");
  assert.equal(Number(zero.latestIntake?.totals.values.caloriesKcal), 0); assert.equal(zero.latestEnergy?.totalKcal, "0");
  const deleted = overviewPresentation([known, { ...unknown, deletedAt: "2024-08-03" }], [], { ...snapshot, days: snapshot.days.map(row => row.date === partial.date ? { ...row, deletedAt: "2024-08-03" } : row) }, "2024-08-03");
  assert.equal(deleted.latestIntake?.date, known.date); assert.equal(deleted.latestEnergy?.date, known.date);
});
test("只有已完成活动也算最近消耗日，空账号和公式资料不生成摘要", () => {
  const base = { ...expenditure("2024-08-02", "0"), name: "虚构步行", completed: true, durationMinutes: null, caloriesKcal: null };
  const result = overviewPresentation([], [], { ...emptyEnergy(), activities: [base, { ...base, id: "pending", date: "2024-08-03", completed: false }] }, "2024-08-03");
  assert.equal(result.latestEnergy?.date, "2024-08-02"); assert.equal(result.latestEnergy?.totalKcal, null);
  const empty = overviewPresentation([], [], emptyEnergy(), "2024-08-03");
  assert.equal(empty.latestIntake, null); assert.equal(empty.latestEnergy, null);
});
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
test("独立坐标轴使用整齐等距刻度，包含零且覆盖正负值", () => {
  for (const [values, unit] of [[[2480, 3150], "kcal"], [[-530, 760], "kcal"], [[-0.3, 0.4], "kg"], [[-12000, 400], "kcal"], [[0], "kcal"], [[], "kg"]] as const) {
    const scale = chartScale([...values], unit);
    assert.ok(scale.min <= Math.min(0, ...values)); assert.ok(scale.max >= Math.max(0, ...values));
    assert.ok(scale.ticks.includes(0));
    scale.ticks.slice(1).forEach((tick, i) => assert.ok(Math.abs(tick - scale.ticks[i] - scale.step) < 1e-8));
  }
  assert.deepEqual(chartScale([-530,760]).ticks, [-1000,0,1000]);
  assert.deepEqual(chartScale([-.3,.4], "kg").ticks, [-.5,0,.5]);
  assert.deepEqual(chartScale([-.05], "kg").ticks, [-.1,0]);
});
test("部分摄入和估算消耗仍计算盈余，缺失与明确零保持区别", () => {
  const partial = prepareMealActions({ operationId: "fictional-partial", actions: [{ kind: "save_meal", date: "2024-03-01", mealType: "午餐", items: [{ kind: "food", name: "已知食物", sourceKind: "estimated", nutrition: { ...emptyNutrition(), caloriesKcal: "300" } }, { kind: "food", name: "未知食物", sourceKind: "unknown", nutrition: emptyNutrition() }] }] }, { foods: [], meals: [] }, "manual")[0].meal!;
  const energy = { ...emptyEnergy(), days: [{ ...expenditure("2024-03-01", "200"), totalKcal: null, restingKcal: "200", activeKcal: "0", restingEstimated: true }] };
  const day = overviewDays([partial], [], ["2024-03-01"], false, energy)[0];
  assert.equal(day.nutrition?.incomplete.caloriesKcal, true); assert.equal(day.energy.estimated, true); assert.equal(day.energyBalance, 100);
  assert.equal(overview([partial], [], "2024-03-01", energy).energyBalance, 100);
});
test("身体卡仅取真实空腹晨重，晚间与估计不进入", () => {
  const early = observed("2024-03-01", { updatedAt: "2024-04-01" }), morning = observed("2024-03-02"), evening = observed("2024-03-03", { id: "evening", period: "evening", fasting: false }), estimate = observed("2024-03-04", { recordKind: "estimated" });
  assert.equal(latestMorningWeight([early, morning, evening, estimate], "2024-03-04")?.id, morning.id); assert.equal(latestMorningWeight([evening, estimate], "2024-03-04"), null);
});
test("详情链接验证真实日历日期", () => {
  assert.equal(linkedDate("2024-02-29"), "2024-02-29"); for (const date of ["2023-02-29", "2024-13-01", "today", ["2024-03-01"], undefined]) assert.equal(linkedDate(date), null);
});

test("无完整收支时保留仅体脂、晚间及估计的实际记录日期，不把配对前日当成事实", () => {
  const records = [observed("2024-03-01", { period:"evening", fasting:false }), observed("2024-03-03", { weightKg:null }), observed("2024-03-04", { recordKind:"estimated" }), observed("2024-04-01")];
  const view = overviewPresentation([], records, emptyEnergy(), "2024-03-05");
  assert.deepEqual(view.recordDates, ["2024-03-01","2024-03-03","2024-03-04"]);
  assert.equal(view.days.find(day => day.date==="2024-03-04")?.morning, null);
  assert.equal(preferredRecordedDate(view.days,view.today, day=>day.energyBalance!==null, day=>view.recordDates.includes(day.date)),"2024-03-04");
  assert.equal(view.recordDates.includes("2024-03-02"),false);
});
