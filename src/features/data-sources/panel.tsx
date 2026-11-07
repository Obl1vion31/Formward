"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useDraftGuard } from "@/components/draft-guard";
import { confirmAction } from "@/components/confirmation-state";
import { LoadingLink } from "@/components/loading-link";
import { adoptSourceDaysAction, bindPersonalSourceAction, configureConnectionAction, configureSourcePolicyAction, loadSourcesAction, resolveSourceConflictAction, synchronizeSourceAction } from "@/app/dashboard/sources/actions";
import { metricLabels, sourceMetrics, emptySources, type SourceMetric, type SourcePolicy, type SourcesView } from "./model";
import styles from "./sources.module.css";

type Response = { ok: true; data: SourcesView; sync?: { status: string; error?: string } } | { ok: false; error: string };
const display = (value: string | number | null) => value === null ? "未知" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Number(value));
const time = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "尚未同步";
const defaultPolicy = (): SourcePolicy => ({ strategy: "total", sources: emptySources(), effectiveFrom: "", version: 0 });
export function DataSourcesPanel({ initial, embedded = true, available=true }: { initial?: SourcesView; embedded?: boolean; available?:boolean }) {
  const [data, setData] = useState<SourcesView|null>(initial ?? (!available?{enabled:false,connections:[],policy:defaultPolicy(),comparison:[],conflicts:[],today:""}:null)), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState(""), [metrics, setMetrics] = useState<SourceMetric[]>(initial?.connections[0]?.metrics ?? [...sourceMetrics]), [active, setActive] = useState(initial?.connections[0]?.status !== "paused"), [policy, setPolicy] = useState(initial?.policy ?? defaultPolicy());
  const [selected, setSelected] = useState<string[]>(initial?.comparison.filter(d => d.canAdopt && d.mode === "unadopted").map(d => d.date) ?? []), [included, setIncluded] = useState<string[]>([]);
  const lock = useRef(false), connection = data?.connections[0];
  const settingsDirty = !!connection && (JSON.stringify([...metrics].sort()) !== JSON.stringify([...connection.metrics].sort()) || active !== (connection.status === "active")) || !!data && JSON.stringify(policy) !== JSON.stringify(data.policy);
  useDraftGuard(!!apiKey || settingsDirty, busy);
  function accept(value: SourcesView) {
    setData(value); setMetrics(value.connections[0]?.metrics ?? [...sourceMetrics]); setActive(value.connections[0]?.status !== "paused"); setPolicy(value.policy);
    setSelected(value.comparison.filter(d => d.canAdopt && d.mode === "unadopted").map(d => d.date)); setIncluded([]);
  }
  function run(work: () => Promise<Response>, success = "", clearKey = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) { setError(result.error); return; }
        accept(result.data); if (clearKey) setApiKey("");
        setNotice(result.sync?.error ?? (result.sync?.status === "busy" ? "已有同步正在进行，请稍后重新读取。" : result.sync?.status === "fresh" ? "刚刚已读取，保留当前数据。" : result.sync?.status === "paused" ? "同步已暂停或尚未选择同步内容。" : result.sync?.status === "discarded" ? "设置已改变，本次旧结果未采用。" : success));
      } catch { setError("连接未完成，当前设置已保留，请重试。"); }
      finally { lock.current = false; setBusy(false); }
    });
  }
  useEffect(() => {
    if (initial||!available) return;
    let live = true;
    startTransition(async () => {
      try { const result = await loadSourcesAction(); if (live) { if (result.ok) accept(result.data); else setError(result.error); } }
      catch { if (live) setError("暂时无法读取连接，请重试。"); }
    });
    return () => { live = false; };
  }, [initial,available]);
  const bind = (event: FormEvent) => { event.preventDefault(); run(() => bindPersonalSourceAction({ apiKey, version: connection?.version ?? 0, timezone: "Asia/Shanghai" }), "密钥已绑定。读取最近七天后，可逐日对照采用。", true); };
  async function adopt() {
    const rows = data!.comparison.filter(d => selected.includes(d.date));
    if (!rows.length || busy || settingsDirty) return;
    if (!await confirmAction({ title: "采用选中日期的数据？", message: `${rows.map(r => r.date).join("、")}：采用对照中所列的消耗、步数与运动，并开启这些日期的来源同步。以后手动改动会保护整天，自动同步不会覆盖。`, confirmLabel: "确认采用" })) return;
    run(() => adoptSourceDaysAction({ days: rows.map(d => ({ date: d.date, digest: d.digest, includedActivityIds: d.manualActivities.filter(a => included.includes(a.id)).map(a => a.id) })) }), "已采用。手动修改当天数据后会自动保护该天。");
  }
  const heading = !embedded && <div className={styles.heading}><h1>设备与数据来源</h1><LoadingLink href="/dashboard/energy">返回消耗</LoadingLink></div>;
  if (!data) return <div className={styles.panel}>{heading}{error ? <p role="alert">{error}<button onClick={() => run(loadSourcesAction)}>重试</button></p> : <div aria-busy="true" aria-label="正在读取数据连接" className={styles.skeleton}><div className="skeleton-card"/><div className="skeleton-card"/></div>}</div>;
  if (!data.enabled) return <div className={styles.panel} data-source-access="unavailable">{heading}<section className={styles.empty}><h2>暂未开放</h2><p>当前账号可以继续手动记录消耗、运动和身体数据。</p><LoadingLink href="/dashboard/energy">查看消耗记录 <span aria-hidden="true">→</span></LoadingLink></section></div>;
  const canAdopt = selected.length > 0 && data.comparison.filter(d => selected.includes(d.date)).every(d => d.canAdopt && d.manualActivities.every(a => included.includes(a.id)));
  return <div className={styles.panel} aria-busy={busy} data-source-access="pilot">{heading}
    <div className={styles.feedback} aria-live="polite">{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}</div>
    <section className={styles.connection} aria-label="Garmin 连接"><div className={styles.sectionHeading}><div><h2>Garmin Personal</h2><p>{connection ? connection.status === "paused" ? "已暂停同步" : connection.adopted ? "已连接" : "已连接 · 待采用" : "连接国际站个人账号"}</p></div>{connection && <button disabled={busy || settingsDirty || !active} onClick={() => run(() => synchronizeSourceAction(true), "最近数据已读取，请核对下方对照。")}>{busy ? "处理中…" : "立即同步"}</button>}</div>
      {connection && <><p className={styles.muted}>上次成功 · {time(connection.lastSuccessAt)}<br/>时区 · {connection.timezone}</p>{connection.error && <p className={styles.error} role="status">{connection.error}</p>}
      <details className={styles.settings}><summary>同步内容与连接</summary><form onSubmit={event => { event.preventDefault(); run(() => configureConnectionAction(connection.id, { version: connection.version, metrics, active }), "同步设置已保存。"); }}><fieldset disabled={busy}><legend>同步到 Formward 的内容</legend><div className={styles.checks}>{sourceMetrics.map(metric => <label key={metric}><input type="checkbox" checked={metrics.includes(metric)} onChange={event => setMetrics(values => event.target.checked ? [...values, metric] : values.filter(v => v !== metric))}/>{metricLabels[metric]}</label>)}</div><label className={styles.check}><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)}/>开启自动同步</label><p className={styles.muted}>暂停后保留已采用的历史。这里选择的是同步内容，个人密钥本身的访问权限不随勾选改变。</p><button type="submit" disabled={busy}>保存同步设置</button></fieldset></form></details></>}
      <details className={styles.settings} open={!connection}><summary>{connection ? "更换个人密钥" : "绑定 Personal API 密钥"}</summary><form onSubmit={bind}><label className={styles.field}>国际站 Personal API Key<input type="password" autoComplete="off" spellCheck={false} value={apiKey} maxLength={4096} onChange={event => setApiKey(event.target.value)} disabled={busy}/></label><p className={styles.muted}>密钥只发送到本站服务器及 Garmin 国际站。更换后需要重新核对采用。</p><button type="submit" disabled={busy || !apiKey.trim()}>{connection ? "更新密钥" : "绑定账号"}</button></form></details>
    </section>
    {connection && <>
      <section className={styles.section}><h2>采用来源</h2><p className={styles.muted}>{data.policy.strategy==="total"?"采用每日总消耗":"静息＋活动"} · {data.connections.find(c=>c.id===(data.policy.strategy==="total"?data.policy.sources.total:data.policy.sources.active))?.label??"手动记录"}</p><details className={styles.settings}><summary>调整采用来源</summary><p className={styles.muted}>设置保存后从今天生效。历史日期通过下方对照单独采用。</p><form onSubmit={event => { event.preventDefault(); run(() => configureSourcePolicyAction({ version: data.policy.version, strategy: policy.strategy, sources: policy.sources }), "采用规则已保存，从今天生效。"); }}><fieldset disabled={busy}><label className={styles.field}>消耗统计依据<select value={policy.strategy} onChange={event => setPolicy(p => ({ ...p, strategy: event.target.value as SourcePolicy["strategy"] }))}><option value="total">采用每日总消耗</option><option value="components">静息消耗＋活动消耗</option></select></label><div className={styles.sourceFields}>{sourceMetrics.map(metric => <label className={styles.field} key={metric}>{metricLabels[metric]}<select value={policy.sources[metric] ?? "manual"} onChange={event => setPolicy(p => ({ ...p, sources: { ...p.sources, [metric]: event.target.value === "manual" ? null : event.target.value } }))}><option value="manual">手动记录</option>{data.connections.filter(c => c.metrics.includes(metric)).map(c => <option key={c.id} value={c.id} disabled={c.status === "paused"}>{c.label}{c.status === "paused" ? "（已暂停）" : ""}</option>)}</select></label>)}</div><p className={styles.muted}>每日总数和运动明细分别保存，运动不会再加到设备日总数上。</p><button type="submit" disabled={busy}>保存采用来源</button></fieldset></form></details></section>
      <section className={styles.section} aria-label="最近七天来源对照"><div className={styles.sectionHeading}><div><h2>最近七天对照</h2><p>正式记录 → 选中来源</p></div><button disabled={busy || settingsDirty} onClick={() => run(loadSourcesAction)}>重新读取</button></div><p className={styles.muted}>今天是累计值。手动保护的日期需要重新勾选并确认，才会被来源替换。</p>
        <div className={styles.comparison}>{[...data.comparison].reverse().map(day => <article key={day.date} id={`source-${day.date}`} className={styles.day}><div className={styles.dayHeading}><label><input type="checkbox" aria-label={`采用 ${day.date}`} disabled={busy || !day.canAdopt || settingsDirty} checked={selected.includes(day.date)} onChange={event => setSelected(values => event.target.checked ? [...values, day.date] : values.filter(d => d !== day.date))}/><time>{day.date}</time></label><span>{day.date === data.today ? "今日累计 · " : ""}{day.mode === "manual" ? "手动保护" : day.mode === "source" ? "来源同步" : "待采用"}</span></div><div className={styles.numbers}><div><span>总消耗 · kcal</span><p><span>{display(day.current.total)}</span><span aria-hidden="true">→</span><strong>{display(day.proposed.total)}</strong></p></div><div><span>步数</span><p><span>{display(day.current.steps)}</span><span aria-hidden="true">→</span><strong>{display(day.proposed.steps)}</strong></p></div></div>
          {day.reason && <p className={styles.muted}>{day.reason}</p>}<details><summary>分项与运动{day.activityCount ? ` · ${day.activityCount} 项来源运动` : ""}</summary><dl className={styles.breakdown}><div><dt>静息 · kcal</dt><dd>{display(day.current.resting)} → {display(day.proposed.resting)}</dd></div><div><dt>活动 · kcal</dt><dd>{display(day.current.active)} → {display(day.proposed.active)}</dd></div>{day.coverageUntil && <div><dt>来源覆盖至</dt><dd>{time(day.coverageUntil)}</dd></div>}</dl>{day.manualActivities.length > 0 && <p className={styles.muted}>如果是额外运动，请不采用该天，继续使用手动记录。</p>}</details>{selected.includes(day.date)&&day.manualActivities.map(a=><label className={styles.check} key={a.id}><input type="checkbox" disabled={busy} checked={included.includes(a.id)} onChange={event=>setIncluded(values=>event.target.checked?[...values,a.id]:values.filter(id=>id!==a.id))}/>{a.name}已包含在来源汇总中</label>)}
        </article>)}</div><div className={styles.adopt}><span>{selected.length ? `已选 ${selected.length} 天` : "选择需要采用的日期"}</span><button disabled={busy || settingsDirty || !canAdopt} onClick={() => void adopt()}>{busy ? "处理中…" : "采用选中日期"}</button></div>
      </section>
      {data.conflicts.length > 0 && <section className={styles.section}><h2>运动冲突待核对</h2><p className={styles.muted}>疑似同一运动暂不重复导入。关联后保留现有记录，不自动覆盖。</p>{data.conflicts.map(conflict => <article className={styles.day} key={conflict.id}><h3>{conflict.name}</h3><p>{conflict.date}</p>{conflict.candidates.map(candidate => <div className={styles.candidate} key={candidate.id}><span>{candidate.name} · {display(candidate.durationMinutes)} 分钟</span><button disabled={busy} onClick={() => run(() => resolveSourceConflictAction({ id: conflict.id, version: conflict.version, decision: "link", activityId: candidate.id, activityVersion: candidate.version }), "已关联，保留现有运动。")} >关联此记录</button></div>)}<div className={styles.buttons}><button disabled={busy} onClick={async () => { if (await confirmAction({ title: "作为独立运动保留？", message: "这条来源运动与现有记录分别保留，仍不会重复增加到设备日总消耗。采用对应日期后进入正式记录。", confirmLabel: "保留独立运动" })) run(() => resolveSourceConflictAction({ id: conflict.id, version: conflict.version, decision: "adopt", activityId: null, activityVersion: null }), "已保留独立运动，请采用对应日期。"); }}>保留独立运动</button><button disabled={busy} onClick={() => run(() => resolveSourceConflictAction({ id: conflict.id, version: conflict.version, decision: "ignore", activityId: null, activityVersion: null }), "已忽略这条来源运动。")}>忽略来源运动</button></div></article>)}</section>}
    </>}
  </div>;
}
