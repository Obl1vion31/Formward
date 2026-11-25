"use client";
import { useSearchParams } from "next/navigation";
import { useWorkspaceReturn } from "@/components/workspace-return";
import {useDraftGuard} from "@/components/draft-guard";
import type {RecordIntent} from "@/components/record-intent";
import {useRepeatedRecordTask} from '@/components/record-intent-client';
import {measurementVersions} from "@/components/record-change-client";
import {RecordWorkspace,RecordTrendPanel,CustomRecordRange,type RecordMetric} from "@/components/record-trend-panel";
import {formatRecordNumber} from "@/components/number-format";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { useNestedChartRange } from "@/components/use-nested-chart-range";
import { DailyRecords } from "@/components/daily-records";
import { Inspector,InspectorCloseButton } from "@/components/inspector";

import { useContext, useEffect, useRef, useState } from "react";
import {WorkspaceTodayContext} from "@/components/workspace-frame-state";
import { buildMeasurementDays } from "./days";
import { addCalendarDays, measurementCalendarPage, measurementCalendarRange } from "./calendar";
import type {AccountPreferences} from "@/features/auth/preferences";
import {useBodyPreferences} from "./preferences-control";
import {BodyFatContext} from "./visibility";
import { measurementSummaryAt,preferredMorningDate } from "./summary";
import { calendarOrdinal, measurementRange, normalScale, type MeasurementInterval, type MeasurementMetric, type MeasurementRange } from "./trend";
import styles from "./measurements-view.module.css";
import { localMeasurementDate, type EntryResult, type MeasurementActions, type MeasurementDateDisplay, type MeasurementDisplay } from "./entry-state";
import { MeasurementEntry, MeasurementEntryHeader } from "./measurement-entry";
import {BodyRecordRow, MeasurementFacts, MeasurementReading} from "./measurement-record-details";
import { useInitialMobileMode } from "@/components/use-mobile-mode";
import type { TrendRoute } from "@/components/metric-trend-model";
import {useChartTransitionActions} from '@/components/chart-transition-state';
import {TrendGlyph} from "@/components/trend-glyph";
import {metricTrendModel} from "@/components/metric-trend-model";
import { BodyTrendPlot } from "./body-trend-plot";
import {displayRecordDate,recordDateRange} from "@/components/record-dates";
export type { MeasurementDisplay } from "./entry-state";

type DrawerView =
  | {kind: "entry"; date: string; editing?: boolean; period?: "daytime" | "evening"}
  | {kind: "day"; date: string; period?: "daytime" | "evening"};

const ranges: { value: MeasurementRange; label: string }[] = [{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }, { value: "all", label: "全部" }];
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const displayDate = displayRecordDate;
const weekday = (date: string) => weekdays[new Date(calendarOrdinal(date) * 86_400_000).getUTCDay()];
const unitFor = (metric: MeasurementMetric) => metric === "weightKg" ? "kg" : "%";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";

export function MeasurementsView({ records: serverRecords, dates: serverDates, sources: serverSources, accountCreatedAt, actions, initialDate: requestedDate = null, initialPeriod: requestedPeriod = null,initialTrend=null,initialIntent='view',preferences={showBodyFat:true,version:0,updatedAt:null} }: { preferences?:AccountPreferences; records: MeasurementDisplay[]; dates: MeasurementDateDisplay[]; sources: string[]; accountCreatedAt: string; actions: MeasurementActions; initialDate?:string|null; initialPeriod?:"daytime"|"evening"|null;initialTrend?:TrendRoute|null;initialIntent?:RecordIntent }) {
  const params = useSearchParams();
  const initialPeriod = requestedPeriod && params.get("entry") === requestedPeriod ? requestedPeriod : null;
  const initialDate = requestedPeriod && !initialPeriod ? null : requestedDate;
  const mobileMode = useInitialMobileMode();
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
  const [drawer, setDrawer] = useState<DrawerView | null>(initialDate&&!initialTrend ? initialPeriod||initialIntent==='edit'?{kind:"entry",date:initialDate,period:initialPeriod??undefined,editing:initialIntent==='edit'}:{kind:"day",date:initialDate} : null);
  const transition=useChartTransitionActions(),[selectedMetric,setSelectedMetric]=useState<MeasurementMetric>('weightKg');
  const preference=useBodyPreferences(preferences,!!drawer),activeMetric:MeasurementMetric=preference.showBodyFat?selectedMetric:'weightKg';
  function updated(result: Extract<EntryResult, { ok: true }>) { setSourceResult(null); setActionResult({ ...result, base: serverRecords }); }

  useEffect(()=>{const latest=()=>{setDrawer(null);};window.addEventListener("formward-load-latest",latest);return()=>window.removeEventListener("formward-load-latest",latest);},[]);
  const range = measurementRange(latestDate, mode, mode === "custom" ? customRange : { start: earliestDate, end: latestDate });
  const displayedRecords = records.filter((row) => row.recordKind !== "estimated");
  const visibleRecords = displayedRecords.filter((row) => row.recordDate >= range.start && row.recordDate <= range.end);
  const daysByDate = new Map(buildMeasurementDays(displayedRecords).map(day => [day.date, day]));
  const chartDates=measurementCalendarPage(range,calendarOrdinal(range.end)-calendarOrdinal(range.start)+1).reverse();
  const fallbackDate=chartDates.includes(today)?today:preferredMorningDate(visibleRecords,activeMetric,today||range.end,choices);
  const selection=useChartDateSelection(chartDates,initialDate??today??fallbackDate,initialDate&&chartDates.includes(initialDate)?initialDate:fallbackDate,calendarOpen,`${showEvening}:${JSON.stringify(choices)}`,true),activeDate=selection.selected;
  const selectedPeriod=selection.active?chartPeriod:undefined;
  const {bindPlot, prepare: prepareRange} = useNestedChartRange({mode, from: range.start, to: range.end, series: activeMetric+":"+showEvening});
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
    prepareRange(nextMode);
    setMode(nextMode);
    setCalendarOpen(false);
  }
  function chooseRecord(date: string, period: "daytime" | "evening", id: string) {
    setChoices((previous) => ({ ...previous, [`${date}:${period}`]: id }));
  }
  function inspectDay(date: string) {
    selection.choose(date);
    setDrawer({kind: "day", date});
  }
  useRepeatedRecordTask('/dashboard/measurements',task=>{
    if(task.intent==='view')inspectDay(task.date);
    else setDrawer({kind:'entry',date:task.date,editing:task.intent==='edit',period:task.period});
  });

  function renderDay(date: string) {
    const day = daysByDate.get(date);
    return <BodyRecordRow key={date} date={date} today={today} records={day?.records ?? []}
      morning={day?.daytimeRecord ?? null} evening={day?.eveningRecord ?? null}
      showFat={preference.showBodyFat}
      onEntry={(editing, period) => setDrawer({kind: "entry", date, editing, period})}/>;
  }

  return <BodyFatContext value={preference.showBodyFat}><RecordWorkspace title="身体" headingId="body-records-title" className={styles.workspace} aria-labelledby="body-records-title" data-shared-route={initialTrend?true:undefined}>

    <section data-record-trend data-chart-selection={selection.regionId} data-selected-date={activeDate} data-selection-origin={selection.origin} {...selection.regionProps} aria-label="身体指标趋势" data-range={mode}>
      <RecordTrendPanel presentation="body"
       range={<ChartRanges value={mode} items={[...ranges.map(item=>[item.value,item.label]),["custom","自定义"]]} change={value=>{if(value==="custom"){setDraftRange(range);setCalendarOpen(true);}else selectRange(value as MeasurementRange);}}/>}
       custom={calendarOpen&&<CustomRecordRange label="身体" value={{from:draftRange.start,to:draftRange.end}} change={next=>setDraftRange({start:next.from,end:next.to})} apply={()=>{setCustomRange(draftRange);selectRange("custom",draftRange);}} cancel={()=>setCalendarOpen(false)}/>}
       date={activeDate} view={()=>{const target={date:activeDate,period:selection.active?chartPeriod:undefined};setDrawer({kind:"day",...target});selection.releasePreview();}} readoutLabel="选中日身体记录"
       metrics={readings} mobileMetrics={[readings[0],{label:"较前一日",value:formatDifference(weight.previousChange,"weightKg",false)??"—",unit:"kg",inlineUnit:true},readings[2]]} chartSummary={changeSummary}

       title={metricName(activeMetric)+" · "+unitFor(activeMetric)}
       options={<div className={styles.mobileChartOptions}>{preference.showBodyFat&&<button type="button" className={styles.mobileMetricToggle} aria-pressed={activeMetric==="bodyFatPercent"} onClick={()=>chooseMetric(activeMetric==="weightKg"?"bodyFatPercent":"weightKg")}>体脂</button>}<label className={styles.toggle}><span>晚间</span><input aria-label="晚间数据" type="checkbox" checked={showEvening} onChange={event=>{transition.invalidate();setShowEvening(event.target.checked);}}/></label></div>}
       legend={<><span><i style={{background:"var(--data-weight)",borderRadius:"50%"}}/>晨间空腹</span>{showEvening&&<span><i style={{background:"var(--data-deficit)",borderRadius:"50%"}}/>晚间</span>}</>}
      ><div data-chart-metric={activeMetric} data-nested-chart ref={bindPlot}><BodyTrendPlot linked={!!initialTrend&&range.start===initialTrend.from&&range.end===initialTrend.to} records={visibleRecords} metric={activeMetric} showEvening={showEvening} interval={range} selectedDate={activeDate} selectedPeriod={selectedPeriod} selection={selection} onPeriod={setChartPeriod} choices={choices}/></div>
      </RecordTrendPanel>
    </section>
    <DailyRecords kind="body" loading={!today} history={{today,dates:measurementCalendarPage(catalog,calendarOrdinal(catalog.end)-calendarOrdinal(catalog.start)+1).filter(date=>date!==today),renderRow:renderDay,view:inspectDay}}>{today && renderDay(today)}</DailyRecords>
    {drawer && <MeasurementInspector key={drawer.kind+":"+drawer.date} routeEntry={!!initialPeriod&&drawer.kind==="entry"&&drawer.date===initialDate} view={drawer} records={records} sources={sources} timezone={timezone} actions={sourceActions} onUpdated={updated} choices={choices} onChoose={chooseRecord} onClose={() => setDrawer(null)} />}
  </RecordWorkspace></BodyFatContext>;
}

function formatDifference(value: number | null, metric: MeasurementMetric, withUnit = true) {
  return value === null ? withUnit ? "—" : null : `${value > 0 ? "+" : ""}${value.toFixed(2)}${withUnit ? metric === "weightKg" ? " kg" : " 百分点" : ""}`;
}
function MeasurementInspector({ routeEntry=false,view, records, sources, timezone, actions, onUpdated, choices, onChoose, onClose }: {
  routeEntry?:boolean;view: DrawerView; records: MeasurementDisplay[]; sources: string[]; timezone: string; actions: MeasurementActions;
  onUpdated: (result: Extract<EntryResult, { ok: true }>) => void; choices: Record<string, string>;
  onChoose: (date: string, period: "daytime" | "evening", id: string) => void; onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null), savedClose = useRef<() => Promise<void>>(() => Promise.resolve());
  const shortcut = useWorkspaceReturn()?.visit?.quick;
  const showFat = useContext(BodyFatContext);
  const day = buildMeasurementDays(records.filter(row => row.recordDate === view.date), choices)[0];
  const editing = view.kind === "entry" && view.editing;
  const title = view.kind === "entry" ? editing ? "编辑身体记录" : "身体录入" : "身体记录详情";
  const entryPeriod = view.period ?? (!day?.daytimeRecord && day?.eveningRecord ? "evening" : "daytime");
  useEffect(() => { heading.current?.focus({preventScroll: true}); }, []);
  return <Inspector routeEntry={routeEntry} fitContent={view.kind === "entry"} title={title+" "+displayDate(view.date)}
    close={onClose} onSavedCloseReady={close=>{savedClose.current=close;}} className={styles.drawer} header={view.kind === "entry"
      ? <MeasurementEntryHeader date={view.date} editing={editing} headingRef={heading}/>
      : <header className={styles.drawerHeader}>
        <div><h2 ref={heading} tabIndex={-1}>{displayDate(view.date)}</h2><p>{weekday(view.date)}</p></div>
        <InspectorCloseButton label="关闭记录详情"/>
      </header>}>
    {view.kind === "entry"
      ? <div className={styles.drawerContent} data-record-intent={editing?"edit":"create"}>
        <MeasurementEntry date={view.date} timezone={timezone} records={records} sources={sources} choices={choices}
          actions={actions} editing={editing} initialPeriod={entryPeriod} onUpdated={onUpdated} onChoose={onChoose} onSaved={routeEntry&&shortcut?()=>void savedClose.current():undefined}/>
      </div>
      : <section className={styles.dayOverview} aria-label="当天晨晚概览" data-record-intent="view">
        {(["daytime", "evening"] as const).map(period => {
          const row = (period === "daytime" ? day?.daytimeRecord : day?.eveningRecord) ?? null;
          return <div key={period} data-overview-period={period} data-active-period={view.period === period || undefined}>
            <MeasurementReading row={row} period={period} showFat={showFat}/>
            {row && <MeasurementFacts row={row} showFat={showFat}/>}
          </div>;
        })}
      </section>}
  </Inspector>;
}
function BodySpark({records,date,metric,choices}:{records:MeasurementDisplay[];date:string;metric:MeasurementMetric;choices:Record<string,string>}){const days=buildMeasurementDays(records.filter(row=>row.recordKind!=='estimated'),choices,metric),byDate=new Map(days.map(day=>[day.date,day.daytimeRecord])),points=Array.from({length:7},(_,i)=>{const at=addCalendarDays(date,i-6),row=byDate.get(at);return{date:at,value:row?.fasting===true&&row[metric]!==null?Number(row[metric]):null};}),scale=normalScale(points.filter(point=>point.value!==null).map(point=>point.value!));return <div className="body-spark" aria-label="最近7日晨间实测，缺测断开"><TrendGlyph model={metricTrendModel('morning-weight',points,scale)}/></div>;}
