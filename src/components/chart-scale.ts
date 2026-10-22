export type ChartScale = { min: number; max: number; step: number; ticks: number[] };
/** 等距整倍数、包含零并覆盖全部数据；固定区间内不因选中日期改变。 */
export function chartScale(values: (number | string | null | undefined)[], unit: "kcal" | "kg" = "kcal"): ChartScale {
  const finite = values.filter(value => value != null).map(Number).filter(Number.isFinite);
  const low = Math.min(0, ...finite), high = Math.max(0, ...finite);
  if (high === low) return unit === "kg" ? { min: -.5, max: .5, step: .5, ticks: [-.5, 0, .5] } : { min: 0, max: 1000, step: 500, ticks: [0, 500, 1000] };
  const span = high - low;
  const power = 10 ** Math.floor(Math.log10(span / 4));
  const choices = (unit === "kg" ? [1, 2, 5, 10, 20, 50, 100] : [1, 1.5, 2, 2.5, 5, 10, 15, 20, 25, 50]).map(n => n * power).filter(step => step >= (unit === "kg" ? .1 : 1));
  let step = choices.find(step => Math.ceil(high / step) - Math.floor(low / step) <= 5) ?? Math.max(unit === "kg" ? .1 : 1, span);
  // 小幅负值只占一格，避免零附近拥挤；大负值仍完整显示。
  if (low < 0 && high > 0 && -low <= high) {
    const oneNegative = choices.find(candidate => candidate >= -low && Math.ceil(high / candidate) + 1 <= 5 && Math.ceil(high / candidate) + 1 >= 2);
    if (oneNegative !== undefined) step = oneNegative;
  }
  const min = Math.floor(low / step) * step, max = Math.ceil(high / step) * step;
  const round = (n: number) => Number(n.toPrecision(12));
  return { min: round(min), max: round(max), step: round(step), ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => round(min + i * step)) };
}
