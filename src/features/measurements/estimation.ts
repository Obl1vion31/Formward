import { buildMeasurementDays, isRealMeasurementPair, type DailyMeasurement } from "./days";
import { addCalendarDays, calendarOrdinal, type MeasurementInterval, type MeasurementMetric } from "./trend";

export const ESTIMATION_METHOD = "morning-baseline-v2";
export const ESTIMATION_POLICY = { lookbackDays: 28, minimumSamples: 3, maximumMorningSamples: 7, maximumTrendGapDays: 7 } as const;
type Sample = { id: string; date: string; value: string };
export type LinearMeasurementModel = {
  sampleCount: number; meanDate: number; meanValue: number; slope: number; samples: Sample[];
};
type PairSample = { date: string; morning: Sample; evening: Sample; difference: number };
export type TypicalDifference = { value: number; samples: PairSample[] };
export type MetricEstimate = {
  value: string;
  basis: "same-day-morning" | "same-day-evening" | "morning-trend" | "morning-trend-plus-difference";
  anchor: Sample | null;
  trend: LinearMeasurementModel | null;
  typicalDifference: TypicalDifference | null;
};
export type MorningEstimationMetadata = {
  method: typeof ESTIMATION_METHOD;
  generatedAt: string;
  historyRange: MeasurementInterval;
  policy: typeof ESTIMATION_POLICY;
  weightKg: MetricEstimate | null;
  bodyFatPercent: MetricEstimate | null;
};
/** 已存历史快照可读；新估计不再计算预测区间。 */
export type LegacyEstimationMetadata = {
  method: "linear-trend-v1"; confidenceLevel: .95; trainingRange: MeasurementInterval;
  weightKg: { value: string; lower: string; upper: string; model: LinearMeasurementModel & { sumSquaredDates: number; residualVariance: number; criticalValue: number } };
  bodyFatPercent: LegacyEstimationMetadata["weightKg"] | null;
};
export type EstimationMetadata = MorningEstimationMetadata | LegacyEstimationMetadata;
export type HistoricalEstimate = {
  analysisDate: string; period: "daytime" | "evening";
  weightKg: string | null; bodyFatPercent: string | null; estimation: MorningEstimationMetadata;
};

export function validMetricValue(value: string | null, metric: MeasurementMetric) {
  if (value === null || value.trim() === "") return false;
  const number = Number(value);
  return Number.isFinite(number) && (metric === "weightKg" ? number > 0 && number <= 99999.99 : number >= 0 && number <= 100);
}

export function fitMeasurementModel(samples: Sample[]): LinearMeasurementModel | null {
  const n = samples.length;
  if (n < ESTIMATION_POLICY.minimumSamples || n > ESTIMATION_POLICY.maximumMorningSamples || new Set(samples.map((row) => row.date)).size !== n) return null;
  const points = samples.map((row) => ({ x: calendarOrdinal(row.date), y: Number(row.value) }));
  if (points.some((point) => !Number.isFinite(point.y))) return null;
  const meanDate = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanValue = points.reduce((sum, point) => sum + point.y, 0) / n;
  const sumSquaredDates = points.reduce((sum, point) => sum + (point.x - meanDate) ** 2, 0);
  if (!sumSquaredDates) return null;
  const slope = points.reduce((sum, point) => sum + (point.x - meanDate) * (point.y - meanValue), 0) / sumSquaredDates;
  return { sampleCount: n, meanDate, meanValue, slope, samples };
}

export function predictMeasurement(model: LinearMeasurementModel, date: string) {
  return model.meanValue + model.slope * (calendarOrdinal(date) - model.meanDate);
}

export function typicalMorningEveningDifference(records: DailyMeasurement[], date: string, metric: MeasurementMetric): TypicalDifference | null {
  const start = addCalendarDays(date, -ESTIMATION_POLICY.lookbackDays);
  const samples = buildMeasurementDays(records.filter((row) => row.recordKind !== "estimated" && row.analysisDate >= start && row.analysisDate < date))
    .flatMap((day) => {
      const morning = day.daytimeRecord, evening = day.eveningRecord;
      if (!isRealMeasurementPair(morning, evening) || !morning || !evening || !validMetricValue(morning[metric], metric) || !validMetricValue(evening[metric], metric)) return [];
      return [{ date: day.date, morning: { id: morning.id, date: day.date, value: morning[metric]! }, evening: { id: evening.id, date: day.date, value: evening[metric]! },
        difference: (Math.round(Number(evening[metric]) * 100) - Math.round(Number(morning[metric]) * 100)) / 100 }];
    });
  if (samples.length < ESTIMATION_POLICY.minimumSamples) return null;
  const ordered = samples.map((row) => row.difference).sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return { value: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2, samples };
}

/** 只读取真实晨间；当天及未来值不会进入回归，生成的估计也不会回灌。 */
function morningTrend(records: DailyMeasurement[], date: string, metric: MeasurementMetric) {
  const start = addCalendarDays(date, -ESTIMATION_POLICY.lookbackDays);
  const samples = buildMeasurementDays(records.filter((row) => row.recordKind !== "estimated" && row.analysisDate >= start && row.analysisDate < date))
    .map((day) => day.daytimeRecord)
    .filter((row): row is DailyMeasurement => !!row && row.fasting === true && validMetricValue(row[metric], metric))
    .slice(0, ESTIMATION_POLICY.maximumMorningSamples)
    .map((row) => ({ id: row.id, date: row.analysisDate, value: row[metric]! }));
  if (!samples.length || calendarOrdinal(date) - calendarOrdinal(samples[0].date) > ESTIMATION_POLICY.maximumTrendGapDays) return null;
  return fitMeasurementModel(samples);
}

export function buildHistoricalEstimates(records: DailyMeasurement[], range: MeasurementInterval, options: { preserveExisting?: boolean; generatedAt?: string } = {}) {
  const span = calendarOrdinal(range.end) - calendarOrdinal(range.start);
  if (span < 0 || span > 365) throw new Error("补全范围须为顺序有效且不超过 366 天的日期区间。");
  const observed = records.filter((row) => row.recordKind !== "estimated");
  const days = new Map(buildMeasurementDays(observed).map((day) => [day.date, day]));
  const estimates: HistoricalEstimate[] = [], warnings: string[] = [];
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  for (let date = range.start; date <= range.end; date = addCalendarDays(date, 1)) {
    const day = days.get(date);
    const result: Record<"daytime" | "evening", Record<MeasurementMetric, MetricEstimate | null>> = {
      daytime: { weightKg: null, bodyFatPercent: null }, evening: { weightKg: null, bodyFatPercent: null },
    };
    for (const metric of ["weightKg", "bodyFatPercent"] as const) {
      const morning = day?.daytimeRecord ?? null, evening = day?.eveningRecord ?? null;
      const usable = (row: DailyMeasurement | null, fasting: boolean) => !!row && row.fasting === fasting && validMetricValue(row[metric], metric);
      const canFill = (period: "daytime" | "evening") => {
        const candidates = day?.[period] ?? [], row = period === "daytime" ? morning : evening;
        return !candidates.length || (candidates.length === 1 && !!row && row.fasting === (period === "daytime") && row[metric] === null);
      };
      const morningReal = usable(morning, true), eveningReal = usable(evening, false);
      const delta = typicalMorningEveningDifference(observed, date, metric);
      let baseline: number | null = morningReal ? Number(morning![metric]) : null;
      let trend: LinearMeasurementModel | null = null;
      const sample = (row: DailyMeasurement): Sample => ({ id: row.id, date: row.analysisDate, value: row[metric]! });
      const save = (period: "daytime" | "evening", value: number, evidence: Omit<MetricEstimate, "value">) => {
        const rounded = (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
        if (validMetricValue(rounded, metric)) result[period][metric] = { value: rounded, ...evidence };
        else warnings.push(`${date} ${period} ${metric}：估计超出有效范围，保留缺项。`);
      };
      if (!morningReal && canFill("daytime")) {
        if (eveningReal) {
          if (delta) {
            baseline = Number(evening![metric]) - delta.value;
            save("daytime", baseline, { basis: "same-day-evening", anchor: sample(evening!), trend: null, typicalDifference: delta });
          }
        } else {
          trend = morningTrend(observed, date, metric);
          if (trend) {
            baseline = predictMeasurement(trend, date);
            save("daytime", baseline, { basis: "morning-trend", anchor: null, trend, typicalDifference: null });
            if (!result.daytime[metric]) baseline = null;
          }
        }
      }
      if (!eveningReal && canFill("evening") && baseline !== null && delta) {
        save("evening", baseline + delta.value, { basis: morningReal ? "same-day-morning" : "morning-trend-plus-difference", anchor: morningReal ? sample(morning!) : null, trend, typicalDifference: delta });
      }
      for (const period of ["daytime", "evening"] as const) {
        if (canFill(period) && !result[period][metric]) warnings.push(`${date} ${period} ${metric}：近期有效实测不足，保留缺项。`);
      }
    }
    for (const period of ["daytime", "evening"] as const) {
      if (options.preserveExisting !== false && records.some((row) => row.recordKind === "estimated" && row.analysisDate === date && row.period === period)) continue;
      const prediction = result[period];
      if (!prediction.weightKg && !prediction.bodyFatPercent) continue;
      estimates.push({ analysisDate: date, period, weightKg: prediction.weightKg?.value ?? null, bodyFatPercent: prediction.bodyFatPercent?.value ?? null,
        estimation: { method: ESTIMATION_METHOD, generatedAt, historyRange: { start: addCalendarDays(date, -ESTIMATION_POLICY.lookbackDays), end: addCalendarDays(date, -1) }, policy: ESTIMATION_POLICY, ...prediction } });
    }
  }
  return { estimates, warnings };
}
