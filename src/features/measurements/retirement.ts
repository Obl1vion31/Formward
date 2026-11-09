import { ApiError } from "../auth/ai-tokens";

/** 仅用于识别旧请求；不保留任何估算执行路径。 */
export function containsRetiredBodyEstimate(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsRetiredBodyEstimate);
  const object = value as Record<string, unknown>;
  return object.kind === "estimate_cell" || Object.values(object).some(containsRetiredBodyEstimate);
}
export function assertBodyEstimateRemoved(value: unknown): void {
  if (containsRetiredBodyEstimate(value)) throw new ApiError(410, "feature_removed", "身体估算功能已移除。本次任务未执行，请仅使用实测记录重新提交；原草稿保留。");
}
/** 旧实测预览允许继续使用，但不能带出已退役的计算说明或替换快照。 */
export function currentMeasurementFacts<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(currentMeasurementFacts) as T;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["estimation", "estimateExplanation", "explanation", "replacedEstimates", "recordKind"].includes(key)).map(([key, item]) => [key, currentMeasurementFacts(item)])) as T;
}
