import type { MealOperationView } from "../meals/model";
import type { RecordReviewView } from "./model";

function state(status: string, expiresAt: string | null, needsInput: boolean, now: number) {
  if (status === "pending" && expiresAt && Date.parse(expiresAt) <= now) return "expired";
  if (status === "pending") return needsInput ? "needs_input" : "awaiting_web_confirmation";
  return status === "confirmed" || status === "completed" ? "finished" : "closed";
}
export function mealAiResponse(operation: MealOperationView & { repeated?: boolean }, view: "summary" | "status" = "summary", now = Date.now()) {
  const resultState = state(operation.status, operation.expiresAt, !operation.canConfirm, now);
  return {
    id: operation.id, revision: operation.revision, operationType: "meal", status: operation.status, state: resultState,
    createdAt: operation.createdAt, expiresAt: operation.expiresAt,
    canConfirm: resultState === "awaiting_web_confirmation", requiresWebConfirmation: operation.status === "pending",
    confirmationPath: operation.confirmationPath, repeated: operation.repeated ?? false,
    result: operation.result, needsUserInput: [...(operation.needsUserInput ?? []), ...operation.rows.flatMap((row, index) => row.error ? [{ index, questions: [row.error] }] : [])],
    ...(view === "summary" ? { rows: operation.rows.map((row, index) => ({
      index, kind: row.action.kind, excluded: row.excluded ?? false, error: row.error ?? null,
      warnings: row.warnings, needsUserInput: row.needsUserInput ?? [],
      ...(row.meal ? { meal: { id: row.meal.id, date: row.meal.date, mealType: row.meal.mealType, notes: row.meal.notes, imageIds: row.meal.imageIds, totals: row.meal.totals,
        items: row.meal.items.map((item, index) => ({ index, id: item.id, name: item.name, kind: item.kind, quantity: item.quantity, unit: item.unit, nutrition: item.nutrition, nutritionBasis: item.nutritionBasis, sourceKind: item.sourceKind, basis: item.basis })) } } : {}),
      ...(row.food ? { food: row.food } : {}),
    })) } : {}),
  };
}
export function recordAiResponse(operation: RecordReviewView & { repeated?: boolean }, view: "summary" | "status" = "summary", now = Date.now()) {
  const resultState = state(operation.status, operation.expiresAt, !operation.canConfirm, now);
  return {
    id: operation.id, revision: operation.revision, operationType: "record", status: operation.status, state: resultState,
    createdAt: operation.createdAt, expiresAt: operation.expiresAt,
    canConfirm: resultState === "awaiting_web_confirmation", requiresWebConfirmation: operation.status === "pending",
    confirmationPath: operation.confirmationPath, repeated: operation.repeated ?? false,
    saved: operation.saved, needsUserInput: operation.needsUserInput,
    counts: { total: operation.rows.length, saved: operation.rows.filter(row => row.persisted).length, excluded: operation.rows.filter(row => row.excluded).length },
    ...(view === "summary" ? { rows: operation.rows.map(row => ({
      key: row.key, kind: row.action.kind, excluded: row.excluded, persisted: row.persisted ?? false,
      ...(row.meal ? { meal: mealAiResponse({ id: operation.id, revision: operation.revision, status: operation.status, origin: "ai", createdAt: operation.createdAt, expiresAt: operation.expiresAt, confirmationPath: operation.confirmationPath, canConfirm: operation.canConfirm, rows: [row.meal], result: null }).rows?.[0] } : {}),
      ...(row.energy ? { energy: { after: row.energy.after, error: row.energy.error ?? null, warnings: row.energy.warnings ?? [], coverageQuestions: row.energy.coverageQuestions?.map(activity => ({ id: activity.id, date: activity.date, name: activity.name })), day: row.energy.day ? { date: row.energy.day.date, cumulative: row.energy.day.cumulative ?? false, estimated: row.energy.day.estimated, totalKcal: row.energy.day.totalKcal, restingKcal: row.energy.day.restingKcal, activeKcal: row.energy.day.activeKcal } : null } } : {}),
      ...(row.body ? { body: { input: row.body.input, status: row.body.status, preview: row.body.preview } } : {}),
      ...(row.training ? { training: row.training } : {}),
    })) } : {}),
  };
}
export function aiRecovery(code: string, status: number) {
  if (status === 401 || status === 403) return { retryable: false, nextAction: "reauthorize" };
  if (["version_conflict", "review_changed", "snapshot_changed", "preview_expired", "expired"].includes(code)) return { retryable: false, nextAction: "read_latest_then_resubmit" };
  if (code === "request_conflict") return { retryable: false, nextAction: "read_existing_preview_then_correct_same_draft", message: "同一请求不要另建批次。先读取原预览；餐次用preview_meal_changes，统一批次用submit_record_operation的previewId/revision修正。真正独立的新任务才使用新operationId。" };
  return status >= 500 ? { retryable: true, nextAction: "retry_same_operation_id_and_content" } : { retryable: false, nextAction: code === "needs_input" ? "ask_user" : "correct_input" };
}
