import { buildAiSystemPrompt } from "../records/ai-prompt.mjs";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { assistantConversation, assistantMessage, assistantRun, type AssistantToolResult } from "../../db/schema";
import { currentSessionIdentity } from "../auth/request-identity";
import { ApiError } from "../auth/ai-identity";
import { requireActiveAiToken } from "../auth/ai-tokens";
import { loadMealImage } from "../meals/images";
import { chatProviders, providerId } from "./chat-config";
import { chatIdentity, chatSnapshot, chatUsage, digestChat, estimatedChatInput, publicChatMessage, requireChatAccount, reserveChatUsage, reserveCost, settleChatUsage, type ChatSend, type StoredMessage, type StoredRun } from "./chat-store";
import { chatToolBridge, chatToolCatalog } from "./chat-tools";
import { modelBody, ProviderRejected, streamModel, type ProtocolMessage } from "./chat-provider";
import type { ChatEvent, ChatReference, ChatStep } from "./chat-model";
const controllers = new Map<string, AbortController>();
export function abortChatRun(id: string) { controllers.get(id)?.abort(); }
function visibleText(value: string) { return value.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i, ""); }
function safeFailure(error: unknown, aborted: boolean) {
  if (error instanceof ApiError) return error;
  if (aborted) return new ApiError(409, "stopped", "生成已停止，已经取得的内容已保留。");
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return new ApiError(504, "model_timeout", "等待模型回复超时，已有内容保留。可以重试或选择其他模型。");
  return new ApiError(503, "chat_failed", "这次回复未完成，已经取得的内容已保留。可以重试或选择其他模型。");
}
function operationReference(name: string, result: Record<string, unknown>): ChatReference | null {
  if (typeof result.confirmationUrl === "string") {
    try { const link = new URL(result.confirmationUrl); if (link.pathname.startsWith("/dashboard/")) return { title: "查看提交", href: link.pathname + link.search, kind: "preview", ...(typeof result.id === "string" ? { operationId: result.id } : {}) }; } catch {}
  }
  const pages: Record<string, string> = { query_meals: "meals", query_measurements: "measurements", query_energy: "energy", query_training: "training", search_foods: "meals" };
  return pages[name] ? { title: "查看" + ({ meals: "饮食记录", measurements: "实测记录", energy: "消耗记录", training: "训练记录" }[pages[name]]), href: "/dashboard/" + pages[name], kind: "record" } : null;
}
function toolSummary(name: string, result: Record<string, unknown>) {
  if (result.error) return "本步未成功，不能作为无记录或已保存。";
  if (typeof result.confirmationUrl === "string") return "已生成待确认预览，正式记录尚未保存。";
  const range = result.range as {from?:string;to?:string}|undefined;
  const prefix = range?.from && range.to ? `${range.from}—${range.to}：` : "";
  if (name === "query_measurements" && Array.isArray(result.days)) {
    const measured = result.days.filter((day: {daytime?:unknown;evening?:unknown}) => day.daytime || day.evening).length;
    return prefix + `已读取${result.days.length}天，其中${measured}天有实测；缺测保持为空。`;
  }
  if (name === "query_meals" && Array.isArray(result.days)) return prefix + `查到${result.days.length}个有饮食记录的日期；已有记录与已记全分开核对。`;
  if (name === "query_training" && Array.isArray(result.plans) && Array.isArray(result.sessions)) return prefix + `查到${result.plans.length}项排期、${result.sessions.length}次训练；计划与完成分开核对。`;
  if (name === "search_foods" && Array.isArray(result.foods)) return `找到${result.foods.length}项食材，使用当前规格及版本。`;
  return prefix + (name.startsWith("query_") || name.startsWith("get_") ? "已取得当前账号的结果，未知值保持为空。" : "本步已完成；正式记录是否保存以审核结果为准。");
}
async function imageContent(db: Database, userId: string, row: StoredMessage) {
  if (!row.imageIds.length) return row.text;
  const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [{ type: "text", text: row.text }];
  for (const id of row.imageIds) {
    const { stream, mimeType } = await loadMealImage(db, userId, id), bytes = Buffer.from(await new Response(stream).arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw new ApiError(413, "image_too_large", "照片超过20MiB，请换一张照片。");
    content.push({ type: "image_url", image_url: { url: "data:" + mimeType + ";base64," + bytes.toString("base64") } });
  }
  return content;
}
export async function executeChatRun(db: Database, activeRun: StoredRun, input: ChatSend, request: Request, emit: (event: ChatEvent) => void, outerSignal: AbortSignal, dependencies: { fetcher?: typeof fetch; skipSessionCheck?: boolean } = {}) {
  const controller = new AbortController(); controllers.set(activeRun.id, controller);
  const stop = () => controller.abort(); outerSignal.addEventListener("abort", stop, { once: true });
  const userId = activeRun.userId, provider = providerId(activeRun.provider);
  let rows: StoredMessage[] = [], text = "", steps: ChatStep[] = [], references: ChatReference[] = [], finished = false;
  let bridge: ReturnType<typeof chatToolBridge> | undefined, lastSave = 0, lastCheck = 0, runIdentity: Awaited<ReturnType<typeof chatIdentity>> | null = null;
  let results: AssistantToolResult[] = [];
  async function guard(force = false) {
    if (controller.signal.aborted) throw new ApiError(409, "stopped", "生成已停止。");
    if (!force && Date.now() - lastCheck < 2000) return;
    if (!dependencies.skipSessionCheck) { const current = await currentSessionIdentity(request.headers); if (current.user.id !== userId) throw new ApiError(401, "invalid_session", "登录已失效，请重新登录。"); }
    await requireChatAccount(db, userId);
    if (runIdentity) await db.transaction(async tx => { await requireActiveAiToken(tx, runIdentity!); });
    const [row] = await db.select({ state: assistantRun.state }).from(assistantRun).where(and(eq(assistantRun.id, activeRun.id), eq(assistantRun.userId, userId)));
    if (row?.state !== "running") { controller.abort(); throw new ApiError(409, "stopped", "生成已停止。"); }
    await db.update(assistantRun).set({ heartbeatAt: new Date() }).where(and(eq(assistantRun.id, activeRun.id), eq(assistantRun.state, "running"))); lastCheck = Date.now();
  }
  async function save(force = false) {
    if (!force && Date.now() - lastSave < 450) return;
    const [live] = await db.select({ state: assistantRun.state }).from(assistantRun).where(and(eq(assistantRun.id, activeRun.id), eq(assistantRun.userId, userId)));
    if (live?.state !== "running") return;
    const [row] = await db.update(assistantMessage).set({ text: visibleText(text), steps: [...steps], references: [...references] }).where(and(eq(assistantMessage.id, activeRun.assistantMessageId), eq(assistantMessage.userId, userId))).returning();
    if (row) emit({ type: "message", message: publicChatMessage(row, rows, activeRun.id) }); lastSave = Date.now();
  }
  try {
    rows = await db.select().from(assistantMessage).where(and(eq(assistantMessage.userId, userId), eq(assistantMessage.conversationId, activeRun.conversationId))).orderBy(desc(assistantMessage.seq)).limit(50);
    const [question] = await db.select().from(assistantMessage).where(and(eq(assistantMessage.id,activeRun.userMessageId),eq(assistantMessage.userId,userId),eq(assistantMessage.conversationId,activeRun.conversationId)));
    const initialAnswer = rows.find(row => row.id === activeRun.assistantMessageId);
    if (!question || !initialAnswer) throw new ApiError(409,"message_unavailable","原消息已不可用，请重新读取当前对话。");
    text = input.action === "continue" ? initialAnswer.text : ""; steps = [...initialAnswer.steps]; references = [...initialAnswer.references];
    let continuationText = initialAnswer.text;
    if (input.action === "continue" && input.messageId && input.messageId !== initialAnswer.id) {
      const [original] = await db.select().from(assistantMessage).where(and(eq(assistantMessage.id,input.messageId),eq(assistantMessage.userId,userId),eq(assistantMessage.conversationId,activeRun.conversationId),eq(assistantMessage.role,"assistant")));
      if (!original) throw new ApiError(409,"message_unavailable","原回答已不可用，请重新读取当前对话。");
      continuationText = original.text;
    }
    const prior = await db.select().from(assistantRun).where(and(eq(assistantRun.userId, userId), eq(assistantRun.userMessageId, activeRun.userMessageId))).orderBy(desc(assistantRun.createdAt)).limit(12);
    const checkedGrants = new Map<string,boolean>();
    for (const previous of prior.filter(row => row.id !== activeRun.id)) for (const receipt of previous.toolResults) {
      const tokenId = receipt.tokenId ?? previous.tokenId; if (!tokenId) continue;
      if (!checkedGrants.has(tokenId)) {
        try { await db.transaction(async tx => requireActiveAiToken(tx,{userId,tokenId,permission:"write"})); checkedGrants.set(tokenId,true); }
        catch { checkedGrants.set(tokenId,false); }
      }
      if (checkedGrants.get(tokenId)) results.push({...receipt,tokenId});
    }
    const identity = await chatIdentity(db, userId, provider, true);
    runIdentity = identity;
    await db.update(assistantRun).set({ tokenId: identity.tokenId }).where(eq(assistantRun.id, activeRun.id));
    await guard(true); bridge = chatToolBridge(db, identity, request); const catalog = await chatToolCatalog(bridge, (name,args) => "fwchat-" + digestChat({ userId, tokenId:identity.tokenId, messageId: question.id, name, fingerprint: digestChat({ name,args }) }).slice(0,48));
    for (const receipt of results) catalog.remember(receipt.name,receipt.args,receipt.result);
    const [current] = await db.select().from(assistantConversation).where(and(eq(assistantConversation.id, activeRun.conversationId), eq(assistantConversation.userId, userId)));
    const turns: StoredMessage[][] = [];
    for (const row of [...rows].reverse().filter(row => row.seq < question.seq && row.state !== "working")) {
      if (row.role === "user") turns.push([row]);
      else if (turns.length && (row.text || row.references.length)) turns.at(-1)!.push(row);
    }
    const history = turns.filter(turn => turn.length > 1).slice(-10).flat();
    const quoted = question.replyToId ? rows.find(row => row.id === question.replyToId) : null;
    const localTime = new Intl.DateTimeFormat("zh-CN", {timeZone:input.timezone,dateStyle:"full",timeStyle:"long"}).format(new Date());
    const prompt = buildAiSystemPrompt({ variant:chatProviders[provider].promptVariant, directory:catalog.directory, instructions:catalog.instructions, now:new Date().toISOString(), localTime, timezone:input.timezone,
      channelInstructions:"本轮为站内已鉴权对话，请求编号由服务器管理，无需生成。需要用户补充时使用request_followup声明具体问题和任务，再自然说明等待补充。引用仅提供上下文，不代表授权修改；新问题不相关时按新问题处理。不要展示原始思考、Key、工具加载实现或私有传输协议。" })
      + (current.followup ? "\n当前待补任务：" + JSON.stringify(current.followup) : "")
      + (quoted ? "\n用户明确引用的原消息（核对对象和最新版本后才可修改）：" + JSON.stringify({id:quoted.id,text:quoted.text,references:quoted.references,createdAt:quoted.createdAt}) : "");
    const taskSource = current.followup ? rows.find(row => row.id === current.followup!.messageId) : null;
    let attachmentSource = question.imageIds.length ? question : quoted?.imageIds.length ? quoted : taskSource?.imageIds.length ? taskSource : question;
    if (quoted?.role === "assistant" && !attachmentSource.imageIds.length) {
      const [originalRun] = await db.select({userMessageId:assistantRun.userMessageId}).from(assistantRun).where(and(eq(assistantRun.userId,userId),eq(assistantRun.conversationId,activeRun.conversationId),eq(assistantRun.assistantMessageId,quoted.id))).limit(1);
      attachmentSource = rows.find(row => row.id === originalRun?.userMessageId) ?? question;
    }
    const transport = `本轮来自站内已鉴权聊天，用户本地时间：${localTime}。${attachmentSource.imageIds.length ? "服务器已验证并私有保存的附件ID："+attachmentSource.imageIds.join("、")+"。这些站内附件不需要通过import_meal_images再次导入；创建预览时沿用对应imageIds。" : "本轮未附加照片。"}`;
    const navigation = history.filter(row => row.imageIds.length || row.references.length).map(row => ({ messageId:row.id, imageIds:row.imageIds, references:row.references }));
    const presentation = "历史导航与附件定位信息仅供工具使用，不属于用户或助手的原话。最终回答不要复述内部JSON、字段名、UUID或加载工具的计划；明确要求技术细节时除外，必要的完整审核链接保留。日期和时间（含预览到期时间）均按用户时区表达，不能将UTC时间直接当成本地时间。";
    const messages: ProtocolMessage[] = [{ role: "system", content: prompt + "\n" + transport + "\n" + presentation + (navigation.length ? "\n历史定位信息：" + JSON.stringify(navigation) : "") }, ...history.map(row => ({ role: row.role, content: row.text })), { role: "user", content: await imageContent(db, userId, { ...question,imageIds:attachmentSource.imageIds }) }];
    if (input.action === "continue") messages.push({ role: "system", content: "接续上次未完成的回答，只输出后续内容，避免重复。已经生成：" + continuationText });
    if (results.length) messages.push({ role: "system", content: "本问题前次尝试已经执行的工具与结果，先核对并复用，不重复创建预览：" + JSON.stringify(results.map(row => ({ name: row.name, args: row.args, result: row.result }))) });
    await db.update(assistantConversation).set({ followup: null }).where(eq(assistantConversation.id, activeRun.conversationId));
    let endState = "truncated";
    for (let round = 0; round < 8; round++) {
      await guard(true);
      const body = modelBody(provider, messages, catalog.tools());
      if (estimatedChatInput(body) > 200000) throw new ApiError(409,"context_limit","本次上下文或照片较多，请减少照片或开始新对话。已有记录和消息保留。");
      const reservation = await reserveChatUsage(db, userId, activeRun, reserveCost(body, chatProviders[provider].rates));
      emit({ type: "usage", usage: await chatUsage(db, userId) }); let usage: Record<string, unknown> | null = null, rejectedStatus: number | undefined;
      let reply: Awaited<ReturnType<typeof streamModel>>;
      try {
        reply = await streamModel(provider, body, AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]), async delta => { text += delta; await guard(); await save(); }, async value => { usage = value; }, dependencies.fetcher);
      } catch (error) { if (error instanceof ProviderRejected && ["provider_balance","provider_credentials","provider_rate_limit","provider_quota"].includes(error.code)) rejectedStatus = error.httpStatus; throw error; }
      finally { await settleChatUsage(db, userId, reservation, usage, rejectedStatus); emit({ type: "usage", usage: await chatUsage(db, userId) }); }
      await save(true);
      if (!reply.calls.length) { endState = reply.finish === "length" ? "truncated" : "complete"; break; }
      messages.push({ role: "assistant", content: reply.text || null, tool_calls: reply.calls, ...(reply.reasoning ? { reasoning_content: reply.reasoning } : {}) });
      if (reply.calls.length > 8) throw new ApiError(502,"tool_batch_limit","本次工具调用过多，请缩小问题范围后继续。");
      for (const call of reply.calls) {
        await guard(true); let args: Record<string, unknown>;
        try { args = JSON.parse(call.function.arguments); if (!args || Array.isArray(args) || typeof args !== "object") throw Error(); } catch { messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "invalid_arguments", message: "参数必须是完整JSON对象。" }) }); continue; }
        const name = call.function.name; let result: Record<string, unknown>;
        if (name === "load_tools") result = catalog.load(args);
        else if (name === "request_followup") {
          if (typeof args.question !== "string" || !args.question.trim() || args.question.length > 600 || typeof args.subject !== "string" || !args.subject.trim() || args.subject.length > 80) result = { error: "invalid_followup", message: "请提供具体问题和任务名称。" };
          else {
            await db.update(assistantConversation).set({ followup: { question: args.question, subject: args.subject, messageId: question.id } }).where(and(eq(assistantConversation.id, activeRun.conversationId), eq(assistantConversation.userId, userId)));
            if (!text.trim()) text = args.question; else if (!text.includes(args.question)) text += "\n" + args.question;
            result = { awaitingUser: true, message: "已显示补充任务，请等待用户回答。" };
          }
        } else if (!catalog.loaded(name)) result = catalog.missing(name);
        else {
          const definition = catalog.definitions.find(t => t.name === name)!, write = !definition.annotations?.readOnlyHint;
          const normalized = { ...args }; delete normalized.operationId;
          const fingerprint = digestChat({ name, args: normalized });
          const cached = write ? results.find(row => row.name === name && row.fingerprint === fingerprint && !row.result.error) : undefined;
          const step: ChatStep = { id: randomUUID(), name, title: definition.title ?? name, state: "running" }; steps = [...steps, step]; await save(true);
          const previousPreview = input.action !== "send" && write ? results.find(row => !row.result.error && typeof row.result.confirmationUrl === "string") : null;
          const prepared = catalog.prepare(name,args);
          if (cached) result = cached.result;
          else if (previousPreview) result = { ...previousPreview.result, message:"本问题已有待确认预览，请沿用该预览，不重复提交。" };
          else if (prepared.result) result = prepared.result;
          else {
            args = prepared.args!;
            const response = await bridge.rpc("tools/call", { name, arguments: args });
            result = response.structuredContent ?? { error: "tool_failed", message: response.content?.find((part: { type: string }) => part.type === "text")?.text ?? "工具未成功完成。" };
            if (response.isError && !result.error) result = { ...result, error: "tool_failed" };
            results = [...results, { name, fingerprint, args: normalized, result, tokenId:identity.tokenId }];
            await db.update(assistantRun).set({ toolResults: results }).where(and(eq(assistantRun.id, activeRun.id), eq(assistantRun.userId, userId)));
          }
          catalog.remember(name,args,result);
          steps = steps.map(item => item.id === step.id ? { ...item, state: result.error ? "error" : "complete", summary: toolSummary(name,result) } : item);
          if (!result.error) { const ref = operationReference(name, result); if (ref && !references.some(existing => existing.href === ref.href)) references = [...references, ref]; }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) }); await save(true);
        if (name === "request_followup" && !result.error) { endState = "complete"; finished = true; break; }
      }
      if (finished) break;
    }
    await guard(true); await save(true);
    const completed = await db.update(assistantRun).set({ state: endState }).where(and(eq(assistantRun.id, activeRun.id), eq(assistantRun.state, "running"))).returning({id:assistantRun.id});
    if (!completed.length) throw new ApiError(409,"stopped","生成已停止。");
    const [answer] = await db.update(assistantMessage).set({ text: visibleText(text) || "这次没有取得可显示的回答，可以重试。", steps, references, state: endState }).where(and(eq(assistantMessage.id, activeRun.assistantMessageId), eq(assistantMessage.userId, userId))).returning();
    emit({ type: "message", message: publicChatMessage(answer, rows, activeRun.id) });
  } catch (error) {
    const failure = safeFailure(error, controller.signal.aborted), state = failure.code === "stopped" ? "stopped" : "error";
    await db.update(assistantRun).set({ state }).where(and(eq(assistantRun.id, activeRun.id), eq(assistantRun.state, "running")));
    steps = steps.map(step => step.state === "running" ? { ...step, state: "error", summary: "本步未完成。" } : step);
    const [answer] = await db.update(assistantMessage).set({ text: visibleText(text), steps, references, state, error: failure.message }).where(and(eq(assistantMessage.id, activeRun.assistantMessageId), eq(assistantMessage.userId, userId))).returning();
    if (answer) emit({ type: "message", message: publicChatMessage(answer, rows, activeRun.id) });
  } finally {
    controllers.delete(activeRun.id); outerSignal.removeEventListener("abort", stop); await bridge?.close();
    const snapshot = await chatSnapshot(db, userId).catch(() => null);
    if (snapshot) emit({ type: "snapshot", snapshot }); emit({ type: "done" });
  }
}
