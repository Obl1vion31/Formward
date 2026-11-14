"use client";
import {useDraftGuard} from "@/components/draft-guard";
import type {RecordIntent} from "@/components/record-intent";
import {useRepeatedRecordTask} from '@/components/record-intent-client';
import {measurementVersions} from "@/components/record-change-client";
import {RecordWorkspace,RecordTrendPanel,CustomRecordRange,type RecordMetric} from "@/components/record-trend-panel";
import {formatRecordNumber} from "@/components/number-format";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { DailyRecords,DailyRecordRow } from "@/components/daily-records";
import { RecordHistory } from "@/components/record-history";
import { Inspector,InspectorCloseButton } from "@/components/inspector";

import { useContext, useEffect, useRef, useState } from "react";
import {WorkspaceTodayContext} from "@/components/workspace-frame-state";
import { buildMeasurementDays, recentMeasurementDays } from "./days";
import { addCalendarDays, measurementCalendarPage, measurementCalendarRange } from "./calendar";
import type {AccountPreferences} from "@/features/auth/preferences";
import {useBodyPreferences} from "./preferences-control";
import {BodyFatContext,useBodyMetrics} from "./visibility";
import { measurementSummaryAt,preferredMorningDate } from "./summary";
import { calendarOrdinal, measurementRange, normalScale, type MeasurementInterval, type MeasurementMetric, type MeasurementRange } from "./trend";
import styles from "./measurements-view.module.css";
import { localMeasurementDate, measurementDayAction, measurementNeedsEntry, type EntryResult, type MeasurementActions, type MeasurementDateDisplay, type MeasurementDisplay } from "./entry-state";
import { MeasurementEntry } from "./measurement-entry";
import { timezoneLabel } from "./timezone";
import { useMobileMode } from "@/components/use-mobile-mode";
import type { TrendRoute } from "@/components/metric-trend-model";
import {useChartTransition} from '@/components/chart-transition-state';
import {TrendGlyph} from "@/components/trend-glyph";
import {metricTrendModel} from "@/components/metric-trend-model";
import { BodyTrendPlot } from "./body-trend-plot";
import {displayRecordDate,recordDateRange} from "@/components/record-dates";
export type { MeasurementDisplay } from "./entry-state";

type MeasurementDay = ReturnType<typeof buildMeasurementDays<MeasurementDisplay>>[number];
type DrawerView = { kind: "entry"; date: string; editing?: boolean; period?:"daytime"|"evening" } | { kind: "day"; date: string; period?: "daytime" | "evening"; metric: MeasurementMetric } | { kind: "record"; recordId: string; metric: MeasurementMetric };

const ranges: { value: MeasurementRange; label: string }[] = [{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }, { value: "all", label: "全部" }];
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const displayDate = displayRecordDate;
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
  const suppliedToday=useContext(WorkspaceTodayContext);
  const [today, setToday] = useState(suppliedToday);
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
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<DrawerView | null>(initialDate&&!initialTrend ? initialPeriod||initialIntent==='edit'?{kind:"entry",date:initialDate,period:initialPeriod??'daytime',editing:initialIntent==='edit'}:{kind:"day",date:initialDate,metric:"weightKg"} : null);
  const transition=useChartTransition(),[selectedMetric,setSelectedMetric]=useState<MeasurementMetric>('weightKg');
  const preference=useBodyPreferences(preferences,!!drawer),activeMetric:MeasurementMetric=preference.showBodyFat?selectedMetric:'weightKg',metrics=preference.showBodyFat?['weightKg','bodyFatPercent'] as const:['weightKg'] as const;
  function updated(result: Extract<EntryResult, { ok: true }>) { setSourceResult(null); setActionResult({ ...result, base: serverRecords }); }

  useEffect(()=>{const latest=()=>{setDrawer(null);};window.addEventListener("formward-load-latest",latest);return()=>window.removeEventListener("formward-load-latest",latest);},[]);
  const range = measurementRange(latestDate, mode, mode === "custom" ? customRange : { start: earliestDate, end: latestDate });
  const displayedRecords = records.filter((row) => row.recordKind !== "estimated");
  const visibleRecords = displayedRecords.filter((row) => row.recordDate >= range.start && row.recordDate <= range.end);
  const recentInterval = { start: catalog.start, end: today || catalog.end };
  const recent = recentMeasurementDays(displayedRecords, recentInterval, choices, 7).filter(day => day.date === today || (!dates.some(row => row.date === day.date && row.reminderSkipped) && measurementNeedsEntry(records, day.date, choices,metrics)));
  const chartDates=measurementCalendarPage(range,calendarOrdinal(range.end)-calendarOrdinal(range.start)+1).reverse();
  const fallbackDate=preferredMorningDate(visibleRecords,activeMetric,today||range.end,choices);
  const selection=useChartDateSelection(chartDates,initialDate??fallbackDate,fallbackDate,calendarOpen,`${showEvening}:${JSON.stringify(choices)}`),activeDate=selection.selected;
  const selectedPeriod=selection.active?chartPeriod:undefined;
  const weight=measurementSummaryAt(records,'weightKg',activeDate,choices),fat=measurementSummaryAt(records,'bodyFatPercent',activeDate,choices);
  const selectedSummary=activeMetric==='weightKg'?weight:fat,deltaUnit=activeMetric==='weightKg'?'kg':'百分点';
  const chooseMetric=(metric:MeasurementMetric)=>{if(metric!==activeMetric){selection.choose(activeDate);transition.invalidate();setSelectedMetric(metric);}};
  const readings:RecordMetric[]=[
   {label:'晨间体重',value:formatRecordNumber(weight.value),unit:'kg',inlineUnit:true,select:()=>chooseMetric('weightKg'),selected:activeMetric==='weightKg',graphic:<BodySpark records={records} date={activeDate} metric="weightKg" choices={choices}/>,action:<button type="button" onClick={()=>window.dispatchEvent(new Event('formward-open-body-settings'))}>身体设置</button>},
   preference.showBodyFat?{label:'晨间体脂率',value:formatRecordNumber(fat.value),unit:'%',inlineUnit:true,select:()=>chooseMetric('bodyFatPercent'),selected:activeMetric==='bodyFatPercent',graphic:<BodySpark records={records} date={activeDate} metric="bodyFatPercent" choices={choices}/>}:{label:'较前一日',value:formatDifference(weight.previousChange,'weightKg',false)??'—',unit:'kg',inlineUnit:true},
   {label:'7日平均体重',value:formatRecordNumber(weight.average),unit:'kg',inlineUnit:true}
  ];
  const changeSummary=metricName(activeMetric)+' · 7日变化 '+(formatDifference(selectedSummary.change,activeMetric,false)??'—')+' '+deltaUnit+(selectedSummary.start&&selectedSummary.end?' ('+recordDateRange(selectedSummary.start,selectedSummary.end)+')':'');
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

    <section data-record-trend data-chart-selection={selection.regionId} data-selected-date={activeDate} data-selection-origin={selection.origin} {...selection.regionProps} aria-label="身体指标趋势" data-range={mode}>
      <RecordTrendPanel presentation="body"
       range={<ChartRanges value={mode} items={[...ranges.map(item=>[item.value,item.label]),["custom","自定义"]]} change={value=>{if(value==="custom"){setDraftRange(range);setCalendarOpen(true);}else selectRange(value as MeasurementRange);}}/>}
       custom={calendarOpen&&<CustomRecordRange label="身体" value={{from:draftRange.start,to:draftRange.end}} change={next=>setDraftRange({start:next.from,end:next.to})} apply={()=>{setCustomRange(draftRange);selectRange("custom",draftRange);}} cancel={()=>setCalendarOpen(false)}/>}
       date={activeDate} view={()=>{const target={date:activeDate,period:selection.active?chartPeriod:undefined};setDrawer({kind:"day",...target,metric:"weightKg"});selection.releasePreview();}} readoutLabel="选中日身体记录"
       metrics={readings} chartSummary={changeSummary}

       title={metricName(activeMetric)+" · "+unitFor(activeMetric)}
       options={<label className={styles.toggle}><span>晚间</span><input aria-label="晚间数据" type="checkbox" checked={showEvening} onChange={event=>{transition.invalidate();setShowEvening(event.target.checked);}}/></label>}
       legend={<><span><i style={{background:"var(--data-weight)",borderRadius:"50%"}}/>晨间空腹</span>{showEvening&&<span><i style={{background:"var(--data-deficit)",borderRadius:"50%"}}/>晚间</span>}</>}
      ><div data-chart-metric={activeMetric}><BodyTrendPlot linked={!!initialTrend&&range.start===initialTrend.from&&range.end===initialTrend.to} records={visibleRecords} metric={activeMetric} showEvening={showEvening} interval={range} selectedDate={activeDate} selectedPeriod={selectedPeriod} selection={selection} onPeriod={setChartPeriod} choices={choices}/></div>
      </RecordTrendPanel>
    </section>
    <DailyRecords kind="body" loading={!today} history={<RecordHistory today={today} dates={(catalog.start&&catalog.end?measurementCalendarPage(catalog,calendarOrdinal(catalog.end)-calendarOrdinal(catalog.start)+1):[]).filter(date=>!recent.some(day=>day.date===date))} renderRow={renderDay} view={inspectDay}/>}>{recent.map(day=>renderDay(day.date))}</DailyRecords>
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
  return <button type="button" className={styles.tableReading} data-kind={row.recordKind} aria-label={`查看 ${row.recordDate} ${periodLabel(row)}${metricName(metric)}实测记录`} onClick={() => onInspect(row)}>
    <span className={styles.readingStatus} title="实测" aria-hidden="true">●</span>{formatRecordNumber(row[metric])}<small>{unitFor(metric)}</small>
  </button>;
}
function RecordDetails({ row, metric, onMetric }: { row: MeasurementDisplay; metric: MeasurementMetric; onMetric: (metric: MeasurementMetric) => void }) {
  const activeMetrics=useBodyMetrics();
  const otherMetric = metric === "weightKg" ? "bodyFatPercent" : "weightKg";
  return <article className={styles.recordDetails} data-inspector-record={row.id} data-kind={row.recordKind} aria-label="记录详情">
    <p className={styles.recordMetric}>{metricName(metric)}</p>
    <p className={`${styles.recordReading} ${row.period === "daytime" ? styles.dayValue : styles.nightValue}`} data-record-value={metric}>
      <strong>{formatRecordNumber(row[metric])}</strong><span>{unitFor(metric)}</span>
    </p>
    {(activeMetrics.some(m=>m===otherMetric)&&row[otherMetric] !== null) && <div className={styles.otherReadings} aria-label="同条记录的其他指标">
      {row[otherMetric] !== null && <button type="button" aria-label={`查看${metricName(otherMetric)}记录值`} onClick={() => onMetric(otherMetric)}><span>{metricName(otherMetric)}</span><strong>{row[otherMetric]} <small>{unitFor(otherMetric)}</small></strong></button>}
    </div>}
    <section className={styles.recordInfo} aria-label="记录信息">
      <h3>记录信息</h3>
      <dl>
        <div><dt>来源</dt><dd>{sourceLabel(row)}</dd></div>
        <div><dt>测量时间</dt><dd>{recordTimeLabel(row)}</dd></div>
        <div><dt>时区</dt><dd>{row.timezoneLabel ?? timezoneLabel(row.timezone, row.recordDate, row.utcOffsetMinutes)}</dd></div>
        <div><dt>设备</dt><dd>{row.deviceLabel ?? "无"}</dd></div>
        {row.sourceSystem && row.sourceSystem !== sourceLabel(row) && <div><dt>来源系统</dt><dd>{row.sourceSystem}</dd></div>}
      </dl>
    </section>
  </article>;
}
function periodLabel(row: Pick<MeasurementDisplay, "period" | "fasting">) { return row.period === "evening" ? "晚间" : row.fasting === false || row.fasting === null ? "白天" : "晨间"; }
function sourceLabel(row: MeasurementDisplay) {
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
        return <div className={styles.overviewReading} key={metric} data-overview-metric={metric}><span>{metricName(metric)}</span><strong>{value ?? "—"}<small>{unitFor(metric)}</small></strong><small>{row && value !== null ? "实测" : day[period].length > 1 ? "待选择" : "无"}</small></div>;
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
      <span>{periodLabel(row)} · {"实测"}<small>{recordTimeLabel(row)}</small></span>
      <strong className={row.period === "daytime" ? styles.dayValue : styles.nightValue}>{row[availableMetric] ?? "—"} <small>{unitFor(availableMetric)}</small></strong>
    </button>; })}
  </div>;
}
function BodySpark({records,date,metric,choices}:{records:MeasurementDisplay[];date:string;metric:MeasurementMetric;choices:Record<string,string>}){const days=buildMeasurementDays(records.filter(row=>row.recordKind!=='estimated'),choices,metric),byDate=new Map(days.map(day=>[day.date,day.daytimeRecord])),points=Array.from({length:7},(_,i)=>{const at=addCalendarDays(date,i-6),row=byDate.get(at);return{date:at,value:row?.fasting===true&&row[metric]!==null?Number(row[metric]):null};}),scale=normalScale(points.filter(point=>point.value!==null).map(point=>point.value!));return <div className="body-spark" aria-label="最近7日晨间实测，缺测断开"><TrendGlyph model={metricTrendModel('morning-weight',points,scale)}/></div>;}
