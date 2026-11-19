import { chatAttachmentBinding } from "./chat-attachments";
import { globalBudget, lockGlobalBudget, budgetAlert } from "./global-budget";
import { chatCapabilities } from "./chat-config";
import { or, isNull, isNotNull } from "drizzle-orm";
import { followupText, resolveSupplement, mergeSupplements, type FollowupSubmission } from "./followup";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assistantConnection as connection, assistantConversation as conversation, assistantMessage as message, assistantRun as run, assistantUsageRequest as usageRequest, aiToken, mealImage, recordOperation, user, securityEvent } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { lockActiveAccount, requireActiveAccount } from "../auth/account-security";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { accountEntitlements } from "../auth/entitlements";
import { prepareRecognition, recognitionUsage, reserveRecognition, refundUnfinishedRecognition } from "./recognition-quota";
import { assertChatAllowed, chatProviders, providerAvailable, currentProvider, providerConfigured, providerId, type ChatRates } from "./chat-config";
import { budgetDate, chatContextLimitNotice, chatProviderIds, isMealTaskContext, nextBudgetReset, pendingContextQuoteId, usagePercent, type ChatContextQuote, type ChatControlAction, type ChatMessage, type ChatPhotoLimit, type ChatProvider, type ChatRunTiming, type ChatSnapshot, type ChatUsage } from "./chat-model";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type StoredRun = typeof run.$inferSelect;
export type StoredMessage = typeof message.$inferSelect;
export type ChatSend = { action: "send" | "retry" | "continue"; requestId: string; provider: ChatProvider; conversationId: string; text?: string; replyToId?: string; imageIds?: string[]; imageSubset?: string[]; messageId?: string; timezone: string; followup?: FollowupSubmission; mealTask?:boolean };
export const digestChat = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key,item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item)).digest("hex");

export async function requireChatAccount(db: Pick<Database, "select">, userId: string, purpose: "chat" | "meal_entry" = "chat") { const owner = await requireActiveAccount(db, userId); assertChatAllowed(owner, purpose); return owner; }
async function lockChatAccount(tx: Tx, userId: string, purpose: "chat" | "meal_entry" = "chat") { const owner = await lockActiveAccount(tx, userId); assertChatAllowed(owner, purpose); return owner; }
export async function currentConversation(db: Database, userId: string, readOnly = false) {
  return db.transaction(async tx => {
    const owner = await lockActiveAccount(tx, userId); if (!readOnly) assertChatAllowed(owner);
    const [active] = await tx.select().from(conversation).where(and(eq(conversation.userId, userId), eq(conversation.purpose,"chat"), eq(conversation.active, true)));
    if (active) return active;
    const [previous] = await tx.select().from(conversation).where(and(eq(conversation.userId,userId),eq(conversation.purpose,"chat"))).orderBy(desc(conversation.createdAt)).limit(1);
    const [created] = await tx.insert(conversation).values({ id: randomUUID(), userId, provider: previous?.provider ?? "qwen" }).returning();
    return created;
  });
}
export async function listChatConversations(db:Database,userId:string,before?:{at:string;id:string}){
  await requireActiveAccount(db,userId);
  const rows=await db.select({id:conversation.id,updatedAt:conversation.updatedAt,active:conversation.active,sequence:conversation.sequence,firstText:sql<string|null>`(select m.text from assistant_messages m where m.user_id=${userId} and m.conversation_id=${sql.raw('assistant_conversations.id')} and m.role='user' order by m.seq limit 1)`}).from(conversation).where(and(eq(conversation.userId,userId),eq(conversation.purpose,"chat"),isNull(conversation.removedAt),before?or(lt(conversation.updatedAt,new Date(before.at)),and(eq(conversation.updatedAt,new Date(before.at)),lt(conversation.id,before.id))):undefined)).orderBy(desc(conversation.updatedAt),desc(conversation.id)).limit(21);
  const items=rows.slice(0,20).map(row=>({id:row.id,title:row.firstText?.trim().slice(0,40)||(row.sequence?"图片对话":"新对话"),updatedAt:row.updatedAt.toISOString(),active:row.active}));
  const last=rows[19];return {items,next:rows.length>20?{at:last.updatedAt.toISOString(),id:last.id}:null};
}

export async function chatUsage(db: Pick<Database, "select">, userId: string, now = new Date()): Promise<ChatUsage> {
  const date = budgetDate(now);
  const entitlement = accountEntitlements(await requireActiveAccount(db, userId)), limit = entitlement.dailyBudgetCny;
  const totals = await db.select({ provider: usageRequest.provider, state: usageRequest.state,
    cost: sql<string>`coalesce(sum(${usageRequest.costCny}),0)::text`, reserved: sql<string>`coalesce(sum(${usageRequest.reservedCny}),0)::text`, missing:sql<string>`coalesce(sum(CASE WHEN ${usageRequest.costCny} IS NULL THEN ${usageRequest.reservedCny} ELSE 0 END),0)::text`,
  }).from(usageRequest).where(and(eq(usageRequest.userId, userId), eq(usageRequest.date, date))).groupBy(usageRequest.provider, usageRequest.state);
  const providers = chatProviderIds.map(id => ({ id, spent: 0, reserved: 0, uncertain: 0 }));
  for (const row of totals) {
    const item = providers.find(p => p.id === row.provider)!;
    if (row.state === "settled") {item.spent += Number(row.cost);item.uncertain+=Number(row.missing);} else if (row.state === "unknown") item.uncertain += Number(row.reserved); else item.reserved += Number(row.reserved);
  }
  const spent = providers.reduce((sum, p) => sum + p.spent, 0), reserved = providers.reduce((sum, p) => sum + p.reserved, 0), uncertain = providers.reduce((sum, p) => sum + p.uncertain, 0);
  return { date, limit, spent, reserved, uncertain, available: Math.max(0, limit - spent - reserved - uncertain), percent: limit ? usagePercent(spent, limit) : "0%", resetAt: nextBudgetReset(date), providers, ...(!entitlement.chat ? { recognition: await recognitionUsage(db, userId, now) } : {}) };
}
export function normalizedUsage(raw: Record<string, unknown> | null, rates: ChatRates) {
  if (!raw || !Number.isSafeInteger(raw.prompt_tokens) || !Number.isSafeInteger(raw.completion_tokens) || Number(raw.prompt_tokens) < 0 || Number(raw.completion_tokens) < 0) return null;
  const details = raw.prompt_tokens_details as Record<string, unknown> | undefined;
  const cached = details?.cached_tokens ?? raw.prompt_cache_hit_tokens;
  const hit = Number.isSafeInteger(cached) && Number(cached) >= 0 && Number(cached) <= Number(raw.prompt_tokens) ? Number(cached) : 0;
  return ((Number(raw.prompt_tokens) - hit) * rates.input + hit * rates.cachedInput + Number(raw.completion_tokens) * rates.output) / 1e6;
}
export const CHAT_INPUT_LIMIT = 200000;
export const CHAT_IMAGE_INPUT_COST = 65536;

export function estimatedChatInput(body: unknown) {
  let images = 0;
  const text = JSON.stringify(body, (key, value) => { if (key === "url" && typeof value === "string" && value.startsWith("data:image/")) { images++; return "[image]"; } return value; });
  return Buffer.byteLength(text) + 4096 + images * CHAT_IMAGE_INPUT_COST;
}
export function reserveCost(body: unknown, rates: ChatRates) {
  return estimatedChatInput(body) * rates.input / 1e6 + 8208 * rates.output / 1e6;
}
export async function settleChatUsage(db: Database, userId: string, id: string, raw: Record<string, unknown> | null, rejectedStatus?: number) {
  const [snapshot]=await db.select({date:usageRequest.date}).from(usageRequest).where(and(eq(usageRequest.id,id),eq(usageRequest.userId,userId)));
  if(!snapshot)return;
  await db.transaction(async tx => {
    await lockGlobalBudget(tx,snapshot.date);
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    const [row] = await tx.select().from(usageRequest).where(and(eq(usageRequest.id, id), eq(usageRequest.userId, userId)));
    if (!row || row.state === "settled") return;
    const rejected = rejectedStatus !== undefined && [400,401,402,403,404,413,422,429].includes(rejectedStatus);
    const cost = rejected ? 0 : normalizedUsage(raw, row.rates);
    if(row.state==="unknown"&&cost===null)return;
    await tx.update(usageRequest).set({ state: cost === null ? "unknown" : "settled", costCny: cost === null ? null : cost.toFixed(8), usage: rejected ? { requestRejected: true, httpStatus: rejectedStatus } : raw }).where(eq(usageRequest.id, id));
    if(cost!==null&&cost>Number(row.reservedCny))await tx.insert(securityEvent).values({id:`reservation-overflow:${id}`,category:"reservation_overflow",userId,details:{date:row.date}}).onConflictDoNothing();
  });
  const global=await globalBudget(db,snapshot.date);
  if(global.available<=0)await budgetAlert(db,snapshot.date,100);else if(global.available<=2)await budgetAlert(db,snapshot.date,80);
}
export async function reserveChatUsage(db: Database, ownerId: string, activeRun: StoredRun, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(503, "budget_configuration", "模型费用配置无效，暂未发起请求。");
  const reservation = await db.transaction(async tx => {
    const day = budgetDate();
    await lockGlobalBudget(tx, day);
    const [task] = await tx.select({ purpose: conversation.purpose }).from(conversation).where(and(eq(conversation.id, activeRun.conversationId), eq(conversation.userId, ownerId)));
    if (!task) throw new ApiError(404, "not_found", "当前任务不可用。");
    const owner = await lockChatAccount(tx, ownerId, task.purpose === "meal_entry" ? "meal_entry" : "chat");
    const [live] = await tx.select().from(run).where(and(eq(run.id, activeRun.id), eq(run.userId, ownerId), eq(run.state, "running")));
    if (!live) throw new ApiError(409, "stopped", "生成已停止。");
    if (task.purpose === "meal_entry") await reserveRecognition(tx, activeRun);
    const budget = await chatUsage(tx, ownerId);
    if (accountEntitlements(owner).amountLimited && budget.available + 1e-9 < amount) throw new ApiError(429, "daily_budget", "今日可用额度不足以开始这次请求。待结算用量也会暂占额度；提醒和手工记录仍可使用。");
    const global = await globalBudget(tx, day);
    if (global.available + 1e-9 < amount) throw new ApiError(429, "global_daily_budget", "今日全站模型额度暂不可用，已有结果保留，仍可手动记录。");
    const id = randomUUID();
    await tx.insert(usageRequest).values({ id, userId: ownerId, runId: activeRun.id, provider: activeRun.provider, date: budget.date, reservedCny: amount.toFixed(8), rates: chatProviders[providerId(activeRun.provider)].rates });
    return { id, day, remaining: global.available - amount };
  }).catch(async error => { if (error instanceof ApiError && error.code === "global_daily_budget") {const day=budgetDate(),budget=await globalBudget(db,day);if(budget.available<=0)await budgetAlert(db,day,100);else await db.insert(securityEvent).values({id:`budget-blocked:${day}`,category:"global_budget_blocked",details:{date:day}}).onConflictDoNothing();} throw error; });
  if (reservation.remaining <= 2) await budgetAlert(db, reservation.day, 80);
  if (reservation.remaining <= 0) await budgetAlert(db,reservation.day,100);
  return reservation.id;
}
export async function chatIdentity(db: Database, ownerId: string, provider: ChatProvider, create = false, purpose: "chat" | "meal_entry" = "chat") {
  return db.transaction(async tx => {
    const owner = await lockChatAccount(tx, ownerId, purpose), grantPurpose = purpose === "meal_entry" && !accountEntitlements(owner).chat ? "meal_entry" : "chat";
    let [row] = await tx.select().from(connection).where(and(eq(connection.userId, ownerId), eq(connection.provider, provider), eq(connection.purpose, grantPurpose))).orderBy(desc(connection.createdAt)).limit(1);
    if (!row && create) {
      // 原文只在此处产生且立即丢弃；站内执行凭有效会话和本人的连接引用，不接受浏览器凭据。
      const tokenId = randomUUID();
      await tx.insert(aiToken).values({ id: tokenId, userId: ownerId, name: chatProviders[provider].label + (grantPurpose === "meal_entry" ? " · 站内饮食识图" : " · 站内助手"), tokenHash: digestChat(randomUUID() + randomUUID()), prefix: grantPurpose === "meal_entry" ? "fw_internal_meal" : "fw_internal", permission: "write", expiresAt: new Date(Date.now() + 30 * 86400000) });
      [row] = await tx.insert(connection).values({ id: randomUUID(), userId: ownerId, provider, tokenId, purpose: grantPurpose }).returning();
    }
    if (!row?.enabled) throw new ApiError(403, "chat_grant_revoked", "此模型的站内授权已撤销，请在连接详情中重新启用。");
    const identity = { userId: ownerId, tokenId: row.tokenId, permission: "write" as const };
    await requireActiveAiToken(tx, identity, false, purpose === "meal_entry" ? "meals" : "measurements");
    return identity;
  });
}
export async function reapChatRuns(db: Database, userId: string) {
  await db.transaction(async tx => {
    await lockActiveAccount(tx, userId);
    const stale = await tx.update(run).set({ state: "stopped" }).where(and(
      eq(run.userId,userId),eq(run.state,"running"),or(
        and(or(isNotNull(run.claimedAt),isNull(run.executionInput)),lt(run.heartbeatAt,new Date(Date.now()-150000))),
        and(isNull(run.claimedAt),lt(run.createdAt,new Date(Date.now()-600000)))
      )
    )).returning();
    for (const row of stale) {
      await tx.update(message).set({ state: "stopped", error: "后台任务中断，已有内容已保留。请核对原结果后手动继续或重试。" }).where(and(eq(message.id, row.assistantMessageId), eq(message.userId, userId)));
      await tx.update(usageRequest).set({ state: "unknown" }).where(and(eq(usageRequest.runId, row.id), eq(usageRequest.userId, userId), eq(usageRequest.state, "reserved")));
      await refundUnfinishedRecognition(tx as unknown as Database, userId, row);
    }
  });
}
export function chatRunTiming(row: Pick<StoredRun,"id"|"assistantMessageId"|"claimedAt">): ChatRunTiming {
  return {runId:row.id,messageId:row.assistantMessageId,startedAt:row.claimedAt?.toISOString()??null,observedAt:new Date().toISOString()};
}

function runPhotoLimit(row: Pick<StoredRun,"executionInput"|"requestDiagnostics">): ChatPhotoLimit | undefined {
  const maxPhotos = row.requestDiagnostics.at(-1)?.maxPhotos;
  const imageIds = row.executionInput?.attachmentImageIds;
  const sentImages = row.requestDiagnostics.some(item => item.state === "completed" && item.images.length > 0);
  if (maxPhotos && imageIds?.length && !sentImages) return {imageIds, maxPhotos};
}

function isContextLimited(row: Pick<StoredMessage, "state" | "error">) {
  return row.state === "error" && !!row.error &&
    (row.error === chatContextLimitNotice || /^(本次请求的上下文已满|本次上下文或照片较多|本轮内容超出可处理范围|本轮照片超出可处理范围)/.test(row.error));
}

export async function resolveContextQuote(db: Pick<Database, "select">, userId: string, id: string, sourceConversationId?: string): Promise<ChatContextQuote | null> {
  const [source] = await db.select({ reply: message, attempt: run }).from(message)
    .innerJoin(conversation, and(eq(conversation.id, message.conversationId), eq(conversation.userId, userId)))
    .leftJoin(run, and(eq(run.assistantMessageId, message.id), eq(run.userId, userId), eq(run.conversationId, conversation.id)))
    .where(and(eq(message.id, id), eq(message.userId, userId), eq(message.role, "assistant"),
      eq(conversation.purpose, "chat"), isNull(conversation.removedAt),
      sourceConversationId ? eq(conversation.id, sourceConversationId) : undefined))
    .orderBy(desc(run.createdAt)).limit(1);
  if (!source || !isContextLimited(source.reply) || source.attempt && runPhotoLimit(source.attempt)) return null;

  const [question] = await db.select({ text: message.text, imageIds: message.imageIds }).from(message)
    .where(and(eq(message.userId, userId), eq(message.conversationId, source.reply.conversationId), eq(message.role, "user"),
      source.attempt ? eq(message.id, source.attempt.userMessageId) : lt(message.seq, source.reply.seq)))
    .orderBy(desc(message.seq)).limit(1);
  if (!question) return null;

  const summary = (text: string) => {
    const characters = Array.from(text.trim());
    return characters.length > 800 ? characters.slice(0, 799).join("") + "…" : text.trim();
  };
  const parts = [summary(question.text) || (question.imageIds.length ? "原问题包含照片。" : "原问题没有文字。")];
  const reply = summary(source.reply.text);
  if (reply) parts.push("已有回复：" + reply);
  const operations = [...new Set(source.reply.references.flatMap(reference =>
    reference.kind === "preview" && reference.operationId ? [reference.operationId] : [],
  ))].slice(0, 8);
  if (operations.length) {
    const statuses = await db.select({ status: recordOperation.status }).from(recordOperation)
      .where(and(eq(recordOperation.userId, userId), inArray(recordOperation.id, operations)));
    if (statuses.some(row => row.status === "confirmed")) parts.push("本轮已有记录保存。");
    if (statuses.some(row => row.status === "pending")) parts.push("本轮有记录待确认。");
  }
  return { id, text: parts.join("\n") };
}

type BatchRun = Pick<StoredRun,"userMessageId"|"executionInput"|"state">;

function unusedBatchPhotos(original: Pick<StoredRun,"userMessageId"|"assistantMessageId"|"executionInput">, limit: ChatPhotoLimit, batches: BatchRun[]) {
  const sourceId = original.executionInput?.attachmentSourceId;
  const used = new Set(batches.flatMap(batch => {
    const attachments = batch.executionInput;
    const sameQuestion = batch.userMessageId === original.userMessageId || attachments?.photoBatchOf === original.assistantMessageId;
    return batch.state === "complete" && sameQuestion && attachments?.attachmentSourceId === sourceId
      ? attachments?.attachmentImageIds ?? [] : [];
  }));
  return limit.imageIds.filter(id => !used.has(id));
}

export async function activeChatSubscription(db: Database, userId: string, id: string) {
  await requireChatAccount(db,userId);
  const [row] = await db.select({id:run.id,conversationId:run.conversationId,assistantMessageId:run.assistantMessageId})
    .from(run).innerJoin(conversation,and(eq(conversation.id,run.conversationId),eq(conversation.userId,userId)))
    .where(and(eq(run.userId,userId),eq(run.id,id),eq(conversation.purpose,"chat"),eq(conversation.active,true)));
  if (!row) throw new ApiError(404,"not_found","这条回复已不可用。");
  return row;
}

export async function chatSnapshot(db: Database, userId: string, before?: number,taskId?:string,conversationId?:string): Promise<ChatSnapshot> {
  const owner = await requireActiveAccount(db, userId), entitlement = accountEntitlements(owner); await reapChatRuns(db, userId);
  const current = taskId?(await db.select().from(conversation).where(and(eq(conversation.id,taskId),eq(conversation.userId,userId),eq(conversation.purpose,"meal_entry"))))[0]:conversationId?(await db.select().from(conversation).where(and(eq(conversation.id,conversationId),eq(conversation.userId,userId),eq(conversation.purpose,"chat"),isNull(conversation.removedAt))))[0]:await currentConversation(db,userId,true);
  if(!current)throw new ApiError(404,"not_found","此任务不存在或不属于当前账号。");
  const recent = await db.select().from(message).where(and(eq(message.userId, userId), eq(message.conversationId, current.id))).orderBy(desc(message.seq)).limit(50);
  const older = before === undefined ? recent : recent.filter(row => row.seq < before), rows = older.slice(0, 5).reverse();
  const messageIds = recent.map(row => row.id);
  const runs = messageIds.length ? await db.select({
    id:run.id,userMessageId:run.userMessageId,assistantMessageId:run.assistantMessageId,requestId:run.requestId,
    state:run.state,executionInput:run.executionInput,requestDiagnostics:run.requestDiagnostics,
  }).from(run).where(and(eq(run.userId,userId),eq(run.conversationId,current.id),
    or(inArray(run.assistantMessageId,messageIds),inArray(run.userMessageId,messageIds)))).orderBy(desc(run.createdAt)) : [];
  const [active] = await db.select({id:run.id,assistantMessageId:run.assistantMessageId,conversationId:run.conversationId,claimedAt:run.claimedAt})
    .from(run).where(and(eq(run.userId,userId),taskId?eq(run.conversationId,current.id):undefined,eq(run.state,"running")));
  const grantPurpose = taskId && !entitlement.chat ? "meal_entry" : "chat";
  const grants = await db.select({ provider: connection.provider, enabled: connection.enabled, expiresAt: aiToken.expiresAt, revokedAt: aiToken.revokedAt }).from(connection).innerJoin(aiToken, and(eq(aiToken.id, connection.tokenId), eq(aiToken.userId, userId))).where(and(eq(connection.userId, userId),eq(connection.purpose, grantPurpose))).orderBy(desc(connection.createdAt));
  const quoteId = !taskId ? pendingContextQuoteId(current.context) : undefined;
  const contextQuotes = new Map<string, ChatContextQuote>();
  const quotedIds = new Set(quoteId ? [quoteId] : []);
  for (const row of rows) {
    if (row.role === "user" && row.replyToId &&
      runs.some(item => item.userMessageId === row.id && item.executionInput?.contextQuote)) quotedIds.add(row.replyToId);
  }
  await Promise.all([...quotedIds].map(async id => {
    contextQuotes.set(id, await resolveContextQuote(db, userId, id) ?? { id, text: null });
  }));
  function present(row: StoredMessage): ChatMessage {
    const rowRun = row.role === "user" ? runs.findLast(item => item.userMessageId === row.id) : runs.find(item => item.assistantMessageId === row.id);
    const value = publicChatMessage(row,recent,rowRun?.id,rowRun?.requestId,rowRun?.userMessageId);
    const quote = row.replyToId && contextQuotes.get(row.replyToId);
    if (quote) value.replyTo = { id: quote.id, text: quote.text ?? "原消息已不可用。", contextQuote: true };
    const detailLimit = rowRun?.requestDiagnostics.find(item => item.state === "completed" && item.detailLimit)?.detailLimit;
    if (row.role === "assistant" && row.state === "complete" && detailLimit) value.detailLimit = detailLimit;
    const limit = row.role === "assistant" && row.state === "error" && rowRun ? runPhotoLimit(rowRun) : undefined;
    if (limit && rowRun) {
      const imageIds = unusedBatchPhotos(rowRun,limit,runs);
      if (imageIds.length) value.photoLimit = {...limit,imageIds};
      else {
        value.state = "complete";
        value.error = null;
        delete value.contextLimited;
      }
    } else if (value.contextLimited) {
      value.error = chatContextLimitNotice;
    }
    return value;
  }
  // 批次生成的回答可能已经把原失败行推到上一页，仍需刷新客户端已加载的分批状态。
  const photoUpdates = recent.filter(row => row.state === "error" && !rows.includes(row) &&
    runs.find(item => item.assistantMessageId === row.id)?.requestDiagnostics.at(-1)?.maxPhotos).map(present);
  return { capabilities:chatCapabilities(),entitlement,conversationId: current.id, provider: currentProvider(providerId(current.provider)),
    followup: current.followup, messages: rows.map(present), ...(quoteId ? { pendingContextQuote: contextQuotes.get(quoteId) } : {}), ...(photoUpdates.length ? { photoUpdates } : {}),
    hasMore: older.length > 5, before: rows[0]?.seq ?? null, activeRunId: active?.id ?? null,
    runTiming: active?.conversationId === current.id ? chatRunTiming(active) : null,
    catalog: chatProviderIds.filter(providerAvailable).map(id => { const grant = grants.find(row => row.provider === id), configured = providerConfigured(id), valid = !grant || grant.enabled && !grant.revokedAt && grant.expiresAt.getTime() > Date.now();
      return { id, label: chatProviders[id].label, model: chatProviders[id].model, configured, enabled: !!valid, reason: !configured ? "暂未配置或已停用" : !valid ? "授权已撤销或过期" : null, expiresAt: grant?.expiresAt.toISOString() ?? null }; }), usage: await chatUsage(db, userId) };
}
export function publicChatMessage(row: StoredMessage, context: StoredMessage[] = [], runId?: string, requestId?:string, questionId?:string): ChatMessage {
  const quote = context.find(item => item.id === row.replyToId);
  const question=row.role==="assistant"?(questionId?context.find(item=>item.id===questionId):[...context].filter(item=>item.role==="user"&&item.seq<row.seq).sort((a,b)=>b.seq-a.seq)[0]):null;
  return { id: row.id, seq: row.seq, role: row.role as "user" | "assistant", text: row.text, provider: row.provider ? providerId(row.provider) : null, state: row.state, createdAt: row.createdAt.toISOString(),
    replyTo: row.replyToId ? { id: row.replyToId, text: quote?.text.slice(0, 280) || "原消息已超出当前历史范围" } : null, imageIds: row.imageIds, steps: row.steps, references: row.references, error: row.error, ...(runId ? { runId } : {}),...(requestId?{requestId}:{}),...(question?{question:{id:question.id,text:question.text}}:{}),
    ...(isContextLimited(row) ? { contextLimited: true } : {}),
    ...(row.role==="user"&&row.supplementalAnswer?.answers.length?{
      answeredQuestions:row.supplementalAnswer.answers.map(({prompt,value,skipped,outcome,fieldKey})=>({
        prompt,value,skipped,...(outcome?{outcome}:{}),...(fieldKey?.startsWith("food.amount:")?{label:fieldKey.slice(12)}:{}),
      })),
      ...(row.supplementalAnswer.sourceAssistantMessageId?{followupSourceId:row.supplementalAnswer.sourceAssistantMessageId}:{}),
    }:{}) };
}
export async function startChatRun(db: Database, userId: string, input: ChatSend) {
  await requireChatAccount(db, userId, input.mealTask ? "meal_entry" : "chat"); await reapChatRuns(db, userId);
  return db.transaction(async tx => {
    await lockChatAccount(tx, userId, input.mealTask ? "meal_entry" : "chat");
    const requestDigest = digestChat(input);
    const [duplicate] = await tx.select().from(run).where(and(eq(run.userId, userId), eq(run.requestId, input.requestId)));
    if (duplicate) {
      const [original] = await tx.select({ id: conversation.id }).from(conversation).where(and(
        eq(conversation.id, duplicate.conversationId), eq(conversation.userId, userId), isNull(conversation.removedAt),
      ));
      if (!original) throw new ApiError(404, "not_found", "此对话已移出历史。");
      if (duplicate.requestDigest !== requestDigest) throw new ApiError(409, "request_conflict", "同一请求编号不能用于不同内容。");
      return { row: duplicate, started: false };
    }
    const [active] = await tx.select({ id: run.id }).from(run).where(and(eq(run.userId, userId), eq(run.state, "running")));
    if (active) throw new ApiError(409, "chat_busy", "已有回答正在生成，请等待或先停止。");
    const recentRequests = await tx.select({ id: run.id }).from(run).where(and(eq(run.userId, userId), gt(run.createdAt, new Date(Date.now() - 60000)))).limit(20);
    if (recentRequests.length >= 20) throw new ApiError(429, "chat_rate_limit", "发送得有些频繁，请一分钟后重试。当前输入保留。");
    const [current] = await tx.select().from(conversation).where(and(eq(conversation.id,input.conversationId),eq(conversation.userId,userId),eq(conversation.purpose,input.mealTask?"meal_entry":"chat"),eq(conversation.active,!input.mealTask)));
    if (!current || (isMealTaskContext(current.context) && current.context.cancelled)) throw new ApiError(404, "not_found", "当前会话已变化，请重新读取。");
    if (!providerConfigured(input.provider)) throw new ApiError(503, "model_unavailable", "此模型暂不可用，请选择其他模型。");
    const pendingQuoteId = pendingContextQuoteId(current.context);
    let useContextQuote = false;
    let seq = current.sequence, question: StoredMessage, answer: StoredMessage;
    let retainedAttachments: Pick<NonNullable<StoredRun["executionInput"]>,"attachmentSourceId"|"attachmentImageIds"|"photoBatchOf"> | undefined;
    if (input.imageSubset && (input.action !== "retry" || input.mealTask)) throw new ApiError(400,"invalid_image_subset","请从需要分批的原消息选择照片。");
    if (input.action === "send") {
      if (!input.followup && !input.text?.trim() && !input.imageIds?.length) throw new ApiError(400, "empty_message", "请输入内容或选择照片。");
      if (input.replyToId && input.replyToId === pendingQuoteId && !input.mealTask && current.sequence === 0) {
        const reference = await resolveContextQuote(tx, userId, input.replyToId);
        if (!reference) throw new ApiError(404, "quote_unavailable", "原消息已不可用，请移除引用后发送。");
        useContextQuote = true;
      } else if (input.replyToId) {
        const allowed = await tx.select({ id: message.id,role:message.role,state:message.state }).from(message).where(and(eq(message.userId, userId), eq(message.conversationId, current.id))).orderBy(desc(message.seq)).limit(50);
        if (!allowed.some(row => row.id === input.replyToId&&row.role==="assistant"&&row.state==="complete")) throw new ApiError(404, "quote_unavailable", "引用消息不在当前可用历史中，请取消引用或补充说明。");
      }
      const ids = input.imageIds ?? [];
      if (ids.length) { const owned = await tx.select({ id: mealImage.id }).from(mealImage).where(and(eq(mealImage.userId, userId), inArray(mealImage.id, ids))); if (owned.length !== ids.length) throw new ApiError(404, "image_unavailable", "照片不存在或不属于当前账号。"); }
      let supplementalAnswer:StoredMessage["supplementalAnswer"]=null;
      if (input.followup) {
        const resolved = resolveSupplement(current.followup,input.followup);
        const [predecessor] = await tx.select({answer:message.supplementalAnswer}).from(message)
          .where(and(eq(message.userId,userId),eq(message.conversationId,current.id),eq(message.id,resolved.taskMessageId)));
        const [previous] = await tx.select({input:run.executionInput, assistantMessageId:run.assistantMessageId}).from(run)
          .where(and(eq(run.userId,userId),eq(run.conversationId,current.id),eq(run.userMessageId,resolved.taskMessageId),eq(run.state,"complete")))
          .orderBy(desc(run.createdAt)).limit(1);
        if (previous && !resolved.sourceAssistantMessageId) resolved.sourceAssistantMessageId = previous.assistantMessageId;
        supplementalAnswer = mergeSupplements(predecessor?.answer,resolved);
        if (!ids.length && previous?.input) {
          const {attachmentSourceId,attachmentImageIds,photoBatchOf} = previous.input;
          retainedAttachments = {attachmentSourceId,attachmentImageIds,...(photoBatchOf?{photoBatchOf}:{})};
        }
      }
      [question] = await tx.insert(message).values({ id: randomUUID(), userId, conversationId: current.id, seq: ++seq, role: "user", text: input.followup ? followupText(current.followup,input.followup) : input.text?.trim() ?? "", supplementalAnswer, replyToId: input.replyToId, imageIds: ids }).returning();
      [answer] = await tx.insert(message).values({ id: randomUUID(), userId, conversationId: current.id, seq: ++seq, role: "assistant", state: "working", provider: input.provider }).returning();
    } else {
      const [original] = await tx.select().from(message).where(and(eq(message.id, input.messageId ?? ""), eq(message.userId, userId), eq(message.conversationId, current.id), eq(message.role, "assistant")));
      if (!original || !["error", "stopped", "truncated"].includes(original.state)) throw new ApiError(409, "retry_unavailable", "这条消息当前不需要重试。");
      const [previous] = await tx.select().from(run).where(and(eq(run.userId, userId), eq(run.assistantMessageId, original.id))).orderBy(desc(run.createdAt)).limit(1);
      [question] = await tx.select().from(message).where(and(eq(message.userId,userId),eq(message.conversationId,current.id),eq(message.id,previous?.userMessageId??"")));
      if (!question) throw new ApiError(404,"not_found","原始问题已不可用。");
      useContextQuote = previous?.executionInput?.contextQuote === true;
      if (previous?.executionInput) {
        const {attachmentSourceId,attachmentImageIds,photoBatchOf} = previous.executionInput;
        retainedAttachments = {attachmentSourceId,attachmentImageIds,...(photoBatchOf?{photoBatchOf}:{})};
      }
      if (input.imageSubset) {
        const limit = previous && runPhotoLimit(previous);
        if (!previous || !limit || !retainedAttachments || !input.imageSubset.length || input.imageSubset.length > limit.maxPhotos ||
            new Set(input.imageSubset).size !== input.imageSubset.length)
          throw new ApiError(400,"invalid_image_subset","请选择本条消息允许数量内的照片。");
        const batches = await tx.select({state:run.state,userMessageId:run.userMessageId,executionInput:run.executionInput}).from(run)
          .where(and(eq(run.userId,userId),eq(run.conversationId,current.id),eq(run.state,"complete"),
            or(eq(run.userMessageId,question.id),sql`${run.executionInput}->>'photoBatchOf' = ${original.id}`)));
        const available = unusedBatchPhotos(previous,limit,batches);
        if (input.imageSubset.some(id => !available.includes(id))) throw new ApiError(409,"image_subset_changed","可处理的照片已变化，请重新读取。");
        if (current.followup) throw new ApiError(409,"followup_pending","请先完成当前补充，再处理下一批照片。");
        retainedAttachments = {attachmentSourceId:retainedAttachments.attachmentSourceId,attachmentImageIds:input.imageSubset,photoBatchOf:original.id};
      } else if (!input.mealTask && previous && runPhotoLimit(previous)) {
        throw new ApiError(400,"image_subset_required","请从本条消息选择要继续处理的照片。");
      }
      if (input.action === "continue" && original.provider === input.provider) [answer] = await tx.update(message).set({ state: "working", error: null }).where(eq(message.id, original.id)).returning();
      else [answer] = await tx.insert(message).values({ id: randomUUID(), userId, conversationId: current.id, seq: ++seq, role: "assistant", state: "working", provider: input.provider }).returning();
    }
    await tx.update(conversation).set({ sequence: seq, provider: input.provider, updatedAt: new Date(), ...(pendingQuoteId && input.action === "send" ? { context: null } : {}) }).where(eq(conversation.id, current.id));
    const recognitionId = input.mealTask ? await prepareRecognition(tx, current, digestChat({ text: input.text ?? "", images: input.imageIds ?? [] }), !!input.followup) : null;
    const [created] = await tx.insert(run).values({ id: randomUUID(), userId, conversationId: current.id, userMessageId: question.id, assistantMessageId: answer.id, requestId: input.requestId, requestDigest, provider: input.provider, model: chatProviders[input.provider].model, recognitionId,
      executionInput: {action:input.action,requestId:input.requestId,provider:input.provider,conversationId:input.conversationId,timezone:input.timezone,...(input.messageId?{messageId:input.messageId}:{}),...(input.mealTask?{mealTask:true}:{}),...(useContextQuote ? { contextQuote: true as const } : {}),...(retainedAttachments??await chatAttachmentBinding(tx as unknown as Database,userId,question,input.followup?current.followup?.messageId:undefined))}
    }).returning();
    return { row: created, started: true };
  });
}
export async function removeChatConversation(db: Database, userId: string, id: string) {
  await db.transaction(async tx => {
    await lockActiveAccount(tx, userId);
    const owned = and(eq(conversation.id, id), eq(conversation.userId, userId), eq(conversation.purpose, "chat"));
    const [target] = await tx.select().from(conversation).where(owned);
    if (!target) throw new ApiError(404, "not_found", "找不到这段对话。");
    if (target.removedAt) return;

    const [busy] = await tx.select({ id: run.id }).from(run).where(and(
      eq(run.userId, userId), eq(run.conversationId, id), eq(run.state, "running"),
    ));
    if (busy) throw new ApiError(409, "chat_busy", "这段对话正在生成，请先停止回答。");

    await tx.update(conversation).set({ active: false, removedAt: new Date() }).where(owned);
    if (target.active) {
      await tx.insert(conversation).values({ id: randomUUID(), userId, provider: currentProvider(providerId(target.provider)) });
    }
  });
}

export async function controlChat(db: Database, userId: string, input: { action: ChatControlAction; conversationId?: string; provider?: ChatProvider; runId?: string; mealTaskId?: string; contextQuoteId?: string }) {
  const purpose = input.mealTaskId ? "meal_entry" : "chat";
  if (input.action === "stop") await requireActiveAccount(db, userId); else await requireChatAccount(db, userId, purpose);
  if (!input.mealTaskId) await currentConversation(db, userId, input.action === "stop");
  let stoppedRunId: string | undefined;
  await db.transaction(async tx => {
    const owner = await lockActiveAccount(tx, userId); if (input.action !== "stop") assertChatAllowed(owner, purpose);
    const [current] = await tx.select().from(conversation).where(and(eq(conversation.userId,userId), input.mealTaskId ? and(eq(conversation.id, input.mealTaskId), eq(conversation.purpose, "meal_entry")) : and(eq(conversation.purpose,"chat"),eq(conversation.active,true))));
    if (!current) throw new ApiError(409,"conversation_changed","当前会话已变化，请重新读取。");
    const [busy] = await tx.select().from(run).where(and(eq(run.userId, userId), eq(run.state, "running")));
    if (input.action === "stop") {
      if (!busy || busy.id !== input.runId || input.mealTaskId && busy.conversationId !== current.id) return;
      await tx.update(run).set({ state: "stopped" }).where(eq(run.id, busy.id));
      await tx.update(message).set({ state: "stopped" }).where(and(eq(message.id, busy.assistantMessageId), eq(message.userId, userId))); stoppedRunId = busy.id; return;
    }
    if (busy && input.action === "revoke" && input.provider === busy.provider) {
      await tx.update(run).set({state:"stopped"}).where(eq(run.id,busy.id));
      await tx.update(message).set({state:"stopped"}).where(and(eq(message.id,busy.assistantMessageId),eq(message.userId,userId)));stoppedRunId=busy.id;
    } else if (busy) throw new ApiError(409, "chat_busy", "请先停止当前回答，再进行此操作。");
    if(input.action==="select_conversation"){
      const [target]=await tx.select().from(conversation).where(and(eq(conversation.id,input.conversationId??""),eq(conversation.userId,userId),eq(conversation.purpose,"chat"),isNull(conversation.removedAt)));
      if(!target)throw new ApiError(404,"not_found","此对话不存在或不属于当前账号。");
      if(target.id!==current.id){await tx.update(conversation).set({active:false}).where(and(eq(conversation.userId,userId),eq(conversation.active,true)));await tx.update(conversation).set({active:true}).where(eq(conversation.id,target.id));}
    }
    if (input.action === "select_model") { const provider = providerId(input.provider); if (!providerConfigured(provider)) throw new ApiError(503, "model_unavailable", "该模型暂不可用。"); await tx.update(conversation).set({ provider }).where(eq(conversation.id, current.id)); }
    if (input.action === "clear_followup") await tx.update(conversation).set({ followup: null }).where(eq(conversation.id, current.id));
    if (input.action === "new" || input.action === "clear_context_quote") {
      if (input.mealTaskId) throw new ApiError(400, "invalid_action", "饮食识别使用当前餐次任务。");
      if (input.conversationId && input.conversationId !== current.id) throw new ApiError(409, "conversation_changed", "当前会话已变化，请重新读取。");
      if (input.action === "clear_context_quote") {
        if (pendingContextQuoteId(current.context)) await tx.update(conversation).set({ context: null }).where(eq(conversation.id, current.id));
      } else {
        if (input.contextQuoteId && !await resolveContextQuote(tx, userId, input.contextQuoteId, current.id)) {
          throw new ApiError(404, "quote_unavailable", "原消息已不可用。");
        }
        await tx.update(conversation).set({ active: false }).where(eq(conversation.id, current.id));
        await tx.insert(conversation).values({
          id: randomUUID(), userId, provider: currentProvider(providerId(current.provider)),
          context: input.contextQuoteId ? { contextQuoteId: input.contextQuoteId } : null,
        });
      }
    }
    if (input.action === "revoke" || input.action === "enable") {
      const grantPurpose = purpose === "meal_entry" && !accountEntitlements(owner).chat ? "meal_entry" : "chat";
      const provider = providerId(input.provider);
      if(input.action === "enable" && !providerAvailable(provider)) throw new ApiError(503,"model_unavailable","该模型已停用，请选择千问或小米 MiMo。");
      const [grant] = await tx.select().from(connection).where(and(eq(connection.userId, userId), eq(connection.provider, provider),eq(connection.purpose,grantPurpose))).orderBy(desc(connection.createdAt)).limit(1);
      const name = chatProviders[provider].label + (grantPurpose === "meal_entry" ? " · 站内饮食识图" : " · 站内助手"), prefix = grantPurpose === "meal_entry" ? "fw_internal_meal" : "fw_internal";
      if (!grant && input.action === "enable") {
        const tokenId = randomUUID();
        await tx.insert(aiToken).values({ id:tokenId,userId,name,tokenHash:digestChat(randomUUID()+randomUUID()),prefix,permission:"write",expiresAt:new Date(Date.now()+30*86400000) });
        await tx.insert(connection).values({id:randomUUID(),userId,provider,tokenId,purpose:grantPurpose});
      } else if (grant) {
        await tx.update(aiToken).set({ revokedAt: new Date() }).where(and(eq(aiToken.id, grant.tokenId), eq(aiToken.userId, userId)));
        if (input.action === "revoke") await tx.update(connection).set({ enabled: false }).where(eq(connection.id, grant.id));
        else {
          const tokenId = randomUUID();
          await tx.insert(aiToken).values({ id: tokenId, userId, name, tokenHash: digestChat(randomUUID() + randomUUID()), prefix, permission: "write", expiresAt: new Date(Date.now() + 30 * 86400000) });
          await tx.update(connection).set({ enabled: false }).where(eq(connection.id, grant.id));
          await tx.insert(connection).values({ id: randomUUID(), userId, provider, tokenId, enabled: true, purpose:grantPurpose });
        }
      }
    }
  });
  return stoppedRunId;
}
