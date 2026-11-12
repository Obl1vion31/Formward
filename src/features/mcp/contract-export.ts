import catalog from "../records/ai-tool-catalog.json";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createFormwardMcp } from "./server";
import type { Database } from "../../db/client";
import { aiToolNames, definitionsFor, aiInterpretationRules } from "../records/ai-field-definitions";

/** 仅在内存中发现工具，不调用任何业务工具，也不读取数据库、健康数据或密钥。 */
export async function aiContractSnapshot() {
  const scopes = ["profile", "measurements:read", "measurements:write", "meals:read", "meals:write", "energy:read", "energy:write", "training:read", "training:write"];
  const url = "http://localhost/api/mcp";
  const handler = createMcpHandler(() => createFormwardMcp({} as Database, { userId: "fictional-contract-export", tokenId: "fictional-contract-token", permission: "write" }, scopes, new Request(url)), { legacy: "stateless" });
  async function rpc(method: string, params: Record<string, unknown>) {
    const response = await handler.fetch(new Request(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
    const text = await response.text();
    const payload = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : JSON.parse(text.split(/\r?\n/).filter(line => line.startsWith("data: ")).at(-1)!.slice(6));
    if (!response.ok || payload.error) throw new Error("离线MCP定义导出失败：" + JSON.stringify(payload.error ?? response.status));
    return payload.result;
  }
  try {
    const initialized = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "formward-offline-contract-export", version: "1" } });
    const listed = await rpc("tools/list", {});
    if (!Array.isArray(listed.tools) || listed.tools.length !== aiToolNames.length || listed.tools.some((tool: { name: string }) => !aiToolNames.includes(tool.name as typeof aiToolNames[number]))) throw new Error("工具定义与字段字典覆盖不一致");
    const runtime = await readFile(new URL("../records/ai-field-selection.mjs", import.meta.url), "utf8");
    return {
      contract: {
        format: "formward-ai-contract-v1", serverInfo: initialized.serverInfo,
        instructions: initialized.instructions ?? "", interpretationRules: aiInterpretationRules,
        catalog: listed.tools.map((tool: { name: keyof typeof catalog; title: string; annotations?: { readOnlyHint?: boolean } }) => ({ name: tool.name, title: tool.title, operation: tool.annotations?.readOnlyHint ? "查询／连接" : "预览／附件", usage: catalog[tool.name] })),
        tools: listed.tools, fieldDefinitions: Object.fromEntries(aiToolNames.map(name => [name, definitionsFor(name)])),
        runtimeSha256: createHash("sha256").update(runtime).digest("hex"),
      },
      runtime,
    };
  } finally { await handler.close(); }
}
