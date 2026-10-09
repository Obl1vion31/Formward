"use client";

import { useRef, useState, useTransition } from "react";
import { usePageLoading } from "@/components/page-loading-state";
import { entryMetrics, measurementEntryState, missingMeasurementCells, type EntryPeriod, type EntryResult, type MeasurementActions, type MeasurementDisplay } from "./entry-state";
import type { PeriodEdit, SaveMeasurementDayInput } from "./editing";
import type { MeasurementMetric } from "./trend";
import { systemMeasurementTimezone, timezoneLabel, timezoneOptions } from "./timezone";
import styles from "./measurements-view.module.css";

import { SourceInput } from "./source-input";

type Draft = Record<EntryPeriod, { weightKg: string; bodyFatPercent: string; deviceLabel: string; timezone: string }>;
const periodName = (period: EntryPeriod) => period === "daytime" ? "晨间" : "晚间";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";
function makeDraft(records: MeasurementDisplay[], date: string, choices: Record<string, string>, defaultTimezone: string): Draft {
  return Object.fromEntries(measurementEntryState(records, date, choices).map(group => [group.period, {
    weightKg: group.observed?.weightKg ?? "", bodyFatPercent: group.observed?.bodyFatPercent ?? "", deviceLabel: group.observed?.deviceLabel ?? "",
    timezone: group.observed ? group.observed.timezone ?? "" : defaultTimezone,
  }])) as Draft;
}

export function MeasurementEntry({ date, timezone, records, sources, choices, actions, editing = false, onUpdated, onChoose }: {
  date: string; timezone: string; records: MeasurementDisplay[]; sources: string[]; choices: Record<string, string>; actions: MeasurementActions;
  editing?: boolean; onUpdated: (result: Extract<EntryResult, { ok: true }>) => void;
  onChoose: (date: string, period: EntryPeriod, id: string) => void;
}) {
  const [baseRecords, setBaseRecords] = useState(records);
  const [lastRecords, setLastRecords] = useState(records);
  const [defaultTimezone, setDefaultTimezone] = useState(systemMeasurementTimezone);
  const [draft, setDraft] = useState(() => makeDraft(records, date, choices, defaultTimezone));
  const [working, setWorking] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [transitionPending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState("正在保存记录…");
  const busy = working || transitionPending;
  const lock = useRef(false);
  usePageLoading({ active: busy, label: busyLabel });
  const request = useRef({ signature: "", id: "" });
  const groups = measurementEntryState(records, date, choices).map(group => ({ ...group, blocked: group.period === "daytime" && !!group.observed && group.observed.fasting !== true }));
  const remaining = missingMeasurementCells(records, date, choices).length;
  const baseline = makeDraft(baseRecords, date, choices, defaultTimezone);
  const dirty = groups.some(group => !group.pending && !group.blocked && (entryMetrics.some(field => draft[group.period][field] !== baseline[group.period][field]) || (!!group.observed && (["deviceLabel", "timezone"] as const).some(field => draft[group.period][field] !== baseline[group.period][field]))));
  const hasDraft = (["daytime", "evening"] as const).some(period => ([...entryMetrics, "deviceLabel", "timezone"] as const).some(field => draft[period][field] !== baseline[period][field]));
  // 新服务端快照只更新干净表单；草稿继续绑定开始编辑时的版本。
  if (records !== lastRecords) {
    setLastRecords(records);
    if (!hasDraft && !busy) { const timezone = systemMeasurementTimezone(); setDefaultTimezone(timezone); setBaseRecords(records); setDraft(makeDraft(records, date, choices, timezone)); }
  }
  function setField(period: EntryPeriod, field: keyof Draft[EntryPeriod], value: string) {
    setDraft(previous => ({ ...previous, [period]: { ...previous[period], [field]: value } })); setMessage(""); setError("");
  }
  function operationId(payload: unknown) {
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    return request.current.id;
  }
  function run(label: string, work: () => Promise<EntryResult>) {
    if (lock.current || busy) return;
    lock.current = true;
    setWorking(true); setBusyLabel(label); setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) { setError(result.error); return; }
        const timezone = systemMeasurementTimezone();
        onUpdated(result); setDefaultTimezone(timezone); setBaseRecords(result.records); setDraft(makeDraft(result.records, date, choices, timezone)); setMessage(result.message);
        request.current = { signature: "", id: "" };
      } catch { setError("网络连接未完成，请重试。已输入的数值仍保留。"); }
      finally { lock.current = false; setWorking(false); }
    });
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    const periods: SaveMeasurementDayInput["periods"] = {};
    for (const group of groups) {
      if (group.pending || group.blocked) continue;
      const change: PeriodEdit = {};
      for (const field of ["weightKg", "bodyFatPercent"] as const) if (draft[group.period][field] !== baseline[group.period][field]) change[field] = draft[group.period][field].trim() || null;
      if (group.observed && draft[group.period].deviceLabel !== baseline[group.period].deviceLabel) change.deviceLabel = draft[group.period].deviceLabel.trim();
      if (group.observed && draft[group.period].timezone !== baseline[group.period].timezone) change.timezone = draft[group.period].timezone || null;
      if (!Object.keys(change).length) continue;
      change.deviceLabel = draft[group.period].deviceLabel.trim();
      change.fasting = group.period === "daytime";
      const original = measurementEntryState(baseRecords, date, choices).find(item => item.period === group.period)!.observed;
      if (original) { change.recordId = original.id; change.version = original.updatedAt; }
      else change.timezone = draft[group.period].timezone || null;
      periods[group.period] = change;
    }
    const payload = { date, timezone, periods };
    run("正在保存记录…", () => actions.save({ ...payload, operationId: operationId(["save", payload]) }));
  }
  return <form className={styles.entryForm} aria-label="当天四项录入" onSubmit={save} aria-busy={busy}>
    <div className={styles.entryIntroduction}>
      <p>{editing ? "编辑当天记录" : "录入当天数据"}</p>
      <span>{groups.some(group => group.pending) ? `已有实测待选择${remaining ? ` · 另缺 ${remaining} 项` : ""}` : remaining ? `还缺 ${remaining} 项 · 可以只填已测部分` : "四项已填 · 估计值仍可补录实测"}</span>
    </div>
    <div className={styles.entryGroups}>
      {groups.map(group => <fieldset key={group.period} className={group.period === "daytime" ? styles.dayValue : styles.nightValue} disabled={busy || group.blocked}>
        <legend>{group.blocked ? `白天 · ${group.observed?.fasting === false ? "非空腹" : "空腹未确认"}` : `${periodName(group.period)} · ${group.period === "daytime" ? "空腹" : "非空腹"}`}</legend>
        {group.pending ? <label className={styles.entryCandidate}>已有 {group.candidates.length} 条实测，请先选择记录
          <select aria-label={`录入${periodName(group.period)}候选记录`} value="" onChange={event => { onChoose(date, group.period, event.target.value); const nextChoices = { ...choices, [`${date}:${group.period}`]: event.target.value }; const next = makeDraft(records, date, nextChoices, defaultTimezone); setBaseRecords(previous => [...previous.filter(row => !(row.recordDate === date && row.period === group.period)), ...records.filter(row => row.recordDate === date && row.period === group.period)]); setDraft(previous => ({ ...previous, [group.period]: next[group.period] })); }}>
            <option value="">选择已有记录</option>{group.candidates.map(row => <option key={row.id} value={row.id}>{row.sourceLocalTime} · {row.weightKg ?? "—"} kg · {row.bodyFatPercent ?? "—"}%</option>)}
          </select>
        </label> : <>
          {entryMetrics.map(metric => {
            const cell = group.fields[metric], editable = !group.blocked;
            const label = `${periodName(group.period)}${metricName(metric)}`;
            return <div className={styles.entryCell} key={metric} data-entry-cell={`${group.period}:${metric}`} data-kind={cell.kind}>
              <label htmlFor={`entry-${group.period}-${metric}`}>{metricName(metric)}<small>{metric === "weightKg" ? "kg" : "%"}</small></label>
              <div className={styles.entryInputRow}>
                {editable ? <input id={`entry-${group.period}-${metric}`} aria-label={label} type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" placeholder="实测值" value={draft[group.period][metric]} onChange={event => setField(group.period, metric, event.target.value)} />
                  : <span className={styles.entryRecorded}>{cell.value ?? "—"}<small>{cell.kind === "estimated" ? "◇ 估计" : cell.kind === "observed" ? "实测" : ""}</small></span>}
                {cell.kind === "missing" ? <button type="button" className={styles.estimateAction} aria-label={`估算${label}`} disabled={busy || dirty} onClick={() => { const payload = { date, period: group.period, metric }; run(`正在估算${label}…`, () => actions.estimate({ ...payload, operationId: operationId(["estimate", payload]) })); }}>{busy && busyLabel === `正在估算${label}…` ? "估算中…" : "估算"}</button>
                  : null}
              </div>
              {editable && cell.kind === "estimated" && <small className={styles.entryReference}>原估计 {cell.value} · 请填写真实读数</small>}
            </div>;
          })}
          <SourceInput label={`${periodName(group.period)}数据来源`} value={draft[group.period].deviceLabel} sources={sources} onChange={value => setField(group.period, "deviceLabel", value)} />
          <div className={styles.entryTimezone}>
            <label htmlFor={`entry-${group.period}-timezone`}>时区</label>
            <select id={`entry-${group.period}-timezone`} aria-label={`${periodName(group.period)}时区`} value={draft[group.period].timezone} onChange={event => setField(group.period, "timezone", event.target.value)}>
              <option value="">未指定</option>
              {draft[group.period].timezone && !timezoneOptions.some(option => option.value === draft[group.period].timezone) && <option value={draft[group.period].timezone}>{timezoneLabel(draft[group.period].timezone, date, group.observed?.utcOffsetMinutes)}（保留原时区）</option>}
              {timezoneOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button type="button" aria-label={`${periodName(group.period)}采用系统时区`} onClick={() => setField(group.period, "timezone", systemMeasurementTimezone())}>采用系统时区</button>
          </div>
          {group.blocked && <p className={styles.entryCondition}>原记录非空腹或空腹条件未确认，保留只读。</p>}
        </>}
      </fieldset>)}
    </div>
    {dirty && <p className={styles.entryHint}>先保存修改，再估算剩余项。</p>}
    {error && <p role="alert" className={styles.entryError}>{error}</p>}
    {message && <p role="status" className={styles.entryHint}>{message}</p>}
    <div className={styles.entryFooter}>
      <button type="submit" className={styles.saveEntry} disabled={busy || !dirty}>{busy ? busyLabel.startsWith("正在估算") ? "正在估算…" : "正在保存…" : "保存录入"}</button>
    </div>
  </form>;
}
