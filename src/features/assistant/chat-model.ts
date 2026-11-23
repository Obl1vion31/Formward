/** 服务器保存的任务参数，不包含Cookie、密钥或重复的用户原文。 */
export type ChatExecutionInput = {
  action: "send" | "retry" | "continue"; requestId: string; provider: ChatProvider; conversationId: string;
  timezone: string; messageId?: string; mealTask?: boolean;
  attachmentSourceId: string; attachmentImageIds: string[]; photoBatchOf?: string;
  contextQuote?: true;
  photoBatch?: ChatPhotoObservation[];
  resume?: { sourceRunId: string; taskMessageId: string };
};
export type ChatRequestDiagnostic = {
  state:"prepared"|"request_started"|"response_received"|"completed"; requestSha256:string;
  round: number; provider: ChatProvider; model: string; messageId: string; attachmentSourceId: string;
  images: {id:string;sha256:string;byteSize:number;mimeType:string}[]; textSha256:string;
  providerRequestId?:string; returnedModel?:string; maxPhotos?: number; detailLimit?: number;
  phase?: "photos" | "answer";
  inputEstimate?: number;
};
export const chatProviderIds = ["qwen", "mimo", "glm"] as const;
export type ChatProvider = typeof chatProviderIds[number];
export type ChatStep = { id: string; name: string; title: string; state: "running" | "complete" | "error"; summary?: string; note?:string; foldedInto?:string };
export type ChatReference = { title: string; href: string; kind: "record" | "preview"; operationId?: string };
export type Followup = { question: string; subject: string; messageId: string; assistantMessageId?: string; questions?: import("./followup").FollowupQuestion[] };
export type ChatAnswer = { prompt:string; label?:string; value:string|null; skipped:boolean; outcome?:"skipped"|"unknown" };
export type ChatRunTiming = { runId: string; messageId: string; startedAt: string | null; observedAt: string };
export const chatContextLimitNotice = "这次要处理的内容太多，回复已中断。";
export type ChatContextQuote = { id: string; text: string | null };
export type ChatControlAction = "select_model" | "new" | "stop" | "enable" | "revoke" | "clear_followup" | "select_conversation" | "clear_context_quote" | "resume_in_new_conversation";
export const CHAT_PHOTO_LIMIT = 8;
export const CHAT_PHOTOS_PER_BATCH = 2;
export const CHAT_INPUT_LIMIT = 500000;
export const CHAT_MEAL_INPUT_LIMIT = 200000;
export const CHAT_IMAGE_INPUT_COST = 65536;
export const CHAT_PHOTO_NOTE_LIMIT = 1200;
const CHAT_TOOL_GROWTH_RESERVE = 100000 - CHAT_IMAGE_INPUT_COST;

/** 预估同一条发送中各阶段的峰值。包含拟保留的前文及工具增长余量。 */
export function nextChatInputEstimate(base: number, draft: string, photoCount: number) {
  const text = new TextEncoder().encode(JSON.stringify(draft)).byteLength;
  if (photoCount <= CHAT_PHOTOS_PER_BATCH) {
    return base + text + Math.max(1, photoCount) * CHAT_IMAGE_INPUT_COST + CHAT_TOOL_GROWTH_RESERVE;
  }
  // 原图分批独立发送。最终工具轮使用有长度上界的文字观察。
  const photoNotes = photoCount * CHAT_PHOTO_NOTE_LIMIT * 4;
  const readingPeak = CHAT_PHOTOS_PER_BATCH * CHAT_IMAGE_INPUT_COST + photoNotes + 8000;
  const answerPeak = base + photoNotes + CHAT_TOOL_GROWTH_RESERVE;
  return text + Math.max(readingPeak, answerPeak);
}
export type ChatPhotoLimit = { imageIds: string[]; maxPhotos: number };
export type ChatPhotoObservation = { imageId: string; notes: string };
export type ChatPhotoProgress = { read: number; total: number; phase: "reading" | "combining" };

export function chatPhotoProgress(input?: Pick<ChatExecutionInput,"attachmentImageIds" | "photoBatch"> | null): ChatPhotoProgress | undefined {
  if (!input?.photoBatch) return;
  const read = input.photoBatch.length, total = input.attachmentImageIds.length;
  return { read, total, phase: read < total ? "reading" : "combining" };
}
export type ChatMessage = {
  id: string; seq: number; role: "user" | "assistant"; text: string; provider: ChatProvider | null;
  state: string; createdAt: string; replyTo: { id: string; text: string; contextQuote?: true } | null; imageIds: string[];
  steps: ChatStep[]; references: ChatReference[]; error: string | null; runId?: string; requestId?: string; question?: { id:string; text:string };
  answeredQuestions?: ChatAnswer[];
  followupSourceId?: string;
  photoLimit?: ChatPhotoLimit;
  photoProgress?: ChatPhotoProgress;
  contextLimited?: boolean;
  resumingTask?: boolean;
  detailLimit?: number;
};
export type ChatUsage = {
  date: string; limit: number; spent: number; reserved: number; uncertain: number; available: number;
  percent: string; resetAt: string; providers: { id: ChatProvider; spent: number; reserved: number; uncertain: number }[];
  recognition?: { used: number; limit: number | null; remaining: number | null; resetAt: string };
};
export type ChatBalance = { remainingPercent: string; resetAt: string };
export type ChatCatalogItem = { id: ChatProvider; label: string; model: string; configured: boolean; enabled: boolean; reason: string | null; expiresAt: string | null };
export type ChatSnapshot = {
  capabilities?:{inlinePreviews:boolean;mealEntry:boolean};
  entitlement?: import("../auth/entitlements").AccountEntitlements;
  conversationId: string; provider: ChatProvider; followup: Followup | null; messages: ChatMessage[];
  photoUpdates?: ChatMessage[];
  pendingContextQuote?: ChatContextQuote;
  contextBaseEstimate?: number;
  hasMore: boolean; before: number | null; activeRunId: string | null; runTiming?: ChatRunTiming | null; catalog: ChatCatalogItem[]; usage: ChatUsage;
};
export type ChatEvent =
  | { type: "accepted"; conversationId: string; requestId: string; runId: string }
  | { type: "snapshot"; snapshot: ChatSnapshot }
  | { type: "message"; message: ChatMessage }
  | { type: "usage"; usage: ChatUsage }
  | { type: "timing"; timing: ChatRunTiming }
  | { type: "text_delta"; runId: string; messageId: string; offset: number; text: string }
  | { type: "progress"; runId: string; messageId: string; steps: ChatStep[]; references: ChatReference[]; photoProgress?: ChatPhotoProgress }
  | { type: "done" };
export function usagePercent(spent: number, limit: number) {
  if (spent <= 0) return "0%";
  const value = Math.floor(spent / limit * 100 + 1e-8);
  return value < 1 ? "<1%" : value + "%";
}
export function chatBalance({ available, limit, resetAt }: Pick<ChatUsage,"available"|"limit"|"resetAt">): ChatBalance {
  return { remainingPercent: limit > 0 ? usagePercent(Math.min(available,limit),limit) : "0%", resetAt };
}
export function budgetDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function nextBudgetReset(date: string) { return new Date(Date.parse(date + "T00:00:00+08:00") + 86400000).toISOString(); }

export type MealTaskContext={draftKey:string;draft:import("../meals/model").MealDraft;originalDraft?:import("../meals/model").MealDraft;signature:string;imageIds:string[];previewId?:string;previewProvider?:ChatProvider;appliedSignature?:string;savedSignature?:string;cancelled?:boolean};

export type ChatStoredContext = MealTaskContext | { contextQuoteId: string };
export function isMealTaskContext(context: ChatStoredContext | null): context is MealTaskContext {
  return context !== null && "draftKey" in context;
}
export function pendingContextQuoteId(context: ChatStoredContext | null) {
  return context && "contextQuoteId" in context ? context.contextQuoteId : undefined;
}
