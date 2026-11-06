"use client";
import {useDraftGuard} from "@/components/draft-guard";
import type {RecordIntent} from "@/components/record-intent";
import {useRepeatedRecordTask} from '@/components/record-intent-client';
import {measurementVersions} from "@/components/record-change-client";
import {RecordWorkspace,RecordTrendPanel,ChartOptions,CustomRecordRange,type RecordMetric} from "@/components/record-trend-panel";
import {formatRecordNumber} from "@/components/number-format";
import { ChartSelectionColumn, ChartSelectionPoint } from "@/components/chart-selection-marker";
import {useChartDrag} from "@/components/use-chart-drag";
import { useChartMotion } from "@/components/use-chart-motion";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { DailyRecords,DailyRecordRow } from "@/components/daily-records";
import { RecordHistory } from "@/components/record-history";
import { Inspector,InspectorCloseButton } from "@/components/inspector";

import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { buildMeasurementDays, recentMeasurementDays } from "./days";
import { addCalendarDays, measurementCalendarPage, measurementCalendarRange } from "./calendar";
import type {AccountPreferences} from "@/features/auth/preferences";
import {useBodyPreferences} from "./preferences-control";
import {BodyFatContext,useBodyMetrics} from "./visibility";
import { measurementSummaryAt,preferredMorningDate } from "./summary";
import { calendarOrdinal, measurementDateTicks, measurementRange, measurementTrend, normalScale, type MeasurementInterval, type MeasurementMetric, type MeasurementRange } from "./trend";
import styles from "./measurements-view.module.css";
import { estimateModeLabel, estimateUserExplanation } from "./estimate-explanation";
import { localMeasurementDate, measurementDayAction, measurementNeedsEntry, type EntryResult, type MeasurementActions, type MeasurementDateDisplay, type MeasurementDisplay } from "./entry-state";
import { MeasurementEntry } from "./measurement-entry";
import { timezoneLabel } from "./timezone";
import { useMobileMode } from "@/components/use-mobile-mode";
import type { TrendRoute } from "@/components/metric-trend-model";
import {useChartTransition} from '@/components/chart-transition-state';
import {TrendGlyph} from "@/components/trend-glyph";
import {metricTrendModel} from "@/components/metric-trend-model";
import { MorningWeightPlot } from "./morning-weight-plot";
export type { MeasurementDisplay } from "./entry-state";

type MeasurementDay = ReturnType<typeof buildMeasurementDays<MeasurementDisplay>>[number];
type DrawerView = { kind: "entry"; date: string; editing?: boolean; period?:"daytime"|"evening" } | { kind: "day"; date: string; period?: "daytime" | "evening"; metric: MeasurementMetric } | { kind: "record"; recordId: string; metric: MeasurementMetric };

const ranges: { value: MeasurementRange; label: string }[] = [{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }, { value: "all", label: "全部" }];
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const displayDate = (date: string) => date.replaceAll("-", ".");
const weekday = (date: string) => weekdays[new Date(calendarOrdinal(date) * 86_400_000).getUTCDay()];
const unitFor = (metric: MeasurementMetric) => metric === "weightKg" ? "kg" : "%";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";

export function MeasurementsView({ records: serverRecords, dates: serverDates, sources: serverSources, accountCreatedAt, actions, initialDate = null, initialPeriod = null,initialTrend=null,initialIntent='view',preferences={showBodyFat:true,version:0,updatedAt:null} }: { preferences?:AccountPreferences; records: MeasurementDisplay[]; dates: MeasurementDateDisplay[]; sources: string[]; accountCreatedAt: string; actions: MeasurementActions; initialDate?:string|null; initialPeriod?:"daytime"|"evening"|null;initialTrend?:TrendRoute|null;initialIntent?:RecordIntent }) {
  const mobileMode = useMobileMode();
  const [actionResult, setActionResult] = useState<(Extract<EntryResult, { ok: true }> & { base: MeasurementDisplay[] }) | null>(null);
  // 保存结果即时反馈；新的服务端快照抵达后接管，不能长期保留首次加载数据。
  const { records, dates, sources: snapshotSources } = actionResult?.base === serverRecords ? actionResult : { records: serverRecords, dates: serverDates, sources: serverSources };
  useDraftGuard(false,false,measurementVersions(records));
  const [sourceResult, setSourceResult] = useState<{ base: string[]; sources: string[] } | null>(null);
  const sources = sourceResult?.base === serverSources ? sourceResult.sources : snapshotSources;
  const sourceActions: MeasurementActions = { ...actions, removeSource: async label => {
    const result = await actions.removeSource(label);
    if (result.ok) setSourceResult({ base: serverSources, sources: result.sources });
    return result;
  } };
  const [today, setToday] = useState("");
  const [timezone, setTimezone] = useState("");
  useEffect(() => {
    const update = () => { setToday(localMeasurementDate()); setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone); };
    update(); const timer = window.setInterval(update, 60_000); document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const dateCatalog = [...new Set([...dates.map(row => row.date), ...(today ? [today] : [])])];
  const catalog = measurementCalendarRange(today, localMeasurementDate(new Date(accountCreatedAt), timezone || "UTC"), records.map(row => row.recordDate), dateCatalog);
  const latestDate = catalog.end;
  const earliestDate = catalog.start;
  const [selectedMode, setMode] = useState<MeasurementRange | null>(initialTrend?"custom":null);
  const mode = selectedMode ?? (mobileMode ? "7d" : "30d");
  const [customRange, setCustomRange] = useState<MeasurementInterval>({ start: initialTrend?.from??earliestDate, end: initialTrend?.to??latestDate });
  const [draftRange, setDraftRange] = useState(customRange);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<"daytime" | "evening" | undefined>();
  const [showEvening, setShowEvening] = useState(!initialTrend);
  const [showEstimates, setShowEstimates] = useState(!initialTrend);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<DrawerView | null>(initialDate&&!initialTrend ? initialPeriod||initialIntent==='edit'?{kind:"entry",date:initialDate,period:initialPeriod??'daytime',editing:initialIntent==='edit'}:{kind:"day",date:initialDate,metric:"weightKg"} : null);
  const transition=useChartTransition(),[selectedMetric,setSelectedMetric]=useState<MeasurementMetric>('weightKg');
  const preference=useBodyPreferences(preferences,!!drawer),activeMetric:MeasurementMetric=preference.showBodyFat?selectedMetric:'weightKg',metrics=preference.showBodyFat?['weightKg','bodyFatPercent'] as const:['weightKg'] as const;
  function updated(result: Extract<EntryResult, { ok: true }>) { setSourceResult(null); setActionResult({ ...result, base: serverRecords }); }

  useEffect(()=>{const latest=()=>{setDrawer(null);};window.addEventListener("formward-load-latest",latest);return()=>window.removeEventListener("formward-load-latest",latest);},[]);
  const range = measurementRange(latestDate, mode, mode === "custom" ? customRange : { start: earliestDate, end: latestDate });
  const displayedRecords = records.filter((row) => showEstimates || row.recordKind !== "estimated");
  const visibleRecords = displayedRecords.filter((row) => row.recordDate >= range.start && row.recordDate <= range.end);
  const recentInterval = { start: catalog.start, end: today || catalog.end };
  const recent = recentMeasurementDays(displayedRecords, recentInterval, choices, 7).filter(day => day.date === today || (!dates.some(row => row.date === day.date && row.reminderSkipped) && measurementNeedsEntry(records, day.date, choices,metrics)));
  const chartDates=measurementCalendarPage(range,calendarOrdinal(range.end)-calendarOrdinal(range.start)+1).reverse();
  const fallbackDate=preferredMorningDate(visibleRecords,activeMetric,today||range.end,choices);
  const selection=useChartDateSelection(chartDates,initialDate??fallbackDate,fallbackDate,calendarOpen,`${showEvening}:${showEstimates}:${JSON.stringify(choices)}`),activeDate=selection.selected;
  const selectedPeriod=selection.active?chartPeriod:undefined;
  const weight=measurementSummaryAt(records,'weightKg',activeDate,choices),fat=measurementSummaryAt(records,'bodyFatPercent',activeDate,choices);
  const selectedSummary=activeMetric==='weightKg'?weight:fat,deltaUnit=activeMetric==='weightKg'?'kg':'百分点';
  const chooseMetric=(metric:MeasurementMetric)=>{if(metric!==activeMetric){selection.choose(activeDate);transition.invalidate();setSelectedMetric(metric);}};
  const readings:RecordMetric[]=[
   {label:'晨间体重',value:formatRecordNumber(weight.value),unit:'kg',inlineUnit:true,select:()=>chooseMetric('weightKg'),selected:activeMetric==='weightKg',graphic:<BodySpark records={records} date={activeDate} metric="weightKg" choices={choices}/>,action:<button type="button" onClick={()=>window.dispatchEvent(new Event('formward-open-body-settings'))}>身体设置</button>},
   preference.showBodyFat?{label:'晨间体脂率',value:formatRecordNumber(fat.value),unit:'%',inlineUnit:true,select:()=>chooseMetric('bodyFatPercent'),selected:activeMetric==='bodyFatPercent',graphic:<BodySpark records={records} date={activeDate} metric="bodyFatPercent" choices={choices}/>}:{label:'较前一日',value:formatDifference(weight.previousChange,'weightKg',false)??'—',unit:'kg',inlineUnit:true},
   {label:'7日平均体重',value:formatRecordNumber(weight.average),unit:'kg',inlineUnit:true}
  ];
  const changeSummary=metricName(activeMetric)+' · 7日变化 '+(formatDifference(selectedSummary.change,activeMetric,false)??'—')+' '+deltaUnit+(selectedSummary.start&&selectedSummary.end?' ('+selectedSummary.start.slice(5)+'—'+selectedSummary.end.slice(5)+')':'');
  if(!preference.showBodyFat&&selectedMetric!=='weightKg')setSelectedMetric('weightKg');
  function selectRange(nextMode: MeasurementRange, nextInterval = customRange) {
    measurementRange(latestDate,nextMode,nextMode==="custom"?nextInterval:{start:earliestDate,end:latestDate});
    setMode(nextMode);
    setCalendarOpen(false);
  }
  function chooseRecord(date: string, period: "daytime" | "evening", id: string) {
    setChoices((previous) => ({ ...previous, [`${date}:${period}`]: id }));
  }
  function inspectRecord(row: MeasurementDisplay, metric: MeasurementMetric) {
    selection.choose(row.recordDate);
    setDrawer({ kind: "record", recordId: row.id, metric });
  }
  function inspectDay(date: string, period?: "daytime" | "evening", metric: MeasurementMetric = "weightKg") {
    selection.choose(date);
    setDrawer({ kind: "day", date, period, metric });
  }
  useRepeatedRecordTask('/dashboard/measurements',task=>{
    if(task.intent==='view')inspectDay(task.date);
    else setDrawer({kind:'entry',date:task.date,editing:task.intent==='edit',period:task.period});
  });

  function renderDay(date:string){
    const rows=displayedRecords.filter(row=>row.recordDate===date);
    const days=metrics.map(metric=>buildMeasurementDays(rows,choices,metric,[date])[0]);
    return <DailyRecordRow key={date} date={date} today={today} value={<div className={styles.dailyReadings}>{(["daytime","evening"] as const).map(period=><span key={period}><span className={styles.periodLabel}>{period==="daytime"?"晨间":"晚间"}</span>{metrics.map((metric,index)=>{const day=days[index],row=period==="daytime"?day.daytimeRecord:day.eveningRecord;return <TableReading key={metric} row={row} metric={metric} pendingLabel={day[period].length>1?"待选择":null} onInspect={record=>inspectRecord(record,metric)} onInspectCandidates={()=>inspectDay(date,period,metric)}/>;})}</span>)}</div>}><DayActions date={date} today={today} records={records} onView={()=>inspectDay(date)} onEntry={editing=>setDrawer({kind:"entry",date,editing})}/></DailyRecordRow>;
  }

  return <BodyFatContext value={preference.showBodyFat}><RecordWorkspace title="身体" headingId="body-records-title" className={styles.workspace} aria-labelledby="body-records-title" data-shared-route={initialTrend?true:undefined}>

    <section data-chart-selection={selection.regionId} data-selected-date={activeDate} data-selection-origin={selection.origin} {...selection.regionProps} aria-label="身体指标趋势" data-range={mode} style={{visibility:mobileMode===null||!today?"hidden":undefined}}>
      <RecordTrendPanel presentation="body"
       range={<ChartRanges value={mode} items={[...ranges.map(item=>[item.value,item.label]),["custom","自定义"]]} change={value=>{if(value==="custom"){setDraftRange(range);setCalendarOpen(true);}else selectRange(value as MeasurementRange);}}/>}
       custom={calendarOpen&&<CustomRecordRange label="身体" value={{from:draftRange.start,to:draftRange.end}} change={next=>setDraftRange({start:next.from,end:next.to})} apply={()=>{setCustomRange(draftRange);selectRange("custom",draftRange);}} cancel={()=>setCalendarOpen(false)}/>}
       date={activeDate} view={()=>{const target={date:activeDate,period:selection.active?chartPeriod:undefined};setDrawer({kind:"day",...target,metric:"weightKg"});selection.release();}} readoutLabel="选中日身体记录"
       metrics={readings} chartSummary={changeSummary}

       title={metricName(activeMetric)+" · "+unitFor(activeMetric)}
       options={<ChartOptions label="图表选项">
         <div className={styles.chartControls}><label className={styles.toggle}><span>晚间</span><input aria-label="晚间数据" type="checkbox" checked={showEvening} onChange={event=>setShowEvening(event.target.checked)}/></label><label className={styles.toggle}><span>估计</span><input aria-label="估计补全" type="checkbox" checked={showEstimates} onChange={event=>setShowEstimates(event.target.checked)}/></label><button type="button" aria-expanded={rulesOpen} onClick={()=>setRulesOpen(!rulesOpen)}>估算规则 {rulesOpen?"−":"＋"}</button></div>
         {rulesOpen && <section id="measurement-estimate-rules" className={styles.rules} aria-label="估算规则">
        <div><h2>历史初始化</h2><p>第一次补齐已有的历史缺口，利用已经存在的前后真实测量恢复中间趋势。</p><p>补全后结果固定，以后新增数据不会反向改写；真实补录会替代对应的估计值。</p></div>
        <div><h2>日常估计</h2><p>只参考目标日期之前的真实历史，有当天实测时以它为基准。优先使用个人真实晨晚差，必要时使用近期真实晨间趋势。</p><p>真实依据不足时保留空缺，不强行补齐。</p></div>
        <p className={styles.rulesPrinciples}>真实测量始终优先。估计只用于辅助趋势，不作为真实测量参与实测统计。</p>
      </section>}
       </ChartOptions>}
       legend={<><span><i style={{background:"var(--gold)",borderRadius:"50%"}}/>晨间空腹</span>{showEvening&&<span><i style={{background:"var(--data-deficit)",borderRadius:"50%"}}/>晚间</span>}{showEstimates&&visibleRecords.some(row=>row.recordKind==="estimated")&&<span>虚线 · 估计</span>}</>}
      ><div data-chart-metric={activeMetric}><TrendPlot records={visibleRecords} metric={activeMetric} showEvening={showEvening} interval={range} selectedDate={activeDate} selectedPeriod={selectedPeriod} selection={selection} onPeriod={setChartPeriod} choices={choices}/></div>
      </RecordTrendPanel>
    </section>
    <DailyRecords history={<RecordHistory today={today} dates={(catalog.start&&catalog.end?measurementCalendarPage(catalog,calendarOrdinal(catalog.end)-calendarOrdinal(catalog.start)+1):[]).filter(date=>!recent.some(day=>day.date===date))} renderRow={renderDay} view={inspectDay}/>}>{recent.map(day=>renderDay(day.date))}</DailyRecords>
    {drawer && <MeasurementInspector routeEntry={!!initialPeriod&&drawer.kind==="entry"&&drawer.date===initialDate} view={drawer} records={records} sources={sources} timezone={timezone} actions={sourceActions} onUpdated={updated} choices={choices} onChoose={chooseRecord} onClose={() => setDrawer(null)} />}
  </RecordWorkspace></BodyFatContext>;
}

function Missing() { return <span aria-label="未记录" className={styles.missing}>—</span>; }
function DayActions({ date, today, records, onView, onEntry }: { date: string; today: string; records: MeasurementDisplay[]; onView: () => void; onEntry: (editing: boolean) => void }) {
  const action = measurementDayAction(records, date, today);
  return <><button type="button" data-record-action="edit" aria-label={`${action} ${date}`} onClick={() => onEntry(action === "编辑")}>{action}</button><button type="button" aria-label={`查看 ${date}`} onClick={onView}>查看</button></>;
}
function TableReading({ row, metric, pendingLabel, onInspect, onInspectCandidates }: {
  row: MeasurementDisplay | null; metric: MeasurementMetric; pendingLabel: string | null;
  onInspect: (row: MeasurementDisplay) => void; onInspectCandidates: () => void;
}) {
  if (!row) return pendingLabel ? <button type="button" className={styles.tableReading} aria-label={pendingLabel} onClick={onInspectCandidates}>待选择</button> : <Missing />;
  if (row[metric] === null) return <Missing />;
  return <button type="button" className={styles.tableReading} data-kind={row.recordKind} aria-label={`查看 ${row.recordDate} ${periodLabel(row)}${metricName(metric)}${row.recordKind === "estimated" ? "估计依据" : "实测记录"}`} onClick={() => onInspect(row)}>
    <span className={styles.readingStatus} title={row.recordKind === "estimated" ? "估计" : "实测"} aria-hidden="true">{row.recordKind === "estimated" ? "◇" : "●"}</span>{formatRecordNumber(row[metric])}<small>{unitFor(metric)}</small>
  </button>;
}
function RecordDetails({ row, metric, onMetric }: { row: MeasurementDisplay; metric: MeasurementMetric; onMetric: (metric: MeasurementMetric) => void }) {
  const activeMetrics=useBodyMetrics();
  const estimated = row.recordKind === "estimated";
  const otherMetric = metric === "weightKg" ? "bodyFatPercent" : "weightKg";
  const explanation = estimated ? estimateUserExplanation(row.estimation, row.recordDate, metric) : null;
  return <article className={styles.recordDetails} data-inspector-record={row.id} data-kind={row.recordKind} aria-label="记录详情">
    <p className={styles.recordMetric}>{metricName(metric)}</p>
    <p className={`${styles.recordReading} ${row.period === "daytime" ? styles.dayValue : styles.nightValue}`} data-record-value={metric} data-estimate-value={estimated ? metric : undefined}>
      <strong>{formatRecordNumber(row[metric])}</strong><span>{unitFor(metric)}</span>
    </p>
    {(activeMetrics.some(m=>m===otherMetric)&&row[otherMetric] !== null) && <div className={styles.otherReadings} aria-label="同条记录的其他指标">
      {row[otherMetric] !== null && <button type="button" aria-label={`查看${metricName(otherMetric)}记录值`} onClick={() => onMetric(otherMetric)}><span>{metricName(otherMetric)}</span><strong>{row[otherMetric]} <small>{unitFor(otherMetric)}</small></strong></button>}
    </div>}
    {explanation && <section className={styles.estimateBasis} aria-label="估计依据">
      <h3>估计依据</h3><p>{explanation.method}</p>
      {explanation.basis.length > 0 && <ul>{explanation.basis.map(basis => <li key={basis}>{basis}</li>)}</ul>}
      {explanation.formula && <p className={styles.formula}>{explanation.formula}</p>}
      {explanation.sampleSummary.map(summary => <p className={styles.estimateNote} key={summary}>{summary}</p>)}
      {explanation.fallbackNote && <p className={styles.estimateNote}>{explanation.fallbackNote}</p>}
      <p className={styles.estimateDisclaimer}>用于辅助趋势，并非实际测量。</p>
    </section>}
    <section className={styles.recordInfo} aria-label="记录信息">
      <h3>记录信息</h3>
      <dl>
        <div><dt>来源</dt><dd>{sourceLabel(row)}</dd></div>
        <div><dt>测量时间</dt><dd>{estimated ? "无" : recordTimeLabel(row)}</dd></div>
        <div><dt>时区</dt><dd>{row.timezoneLabel ?? timezoneLabel(row.timezone, row.recordDate, row.utcOffsetMinutes)}</dd></div>
        <div><dt>设备</dt><dd>{estimated ? "无" : row.deviceLabel ?? "无"}</dd></div>
        {!estimated && row.sourceSystem && row.sourceSystem !== sourceLabel(row) && <div><dt>来源系统</dt><dd>{row.sourceSystem}</dd></div>}
      </dl>
    </section>
    {explanation && explanation.references.length > 0 && <details className={styles.references}><summary>查看真实参考记录（{explanation.references.length} 条）</summary><ul>{explanation.references.map((reference, index) => <li key={index}>{reference}</li>)}</ul></details>}
  </article>;
}
function periodLabel(row: Pick<MeasurementDisplay, "period" | "fasting">) { return row.period === "evening" ? "晚间" : row.fasting === false || row.fasting === null ? "白天" : "晨间"; }
function sourceLabel(row: MeasurementDisplay) {
  if (row.recordKind === "estimated") return `系统估计 · ${estimateModeLabel(row.estimation)}`;
  return row.entryChannel === "development_backend" ? "维护录入" : row.entryChannel === "manual" ? "手动录入" : row.entryChannel === "api" ? "外部录入" : row.sourceSystem ?? (row.sourceType === "import" ? "导入 · 来源系统未提供" : row.sourceType === "manual" ? "手动录入" : row.sourceType);
}
function recordTimeLabel(row: MeasurementDisplay) { return row.timePrecision === "second" ? row.sourceLocalTime : "无"; }
function formatDifference(value: number | null, metric: MeasurementMetric, withUnit = true) {
  return value === null ? withUnit ? "—" : null : `${value > 0 ? "+" : ""}${value.toFixed(2)}${withUnit ? metric === "weightKg" ? " kg" : " 百分点" : ""}`;
}
type InspectorSelection = { date: string; recordId: string | null; metric: MeasurementMetric; period?: "daytime" | "evening" };
function MeasurementInspector({ routeEntry=false,view, records, sources, timezone, actions, onUpdated, choices, onChoose, onClose }: {
  routeEntry?:boolean;view: DrawerView; records: MeasurementDisplay[]; sources: string[]; timezone: string; actions: MeasurementActions;
  onUpdated: (result: Extract<EntryResult, { ok: true }>) => void; choices: Record<string, string>;
  onChoose: (date: string, period: "daytime" | "evening", id: string) => void; onClose: () => void;
}) {
  const dismiss=useRef<()=>void>(()=>onClose());
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const editor=view.kind==='entry'?{date:view.date,editing:!!view.editing,period:view.period}:null;
  const [editorChoices, setEditorChoices] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string[]>(() => view.kind === "record" ? [records.find(row => row.id === view.recordId)?.period ?? "daytime"] : view.kind === "day" && view.period ? [view.period] : []);
  const [active, setActive] = useState<InspectorSelection | null>(() => {
    if (view.kind === "entry") return { date: view.date, recordId: null, metric: "weightKg" };
    if (view.kind === "record") {
      const row = records.find(row => row.id === view.recordId);
      return { date: row?.recordDate ?? "", recordId: view.recordId, metric: view.metric, period: row?.period };
    }
    const day = buildMeasurementDays(records.filter(row => row.recordDate === view.date), choices, view.metric)[0];
    const representative = view.period ? view.period === "daytime" ? day?.daytimeRecord : day?.eveningRecord : day?.daytimeRecord ?? day?.eveningRecord;
    return { date: view.date, recordId: view.period ? representative?.id ?? null : null, metric: view.metric, period: view.period };
  });
  const activeDay = active ? buildMeasurementDays(records.filter(row => row.recordDate === active.date), choices, active.metric, [active.date])[0] : null;
  const row = activeDay?.records.find(row => row.id === active?.recordId);
  const navigationKey = editor ? `entry:${editor.date}` : active ? `${active.date}:${active.recordId ?? active.period ?? "candidates"}` : "history";
  useEffect(() => {
    if(content.current)content.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [navigationKey]);
  function entryUpdated(result: Extract<EntryResult, { ok: true }>) {
    if (active && row?.recordKind === "estimated") {
      const replacement = result.records.find(candidate => candidate.recordKind === "observed" && candidate.recordDate === active.date && candidate.period === row.period && candidate[active.metric] !== null);
      if (replacement) setActive({ ...active, recordId: replacement.id });
    }
    onUpdated(result);
  }
  return <Inspector routeEntry={routeEntry} title={editor?(editor.editing?'编辑身体记录 ':'身体录入 ')+editor.date:"身体记录详情"} close={onClose} onCloseReady={close=>{dismiss.current=close;}} className={styles.drawer} header={(
    <header className={styles.drawerHeader} data-editing={!!editor}><div>
      <h2 ref={heading} tabIndex={-1} id="measurement-drawer-title">{editor ? <>{editor.editing?'编辑身体记录':'身体录入'}<time className={styles.entryHeadingDate} dateTime={editor.date}>{displayDate(editor.date)}</time></> : active ? displayDate(active.date) || "记录详情" : "记录详情"}</h2>
      {!editor&&<p>{(active?weekday(active.date):"")+" · 晨间／晚间"}</p>}
    </div><InspectorCloseButton label="关闭记录详情"/></header>)}>
    {!editor && active && <DayOverview date={active.date} records={records} choices={choices} />}
    <div ref={content} className={styles.drawerContent} data-record-intent={editor?editor.editing?'edit':'create':'view'}>
      {editor && <MeasurementEntry key={editor.date} date={editor.date} timezone={timezone} records={records} sources={sources} choices={{ ...choices, ...editorChoices }} actions={actions} editing={editor.editing} initialPeriod={editor.period} onUpdated={entryUpdated} onChoose={(date, period, id) => {setEditorChoices(previous=>({...previous,[`${date}:${period}`]:id}));onChoose(date,period,id);}}/>}
      {!editor && active && activeDay && <>
        {(["daytime", "evening"] as const).map(period => {
          const periodRows = activeDay.records.filter(candidate => candidate.period === period);
          const representative = period === "daytime" ? activeDay.daytimeRecord : activeDay.eveningRecord;
          const current = row?.period === period ? row : representative;
          const metric = current?.[active.metric] == null ? active.metric === "weightKg" ? "bodyFatPercent" : "weightKg" : active.metric;
          return <details className={styles.periodDetails} key={period} data-period-details={period} open={expanded.includes(period)}>
            <summary onClick={event => { event.preventDefault(); setExpanded(previous => previous.includes(period) ? previous.filter(item => item !== period) : [...previous, period]); }}>{period === "daytime" ? "晨间" : "晚间"}详情 <small>{periodRows.length ? `${periodRows.length} 条记录` : "无记录"}</small></summary>
            {expanded.includes(period) && <>{current ? <RecordDetails key={current.id} row={current} metric={metric} onMetric={metric => setActive({ ...active, recordId: current.id, period, metric })} /> : <p className={styles.emptyHistory}>{periodRows.length ? "选择一条记录查看；查看候选不会改变代表记录。" : "此时段暂无记录。"}</p>}
            {periodRows.length > 1 || !current ? <>
              <RecordList day={activeDay} period={period} metric={active.metric} activeId={current?.id} onInspect={(row, _trigger, metric) => setActive({ ...active, recordId: row.id, period, metric })} />
            </> : null}</>}
          </details>;
        })}
      </>}
      {!editor && active && !activeDay && <p className={styles.emptyHistory}>此记录已不可用。</p>}
    </div>
  </Inspector>;
}
function DayOverview({ date, records, choices }: { date: string; records: MeasurementDisplay[]; choices: Record<string, string> }) {
  const metrics=useBodyMetrics();
  const days = metrics.map(metric => buildMeasurementDays(records.filter(row => row.recordDate === date), choices, metric, [date])[0]);
  return <section className={styles.dayOverview} aria-label="当天晨晚概览">
    {(["daytime", "evening"] as const).map(period => <div key={period} className={period === "daytime" ? styles.dayValue : styles.nightValue} data-overview-period={period}>
      <h3>{period === "daytime" ? "晨间" : "晚间"}</h3>
      {metrics.map((metric, index) => {
        const day = days[index], row = period === "daytime" ? day.daytimeRecord : day.eveningRecord;
        const value = row?.[metric] ?? null;
        return <div className={styles.overviewReading} key={metric} data-overview-metric={metric}><span>{metricName(metric)}</span><strong>{value ?? "—"}<small>{unitFor(metric)}</small></strong><small>{row && value !== null ? row.recordKind === "estimated" ? "◇ 估计" : "● 实测" : day[period].length > 1 ? "待选择" : "无"}</small></div>;
      })}
    </div>)}
  </section>;
}
function RecordList({ day, metric, activeId, period, onInspect }: {
  day: MeasurementDay; metric: MeasurementMetric; activeId?: string; period?: "daytime" | "evening";
  onInspect: (row: MeasurementDisplay, trigger: HTMLElement, metric: MeasurementMetric) => void;
}) {
  return <div className={styles.recordList} aria-label="当天记录列表">
    {[...day.records].filter(row => !period || row.period === period).sort((a, b) => a.period.localeCompare(b.period) || a.sourceLocalTime.localeCompare(b.sourceLocalTime) || a.recordKind.localeCompare(b.recordKind)).map(row => {
      const availableMetric = row[metric] === null ? metric === "weightKg" ? "bodyFatPercent" : "weightKg" : metric;
      return <button type="button" key={row.id} className={styles.recordEntry} aria-pressed={row.id === activeId} onClick={event => onInspect(row, event.currentTarget, availableMetric)}>
      <span>{periodLabel(row)} · {row.recordKind === "estimated" ? "◇ 估计" : "实测"}<small>{row.recordKind === "estimated" ? estimateModeLabel(row.estimation) : recordTimeLabel(row)}</small></span>
      <strong className={row.period === "daytime" ? styles.dayValue : styles.nightValue}>{row[availableMetric] ?? "—"} <small>{unitFor(availableMetric)}</small></strong>
    </button>; })}
  </div>;
}
function TrendPlot(props:Parameters<typeof FullTrendPlot>[0]) {
  const mobile=useMobileMode();
  return mobile&&props.metric==="weightKg"&&!props.showEvening&&!props.records.some(row=>row.recordKind==="estimated")?<MorningWeightPlot records={props.records} interval={props.interval} selection={props.selection} choices={props.choices}/>:<FullTrendPlot {...props}/>;
}
function FullTrendPlot({ records, metric, showEvening, interval, selectedDate, selectedPeriod, selection, onPeriod, choices }: {
  records: MeasurementDisplay[]; metric: MeasurementMetric; showEvening: boolean; interval: MeasurementInterval;
  selectedDate: string | null; selectedPeriod?: "daytime" | "evening"; selection:ReturnType<typeof useChartDateSelection>; onPeriod:(period:"daytime"|"evening")=>void; choices: Record<string, string>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const plotId = useId(), mobile=useMobileMode();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [hintRecordId, setHintRecordId] = useState<string | null>(null);
  useLayoutEffect(() => {
    setViewportWidth(viewport.current!.clientWidth);
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, []);
  const { points, segments, pairs } = measurementTrend(records, metric, showEvening, choices);
  useChartMotion(viewport, viewportWidth ? `${metric}:${showEvening}:${interval.start}:${interval.end}:${JSON.stringify(choices)}:${records.map(record => `${record.id}:${record.updatedAt}`).join("|")}` : "pending");
  const width = Math.max(240, viewportWidth);
  const span = calendarOrdinal(interval.end) - calendarOrdinal(interval.start);
  const x = (date: string) => span ? 48 + (calendarOrdinal(date) - calendarOrdinal(interval.start)) / span * (width - 72) : (width + 24) / 2;
  const scale = points.length ? normalScale(points.map((row) => Number(row[metric]))) : null;
  const height=mobile?180:252, plotBottom=height-34;
  const y = (value: string | null) => 18 + (scale?.position(Number(value)) ?? .5) * (plotBottom-18);
  const pointDays = [...new Set(points.map(row => row.recordDate))].sort();
  const hitColumns = new Map(pointDays.map((date, index) => [date, {
    left: index ? (x(pointDays[index - 1]) + x(date)) / 2 : 0,
    right: index < pointDays.length - 1 ? (x(date) + x(pointDays[index + 1])) / 2 : width,
  }]));
  const pointByPeriod = new Map(points.map(row => [`${row.recordDate}:${row.period}`, row]));
  const ticks = measurementDateTicks(interval, width < 500 ? 4 : width < 900 ? 6 : 8);
  const unit = unitFor(metric);
  const pointLabel = (row: MeasurementDisplay) => `${row.recordDate} · ${row.period === "daytime" ? "空腹" : "晚间非空腹"} · ${formatRecordNumber(row[metric])} ${unit} · ${row.recordKind === "estimated" ? `估计 · ${estimateUserExplanation(row.estimation, row.recordDate, metric).method}` : "实测"}`;
  const hintedRecord = points.find((row) => row.id === hintRecordId && row.recordDate===selectedDate && selection.active) ?? points.find(row => row.recordDate === selectedDate && row.period === (selectedPeriod ?? "daytime")) ?? points.find(row => row.recordDate === selectedDate);
  const drag=useChartDrag(Array.from({length:span+1},(_,i)=>addCalendarDays(interval.start,i)),width,48,24,selection.choose);
  const markerKey=`${width}:${height}:${interval.start}:${interval.end}:${scale?.ticks.join("|")}`;
  const selectedX=selectedDate?x(selectedDate):null,selectedHit=selectedDate?hitColumns.get(selectedDate):null;
  const dayHalfWidth=span?(width-72)/span/2:(width-72)/2;
  const selectedColumn=selectedX===null?null:selectedHit?{left:Math.max(selectedHit.left,selectedX-14),right:Math.min(selectedHit.right,selectedX+14)}:{left:selectedX-dayHalfWidth,right:selectedX+dayHalfWidth};
  const activate = (row: MeasurementDisplay) => {selection.activate(row.recordDate);onPeriod(row.period);};


  return <>
    <div className={styles.plotViewport} ref={viewport}>
      <svg {...drag} className={styles.plot} style={{touchAction:"pan-y", visibility: viewportWidth > 0 ? undefined : "hidden"}} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${metricName(metric)}趋势，数值越高位置越高`}>
        <title>{`${metricName(metric)}趋势`}</title>
        {scale?.ticks.map((value) => <g key={value}><line x1="48" x2={width - 24} y1={y(String(value))} y2={y(String(value))} className={styles.grid} /><text x="37" y={y(String(value)) + 4} textAnchor="end" className={styles.axis}>{value.toFixed(1)}</text></g>)}
        {ticks.map((date) => <text key={date} x={x(date)} y={height-10} textAnchor="middle" className={styles.axis}>{date.slice(5).replace("-", "/")}</text>)}
        <ChartSelectionColumn x={selectedX} date={selectedDate} column={selectedColumn} plot={{left:48,right:width-24,top:14,bottom:plotBottom}} resetKey={markerKey} direct={selection.direct}/>
        {(["daytime","evening"] as const).map(period=>{const point=points.find(row=>row.recordDate===selectedDate&&row.period===period);return <ChartSelectionPoint key={period} x={point?x(point.recordDate):null} y={point?y(point[metric]):0} resetKey={markerKey} direct={selection.direct} color={period==="daytime"?"var(--body-gold)":"var(--body-blue)"}/>;})}
        {pairs.map((day) => <line data-pair={day.date} key={day.date} x1={x(day.date)} x2={x(day.date)} y1={y(day.daytimeRecord![metric])} y2={y(day.eveningRecord![metric])} className={styles.pairLine} />)}
        {segments.map(({ a, b, period, estimated, missingDayCount }) => <line data-chart-line key={`${a.id}:${b.id}`} data-segment={estimated ? "estimated" : missingDayCount ? "gap" : "continuous"} data-period={period} x1={x(a.recordDate)} y1={y(a[metric])} x2={x(b.recordDate)} y2={y(b[metric])} className={`${period === "daytime" ? styles.dayLine : styles.nightLine} ${estimated ? styles.estimateLine : missingDayCount ? styles.gapLine : ""}`} />)}
        {[...points].sort((a, b) => Number(a.period === "daytime") - Number(b.period === "daytime")).map((row) => {
          const estimated = row.recordKind === "estimated";
          const label = pointLabel(row);
          // 相邻日期与同日晨晚点各用中线划分点击区域，避免透明命中区遮住另一条记录。
          const companion = pointByPeriod.get(`${row.recordDate}:${row.period === "daytime" ? "evening" : "daytime"}`);
          const ownY = y(row[metric]), companionY = companion ? y(companion[metric]) : null;
          const midpoint = companionY === null ? null : (ownY + companionY) / 2;
          const coincident = companionY === ownY;
          const column = hitColumns.get(row.recordDate)!;
          const clipLeft = coincident && row.period === "evening" ? x(row.recordDate) : column.left;
          const clipRight = coincident && row.period === "daytime" ? x(row.recordDate) : column.right;
          const clipTop = midpoint !== null && !coincident && ownY > companionY! ? midpoint : 0;
          const clipBottom = midpoint !== null && !coincident && ownY < companionY! ? midpoint : height;
          const clipId = `${plotId}-${row.id}`;
          return <g key={row.id} data-point-id={row.id} data-date={row.recordDate} data-selected={row.recordDate===selectedDate} data-value={row[metric]} data-period={row.period} data-kind={row.recordKind} role="button" tabIndex={0} aria-label={label} aria-pressed={row.recordDate === selectedDate} data-chart-date={row.recordDate} onMouseMove={() => {setHintRecordId(row.id);selection.preview(row.recordDate);onPeriod(row.period);}} onMouseLeave={() => setHintRecordId(null)} onFocus={event => {selection.focus(event,row.recordDate);if(event.currentTarget.matches(":focus-visible")){setHintRecordId(row.id);onPeriod(row.period);}}} onBlur={() => setHintRecordId(null)} onClick={() => activate(row)} onKeyDown={(event) => {selection.keyDown(event,row.recordDate);if(event.key==="Enter"||event.key===" ")activate(row);}}>
            <title>{estimated ? label : `${recordTimeLabel(row)} · ${label}`}</title>
            <defs><clipPath id={clipId}><rect x={clipLeft} y={clipTop} width={clipRight - clipLeft} height={clipBottom - clipTop} /></clipPath></defs>
            <circle cx={x(row.recordDate)} cy={ownY} r="14" className={styles.hitTarget} clipPath={`url(#${clipId})`} />
            {estimated ? <path d={`M ${x(row.recordDate)} ${y(row[metric]) - 4} l 4 4 l -4 4 l -4 -4 Z`} className={`${styles.estimatePoint} ${row.period === "daytime" ? styles.dayEstimate : styles.nightEstimate}`} /> : <circle cx={x(row.recordDate)} cy={y(row[metric])} r={row.period === "daytime" ? "4" : "3.2"} className={row.period === "daytime" ? styles.dayPoint : styles.nightPoint} />}
          </g>;
        })}
        {!points.length && <text x={width / 2} y="118" textAnchor="middle" className={styles.emptyChart}>{`此区间暂无${showEvening ? "" : "空腹"}${metricName(metric)}记录`}</text>}
      </svg>
    </div>
    <output className={styles.plotHint} aria-live="polite">{hintedRecord?pointLabel(hintedRecord):""}</output>
  </>;
}

function BodySpark({records,date,metric,choices}:{records:MeasurementDisplay[];date:string;metric:MeasurementMetric;choices:Record<string,string>}){const days=buildMeasurementDays(records.filter(row=>row.recordKind!=='estimated'),choices,metric),byDate=new Map(days.map(day=>[day.date,day.daytimeRecord])),points=Array.from({length:7},(_,i)=>{const at=addCalendarDays(date,i-6),row=byDate.get(at);return{date:at,value:row?.fasting===true&&row[metric]!==null?Number(row[metric]):null};}),scale=normalScale(points.filter(point=>point.value!==null).map(point=>point.value!));return <div className="body-spark" aria-label="最近7日晨间实测，缺测断开"><TrendGlyph model={metricTrendModel('morning-weight',points,scale)}/></div>;}
