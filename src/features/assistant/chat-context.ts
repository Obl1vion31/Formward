import { CHAT_IMAGE_INPUT_COST, CHAT_INPUT_LIMIT, estimatedChatInput } from "./chat-store";
import type { ProtocolMessage } from "./chat-provider";

const toolLists = new Set(["days","foods","plans","sessions","records","items","activities","candidates"]);

function compactToolMessage(message: ProtocolMessage): ProtocolMessage {
  if (message.role !== "tool" || typeof message.content !== "string" || Buffer.byteLength(message.content) < 12000) return message;
  const result = JSON.parse(message.content) as Record<string, unknown>;
  const omitted: Record<string,number> = {};
  const compact = {...result};
  for (const [key, value] of Object.entries(result)) {
    if (!toolLists.has(key) || !Array.isArray(value) || value.length <= 8) continue;
    omitted[key] = value.length - 8;
    compact[key] = value.slice(0,8);
  }
  if (!Object.keys(omitted).length) return message;
  return {...message,content:JSON.stringify({...compact, omittedFromContext:omitted,
    contextNote:"仅带工具结果的部分项目，不能将未提供的数据当作空或计算完整合计。必要时缩小查询范围。"})};
}

/** 缩减只在模型请求内生效，按整轮移除可选历史并保留当前消息、确认事实和实际工具存档。 */
export function fitChatContext<T>(build: (messages: ProtocolMessage[]) => T, history: ProtocolMessage[][],
  current: ProtocolMessage[], system: string, navigation: (history: ProtocolMessage[][]) => string, imageCount: number) {
  let optional = history, work = current;
  function generate() {
    return build([{role:"system",content:system+navigation(optional)},...optional.flat(),...work]);
  }
  let body = generate();
  while (optional.length && estimatedChatInput(body) > CHAT_INPUT_LIMIT) {
    optional = optional.slice(1);
    body = generate();
  }
  if (estimatedChatInput(body) > CHAT_INPUT_LIMIT) {
    work = current.map(compactToolMessage);
    body = generate();
  }
  const estimate = estimatedChatInput(body);
  const textEstimate = estimate - imageCount * CHAT_IMAGE_INPUT_COST;
  return {body, fits:estimate <= CHAT_INPUT_LIMIT, maxPhotos:Math.max(0,Math.floor((CHAT_INPUT_LIMIT-textEstimate)/CHAT_IMAGE_INPUT_COST)), history:optional};
}

export const answerStart = "〔正文〕";
export function publicReply(value: string, markedOnly: boolean) {
  const safe = value.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i, "");
  if (safe.trimStart().startsWith(answerStart)) return safe.trimStart().slice(answerStart.length).trimStart();
  if (markedOnly || answerStart.startsWith(safe.trim())) return "";
  return safe;
}
