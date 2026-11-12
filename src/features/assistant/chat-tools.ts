import { createMcpHandler } from "@modelcontextprotocol/server";
import { createFormwardMcp } from "../mcp/server";
import type { Database } from "../../db/client";
import type { AiIdentity } from "../auth/ai-identity";
import { ApiError } from "../auth/ai-identity";
import { siteOrigin } from "../auth/site-url";
import type { ModelTool } from "./chat-provider";
const scopes = ["profile", "measurements:read", "measurements:write", "meals:read", "meals:write", "energy:read", "energy:write", "training:read", "training:write"];
export function chatToolBridge(db: Database, identity: AiIdentity, request: Request) {
  const url = new URL("/api/mcp", siteOrigin(request)).href;
  const handler = createMcpHandler(() => createFormwardMcp(db, identity, scopes, new Request(url)), { legacy: "stateless" });
  return {
    async rpc(method: string, params: Record<string, unknown>) {
      const response = await handler.fetch(new Request(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
      const text = await response.text(), json = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : JSON.parse(text.split(/\r?\n/).filter(line => line.startsWith("data: ")).at(-1)!.slice(6));
      if (json.error) return { isError: true, content: [{ type: "text", text: "工具参数未通过正式校验，请按定义修正。" }], structuredContent: { error: "invalid_tool_parameters", message: "工具参数未通过正式校验，请按定义修正。" } };
      return json.result;
    },
    close: () => handler.close(),
  };
}
type ToolDefinition = { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; annotations?: { readOnlyHint?: boolean } };
export async function chatToolCatalog(bridge: ReturnType<typeof chatToolBridge>) {
  const initialized = await bridge.rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "formward-embedded-assistant", version: "1" } });
  const listed = await bridge.rpc("tools/list", {});
  if (!Array.isArray(listed.tools) || listed.tools.length !== 21) throw new ApiError(503, "tool_catalog", "业务能力暂时未能读取，请稍后重试。");
  const definitions = listed.tools as ToolDefinition[];
  const enabled = new Set<string>();
  const internal: ModelTool[] = [
    { type: "function", function: { name: "load_tools", description: "按需启用业务工具。只加载定义，不查询数据或保存记录；完整定义在下一轮生效。", parameters: { type: "object", additionalProperties: false, required: ["names"], properties: { names: { type: "array", minItems: 1, maxItems: 21, uniqueItems: true, items: { type: "string", enum: definitions.map(t => t.name) } } } } } },
    { type: "function", function: { name: "request_followup", description: "只有当前任务确实缺少用户必须补充的信息时调用，声明具体问题和任务名称。不是普通寒暄或结束问候。调用后等待用户，不创建不完整预览。", parameters: { type: "object", additionalProperties: false, required: ["question", "subject"], properties: { question: { type: "string", minLength: 1, maxLength: 600 }, subject: { type: "string", minLength: 1, maxLength: 80 } } } } },
  ];
  return {
    instructions: String(initialized.instructions ?? ""), definitions,
    directory: definitions.map(t => `${t.name}：${t.title ?? t.name}（${t.annotations?.readOnlyHint ? "查询" : "提交预览或处理私有附件，正式保存须网页确认"}）`).join("\n"),
    tools: (): ModelTool[] => [...internal, ...definitions.filter(t => enabled.has(t.name)).map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } }))],
    loaded: (name: string) => enabled.has(name),
    load(input: Record<string, unknown>) {
      if (Object.keys(input).some(key => key !== "names") || !Array.isArray(input.names) || !input.names.length || input.names.length > 21 || input.names.some(name => typeof name !== "string" || !definitions.some(t => t.name === name))) return { error: "invalid_tool_selection", message: "请选择目录中的工具名称。" };
      for (const name of input.names) enabled.add(String(name));
      return { loaded: [...enabled], message: "完整定义已加入下一轮tools，本次没有查询或保存业务数据。" };
    },
  };
}
