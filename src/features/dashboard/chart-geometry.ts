import type { ChartScale } from "@/components/chart-scale";

/** 折线取完整区间并留余量；不改变其他页面柱图包含零点的刻度。 */
export function energyLineScale(values: (number | string | null | undefined)[]): ChartScale {
  const numbers = values.filter(value => value != null).map(Number).filter(Number.isFinite);
  if (!numbers.length) return { min: 0, max: 1000, step: 500, ticks: [0, 500, 1000] };
  const low = Math.min(...numbers), high = Math.max(...numbers), padding = Math.max(200, (high - low) * .12);
  const bottom = Math.max(0, low - padding), top = Math.max(bottom + 1, high + padding);
  const power = 10 ** Math.floor(Math.log10((top - bottom) / 4));
  const step = [1, 2, 5, 10, 20, 50].map(n => Math.max(1, n * power)).find(n => Math.ceil(top / n) - Math.floor(bottom / n) <= 4)!;
  const min = Math.floor(bottom / step) * step, max = Math.ceil(top / step) * step;
  return { min, max, step, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step) };
}

export type Point = { x: number; y: number };
export type EnergyPoint = { intake: Point; expenditure: Point; balance: number };
export type Band = { points: Point[]; positive: boolean };
/** 只在相邻两个日期都有完整收支时填色，在真实交点处分成两个区域。 */
export function energyBands(a: EnergyPoint | null, b: EnergyPoint | null): Band[] {
  if (!a || !b || a.balance === 0 && b.balance === 0) return [];
  if (a.balance * b.balance < 0) {
    const t = a.balance / (a.balance - b.balance);
    const cross = { x: a.intake.x + (b.intake.x - a.intake.x) * t, y: a.intake.y + (b.intake.y - a.intake.y) * t };
    return [{ points: [a.intake, cross, a.expenditure], positive: a.balance > 0 }, { points: [cross, b.intake, b.expenditure], positive: b.balance > 0 }];
  }
  return [{ points: [a.intake, b.intake, b.expenditure, a.expenditure], positive: (a.balance || b.balance) > 0 }];
}

export function linePath(points: (Point | null)[]) {
  return points.map((point, index) => point ? `${index && points[index - 1] ? "L" : "M"}${point.x},${point.y}` : "").join(" ");
}
/** 淡出仅占相邻有效日期之间的一小段，绝不延伸到缺测日期。 */
export function fadeEdgeFraction(segmentWidth: number) { return Math.min(.25, 8 / Math.max(1, segmentWidth)); }
export function missingRuns(present: boolean[]) {
  const runs: { start: number; end: number }[] = [];
  present.forEach((value, index) => {
    if (value) return;
    if (index && !present[index - 1]) runs[runs.length - 1].end = index;
    else runs.push({ start: index, end: index });
  });
  return runs;
}
