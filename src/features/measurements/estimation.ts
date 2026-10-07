import { buildMeasurementDays, isRealMeasurementPair, type DailyMeasurement } from "./days";
import { addCalendarDays, calendarOrdinal, type MeasurementInterval, type MeasurementMetric } from "./trend";

export const ESTIMATION_METHOD = "morning-baseline-v3";
export const INITIALIZATION_METHOD = "historical-initialization-v1";
export const ESTIMATION_POLICY = { lookbackDays: 28, minimumSamples: 3, maximumMorningSamples: 7, maximumTrendGapDays: 7 } as const;
export const INITIALIZATION_POLICY = { lookbackDays: 28, minimumSamples: 3, maximumMorningSamples: 3, maximumTrendGapDays: 7, maximumInterpolationGapDays: 28, differenceScope: "initialization-range" } as const;
export type Sample = { id: string; date: string; value: string };
export type LinearMeasurementModel = { sampleCount: number; meanDate: number; meanValue: number; slope: number; samples: Sample[] };
export type LinearInterpolation = { left: Sample; right: Sample; fraction: number; value: number };
type PairSample = { date: string; morning: Sample; evening: Sample; difference: number };
export type TypicalDifference = { value: number; samples: PairSample[] };
export type MetricEstimate = {
  value: string;
  basis: "same-day-morning" | "same-day-evening" | "morning-trend" | "morning-trend-plus-difference";
  anchor: Sample | null; trend: LinearMeasurementModel | null; typicalDifference: TypicalDifference | null;
  interpolation?: LinearInterpolation | null;
  extrapolation?: boolean;
  fallbackReason?: string | null;
  availablePairCount?: number;
  usesFutureData?: boolean;
};
type BaselineMetadata = {
  generatedAt: string; historyRange: MeasurementInterval;
  weightKg: MetricEstimate | null; bodyFatPercent: MetricEstimate | null;
};
export type MorningEstimationMetadata = BaselineMetadata & { method: typeof ESTIMATION_METHOD; mode: "normal"; policy: typeof ESTIMATION_POLICY };
export type InitializationEstimationMetadata = BaselineMetadata & {
  method: typeof INITIALIZATION_METHOD; mode: "historical-initialization"; policy: typeof INITIALIZATION_POLICY;
  batchId: string; sourceDigest: string; frozen: true;
};
type PreviousMorningMetadata = BaselineMetadata & { method: "morning-baseline-v2"; policy: typeof ESTIMATION_POLICY };
/** 历史快照只读兼容，新估计不计算预测区间。 */
export type LegacyEstimationMetadata = {
  method: "linear-trend-v1"; confidenceLevel: .95; trainingRange: MeasurementInterval;
  weightKg: { value: string; lower: string; upper: string; model: LinearMeasurementModel & { sumSquaredDates: number; residualVariance: number; criticalValue: number } } | null;
  bodyFatPercent: LegacyEstimationMetadata["weightKg"] | null;
};
export type EstimationMetadata = MorningEstimationMetadata | InitializationEstimationMetadata | PreviousMorningMetadata | LegacyEstimationMetadata;
export type HistoricalEstimate = {
  analysisDate: string; period: "daytime" | "evening"; weightKg: string | null; bodyFatPercent: string | null;
  estimation: MorningEstimationMetadata | InitializationEstimationMetadata;
};
export type EstimationOutcome = {
  date: string; period: "daytime" | "evening"; metric: MeasurementMetric;
  status: "observed" | "estimated" | "missing"; value: string | null; reason: string | null; evidence: MetricEstimate | null;
};
export const isInitializationEstimate = (metadata: EstimationMetadata | null): metadata is InitializationEstimationMetadata => metadata?.method === INITIALIZATION_METHOD;
export function validMetricValue(value: string | null, metric: MeasurementMetric) {
  if (value === null || value.trim() === "") return false;
  const number = Number(value);
  return Number.isFinite(number) && (metric === "weightKg" ? number > 0 && number <= 99999.99 : number >= 0 && number <= 100);
}
export function roundedMetric(value: number) { return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2); }
export function fitMeasurementModel(samples: Sample[]): LinearMeasurementModel | null {
  const n = samples.length;
  if (n < ESTIMATION_POLICY.minimumSamples || n > ESTIMATION_POLICY.maximumMorningSamples || new Set(samples.map(row => row.date)).size !== n) return null;
  const points = samples.map(row => ({ x: calendarOrdinal(row.date), y: Number(row.value) }));
  if (points.some(point => !Number.isFinite(point.y))) return null;
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
function sample(row: DailyMeasurement, metric: MeasurementMetric): Sample { return { id: row.id, date: row.analysisDate, value: row[metric]! }; }
function realPairs(records: DailyMeasurement[], metric: MeasurementMetric): PairSample[] {
  return buildMeasurementDays(records.filter(row => row.recordKind !== "estimated")).flatMap(day => {
    const morning = day.daytimeRecord, evening = day.eveningRecord;
    if (!morning || !evening || !isRealMeasurementPair(morning, evening) || !validMetricValue(morning[metric], metric) || !validMetricValue(evening[metric], metric)) return [];
    return [{ date: day.date, morning: sample(morning, metric), evening: sample(evening, metric),
      difference: (Math.round(Number(evening[metric]) * 100) - Math.round(Number(morning[metric]) * 100)) / 100 }];
  });
}
function typicalDifference(samples: PairSample[]): TypicalDifference | null {
  if (samples.length < ESTIMATION_POLICY.minimumSamples) return null;
  const ordered = samples.map(row => row.difference).sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  return { value: ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2, samples };
}
export function typicalMorningEveningDifference(records: DailyMeasurement[], date: string, metric: MeasurementMetric) {
  return typicalDifference(realPairs(records.filter(row => row.analysisDate >= addCalendarDays(date, -ESTIMATION_POLICY.lookbackDays) && row.analysisDate < date), metric));
}
function morningSamples(records: DailyMeasurement[], metric: MeasurementMetric) {
  return buildMeasurementDays(records.filter(row => row.recordKind !== "estimated")).map(day => day.daytimeRecord)
    .filter((row): row is DailyMeasurement => !!row && row.fasting === true && validMetricValue(row[metric], metric)).map(row => sample(row, metric));
}
/** 只读取此前真实晨间；估计和未来值不会回灌。 */
function morningTrend(records: DailyMeasurement[], date: string, metric: MeasurementMetric) {
  const samples = morningSamples(records.filter(row => row.analysisDate >= addCalendarDays(date, -ESTIMATION_POLICY.lookbackDays) && row.analysisDate < date), metric).slice(0, ESTIMATION_POLICY.maximumMorningSamples);
  if (!samples.length || calendarOrdinal(date) - calendarOrdinal(samples[0].date) > ESTIMATION_POLICY.maximumTrendGapDays) return null;
  return fitMeasurementModel(samples);
}
function initializationMorning(records: DailyMeasurement[], date: string, metric: MeasurementMetric) {
  const target = calendarOrdinal(date);
  const samples = morningSamples(records, metric).filter(row => Math.abs(calendarOrdinal(row.date) - target) <= INITIALIZATION_POLICY.lookbackDays).sort((a, b) => a.date.localeCompare(b.date));
  const left = samples.filter(row => row.date < date).at(-1), right = samples.find(row => row.date > date);
  if (left && right) {
    const span = calendarOrdinal(right.date) - calendarOrdinal(left.date);
    if (span > INITIALIZATION_POLICY.maximumInterpolationGapDays) return null;
    const fraction = (target - calendarOrdinal(left.date)) / span;
    const value = Number(left.value) + (Number(right.value) - Number(left.value)) * fraction;
    return { value, trend: null, interpolation: { left, right, fraction, value }, extrapolation: false };
  }
  const nearest = [...samples].sort((a, b) => Math.abs(calendarOrdinal(a.date) - target) - Math.abs(calendarOrdinal(b.date) - target) || a.date.localeCompare(b.date)).slice(0, INITIALIZATION_POLICY.maximumMorningSamples);
  if (!nearest.length || Math.abs(calendarOrdinal(nearest[0].date) - target) > INITIALIZATION_POLICY.maximumTrendGapDays) return null;
  const trend = fitMeasurementModel(nearest);
  return trend ? { value: predictMeasurement(trend, date), trend, interpolation: null, extrapolation: true } : null;
}
function references(evidence: Omit<MetricEstimate, "value">) {
  return [evidence.anchor, ...(evidence.trend?.samples ?? []), evidence.interpolation?.left, evidence.interpolation?.right,
    ...(evidence.typicalDifference?.samples.flatMap(row => [row.morning, row.evening]) ?? [])].filter((row): row is Sample => !!row);
}
type BuildOptions = { preserveExisting?: boolean; generatedAt?: string; frozenRange?: MeasurementInterval };
type InitializationContext = { batchId: string; sourceDigest: string };
/** 两个公开入口分别限制来源；未来数据权限只存在于初始化入口。 */
function buildEstimates(records: DailyMeasurement[], range: MeasurementInterval, options: BuildOptions, initialization?: InitializationContext) {
  const span = calendarOrdinal(range.end) - calendarOrdinal(range.start);
  if (span < 0 || span > 365) throw new Error("补全范围须为顺序有效且不超过 366 天的日期区间。");
  const observed = records.filter(row => row.recordKind !== "estimated" && (!initialization || (row.analysisDate >= range.start && row.analysisDate <= range.end)));
  const days = new Map(buildMeasurementDays(observed).map(day => [day.date, day]));
  const estimates: HistoricalEstimate[] = [], warnings: string[] = [], outcomes: EstimationOutcome[] = [];
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  for (let date = range.start; date <= range.end; date = addCalendarDays(date, 1)) {
    if (!initialization && options.frozenRange && date >= options.frozenRange.start && date <= options.frozenRange.end) continue;
    const day = days.get(date);
    const result: Record<"daytime" | "evening", Record<MeasurementMetric, MetricEstimate | null>> = { daytime: { weightKg: null, bodyFatPercent: null }, evening: { weightKg: null, bodyFatPercent: null } };
    for (const metric of ["weightKg", "bodyFatPercent"] as const) {
      const morning = day?.daytimeRecord ?? null, evening = day?.eveningRecord ?? null;
      const usable = (row: DailyMeasurement | null, fasting: boolean) => !!row && row.fasting === fasting && validMetricValue(row[metric], metric);
      const canFill = (period: "daytime" | "evening") => {
        const candidates = day?.[period] ?? [], row = period === "daytime" ? morning : evening;
        return !candidates.length || (candidates.length === 1 && !!row && row.fasting === (period === "daytime") && row[metric] === null);
      };
      const morningReal = usable(morning, true), eveningReal = usable(evening, false);
      const pairs = realPairs(initialization ? observed : observed.filter(row => row.analysisDate >= addCalendarDays(date, -ESTIMATION_POLICY.lookbackDays) && row.analysisDate < date), metric);
      const delta = typicalDifference(pairs);
      let baseline: number | null = morningReal ? Number(morning![metric]) : null;
      let trend: LinearMeasurementModel | null = null, interpolation: LinearInterpolation | null = null, extrapolation = false;
      const reasons: Partial<Record<"daytime" | "evening", string>> = {};
      const save = (period: "daytime" | "evening", value: number, evidence: Omit<MetricEstimate, "value">) => {
        const rounded = roundedMetric(value);
        if (validMetricValue(rounded, metric)) result[period][metric] = { value: rounded, ...evidence, availablePairCount: pairs.length, usesFutureData: references(evidence).some(row => row.date > date) };
        else reasons[period] = "估计超出有效范围";
      };
      if (!morningReal && canFill("daytime")) {
        if (eveningReal && delta) {
          baseline = Number(evening![metric]) - delta.value;
          save("daytime", baseline, { basis: "same-day-evening", anchor: sample(evening!, metric), trend: null, typicalDifference: delta });
        } else {
          const historical = initialization ? initializationMorning(observed, date, metric) : null;
          trend = initialization ? historical?.trend ?? null : morningTrend(observed, date, metric);
          interpolation = historical?.interpolation ?? null; extrapolation = historical?.extrapolation ?? false;
          if (historical || trend) {
            baseline = historical?.value ?? predictMeasurement(trend!, date);
            save("daytime", baseline, { basis: "morning-trend", anchor: null, trend, interpolation, extrapolation, typicalDifference: null,
              fallbackReason: eveningReal ? `有效晨晚配对仅 ${pairs.length} 日，不足 3 日，改用真实晨间趋势` : null });
          }
        }
        if (!result.daytime[metric]) baseline = null;
      }
      if (!eveningReal && canFill("evening") && baseline !== null && delta) {
        save("evening", baseline + delta.value, { basis: morningReal ? "same-day-morning" : "morning-trend-plus-difference", anchor: morningReal ? sample(morning!, metric) : null, trend, interpolation, extrapolation, typicalDifference: delta });
      }
      for (const period of ["daytime", "evening"] as const) {
        const row = period === "daytime" ? morning : evening, estimate = result[period][metric];
        const realValue = row && validMetricValue(row[metric], metric) ? row[metric] : null;
        const reason = realValue || estimate ? null : reasons[period] ?? (!canFill(period) ? "真实候选未解决或测量条件不明" : period === "evening" && baseline !== null && !delta ? `有效晨晚配对仅 ${pairs.length} 日，不足 3 日` : initialization ? "缺少满足距离与样本门槛的真实晨间依据" : "此前 28 天真实晨间不足 3 日或最新实测距目标超过 7 天");
        outcomes.push({ date, period, metric, status: realValue ? "observed" : estimate ? "estimated" : "missing", value: realValue ?? estimate?.value ?? null, reason, evidence: estimate });
        if (reason) warnings.push(`${date} ${period} ${metric}：${reason}，保留缺项。`);
      }
    }
    for (const period of ["daytime", "evening"] as const) {
      if (options.preserveExisting !== false && records.some(row => row.recordKind === "estimated" && row.analysisDate === date && row.period === period)) continue;
      const prediction = result[period];
      if (!prediction.weightKg && !prediction.bodyFatPercent) continue;
      const common = { generatedAt, ...prediction };
      const estimation: HistoricalEstimate["estimation"] = initialization
        ? { ...common, method: INITIALIZATION_METHOD, mode: "historical-initialization", historyRange: range, policy: INITIALIZATION_POLICY, ...initialization, frozen: true }
        : { ...common, method: ESTIMATION_METHOD, mode: "normal", historyRange: { start: addCalendarDays(date, -ESTIMATION_POLICY.lookbackDays), end: addCalendarDays(date, -1) }, policy: ESTIMATION_POLICY };
      estimates.push({ analysisDate: date, period, weightKg: prediction.weightKg?.value ?? null, bodyFatPercent: prediction.bodyFatPercent?.value ?? null, estimation });
    }
  }
  return { estimates, warnings, outcomes };
}
export function buildHistoricalEstimates(records: DailyMeasurement[], range: MeasurementInterval, options: BuildOptions = {}) {
  return buildEstimates(records, range, options);
}
export function buildInitializationEstimates(records: DailyMeasurement[], range: MeasurementInterval, context: InitializationContext, generatedAt?: string) {
  return buildEstimates(records, range, { preserveExisting: false, generatedAt }, context);
}
