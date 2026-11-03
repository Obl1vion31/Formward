"use client";
import {numericDraftValue} from "@/components/form-draft";
import {habitualMeasurementSource} from "./source-habit";
import {DecimalInput} from "@/components/decimal-input";
import {confirmAction} from "@/components/confirmation-state";
import {formatRecordNumber} from "@/components/number-format";

import {confirmNumbers} from "@/components/number-change";
import {measurementVersions,verifyRecordVersions,acknowledgeRecordChanges} from "@/components/record-change-client";
import { useRef, useState, useTransition } from "react";
import {useDraftGuard} from "@/components/draft-guard";
import { usePageLoading } from "@/components/page-loading-state";
import { entryMetrics, localMeasurementDate, measurementEntryState, type EntryPeriod, type EntryResult, type MeasurementActions, type MeasurementDisplay } from "./entry-state";
import type { PeriodEdit, SaveMeasurementDayInput } from "./editing";
import type { MeasurementMetric } from "./trend";
import { systemMeasurementTimezone, timezoneLabel, timezoneOptions } from "./timezone";
import styles from "./measurements-view.module.css";

import { SourceInput } from "@/components/source-input";

type Draft = Record<EntryPeriod, { weightKg: string; bodyFatPercent: string; deviceLabel: string; timezone: string }>;
const periodName = (period: EntryPeriod) => period === "daytime" ? "晨间" : "晚间";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";
function makeDraft(records: MeasurementDisplay[], date: string, choices: Record<string, string>, defaultTimezone: string): Draft {
  return Object.fromEntries(measurementEntryState(records, date, choices).map(group => [group.period, {
    weightKg: group.observed?.weightKg ?? "", bodyFatPercent: group.observed?.bodyFatPercent ?? "", deviceLabel: group.observed?.deviceLabel ?? "",
    timezone: group.observed ? group.observed.timezone ?? "" : defaultTimezone,
  }])) as Draft;
}

export function MeasurementEntry({ date, timezone, records, sources, choices, actions, editing = false, initialPeriod = "daytime", onUpdated, onChoose }: {
  date: string; timezone: string; records: MeasurementDisplay[]; sources: string[]; choices: Record<string, string>; actions: MeasurementActions;
  editing?: boolean; initialPeriod?:EntryPeriod; onUpdated: (result: Extract<EntryResult, { ok: true }>) => void;
  onChoose: (date: string, period: EntryPeriod, id: string) => void;
}) {
  const [baseRecords, setBaseRecords] = useState(records);
  const [lastRecords, setLastRecords] = useState(records);
  const [defaultTimezone, setDefaultTimezone] = useState(systemMeasurementTimezone);
  const [automatic,setAutomatic] = useState(()=>Object.fromEntries((["daytime","evening"] as const).map(period=>[period,habitualMeasurementSource(records,sources,date,period)])) as Record<EntryPeriod,string>);
  const [draft, setDraft] = useState(() => {const value=makeDraft(records,date,choices,defaultTimezone);for(const period of ["daytime","evening"] as const)if(!measurementEntryState(records,date,choices).find(g=>g.period===period)?.observed)value[period].deviceLabel=automatic[period];return value;});
  const [selected,setSelected]=useState<EntryPeriod>(initialPeriod),[advanced,setAdvanced]=useState(new Set<EntryPeriod>()),[realEditing,setRealEditing]=useState(new Set<string>()),[errorTarget,setErrorTarget]=useState("");
  const [touchedSources,setTouchedSources]=useState(new Set<EntryPeriod>());
  const [working, setWorking] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [transitionPending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState("正在保存记录…");
  const busy = working || transitionPending;
  const lock = useRef(false);
  usePageLoading({ active: busy, label: busyLabel });
  const numberAcknowledgements=useRef(new Set<string>());
  const request = useRef({ signature: "", id: "" });
  const groups = measurementEntryState(records, date, choices).map(group => ({ ...group, blocked: group.period === "daytime" && !!group.observed && group.observed.fasting !== true }));
  const future=date>localMeasurementDate(new Date(),timezone||"Asia/Shanghai");
  const baseline = makeDraft(baseRecords, date, choices, defaultTimezone);
  const valuesChanged=(period:EntryPeriod)=>entryMetrics.some(field=>numericDraftValue(draft[period][field])!==numericDraftValue(baseline[period][field]));
  const periodDirty=(period:EntryPeriod)=>{
    const observed=groups.find(group=>group.period===period)?.observed;
    return valuesChanged(period)||(observed?draft[period].deviceLabel.trim()!==baseline[period].deviceLabel.trim():!!draft[period].deviceLabel.trim()&&draft[period].deviceLabel.trim()!==automatic[period])
      ||draft[period].timezone!==baseline[period].timezone;
  };
  const dirty=groups.some(group=>!group.pending&&!group.blocked&&(valuesChanged(group.period)||!!group.observed&&periodDirty(group.period)));
  const hasDraft=(["daytime","evening"] as const).some(periodDirty);
  const hasUnsavedValues=(["daytime","evening"] as const).some(valuesChanged);
  useDraftGuard(hasDraft,busy);
  // 新服务端快照只更新干净表单；草稿继续绑定开始编辑时的版本。
  if (records !== lastRecords) {
    setLastRecords(records);
    if (!hasDraft && !busy) { const timezone = systemMeasurementTimezone(); setDefaultTimezone(timezone); setBaseRecords(records); setDraft(previous=>{const next=makeDraft(records,date,choices,timezone);for(const period of ["daytime","evening"] as const)if(!measurementEntryState(records,date,choices).find(g=>g.period===period)?.observed)next[period].deviceLabel=previous[period].deviceLabel;return next;}); }
  }
  function setField<Field extends keyof Draft[EntryPeriod]>(period: EntryPeriod, field: Field, value: Draft[EntryPeriod][Field]) {
    if(field==="deviceLabel"&&value!==draft[period].deviceLabel)setTouchedSources(previous=>new Set([...previous,period]));
    setDraft(previous => ({ ...previous, [period]: { ...previous[period], [field]: value } })); setMessage(""); setError("");
  }
  function operationId(payload: unknown) {
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    return request.current.id;
  }
  function run(label: string, work: () => Promise<EntryResult>, ownKeys:string[]=[],resetPeriods:EntryPeriod[]=[],target="") {
    if (lock.current || busy) return;
    lock.current = true;
    setWorking(true); setBusyLabel(label); setError("");setErrorTarget(target); setMessage("");
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) { setError(result.error); return; }
        const timezone = systemMeasurementTimezone();
        acknowledgeRecordChanges(ownKeys,measurementVersions(result.records));onUpdated(result); setDefaultTimezone(timezone); setBaseRecords(result.records);if(resetPeriods.length){const fresh=makeDraft(result.records,date,choices,timezone);setDraft(previous=>({...previous,...Object.fromEntries(resetPeriods.map(period=>[period,fresh[period]]))}));setTouchedSources(previous=>new Set([...previous].filter(period=>!resetPeriods.includes(period))));} setMessage(target?"":result.message);
        request.current = { signature: "", id: "" };
      } catch (e) { setError(e instanceof Error?e.message:"网络连接未完成，请重试。已输入的数值仍保留。"); }
      finally { lock.current = false; setWorking(false); }
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const periods: SaveMeasurementDayInput["periods"] = {};
    for (const group of groups) {
      if (group.pending || group.blocked) continue;
      const change: PeriodEdit = {};
      for (const field of ["weightKg", "bodyFatPercent"] as const) if (numericDraftValue(draft[group.period][field]) !== numericDraftValue(baseline[group.period][field])) change[field] = draft[group.period][field].trim() || null;
      if (group.observed && draft[group.period].deviceLabel !== baseline[group.period].deviceLabel) change.deviceLabel = draft[group.period].deviceLabel.trim() || null;
      if (group.observed && draft[group.period].timezone !== baseline[group.period].timezone) change.timezone = draft[group.period].timezone || null;
      if (!Object.keys(change).length) continue;
      if (!group.observed) change.deviceLabel = draft[group.period].deviceLabel.trim() || null;
      // 用户保存空来源即确认留空；省略已有来源仍保留原值。
      if (change.deviceLabel === null) change.sourceUnspecifiedConfirmed = true;
      change.fasting = group.period === "daytime";
      const original = measurementEntryState(baseRecords, date, choices).find(item => item.period === group.period)!.observed;
      if (original) { change.recordId = original.id; change.version = original.updatedAt; }
      else change.timezone = draft[group.period].timezone || null;
      periods[group.period] = change;
    }
    if(!await confirmNumbers(groups.flatMap(group=>entryMetrics.map(metric=>({label:periodName(group.period)+metricName(metric),unit:metric==="weightKg"?"kg":"%",value:draft[group.period][metric],previous:baseline[group.period][metric]||records.filter(row=>row.period===group.period&&row.recordDate<=date&&row[metric]!=null).sort((a,b)=>b.recordDate.localeCompare(a.recordDate))[0]?.[metric]}))),numberAcknowledgements.current))return;
    const payload = { date, timezone, periods };
    run("正在保存记录…", async () => {
      const expected=Object.keys(periods).map(period=>{const row=measurementEntryState(baseRecords,date).find(group=>group.period===period)?.observed;return {key:`measurement:${date}:${period}:observed`,version:row?row.id+":"+row.updatedAt:null,summary:row?`体重 ${row.weightKg??"—"} kg · 体脂 ${row.bodyFatPercent??"—"}%`:undefined};});
      const latest=await verifyRecordVersions(expected);for(const period of Object.keys(periods) as EntryPeriod[]){const row=latest.get(`measurement:${date}:${period}:observed`);if(row){periods[period]!.recordId=row.id;periods[period]!.version=row.version.slice(row.id.length+1);}}
      const result=await actions.save({...payload,operationId:operationId(["save",payload])});if(result.ok)acknowledgeRecordChanges([...expected.map(row=>row.key),...Object.keys(periods).filter(period=>baseRecords.some(row=>row.recordDate===date&&row.period===period&&row.recordKind==="estimated")).map(period=>`measurement:${date}:${period}:estimated`)],measurementVersions(result.records));return result;
    },[],Object.keys(periods) as EntryPeriod[]);
  }
  async function removeSource(label:string){
    const result=await actions.removeSource(label);
    if(result.ok){
      setDraft(previous=>({...previous,...Object.fromEntries(groups.filter(group=>!group.observed&&!touchedSources.has(group.period)&&automatic[group.period]===label&&previous[group.period].deviceLabel===label).map(group=>[group.period,{...previous[group.period],deviceLabel:""}]))}));
      setAutomatic(previous=>Object.fromEntries(Object.entries(previous).map(([period,value])=>[period,value===label?"":value])) as Record<EntryPeriod,string>);
    }
    return result;
  }
  return <form data-editing={editing} data-entry-form="body" data-selected-period={selected} className={styles.entryForm} aria-label="当天四项录入" onSubmit={save} aria-busy={busy}>
    <div className={styles.entrySaveBar}><div><strong>{date}</strong>{error&&<p role="alert" className={styles.entryError}>{error}</p>}{message&&<p role="status" className={styles.entryHint}>{message}</p>}</div><button type="submit" className={styles.saveEntry} disabled={busy||!dirty||future}>{busy?busyLabel:"保存录入"}</button></div>
    <div className={styles.entryPeriodBar}><div role="group" aria-label="选择录入时段">{(["daytime","evening"] as const).map(period=><button type="button" key={period} aria-label={periodName(period)} aria-pressed={selected===period} onClick={()=>setSelected(period)}>{periodName(period)}{periodDirty(period)&&<span aria-label="有未保存修改"> ·</span>}</button>)}</div><small className={styles.periodCondition}>{selected==="daytime"?"空腹称重":"非空腹"}</small><button type="button" aria-expanded={advanced.has(selected)} onClick={()=>setAdvanced(previous=>{const next=new Set(previous);if(next.has(selected))next.delete(selected);else next.add(selected);return next;})}>更多设置</button></div>
    <div className={styles.entryGroups}>
      {groups.map(group=><fieldset key={group.period} data-period={group.period} data-selected={selected===group.period} disabled={busy||group.blocked}>
        <legend><span>{periodName(group.period)} · {group.blocked?"空腹条件未确认":group.period==="daytime"?"空腹":"非空腹"}</span><button type="button" aria-expanded={advanced.has(group.period)} onClick={()=>setAdvanced(previous=>{const next=new Set(previous);if(next.has(group.period))next.delete(group.period);else next.add(group.period);return next;})}>更多设置</button></legend>
        {group.pending?<label>选择已有实测<select aria-label={"录入"+periodName(group.period)+"候选记录"} value="" onChange={event=>onChoose(date,group.period,event.target.value)}><option value="">选择已有记录</option>{group.candidates.map(row=><option value={row.id} key={row.id}>{row.sourceLocalTime}</option>)}</select></label>:<>
          <div className={styles.bodyMetricFields}>{entryMetrics.map(metric=>{
            const cell=group.fields[metric],label=periodName(group.period)+metricName(metric),key=group.period+":"+metric,estimated=cell.kind==="estimated"&&!draft[group.period][metric]&&!realEditing.has(key),editable=!group.blocked&&!future;
            return <div className={styles.entryCell} key={metric} data-entry-cell={key} data-kind={cell.kind} data-estimated-wide={estimated&&formatRecordNumber(cell.value).length>5}>
              <label htmlFor={estimated?undefined:"entry-"+group.period+"-"+metric}>{metricName(metric)}{estimated?<span role="status">估计 · 已保存</span>:<small>{metric==="weightKg"?"kg":"%"}</small>}</label>
              {estimated?<div className={styles.estimatedCell}><strong>{formatRecordNumber(cell.value)} <small>{metric==="weightKg"?"kg":"%"}</small></strong>{editable&&<button type="button" aria-label="录入实测" title="录入实测" onClick={()=>{setRealEditing(previous=>new Set([...previous,key]));requestAnimationFrame(()=>document.getElementById("entry-"+group.period+"-"+metric)?.focus());}}>填实测</button>}</div>:<div className={styles.entryInputRow}>
                {editable?<DecimalInput id={"entry-"+group.period+"-"+metric} aria-label={label} min={0} placeholder="实测值" value={draft[group.period][metric]} onValue={value=>setField(group.period,metric,value)}/>:<span className={styles.entryRecorded}>{formatRecordNumber(cell.value)}</span>}
                {actions.deleteCell&&group.observed?.[metric]!=null&&<button type="button" className={styles.deleteCell} disabled={busy||hasDraft} aria-label={"删除"+label} onClick={async()=>{const original=group.observed!;if(await confirmAction({title:"删除"+label+"？",danger:true,confirmLabel:"删除"+metricName(metric),message:"删除 "+date+" "+label+" "+formatRecordNumber(original[metric])+"？其他指标保留。"}))run("正在删除这一项…",()=>actions.deleteCell!({recordId:original.id,version:original.updatedAt,metric,operationId:operationId(["delete",original.id,original.updatedAt,metric])}),["measurement:"+date+":"+group.period+":observed"],[group.period]);}}>×</button>}
                {cell.kind==="missing"&&editable&&<button type="button" className={styles.estimateAction} aria-label={"估算"+label} disabled={busy||hasUnsavedValues} onClick={()=>{const payload={date,period:group.period,metric};run("正在估算"+label+"…",()=>actions.estimate({...payload,operationId:operationId(["estimate",payload])}),["measurement:"+date+":"+group.period+":estimated"],[],key);}}>估算</button>}
              </div>}
              {!estimated&&editable&&cell.kind==="estimated"&&<small className={styles.entryReference}>原估计 {formatRecordNumber(cell.value)} · 填写真实读数</small>}
              {error&&errorTarget===key&&<small className={styles.entryError} role="status">{error}</small>}
            </div>;
          })}</div>
          <div className={styles.entrySource}><SourceInput hint={!group.observed&&automatic[group.period]&&draft[group.period].deviceLabel===automatic[group.period]&&!touchedSources.has(group.period)?"已沿用常用来源":undefined} label={periodName(group.period)+"数据来源"} value={draft[group.period].deviceLabel} sources={sources} onChange={value=>setField(group.period,"deviceLabel",value)} removeSource={removeSource} disabled={busy||group.blocked}/></div>
          {advanced.has(group.period)&&<div className={styles.entryTimezone}><label htmlFor={"entry-"+group.period+"-timezone"}>时区</label><select id={"entry-"+group.period+"-timezone"} aria-label={periodName(group.period)+"时区"} value={draft[group.period].timezone} onChange={event=>setField(group.period,"timezone",event.target.value)}><option value="">未指定</option>{draft[group.period].timezone&&!timezoneOptions.some(option=>option.value===draft[group.period].timezone)&&<option value={draft[group.period].timezone}>{timezoneLabel(draft[group.period].timezone,date,group.observed?.utcOffsetMinutes)}（保留原时区）</option>}{timezoneOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" onClick={()=>setField(group.period,"timezone",systemMeasurementTimezone())}>采用系统时区</button></div>}
          {group.blocked&&<p className={styles.entryCondition}>原记录的空腹条件未确认，保留只读。</p>}
        </>}
      </fieldset>)}
    </div>
    {future&&<p role="alert" className={styles.entryError}>不能录入未来日期的身体记录。</p>}
    {hasUnsavedValues&&<p className={styles.entryHint}>先保存实测，再估算剩余项。</p>}
  </form>;
}
