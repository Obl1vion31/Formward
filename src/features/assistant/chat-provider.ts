import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { ApiError } from "../auth/ai-identity";
import { chatProviders, providerEndpoint } from "./chat-config";
import type { ChatProvider } from "./chat-model";
export type ProtocolMessage = { role: string; content: unknown; tool_calls?: ToolCall[]; tool_call_id?: string; reasoning_content?: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ModelTool = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export class ProviderRejected extends ApiError {
  constructor(failure: ApiError, public httpStatus: number) { super(failure.status, failure.code, failure.message); }
}
export function modelBody(provider: ChatProvider, messages: ProtocolMessage[], tools: ModelTool[]) {
  const config = chatProviders[provider];
  return { ...config.params, model: config.model, messages, tools, tool_choice: "auto", stream: true, stream_options: { include_usage: true }, ...(provider === "glm" ? { tool_stream: true } : {}), [config.outputField]: 8192 };
}
export function providerFailure(status: number, raw: unknown): ApiError {
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const detail = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : body;
  const hint = String(detail.code ?? "") + " " + String(detail.type ?? "") + " " + String(detail.message ?? "");
  if (/insufficient[_ -]?balance|balance[_ -]?insufficient|arrearage|余额不足|欠费|余额已耗尽/i.test(hint)) return new ApiError(503, "provider_balance", "这个模型的平台余额不足。当前内容已保留，可以手动切换模型后重试。");
  if (/insufficient[_ -]?quota/i.test(hint)) return new ApiError(503,"provider_quota","这个模型的平台额度暂不可用。当前内容已保留，可以手动选择其他模型；站内每日用量可在下方查看。");
  if (status === 429 || /rate[_ -]?limit|too many requests|请求过于频繁/i.test(hint)) return new ApiError(429, "provider_rate_limit", "这个模型暂时限流，请稍后重试，或手动切换其他模型。");
  if (status === 401 || status === 403) return new ApiError(503, "provider_credentials", "这个模型的连接凭据暂不可用，可以先选择其他模型。");
  return new ApiError(503, "provider_unavailable", "模型服务暂时未能完成回复。内容已保留，可以重试或手动切换模型。");
}
export async function* ssePayloads(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(), decoder = new TextDecoder(); let buffer = "";
  try {
    while (true) {
      const next = await reader.read(); buffer += next.done ? decoder.decode() : decoder.decode(next.value, { stream: true });
      if (buffer.length > 2 * 1024 * 1024) throw new ApiError(502, "stream_invalid", "回复片段过大，请重试。");
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
        const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (!data || data === "[DONE]") continue;
        yield JSON.parse(data) as Record<string, unknown>;
      }
      if (next.done) { const data = buffer.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n"); if (data && data !== "[DONE]") yield JSON.parse(data) as Record<string, unknown>; break; }
    }
  } finally { reader.releaseLock(); }
}
export async function streamModel(provider: ChatProvider, body: unknown, signal: AbortSignal, onText: (text: string) => Promise<void>, onUsage: (usage: Record<string, unknown>) => Promise<void>, fetcher: typeof fetch = fetch) {
  setDefaultAutoSelectFamilyAttemptTimeout(Math.max(3000, getDefaultAutoSelectFamilyAttemptTimeout()));
  const endpoint = providerEndpoint(provider);
  let response: Response;
  try { response = await fetcher(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env[chatProviders[provider].key] }, body: JSON.stringify(body), signal, redirect: "error", cache: "no-store" }); }
  catch (error) { if (signal.aborted) throw error; throw new ApiError(503,"provider_network","暂时无法连接这个模型。当前内容已保留，可以重试或手动切换模型。"); }
  if (!response.ok) { let payload: unknown; try { payload = await response.json(); } catch {} throw new ProviderRejected(providerFailure(response.status, payload), response.status); }
  if (!response.body) throw new ApiError(502, "empty_response", "模型没有返回可读取的内容。");
  const calls = new Map<number, ToolCall>(); let text = "", reasoning = "", finish = "", sawFinish = false;
  async function consume(payload: Record<string, unknown>) {
    if (payload.error) throw providerFailure(503, payload);
    if (payload.usage && typeof payload.usage === "object") await onUsage(payload.usage as Record<string, unknown>);
    const choice = (payload.choices as { delta?: Record<string, unknown>; message?: Record<string, unknown>; finish_reason?: string | null }[] | undefined)?.[0];
    if (!choice) return;
    const delta = choice.delta ?? choice.message ?? {};
    if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
    if (typeof delta.content === "string") { text += delta.content; await onText(delta.content); }
    for (const call of (delta.tool_calls as { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] | undefined) ?? []) {
      const index = call.index ?? calls.size, previous = calls.get(index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
      if (call.id) previous.id = call.id;
      if (call.function?.name) previous.function.name += call.function.name;
      if (call.function?.arguments) previous.function.arguments += call.function.arguments;
      if (previous.function.arguments.length > 65536) throw new ApiError(502, "tool_arguments_large", "模型工具参数超过允许范围。");
      calls.set(index, previous);
    }
    if (choice.finish_reason) { finish = choice.finish_reason; sawFinish = true; }
  }
  if (response.headers.get("content-type")?.includes("application/json")) await consume(await response.json());
  else for await (const payload of ssePayloads(response.body)) await consume(payload);
  if (!sawFinish) throw new ApiError(502, "stream_interrupted", "回复传输中断，已经取得的内容已保留。");
  const toolCalls = [...calls.values()];
  if (toolCalls.some(call => !call.id || !call.function.name)) throw new ApiError(502, "tool_call_invalid", "模型返回的工具调用不完整。");
  return { text, calls: toolCalls, finish, reasoning };
}
