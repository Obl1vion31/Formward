"use client";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { LoadingLink } from "@/components/loading-link";
import { LocalLoading } from "@/components/local-loading";
import { confirmAction } from "@/components/confirmation-state";
import type { createAiToken } from "./ai-tokens";
import { aiInstructions } from "../measurements/ai-instructions";
import { useOperationClock } from "../meals/use-operation-clock";
import { aiAccessDate, aiAccessSummary, aiConnectionLabels, aiConnectionState, aiRecordDomains, aiSubmissionLabels, aiSubmissionState, authorizationInstruction, type AiAccessConnection, type AiAccessOverview, type AiProvider } from "./ai-access-model";
import styles from "./ai-access.module.css";

type Created = Awaited<ReturnType<typeof createAiToken>>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Feedback = { area: string; error: boolean; message: string } | null;
type Props = {
  canonicalOrigin: string; overview?: AiAccessOverview; overviewPromise?: Promise<AiAccessOverview>;
  create: (name: string, permission: "read" | "write") => Promise<Result<Created>>;
  revoke: (id: string) => Promise<Result<{ id: string }>>;
  revokeConnection: (id: string) => Promise<Result<{ id: string }>>;
};
const providers = [["chatgpt", "ChatGPT"], ["doubao", "豆包"]] as const;
export function AiAccessReading() {
  return <section className={`ai-page ${styles.settings}`} aria-labelledby="ai-title"><header className={styles.pageHeading}><h1 id="ai-title">AI 接入</h1><p>AI 可查询、提交预览，保存由你确认。</p></header><div className={styles.sectionHeading}><h2>AI 连接</h2><LocalLoading label="正在读取连接…" /></div></section>;
}
function closeDetails(event: KeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape" || event.defaultPrevented || (event.target as Element).matches("select") || (event.target as Element).closest("details") !== event.currentTarget) return;
  event.preventDefault(); event.stopPropagation();
  event.currentTarget.open = false;
  event.currentTarget.querySelector("summary")?.focus();
}

function Permissions({ scopes, available = false, loading = false, historical = false, inactive = false, name }: { scopes: string[]; available?: boolean; loading?: boolean; historical?: boolean; inactive?: boolean; name: string }) {
  return <div className={styles.permissionContainer}>
    <table className={styles.permissions} aria-label={`${name}${available ? "可申请权限" : historical ? "原授权范围，当前已失效" : "实际权限"}`}>
      <thead><tr><th scope="col">数据范围</th><th scope="col">查询</th><th scope="col">提交预览</th></tr></thead>
      <tbody>{aiRecordDomains.map(([label, domain]) => <tr key={domain}><th scope="row">{label}</th>{["read", "write"].map((action, index) => {
        const granted = scopes.includes(`${domain}:${action}`);
        const value = inactive ? "已失效" : available ? "可申请" : granted ? historical ? "原已授权" : "已授权" : "未授权";
        return <td key={action} data-granted={!inactive && !available && !historical && granted || undefined}><span className={styles.mobilePermissionLabel} aria-hidden="true">{index ? "提交预览" : "查询"}</span>{loading ? <span className={styles.permissionPlaceholder} aria-label="权限读取中" /> : value}</td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

export function AiAccess({ canonicalOrigin, overview, overviewPromise, create, revoke, revokeConnection }: Props) {
  const [resolvedOverview, setResolvedOverview] = useState<AiAccessOverview | null>(null), [readError, setReadError] = useState(false);
  useEffect(() => {
    let current = true;
    if (overviewPromise) void overviewPromise.then(data => { if (current) { setResolvedOverview(data); setReadError(false); } }, () => { if (current) setReadError(true); });
    return () => { current = false; };
  }, [overviewPromise]);
  const now = useOperationClock(), loading = (overviewPromise ? !resolvedOverview : overview === undefined) && !readError;
  const data = resolvedOverview ?? overview;
  const tokens = data?.tokens ?? [], connections = overview?.connections ?? [], submissions = data?.submissions ?? [];
  const [created, setCreated] = useState<Created | null>(null), [feedback, setFeedback] = useState<Feedback>(null);
  const [working, setWorking] = useState(false), [advancedOpen, setAdvancedOpen] = useState(false), [revoked, setRevoked] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState("all"), [statusFilter, setStatusFilter] = useState("all");
  const [transitionPending, startTransition] = useTransition(), busy = working || transitionPending;
  const [busyLabel, setBusyLabel] = useState(""), [busyArea, setBusyArea] = useState(""), [busyTokenId, setBusyTokenId] = useState<string | null>(null);
  const busyRef = useRef(false), secret = useRef<HTMLDivElement>(null), shownSecret = useRef<string | null>(null);
  useEffect(() => {
    if (!created || busy || shownSecret.current === created.token.id) return;
    shownSecret.current = created.token.id;
    secret.current?.focus({ preventScroll: true });
    secret.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [created, busy]);
  function message(area: string, text: string, error = false) { setFeedback({ area, error, message: text }); }
  function perform(label: string, area: string, work: () => Promise<void>, tokenId: string | null = null) {
    if (busyRef.current || busy) return;
    busyRef.current = true; setWorking(true); setBusyLabel(label); setBusyArea(area); setBusyTokenId(tokenId); setFeedback(null);
    startTransition(async () => {
      try { await work(); } catch { message(area, "操作未完成，请稍后重试。", true); }
      finally { busyRef.current = false; setWorking(false); setBusyTokenId(null); }
    });
  }
  async function copy(value: string, area: string) {
    try { await navigator.clipboard.writeText(value); message(area, "已复制。"); }
    catch { message(area, "无法自动复制，请手动选择内容复制。", true); }
  }
  function feedbackFor(area: string) {
    return <>{busy && busyArea === area && <LocalLoading label={busyLabel} />}{feedback?.area === area && <p className={feedback.error ? "ai-error" : "ai-muted"} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}</>;
  }
  function state(connection: AiAccessConnection) { return revoked.includes(connection.id) ? "revoked" : aiConnectionState(connection, now); }
  function address(area: string) {
    return <div className={styles.address}><input aria-label="MCP 服务器地址" readOnly value={`${canonicalOrigin}/api/mcp`} spellCheck={false} /><button className="ai-button" disabled={!canonicalOrigin} type="button" onClick={() => void copy(`${canonicalOrigin}/api/mcp`, area)}>复制 MCP 地址</button></div>;
  }
  function instructions(provider: AiProvider, area: string) {
    return <div className={styles.instructions}>
      {provider === "doubao" ? <ol><li>联系管理员加入豆包体验白名单，并获取测试入口。</li><li>在豆包中打开 Formward 应用插件，按提示登录 Formward。</li><li>核对并允许需要的权限，返回豆包使用。</li></ol> : <>{address(area)}<ol><li>在{provider === "chatgpt" ? " ChatGPT " : "支持远程 MCP 与 OAuth 的 AI 客户端"}中添加此 MCP 地址，认证方式选择 OAuth。</li><li>登录 Formward，核对并允许需要的权限。</li><li>返回 AI 查询记录，或提交预览后打开审核链接。</li></ol></>}
      <button className="ai-button ai-secondary" type="button" onClick={() => void copy(authorizationInstruction, area)}>复制授权指令</button>
      <p className="ai-muted">需要补充权限时，把指令发给这个 AI，再在授权网页中确认；现有权限不会自动扩大。</p>
    </div>;
  }
  async function disconnect(connection: AiAccessConnection) {
    if (busy || !await confirmAction({ title: `撤销 ${connection.name} 连接`, message: "此连接将立即停止访问，未确认的预览也将无法保存。已有健康记录保留，重新使用需再次授权。", confirmLabel: "撤销连接", danger: true })) return;
    const area = "connection:" + connection.id;
    perform("正在撤销连接…", area, async () => {
      const result = await revokeConnection(connection.id);
      if (!result.ok) message(area, result.error, true);
      else { setRevoked(ids => [...ids, connection.id]); message(area, "连接已撤销。"); }
    }, connection.id);
  }
  function connectionDetails(connection: AiAccessConnection) {
    const area = "connection:" + connection.id, current = state(connection);
    return <details className={styles.connectionDetails} onKeyDown={closeDetails}><summary>连接详情</summary>
      <dl className={styles.metadata}><div><dt>授权时间</dt><dd>{aiAccessDate(connection.authorizedAt)}</dd></div><div><dt>最近使用</dt><dd>{connection.lastUsedAt ? aiAccessDate(connection.lastUsedAt) : "尚未调用"}</dd></div><div><dt>到期时间</dt><dd>{aiAccessDate(connection.expiresAt)}</dd></div></dl>
      <p className="ai-muted">以上时间为北京时间，连接最长有效 30 天。</p>
      {current !== "connected" && <Permissions name={connection.name} scopes={connection.grantedScopes} historical />}
      <details onKeyDown={closeDetails}><summary>{current === "connected" ? "接入方式与补充权限" : "重新接入说明"}</summary>{instructions(connection.provider, area)}</details>
      <div className={styles.manageActions}><button className="ai-button ai-secondary" type="button" disabled={busy || current === "revoked"} onClick={() => void disconnect(connection)}>{busyTokenId === connection.id ? "正在撤销…" : "撤销连接"}</button></div>{feedbackFor(area)}
    </details>;
  }
  function connected(connection: AiAccessConnection) {
    const current = state(connection);
    return <article key={connection.id} className={styles.connection} data-connection-id={connection.id}>
      <div className={styles.connectionHeading}><h3>{connection.name}</h3><span className={styles.connectionState} data-state={current}>{aiConnectionLabels[current]}</span>{connection.provider === "doubao" && <span className={styles.beta}>内测</span>}</div>
      {current !== "connected" || aiAccessSummary(connection.scopes) === "只读" ? <p className={styles.connectionSummary}>{current === "connected" ? "只读" : "此连接当前不可访问记录"}</p> : null}
      <Permissions name={connection.name} scopes={connection.scopes} inactive={current !== "connected"} />
      {connectionDetails(connection)}
    </article>;
  }
  function providerSection(provider: "chatgpt" | "doubao", name: string) {
    const related = connections.filter(connection => connection.provider === provider);
    // 本页刚撤销的条目保留在原位置，让结果与焦点仍归属于刚才的操作；重新进入后归入历史。
    const active = related.filter(connection => state(connection) === "connected" || revoked.includes(connection.id)), history = related.filter(connection => state(connection) !== "connected" && !revoked.includes(connection.id));
    const area = "connect:" + provider;
    return <div key={provider} className={styles.provider} data-ai-provider={provider}>
      {active.length ? active.map(connected) : <article className={styles.connection}>
        <div className={styles.connectionHeading}><h3>{name}</h3><span className={styles.connectionState}>{history.length ? aiConnectionLabels[state(history[0])] : "未接入"}</span>{provider === "doubao" && <span className={styles.beta}>内测</span>}</div>
        <p className={styles.connectionSummary}>{provider === "doubao" ? "需联系管理员加入白名单" : "通过 MCP 与 OAuth 接入"}</p>
        <div className={styles.availableScopes} aria-label={`${name}可申请权限`}><span>可申请权限</span><p>身体、饮食与食材、消耗、训练计划的查询与提交预览</p></div>
        <details className={styles.connectionDetails} onKeyDown={closeDetails}><summary>{history.length ? "重新接入" : "查看接入步骤"}</summary>{instructions(provider, area)}{feedbackFor(area)}</details>
      </article>}
      {history.length > 0 && <details className={styles.historyConnections} onKeyDown={closeDetails}><summary>历史连接（{history.length}）</summary><div className={styles.historyList}>{history.map(connection => <article key={connection.id} data-connection-id={connection.id}>
        <div className={styles.connectionHeading}><h4>{connection.name}</h4><span className={styles.connectionState}>{aiConnectionLabels[state(connection)]}</span></div>{connectionDetails(connection)}
      </article>)}</div></details>}
    </div>;
  }
  const displayed = created && !tokens.some(row => row.id === created.token.id) ? [created.token, ...tokens] : tokens;
  const sources = [...new Map(submissions.map(row => [row.source.key, row.source])).values()];
  const filtered = submissions.filter(row => (sourceFilter === "all" || row.source.key === sourceFilter) && (statusFilter === "all" || aiSubmissionState(row, now) === statusFilter));
  const orderedProviders = [...providers].sort(([a], [b]) => Number(connections.some(row => row.provider === b && state(row) === "connected")) - Number(connections.some(row => row.provider === a && state(row) === "connected")));
  if (!overview) return <AiAccessReading />;

  return <section className={`ai-page ${styles.settings}`} aria-labelledby="ai-title" data-ai-access-ready={!loading || undefined}>
    <header className={styles.pageHeading}><h1 id="ai-title">AI 接入</h1><p>AI 可查询、提交预览，保存由你确认。</p></header>
    <section className={styles.connectionSection} aria-labelledby="ai-connections-title">
      <div className={styles.sectionHeading}><h2 id="ai-connections-title">AI 连接</h2></div>
      <div className={styles.providers}>{orderedProviders.map(([provider, name]) => providerSection(provider, name))}{connections.filter(connection => connection.provider === "other" && (state(connection) === "connected" || revoked.includes(connection.id))).map(connected)}</div>
    </section>
    <details className={styles.disclosure} onKeyDown={closeDetails} data-ai-submissions><summary><h2>AI 提交记录</h2></summary>
      <div className={styles.disclosureBody}>
        <div className={styles.filters}><label>发起来源<select aria-label="筛选发起来源" value={sourceFilter} disabled={loading} onChange={event => setSourceFilter(event.target.value)}><option value="all">全部来源</option>{sources.map(source => <option key={source.key} value={source.key}>{source.label}</option>)}</select></label>
          <label>审核状态<select aria-label="筛选审核状态" value={statusFilter} disabled={loading} onChange={event => setStatusFilter(event.target.value)}><option value="all">全部状态</option>{Object.entries(aiSubmissionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <p className="ai-muted">按提交时间倒序排列，时间为北京时间。</p>
        {loading ? <LocalLoading label="正在读取提交记录…" /> : readError ? <p className="ai-error" role="alert">提交记录读取失败，请刷新页面重试。</p> : <><ul className={styles.submissions}>{filtered.map(row => {
          const current = aiSubmissionState(row, now);
          return <li key={row.id}><div className={styles.submissionMain}><div className={styles.submissionHeading}><strong>{row.source.label}</strong><span className={styles.submissionState} data-state={current}>{current === "pending" && row.status === "partially_confirmed" ? "部分已保存 · 待确认" : aiSubmissionLabels[current] ?? current}</span></div><LoadingLink href={row.confirmationPath}>{row.summary}</LoadingLink><p><time dateTime={row.createdAt}>提交于 {aiAccessDate(row.createdAt)}</time>{current === "pending" && row.expiresAt && <span> · 预览到期 {aiAccessDate(row.expiresAt)}</span>}</p></div></li>;
        })}</ul>{!filtered.length && <p className="ai-muted" role="status">{submissions.length ? "没有符合筛选条件的提交。" : "还没有 AI 提交的操作。"}</p>}</>}
      </div>
    </details>
    <details className={styles.disclosure} open={advancedOpen} onToggle={event => { setAdvancedOpen(event.currentTarget.open); if (!event.currentTarget.open) setCreated(null); }} onKeyDown={closeDetails}><summary><h2>高级接入 · 手动令牌与 HTTP</h2></summary>
      <div className={styles.disclosureBody}>
        <section aria-labelledby="ai-other-mcp"><h3 id="ai-other-mcp">其他 MCP 客户端</h3>{instructions("other", "other-mcp")}{feedbackFor("other-mcp")}
          {connections.filter(connection => connection.provider === "other" && state(connection) !== "connected" && !revoked.includes(connection.id)).map(connection => <article key={connection.id} className={styles.historyOther}><div className={styles.connectionHeading}><h4>{connection.name}</h4><span className={styles.connectionState}>{aiConnectionLabels[state(connection)]}</span></div>{connectionDetails(connection)}</article>)}
        </section>
        <section className={styles.advancedSection} aria-label="手动访问令牌"><h3>访问令牌</h3><p className="ai-muted">用于自行配置的 HTTP 客户端，有效期 30 天；原文仅创建时显示。</p>
          <form className={`ai-token-form ${styles.tokenForm}`} aria-busy={busy} onSubmit={event => {
            event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
            perform("正在创建访问令牌…", "create-token", async () => { const result = await create(String(data.get("name")), data.get("permission") as "read" | "write"); if (result.ok) { setAdvancedOpen(true); setCreated(result.data); form.reset(); } else message("create-token", result.error, true); });
          }}><label>令牌名称<input name="name" required disabled={busy || loading} maxLength={100} placeholder="例如：本地 Codex" /></label><label>权限<select name="permission" defaultValue="write" disabled={busy || loading}><option value="write">查询与提交预览</option><option value="read">只读</option></select></label><button className="ai-button" disabled={busy || loading || !canonicalOrigin} type="submit">{busy && busyArea === "create-token" ? "正在创建…" : "创建令牌"}</button></form>{feedbackFor("create-token")}
          {created && <div className="ai-secret" ref={secret} tabIndex={-1} aria-label="新建令牌，仅显示一次"><strong>请保存这枚令牌，关闭后无法再次查看</strong><input aria-label="新令牌原文" readOnly value={created.rawToken} autoComplete="off" spellCheck={false} /><div className="ai-actions"><button type="button" className="ai-button" onClick={() => void copy(created.rawToken, "secret")}>复制令牌</button><button type="button" className="ai-button ai-secondary" onClick={() => { setCreated(null); setFeedback(null); }}>已保存，关闭</button></div>{feedbackFor("secret")}</div>}
          <ul className={`ai-list ${styles.tokens}`}>{displayed.map(token => {
            const area = "token:" + token.id, removed = Boolean(token.revokedAt) || revoked.includes(token.id), expired = now !== undefined && Date.parse(token.expiresAt) <= now;
            return <li key={token.id}><div><strong>{token.name}</strong><span>{token.prefix}… · {token.permission === "read" ? "只读" : "查询与提交预览"}</span><span>{removed ? "已撤销" : expired ? "已过期" : `到期 ${aiAccessDate(token.expiresAt)}`}</span>{feedbackFor(area)}</div><button className="ai-button ai-secondary" type="button" disabled={busy || removed} onClick={async () => {
              if (!await confirmAction({ title: "撤销访问令牌", message: `“${token.name}”将立即停止访问，未确认的预览也将无法保存。`, confirmLabel: "撤销令牌", danger: true })) return;
              perform("正在撤销访问令牌…", area, async () => { const result = await revoke(token.id); if (!result.ok) message(area, result.error, true); else { setRevoked(ids => [...ids, token.id]); if (created?.token.id === token.id) setCreated(null); message(area, "令牌已撤销。"); } }, token.id);
            }}>{busyTokenId === token.id ? "正在撤销…" : "撤销"}</button></li>;
          })}</ul>{readError && <p className="ai-error" role="alert">访问令牌读取失败，请刷新页面重试。</p>}{!loading && !readError && !displayed.length && <p className="ai-muted">还没有访问令牌。</p>}
        </section>
        <section className={styles.advancedSection} aria-label="HTTP 接入说明"><h3>HTTP 接入说明</h3><p>API 地址：<code>{canonicalOrigin}/api/v1</code> · <a href="/api/v1/openapi.json">接口协议</a></p><button className="ai-button" type="button" disabled={!canonicalOrigin} onClick={() => void copy(aiInstructions(canonicalOrigin), "http")}>复制接入说明</button>{feedbackFor("http")}<details onKeyDown={closeDetails}><summary>查看流程与请求格式</summary><pre className="ai-instructions">{aiInstructions(canonicalOrigin)}</pre></details></section>
      </div>
    </details>
  </section>;
}
