import { CHAT_IMAGE_INPUT_COST, CHAT_INPUT_LIMIT, type ChatReference } from "./chat-model";
import type { ProtocolMessage } from "./chat-provider";

export function estimatedChatInput(body: unknown) {
  let images = 0;
  const text = JSON.stringify(body, (key, value) => {
    if (key !== "url" || typeof value !== "string" || !value.startsWith("data:image/")) return value;
    images++;
    return "[image]";
  });
  return Buffer.byteLength(text) + 4096 + images * CHAT_IMAGE_INPUT_COST;
}

type HistoryRow = { id: string; role: string; text: string; state: string; imageIds: string[]; references: ChatReference[] };

/** 最近十组有回答的问答。传入顺序与数据库查询一致，从较新消息起。 */
export function chatHistoryTurns<T extends HistoryRow>(newest: readonly T[], excludedQuestion?: string) {
  const turns: T[][] = [];
  for (const row of [...newest].reverse()) {
    if (row.state === "working") continue;
    if (row.role === "user") turns.push([row]);
    else if (turns.length && (row.text || row.references.length)) turns.at(-1)!.push(row);
  }
  return turns.filter(turn => turn.length > 1 && turn[0].id !== excludedQuestion).slice(-10);
}

export function chatHistoryLinks(rows: readonly HistoryRow[]) {
  const links = rows.flatMap(row => row.imageIds.length || row.references.length
    ? [{ messageId: row.id, imageIds: row.imageIds, references: row.references }] : []);
  return links.length ? "\n历史定位（仅供工具定位）：" + JSON.stringify(links) : "";
}

export function chatContextBaseEstimate(rows: readonly HistoryRow[], extra: unknown[]) {
  const history = chatHistoryTurns(rows).flat();
  // 为不同模型的系统说明、首轮工具定义和序列化包装预留 35KB。
  return 35000 + estimatedChatInput({
    messages: history.map(({role,text}) => ({role,content:text})),
    navigation: chatHistoryLinks(history),
    extra,
  });
}

/** 饮食详情同时按餐次和日期返回相同餐次。站内模型只需一份，完整结果仍留在工具回执。 */
export function chatToolInput(name: string, result: Record<string, unknown>) {
  if (name !== "query_meals" || !Array.isArray(result.meals) || !result.meals.length || !Array.isArray(result.days)) return result;
  return {
    ...result,
    days: result.days.map(day => {
      const { meals: duplicates, ...summary } = day as Record<string, unknown>;
      return duplicates === undefined ? day : summary;
    }),
  };
}

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
  current: ProtocolMessage[], system: string, navigation: (history: ProtocolMessage[][]) => string, imageCount: number, limit = CHAT_INPUT_LIMIT) {
  let optional = history, work = current;
  function generate() {
    return build([{role:"system",content:system+navigation(optional)},...optional.flat(),...work]);
  }
  let body = generate();
  while (optional.length && estimatedChatInput(body) > limit) {
    optional = optional.slice(1);
    body = generate();
  }
  if (estimatedChatInput(body) > limit) {
    work = current.map(compactToolMessage);
    body = generate();
  }
  const estimate = estimatedChatInput(body);
  const textEstimate = estimate - imageCount * CHAT_IMAGE_INPUT_COST;
  return {body, estimate, fits:estimate <= limit, detailLimit: work.some((message,index)=>message!==current[index]) ? detailLimit : undefined, maxPhotos:Math.max(0,Math.floor((limit-textEstimate)/CHAT_IMAGE_INPUT_COST)), history:optional};
}

export const answerStart = "〔正文〕";
export function publicReply(value: string, markedOnly: boolean) {
  const safe = value.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i, "");
  if (safe.trimStart().startsWith(answerStart)) return safe.trimStart().slice(answerStart.length).trimStart();
  if (markedOnly || answerStart.startsWith(safe.trim())) return "";
  return safe;
}
