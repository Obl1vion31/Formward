"use client";
import {TaskGuide,useGuideWorkflow} from "@/components/task-guide";
import {LocalLoading} from "@/components/local-loading";
import {InspectorCloseButton} from "@/components/inspector";
import {displayRecordDate} from "@/components/record-dates";
import type {Ref} from "react";
import {useBodyMetrics} from "./visibility";
import {numericDraftValue} from "@/components/form-draft";
import {habitualMeasurementSource} from "./source-habit";
import {DecimalInput} from "@/components/decimal-input";
import {confirmAction} from "@/components/confirmation-state";
import {formatRecordNumber} from "@/components/number-format";

import {confirmNumbers} from "@/components/number-change";
import {measurementVersions,verifyRecordVersions,acknowledgeRecordChanges} from "@/components/record-change-client";
import { useId, useRef, useState, useTransition } from "react";
import {useDraftGuard} from "@/components/draft-guard";

import { entryMetrics, entryPeriods, localMeasurementDate, measurementEntryState, type EntryPeriod, type EntryResult, type MeasurementActions, type MeasurementDisplay } from "./entry-state";
import type { PeriodEdit, SaveMeasurementDayInput } from "./editing";
import type { MeasurementMetric } from "./trend";
import { systemMeasurementTimezone, timezoneLabel, timezoneOptions } from "./timezone";
import glass from "@/components/glass-controls.module.css";
import { useSlidingSelection } from "@/components/sliding-selection";
import styles from "./measurements-view.module.css";

import { SourceInput } from "@/components/source-input";

type Draft = Record<EntryPeriod, { weightKg: string; bodyFatPercent: string; deviceLabel: string; timezone: string }>;
const periodName = (period: EntryPeriod) => period === "daytime" ? "晨间" : "晚间";
const savingLabel = "保存中…";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";
function makeDraft(records: MeasurementDisplay[], date: string, choices: Record<string, string>, defaultTimezone: string): Draft {
  return Object.fromEntries(measurementEntryState(records, date, choices).map(group => [group.period, {
    weightKg: group.observed?.weightKg ?? "", bodyFatPercent: group.observed?.bodyFatPercent ?? "", deviceLabel: group.observed?.deviceLabel ?? "",
    timezone: group.observed ? group.observed.timezone ?? "" : defaultTimezone,
  }])) as Draft;
}

export function MeasurementEntryHeader({date,editing=false,headingRef}:{date:string;editing?:boolean;headingRef?:Ref<HTMLHeadingElement>}){
 return <header className={styles.drawerHeader+" "+styles.entryHeading} data-editing>
  <h2 ref={headingRef} tabIndex={-1}>{editing?"编辑身体记录":"身体录入"}<time className={styles.entryHeadingDate} dateTime={date}>{displayRecordDate(date)}</time></h2>
  <InspectorCloseButton label="关闭记录详情"/>
 </header>;
}

export function MeasurementEntry({ date, timezone, records, sources, choices, actions, pending=false,onRetry,readError="", editing = false, initialPeriod = "daytime", onUpdated, onChoose, onSaved }: {
  date: string; timezone: string; records: MeasurementDisplay[]; sources: string[]; choices: Record<string, string>; actions: MeasurementActions;
  pending?:boolean;onRetry?:()=>void;readError?:string; editing?: boolean; initialPeriod?:EntryPeriod; onUpdated: (result: Extract<EntryResult, { ok: true }>) => void;
  onChoose: (date: string, period: EntryPeriod, id: string) => void;
  onSaved?: () => void;
}) {
  const visibleMetrics=useBodyMetrics(), draftNoteId=useId();
  const {finish:finishGuide}=useGuideWorkflow();
  const [periodTouched,setPeriodTouched]=useState(false);
  const [baseRecords, setBaseRecords] = useState(records);
  const [lastRecords, setLastRecords] = useState(records);
  const [defaultTimezone, setDefaultTimezone] = useState(systemMeasurementTimezone);
  const [automatic,setAutomatic] = useState(()=>Object.fromEntries((["daytime","evening"] as const).map(period=>[period,habitualMeasurementSource(records,sources,date,period)])) as Record<EntryPeriod,string>);
  const [draft, setDraft] = useState(() => {const value=makeDraft(records,date,choices,defaultTimezone);for(const period of ["daytime","evening"] as const)if(!measurementEntryState(records,date,choices).find(g=>g.period===period)?.observed)value[period].deviceLabel=automatic[period];return value;});
  const [selected,setSelected]=useState<EntryPeriod>(initialPeriod),[advanced,setAdvanced]=useState(new Set<EntryPeriod>()),[errorTarget,setErrorTarget]=useState("");
  const [touchedSources,setTouchedSources]=useState(new Set<EntryPeriod>());
  const [working, setWorking] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [transitionPending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState(savingLabel);
  const busy = working || transitionPending;
  const lock = useRef(false), checking = useRef(false);
  const rippleRef = useRef<HTMLSpanElement>(null);
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
  function run(label: string, work: () => Promise<EntryResult>, ownKeys:string[]=[],resetPeriods:EntryPeriod[]=[],target="", saving=false) {
    if (lock.current || busy) return;
    lock.current = true;
    setWorking(true); setBusyLabel(label); setError("");setErrorTarget(target); setMessage("");
    if (saving && rippleRef.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const ripple = rippleRef.current;
      ripple.getAnimations().forEach(animation => animation.cancel());
      ripple.animate([
        {opacity: .86, transform: "scale(.03,.65)"},
        {opacity: .7, transform: "scale(.72,1)", offset: .56},
        {opacity: 0, transform: "scale(1.25,1.2)"},
      ], {duration: 200, easing: "cubic-bezier(.16,.68,.36,1)"});
    }
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) { setError(result.error); return; }
        const timezone = systemMeasurementTimezone();
        acknowledgeRecordChanges(ownKeys,measurementVersions(result.records));onUpdated(result); setDefaultTimezone(timezone); setBaseRecords(result.records);if(resetPeriods.length){const fresh=makeDraft(result.records,date,choices,timezone);setDraft(previous=>({...previous,...Object.fromEntries(resetPeriods.map(period=>[period,fresh[period]]))}));setTouchedSources(previous=>new Set([...previous].filter(period=>!resetPeriods.includes(period))));} setMessage(target ? "" : saving && editing ? "已保存修改。" : result.message);
        request.current = { signature: "", id: "" };
        if (saving && !groups.some(group => !resetPeriods.includes(group.period) && periodDirty(group.period))) {finishGuide("body");onSaved?.();}
      } catch (error) {
        setError(error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "连接未完成，请重试。已输入的内容仍保留。");
      }
      finally { lock.current = false; setWorking(false); }
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || future || lock.current || checking.current || busy) return;
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
    checking.current = true;
    try {
      if(!await confirmNumbers(groups.flatMap(group=>entryMetrics.map(metric=>({label:periodName(group.period)+metricName(metric),unit:metric==="weightKg"?"kg":"%",value:draft[group.period][metric],previous:baseline[group.period][metric]||records.filter(row=>row.period===group.period&&row.recordDate<=date&&row[metric]!=null).sort((a,b)=>b.recordDate.localeCompare(a.recordDate))[0]?.[metric]}))),numberAcknowledgements.current))return;
    } finally {
      checking.current = false;
    }
    const payload = { date, timezone, periods };
    run(savingLabel, async () => {
      const expected=Object.keys(periods).map(period=>{const row=measurementEntryState(baseRecords,date).find(group=>group.period===period)?.observed;return {key:`measurement:${date}:${period}:observed`,version:row?row.id+":"+row.updatedAt:null,summary:row?`体重 ${row.weightKg??"—"} kg · 体脂 ${row.bodyFatPercent??"—"}%`:undefined};});
      const latest=await verifyRecordVersions(expected);for(const period of Object.keys(periods) as EntryPeriod[]){const row=latest.get(`measurement:${date}:${period}:observed`);if(row){periods[period]!.recordId=row.id;periods[period]!.version=row.version.slice(row.id.length+1);}}
      const result=await actions.save({...payload,operationId:operationId(["save",payload])});if(result.ok)acknowledgeRecordChanges(expected.map(row=>row.key),measurementVersions(result.records));return result;
    },[],Object.keys(periods) as EntryPeriod[],"",true);
  }
  async function removeSource(label:string){
    const result=await actions.removeSource(label);
    if(result.ok){
      setDraft(previous=>({...previous,...Object.fromEntries(groups.filter(group=>!group.observed&&!touchedSources.has(group.period)&&automatic[group.period]===label&&previous[group.period].deviceLabel===label).map(group=>[group.period,{...previous[group.period],deviceLabel:""}]))}));
      setAutomatic(previous=>Object.fromEntries(Object.entries(previous).map(([period,value])=>[period,value===label?"":value])) as Record<EntryPeriod,string>);
    }
    return result;
  }
  function selectPeriod(period:EntryPeriod){setSelected(period);setPeriodTouched(true);}
  const periodSlide = useSlidingSelection(entryPeriods.indexOf(selected), index => selectPeriod(entryPeriods[index]));
  return <form data-editing={editing} data-entry-form="body" data-selected-period={selected} className={styles.entryForm} aria-label="当天身体录入" onSubmit={event=>{if(pending)event.preventDefault();else void save(event);}} aria-busy={busy||pending&&!readError}>

    <div className={styles.entryPeriodBar} data-guide-flow>
      <div {...periodSlide} className={styles.entrySegments + " " + glass.track} role="group" aria-label="选择录入时段" data-guide-target="body-period">
        <span className={glass.selection} data-capsule-indicator aria-hidden="true"/>
        {entryPeriods.map((period, index) => {
        const group = groups.find(item => item.period === period)!;
        const unsaved = periodDirty(period);
        const note = group.pending ? "待选择" : group.blocked ? "待确认" : period === "daytime" ? "空腹" : "";
        const label = periodName(period)+(note ? "（"+note+"）" : "");
        return <button type="button" key={period} aria-label={label} aria-describedby={unsaved ? draftNoteId+"-"+period : undefined}
          data-capsule-choice={index} aria-pressed={selected===period} disabled={pending} onClick={()=>selectPeriod(period)}>
          <span>{periodName(period)}</span>{note && <small>{note}</small>}
          {unsaved && <><i className={styles.entryDraftDot} aria-hidden="true"/><span className="sr-only" id={draftNoteId+"-"+period}>有未保存修改</span></>}
        </button>;
      })}</div>
      <button type="button" className={styles.entrySettings} aria-expanded={advanced.has(selected)} disabled={pending}
        onClick={()=>setAdvanced(previous=>{const next=new Set(previous);if(next.has(selected))next.delete(selected);else next.add(selected);return next;})}>更多设置</button>
      {!pending&&!future&&<TaskGuide task="body" video="body" auto={!editing&&!busy} steps={[
        {target:"body-save",text:"核对时段和值，点「"+(editing?"保存修改":"保存录入")+"」。"},
        ...(!periodTouched?[{target:"body-period",text:"按称重时段选。晨间填空腹实测，晚间可记非空腹值。"}]:[]),
        {target:"body-weight-input",text:"填实际称得的体重。体脂率没测可以留空。"},
        {target:"body-period",text:"选择要查看或记录的称重时段。"},
      ]}/>}
    </div>
    <div className={styles.entryGroups}>
      {groups.map(group=><fieldset key={group.period} data-period={group.period} data-selected={selected===group.period} disabled={busy||pending||group.blocked}>
        <legend><span>{periodName(group.period)} · {group.blocked?"空腹条件未确认":group.period==="daytime"?"空腹":"非空腹"}</span><button type="button" aria-expanded={advanced.has(group.period)} onClick={()=>setAdvanced(previous=>{const next=new Set(previous);if(next.has(group.period))next.delete(group.period);else next.add(group.period);return next;})}>更多设置</button></legend>
        {group.pending?<label>选择已有实测<select aria-label={"录入"+periodName(group.period)+"候选记录"} value="" onChange={event=>onChoose(date,group.period,event.target.value)}><option value="">选择已有记录</option>{group.candidates.map(row=><option value={row.id} key={row.id}>{row.sourceLocalTime}</option>)}</select></label>:<>
          <div className={styles.entryFields} data-guide-flow data-paired={visibleMetrics.length > 1}>
            <div className={styles.bodyMetricFields}>{visibleMetrics.map(metric=>{
              const cell=group.fields[metric],label=periodName(group.period)+metricName(metric),key=group.period+":"+metric,editable=!group.blocked&&!future;
              const fieldId = "entry-" + group.period + "-" + metric;
              const fieldError = errorTarget === key ? error : "";
              return <div className={styles.entryCell} key={metric} data-entry-cell={key} data-kind={cell.kind}>
                <label htmlFor={editable ? fieldId : undefined}>{metricName(metric)}</label>
                <div className={styles.entryInputRow}>
                  {editable ? <span className={styles.entryNumber} data-entry-field-surface="compact">
                    <DecimalInput data-guide-target={metric==="weightKg"&&selected===group.period?"body-weight-input":undefined} data-input-appearance="compact" id={fieldId} aria-label={label} min={0} placeholder="实测值"
                      aria-invalid={!!fieldError || undefined} aria-describedby={fieldError ? fieldId + "-error" : undefined}
                      value={draft[group.period][metric]} onValue={value => setField(group.period, metric, value)}/>
                  </span> : <span className={styles.entryRecorded}>{formatRecordNumber(cell.value)}</span>}
                  <small>{metric==="weightKg"?"kg":"%"}</small>
                </div>
                {fieldError && <small className={styles.entryError} role="status" id={fieldId + "-error"}>{fieldError}</small>}
              </div>;
            })}</div>
            <SourceInput compactLabel="来源" label={periodName(group.period)+"数据来源"} value={draft[group.period].deviceLabel} sources={sources} onChange={value=>setField(group.period,"deviceLabel",value)} removeSource={removeSource} disabled={busy||pending||group.blocked}/>
          </div>
          {advanced.has(group.period)&&<div className={styles.entryTimezone}><div className={styles.entryDeleteActions}>{visibleMetrics.map(metric=>actions.deleteCell&&group.observed?.[metric]!=null&&<button type="button" key={metric} className={styles.deleteCell} disabled={busy||hasDraft} aria-label={"删除"+(periodName(group.period)+metricName(metric))} onClick={async()=>{const original=group.observed!;if(await confirmAction({title:"删除"+(periodName(group.period)+metricName(metric))+"？",danger:true,confirmLabel:"删除"+metricName(metric),message:"删除 "+date+" "+(periodName(group.period)+metricName(metric))+" "+formatRecordNumber(original[metric])+"？其他指标保留。"}))run("正在删除这一项…",()=>actions.deleteCell!({recordId:original.id,version:original.updatedAt,metric,operationId:operationId(["delete",original.id,original.updatedAt,metric])}),["measurement:"+date+":"+group.period+":observed"],[group.period]);}}>删除{periodName(group.period)}{metricName(metric)}</button>)}</div><label htmlFor={"entry-"+group.period+"-timezone"}>时区</label><select id={"entry-"+group.period+"-timezone"} aria-label={periodName(group.period)+"时区"} value={draft[group.period].timezone} onChange={event=>setField(group.period,"timezone",event.target.value)}><option value="">未指定</option>{draft[group.period].timezone&&!timezoneOptions.some(option=>option.value===draft[group.period].timezone)&&<option value={draft[group.period].timezone}>{timezoneLabel(draft[group.period].timezone,date,group.observed?.utcOffsetMinutes)}（保留原时区）</option>}{timezoneOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" onClick={()=>setField(group.period,"timezone",systemMeasurementTimezone())}>采用系统时区</button></div>}
          {group.blocked&&<p className={styles.entryCondition}>原记录的空腹条件未确认，保留只读。</p>}
        </>}
      </fieldset>)}
    </div>
    {future&&<p role="alert" className={styles.entryError}>不能录入未来日期的身体记录。</p>}
    <div className={styles.entryFooter} data-entry-footer><div>{(error||readError)&&<p role="alert" className={styles.entryError}>{error||readError}</p>}{pending&&!readError?<LocalLoading/>:message&&<p role="status" className={styles.entryHint}>{message}</p>}</div><button data-entry-primary-action data-guide-target={onRetry?undefined:"body-save"} data-saving={busy && busyLabel === savingLabel || undefined} type={onRetry?"button":"submit"} onClick={onRetry} className={styles.saveEntry} disabled={onRetry?false:busy||pending||!dirty||future}>
      <span className={styles.saveRipple} ref={rippleRef} aria-hidden="true"/>
      <span>{onRetry?"重新读取":busy?busyLabel:editing?"保存修改":"保存录入"}</span>
    </button></div>
  </form>;
}
