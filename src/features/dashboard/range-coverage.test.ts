import assert from "node:assert/strict";
import { test } from "node:test";
import { rangeCoverage } from "./range-coverage";
import { overviewDays } from "./model";
import { emptyEnergy } from "../activities/model";
test("区间覆盖采用已有日级结果，明确0有效，不计未来；缺口按实际原因分开", () => {
  const days = overviewDays([], [], ["2024-08-01", "2024-08-02", "2024-08-03"], emptyEnergy());
  days[0].energyBalance = 0;
  const result = rangeCoverage(days, "2024-08-02"); assert.equal(result.total, 2); assert.equal(result.covered, 1); assert.equal(result.gaps.length, 1);
  assert.deepEqual(result.gaps[0], { date: "2024-08-02", meals: "尚无饮食记录", energy: "全天消耗未知" });
  assert.equal(rangeCoverage(days, "2024-07-31").total, 0);
});
