import assert from "node:assert/strict";
import { test } from "node:test";
import { comparableEnergyValue, energyChanges, energyReviewGroups, onlyInclusionChanged, pendingChangesLabel } from "./energy-review-model";
import type { ActivityRecord, EnergyDayRecord } from "../activities/model";
import type { RecordRow } from "./model";
const activity: ActivityRecord = { id: "test-activity", version: 1, deletedAt: null, date: "2026-10-30", name: "虚构羽毛球", durationMinutes: "90", completed: true, calorieMode: "components", caloriesKcal: null, exerciseActiveKcal: "801.0000", exerciseRestingKcal: "145.0000", timezone: "Asia/Shanghai", sourceSystem: "虚构手表", sourceRecordId: null, sourceOccurredAt: null, sourceUnit: "kcal", syncStatus: "confirmed" };
const action = { kind: "save_activity" as const, date: activity.date, name: activity.name, inclusion: "included" as const };
const row: RecordRow = { key: "activity", action, originalInput: action, excluded: false, checked: false, inclusionReview: true, energy: { action, excluded: false, before: activity, after: { ...activity, exerciseActiveKcal: "801", exerciseRestingKcal: "145", inclusion: "included", inclusionBasis: "new-baseline" } } };
test("同值不同精度不显示801到801，真实的小数变化不能被取整掩盖", () => {
  assert.equal(comparableEnergyValue("000801.0000"), "801");
  assert.equal(comparableEnergyValue("0.0000"), "0");
  assert.equal(comparableEnergyValue(null), null);
  assert.deepEqual(energyChanges(row), []);
  assert.equal(onlyInclusionChanged(row), true);
  const changed = { ...row, energy: { ...row.energy!, after: { ...activity, exerciseActiveKcal: "801.0001" } } };
  assert.deepEqual(energyChanges(changed).map(change => change.key), ["exerciseActiveKcal"]);
  assert.equal(onlyInclusionChanged(changed), false);
});
test("只比较采用中的字段，来源修改不冒充数值未改的包含核对", () => {
  const renamed = { ...row, energy: { ...row.energy!, after: { ...activity, sourceSystem: "另一个虚构设备" } } };
  assert.equal(onlyInclusionChanged(renamed), false);
  assert.deepEqual(energyChanges(renamed).map(change => change.label), ["来源"]);
  const day: EnergyDayRecord = { ...activity, entryMode: "total", totalKcal: "3085", activeKcal: "1027", restingKcal: "2058" };
  const daily = { ...row, energy: { ...row.energy!, before: day, after: { ...day, restingKcal: "9999", activeKcal: null, totalKcal: "3085.0000" } } };
  assert.deepEqual(energyChanges(daily), []);
});
test("按实际业务日期分组，保存范围区分新增消耗与更新运动并排除取消项", () => {
  const dayAction = { kind: "save_energy_day" as const, date: activity.date, restingKcal: "2058", activeKcal: "1027" };
  const day: RecordRow = { key: "day", action: dayAction, originalInput: dayAction, excluded: false, checked: false };
  const other: RecordRow = { ...day, key: "other", action: { ...dayAction, date: "2026-10-29" } };
  assert.deepEqual(energyReviewGroups([day, row, other]).map(group => [group.date, group.rows.length]), [["2026-10-30", 2], ["2026-10-29", 1]]);
  assert.equal(pendingChangesLabel([day, row, { ...other, excluded: true }]), "新增1条消耗 · 更新1项运动");
  assert.equal(pendingChangesLabel([{ ...day, persisted: true }, { ...row, excluded: true }]), "");
});
