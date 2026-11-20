import type { ChartScale } from "@/components/chart-scale";

/** 次晨变化保留零线和实测范围，半步边界减少凑整带来的空白。 */
export function morningChangeScale(values: (number | null)[]): ChartScale {
  const numbers = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!numbers.length) return { min: -.5, max: .5, step: .5, ticks: [-.5, 0, .5] };
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  const padding = Math.max(.1, (high - low) * .05);
  const bottom = Math.min(0, low - padding);
  const top = Math.max(0, high + padding);
  const span = top - bottom;
  const power = 10 ** Math.floor(Math.log10(span / 5));
  const choices = [...new Set([1, 2, 2.5, 5, 10, 20, 25, 50, 100].map(n => Math.max(.1, n * power)))];
  const round = (n: number) => Number(n.toPrecision(12));
  for (const step of choices) {
    const half = step / 2;
    const min = round(Math.floor(bottom / half) * half);
    const max = round(Math.ceil(top / half) * half);
    const first = Math.ceil((min - step * 1e-10) / step) * step;
    const count = Math.floor((max - first + step * 1e-10) / step) + 1;
    if (count >= 3 && count <= 6) {
      return { min, max, step: round(step), ticks: Array.from({ length: count }, (_, i) => round(first + i * step)) };
    }
  }
  return { min: bottom, max: top, step: span, ticks: [bottom, top] };
}

/** 零线固定。刻度按实际像素间距取舍，短图仍留可读的参照值。 */
export function spacedTicks(scale: ChartScale, height: number, minimumGap = 48) {
  const span = scale.max - scale.min;
  const spacing = Math.min(minimumGap, height / 2);
  const stride = Math.max(1, Math.ceil(spacing / (scale.step * height / span) - 1e-8));
  const step = scale.step * stride;
  const visible = scale.ticks.filter(tick => tick !== 0 && Math.abs(tick / step - Math.round(tick / step)) < 1e-8);
  if (!visible.length) {
    const farthest = scale.ticks.reduce((end, tick) => Math.abs(tick) > Math.abs(end) ? tick : end, 0);
    if (farthest !== 0 && Math.abs(farthest) * height / span >= Math.min(minimumGap / 2, spacing)) visible.push(farthest);
  }
  return [0, ...visible].sort((a, b) => a - b);
}

/** 紧凑图只标一个与零线分开的整档，绘图上下限仍用于保留留白。 */
export function compactReferenceTick(scale: ChartScale, height: number) {
  const span = scale.max - scale.min;
  const extent = scale.max >= -scale.min ? scale.max : scale.min;
  const ideal = extent * 2 / 3;
  const eligible = scale.ticks.filter(tick => tick !== 0 && Math.abs(tick) * height / span >= 18);
  return eligible.reduce<number | null>((best, tick) =>
    best === null || Math.abs(tick - ideal) < Math.abs(best - ideal) ? tick : best, null);
}

export function dayReadoutLeft(x: number, width: number, cardWidth: number, compact: boolean) {
  const inset = 8;
  const gap = compact ? 12 : 15;
  const limit = width - cardWidth - inset;
  const before = x - gap - cardWidth;
  const after = x + gap;
  if (!compact && after <= limit) return after;
  if (before >= inset) return before;
  if (after <= limit) return after;
  return x < width / 2 ? limit : inset;
}
