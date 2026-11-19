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

/** 刻度减量只影响标签密度，零线始终可见。 */
export function spacedTicks(ticks: number[], step: number, height: number) {
  const stride = Math.max(1, Math.ceil(24 * (ticks.length - 1) / height));
  return ticks.filter(tick => Math.abs(tick / (step * stride) - Math.round(tick / (step * stride))) < 1e-8);
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
