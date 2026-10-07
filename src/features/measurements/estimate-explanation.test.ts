import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateCalculation, estimateModeLabel, estimateUserExplanation } from "./estimate-explanation";
import { ESTIMATION_METHOD, ESTIMATION_POLICY, INITIALIZATION_METHOD, INITIALIZATION_POLICY, fitMeasurementModel, type EstimationMetadata, type MorningEstimationMetadata, type MetricEstimate } from "./estimation";

const date = "2025-08-06";
const pairs = Array.from({ length: 6 }, (_, index) => ({
  date: `2025-08-0${index + 1}`,
  morning: { id: `morning-${index}`, date: `2025-08-0${index + 1}`, value: "68.00" },
  evening: { id: `evening-${index}`, date: `2025-08-0${index + 1}`, value: "68.33" }, difference: .33,
}));
const anchor: MetricEstimate = { value: "68.60", basis: "same-day-morning", anchor: { id: "anchor", date, value: "68.27" }, trend: null, typicalDifference: { value: .33, samples: pairs } };
const metadata = (prediction: MetricEstimate): MorningEstimationMetadata => ({ method: ESTIMATION_METHOD, mode: "normal", policy: ESTIMATION_POLICY, generatedAt: "2025-08-07T00:00:00Z", historyRange: { start: "2025-07-09", end: date }, weightKg: prediction, bodyFatPercent: null });

test("用户依据展示同日实测、算式与配对日数，不把追溯行数当作样本日数", () => {
  const saved = metadata(anchor), before = structuredClone(saved);
  const explanation = estimateUserExplanation(saved, date, "weightKg");
  assert.deepEqual(explanation.basis, ["当日晨间实测：68.27 kg", "个人典型晨晚差：+0.33 kg"]);
  assert.equal(explanation.formula, "68.27 + 0.33 = 68.60 kg");
  assert.deepEqual(explanation.sampleSummary, ["基于 6 个真实晨晚配对日，取典型差值（中位数）"]);
  assert.equal(explanation.references.length, 7);
  assert.deepEqual(saved, before, "展示不修改保存的依据");
  assert.equal(estimateCalculation(anchor, date, "weightKg").formula, "68.27 + (0.33) = 68.60 kg", "内部报告继续使用完整算式");
  assert.ok(!JSON.stringify(explanation).includes(ESTIMATION_METHOD));
});

test("晚间反推正确处理负晨晚差；舍入算式使用约等号", () => {
  const reversed: MetricEstimate = { ...anchor, value: "68.60", basis: "same-day-evening", typicalDifference: { value: -.33, samples: pairs } };
  assert.equal(estimateUserExplanation(metadata(reversed), date, "weightKg").formula, "68.27 + 0.33 = 68.60 kg");
  const rounded = { ...reversed, value: "68.12", typicalDifference: { value: .155, samples: pairs } };
  const explanation = estimateUserExplanation(metadata(rounded), date, "weightKg");
  assert.equal(explanation.formula, "68.27 − 0.155 ≈ 68.12 kg");
  assert.match(explanation.basis[0], /晚间实测/);
});

test("相邻插值展示真实两端、日期比例与独立配对日数", () => {
  const prediction: MetricEstimate = { value: "69.33", basis: "morning-trend-plus-difference", anchor: null, trend: null, typicalDifference: anchor.typicalDifference,
    interpolation: { left: { id: "left", date: "2025-08-05", value: "68.00" }, right: { id: "right", date: "2025-08-09", value: "72.00" }, fraction: .25, value: 69 } };
  const normal = metadata(prediction);
  const initialized: EstimationMetadata = { ...normal, method: INITIALIZATION_METHOD, mode: "historical-initialization", policy: INITIALIZATION_POLICY, batchId: "internal-batch", sourceDigest: "a".repeat(64), frozen: true };
  const explanation = estimateUserExplanation(initialized, date, "weightKg");
  assert.equal(estimateModeLabel(initialized), "历史补全");
  assert.equal(explanation.formula, "68.00 + (72.00 − 68.00) × 1/4 + 0.33 ≈ 69.33 kg");
  assert.deepEqual(explanation.sampleSummary, ["基于 2 个真实晨间日，按日期间隔插值", "基于 6 个真实晨晚配对日，取典型差值（中位数）"]);
  assert.match(explanation.basis[1], /2025-08-09.*72.00/);
  assert.ok(!JSON.stringify(explanation).includes("internal-batch"));
});

test("趋势备用展示真实晨间日数和主要实测，不把拟合系数放进首层", () => {
  const trend = fitMeasurementModel([3, 4, 5].map((day, index) => ({ id: `sample-${day}`, date: `2025-08-0${day}`, value: (68 + index).toFixed(2) })))!;
  const prediction: MetricEstimate = { value: "71.00", basis: "morning-trend", anchor: null, trend, typicalDifference: null, fallbackReason: "有效晨晚配对仅 0 日，不足 3 日" };
  const explanation = estimateUserExplanation(metadata(prediction), date, "weightKg");
  assert.deepEqual(explanation.sampleSummary, ["基于 3 个真实晨间日"]);
  assert.deepEqual(explanation.basis, ["2025-08-03 晨间空腹实测：68.00 kg", "2025-08-05 晨间空腹实测：70.00 kg"]);
  assert.equal(explanation.formula, "晨间趋势推算 ≈ 71.00 kg");
  assert.match(explanation.fallbackNote!, /配对不足/);
  assert.equal(estimateUserExplanation(metadata({ ...prediction, extrapolation: true }), date, "weightKg").method, "历史边界趋势推算");
  const withDelta = estimateUserExplanation(metadata({ ...prediction, value: "71.33", basis: "morning-trend-plus-difference", typicalDifference: anchor.typicalDifference, fallbackReason: null }), date, "weightKg");
  assert.equal(withDelta.formula, "晨间趋势值 71 + 0.33 ≈ 71.33 kg");
  assert.equal(withDelta.sampleSummary.length, 2);
});

test("体脂依据按指标读取，变化使用百分点，缺失依据不编造", () => {
  const saved = metadata(anchor);
  saved.bodyFatPercent = { ...anchor, value: "24.53", anchor: { id: "fat", date, value: "24.20" } };
  const explanation = estimateUserExplanation(saved, date, "bodyFatPercent");
  assert.equal(explanation.formula, "24.20 + 0.33 = 24.53 %");
  assert.match(explanation.basis[1], /0.33 个百分点/);
  assert.equal(estimateUserExplanation(metadata(anchor), date, "bodyFatPercent").formula, null);
  assert.deepEqual(estimateUserExplanation(null, date, "weightKg").sampleSummary, []);
});

test("旧历史趋势保持只读兼容，未知时段不标为晨间，内部版本不进入说明", () => {
  const model = fitMeasurementModel([3, 4, 5].map((day, index) => ({ id: `legacy-${day}`, date: `2025-08-0${day}`, value: (68 + index).toFixed(2) })))!;
  const saved: EstimationMetadata = { method: "linear-trend-v1", confidenceLevel: .95, trainingRange: { start: "2025-08-03", end: "2025-08-05" }, weightKg: { value: "71.00", lower: "70", upper: "72", model: { ...model, sumSquaredDates: 2, residualVariance: 0, criticalValue: 1.96 } }, bodyFatPercent: null };
  const explanation = estimateUserExplanation(saved, date, "weightKg");
  assert.equal(explanation.formula, "历史趋势推算 ≈ 71.00 kg");
  assert.deepEqual(explanation.sampleSummary, ["基于 3 条真实历史记录"]);
  assert.ok(!JSON.stringify(explanation).includes("晨间"));
  assert.ok(!JSON.stringify(explanation).includes("linear-trend-v1"));
});
