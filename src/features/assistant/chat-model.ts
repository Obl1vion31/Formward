/** 服务器保存的任务参数，不包含Cookie、密钥或重复的用户原文。 */
export type ChatExecutionInput = {
  action: "send" | "retry" | "continue"; requestId: string; provider: ChatProvider; conversationId: string;
  timezone: string; messageId?: string; mealTask?: boolean;
  attachmentSourceId: string; attachmentImageIds: string[];
};
export type ChatRequestDiagnostic = {
  state:"prepared"|"request_started"|"response_received"|"completed"; requestSha256:string;
  round: number; provider: ChatProvider; model: string; messageId: string; attachmentSourceId: string;
  images: {id:string;sha256:string;byteSize:number;mimeType:string}[]; textSha256:string;
  providerRequestId?:string; returnedModel?:string;
};
export const chatProviderIds = ["qwen", "mimo", "glm"] as const;
export type ChatProvider = typeof chatProviderIds[number];
export type ChatStep = { id: string; name: string; title: string; state: "running" | "complete" | "error"; summary?: string; note?:string };
export type ChatReference = { title: string; href: string; kind: "record" | "preview"; operationId?: string };
export type Followup = { question: string; subject: string; messageId: string; questions?: import("./followup").FollowupQuestion[] };
export type ChatMessage = {
  id: string; seq: number; role: "user" | "assistant"; text: string; provider: ChatProvider | null;
  state: string; createdAt: string; replyTo: { id: string; text: string } | null; imageIds: string[];
  steps: ChatStep[]; references: ChatReference[]; error: string | null; runId?: string; requestId?: string; question?: { id:string; text:string };
};
export type ChatUsage = {
  date: string; limit: number; spent: number; reserved: number; uncertain: number; available: number;
  percent: string; resetAt: string; providers: { id: ChatProvider; spent: number; reserved: number; uncertain: number }[];
  recognition?: { used: number; limit: number; remaining: number; resetAt: string };
};
export type ChatCatalogItem = { id: ChatProvider; label: string; model: string; configured: boolean; enabled: boolean; reason: string | null; expiresAt: string | null };
export type ChatSnapshot = {
  capabilities?:{inlinePreviews:boolean;mealEntry:boolean};
  entitlement?: import("../auth/entitlements").AccountEntitlements;
  conversationId: string; provider: ChatProvider; followup: Followup | null; messages: ChatMessage[];
  hasMore: boolean; before: number | null; activeRunId: string | null; catalog: ChatCatalogItem[]; usage: ChatUsage;
};
export type ChatEvent = { type: "snapshot"; snapshot: ChatSnapshot } | { type: "message"; message: ChatMessage } | { type: "usage"; usage: ChatUsage } | { type: "done" };
export function usagePercent(spent: number, limit: number) {
  if (spent <= 0) return "0%";
  const value = Math.floor(spent / limit * 100 + 1e-8);
  return value < 1 ? "<1%" : value + "%";
}
export function budgetDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function nextBudgetReset(date: string) { return new Date(Date.parse(date + "T00:00:00+08:00") + 86400000).toISOString(); }

export type MealTaskContext={draftKey:string;draft:import("../meals/model").MealDraft;originalDraft?:import("../meals/model").MealDraft;signature:string;imageIds:string[];previewId?:string;previewProvider?:ChatProvider;appliedSignature?:string;savedSignature?:string;cancelled?:boolean};
