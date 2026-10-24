"use client";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePageLoading } from "@/components/page-loading-state";
import { LoadingLink } from "@/components/loading-link";
import type { createAiToken, listAiTokens } from "./ai-tokens";
import type { listAiMeasurementOperations } from "../measurements/ai-operations";
import { aiInstructions, operationStatusLabels } from "../measurements/ai-instructions";
import { mealOperationStatus, type MealOperationView } from "../meals/model";
import { useOperationClock } from "../meals/use-operation-clock";
import type { listOauthConnections } from "./oauth-connections";
import styles from "./ai-access.module.css";
const subscribeOrigin = () => () => {};
const currentOrigin = () => window.location.origin;
const serverOrigin = () => "";
type Tokens = Awaited<ReturnType<typeof listAiTokens>>;
type Created = Awaited<ReturnType<typeof createAiToken>>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Feedback = { area: string; error: boolean; message: string } | null;
const recordDomains = [["身体", "measurements"], ["饮食与食材", "meals"], ["消耗", "energy"]] as const;
const authorizationInstruction = "请调用 Formward 的 authorize_formward，统一检查并申请身体、饮食与食材、消耗的查询和提交预览权限；只检查连接，不创建健康记录预览。";
function connectionAccessLabel(scopes: string[]) {
  const read = recordDomains.every(([, domain]) => scopes.includes(domain + ":read"));
  const write = recordDomains.every(([, domain]) => scopes.includes(domain + ":write"));
  return read && write ? "全部记录查询与提交预览" : read && !scopes.some(scope => scope.endsWith(":write")) ? "全部记录只读" : "部分授权";
}
export function AiAccess({ tokens, operations, mealOperations = [], recordOperations = [], connections, create, revoke, revokeConnection }: { tokens: Tokens; recordOperations?: Awaited<ReturnType<typeof import("../records/operations").listRecordOperations>>; mealOperations?: MealOperationView[]; operations: Awaited<ReturnType<typeof listAiMeasurementOperations>>; connections: Awaited<ReturnType<typeof listOauthConnections>>; create: (name: string, permission: "read" | "write") => Promise<Result<Created>>; revoke: (id: string) => Promise<Result<{ id: string }>>; revokeConnection: (id: string) => Promise<Result<{ id: string }>> }) {
  const now = useOperationClock();
  const baseURL = useSyncExternalStore(subscribeOrigin, currentOrigin, serverOrigin);
  const [created, setCreated] = useState<Created | null>(null), [feedback, setFeedback] = useState<Feedback>(null), [working, setWorking] = useState(false), [advancedOpen, setAdvancedOpen] = useState(false);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [transitionPending, startTransition] = useTransition(), busy = working || transitionPending;
  const [busyLabel, setBusyLabel] = useState("正在创建访问令牌…"), [busyTokenId, setBusyTokenId] = useState<string | null>(null);
  const secret = useRef<HTMLDivElement>(null), shownSecret = useRef<string | null>(null);
  usePageLoading({ active: busy, label: busyLabel });
  const busyRef = useRef(false);
  useEffect(() => {
    if (!created || busy || shownSecret.current === created.token.id) return;
    shownSecret.current = created.token.id;
    secret.current?.focus({ preventScroll: true });
    secret.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [created, busy]);
  function message(area: string, text: string, error = false) { setFeedback({ area, error, message: text }); }
  function perform(label: string, area: string, work: () => Promise<void>, tokenId: string | null = null) {
    if (busyRef.current || busy) return;
    busyRef.current = true; setWorking(true); setBusyLabel(label); setBusyTokenId(tokenId); setFeedback(null);
    startTransition(async () => {
      try { await work(); } catch { message(area, "操作未完成，请稍后重试。", true); } finally { busyRef.current = false; setWorking(false); setBusyTokenId(null); }
    });
  }
  async function copy(value: string, area: string) {
    try { await navigator.clipboard.writeText(value); message(area, "已复制。"); } catch { message(area, "无法自动复制，请手动选择内容复制。", true); }
  }
  function feedbackFor(area: string) { return feedback?.area === area ? <p className={feedback.error ? "ai-error" : "ai-muted"} role={feedback.error ? "alert" : "status"}>{feedback.message}</p> : null; }
  const displayed = created && !tokens.some(row => row.id === created.token.id) ? [created.token, ...tokens] : tokens;
  const active = connections.filter(connection => !connection.revokedAt && !connection.expired && !revoked.includes(connection.id));
  return <section className={`ai-page ${styles.settings}`} aria-labelledby="ai-title">
    <h1 id="ai-title">AI 接入</h1>
    <section className={`ai-section ${styles.connectionSection}`} aria-label="连接状态"><div className={styles.sectionHeading}><h2>连接状态</h2><span className={styles.status}>{active.length ? `${active.length} 个可用连接` : "尚未连接"}</span></div>
      {!connections.length && <p className="ai-muted">连接后，AI 可查询记录并提交预览；正式保存仍由你确认。</p>}
      <ul className={`ai-list ${styles.connections}`}>{connections.map(connection => {
        const unavailable = Boolean(connection.revokedAt) || connection.expired || revoked.includes(connection.id), area = `connection:${connection.id}`;
        return <li key={connection.id}><div className={styles.connectionBody}><div className={styles.sectionHeading}><strong>{connection.name || "MCP 客户端"}</strong><span className={styles.status}>{connection.revokedAt || revoked.includes(connection.id) ? "已撤销" : connection.expired ? "已过期" : "已连接"}</span></div><p className="ai-muted">{connectionAccessLabel(connection.scopes)}</p>
          <div className={styles.permissions} role="group" aria-label={`${connection.name || "MCP 客户端"} 实际权限`}>{recordDomains.map(([label, domain]) => <div key={domain}><strong>{label}</strong><span aria-label={`${label}查询：${unavailable ? "不可用" : connection.scopes.includes(domain + ":read") ? "已授权" : "未授权"}`}>查询 · {unavailable ? "不可用" : connection.scopes.includes(domain + ":read") ? "已授权" : "未授权"}</span><span aria-label={`${label}提交：${unavailable ? "不可用" : connection.scopes.includes(domain + ":write") ? "已授权" : "未授权"}`}>提交 · {unavailable ? "不可用" : connection.scopes.includes(domain + ":write") ? "已授权" : "未授权"}</span></div>)}</div>
          <details className={styles.connectionDetails}><summary>连接详情与撤销</summary><p>最近使用：{connection.lastUsedAt ? `${new Date(connection.lastUsedAt).toISOString().replace("T", " ").slice(0, 16)} UTC` : "尚未调用"}</p><p>到期：{new Date(connection.expiresAt).toISOString().slice(0, 10)}</p><button type="button" className="ai-button ai-secondary" disabled={busy || Boolean(connection.revokedAt) || revoked.includes(connection.id)} onClick={() => perform("正在撤销账号连接…", area, async () => { const result = await revokeConnection(connection.id); if (!result.ok) message(area, result.error, true); else { setRevoked(ids => [...ids, connection.id]); message(area, "连接已撤销。"); } }, connection.id)}>{busyTokenId === connection.id ? "正在撤销…" : "撤销连接"}</button></details>{feedbackFor(area)}
        </div></li>;
      })}</ul>
    </section>
    <section className="ai-section" aria-label="接入操作"><h2>接入操作</h2><div className={styles.address}><input aria-label="MCP 服务器地址" readOnly value={baseURL ? `${baseURL}/api/mcp` : ""} /><button className="ai-button" disabled={!baseURL} type="button" onClick={() => void copy(`${baseURL}/api/mcp`, "connect")}>复制 MCP 地址</button></div>
      <button className="ai-button ai-secondary" type="button" onClick={() => void copy(authorizationInstruction, "connect")}>复制统一授权指令</button><p className="ai-muted">已接入但缺少权限时，把这条指令发给 AI，再到授权网页允许连接。</p>{feedbackFor("connect")}
    </section>
    <section className="ai-section" aria-label="最近提交"><h2>最近提交</h2><p className="ai-muted">预览有效 15 分钟，打开后可核对、修改或取消。</p><ul className="ai-list">{recordOperations.map(operation => {
      const summary = operation;
      const expired = operation.status === "pending" && (summary.expired || Boolean(summary.expiresAt && now !== undefined && Date.parse(summary.expiresAt) <= now));
      return <li key={operation.id}><div><LoadingLink href={operation.confirmationPath}>{summary.summary || `统一记录 · ${operation.count} 项`}</LoadingLink><span>提交于 {operation.createdAt.slice(0,16).replace("T"," ")} UTC{operation.status === "pending" && summary.pendingCount != null ? ` · ${summary.pendingCount} 项待保存` : ""}</span></div><span>{operation.status === "confirmed" ? "已保存" : operation.status === "cancelled" ? "已取消" : operation.status === "completed" ? "无需保存" : expired ? "已过期 · 需刷新" : "待确认"}</span></li>;
    })}{operations.map(operation => <li key={operation.id}><div><LoadingLink href={operation.confirmationPath}>{operation.preview.date} · {operation.preview.kind === "batch" ? "批量身体记录" : operation.preview.kind === "save_day" ? "身体记录" : "单项估算"}</LoadingLink><span>{operation.counts.total} 条 · 已保存 {operation.counts.saved} · 待处理 {operation.counts.pending} · 已取消 {operation.counts.cancelled} · 已跳过 {operation.counts.skipped}</span></div><span>{operationStatusLabels[operation.status]}</span></li>)}{mealOperations.map(operation => <li key={operation.id}><div><LoadingLink href={operation.confirmationPath}>{operation.origin === "initialization" ? "饮食初始化" : "饮食记录"} · {operation.rows.length} 项</LoadingLink><span>{mealOperationStatus(operation,now)==="confirmed" ? "本次提交已保存" : mealOperationStatus(operation,now)==="cancelled" ? "本次提交已取消" : mealOperationStatus(operation,now)==="expired" ? "预览过期，打开后刷新" : operation.canConfirmWithoutImages ? "照片未齐，可补传或先保存文字" : operation.canConfirm ? "可核对并保存" : "有信息需要核对"}</span></div><span>{operationStatusLabels[mealOperationStatus(operation,now)]}</span></li>)}</ul>{!operations.length && !mealOperations.length && !recordOperations.length && <p className="ai-muted">还没有 AI 提交的操作。</p>}</section>
    <details className={`ai-section ${styles.disclosure}`}><summary>如何连接 AI</summary><ol><li>在支持远程 MCP 和 OAuth 的 AI 客户端中添加上面的 MCP 地址。</li><li>登录 Formward 并允许需要的权限。</li><li>让 AI 先检查连接，再查询或提交；打开审核链接后确认保存。</li></ol><p className="ai-muted">连接最长有效 30 天，可在“连接详情与撤销”中停止访问。没有列出的权限需要重新授权。</p></details>
    <details className={`ai-section ${styles.disclosure}`} open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary>高级接入 · 手动令牌与 HTTP</summary><section aria-label="手动访问令牌"><h2>访问令牌</h2><p className="ai-muted">用于自行配置的 HTTP 客户端，有效期 30 天；原文仅创建时显示。</p>
      <form className="ai-token-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); perform("正在创建访问令牌…", "create-token", async () => { const result = await create(String(data.get("name")), data.get("permission") as "read" | "write"); if (result.ok) { setAdvancedOpen(true); setCreated(result.data); form.reset(); } else message("create-token", result.error, true); }); }}>
        <label>令牌名称<input name="name" required disabled={busy} maxLength={100} placeholder="例如：本地 Codex" /></label><label>权限<select name="permission" defaultValue="write" disabled={busy}><option value="write">查询与提交操作</option><option value="read">只读</option></select></label><button className="ai-button" disabled={busy || !baseURL} type="submit">{busy && !busyTokenId ? "正在创建…" : "创建令牌"}</button>
      </form>{feedbackFor("create-token")}
      {created && <div className="ai-secret" ref={secret} tabIndex={-1} aria-label="新建令牌，仅显示一次"><strong>请保存这枚令牌，关闭后无法再次查看</strong><input aria-label="新令牌原文" readOnly value={created.rawToken} autoComplete="off" spellCheck={false} /><div className="ai-actions"><button className="ai-button" onClick={() => void copy(created.rawToken, "secret")}>复制令牌</button><button className="ai-button ai-secondary" onClick={() => { setCreated(null); setFeedback(null); }}>已保存，关闭</button></div>{feedbackFor("secret")}</div>}
      <ul className="ai-list">{displayed.map(token => { const area = `token:${token.id}`, removed = Boolean(token.revokedAt) || revoked.includes(token.id); return <li key={token.id}><div><strong>{token.name}</strong><span>{token.prefix}… · {token.permission === "read" ? "只读" : "查询与提交操作"}</span><span>{removed ? "已撤销" : `到期：${token.expiresAt.slice(0, 10)}`} · {token.lastUsedAt ? `最近使用：${token.lastUsedAt.slice(0, 16).replace("T", " ")} UTC` : "尚未使用"}</span>{feedbackFor(area)}</div><button className="ai-button ai-secondary" disabled={busy || removed} onClick={() => perform("正在撤销访问令牌…", area, async () => { const result = await revoke(token.id); if (!result.ok) message(area, result.error, true); else { setRevoked(ids => [...ids, token.id]); if (created?.token.id === token.id) setCreated(null); message(area, "令牌已撤销。"); } }, token.id)}>{busy && busyTokenId === token.id ? "正在撤销…" : "撤销"}</button></li>; })}</ul>{!displayed.length && <p className="ai-muted">还没有访问令牌。</p>}
    </section><section className={styles.http} aria-label="HTTP 接入说明"><h2>HTTP 接入说明</h2><p>API 地址：<code>{baseURL}/api/v1</code> · <a href="/api/v1/openapi.json">接口协议</a></p><button className="ai-button" disabled={!baseURL} onClick={() => void copy(aiInstructions(baseURL), "http")}>复制接入说明</button>{feedbackFor("http")}<details><summary>查看流程与请求格式</summary><pre className="ai-instructions">{aiInstructions(baseURL)}</pre></details></section></details>
  </section>;
}
