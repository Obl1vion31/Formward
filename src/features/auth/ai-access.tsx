"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import type { createAiToken, listAiTokens } from "./ai-tokens";
import type { listAiMeasurementOperations } from "../measurements/ai-operations";
import { aiInstructions, operationStatusLabels } from "../measurements/ai-instructions";
const subscribeOrigin = () => () => {};
const currentOrigin = () => window.location.origin;
const serverOrigin = () => "";
type Tokens = Awaited<ReturnType<typeof listAiTokens>>;
type Created = Awaited<ReturnType<typeof createAiToken>>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export function AiAccess({ tokens, operations, create, revoke }: { tokens: Tokens; operations: Awaited<ReturnType<typeof listAiMeasurementOperations>>; create: (name: string, permission: "read" | "write") => Promise<Result<Created>>; revoke: (id: string) => Promise<Result<{ id: string }>> }) {
  const baseURL = useSyncExternalStore(subscribeOrigin, currentOrigin, serverOrigin);
  const [created, setCreated] = useState<Created | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const busyRef = useRef(false);
  async function perform(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch { setError("操作未完成，请稍后重试。"); } finally { busyRef.current = false; setBusy(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("已复制。"); } catch { setError("无法自动复制，请手动选择内容复制。"); }
  }
  const displayed = created && !tokens.some(row => row.id === created.token.id) ? [created.token, ...tokens] : tokens;
  return <section className="ai-page" aria-labelledby="ai-title">
    <a href="/dashboard" className="ai-back">← 身体记录</a>
    <h1 id="ai-title">AI 接入</h1><p className="ai-lead">让你使用的 AI 查询身体记录，并提交需要你确认的录入、修改或估算。</p>
    <section className="ai-section"><h2>访问令牌</h2><p>有效期 30 天，可随时撤销。原始令牌仅在创建时显示，请保存到你使用的 AI 的私有配置。</p>
      <form className="ai-token-form" onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); void perform(async () => { const result = await create(String(data.get("name")), data.get("permission") as "read" | "write"); if (result.ok) { setCreated(result.data); form.reset(); } else setError(result.error); }); }}>
        <label>令牌名称<input name="name" required maxLength={100} placeholder="例如：本地 Codex" /></label>
        <label>权限<select name="permission" defaultValue="write"><option value="write">查询与提交操作</option><option value="read">只读</option></select></label>
        <button className="ai-button" disabled={busy || !baseURL} type="submit">创建令牌</button>
      </form>
      {created && <div className="ai-secret"><strong>请保存这枚令牌，关闭后无法再次查看</strong><input aria-label="新令牌原文" readOnly value={created.rawToken} autoComplete="off" spellCheck={false} /><div className="ai-actions"><button className="ai-button" onClick={() => void copy(created.rawToken)}>复制令牌</button><button className="ai-button ai-secondary" onClick={() => setCreated(null)}>已保存，关闭</button></div></div>}
      <ul className="ai-list">{displayed.map(token => <li key={token.id}><div><strong>{token.name}</strong><span>{token.prefix}… · {token.permission === "read" ? "只读" : "查询与提交操作"}</span><span>{token.revokedAt ? "已撤销" : `到期：${token.expiresAt.slice(0, 10)}`} · {token.lastUsedAt ? `最近使用：${token.lastUsedAt.slice(0, 16).replace("T", " ")} UTC` : "尚未使用"}</span></div><button className="ai-button ai-secondary" disabled={busy || !!token.revokedAt} onClick={() => void perform(async () => { const result = await revoke(token.id); if (!result.ok) setError(result.error); else { if (created?.token.id === token.id) setCreated(null); setNotice("令牌已撤销。"); } })}>撤销</button></li>)}</ul>
      {!displayed.length && <p>还没有访问令牌。</p>}
    </section>
    {error && <p role="alert" className="ai-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="ai-section"><h2>给 AI 的接入说明</h2><p>把 API 地址、令牌和下面的说明交给能发送 HTTP 请求的 AI。当前先用本工作区的 Codex 试验。</p><p>API 地址：<code>{baseURL}/api/v1</code> · <a href="/api/v1/openapi.json">接口协议</a></p><button className="ai-button" disabled={!baseURL} onClick={() => void copy(aiInstructions(baseURL))}>复制接入说明</button><details><summary>查看流程与请求格式</summary><pre className="ai-instructions">{aiInstructions(baseURL)}</pre></details></section>
    <section className="ai-section"><h2>最近提交</h2><p>预览保留 15 分钟。打开后核对前后值，再决定保存或取消。</p><ul className="ai-list">{operations.map(operation => <li key={operation.id}><div><a href={operation.confirmationPath}>{operation.preview.date} · {operation.preview.kind === "save_day" ? "身体记录" : "单项估算"}</a><span>{operation.preview.message}</span></div><span>{operationStatusLabels[operation.status]}</span></li>)}</ul>{!operations.length && <p>还没有 AI 提交的操作。</p>}</section>
  </section>;
}
