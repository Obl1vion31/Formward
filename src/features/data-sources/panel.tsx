"use client";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useDraftGuard } from "@/components/draft-guard";
import { LoadingLink } from "@/components/loading-link";
import {LocalLoading} from '@/components/local-loading';
import { acknowledgeRecordChanges } from "@/components/record-change-client";
import { backfillSourceHistoryAction, bindPersonalSourceAction, configureConnectionAction, loadSourcesAction, synchronizeSourceAction } from "@/app/dashboard/sources/actions";
import { metricLabels, regionLabels, sourceMetrics, type SourceMetric, type SourceSettingsView, type SourceRecordChange } from "./model";
import type { Region } from "../garmin/client";
import type { SyncResult } from "./sync";
import styles from "./sources.module.css";

type Response = { ok: true; data: SourceSettingsView; recordChanges?: SourceRecordChange[]; sync?: SyncResult; settingsSaved?: boolean } | { ok: false; error: string };
type SourceTask = "load" | "sync" | "save" | "bind" | "history";
const time = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "";
const unavailable: SourceSettingsView = { enabled: false, connections: [], today: "" };
type ContentProps = {
  data: SourceSettingsView | null; embedded: boolean; pending?: boolean; busy?: boolean; task?: SourceTask | null;
  metrics?: SourceMetric[]; active?: boolean; apiKey?: string; region?: Region; historyFrom?: string; dirty?: boolean;
  notice?: string; error?: string;
  setMetrics?: (value: SourceMetric[]) => void; setActive?: (value: boolean) => void; setApiKey?: (value: string) => void; setRegion?: (value: Region) => void; setHistoryFrom?: (value: string) => void;
  save?: (event: FormEvent) => void; bind?: (event: FormEvent) => void; history?: (event: FormEvent) => void; sync?: () => void; retry?: () => void;
};
function SourceContent({ data, embedded, pending = false, busy = false, task = null, metrics = [], active = true, apiKey = "", region = "global", historyFrom = "2026-10-18", dirty = false, notice = "", error = "", setMetrics, setActive, setApiKey, setRegion, setHistoryFrom, save, bind, history, sync, retry }: ContentProps) {
  const keyHelpId = useId();
  if(pending) return <div className={styles.panel} aria-busy="true">{!embedded&&<div className={styles.heading}><h1>连接设备与数据来源</h1><LoadingLink href="/dashboard/energy">返回消耗</LoadingLink></div>}<section className={styles.connection}><div className={styles.sectionHeading}><h2>Garmin Personal</h2><button type="button" disabled>立即同步</button></div><div className={styles.status}><LocalLoading label="正在读取连接…"/></div></section></div>;
  const connection = data?.connections[0], disabled = pending || busy;
  const regionChanged = !!connection && region !== connection.region, credentialDirty = !!apiKey || regionChanged;
  const prefix = connection ? regionLabels[connection.region] + " · " : "";
  const status = error || notice || (connection?.status === "paused" ? prefix + "已暂停同步" : connection?.error || (connection?.lastSuccessAt ? prefix + "上次读取 " + time(connection.lastSuccessAt) : connection ? prefix + "已连接" : "尚未连接"));
  return <div className={styles.panel} aria-busy={pending || busy} data-source-access={data?.enabled === false ? "unavailable" : "available"}>
    {!embedded && <div className={styles.heading}><h1>连接设备与数据来源</h1><LoadingLink href="/dashboard/energy">返回消耗</LoadingLink></div>}
    {data?.enabled === false ? <section className={styles.empty}><h2>暂未开放</h2><p>当前账号可以继续手动记录消耗、运动和身体数据。</p><LoadingLink href="/dashboard/energy">查看消耗记录 →</LoadingLink></section> :
      <section className={styles.connection} aria-label="Garmin Personal 连接">
        <div className={styles.sectionHeading}><h2>Garmin Personal</h2><button type="button" disabled={disabled || !connection || !active || !metrics.length || dirty || credentialDirty} onClick={sync}>{task === "sync" ? "正在同步…" : "立即同步"}</button></div>
        <div className={styles.status} role={error || !notice && connection?.error ? "alert" : "status"}>{pending ? <LocalLoading label="正在读取连接…"/> : status}</div>
        {!pending && !data && error ? <button type="button" onClick={retry}>重新读取连接</button> : <>
          <details className={styles.settings}>
            <summary>{pending ? "个人密钥" : connection ? "更换个人密钥" : "输入个人密钥"}</summary>
            <form onSubmit={bind}>
              <div className={styles.keyFields}>
                <label className={styles.field}>Garmin 站点<select name="garminRegion" value={region} onChange={event => setRegion?.(event.target.value as Region)} disabled={disabled || dirty}><option value="global">国际站</option><option value="china">中国站</option></select></label>
                <label className={styles.field}>Personal API 密钥<input type="password" name="personalApiKey" value={apiKey} onChange={event => setApiKey?.(event.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby={keyHelpId} required minLength={10} maxLength={4096} disabled={disabled || dirty}/></label>
              </div>
              <p id={keyHelpId} className={styles.keyHelp}>{regionChanged ? "切换站点会新建连接，保留原记录。" : "密钥需来自所选站点。"}<a href="https://developer.garmin.com/gc-developer-program/personal/personal-api/" target="_blank" rel="noopener noreferrer">获取密钥</a></p>
              <button type="submit" disabled={disabled || dirty || apiKey.trim().length < 10}>{task === "bind" ? "正在连接并同步…" : connection ? "更换并同步" : "连接并同步"}</button>
            </form>
          </details>
          <form onSubmit={save} className={styles.contentForm}>
            <fieldset disabled={disabled || !connection || credentialDirty}><legend>同步内容与连接</legend>
              <div className={styles.checks}>{sourceMetrics.map(metric => <label key={metric} className={styles.check}><span className={styles.checkbox}><input type="checkbox" checked={metrics.includes(metric)} onChange={event => setMetrics?.(event.target.checked ? [...metrics, metric] : metrics.filter(m => m !== metric))}/></span>{metricLabels[metric]}</label>)}</div>
              <label className={styles.check}><span className={styles.checkbox}><input type="checkbox" checked={active} onChange={event => setActive?.(event.target.checked)}/></span>开启自动同步</label>
              <button type="submit" disabled={disabled || !connection || !dirty || credentialDirty}>{task === "save" ? "正在保存并同步…" : "保存并同步"}</button>
            </fieldset>
          </form>
          <details className={styles.settings}><summary>补齐历史</summary><form onSubmit={history}><label className={styles.field}>起始日期<input type="date" value={historyFrom} max={data?.today || undefined} required onChange={event => setHistoryFrom?.(event.target.value)} disabled={disabled}/></label><button type="submit" disabled={disabled || !connection || !active || !metrics.length || dirty || credentialDirty}>同步至今天</button></form></details>
        </>}
      </section>}
  </div>;
}
export function DataSourcesSkeleton({ embedded = true }: { embedded?: boolean }) { return <SourceContent data={null} embedded={embedded} pending/>; }

export function DataSourcesPanel({ initial, embedded = true, available = true }: { initial?: SourceSettingsView; embedded?: boolean; available?: boolean }) {
  const [data, setData] = useState<SourceSettingsView | null>(initial ?? (available ? null : unavailable));
  const [metrics, setMetrics] = useState<SourceMetric[]>(initial?.connections[0]?.metrics ?? [...sourceMetrics]);
  const [active, setActive] = useState(initial?.connections[0]?.status !== "paused");
  const [apiKey, setApiKey] = useState(""), [historyFrom, setHistoryFrom] = useState("2026-10-18");
  const [region, setRegion] = useState<Region>(initial?.connections[0]?.region ?? "global");
  const [notice, setNotice] = useState(""), [error, setError] = useState(""), [task, setTask] = useState<SourceTask | null>(null), [, startTransition] = useTransition();
  const busy = task !== null;
  const lock = useRef(false), connection = data?.connections[0];
  const dirty = !!connection && (JSON.stringify([...metrics].sort()) !== JSON.stringify([...connection.metrics].sort()) || active !== (connection.status === "active"));
  useDraftGuard(dirty || !!apiKey || !!connection && region !== connection.region, busy);
  function accept(value: SourceSettingsView) { setData(value); setMetrics(value.connections[0]?.metrics ?? [...sourceMetrics]); setActive(value.connections[0]?.status !== "paused"); setRegion(value.connections[0]?.region ?? "global"); }
  function run(work: () => Promise<Response>, task: SourceTask) {
    if (lock.current) return;
    lock.current = true; setTask(task); setError(""); setNotice("");
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) { setError(result.error); return; }
        const changes = result.recordChanges ?? result.sync?.changes ?? [];
        if (changes.length) acknowledgeRecordChanges(changes.map(c => c.key), changes);
        accept(result.data);
        if (task === "bind" && result.settingsSaved) setApiKey("");
        const sync = result.sync, prefix = result.settingsSaved ? "设置已保存。" : "";
        if (sync?.error) setError(prefix + sync.error);
        else if (sync?.status === "fresh") setNotice(prefix + (task === "history" ? "请间隔15秒再补齐历史。" : "刚刚已读取。"));
        else if (sync?.status === "busy") setNotice(prefix + "已有同步正在进行。");
        else if (sync?.status === "discarded") setNotice("连接已改变，请重新读取。");
        else if (sync?.status === "paused") setNotice(prefix + (active ? "尚未选择同步内容。" : "同步已暂停。"));
        else if (task === "history" && sync?.loaded) setNotice("已读取 " + sync.loaded.days + " 天汇总、" + sync.loaded.activities + " 条运动。");
        else if (task !== "load") setNotice(prefix + "同步完成。");
      } catch { setError("连接未完成，当前输入已保留，请重试。"); }
      finally { lock.current = false; setTask(null); }
    });
  }
  useEffect(() => {
    if (initial || !available) return;
    let live = true;
    startTransition(async () => {
      try { const result = await loadSourcesAction(); if (live) { if (result.ok) accept(result.data); else setError(result.error); } }
      catch { if (live) setError("暂时无法读取连接，请重试。"); }
    });
    return () => { live = false; };
  }, [initial, available]);
  return <SourceContent data={data} embedded={embedded} pending={!data && !error} busy={busy} task={task} metrics={metrics} active={active} apiKey={apiKey} region={region} historyFrom={historyFrom} dirty={dirty} notice={notice} error={error}
    setMetrics={setMetrics} setActive={setActive} setApiKey={setApiKey} setRegion={setRegion} setHistoryFrom={setHistoryFrom}
    sync={() => run(() => synchronizeSourceAction(true), "sync")}
    save={event => { event.preventDefault(); if (connection) run(() => configureConnectionAction(connection.id, { version: connection.version, metrics, active }), "save"); }}
    bind={event => { event.preventDefault(); run(() => bindPersonalSourceAction({ apiKey, region, version: connection?.version ?? 0, timezone: "Asia/Shanghai" }), "bind"); }}
    history={event => { event.preventDefault(); run(() => backfillSourceHistoryAction(historyFrom), "history"); }}
    retry={() => run(loadSourcesAction, "load")}/>;
}
