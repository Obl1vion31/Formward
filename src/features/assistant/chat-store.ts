import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assistantConnection as connection, assistantConversation as conversation, assistantMessage as message, assistantRun as run, assistantUsageRequest as usageRequest, aiToken, mealImage, user } from "../../db/schema";
import { ApiError } from "../auth/ai-identity";
import { lockActiveAccount, requireActiveAccount } from "../auth/account-security";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { assertChatAllowed, CHAT_DAILY_LIMIT, chatProviders, providerConfigured, providerId, type ChatRates } from "./chat-config";
import { budgetDate, chatProviderIds, nextBudgetReset, usagePercent, type ChatMessage, type ChatProvider, type ChatSnapshot, type ChatUsage } from "./chat-model";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type StoredRun = typeof run.$inferSelect;
export type StoredMessage = typeof message.$inferSelect;
export type ChatSend = { action: "send" | "retry" | "continue"; requestId: string; provider: ChatProvider; conversationId: string; text?: string; replyToId?: string; imageIds?: string[]; messageId?: string; timezone: string };
export const digestChat = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key,item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item)).digest("hex");

export async function requireChatAccount(db: Pick<Database, "select">, userId: string) { const owner = await requireActiveAccount(db, userId); assertChatAllowed(owner); return owner; }
async function lockChatAccount(tx: Tx, userId: string) { const owner = await lockActiveAccount(tx, userId); assertChatAllowed(owner); return owner; }
export async function currentConversation(db: Database, userId: string) {
  return db.transaction(async tx => {
    await lockChatAccount(tx, userId);
    const [active] = await tx.select().from(conversation).where(and(eq(conversation.userId, userId), eq(conversation.active, true)));
    if (active) return active;
    const [previous] = await tx.select().from(conversation).where(eq(conversation.userId, userId)).orderBy(desc(conversation.createdAt)).limit(1);
    const [created] = await tx.insert(conversation).values({ id: randomUUID(), userId, provider: previous?.provider ?? "qwen" }).returning();
    return created;
  });
}
export async function chatUsage(db: Pick<Database, "select">, userId: string, now = new Date()): Promise<ChatUsage> {
  const date = budgetDate(now);
  const totals = await db.select({ provider: usageRequest.provider, state: usageRequest.state,
    cost: sql<string>`coalesce(sum(${usageRequest.costCny}),0)::text`, reserved: sql<string>`coalesce(sum(${usageRequest.reservedCny}),0)::text`,
  }).from(usageRequest).where(and(eq(usageRequest.userId, userId), eq(usageRequest.date, date))).groupBy(usageRequest.provider, usageRequest.state);
  const providers = chatProviderIds.map(id => ({ id, spent: 0, reserved: 0, uncertain: 0 }));
  for (const row of totals) {
    const item = providers.find(p => p.id === row.provider)!;
    if (row.state === "settled") item.spent += Number(row.cost); else if (row.state === "unknown") item.uncertain += Number(row.reserved); else item.reserved += Number(row.reserved);
  }
  const spent = providers.reduce((sum, p) => sum + p.spent, 0), reserved = providers.reduce((sum, p) => sum + p.reserved, 0), uncertain = providers.reduce((sum, p) => sum + p.uncertain, 0);
  return { date, limit: CHAT_DAILY_LIMIT, spent, reserved, uncertain, available: Math.max(0, CHAT_DAILY_LIMIT - spent - reserved - uncertain), percent: usagePercent(spent, CHAT_DAILY_LIMIT), resetAt: nextBudgetReset(date), providers };
}
export function normalizedUsage(raw: Record<string, unknown> | null, rates: ChatRates) {
  if (!raw || !Number.isSafeInteger(raw.prompt_tokens) || !Number.isSafeInteger(raw.completion_tokens) || Number(raw.prompt_tokens) < 0 || Number(raw.completion_tokens) < 0) return null;
  const details = raw.prompt_tokens_details as Record<string, unknown> | undefined;
  const cached = details?.cached_tokens ?? raw.prompt_cache_hit_tokens;
  const hit = Number.isSafeInteger(cached) && Number(cached) >= 0 && Number(cached) <= Number(raw.prompt_tokens) ? Number(cached) : 0;
  return ((Number(raw.prompt_tokens) - hit) * rates.input + hit * rates.cachedInput + Number(raw.completion_tokens) * rates.output) / 1e6;
}
export function estimatedChatInput(body: unknown) {
  let images = 0;
  const text = JSON.stringify(body, (key, value) => { if (key === "url" && typeof value === "string" && value.startsWith("data:image/")) { images++; return "[image]"; } return value; });
  return Buffer.byteLength(text) + 4096 + images * 65536;
}
export function reserveCost(body: unknown, rates: ChatRates) {
  return estimatedChatInput(body) * rates.input / 1e6 + 8208 * rates.output / 1e6;
}
export async function settleChatUsage(db: Database, userId: string, id: string, raw: Record<string, unknown> | null, rejectedStatus?: number) {
  await db.transaction(async tx => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    const [row] = await tx.select().from(usageRequest).where(and(eq(usageRequest.id, id), eq(usageRequest.userId, userId)));
    if (!row || row.state !== "reserved") return;
    const rejected = rejectedStatus !== undefined && [400,401,402,403,404,413,422,429].includes(rejectedStatus);
    const cost = rejected ? 0 : normalizedUsage(raw, row.rates);
    await tx.update(usageRequest).set({ state: cost === null ? "unknown" : "settled", costCny: cost === null ? null : cost.toFixed(8), usage: rejected ? { requestRejected: true, httpStatus: rejectedStatus } : raw }).where(eq(usageRequest.id, id));
  });
}
export async function reserveChatUsage(db: Database, ownerId: string, activeRun: StoredRun, amount: number) {
  return db.transaction(async tx => {
    await lockChatAccount(tx, ownerId);
    const [live] = await tx.select().from(run).where(and(eq(run.id, activeRun.id), eq(run.userId, ownerId), eq(run.state, "running")));
    if (!live) throw new ApiError(409, "stopped", "生成已停止。");
    const budget = await chatUsage(tx, ownerId);
    if (budget.available + 1e-9 < amount) throw new ApiError(429, "daily_budget", "今日可用额度不足以开始这次请求。待结算用量也会暂占额度；提醒和手工记录仍可使用。");
    const id = randomUUID();
    await tx.insert(usageRequest).values({ id, userId: ownerId, runId: activeRun.id, provider: activeRun.provider, date: budget.date, reservedCny: amount.toFixed(8), rates: chatProviders[providerId(activeRun.provider)].rates });
    return id;
  });
}
export async function chatIdentity(db: Database, ownerId: string, provider: ChatProvider, create = false) {
  return db.transaction(async tx => {
    await lockChatAccount(tx, ownerId);
    let [row] = await tx.select().from(connection).where(and(eq(connection.userId, ownerId), eq(connection.provider, provider))).orderBy(desc(connection.createdAt)).limit(1);
    if (!row && create) {
      // 原文只在此处产生且立即丢弃；站内执行凭有效会话和本人的连接引用，不接受浏览器凭据。
      const tokenId = randomUUID();
      await tx.insert(aiToken).values({ id: tokenId, userId: ownerId, name: chatProviders[provider].label + " · 站内助手", tokenHash: digestChat(randomUUID() + randomUUID()), prefix: "fw_internal", permission: "write", expiresAt: new Date(Date.now() + 30 * 86400000) });
      [row] = await tx.insert(connection).values({ id: randomUUID(), userId: ownerId, provider, tokenId }).returning();
    }
    if (!row?.enabled) throw new ApiError(403, "chat_grant_revoked", "此模型的站内授权已撤销，请在连接详情中重新启用。");
    const identity = { userId: ownerId, tokenId: row.tokenId, permission: "write" as const };
    await requireActiveAiToken(tx, identity);
    return identity;
  });
}
export async function reapChatRuns(db: Database, userId: string) {
  await db.transaction(async tx => {
    await lockChatAccount(tx, userId);
    const stale = await tx.update(run).set({ state: "stopped" }).where(and(eq(run.userId, userId), eq(run.state, "running"), lt(run.heartbeatAt, new Date(Date.now() - 150000)))).returning();
    for (const row of stale) {
      await tx.update(message).set({ state: "stopped", error: "连接已中断，已保存的内容保留。可以继续或重试。" }).where(and(eq(message.id, row.assistantMessageId), eq(message.userId, userId)));
      await tx.update(usageRequest).set({ state: "unknown" }).where(and(eq(usageRequest.runId, row.id), eq(usageRequest.userId, userId), eq(usageRequest.state, "reserved")));
    }
  });
}
export async function chatSnapshot(db: Database, userId: string, before?: number): Promise<ChatSnapshot> {
  await requireChatAccount(db, userId); await reapChatRuns(db, userId);
  const current = await currentConversation(db, userId);
  const recent = await db.select().from(message).where(and(eq(message.userId, userId), eq(message.conversationId, current.id))).orderBy(desc(message.seq)).limit(50);
  const older = before === undefined ? recent : recent.filter(row => row.seq < before), rows = older.slice(0, 5).reverse();
  const runs = rows.length ? await db.select().from(run).where(and(eq(run.userId, userId), inArray(run.assistantMessageId, rows.map(row => row.id)))).orderBy(desc(run.createdAt)) : [];
  const [active] = await db.select({ id: run.id }).from(run).where(and(eq(run.userId, userId), eq(run.conversationId, current.id), eq(run.state, "running")));
  const grants = await db.select({ provider: connection.provider, enabled: connection.enabled, expiresAt: aiToken.expiresAt, revokedAt: aiToken.revokedAt }).from(connection).innerJoin(aiToken, and(eq(aiToken.id, connection.tokenId), eq(aiToken.userId, userId))).where(eq(connection.userId, userId)).orderBy(desc(connection.createdAt));
  return { conversationId: current.id, provider: providerId(current.provider), followup: current.followup, messages: rows.map(row => publicChatMessage(row, recent, runs.find(item => item.assistantMessageId === row.id)?.id)),
    hasMore: older.length > 5, before: rows[0]?.seq ?? null, activeRunId: active?.id ?? null,
    catalog: chatProviderIds.map(id => { const grant = grants.find(row => row.provider === id), configured = providerConfigured(id), valid = !grant || grant.enabled && !grant.revokedAt && grant.expiresAt.getTime() > Date.now();
      return { id, label: chatProviders[id].label, model: chatProviders[id].model, configured, enabled: !!valid, reason: !configured ? "暂未配置或已停用" : !valid ? "授权已撤销或过期" : null, expiresAt: grant?.expiresAt.toISOString() ?? null }; }), usage: await chatUsage(db, userId) };
}
export function publicChatMessage(row: StoredMessage, context: StoredMessage[] = [], runId?: string): ChatMessage {
  const quote = context.find(item => item.id === row.replyToId);
  return { id: row.id, seq: row.seq, role: row.role as "user" | "assistant", text: row.text, provider: row.provider ? providerId(row.provider) : null, state: row.state, createdAt: row.createdAt.toISOString(),
    replyTo: row.replyToId ? { id: row.replyToId, text: quote?.text.slice(0, 280) || "原消息已超出当前历史范围" } : null, imageIds: row.imageIds, steps: row.steps, references: row.references, error: row.error, ...(runId ? { runId } : {}) };
}
export async function startChatRun(db: Database, userId: string, input: ChatSend) {
  await requireChatAccount(db, userId); await reapChatRuns(db, userId);
  return db.transaction(async tx => {
    await lockChatAccount(tx, userId);
    const requestDigest = digestChat(input);
    const [duplicate] = await tx.select().from(run).where(and(eq(run.userId, userId), eq(run.requestId, input.requestId)));
    if (duplicate) { if (duplicate.requestDigest !== requestDigest) throw new ApiError(409, "request_conflict", "同一请求编号不能用于不同内容。"); return { row: duplicate, started: false }; }
    const [active] = await tx.select({ id: run.id }).from(run).where(and(eq(run.userId, userId), eq(run.state, "running")));
    if (active) throw new ApiError(409, "chat_busy", "已有回答正在生成，请等待或先停止。");
    const recentRequests = await tx.select({ id: run.id }).from(run).where(and(eq(run.userId, userId), gt(run.createdAt, new Date(Date.now() - 60000)))).limit(20);
    if (recentRequests.length >= 20) throw new ApiError(429, "chat_rate_limit", "发送得有些频繁，请一分钟后重试。当前输入保留。");
    const [current] = await tx.select().from(conversation).where(and(eq(conversation.id, input.conversationId), eq(conversation.userId, userId), eq(conversation.active, true)));
    if (!current) throw new ApiError(404, "not_found", "当前会话已变化，请重新读取。");
    if (!providerConfigured(input.provider)) throw new ApiError(503, "model_unavailable", "此模型暂不可用，请选择其他模型。");
    let seq = current.sequence, question: StoredMessage, answer: StoredMessage;
    if (input.action === "send") {
      if (!input.text?.trim() && !input.imageIds?.length) throw new ApiError(400, "empty_message", "请输入内容或选择照片。");
      if (input.replyToId) {
        const allowed = await tx.select({ id: message.id }).from(message).where(and(eq(message.userId, userId), eq(message.conversationId, current.id))).orderBy(desc(message.seq)).limit(50);
        if (!allowed.some(row => row.id === input.replyToId)) throw new ApiError(404, "quote_unavailable", "引用消息不在当前可用历史中，请取消引用或补充说明。");
      }
      const ids = input.imageIds ?? [];
      if (ids.length) { const owned = await tx.select({ id: mealImage.id }).from(mealImage).where(and(eq(mealImage.userId, userId), inArray(mealImage.id, ids))); if (owned.length !== ids.length) throw new ApiError(404, "image_unavailable", "照片不存在或不属于当前账号。"); }
      [question] = await tx.insert(message).values({ id: randomUUID(), userId, conversationId: current.id, seq: ++seq, role: "user", text: input.text?.trim() ?? "", replyToId: input.replyToId, imageIds: ids }).returning();
      [answer] = await tx.insert(message).values({ id: randomUUID(), userId, conversationId: current.id, seq: ++seq, role: "assistant", state: "working", provider: input.provider }).returning();
    } else {
      const [original] = await tx.select().from(message).where(and(eq(message.id, input.messageId ?? ""), eq(message.userId, userId), eq(message.conversationId, current.id), eq(message.role, "assistant")));
      if (!original || !["error", "stopped", "truncated"].includes(original.state)) throw new ApiError(409, "retry_unavailable", "这条消息当前不需要重试。");
      const [previous] = await tx.select().from(run).where(and(eq(run.userId, userId), eq(run.assistantMessageId, original.id))).orderBy(desc(run.createdAt)).limit(1);
      [question] = await tx.select().from(message).where(and(eq(message.userId, userId), eq(message.id, previous?.userMessageId ?? "")));
      if (!question) throw new ApiError(404, "not_found", "原始问题已不可用。");
      if (input.action === "continue" && original.provider === input.provider) [answer] = await tx.update(message).set({ state: "working", error: null }).where(eq(message.id, original.id)).returning();
      else [answer] = await tx.insert(message).values({ id: randomUUID(), userId, conversationId: current.id, seq: ++seq, role: "assistant", state: "working", provider: input.provider }).returning();
    }
    await tx.update(conversation).set({ sequence: seq, provider: input.provider, updatedAt: new Date() }).where(eq(conversation.id, current.id));
    const [created] = await tx.insert(run).values({ id: randomUUID(), userId, conversationId: current.id, userMessageId: question.id, assistantMessageId: answer.id, requestId: input.requestId, requestDigest, provider: input.provider, model: chatProviders[input.provider].model }).returning();
    return { row: created, started: true };
  });
}
export async function controlChat(db: Database, userId: string, input: { action: "select_model" | "new" | "stop" | "enable" | "revoke" | "clear_followup"; provider?: ChatProvider; runId?: string }) {
  await requireChatAccount(db, userId);
  await currentConversation(db, userId);
  let stoppedRunId: string | undefined;
  await db.transaction(async tx => {
    await lockChatAccount(tx, userId);
    const [current] = await tx.select().from(conversation).where(and(eq(conversation.userId,userId),eq(conversation.active,true)));
    if (!current) throw new ApiError(409,"conversation_changed","当前会话已变化，请重新读取。");
    const [busy] = await tx.select().from(run).where(and(eq(run.userId, userId), eq(run.state, "running")));
    if (input.action === "stop") {
      if (!busy || busy.id !== input.runId) return;
      await tx.update(run).set({ state: "stopped" }).where(eq(run.id, busy.id));
      await tx.update(message).set({ state: "stopped" }).where(and(eq(message.id, busy.assistantMessageId), eq(message.userId, userId))); stoppedRunId = busy.id; return;
    }
    if (busy && input.action === "revoke" && input.provider === busy.provider) {
      await tx.update(run).set({state:"stopped"}).where(eq(run.id,busy.id));
      await tx.update(message).set({state:"stopped"}).where(and(eq(message.id,busy.assistantMessageId),eq(message.userId,userId)));stoppedRunId=busy.id;
    } else if (busy) throw new ApiError(409, "chat_busy", "请先停止当前回答，再进行此操作。");
    if (input.action === "select_model") { const provider = providerId(input.provider); if (!providerConfigured(provider)) throw new ApiError(503, "model_unavailable", "该模型暂不可用。"); await tx.update(conversation).set({ provider }).where(eq(conversation.id, current.id)); }
    if (input.action === "clear_followup") await tx.update(conversation).set({ followup: null }).where(eq(conversation.id, current.id));
    if (input.action === "new") {
      await tx.update(conversation).set({ active: false }).where(and(eq(conversation.userId, userId), eq(conversation.active, true)));
      await tx.insert(conversation).values({ id: randomUUID(), userId, provider: current.provider });
    }
    if (input.action === "revoke" || input.action === "enable") {
      const provider = providerId(input.provider), [grant] = await tx.select().from(connection).where(and(eq(connection.userId, userId), eq(connection.provider, provider))).orderBy(desc(connection.createdAt)).limit(1);
      if (!grant && input.action === "enable") {
        const tokenId = randomUUID();
        await tx.insert(aiToken).values({ id:tokenId,userId,name:chatProviders[provider].label + " · 站内助手",tokenHash:digestChat(randomUUID()+randomUUID()),prefix:"fw_internal",permission:"write",expiresAt:new Date(Date.now()+30*86400000) });
        await tx.insert(connection).values({id:randomUUID(),userId,provider,tokenId});
      } else if (grant) {
        await tx.update(aiToken).set({ revokedAt: new Date() }).where(and(eq(aiToken.id, grant.tokenId), eq(aiToken.userId, userId)));
        if (input.action === "revoke") await tx.update(connection).set({ enabled: false }).where(eq(connection.id, grant.id));
        else {
          const tokenId = randomUUID();
          await tx.insert(aiToken).values({ id: tokenId, userId, name: chatProviders[provider].label + " · 站内助手", tokenHash: digestChat(randomUUID() + randomUUID()), prefix: "fw_internal", permission: "write", expiresAt: new Date(Date.now() + 30 * 86400000) });
          await tx.update(connection).set({ enabled: false }).where(eq(connection.id, grant.id));
          await tx.insert(connection).values({ id: randomUUID(), userId, provider, tokenId, enabled: true });
        }
      }
    }
  });
  return stoppedRunId;
}
