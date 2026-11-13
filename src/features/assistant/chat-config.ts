import { ApiError } from "../auth/ai-identity";
import { chatProviderIds, type ChatProvider } from "./chat-model";
export type ChatRates = { input: number; cachedInput: number; output: number };
export const chatProviders = {
  qwen: { label: "千问", model: "qwen3.8-flash", key: "QWEN_API_KEY", url: "", outputField: "max_completion_tokens", rates: { input: .8, cachedInput: .1, output: 2.7 }, promptVariant: "original", params: { temperature: 1, enable_thinking: true, thinking_budget: 4096 } },
  mimo: { label: "小米 MiMo", model: "mimo-v2.6-flash", key: "MIMO_API_KEY", url: "https://api.xiaomimimo.com/v1", outputField: "max_completion_tokens", rates: { input: 1, cachedInput: .02, output: 2 }, promptVariant: "compact", params: { temperature: 1, thinking: { type: "enabled" } } },
  glm: { label: "智谱", model: "glm-5.3-flash", key: "GLM_API_KEY", url: "https://open.bigmodel.cn/api/paas/v4", outputField: "max_tokens", rates: { input: .8, cachedInput: .23, output: 2.8 }, promptVariant: "original", params: { temperature: 1, thinking: { type: "enabled", clear_thinking: false }, reasoning_effort: "high" } },
} as const;
export function chatAllowed(account: { id: string; role?: string | null; banned?: boolean | null }) {
  return process.env.FORMWARD_CHAT_ENABLED === "1" && !!process.env.FORMWARD_CHAT_PILOT_USER_ID && account.id === process.env.FORMWARD_CHAT_PILOT_USER_ID && account.role === "owner" && !account.banned;
}
export function assertChatAllowed(account: Parameters<typeof chatAllowed>[0]) {
  if (!chatAllowed(account)) throw new ApiError(403, "chat_unavailable", "聊天暂未开放。");
}
export function providerId(value: unknown): ChatProvider {
  if (!chatProviderIds.includes(value as ChatProvider)) throw new ApiError(400, "invalid_model", "请选择可用的模型。");
  return value as ChatProvider;
}
export function providerEndpoint(id: ChatProvider) {
  const config = chatProviders[id], endpoint = new URL(id === "qwen" ? process.env.QWEN_BASE_URL || "https://maas.qianwenaiapi.com/compatible-mode/v1" : config.url);
  const host = endpoint.hostname;
  const valid = id === "qwen" ? host === "maas.qianwenaiapi.com" || host.endsWith(".cn-beijing.maas.aliyuncs.com") : host === (id === "glm" ? "open.bigmodel.cn" : "api.xiaomimimo.com");
  if (!valid || endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.port) throw new ApiError(503, "model_configuration", "模型连接配置无效。");
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "") + "/chat/completions";
  return endpoint.href;
}
export function providerConfigured(id: ChatProvider) {
  if (process.env["FORMWARD_CHAT_" + id.toUpperCase() + "_DISABLED"] === "1") return false;
  try { providerEndpoint(id); return !!process.env[chatProviders[id].key]?.trim(); } catch { return false; }
}
export const CHAT_DAILY_LIMIT = 2;
