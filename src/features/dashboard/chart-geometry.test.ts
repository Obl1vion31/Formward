import test from "node:test";
import assert from "node:assert/strict";
import { energyLineScale, energyBands, linePath, fadeEdgeFraction, missingRuns, type EnergyPoint } from "./chart-geometry";

test("折线刻度覆盖空值、常数、零和极值，完整区间内最多六个整倍数刻度", () => {
  for (const values of [[], [null, undefined], [0], [2600, 2600], [2058, 3000], [0, 100000], [100, 50000, null]]) {
    const scale = energyLineScale(values);
    assert.ok(scale.min < scale.max && scale.ticks.length <= 6);
    assert.ok(scale.ticks.every((n, i) => !i || Math.abs(n - scale.ticks[i - 1] - scale.step) < 1e-8));
    for (const n of values) if (n != null) assert.ok(n >= scale.min && n <= scale.max);
  }
  assert.ok(energyLineScale([2500, 2800]).min > 0);
});
const point = (x: number, balance: number): EnergyPoint => ({ intake: { x, y: 100 - balance }, expenditure: { x, y: 100 }, balance });
test("盈余和缺口在真实交点分区，零不制造区域，未知不补齐", () => {
  assert.equal(energyBands(point(0, 200), point(100, 300))[0].positive, true);
  assert.equal(energyBands(point(0, -200), point(100, -300))[0].positive, false);
  const bands = energyBands(point(0, 200), point(100, -800));
  assert.deepEqual(bands.map(b => b.positive), [true, false]);
  assert.deepEqual(bands[0].points[1], { x: 20, y: 100 });
  assert.deepEqual(bands[0].points[1], bands[1].points[0]);
  assert.equal(energyBands(point(0, 0), point(100, -100))[0].positive, false);
  assert.deepEqual(energyBands(point(0, 0), point(100, 0)), []);
  assert.deepEqual(energyBands(point(0, 200), null), []);
});
test("断线与缺测标记不跨过空日期，孤立记录保留自己的位置", () => {
  assert.equal(linePath([{ x: 1, y: 3 }, null, { x: 3, y: 5 }, { x: 4, y: 6 }]), "M1,3  M3,5 L4,6");
  assert.deepEqual(missingRuns([false, false, true, false, true, false, false]), [{ start: 0, end: 1 }, { start: 3, end: 3 }, { start: 5, end: 6 }]);
  assert.deepEqual(missingRuns([true]), []);
  assert.deepEqual(missingRuns([false]), [{ start: 0, end: 0 }]);
  for (const width of [1, 7, 30, 100, 2000]) {
    assert.ok(fadeEdgeFraction(width) <= .25);
    assert.ok(fadeEdgeFraction(width) * width <= 8);
  }
});

test("真实波动形态不会为凑主刻度扩张到0至6000，kg保留零且覆盖峰谷", () => {
 const kcal=energyLineScale([920,2100,3100,4120,2600]);
 assert.ok(kcal.min > 0 && kcal.max < 6000);
 assert.deepEqual(kcal.ticks,[1000,2000,3000,4000]);
 const kg=energyLineScale([-.95,.12,1.25,null],"kg");
 assert.ok(kg.min<=-.95 && kg.max>=1.25 && kg.ticks.includes(0));
});
