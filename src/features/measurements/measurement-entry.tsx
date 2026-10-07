"use client";

import { useRef, useState } from "react";
import { entryMetrics, measurementEntryState, missingMeasurementCells, type EntryPeriod, type EntryResult, type MeasurementActions, type MeasurementDisplay } from "./entry-state";
import type { PeriodEdit, SaveMeasurementDayInput } from "./editing";
import type { MeasurementMetric } from "./trend";
import styles from "./measurements-view.module.css";

type Draft = Record<EntryPeriod, { weightKg: string; bodyFatPercent: string; bmi: string; fasting: string }>;
const periodName = (period: EntryPeriod) => period === "daytime" ? "晨间" : "晚间";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";
function makeDraft(records: MeasurementDisplay[], date: string, choices: Record<string, string>): Draft {
  return Object.fromEntries(measurementEntryState(records, date, choices).map(group => [group.period, {
    weightKg: group.observed?.weightKg ?? "", bodyFatPercent: group.observed?.bodyFatPercent ?? "", bmi: group.observed?.bmi ?? "",
    fasting: group.observed?.fasting === true ? "yes" : group.observed?.fasting === false ? "no" : "unknown",
  }])) as Draft;
}

export function MeasurementEntry({ date, today, timezone, records, choices, actions, editing = false, reminder = false, onUpdated, onChoose, onClose }: {
  date: string; today: string; timezone: string; records: MeasurementDisplay[]; choices: Record<string, string>; actions: MeasurementActions;
  editing?: boolean; reminder?: boolean; onUpdated: (result: Extract<EntryResult, { ok: true }>) => void;
  onChoose: (date: string, period: EntryPeriod, id: string) => void; onClose: () => void;
}) {
  const [editMode, setEditMode] = useState(editing);
  const [draft, setDraft] = useState(() => makeDraft(records, date, choices));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const request = useRef({ signature: "", id: "" });
  const groups = measurementEntryState(records, date, choices);
  const remaining = missingMeasurementCells(records, date, choices).length;
  const baseline = makeDraft(records, date, choices);
  const dirty = groups.some(group => !group.pending && Object.keys(draft[group.period]).some(field => draft[group.period][field as keyof Draft[EntryPeriod]] !== baseline[group.period][field as keyof Draft[EntryPeriod]]));
  function setField(period: EntryPeriod, field: keyof Draft[EntryPeriod], value: string) {
    setDraft(previous => ({ ...previous, [period]: { ...previous[period], [field]: value } })); setMessage(""); setError("");
  }
  function operationId(payload: unknown) {
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    return request.current.id;
  }
  async function run(work: () => Promise<EntryResult>, close = false) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await work();
      if (!result.ok) { setError(result.error); return; }
      onUpdated(result); setDraft(makeDraft(result.records, date, choices)); setMessage(result.message);
      request.current = { signature: "", id: "" };
      if (close) onClose();
    } catch { setError("网络连接未完成，请重试。已输入的数值仍保留。"); }
    finally { setBusy(false); }
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    const periods: SaveMeasurementDayInput["periods"] = {};
    for (const group of groups) {
      if (group.pending) continue;
      const change: PeriodEdit = {};
      for (const field of ["weightKg", "bodyFatPercent", "bmi"] as const) if (draft[group.period][field] !== baseline[group.period][field]) change[field] = draft[group.period][field].trim() || null;
      if (draft[group.period].fasting !== baseline[group.period].fasting) change.fasting = draft[group.period].fasting === "yes" ? true : draft[group.period].fasting === "no" ? false : null;
      if (!Object.keys(change).length) continue;
      if (group.observed) { change.recordId = group.observed.id; change.version = group.observed.updatedAt; }
      periods[group.period] = change;
    }
    const payload = { date, timezone, periods };
    void run(() => actions.save({ ...payload, operationId: operationId(["save", payload]) }));
  }
  return <form className={styles.entryForm} aria-label="当天四项录入" onSubmit={save} aria-busy={busy}>
    <div className={styles.entryIntroduction}>
      <p>{reminder ? "今天还有数据未记录" : editMode ? "编辑当天记录" : "录入当天数据"}</p>
      <span>{groups.some(group => group.pending) ? `已有实测待选择${remaining ? ` · 另缺 ${remaining} 项` : ""}` : remaining ? `还缺 ${remaining} 项 · 可以只填已测部分` : "四项已填 · 估计值仍可补录实测"}</span>
    </div>
    <div className={styles.entryGroups}>
      {groups.map(group => <fieldset key={group.period} className={group.period === "daytime" ? styles.dayValue : styles.nightValue} disabled={busy}>
        <legend>{periodName(group.period)}</legend>
        {group.pending ? <label className={styles.entryCandidate}>已有 {group.candidates.length} 条实测，请先选择记录
          <select aria-label={`录入${periodName(group.period)}候选记录`} value="" onChange={event => { onChoose(date, group.period, event.target.value); const nextChoices = { ...choices, [`${date}:${group.period}`]: event.target.value }; const next = makeDraft(records, date, nextChoices); setDraft(previous => ({ ...previous, [group.period]: next[group.period] })); }}>
            <option value="">选择已有记录</option>{group.candidates.map(row => <option key={row.id} value={row.id}>{row.sourceLocalTime} · {row.weightKg ?? "—"} kg · {row.bodyFatPercent ?? "—"}%</option>)}
          </select>
        </label> : <>
          {entryMetrics.map(metric => {
            const cell = group.fields[metric], editable = cell.kind === "missing" || editMode;
            const label = `${periodName(group.period)}${metricName(metric)}`;
            return <div className={styles.entryCell} key={metric} data-entry-cell={`${group.period}:${metric}`} data-kind={cell.kind}>
              <label htmlFor={`entry-${group.period}-${metric}`}>{metricName(metric)}<small>{metric === "weightKg" ? "kg" : "%"}</small></label>
              <div className={styles.entryInputRow}>
                {editable ? <input id={`entry-${group.period}-${metric}`} aria-label={label} type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" placeholder="实测值" value={draft[group.period][metric]} onChange={event => setField(group.period, metric, event.target.value)} />
                  : <span className={styles.entryRecorded}>{cell.value}<small>{cell.kind === "estimated" ? "◇ 估计" : "实测"}</small></span>}
                {cell.kind === "missing" ? <button type="button" className={styles.estimateAction} aria-label={`估算${label}`} disabled={busy || dirty} onClick={() => { const payload = { date, period: group.period, metric }; void run(() => actions.estimate({ ...payload, operationId: operationId(["estimate", payload]) })); }}>估算</button>
                  : !editMode && <button type="button" className={styles.estimateAction} aria-label={`编辑${label}`} onClick={() => setEditMode(true)}>{cell.kind === "estimated" ? "补录" : "编辑"}</button>}
              </div>
              {editable && cell.kind === "estimated" && <small className={styles.entryReference}>原估计 {cell.value} · 请填写真实读数</small>}
            </div>;
          })}
          {group.period === "daytime" && <label className={styles.entryFasting}>晨间测量条件
            <select aria-label="晨间空腹条件" value={draft.daytime.fasting} onChange={event => setField("daytime", "fasting", event.target.value)}><option value="unknown">未确认</option><option value="yes">空腹</option><option value="no">非空腹</option></select>
          </label>}
          {group.period === "evening" && <p className={styles.entryCondition}>晚间按非空腹记录</p>}
        </>}
      </fieldset>)}
    </div>
    <details className={styles.entryMore}><summary>更多指标 · BMI</summary><div>{groups.filter(group => !group.pending).map(group => <label key={group.period}>{periodName(group.period)} BMI<input aria-label={`${periodName(group.period)} BMI`} type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={draft[group.period].bmi} disabled={busy} onChange={event => setField(group.period, "bmi", event.target.value)} /></label>)}</div></details>
    {dirty && <p className={styles.entryHint}>先保存已填数值，再估算剩余项。</p>}
    {error && <p role="alert" className={styles.entryError}>{error}</p>}
    {message && <p role="status" className={styles.entryHint}>{message}</p>}
    <div className={styles.entryFooter}>
      <button type="submit" className={styles.saveEntry} disabled={busy || !dirty}>{busy ? "正在处理…" : "保存录入"}</button>
      {date === today && <button type="button" disabled={busy} onClick={() => void run(() => actions.skipReminder(date, timezone), true)}>今天不录入</button>}
    </div>
    <p className={styles.entryHint}>未填项保持空白。估计仅辅助趋势，并非实际测量。</p>
  </form>;
}

export function MeasurementDateForm({ today, actions, onCreated, onUpdated }: {
  today: string; actions: MeasurementActions; onCreated: (date: string) => void; onUpdated: (result: Extract<EntryResult, { ok: true }>) => void;
}) {
  const [date, setDate] = useState(today), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className={styles.dateEntryForm} aria-label="新增空白日期" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await actions.createDate(date); if (!result.ok) { setError(result.error); return; } onUpdated(result); onCreated(date); }
    catch { setError("未能添加日期，请重试。"); } finally { setBusy(false); }
  }}><label>记录日期<input aria-label="新增记录日期" type="date" required min="1000-01-01" max="9999-12-31" value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></label>
    <p>只添加日期。未填写的晨晚指标保持空白。</p><button type="submit" disabled={busy} className={styles.saveEntry}>{busy ? "正在添加…" : "添加日期"}</button>{error && <p role="alert">{error}</p>}
  </form>;
}
