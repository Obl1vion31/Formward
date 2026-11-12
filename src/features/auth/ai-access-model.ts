import type { listAiTokens } from "./ai-tokens";

export const aiRecordDomains = [["身体", "measurements"], ["饮食与食材", "meals"], ["消耗", "energy"], ["训练计划", "training"]] as const;
export type AiProvider = "chatgpt" | "doubao" | "other";
export type AiConnectionState = "connected" | "expired" | "revoked" | "disabled" | "unauthorized";
export type AiAccessConnection = {
  id: string; name: string; provider: AiProvider; state: AiConnectionState;
  scopes: string[]; grantedScopes: string[]; authorizedAt: string; expiresAt: string; lastUsedAt: string | null;
};
export type AiSubmissionSource = { key: string; label: string; compactLabel?: string; kind: "oauth" | "token" | "embedded" | "unknown" };
export type AiSubmission = {
  id: string; source: AiSubmissionSource; summary: string; compactSummary?: string; status: string;
  createdAt: string; expiresAt: string | null; confirmationPath: string;
};
export type AiAccessOverview = {
  tokens: Awaited<ReturnType<typeof listAiTokens>>;
  connections: AiAccessConnection[]; submissions: AiSubmission[];
};
export const authorizationInstruction = "请调用 Formward 的 authorize_formward，统一检查并申请身体、饮食与食材、消耗、训练计划的查询和提交预览权限；只检查连接，不创建健康记录预览。";
export const aiConnectionLabels: Record<AiConnectionState, string> = {
  connected: "已连接", expired: "已过期", revoked: "已撤销", disabled: "已停用", unauthorized: "授权已失效",
};
export function aiConnectionState(connection: AiAccessConnection, now?: number): AiConnectionState {
  return connection.state === "connected" && now !== undefined && Date.parse(connection.expiresAt) <= now ? "expired" : connection.state;
}
export function aiAccessSummary(scopes: string[]) {
  const read = aiRecordDomains.every(([, domain]) => scopes.includes(domain + ":read"));
  const write = aiRecordDomains.every(([, domain]) => scopes.includes(domain + ":write"));
  return read && write ? "查询与提交预览" : read && !scopes.some(scope => scope.endsWith(":write")) ? "只读" : "按下列权限访问";
}
export function aiSubmissionState(submission: AiSubmission, now?: number) {
  if (["pending", "partially_confirmed"].includes(submission.status)) {
    return submission.expiresAt && now !== undefined && Date.parse(submission.expiresAt) <= now ? "expired" : "pending";
  }
  return submission.status;
}
export const aiSubmissionLabels: Record<string, string> = {
  pending: "待确认", confirmed: "已保存", cancelled: "已取消", completed: "审核完成", expired: "已过期",
};
export function aiAccessDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
