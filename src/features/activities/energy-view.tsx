"use client";
import { useSearchParams } from "next/navigation";
import {ChartPreparation} from "@/components/chart-preparation";
import {EnergyLegend} from '@/components/chart-legend';
import {EnergySourceStatus} from "../data-sources/energy-status";
import type {ConnectionView} from "../data-sources/model";
import {confirmAction} from "@/components/confirmation-state";
import {RecordWorkspace,RecordTrendPanel,CustomRecordRange} from "@/components/record-trend-panel";
import {useDraftGuard} from "@/components/draft-guard";
import {energyVersions,verifyRecordVersions,acknowledgeRecordChanges,RecordVersionError} from "@/components/record-change-client";
import {energySaveExpectations,applyEnergyVersions,energyDateMoveIssue,EnergySaveError} from "./energy-save-state";
import { useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useLocalToday } from "@/components/use-local-today";
import { useInitialMobileMode } from "@/components/use-mobile-mode";
import { preferredRecordedDate, rangeContaining, recentRecordDates } from "@/components/record-dates";
import {useChartDrag} from "@/components/use-chart-drag";
import { ChartSelectionColumn } from "@/components/chart-selection-marker";
import { useChartMotion } from "@/components/use-chart-motion";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { useNestedChartRange } from "@/components/use-nested-chart-range";
import { DailyRecords, DailyRecordRow, RecordRowAction } from "@/components/daily-records";
import type { SourceRemovalResult } from "@/components/source-input";
import { EditorDialog } from "../meals/meals-view";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import {useChartViewport} from "@/components/use-chart-viewport";
import { chartScale } from "@/components/chart-scale";
import type { EnergyPresentation } from "./presentation";
import type { Result } from "../meals/model";
import {activitySummary} from "./activity-summary";
import {Disclosure} from "@/components/disclosure";
import {confirmDraftDiscard} from "@/components/draft-guard";
import type {RecordIntent} from "@/components/record-intent";
import {useRepeatedRecordTask} from '@/components/record-intent-client';
import { EnergyEditor } from "./energy-editor";
import { energyRecordingMethod, blankEnergyDay, energySourceLabel, energyValue, type EnergyAction, type EnergyDay, type EnergyInput } from "./model";
import {shortRecordDate} from "@/components/record-dates";
import styles from "./energy.module.css";
import {EnergyComposition} from "./energy-composition";
import {loadEnergyStateAction} from "@/app/dashboard/energy/actions";
import type {TrendRoute} from '@/components/metric-trend-model';
import {EnergyPlotFrame} from "./energy-plot-frame";
import {MobileEnergyPlot} from './mobile-energy-plot';
import {EnergyPreferencesContext} from './energy-preferences';
import { LoadingLink } from "@/components/loading-link";


export type SaveEnergy = (input: EnergyInput) => Promise<Result<{ presentation: EnergyPresentation; message: string;changedKeys?:string[] }>>;
export function EstimateTodayAction({today,day,pending=false}:{today:string;day?:EnergyDay;pending?:boolean}){
  const text=day?.totalKcal!=null&&!day.cumulative?"查看今天的消耗":"估算今天的消耗";
  return <div className={styles.todayAction}>{pending||!today?<button type="button" disabled>{text}</button>:
    <LoadingLink returnScope="workspace" href={"/dashboard/energy?entry=1&date="+today+"&mode=estimate"}>{text}</LoadingLink>}</div>;
}
export function EnergySources({ day }: { day: EnergyDay }) {
  const rest = day.record?.restingSourceSystem ?? day.record?.sourceSystem;
  const active = day.activeSource === "activities" ? [...new Set(day.activities.map(row => row.sourceSystem).filter(Boolean))].join("、") : day.record?.activeSourceSystem ?? day.record?.sourceSystem;
  const sources = day.record?.calculationSnapshot ? day.record.calculationSnapshot.kind==="daily"?[]:[["活动",active]] : day.totalSource === "override" ? [["总消耗", day.record?.sourceSystem]] : [["静息", rest], ["活动", active]];
  const known=sources.filter(([,source])=>source),unique=[...new Set(known.map(([,source])=>energySourceLabel(source)))];
  const calculation=day.record?.calculationSnapshot;
  const labels=[calculation?"系统估算 · "+(calculation.method==="cunningham"?"体脂公式":"常规公式")+(calculation.factor?" ×"+calculation.factor:""):null,day.steps!=null?energyValue(day.steps)+" 步":null,...(unique.length===1?unique:known.map(([label,source])=>label+" · "+energySourceLabel(source))),day.record?.adoption?.mode==="manual"?"手动保留":null,day.additionalKcal!=null&&Number(day.additionalKcal)>0?"额外运动 "+energyValue(day.additionalKcal)+" 千卡":null].filter(Boolean);
  return labels.length?<div className={styles.sourceLine}>{labels.join(" · ")}</div>:null;
}
function dayEditInput(date:string,days:EnergyPresentation["snapshot"]["days"]):EnergyAction {
 const current=days.find(day=>day.date===date&&!day.deletedAt);
 return { kind: "save_energy_day", date, ...(current ? { id: current.id, version: current.version, steps:current.steps??null, entryMode: current.entryMode ?? undefined, activityMode: current.activityMode ?? undefined, restingSourceSystem: current.adoption?current.restingSourceSystem??null:current.restingSourceSystem ?? current.sourceSystem, activeSourceSystem: current.adoption?current.activeSourceSystem??null:current.activeSourceSystem ?? current.sourceSystem, restingEstimated: current.restingEstimated ?? false, restingKcal: current.restingKcal, activeKcal: current.activeKcal, activeEstimated: current.activeEstimated ?? false, notes: current.notes ?? null, totalKcal: current.totalKcal, timezone: current.timezone, sourceSystem: current.sourceSystem, sourceRecordId: current.sourceRecordId, sourceOccurredAt: current.sourceOccurredAt } : { entryMode: "components", activityMode: "total", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) };
}

export function EnergyView({ presentation, sourceStatus=null, save, removeSource, initialDate: requestedDate = null, initialEntry: requestedEntry=false,initialEstimate=false,initialTrend=null,initialIntent='view' }: { presentation: EnergyPresentation; sourceStatus?:ConnectionView|null; save: SaveEnergy; removeSource: (label: string) => Promise<SourceRemovalResult>; initialDate?: string | null;initialEntry?:boolean;initialEstimate?:boolean;initialTrend?:TrendRoute|null;initialIntent?:RecordIntent }) {
  const energyPreferences=useContext(EnergyPreferencesContext);
  const entry = useSearchParams().get("entry");
  const initialEntry = requestedEntry && entry === "1";
  const initialDate = requestedEntry && !initialEntry ? null : requestedDate;
  function rememberSavedPreferences(actions:EnergyAction[],saved:EnergyPresentation){
    const action=actions.findLast(action=>action.kind==="save_energy_day"&&(action.restingInputMethod!==undefined||action.calculation!=null));
    if(action?.kind!=="save_energy_day")return;
    const record=saved.snapshot.days.find(day=>day.date===action.date&&!day.deletedAt);
    if(record?.restingInputMethod)energyPreferences.update({restingMethod:energyRecordingMethod(record),formula:record.calculationSnapshot?.requestedMethod??energyPreferences.value.formula});
  }
  const today = useLocalToday(presentation.today), mobile = useInitialMobileMode();
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
  const [quickEstimate,setQuickEstimate]=useState(false);
  const latest = preferredRecordedDate(data.days, today, day => day.totalKcal !== null, day => !!day.record || day.activities.length > 0);
  const [editing, setEditing] = useState<EnergyAction | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, startTransition] = useTransition(), guard = useRef(false), request = useRef<{ content: string; actions:EnergyAction[]; id: string } | null>(null);
  const [mode, setMode] = useState<string | null>(initialTrend?'custom':null), [custom, setCustom] = useState({ from: initialTrend?.from??addCalendarDays(initialDate ?? today, -29), to: initialTrend?.to??initialDate ?? today });
  const [customOpen,setCustomOpen]=useState(false),[customDraft,setCustomDraft]=useState(custom);
  const end = initialDate ?? today, range = mode ?? rangeContaining(initialDate ?? latest, end, mobile ? "7" : "30");
  const earliest = [end, today, ...state.days.map(day => day.date), ...state.activities.map(row => row.date)].sort()[0];
  const from = range === "all" ? earliest : range === "custom" ? custom.from : addCalendarDays(end, 1 - Number(range)), to = range === "custom" ? custom.to : end;
  const dates = useMemo(() => { try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; return length > 0 && length <= 3661 ? Array.from({ length }, (_, index) => addCalendarDays(from, index)) : []; } catch { return []; } }, [from, to]);
  const chartDays = dates.map(date => byDate.get(date) ?? blankEnergyDay(date));
  const linkedPlot=!!initialTrend&&from===initialTrend.from&&to===initialTrend.to;
  const selection=useChartDateSelection(dates,initialDate??today,initialDate&&dates.includes(initialDate)?initialDate:dates.includes(today)?today:preferredRecordedDate(chartDays,today,day=>day.totalKcal!==null,day=>!!day.record||day.activities.length>0),customOpen,"",true),inspected=selection.selected,chosen=chartDays.find(day=>day.date===inspected);
  const {bindPlot, prepare: prepareRange}=useNestedChartRange({mode:range,from,to});
  useEffect(()=>{const latest=()=>{setEditing(null);setViewing(null);};window.addEventListener("formward-load-latest",latest);return()=>window.removeEventListener("formward-load-latest",latest);},[]);
  const historyDates=[...new Set([...recentRecordDates(today),...state.days.filter(d=>!d.deletedAt).map(d=>d.date),...state.activities.filter(a=>!a.deletedAt).map(a=>a.date)])].sort().reverse();

  function editDay(date: string, estimate = false) {
    const day=byDate.get(date);
    setError(""); setNotice("");
    if(estimate&&day?.totalKcal!=null&&!day.cumulative){setViewing(date);setEditing(null);setQuickEstimate(false);return;}
    const input=dayEditInput(date,state.days);
    setViewing(null);setQuickEstimate(estimate);
    setEditing(estimate&&input.kind==="save_energy_day"?{...input,entryMode:"total",activityMode:"total",restingInputMethod:"estimate",totalKcal:null,calculation:{kind:"daily",method:energyPreferences.value.formula}}:input);
  }
  useRepeatedRecordTask('/dashboard/energy',task=>{
    if(task.intent==='view'){setEditing(null);setViewing(task.date);}
    else editDay(task.date,initialEstimate);
  });
  const openedIntent=useRef("");
  useEffect(()=>{
    const key=initialDate+':'+initialIntent+':'+initialEntry;
    if(!initialDate||initialTrend||openedIntent.current===key)return;
    const timer=setTimeout(()=>{
      openedIntent.current=key;
      if(initialEntry||initialIntent==='edit')editDay(initialDate,initialEstimate);
      else{setEditing(null);setViewing(initialDate);}
    },0);
    return()=>clearTimeout(timer);
  // 新地址打开一次；数据刷新后保留表单中的活动量和日期。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initialDate,initialEntry,initialIntent,initialEstimate,initialTrend]);
  const savedClose=useRef<()=>Promise<void>>(()=>Promise.resolve());
  function execute(input: EnergyAction | EnergyAction[]) {
    const actions = Array.isArray(input) ? input : [input];
    if (guard.current) return; guard.current = true; setError(""); setNotice("");
    startTransition(async () => {
      try {
        const content=JSON.stringify(actions);
        // 响应中断时以原请求编号重试；已成功改期也不再按旧日期重复查询。
        if(request.current?.content!==content){
          const issue=energyDateMoveIssue(actions,state);if(issue)throw new EnergySaveError(issue);
          const latest=await verifyRecordVersions(energySaveExpectations(actions,state));
          request.current={content,actions:applyEnergyVersions(actions,state,latest),id:crypto.randomUUID()};
        }
        const result = await save({ operationId:request.current.id, actions:request.current.actions }); if (!result.ok) { request.current=null;setError(result.error); return; } acknowledgeRecordChanges(result.data.changedKeys??actions.map(action=>action.kind.includes("energy_day")?"energyDay:"+("date" in action?action.date:state.days.find(d=>d.id===action.id)?.date):"activity:"+(action.id??result.data.presentation.snapshot.activities.find(a=>!state.activities.some(old=>old.id===a.id)&&"name" in action&&a.name===action.name)?.id)),energyVersions(result.data.presentation.snapshot));rememberSavedPreferences(actions,result.data.presentation);setLocal(result.data.presentation); const changed = actions.find(action => "date" in action); if (changed && "date" in changed) selection.choose(changed.date); setNotice(result.data.message); void savedClose.current(); request.current = null; }
      catch (error) { setError(error instanceof RecordVersionError||error instanceof EnergySaveError?error.message:"保存未完成，当前输入已保留，请重试。"); }
      finally { guard.current = false; }
    });
  }
  async function removeRecord(action:EnergyAction,label:string){if(await confirmAction({title:"删除这条消耗记录？",message:"永久删除"+label+"？此操作无法恢复，其他记录保留。",confirmLabel:"确认删除",danger:true}))execute(action);}
  const summary=(date:string)=>{const day=byDate.get(date);return day?<>{energyValue(day.totalKcal)} 千卡 · 静息 {energyValue(day.restingKcal)} · 活动 {energyValue(day.activeKcal)}</>:"尚无记录";};
  const recentDates=[today];
  const renderDay=(date:string)=>{const day=byDate.get(date);return <DailyRecordRow key={date} date={date} today={today} value={summary(date)}><RecordRowAction intent="edit" disabled={busy} onClick={()=>editDay(date)}>{day?.record||day?.activities.length?"编辑":date<today?"补录":"录入"}</RecordRowAction><RecordRowAction intent="view" onClick={()=>setViewing(date)}>查看</RecordRowAction></DailyRecordRow>;};
  const details=(date:string)=>{const day=byDate.get(date)??blankEnergyDay(date);return <div className={styles.dayDetails} data-energy-day-detail><div className={styles.summary}>{([[day.cumulative?"今日累计":"总消耗",day.totalKcal],["静息",day.restingKcal],["活动",day.activeKcal]] as const).map(([label,value])=><div key={label}><span>{label}</span><strong>{energyValue(value)}<small>千卡</small></strong></div>)}</div><EnergySources day={day}/>{state.activities.filter(activity=>activity.date===date&&!activity.deletedAt).map(activity=>{
 const reading=activitySummary(activity,day.record);
 return <Disclosure key={activity.id} className={styles.activityDetail} summary={<div className={styles.activityOverview} data-exercise-summary>
  <div className={styles.activityHeading}><span>{activity.name}</span><strong>{energyValue(reading.totalKcal)}<small>千卡</small></strong></div>
  <div className={styles.activityFacts}>{reading.breakdown&&!(activity.sourceDetails&&activity.exerciseActiveKcal==null)&&<span>{reading.breakdown}</span>}<span data-exercise-status>{activity.sourceDetails?"运动明细，不额外累计":reading.status}</span></div>
 </div>}>
  <div className={styles.activityExplanation} data-exercise-explanation>
   {(activity.durationMinutes!==null||activity.sourceSystem)&&<p>{[activity.durationMinutes!==null?energyValue(activity.durationMinutes)+" 分钟":null,energySourceLabel(activity.sourceSystem)].filter(Boolean).join(" · ")}</p>}
   {activity.sourceDetails&&<p>{[activity.sourceDetails.localTime?"开始 "+activity.sourceDetails.localTime.replace("T"," "):null,activity.sourceDetails.distanceMeters!=null?"距离 "+energyValue(activity.sourceDetails.distanceMeters)+" m":null,activity.sourceDetails.averageHR!=null?"平均心率 "+energyValue(activity.sourceDetails.averageHR)+" 次／分钟":null,activity.sourceDetails.bmrKcal!=null?"期间静息 "+energyValue(activity.sourceDetails.bmrKcal)+" 千卡":null].filter(Boolean).join(" · ")}</p>}
   {!activity.sourceDetails&&<p data-exercise-effect>{reading.effect}</p>}
  </div>
 </Disclosure>;
})}</div>;};
  const recordDate=initialDate??today,recordDay=byDate.get(recordDate);
  return <RecordWorkspace title="消耗" className={styles.workspace} data-shared-route={initialTrend?true:undefined}>

    {error && !editing && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <section data-record-trend aria-label="消耗历史趋势" data-chart-selection={selection.regionId} data-selected-date={selection.selected} data-selection-origin={selection.origin} {...selection.regionProps}>
      <RecordTrendPanel presentation="energy" graphic={<EnergyComposition resting={chosen?.record?.adoption?.mode==="source"&&chosen.record.adoption.metadata?.compositionKnown===false?null:chosen?.restingKcal} active={chosen?.activeKcal}/>}
       range={<ChartRanges value={range} change={key=>{if(key==="custom"){setCustomDraft(custom);setCustomOpen(true);}else{prepareRange(key);setMode(key);setCustomOpen(false);}}}/>}
       custom={customOpen&&<CustomRecordRange label="消耗" value={customDraft} change={setCustomDraft} apply={()=>{setCustom(customDraft);setMode("custom");setCustomOpen(false);}} cancel={()=>setCustomOpen(false)}/>}
       date={inspected} view={()=>{const target=inspected;setViewing(target);selection.releasePreview();}} readoutLabel="选中日消耗"
       metrics={[
        {label:chosen?.cumulative?"今日累计":"总消耗",value:energyValue(chosen?.totalKcal),unit:"kcal",note:chosen?.totalKcal!=null?(chosen.record?.calculationSnapshot?"系统估算":energySourceLabel(chosen.record?.sourceSystem)??"手动录入"):undefined},
        {label:"静息",value:energyValue(chosen?.restingKcal),unit:"kcal",tone:"blue"},
        {label:"活动",value:energyValue(chosen?.activeKcal),unit:"kcal",tone:"red"}
       ]}
       metricVariants={chartDays.map(day=>[energyValue(day.totalKcal),energyValue(day.restingKcal),energyValue(day.activeKcal)])}
       title="每日消耗" unit="千卡"
       legend={<EnergyLegend/>}
       supplementary={<EstimateTodayAction today={today} day={byDate.get(today)}/>}
      >{dates.length?<div data-nested-chart ref={bindPlot}>{mobile||linkedPlot||dates.length<=31?<MobileEnergyPlot days={chartDays} selected={inspected} selection={selection} compact={dates.length<=31} linked={linkedPlot}/>:<EnergyPlot days={chartDays} selected={inspected} selection={selection}/>}</div>:<p className={styles.empty}>请选择有效日期范围，最长10年。</p>}</RecordTrendPanel>
    </section>
    <DailyRecords history={{today,dates:historyDates.filter(date=>!recentDates.includes(date)),renderRow:renderDay,view:setViewing}}>{recentDates.map(renderDay)}</DailyRecords>
    {data.sourcePilot&&<EnergySourceStatus initial={sourceStatus} steps={(!initialTrend&&mobile?recordDay:chosen)?.steps??null} protectedDay={(!initialTrend&&mobile?recordDay:chosen)?.record?.adoption?.mode==="manual"}/>}
    {(viewing||editing)&&<EditorDialog closeLabel={editing?'关闭编辑':'关闭详情'} routeEntry={!!(initialEntry&&(editing&&"date" in editing?editing.date:viewing)===initialDate)} title={editing?quickEstimate?'估算全天消耗':'每日消耗':viewing+' · 消耗记录'} titleParts={!editing&&viewing?[viewing,'消耗记录']:undefined} stableScroll={!editing} busy={busy} onSavedCloseReady={close=>{savedClose.current=close;}} close={()=>{setViewing(null);setEditing(null);setError('');}}>
      <div data-record-intent={editing?editing.id?'edit':'create':'view'}>
        {editing?<>
          <EnergyEditor refreshDevice={async()=>{const result=await loadEnergyStateAction();if(!result.ok)throw new Error(result.error);return {presentation:result.data,apply:()=>setLocal(result.data)};}} quickStart={quickEstimate} stepsEnabled={data.sourcePilot} dayRecords={state.days} initial={editing} error={error} busy={busy} save={execute} saveBatch={execute} sources={sources} removeSource={remove} activities={state.activities} management={editing.kind==='save_energy_day'&&state.days.some(day=>day.id===editing.id&&!day.deletedAt)&&<details className={styles.management}><summary>更多操作</summary><button type="button" disabled={busy} onClick={async()=>{if(await confirmDraftDiscard())await removeRecord({kind:'delete_energy_day',id:editing.id!,version:editing.version!},editing.date+' 消耗记录');}}>永久删除日记录</button></details>}/>
        </>:<>{error&&<p role="alert" className={styles.error}>{error}</p>}{viewing&&details(viewing)}</>}
      </div>
    </EditorDialog>}
  </RecordWorkspace>;
}

function EnergyPlot({ days, selected, selection }: { days: EnergyDay[]; selected: string; selection:ReturnType<typeof useChartDateSelection> }) {
  const container = useRef<HTMLDivElement>(null);
  const scale = chartScale(days.flatMap(day => [day.restingKcal == null && day.activeKcal == null ? null : Number(day.restingKcal ?? 0) + Number(day.activeKcal ?? 0), day.totalKcal]));
  const {width,left,height}=useChartViewport(container,scale.ticks,56);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.restingKcal}:${day.activeKcal}:${day.totalKcal}`).join("|") : "pending",days[0]?.date+":"+days.at(-1)?.date);
  const stride = Math.max(1, Math.ceil((days.length - 1) / (width < 440 ? 3 : 6)));

  const w = width || 280, right = 12, slot = (w - left - right) / days.length, maximum = scale.max;
  const drag=useChartDrag(days.map(day=>day.date),w,left,right,selection.choose);
  const top = 30, bottomInset = 34;
  const bottom = height ? height - bottomInset : w < 650 ? 164 : 220;
  const y = (value: number) => bottom - value / maximum * (bottom - top), barWidth = Math.min(30, slot * .65), x = (index: number) => left + (index + .5) * slot;
  const selectedIndex=days.findIndex(day=>day.date===selected),selectedX=selectedIndex<0?null:x(selectedIndex);
  return <EnergyPlotFrame frameRef={container}>
    <ChartPreparation active={!width} guideInsets={{ top, right, bottom: bottomInset, left }}/><svg {...drag} viewBox={`0 0 ${w} ${bottom + bottomInset}`} style={{ touchAction:"pan-y", visibility: width ? undefined : "hidden" }} role="group" aria-label="每日消耗柱状图">
    {scale.ticks.map(tick => <g key={tick}><line x1={left} x2={w - right} y1={y(tick)} y2={y(tick)} className={styles.grid} /><text x={left - 7} y={y(tick) + 4} textAnchor="end" className={styles.axis}>{tick}</text></g>)}
    <ChartSelectionColumn x={selectedX} date={selected} column={selectedX===null?null:{left:selectedX-slot/2,right:selectedX+slot/2}} plot={{left,right:w-right,top:22,bottom}} resetKey={`${w}:${days.map(d=>d.date).join("|")}`} direct={selection.direct} baselineTick/>
    {days.map((day, index) => { const resting = Number(day.restingKcal ?? 0), active = Number(day.activeKcal ?? 0), onlyTotal = day.restingKcal === null && day.activeKcal === null && day.totalKcal !== null; return <g key={day.date} role="button" tabIndex={day.date === selected ? 0 : -1} data-energy-date={day.date} data-selected={day.date===selected} aria-pressed={day.date===selected} aria-label={`${day.date} · 总消耗 ${day.totalKcal ?? "未填写"} 千卡`} data-chart-date={day.date} onMouseMove={()=>selection.preview(day.date)} onFocus={event=>selection.focus(event,day.date)} onClick={()=>selection.activate(day.date)} onKeyDown={event=>selection.keyDown(event,day.date)}>
      <rect className={styles.hit} x={left + index * slot} y="22" width={slot} height={bottom - 18} />
      {day.restingKcal !== null && <rect data-chart-bar data-range-mark={`bar:${day.date}:resting`} data-chart-zero={bottom} data-energy-series="resting" data-value={day.restingKcal} x={x(index) - barWidth / 2} y={y(resting)} width={barWidth} height={y(0) - y(resting)} fill="var(--data-protein)" opacity={day.restingBasis ? .55 : .9} className={styles.mark} />}
      {day.activeKcal !== null && <rect data-chart-bar data-range-mark={`bar:${day.date}:active`} data-chart-zero={bottom} data-energy-series="active" data-value={day.activeKcal} x={x(index) - barWidth / 2} y={y(resting + active)} width={barWidth} height={y(resting) - y(resting + active)} fill="var(--data-red)" className={styles.mark} />}
      {onlyTotal && <rect data-chart-bar data-range-mark={`bar:${day.date}:total-only`} data-chart-zero={bottom} data-energy-series="total-only" data-value={day.totalKcal!} x={x(index) - barWidth / 2} y={y(Number(day.totalKcal))} width={barWidth} height={y(0) - y(Number(day.totalKcal))} fill="var(--data-neutral)" className={styles.mark} />}
      {day.totalKcal!=null && Number(day.totalKcal)===0 && <line data-range-mark={"zero:"+day.date} x1={x(index)-4} x2={x(index)+4} y1={bottom} y2={bottom} stroke={day.restingKcal!=null?"var(--data-protein)":day.activeKcal!=null?"var(--data-red)":"var(--data-neutral)"} strokeWidth="2"/>}
      {day.totalSource === "override" && day.record?.adoption?.mode!=="source" && <line data-chart-bar data-chart-zero={bottom} data-range-mark={"total:"+day.date} data-energy-total={day.totalKcal!} x1={x(index) - barWidth / 2 - 2} x2={x(index) + barWidth / 2 + 2} y1={y(Number(day.totalKcal))} y2={y(Number(day.totalKcal))} stroke="var(--gold)" strokeWidth="2" className={styles.mark} />}
      {(index % stride === 0 && days.length - 1 - index >= stride / 2 || index === days.length - 1) && <text x={x(index)} y={bottom + 25} textAnchor={days.length === 1 ? "middle" : index === 0 ? "start" : index === days.length - 1 ? "end" : "middle"} className={styles.axis}>{days.length <= 7 && slot < 46 ? day.date.slice(8) : shortRecordDate(day.date)}</text>}
    </g>; })}
  </svg></EnergyPlotFrame>;
}
