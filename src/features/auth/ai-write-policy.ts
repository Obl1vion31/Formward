import { ApiError } from "./ai-identity";

/** AI 只能新增或修改事实；网页手工删除／恢复不经过此规则。 */
export function aiActionAllowed(kind: string) {
  return !kind.startsWith("delete_") && !kind.startsWith("restore_");
}
export function requireAiUpserts(actions: {kind: string}[]) {
  if (actions.some(action => !aiActionAllowed(action.kind)))
    throw new ApiError(403, "ai_action_not_allowed", "AI不能删除或恢复整条记录，请在网页手工处理；本次申请可以取消。");
}
