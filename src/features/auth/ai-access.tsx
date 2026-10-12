"use client";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePageLoading } from "@/components/page-loading-state";
import { LoadingLink } from "@/components/loading-link";
import type { createAiToken, listAiTokens } from "./ai-tokens";
import type { listAiMeasurementOperations } from "../measurements/ai-operations";
import { aiInstructions, operationStatusLabels } from "../measurements/ai-instructions";
import type { listOauthConnections } from "./oauth-connections";
const subscribeOrigin = () => () => {};
const currentOrigin = () => window.location.origin;
const serverOrigin = () => "";
type Tokens = Awaited<ReturnType<typeof listAiTokens>>;
type Created = Awaited<ReturnType<typeof createAiToken>>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export function AiAccess({ tokens, operations, connections, create, revoke, revokeConnection }: { tokens: Tokens; operations: Awaited<ReturnType<typeof listAiMeasurementOperations>>; connections: Awaited<ReturnType<typeof listOauthConnections>>; create: (name: string, permission: "read" | "write") => Promise<Result<Created>>; revoke: (id: string) => Promise<Result<{ id: string }>>; revokeConnection: (id: string) => Promise<Result<{ id: string }>> }) {
  const baseURL = useSyncExternalStore(subscribeOrigin, currentOrigin, serverOrigin);
  const [created, setCreated] = useState<Created | null>(null), [error, setError] = useState(""), [working, setWorking] = useState(false), [notice, setNotice] = useState("");
  const [transitionPending, startTransition] = useTransition(), busy = working || transitionPending;
  const [busyLabel, setBusyLabel] = useState("正在创建访问令牌…"), [busyTokenId, setBusyTokenId] = useState<string | null>(null);
  usePageLoading({ active: busy, label: busyLabel });
  const busyRef = useRef(false);
  function perform(label: string, work: () => Promise<void>, tokenId: string | null = null) {
    if (busyRef.current || busy) return;
    busyRef.current = true; setWorking(true); setBusyLabel(label); setBusyTokenId(tokenId); setError(""); setNotice("");
    startTransition(async () => {
      try { await work(); } catch { setError("操作未完成，请稍后重试。"); } finally { busyRef.current = false; setWorking(false); }
    });
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("已复制。"); } catch { setError("无法自动复制，请手动选择内容复制。"); }
  }
  const displayed = created && !tokens.some(row => row.id === created.token.id) ? [created.token, ...tokens] : tokens;
  return <section className="ai-page" aria-labelledby="ai-title">
    <LoadingLink href="/dashboard" className="ai-back">← 身体记录</LoadingLink>
    <h1 id="ai-title">AI 接入</h1><p className="ai-lead">让你使用的 AI 查询身体记录，并提交需要你确认的录入、修改或估算。</p>
    <section className="ai-section"><h2>MCP 账号连接</h2><p>在 ChatGPT 的“插件 → 添加自定义 MCP”中填写下面的地址，选择 OAuth，然后登录 Formward 并授权。其他支持远程 MCP 和 OAuth 的客户端也可以使用。</p><div className="ai-secret"><input aria-label="MCP 服务器地址" readOnly value={baseURL ? `${baseURL}/api/mcp` : ""} /><button className="ai-button" disabled={!baseURL} type="button" onClick={() => void copy(`${baseURL}/api/mcp`)}>复制 MCP 地址</button></div><p>账号连接后，AI 写入仍需在审核网页确认。连接最长有效 30 天，撤销后立即停止访问。</p>
      <ul className="ai-list">{connections.map(connection => <li key={connection.id}><div><strong>{connection.name || "MCP 客户端"}</strong><span>{connection.scopes.includes("measurements:write") ? "查询与提交预览" : "只读"} · {connection.revokedAt ? "已撤销" : connection.expired ? "已过期" : "已连接"}</span><span>最近使用：{connection.lastUsedAt ? `${new Date(connection.lastUsedAt).toISOString().replace("T", " ").slice(0, 16)} UTC` : "尚未调用"}</span></div><button type="button" className="ai-button ai-secondary" disabled={busy || Boolean(connection.revokedAt)} onClick={() => perform("正在撤销账号连接…", async () => { const result = await revokeConnection(connection.id); if (!result.ok) setError(result.error); }, connection.id)}>{busyTokenId === connection.id ? "正在撤销…" : "撤销连接"}</button></li>)}</ul>{!connections.length && <p>尚无已授权客户端。</p>}
    </section>
    <section className="ai-section"><h2>访问令牌</h2><p>有效期 30 天，可随时撤销。原始令牌仅在创建时显示，请保存到你使用的 AI 的私有配置。</p>
      <form className="ai-token-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); perform("正在创建访问令牌…", async () => { const result = await create(String(data.get("name")), data.get("permission") as "read" | "write"); if (result.ok) { setCreated(result.data); form.reset(); } else setError(result.error); }); }}>
        <label>令牌名称<input name="name" required disabled={busy} maxLength={100} placeholder="例如：本地 Codex" /></label>
        <label>权限<select name="permission" defaultValue="write" disabled={busy}><option value="write">查询与提交操作</option><option value="read">只读</option></select></label>
        <button className="ai-button" disabled={busy || !baseURL} type="submit">{busy && !busyTokenId ? "正在创建…" : "创建令牌"}</button>
      </form>
      {created && <div className="ai-secret"><strong>请保存这枚令牌，关闭后无法再次查看</strong><input aria-label="新令牌原文" readOnly value={created.rawToken} autoComplete="off" spellCheck={false} /><div className="ai-actions"><button className="ai-button" onClick={() => void copy(created.rawToken)}>复制令牌</button><button className="ai-button ai-secondary" onClick={() => setCreated(null)}>已保存，关闭</button></div></div>}
      <ul className="ai-list">{displayed.map(token => <li key={token.id}><div><strong>{token.name}</strong><span>{token.prefix}… · {token.permission === "read" ? "只读" : "查询与提交操作"}</span><span>{token.revokedAt ? "已撤销" : `到期：${token.expiresAt.slice(0, 10)}`} · {token.lastUsedAt ? `最近使用：${token.lastUsedAt.slice(0, 16).replace("T", " ")} UTC` : "尚未使用"}</span></div><button className="ai-button ai-secondary" disabled={busy || !!token.revokedAt} onClick={() => perform("正在撤销访问令牌…", async () => { const result = await revoke(token.id); if (!result.ok) setError(result.error); else { if (created?.token.id === token.id) setCreated(null); setNotice("令牌已撤销。"); } }, token.id)}>{busy && busyTokenId === token.id ? "正在撤销…" : "撤销"}</button></li>)}</ul>
      {!displayed.length && <p>还没有访问令牌。</p>}
    </section>
    {error && <p role="alert" className="ai-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="ai-section"><h2>给 AI 的接入说明</h2><p>把 API 地址、令牌和下面的说明配置到能发送 HTTP 请求的 AI 客户端。</p><p>API 地址：<code>{baseURL}/api/v1</code> · <a href="/api/v1/openapi.json">接口协议</a></p><button className="ai-button" disabled={!baseURL} onClick={() => void copy(aiInstructions(baseURL))}>复制接入说明</button><details><summary>查看流程与请求格式</summary><pre className="ai-instructions">{aiInstructions(baseURL)}</pre></details></section>
    <section className="ai-section"><h2>最近提交</h2><p>一个链接审核整批记录，可逐行修改、确认或取消。预览有效 15 分钟，刷新后重新核对。</p><ul className="ai-list">{operations.map(operation => <li key={operation.id}><div><LoadingLink href={operation.confirmationPath}>{operation.preview.date} · {operation.preview.kind === "batch" ? "批量身体记录" : operation.preview.kind === "save_day" ? "身体记录" : "单项估算"}</LoadingLink><span>{operation.counts.total} 条 · 已保存 {operation.counts.saved} · 待处理 {operation.counts.pending} · 已取消 {operation.counts.cancelled} · 已跳过 {operation.counts.skipped}</span></div><span>{operationStatusLabels[operation.status]}</span></li>)}</ul>{!operations.length && <p>还没有 AI 提交的操作。</p>}</section>
  </section>;
}
