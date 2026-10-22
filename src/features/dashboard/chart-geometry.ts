import type { ChartScale } from "@/components/chart-scale";

/** 折线范围独立于主刻度；半步边界减少凑整造成的无效留白。 */
export function energyLineScale(values: (number | string | null | undefined)[], unit: "kcal" | "kg" = "kcal"): ChartScale {
  const numbers = values.filter(value => value != null).map(Number).filter(Number.isFinite);
  if (!numbers.length) return unit === "kg" ? { min: -.5, max: .5, step: .5, ticks: [-.5, 0, .5] } : { min: 0, max: 1000, step: 500, ticks: [0, 500, 1000] };
  const low = Math.min(...numbers), high = Math.max(...numbers), padding = Math.max(unit === "kg" ? .1 : 100, (high - low) * .05);
  const bottom = unit === "kg" ? Math.min(0, low - padding) : Math.max(0, low - padding), top = unit === "kg" ? Math.max(0, high + padding) : high + padding;
  const span = top - bottom, power = 10 ** Math.floor(Math.log10(span / 5)), minimum = unit === "kg" ? .1 : 1;
  const choices = [...new Set([1, 2, 2.5, 5, 10, 20, 25, 50, 100].map(n => Math.max(minimum, n * power)))];
  const round = (n: number) => Number(n.toPrecision(12));
  for (const step of choices) {
    const half = step / 2, min = round(Math.floor(bottom / half) * half), max = round(Math.ceil(top / half) * half);
    const first = Math.ceil((min - step * 1e-10) / step) * step, count = Math.floor((max - first + step * 1e-10) / step) + 1;
    if (count < 3 || count > 6) continue;
    return { min, max, step: round(step), ticks: Array.from({ length: count }, (_, i) => round(first + i * step)) };
  }
  return { min: bottom, max: top, step: span, ticks: [bottom, top] };
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
