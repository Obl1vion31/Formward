"use client";
import {confirmAction} from "@/components/confirmation-state";
import {RecordWorkspace,RecordTrendPanel,CustomRecordRange} from "@/components/record-trend-panel";
import {useDraftGuard} from "@/components/draft-guard";
import {energyVersions,verifyRecordVersions,acknowledgeRecordChanges} from "@/components/record-change-client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePageLoading } from "@/components/page-loading-state";
import { useLocalToday } from "@/components/use-local-today";
import { useMobileMode } from "@/components/use-mobile-mode";
import { preferredRecordedDate, rangeContaining, recentRecordDates, pendingRecordDates } from "@/components/record-dates";
import {useChartDrag} from "@/components/use-chart-drag";
import { useChartMotion } from "@/components/use-chart-motion";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { DailyRecords,DailyRecordRow } from "@/components/daily-records";
import { RecordHistory } from "@/components/record-history";
import type { SourceRemovalResult } from "@/components/source-input";
import { EditorDialog } from "../meals/meals-view";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import {useChartViewport} from "@/components/use-chart-viewport";
import { chartScale } from "@/components/chart-scale";
import type { EnergyPresentation } from "./presentation";
import type { Result } from "../meals/model";
import {activitySummary} from "./activity-summary";
import { EnergyEditor } from "./energy-editor";
import { blankEnergyDay, energyValue, type EnergyAction, type EnergyDay, type EnergyInput } from "./model";
import styles from "./energy.module.css";

export type SaveEnergy = (input: EnergyInput) => Promise<Result<{ presentation: EnergyPresentation; message: string;changedKeys?:string[] }>>;
export function EnergySources({ day }: { day: EnergyDay }) {
  const rest = day.record?.restingSourceSystem ?? day.record?.sourceSystem;
  const active = day.activeSource === "activities" ? [...new Set(day.activities.map(row => row.sourceSystem).filter(Boolean))].join("、") : day.record?.activeSourceSystem ?? day.record?.sourceSystem;
  const sources = day.totalSource === "override" ? [["总消耗", day.record?.sourceSystem]] : [["静息", rest], ["活动", active]];
  return <div className={styles.sourceLine}>{day.additionalKcal!=null&&Number(day.additionalKcal)>0&&<span>额外运动 · {energyValue(day.additionalKcal)} kcal</span>}{sources.filter(([, source]) => source).map(([label, source]) => <span key={label}>{label} · {source}</span>)}</div>;
}
export function EnergyView({ presentation, save, removeSource, initialDate = null }: { presentation: EnergyPresentation; save: SaveEnergy; removeSource: (label: string) => Promise<SourceRemovalResult>; initialDate?: string | null }) {
  const today = useLocalToday(presentation.today), mobile = useMobileMode();
  const router = useRouter();
  useEffect(() => { if (today !== presentation.today) router.refresh(); }, [today, presentation.today, router]);
  const [local, setLocal] = useState<EnergyPresentation | null>(null), [base, setBase] = useState(presentation);
  if (base !== presentation) { setBase(presentation); setLocal(null); }
  const data = local ?? presentation, state = data.snapshot;
  useDraftGuard(false,false,energyVersions(state));
  const [sourceResult, setSourceResult] = useState<{ base: string[]; sources: string[] } | null>(null);
  const sources = sourceResult?.base === data.sources ? sourceResult.sources : data.sources;
  async function remove(label: string) { const result = await removeSource(label); if (result.ok) setSourceResult({ base: data.sources, sources: result.sources }); return result; }
  const byDate = new Map(data.days.map(day => [day.date, day]));
  const [viewing,setViewing]=useState<string|null>(null);
  const latest = preferredRecordedDate(data.days, today, day => day.totalKcal !== null, day => !!day.record || day.activities.length > 0);
  const [editing, setEditing] = useState<EnergyAction | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, startTransition] = useTransition(), guard = useRef(false), request = useRef<{ content: string; id: string } | null>(null);
  const [mode, setMode] = useState<string | null>(null), [custom, setCustom] = useState({ from: addCalendarDays(initialDate ?? today, -29), to: initialDate ?? today });
  const [customOpen,setCustomOpen]=useState(false),[customDraft,setCustomDraft]=useState(custom);
  const end = initialDate ?? today, range = mode ?? rangeContaining(initialDate ?? latest, end, mobile ? "7" : "30");
  const earliest = [end, today, ...state.days.map(day => day.date), ...state.activities.map(row => row.date)].sort()[0];
  const from = range === "all" ? earliest : range === "custom" ? custom.from : addCalendarDays(end, 1 - Number(range)), to = range === "custom" ? custom.to : end;
  const dates = useMemo(() => { try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; return length > 0 && length <= 3661 ? Array.from({ length }, (_, index) => addCalendarDays(from, index)) : []; } catch { return []; } }, [from, to]);
  const chartDays = dates.map(date => byDate.get(date) ?? blankEnergyDay(date));
  const selection=useChartDateSelection(dates,initialDate??latest,preferredRecordedDate(chartDays,today,day=>day.totalKcal!==null,day=>!!day.record||day.activities.length>0),customOpen),inspected=selection.selected,chosen=chartDays.find(day=>day.date===inspected);
  useEffect(()=>{const latest=()=>{setEditing(null);setViewing(null);};window.addEventListener("formward-load-latest",latest);return()=>window.removeEventListener("formward-load-latest",latest);},[]);
  const historyDates=[...new Set([...recentRecordDates(today),...state.days.filter(d=>!d.deletedAt).map(d=>d.date),...state.activities.filter(a=>!a.deletedAt).map(a=>a.date)])].sort().reverse();
  usePageLoading({ active: busy, label: "正在保存消耗记录…" });
  function edit(action: EnergyAction) { setError(""); setNotice(""); setEditing(action); }
  function editDay(date: string, _details = false) {
    void _details;
    const current = state.days.find(day => day.date === date && !day.deletedAt);
    edit({ kind: "save_energy_day", date, ...(current ? { id: current.id, version: current.version, entryMode: current.entryMode ?? undefined, activityMode: current.activityMode ?? undefined, restingSourceSystem: current.restingSourceSystem ?? current.sourceSystem, activeSourceSystem: current.activeSourceSystem ?? current.sourceSystem, restingEstimated: current.restingEstimated ?? false, restingKcal: current.restingKcal, activeKcal: current.activeKcal, activeEstimated: current.activeEstimated ?? false, notes: current.notes ?? null, totalKcal: current.totalKcal, timezone: current.timezone, sourceSystem: current.sourceSystem, sourceRecordId: current.sourceRecordId, sourceOccurredAt: current.sourceOccurredAt } : { entryMode: "components", activityMode: "activities", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  }
  function execute(input: EnergyAction | EnergyAction[]) {
    const actions = Array.isArray(input) ? input : [input];
    if (guard.current) return; guard.current = true; setError(""); setNotice("");
    startTransition(async () => {
      try { const expected=actions.flatMap(action=>(action.kind==="save_energy_day"||action.id&&action.version)?[{key:action.kind.includes("energy_day")?"energyDay:"+("date" in action?action.date:state.days.find(d=>d.id===action.id)?.date):"activity:"+action.id,version:action.version?String(action.version):null}]:[]);
        const latest=await verifyRecordVersions(expected);const current=actions.map(action=>{const stamp=latest.get(action.kind.includes("energy_day")?"energyDay:"+("date" in action?action.date:state.days.find(d=>d.id===action.id)?.date):"activity:"+action.id);return stamp?{...action,id:stamp.id,version:Number(stamp.version)}:action;});
        const content=JSON.stringify(current);if(request.current?.content!==content)request.current={content,id:crypto.randomUUID()};
        const result = await save({ operationId:request.current.id, actions:current }); if (!result.ok) { setError(result.error); return; } acknowledgeRecordChanges(result.data.changedKeys??actions.map(action=>action.kind.includes("energy_day")?"energyDay:"+("date" in action?action.date:state.days.find(d=>d.id===action.id)?.date):"activity:"+(action.id??result.data.presentation.snapshot.activities.find(a=>!state.activities.some(old=>old.id===a.id)&&"name" in action&&a.name===action.name)?.id)),energyVersions(result.data.presentation.snapshot));setLocal(result.data.presentation); const changed = actions.find(action => "date" in action); if (changed && "date" in changed) selection.choose(changed.date); setNotice(result.data.message); setEditing(null); request.current = null; }
      catch { setError("保存未完成，当前输入已保留，请重试。"); }
      finally { guard.current = false; }
    });
  }
  function activityEdit(activity:EnergyDay["activities"][number]){const {deletedAt,syncStatus,inclusionBasis,...fields}=activity;void deletedAt;void syncStatus;void inclusionBasis;edit({kind:"save_activity",...fields,calorieMode:fields.calorieMode??undefined});}
  async function removeRecord(action:EnergyAction,label:string){if(await confirmAction({title:"删除这条消耗记录？",message:"永久删除"+label+"？此操作无法恢复，其他记录保留。",confirmLabel:"确认删除",danger:true}))execute(action);}
  const summary=(date:string)=>{const day=byDate.get(date);return day?<>{energyValue(day.totalKcal)} kcal · 静息 {energyValue(day.restingKcal)} · 活动 {energyValue(day.activeKcal)}</>:"尚无记录";};
  const recentDates=pendingRecordDates(today,date=>byDate.get(date)?.totalKcal==null);
  const renderDay=(date:string)=>{const day=byDate.get(date);return <DailyRecordRow key={date} date={date} today={today} value={summary(date)}><button disabled={busy} onClick={()=>editDay(date)}>{day?.record?"编辑":date<today?"补录":"录入"}</button><button onClick={()=>setViewing(date)}>查看</button></DailyRecordRow>;};
  const details=(date:string)=>{const day=byDate.get(date)??blankEnergyDay(date);return <><h3>{date.replaceAll("-",".")}</h3><div className={styles.summary}>{([["总消耗",day.totalKcal],["静息",day.restingKcal],["活动",day.activeKcal]] as const).map(([label,value])=><div key={label}><span>{label}</span><strong>{energyValue(value)}<small>kcal</small></strong></div>)}</div><EnergySources day={day}/><div className={styles.actions}><button onClick={()=>editDay(date)}>{day.record?"编辑":date<today?"补录":"录入"}</button><button onClick={()=>editDay(date,true)}>添加活动</button></div>{state.activities.filter(activity=>activity.date===date&&!activity.deletedAt).map(activity=>{const reading=activitySummary(activity,day.record);return <article key={activity.id} className={styles.row}><div><h3>{activity.name}</h3><p>{activity.durationMinutes!==null?energyValue(activity.durationMinutes)+" 分钟 · ":""}{activity.sourceSystem}</p>{reading.breakdown&&<p>{reading.breakdown}</p>}<p className={styles.inclusionStatus} data-exercise-effect>{reading.effect}</p></div><strong>{energyValue(reading.totalKcal)}<small>kcal</small></strong><div className={styles.actions}><button onClick={()=>activityEdit(activity)}>编辑活动</button><button disabled={busy} onClick={()=>removeRecord({kind:"delete_activity",id:activity.id,version:activity.version},activity.name)}>删除活动</button></div></article>;})}{day.record&&<details className={styles.details}><summary>更多操作</summary><button disabled={busy} onClick={()=>removeRecord({kind:"delete_energy_day",id:day.record!.id,version:day.record!.version},date+" 消耗记录")}>永久删除日记录</button></details>}</>;};
  return <RecordWorkspace title="消耗" className={styles.workspace}>
    {error && !editing && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <section aria-label="消耗历史趋势" data-chart-selection={selection.regionId} data-selected-date={selection.selected} data-pinned-date={selection.pinned??undefined}>
      <RecordTrendPanel
       range={<ChartRanges value={range} change={key=>{if(key==="custom"){setCustomDraft(custom);setCustomOpen(true);}else{setMode(key);setCustomOpen(false);}}}/>}
       custom={customOpen&&<CustomRecordRange label="消耗" value={customDraft} change={setCustomDraft} apply={()=>{setCustom(customDraft);setMode("custom");setCustomOpen(false);}} cancel={()=>setCustomOpen(false)}/>}
       date={inspected} view={()=>{selection.release();setViewing(inspected);}} readoutLabel="选中日消耗"
       metrics={[
        {label:"总消耗",value:energyValue(chosen?.totalKcal),unit:"kcal"},
        {label:"静息",value:energyValue(chosen?.restingKcal),unit:"kcal",tone:"blue"},
        {label:"活动",value:energyValue(chosen?.activeKcal),unit:"kcal",tone:"red"}
       ]}
       title="每日消耗"
       legend={<><span><i style={{background:"#6C96B3"}}/>静息</span><span><i style={{background:"#C07B77"}}/>活动</span><span><i style={{background:"#9EAAA9"}}/>录入总数</span></>}
      >{dates.length?<EnergyPlot days={chartDays} selected={inspected} selection={selection}/>:<p className={styles.empty}>请选择有效日期范围，最长10年。</p>}</RecordTrendPanel>
    </section>
    <DailyRecords history={<RecordHistory today={today} dates={historyDates.filter(date=>!recentDates.includes(date))} renderRow={renderDay} view={setViewing}/>}>{recentDates.map(renderDay)}</DailyRecords>
    {viewing&&<EditorDialog title={viewing+" · 消耗记录"} busy={busy} close={()=>setViewing(null)}>{error&&<p role="alert" className={styles.error}>{error}</p>}{details(viewing)}</EditorDialog>}
    {editing && <EditorDialog title={editing.kind === "save_energy_profile" ? "公式资料" : editing.kind === "save_activity" ? "活动记录" : "每日消耗"} busy={busy} close={() => { if (!busy) { setEditing(null); setError(""); } }}><EnergyEditor dayRecords={state.days} initial={editing} error={error} busy={busy} save={execute} saveBatch={execute} sources={sources} removeSource={remove} activities={state.activities} /></EditorDialog>}
  </RecordWorkspace>;
}

function EnergyPlot({ days, selected, selection }: { days: EnergyDay[]; selected: string; selection:ReturnType<typeof useChartDateSelection> }) {
  const container = useRef<HTMLDivElement>(null);
  const scale = chartScale(days.flatMap(day => [day.restingKcal == null && day.activeKcal == null ? null : Number(day.restingKcal ?? 0) + Number(day.activeKcal ?? 0), day.totalKcal]));
  const {width,left}=useChartViewport(container,scale.ticks,56);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.restingKcal}:${day.activeKcal}:${day.totalKcal}`).join("|") : "pending");
  const stride = Math.max(1, Math.ceil((days.length - 1) / (width < 440 ? 3 : 6)));

  const w = width || 280, right = 12, slot = (w - left - right) / days.length, maximum = scale.max;
  const drag=useChartDrag(days.map(day=>day.date),w,left,right,selection.pin);
  const bottom = w < 650 ? 164 : 220;
  const y = (value: number) => bottom - value / maximum * (bottom - 30), barWidth = Math.min(30, slot * .65), x = (index: number) => left + (index + .5) * slot;
  return <div className={styles.plot} ref={container} onMouseLeave={selection.leave}><svg {...drag} viewBox={`0 0 ${w} ${bottom + 34}`} style={{ touchAction:"pan-y", visibility: width ? undefined : "hidden" }} role="group" aria-label="每日消耗柱状图">
    {scale.ticks.map(tick => <g key={tick}><line x1={left} x2={w - right} y1={y(tick)} y2={y(tick)} className={styles.grid} /><text x={left - 7} y={y(tick) + 4} textAnchor="end" className={styles.axis}>{tick}</text></g>)}<text x={left - 7} y="15" textAnchor="end" className={styles.axis}>kcal</text>
    {days.map((day, index) => { const resting = Number(day.restingKcal ?? 0), active = Number(day.activeKcal ?? 0), onlyTotal = day.restingKcal === null && day.activeKcal === null && day.totalKcal !== null; return <g key={day.date} role="button" tabIndex={day.date === selected ? 0 : -1} data-energy-date={day.date} aria-label={`${day.date} · 总消耗 ${day.totalKcal ?? "未填写"} kcal`} data-chart-date={day.date} onMouseMove={()=>selection.preview(day.date)} onFocus={()=>selection.choose(day.date)} onClick={()=>selection.pin(day.date)} onKeyDown={event=>selection.keyDown(event,day.date)}>
      <rect className={styles.hit} x={left + index * slot} y="22" width={slot} height={bottom - 18} />
      {day.restingKcal !== null && <rect data-chart-bar data-chart-zero={bottom} data-energy-series="resting" data-value={day.restingKcal} x={x(index) - barWidth / 2} y={y(resting)} width={barWidth} height={y(0) - y(resting)} fill="#6C96B3" opacity={day.restingBasis ? .55 : .9} className={styles.mark} />}
      {day.activeKcal !== null && <rect data-chart-bar data-chart-zero={bottom} data-energy-series="active" data-value={day.activeKcal} x={x(index) - barWidth / 2} y={y(resting + active)} width={barWidth} height={y(resting) - y(resting + active)} fill="#C07B77" className={styles.mark} />}
      {onlyTotal && <rect data-chart-bar data-chart-zero={bottom} data-energy-series="total-only" data-value={day.totalKcal!} x={x(index) - barWidth / 2} y={y(Number(day.totalKcal))} width={barWidth} height={y(0) - y(Number(day.totalKcal))} fill="#9EAAA9" className={styles.mark} />}
      {day.totalSource === "override" && <line data-energy-total={day.totalKcal!} x1={x(index) - barWidth / 2 - 2} x2={x(index) + barWidth / 2 + 2} y1={y(Number(day.totalKcal))} y2={y(Number(day.totalKcal))} stroke="#BEA478" strokeWidth="2" className={styles.mark} />}
      {(index % stride === 0 && days.length - 1 - index >= stride / 2 || index === days.length - 1) && <text x={x(index)} y={bottom + 25} textAnchor={days.length === 1 ? "middle" : index === 0 ? "start" : index === days.length - 1 ? "end" : "middle"} className={styles.axis}>{days.length <= 7 && slot < 46 ? day.date.slice(8) : day.date.slice(5)}</text>}
    </g>; })}
    <line x1={x(days.findIndex(day => day.date === selected))} x2={x(days.findIndex(day => day.date === selected))} y1="22" y2={bottom + 5} className={styles.crosshair} />
  </svg></div>;
}
