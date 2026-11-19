import test from "node:test";
import assert from "node:assert/strict";
import { chartScale } from "@/components/chart-scale";
import { dayReadoutLeft, morningChangeScale, spacedTicks } from "./chart-geometry";

test("净收支柱从零起算并覆盖盈余与缺口，未知不改变数轴", () => {
  for (const values of [[], [0], [-156, -322, -1561], [1600, 2400], [-1000, 0, 200], [-100000, 1]]) {
    const scale = chartScale([...values, null]);
    assert.ok(scale.min < scale.max && scale.ticks.includes(0));
    assert.ok(values.every(value => value >= scale.min && value <= scale.max));
    assert.ok(spacedTicks(scale.ticks, scale.step, 86).includes(0));
  }
  assert.equal(chartScale([-156, -322, -1561]).max, 0);
  assert.equal(chartScale([1600, 2400]).min, 0);
});

test("次晨实测独立保留零线与正负变化", () => {
  for (const values of [[], [0], [-.2, -.04], [-.95, .12, 1.25]]) {
    const scale = morningChangeScale([...values, null]);
    assert.ok(scale.min < scale.max && scale.ticks.includes(0));
    assert.ok(values.every(value => value >= scale.min && value <= scale.max));
  }
});

test("日期明细靠边换侧，窄屏中间没有一整侧时仍留在绘图区内", () => {
  assert.ok(dayReadoutLeft(80, 1120, 226, false) > 80);
  assert.ok(dayReadoutLeft(1070, 1120, 226, false) + 226 < 1070);
  for (const x of [48, 150, 275]) {
    const left = dayReadoutLeft(x, 288, 212, true);
    assert.ok(left >= 8 && left + 212 <= 280);
  }
});
