"use client";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { LoadingLink } from "@/components/loading-link";
import { LocalLoading } from "@/components/local-loading";
import { confirmAction } from "@/components/confirmation-state";
import type { createAiToken } from "./ai-tokens";
import { aiInstructions } from "../measurements/ai-instructions";
import { useOperationClock } from "../meals/use-operation-clock";
import { AiAccessPanel } from "./ai-access-panel";
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
  return <section className={`ai-page ${styles.settings}`} aria-labelledby="ai-title" data-ai-access><PageHeading />
    <div className={styles.providers}>{providers.map(([provider, name]) => <div className={styles.provider} key={provider}><div className={styles.providerLine} data-ai-anchor={provider}><div className={styles.identity}><h2 className={styles.aiName}>{name}</h2><span className={styles.connectionState}><LocalLoading label="正在读取连接…" iconOnly /></span>{provider === "doubao" && <span className={styles.beta}>内测</span>}</div><button className={styles.textAction + " " + styles.permissionAction} disabled>权限</button><div className={styles.providerActions}><button className={styles.textAction} disabled>详情</button></div></div>{provider === "doubao" && <p className={styles.betaNote}>内测 · 需联系管理员加入白名单</p>}</div>)}</div>
    <section className={styles.submissionSection}><div className={styles.sectionBar} data-ai-anchor="submissions"><h2 className={styles.sectionTitle}><button className={styles.sectionToggle} disabled><Chevron />AI 提交记录</button></h2></div></section>
    <details className={styles.disclosure}><summary data-ai-anchor="advanced"><h2 className={styles.sectionTitle}>高级接入 <span className={styles.secondary}>手动令牌与 HTTP</span></h2></summary></details>
  </section>;
}
function PageHeading() { return <header className={styles.pageHeading} data-ai-anchor="heading"><h1 id="ai-title" className={styles.pageTitle}>AI 接入</h1><p>AI 可查询、提交预览，保存由你确认。</p></header>; }
function Chevron() { return <svg className={styles.chevron} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>; }
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
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [panel, setPanel] = useState<{ provider: AiProvider; name: string; kind: "permissions" | "details" | "history" | "connect"; anchor: HTMLElement } | null>(null);
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
    return <div className={styles.connectionDetails}>
      <dl className={styles.metadata}><div><dt>授权时间</dt><dd>{aiAccessDate(connection.authorizedAt)}</dd></div><div><dt>最近使用</dt><dd>{connection.lastUsedAt ? aiAccessDate(connection.lastUsedAt) : "尚未调用"}</dd></div><div><dt>到期时间</dt><dd>{aiAccessDate(connection.expiresAt)}</dd></div></dl>
      <p className="ai-muted">以上时间为北京时间，连接最长有效 30 天。</p>
      {current !== "connected" && <Permissions name={connection.name} scopes={connection.grantedScopes} historical />}
      <details onKeyDown={closeDetails}><summary>{current === "connected" ? "接入方式与补充权限" : "重新接入说明"}</summary>{instructions(connection.provider, area)}</details>
      <div className={styles.manageActions}><button className="ai-button ai-secondary" type="button" disabled={busy || current === "revoked"} onClick={() => void disconnect(connection)}>{busyTokenId === connection.id ? "正在撤销…" : "撤销连接"}</button></div>{feedbackFor(area)}
    </div>;
  }
  function providerSection(provider: AiProvider, name: string) {
    const related = connections.filter(connection => connection.provider === provider);
    const active = related.filter(connection => state(connection) === "connected"), history = related.filter(connection => state(connection) !== "connected");
    const current = active.length ? "connected" : history.length ? state(history[0]) : null;
    const count = active.length === 1 ? aiRecordDomains.filter(([, domain]) => active[0].scopes.some(scope => scope === `${domain}:read` || scope === `${domain}:write`)).length : 0;
    const summary = active.length > 1 ? `${active.length} 个连接 · 分别授权` : active.length ? `${count} 类数据 · ${aiAccessSummary(active[0].scopes) === "按下列权限访问" ? "部分授权" : aiAccessSummary(active[0].scopes)}` : "可申请 4 类数据";
    const openPanel = (kind: "permissions" | "details" | "history" | "connect", anchor: HTMLElement) => setPanel(value => value?.provider === provider && value.kind === kind ? null : { provider, name, kind, anchor });
    return <div key={provider} className={styles.provider} data-ai-provider={provider}>
      <div className={styles.providerLine} data-ai-anchor={provider}>
        <div className={styles.identity}><h2 className={styles.aiName}>{name}</h2><span className={styles.connectionState} data-state={current ?? "unconnected"}>{current === "unauthorized" ? "待授权" : current ? aiConnectionLabels[current] : "未接入"}</span>{provider === "doubao" && <span className={styles.beta}>内测</span>}</div>
        <button type="button" className={styles.textAction + " " + styles.permissionAction} aria-label={`${name}权限：${summary}`} aria-haspopup="dialog" aria-expanded={panel?.provider === provider && panel.kind === "permissions"} onClick={event => openPanel("permissions", event.currentTarget)}><span className={styles.desktopText}>{summary}</span><span className={styles.mobileText}>权限</span><Chevron /></button>
        <div className={styles.providerActions}>
          {!active.length && <button type="button" className={`ai-button ${styles.connectAction}`} onClick={event => openPanel("connect", event.currentTarget)}>{history.length ? "重新接入" : "接入"}</button>}
          <button type="button" className={styles.textAction} aria-label={`${name}连接详情`} aria-haspopup="dialog" aria-expanded={panel?.provider === provider && panel.kind === "details"} onClick={event => openPanel("details", event.currentTarget)}><span className={styles.desktopText}>连接详情</span><span className={styles.mobileText}>详情</span></button>
          {!!history.length && <button type="button" className={styles.textAction + " " + styles.desktopOnly} aria-label={`${name}历史连接（${history.length}）`} aria-haspopup="dialog" aria-expanded={panel?.provider === provider && panel.kind === "history"} onClick={event => openPanel("history", event.currentTarget)}>历史连接</button>}
        </div>
      </div>
      {provider === "doubao" && <p className={styles.betaNote}>内测 · 需联系管理员加入白名单</p>}
    </div>;
  }
  function panelContent() {
    if (!panel) return null;
    const related = connections.filter(connection => connection.provider === panel.provider), active = related.filter(connection => state(connection) === "connected"), history = related.filter(connection => state(connection) !== "connected" && !revoked.includes(connection.id)), managedActive = related.filter(connection => state(connection) === "connected" || revoked.includes(connection.id));
    const area = "connect:" + panel.provider;
    const managed = (rows: AiAccessConnection[], historical = false) => rows.map(connection => <article key={connection.id} data-connection-id={connection.id} className={styles.managedConnection}>
      <div className={styles.connectionHeading}><h3 className={historical ? styles.historyName : styles.connectionName}>{connection.name}</h3><span className={styles.connectionState} data-state={state(connection)}>{aiConnectionLabels[state(connection)]}</span></div>{connectionDetails(connection)}
    </article>);
    return <AiAccessPanel title={`${panel.name} · ${panel.kind === "permissions" ? "数据权限" : panel.kind === "history" ? "历史连接" : panel.kind === "connect" ? "接入说明" : "连接详情"}`} anchor={panel.anchor} close={() => setPanel(null)}>
      {panel.kind === "permissions" ? <div className={styles.permissionGroups}>{active.length ? active.map(connection => <section key={connection.id} data-connection-id={connection.id}><h3 className={styles.connectionName}>{connection.name}{active.length > 1 && <span className={styles.secondary}> · {aiAccessDate(connection.authorizedAt)}</span>}</h3><Permissions name={connection.name} scopes={connection.scopes} />{aiAccessSummary(connection.scopes) === "只读" && <p className={styles.panelNote}>只读 · 可查询已授权数据</p>}</section>) : <><p className={styles.panelNote}>可申请权限，接入时由你逐项确认。</p><Permissions name={panel.name} scopes={[]} available /></>}</div> : panel.kind === "connect" ? <>{instructions(panel.provider, area)}{feedbackFor(area)}{!!history.length && <details className={styles.mobileHistory} onKeyDown={closeDetails}><summary>历史连接（{history.length}）</summary>{managed(history, true)}</details>}</> : panel.kind === "history" ? managed(history, true) : <>
        {managedActive.length ? managed(managedActive) : <><p className={styles.panelNote}>当前没有有效连接。</p>{instructions(panel.provider, area)}{feedbackFor(area)}</>}
        {!!history.length && <details className={styles.mobileHistory} onKeyDown={closeDetails}><summary>历史连接（{history.length}）</summary>{managed(history, true)}</details>}
      </>}
    </AiAccessPanel>;
  }
  const displayed = created && !tokens.some(row => row.id === created.token.id) ? [created.token, ...tokens] : tokens;
  const sources = [...new Map(submissions.map(row => [row.source.key, row.source])).values()];
  const filtered = submissions.filter(row => (sourceFilter === "all" || row.source.key === sourceFilter) && (statusFilter === "all" || aiSubmissionState(row, now) === statusFilter));
  if (!overview) return <AiAccessReading />;

  return <section className={`ai-page ${styles.settings}`} aria-labelledby="ai-title" data-ai-access data-ai-access-ready={!loading || undefined}>
    <PageHeading />
    <div className={styles.providers}>{providers.map(([provider, name]) => providerSection(provider, name))}</div>
    {panelContent()}
    <section className={styles.submissionSection} data-ai-submissions data-open={submissionsOpen}>
      <div className={styles.sectionBar} data-ai-anchor="submissions"><h2 className={styles.sectionTitle}><button type="button" className={styles.sectionToggle} aria-expanded={submissionsOpen} aria-controls="ai-submissions-content" onClick={() => setSubmissionsOpen(value => !value)}><Chevron />AI 提交记录</button></h2>
        {submissionsOpen && <div className={styles.filters}><select aria-label="筛选发起来源" value={sourceFilter} disabled={loading} onChange={event => setSourceFilter(event.target.value)}><option value="all">全部来源</option>{sources.map(source => <option key={source.key} value={source.key}>{source.label}</option>)}</select>
          <select aria-label="筛选审核状态" value={statusFilter} disabled={loading} onChange={event => setStatusFilter(event.target.value)}><option value="all">全部状态</option>{Object.entries(aiSubmissionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      </div>
      {submissionsOpen && <div id="ai-submissions-content" className={styles.submissionBody}>
        <div className={styles.submissionColumns} aria-hidden="true"><span>提交时间</span><span>发起 AI</span><span>内容</span><span>状态</span><span /></div>
        {loading ? <LocalLoading label="正在读取提交记录…" /> : readError ? <p className="ai-error" role="alert">提交记录读取失败，请刷新页面重试。</p> : <><ul className={styles.submissions}>{filtered.map(row => {
          const current = aiSubmissionState(row, now);
          return <li key={row.id} className={styles.submissionRow}><time className={styles.submittedTime} dateTime={row.createdAt} title={aiAccessDate(row.createdAt)}>{aiAccessDate(row.createdAt).slice(5)}</time><span className={styles.submissionSource}><span className={styles.desktopText}>{row.source.label}</span><span className={styles.mobileText}>{row.source.compactLabel ?? row.source.label}</span></span><span className={styles.submissionSummary}><span className={styles.desktopText}>{row.summary}</span><span className={styles.mobileText}>{row.compactSummary ?? row.summary}</span></span><span className={styles.submissionState} data-state={current}>{current === "pending" && row.status === "partially_confirmed" ? "部分已保存 · 待确认" : aiSubmissionLabels[current] ?? current}</span><LoadingLink className={styles.viewAction} href={row.confirmationPath} aria-label={`查看${row.source.label}提交：${row.summary}，提交于${aiAccessDate(row.createdAt)}`}>查看</LoadingLink></li>;
        })}</ul>{!filtered.length && <p className="ai-muted" role="status">{submissions.length ? "没有符合筛选条件的提交。" : "还没有 AI 提交的操作。"}</p>}</>}
      </div>}
    </section>
    <details className={styles.disclosure} open={advancedOpen} onToggle={event => { setAdvancedOpen(event.currentTarget.open); if (!event.currentTarget.open) setCreated(null); }} onKeyDown={closeDetails}><summary data-ai-anchor="advanced"><h2 className={styles.sectionTitle}>高级接入 <span className={styles.secondary}>手动令牌与 HTTP</span></h2></summary>
      <div className={styles.disclosureBody}>
        <section aria-labelledby="ai-other-mcp"><h3 id="ai-other-mcp">其他 MCP 客户端</h3>{instructions("other", "other-mcp")}{feedbackFor("other-mcp")}
          {connections.filter(connection => connection.provider === "other").map(connection => <article key={connection.id} className={styles.historyOther}><div className={styles.connectionHeading}><h4 className={styles.historyName}>{connection.name}</h4><span className={styles.connectionState}>{aiConnectionLabels[state(connection)]}</span></div>{state(connection) === "connected" && <Permissions name={connection.name} scopes={connection.scopes} />}{connectionDetails(connection)}</article>)}
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
