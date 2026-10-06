import { buildMeasurementDays, type DailyMeasurement } from "./days";
import { addCalendarDays, calendarOrdinal, type MeasurementInterval, type MeasurementMetric } from "./trend";

export const ESTIMATION_METHOD = "linear-trend-v1";
export type LinearMeasurementModel = {
  sampleCount: number; meanDate: number; meanValue: number; slope: number;
  sumSquaredDates: number; residualVariance: number; criticalValue: number;
  samples: { id: string; date: string; value: string }[];
};
export type MetricPrediction = { value: string; lower: string; upper: string; model: LinearMeasurementModel };
export type EstimationMetadata = {
  method: typeof ESTIMATION_METHOD; confidenceLevel: 0.95; trainingRange: MeasurementInterval;
  weightKg: MetricPrediction; bodyFatPercent: MetricPrediction | null;
};

// NIST 双侧 95% Student-t 表，df=1..26；训练窗口最多 28 个日历日。
// https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm
const T_975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056];

export function fitMeasurementModel(samples: LinearMeasurementModel["samples"]): LinearMeasurementModel | null {
  const n = samples.length;
  if (n < 3 || n > 28 || new Set(samples.map((row) => row.date)).size !== n) return null;
  const points = samples.map((row) => ({ x: calendarOrdinal(row.date), y: Number(row.value) }));
  if (points.some((point) => !Number.isFinite(point.y))) return null;
  const meanDate = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanValue = points.reduce((sum, point) => sum + point.y, 0) / n;
  const sumSquaredDates = points.reduce((sum, point) => sum + (point.x - meanDate) ** 2, 0);
  if (sumSquaredDates === 0) return null;
  const slope = points.reduce((sum, point) => sum + (point.x - meanDate) * (point.y - meanValue), 0) / sumSquaredDates;
  const residualVariance = points.reduce((sum, point) => sum + (point.y - meanValue - slope * (point.x - meanDate)) ** 2, 0) / (n - 2);
  return { sampleCount: n, meanDate, meanValue, slope, sumSquaredDates, residualVariance, criticalValue: T_975[n - 3], samples };
}

export function predictMeasurement(model: LinearMeasurementModel, date: string): MetricPrediction {
  const distance = calendarOrdinal(date) - model.meanDate;
  const value = model.meanValue + model.slope * distance;
  const halfWidth = model.criticalValue * Math.sqrt(model.residualVariance * (1 + 1 / model.sampleCount + distance ** 2 / model.sumSquaredDates));
  const lower = Math.floor((value - halfWidth) * 100 + 1e-8) / 100;
  const upper = Math.ceil((value + halfWidth) * 100 - 1e-8) / 100;
  return { value: value.toFixed(2), lower: lower.toFixed(2), upper: upper.toFixed(2), model };
}

export function buildHistoricalEstimates(records: DailyMeasurement[], range: MeasurementInterval, trainingRange: MeasurementInterval) {
  if (calendarOrdinal(range.end) < calendarOrdinal(range.start) || calendarOrdinal(trainingRange.end) < calendarOrdinal(trainingRange.start) || calendarOrdinal(trainingRange.end) - calendarOrdinal(trainingRange.start) > 27 || range.start < trainingRange.start || range.end > trainingRange.end) {
    throw new Error("补全范围须位于最多 28 天的训练阶段内。");
  }
  const observed = records.filter((row) => row.recordKind !== "estimated");
  const days = buildMeasurementDays(observed.filter((row) => row.analysisDate >= trainingRange.start && row.analysisDate <= trainingRange.end)).reverse();
  const fit = (period: "daytime" | "evening", metric: MeasurementMetric) => fitMeasurementModel(days.map((day) => period === "daytime" ? day.daytimeRecord : day.eveningRecord)
    .filter((row): row is DailyMeasurement => row !== null && (period === "evening" || row.fasting === true) && row[metric] !== null)
    .map((row) => ({ id: row.id, date: row.analysisDate, value: row[metric]! })));
  const estimates: { analysisDate: string; period: "daytime" | "evening"; weightKg: string; bodyFatPercent: string | null; estimation: EstimationMetadata }[] = [];
  const warnings: string[] = [];
  for (const period of ["daytime", "evening"] as const) {
    const weight = fit(period, "weightKg"), fat = fit(period, "bodyFatPercent");
    for (let date = range.start; date <= range.end; date = addCalendarDays(date, 1)) {
      if (observed.some((row) => row.analysisDate === date && row.period === period)) continue;
      if (!weight) { warnings.push(`${date} ${period}：体重有效实测不足，未补全。`); continue; }
      const weightKg = predictMeasurement(weight, date), bodyFatPercent = fat ? predictMeasurement(fat, date) : null;
      if (Number(weightKg.value) <= 0 || Number(weightKg.value) > 99999.99 || (bodyFatPercent && (Number(bodyFatPercent.value) < 0 || Number(bodyFatPercent.value) > 100))) {
        warnings.push(`${date} ${period}：拟合值超出有效范围，未补全。`); continue;
      }
      if (!fat) warnings.push(`${date} ${period}：体脂有效实测不足，仅补体重。`);
      estimates.push({ analysisDate: date, period, weightKg: weightKg.value, bodyFatPercent: bodyFatPercent?.value ?? null,
        estimation: { method: ESTIMATION_METHOD, confidenceLevel: .95, trainingRange, weightKg, bodyFatPercent } });
    }
  }
  return { estimates, warnings };
}
