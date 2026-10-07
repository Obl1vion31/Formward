"use client";

import { useRef, useState } from "react";
import { entryMetrics, measurementEntryState, missingMeasurementCells, type EntryPeriod, type EntryResult, type MeasurementActions, type MeasurementDisplay } from "./entry-state";
import type { PeriodEdit, SaveMeasurementDayInput } from "./editing";
import type { MeasurementMetric } from "./trend";
import styles from "./measurements-view.module.css";

type Draft = Record<EntryPeriod, { weightKg: string; bodyFatPercent: string; bmi: string }>;
const periodName = (period: EntryPeriod) => period === "daytime" ? "晨间" : "晚间";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";
function makeDraft(records: MeasurementDisplay[], date: string, choices: Record<string, string>): Draft {
  return Object.fromEntries(measurementEntryState(records, date, choices).map(group => [group.period, {
    weightKg: group.observed?.weightKg ?? "", bodyFatPercent: group.observed?.bodyFatPercent ?? "", bmi: group.observed?.bmi ?? "",
  }])) as Draft;
}

export function MeasurementEntry({ date, timezone, records, choices, actions, editing = false, onUpdated, onChoose }: {
  date: string; timezone: string; records: MeasurementDisplay[]; choices: Record<string, string>; actions: MeasurementActions;
  editing?: boolean; onUpdated: (result: Extract<EntryResult, { ok: true }>) => void;
  onChoose: (date: string, period: EntryPeriod, id: string) => void;
}) {
  const [editMode, setEditMode] = useState(editing);
  const [draft, setDraft] = useState(() => makeDraft(records, date, choices));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const request = useRef({ signature: "", id: "" });
  const groups = measurementEntryState(records, date, choices).map(group => ({ ...group, blocked: group.period === "daytime" && !!group.observed && group.observed.fasting !== true }));
  const remaining = missingMeasurementCells(records, date, choices).length;
  const baseline = makeDraft(records, date, choices);
  const dirty = groups.some(group => !group.pending && !group.blocked && Object.keys(draft[group.period]).some(field => draft[group.period][field as keyof Draft[EntryPeriod]] !== baseline[group.period][field as keyof Draft[EntryPeriod]]));
  function setField(period: EntryPeriod, field: keyof Draft[EntryPeriod], value: string) {
    setDraft(previous => ({ ...previous, [period]: { ...previous[period], [field]: value } })); setMessage(""); setError("");
  }
  function operationId(payload: unknown) {
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    return request.current.id;
  }
  async function run(work: () => Promise<EntryResult>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await work();
      if (!result.ok) { setError(result.error); return; }
      onUpdated(result); setDraft(makeDraft(result.records, date, choices)); setMessage(result.message);
      request.current = { signature: "", id: "" };
    } catch { setError("网络连接未完成，请重试。已输入的数值仍保留。"); }
    finally { setBusy(false); }
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    const periods: SaveMeasurementDayInput["periods"] = {};
    for (const group of groups) {
      if (group.pending || group.blocked) continue;
      const change: PeriodEdit = {};
      for (const field of ["weightKg", "bodyFatPercent", "bmi"] as const) if (draft[group.period][field] !== baseline[group.period][field]) change[field] = draft[group.period][field].trim() || null;
      if (!Object.keys(change).length) continue;
      change.fasting = group.period === "daytime";
      if (group.observed) { change.recordId = group.observed.id; change.version = group.observed.updatedAt; }
      periods[group.period] = change;
    }
    const payload = { date, timezone, periods };
    void run(() => actions.save({ ...payload, operationId: operationId(["save", payload]) }));
  }
  return <form className={styles.entryForm} aria-label="当天四项录入" onSubmit={save} aria-busy={busy}>
    <div className={styles.entryIntroduction}>
      <p>{editMode ? "编辑当天记录" : "录入当天数据"}</p>
      <span>{groups.some(group => group.pending) ? `已有实测待选择${remaining ? ` · 另缺 ${remaining} 项` : ""}` : remaining ? `还缺 ${remaining} 项 · 可以只填已测部分` : "四项已填 · 估计值仍可补录实测"}</span>
    </div>
    <div className={styles.entryGroups}>
      {groups.map(group => <fieldset key={group.period} className={group.period === "daytime" ? styles.dayValue : styles.nightValue} disabled={busy || group.blocked}>
        <legend>{group.blocked ? `白天 · ${group.observed?.fasting === false ? "非空腹" : "空腹未确认"}` : `${periodName(group.period)} · ${group.period === "daytime" ? "空腹" : "非空腹"}`}</legend>
        {group.pending ? <label className={styles.entryCandidate}>已有 {group.candidates.length} 条实测，请先选择记录
          <select aria-label={`录入${periodName(group.period)}候选记录`} value="" onChange={event => { onChoose(date, group.period, event.target.value); const nextChoices = { ...choices, [`${date}:${group.period}`]: event.target.value }; const next = makeDraft(records, date, nextChoices); setDraft(previous => ({ ...previous, [group.period]: next[group.period] })); }}>
            <option value="">选择已有记录</option>{group.candidates.map(row => <option key={row.id} value={row.id}>{row.sourceLocalTime} · {row.weightKg ?? "—"} kg · {row.bodyFatPercent ?? "—"}%</option>)}
          </select>
        </label> : <>
          {entryMetrics.map(metric => {
            const cell = group.fields[metric], editable = !group.blocked && (cell.kind === "missing" || editMode);
            const label = `${periodName(group.period)}${metricName(metric)}`;
            return <div className={styles.entryCell} key={metric} data-entry-cell={`${group.period}:${metric}`} data-kind={cell.kind}>
              <label htmlFor={`entry-${group.period}-${metric}`}>{metricName(metric)}<small>{metric === "weightKg" ? "kg" : "%"}</small></label>
              <div className={styles.entryInputRow}>
                {editable ? <input id={`entry-${group.period}-${metric}`} aria-label={label} type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" placeholder="实测值" value={draft[group.period][metric]} onChange={event => setField(group.period, metric, event.target.value)} />
                  : <span className={styles.entryRecorded}>{cell.value ?? "—"}<small>{cell.kind === "estimated" ? "◇ 估计" : cell.kind === "observed" ? "实测" : ""}</small></span>}
                {cell.kind === "missing" ? <button type="button" className={styles.estimateAction} aria-label={`估算${label}`} disabled={busy || dirty} onClick={() => { const payload = { date, period: group.period, metric }; void run(() => actions.estimate({ ...payload, operationId: operationId(["estimate", payload]) })); }}>估算</button>
                  : !editMode && <button type="button" className={styles.estimateAction} aria-label={`编辑${label}`} onClick={() => setEditMode(true)}>{cell.kind === "estimated" ? "补录" : "编辑"}</button>}
              </div>
              {editable && cell.kind === "estimated" && <small className={styles.entryReference}>原估计 {cell.value} · 请填写真实读数</small>}
            </div>;
          })}
          {group.blocked && <p className={styles.entryCondition}>原记录非空腹或空腹条件未确认，保留只读。</p>}
        </>}
      </fieldset>)}
    </div>
    <details className={styles.entryMore}><summary>更多指标 · BMI</summary><div>{groups.filter(group => !group.pending).map(group => <label key={group.period}>{periodName(group.period)} BMI<input aria-label={`${periodName(group.period)} BMI`} type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={draft[group.period].bmi} disabled={busy || group.blocked} onChange={event => setField(group.period, "bmi", event.target.value)} /></label>)}</div></details>
    {dirty && <p className={styles.entryHint}>先保存已填数值，再估算剩余项。</p>}
    {error && <p role="alert" className={styles.entryError}>{error}</p>}
    {message && <p role="status" className={styles.entryHint}>{message}</p>}
    <div className={styles.entryFooter}>
      <button type="submit" className={styles.saveEntry} disabled={busy || !dirty}>{busy ? "正在处理…" : "保存录入"}</button>
    </div>
  </form>;
}
