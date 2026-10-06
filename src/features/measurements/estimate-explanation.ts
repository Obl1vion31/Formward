import { isInitializationEstimate, predictMeasurement, type EstimationMetadata, type MetricEstimate } from "./estimation";
import { calendarOrdinal, type MeasurementMetric } from "./trend";

export function estimateLabel(metadata: EstimationMetadata | null) { return isInitializationEstimate(metadata) ? "历史初始化估计" : "估计"; }
export function estimateBasisLabel(metadata: EstimationMetadata | null, metric: MeasurementMetric) {
  if (!metadata) return "历史估计";
  if (metadata.method === "linear-trend-v1") return "历史趋势估计（旧版本）";
  const prediction = metadata[metric];
  if (!prediction) return "未估计";
  if (prediction.basis === "same-day-evening") return "同日晚间实测 − 个人典型晨晚差";
  if (prediction.basis === "same-day-morning") return "同日晨间实测 + 个人典型晨晚差";
  return `${prediction.interpolation ? "相邻真实晨间线性插值" : prediction.extrapolation ? "真实晨间受限线性外推" : "此前真实晨间最小二乘线性趋势"}${prediction.basis === "morning-trend-plus-difference" ? " + 个人典型晨晚差" : ""}`;
}
const compact = (value: number, digits = 6) => value.toFixed(digits).replace(/\.?0+$/, "") || "0";
const differenceNumber = (value: number) => value.toFixed(3).replace(/0$/, "");
export function estimateCalculation(prediction: MetricEstimate, date: string, metric: MeasurementMetric) {
  const unit = metric === "weightKg" ? "kg" : "%", delta = prediction.typicalDifference;
  const notes: string[] = [], references: string[] = [];
  let formula = "";
  if (prediction.anchor) {
    references.push(`${prediction.anchor.date} ${prediction.basis === "same-day-evening" ? "晚间" : "晨间空腹"}实测：${prediction.anchor.value} ${unit}`);
    if (delta) {
      const value = Number(prediction.anchor.value) + (prediction.basis === "same-day-evening" ? -delta.value : delta.value);
      const rounded = Math.abs(value - Number(prediction.value)) > 1e-9;
      formula = `${prediction.anchor.value} ${prediction.basis === "same-day-evening" ? "−" : "+"} (${differenceNumber(delta.value)}) = ${rounded ? `${value.toFixed(3)} → ` : ""}${prediction.value} ${unit}`;
    }
  } else if (prediction.interpolation) {
    const { left, right, value } = prediction.interpolation;
    const distance = calendarOrdinal(date) - calendarOrdinal(left.date), span = calendarOrdinal(right.date) - calendarOrdinal(left.date);
    formula = `${left.value} + (${right.value} − ${left.value}) × ${distance}/${span}${delta ? ` + (${differenceNumber(delta.value)})` : ""} ≈ ${prediction.value} ${unit}`;
    notes.push(`相邻晨间插值，目标距前一实测 ${distance} 天，两次实测间隔 ${span} 天${delta ? `；晨间中间值约 ${compact(value)} ${unit}` : ""}`);
    references.push(`${left.date} 晨间空腹实测：${left.value} ${unit}`, `${right.date} 晨间空腹实测：${right.value} ${unit}`);
  } else if (prediction.trend) {
    const model = prediction.trend, anchorDate = [...model.samples].sort((a, b) => a.date.localeCompare(b.date))[0].date;
    formula = `${compact(predictMeasurement(model, anchorDate))} + (${compact(model.slope)}) × ${calendarOrdinal(date) - calendarOrdinal(anchorDate)}${delta ? ` + (${differenceNumber(delta.value)})` : ""} ≈ ${prediction.value} ${unit}`;
    notes.push(`${model.sampleCount} 个真实晨间日，按实际日历日期做普通最小二乘拟合；公式以 ${anchorDate} 为第 0 天${prediction.extrapolation ? "，属于边界外推" : ""}`);
    references.push(...model.samples.map(row => `${row.date} 晨间空腹实测：${row.value} ${unit}`));
  }
  if (delta) {
    notes.push(`典型晨晚差：${delta.value > 0 ? "+" : ""}${differenceNumber(delta.value)} ${metric === "weightKg" ? "kg" : "个百分点"}，基于 ${delta.samples.length} 个真实晨晚配对日的中位数`);
    references.push(...delta.samples.map(row => `${row.date} 晨间 ${row.morning.value} → 晚间 ${row.evening.value} ${unit}，差 ${row.difference > 0 ? "+" : ""}${row.difference.toFixed(2)} ${metric === "weightKg" ? "kg" : "个百分点"}`));
  }
  if (prediction.fallbackReason) notes.push(prediction.fallbackReason);
  notes.push("中间值不提前舍入，最终显示两位小数");
  return { formula, notes, references };
}
