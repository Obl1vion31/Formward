import { CHAT_IMAGE_INPUT_COST, CHAT_INPUT_LIMIT, estimatedChatInput } from "./chat-store";
import type { ProtocolMessage } from "./chat-provider";

const detailLimit = 8;
const toolLists = new Set(["days","foods","plans","sessions","records","items","activities","candidates"]);

function compactToolMessage(message: ProtocolMessage): ProtocolMessage {
  if (message.role !== "tool" || typeof message.content !== "string" || Buffer.byteLength(message.content) < 12000) return message;
  const result = JSON.parse(message.content) as Record<string, unknown>;
  const omitted: Record<string,number> = {};
  const compact = {...result};
  for (const [key, value] of Object.entries(result)) {
    if (!toolLists.has(key) || !Array.isArray(value) || value.length <= detailLimit) continue;
    omitted[key] = value.length - detailLimit;
    compact[key] = value.slice(0,detailLimit);
  }
  if (!Object.keys(omitted).length) return message;
  return {...message,content:JSON.stringify({...compact, omittedFromContext:omitted,
    contextNote:"只带了部分查询列表的前8项，请在回答中说明你核对到的实际日期或明细范围。只用原查询提供的全量汇总，不能用样本推算完整合计。"})};
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
  return {body, fits:estimate <= CHAT_INPUT_LIMIT, detailLimit: work.some((message,index)=>message!==current[index]) ? detailLimit : undefined, maxPhotos:Math.max(0,Math.floor((CHAT_INPUT_LIMIT-textEstimate)/CHAT_IMAGE_INPUT_COST)), history:optional};
}

export const answerStart = "〔正文〕";
export function publicReply(value: string, markedOnly: boolean) {
  const safe = value.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i, "");
  if (safe.trimStart().startsWith(answerStart)) return safe.trimStart().slice(answerStart.length).trimStart();
  if (markedOnly || answerStart.startsWith(safe.trim())) return "";
  return safe;
}
