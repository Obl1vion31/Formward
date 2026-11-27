import test from "node:test";
import assert from "node:assert/strict";
import { chartScale } from "@/components/chart-scale";
import { compactReferenceTick, morningChangeScale, spacedTicks } from "./chart-geometry";

test("净收支柱从零起算并覆盖盈余与缺口，未知不改变数轴", () => {
  for (const values of [[], [0], [-156, -322, -1561], [1600, 2400], [-1000, 0, 200], [-100000, 1]]) {
    const scale = chartScale([...values, null]);
    assert.ok(scale.min < scale.max && scale.ticks.includes(0));
    assert.ok(values.every(value => value >= scale.min && value <= scale.max));
    assert.ok(spacedTicks(scale, 86).includes(0));
  }
  const deficits = chartScale([-156, -322, -1561]);
  assert.equal(deficits.max, 0);
  assert.deepEqual(spacedTicks(deficits, 114), [-2000, -1000, 0]);
  assert.deepEqual(spacedTicks(deficits, 191), [-2000, -1000, 0]);
  assert.equal(chartScale([1600, 2400]).min, 0);
});

test("次晨实测独立保留零线与正负变化", () => {
  for (const values of [[], [0], [-.2, -.04], [-.95, .12, 1.25]]) {
    const scale = morningChangeScale([...values, null]);
    assert.ok(scale.min < scale.max && scale.ticks.includes(0));
    assert.ok(values.every(value => value >= scale.min && value <= scale.max));
    const ticks = spacedTicks(scale, 56);
    const span = scale.max - scale.min;
    assert.ok(ticks.includes(0));
    assert.ok(ticks.every((tick, i) => i === 0 || (tick - ticks[i - 1]) * 56 / span >= 24 - 1e-8));
  }
});

test("手机用整档参照，紧凑刻度不把绘图边界当作数据", () => {
  const energy = chartScale([-78, 0, 242, -422]);
  const weight = morningChangeScale([-.10, .04, .16]);
  assert.equal(compactReferenceTick(energy, 132), -300);
  assert.equal(compactReferenceTick(weight, 68), .2);
  for (const values of [[], [0], [-.95, .12, 1.25], [.62, -.46], [10, 12], [-22, -.1]]) {
    const scale = morningChangeScale(values);
    const tick = compactReferenceTick(scale, 56);
    assert.ok(tick !== null && tick !== 0 && scale.ticks.includes(tick));
    assert.ok(Math.abs(tick) * 56 / (scale.max - scale.min) >= 18);
  }
});
