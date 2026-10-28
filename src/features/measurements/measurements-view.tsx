"use client";
import {useDraftGuard} from "@/components/draft-guard";
import {measurementVersions} from "@/components/record-change-client";
import {RecordWorkspace,RecordTrendPanel,ChartOptions,CustomRecordRange} from "@/components/record-trend-panel";
import {formatRecordNumber} from "@/components/number-format";
import { useChartMotion } from "@/components/use-chart-motion";
import { ChartRanges } from "@/components/chart-ranges";
import { useChartDateSelection } from "@/components/use-chart-date-selection";
import { DailyRecords,DailyRecordRow } from "@/components/daily-records";
import { RecordHistory } from "@/components/record-history";
import { Inspector } from "@/components/inspector";

import { useEffect, useId, useRef, useState } from "react";
import { buildMeasurementDays, recentMeasurementDays } from "./days";
import { measurementCalendarPage, measurementCalendarRange } from "./calendar";
import { measurementSummary } from "./summary";
import { calendarOrdinal, measurementDateTicks, measurementRange, measurementTrend, normalScale, type MeasurementInterval, type MeasurementMetric, type MeasurementRange } from "./trend";
import styles from "./measurements-view.module.css";
import { estimateModeLabel, estimateUserExplanation } from "./estimate-explanation";
import { localMeasurementDate, measurementDayAction, measurementNeedsEntry, type EntryResult, type MeasurementActions, type MeasurementDateDisplay, type MeasurementDisplay } from "./entry-state";
import { MeasurementEntry } from "./measurement-entry";
import { timezoneLabel } from "./timezone";
import { useMobileMode } from "@/components/use-mobile-mode";
export type { MeasurementDisplay } from "./entry-state";

type MeasurementDay = ReturnType<typeof buildMeasurementDays<MeasurementDisplay>>[number];
type DrawerView = { kind: "entry"; date: string; editing?: boolean } | { kind: "day"; date: string; period?: "daytime" | "evening"; metric: MeasurementMetric } | { kind: "record"; recordId: string; metric: MeasurementMetric };
const metrics = ["weightKg", "bodyFatPercent"] as const;
const ranges: { value: MeasurementRange; label: string }[] = [{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }, { value: "all", label: "全部" }];
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const displayDate = (date: string) => date.replaceAll("-", ".");
const weekday = (date: string) => weekdays[new Date(calendarOrdinal(date) * 86_400_000).getUTCDay()];
const unitFor = (metric: MeasurementMetric) => metric === "weightKg" ? "kg" : "%";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";

export function MeasurementsView({ records: serverRecords, dates: serverDates, sources: serverSources, accountCreatedAt, actions, initialDate = null }: { records: MeasurementDisplay[]; dates: MeasurementDateDisplay[]; sources: string[]; accountCreatedAt: string; actions: MeasurementActions; initialDate?:string|null }) {
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
  const [selectedMode, setMode] = useState<MeasurementRange | null>(null);
  const mode = selectedMode ?? (mobileMode ? "7d" : "30d");
  const [customRange, setCustomRange] = useState<MeasurementInterval>({ start: earliestDate, end: latestDate });
  const [draftRange, setDraftRange] = useState(customRange);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<"daytime" | "evening" | undefined>();
  const [showEvening, setShowEvening] = useState(true);
  const [showEstimates, setShowEstimates] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<DrawerView | null>(initialDate ? {kind:"day",date:initialDate,metric:"weightKg"} : null);
  function updated(result: Extract<EntryResult, { ok: true }>) { setSourceResult(null); setActionResult({ ...result, base: serverRecords }); }

  useEffect(()=>{const latest=()=>{setDrawer(null);};window.addEventListener("formward-load-latest",latest);return()=>window.removeEventListener("formward-load-latest",latest);},[]);
  const range = measurementRange(latestDate, mode, mode === "custom" ? customRange : { start: earliestDate, end: latestDate });
  const displayedRecords = records.filter((row) => showEstimates || row.recordKind !== "estimated");
  const visibleRecords = displayedRecords.filter((row) => row.recordDate >= range.start && row.recordDate <= range.end);
  const recentInterval = { start: catalog.start, end: today || catalog.end };
  const recent = recentMeasurementDays(displayedRecords, recentInterval, choices, 7).filter(day => day.date === today || (!dates.some(row => row.date === day.date && row.reminderSkipped) && measurementNeedsEntry(records, day.date, choices)));
  const chartDates=measurementCalendarPage(range,calendarOrdinal(range.end)-calendarOrdinal(range.start)+1).reverse();
  const preferred=displayedRecords.filter(row=>row.recordDate<=(today||latestDate)&&row.period==="daytime").map(row=>row.recordDate).sort().at(-1)??(today||range.end);
  const selection=useChartDateSelection(chartDates,initialDate??preferred,visibleRecords.map(row=>row.recordDate).sort().at(-1)??range.end,calendarOpen),activeDate=selection.selected;
  const summaries = metrics.map(metric => ({ metric, ...measurementSummary(records.filter(row=>row.recordDate<=(today||localMeasurementDate(new Date(),"Asia/Shanghai"))), metric, choices) }));

  const summaryContent=<div className={styles.panelStats} aria-label="最近值与近7日统计">{summaries.flatMap(summary=>[
   <div key={summary.metric+":latest"}><span>最近{metricName(summary.metric)}</span><strong>{formatRecordNumber(summary.current?.[summary.metric])}<small>{unitFor(summary.metric)}</small></strong><p>{summary.current?displayDate(summary.current.recordDate):"暂无空腹实测"}</p></div>,
   <div key={summary.metric+":change"}><span>近7日{metricName(summary.metric)}变化</span><strong>{formatDifference(summary.change,summary.metric,false)??"—"}</strong></div>,
   <div key={summary.metric+":average"}><span>近7日{metricName(summary.metric)}均值</span><strong>{formatRecordNumber(summary.average)}<small>{unitFor(summary.metric)}</small></strong><p>{summary.coverage}/7天</p></div>
  ])}</div>;

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

  function renderDay(date:string){
    const rows=displayedRecords.filter(row=>row.recordDate===date);
    const days=metrics.map(metric=>buildMeasurementDays(rows,choices,metric,[date])[0]);
    return <DailyRecordRow key={date} date={date} today={today} value={<div className={styles.dailyReadings}>{(["daytime","evening"] as const).map(period=><span key={period}><span className={styles.periodLabel}>{period==="daytime"?"晨间":"晚间"}</span>{metrics.map((metric,index)=>{const day=days[index],row=period==="daytime"?day.daytimeRecord:day.eveningRecord;return <TableReading key={metric} row={row} metric={metric} pendingLabel={day[period].length>1?"待选择":null} onInspect={record=>inspectRecord(record,metric)} onInspectCandidates={()=>inspectDay(date,period,metric)}/>;})}</span>)}</div>}><DayActions date={date} today={today} records={records} onView={()=>inspectDay(date)} onEntry={editing=>setDrawer({kind:"entry",date,editing})}/></DailyRecordRow>;
  }

  return <RecordWorkspace title="身体" headingId="body-records-title" className={styles.workspace} aria-labelledby="body-records-title">
    <section data-chart-selection={selection.regionId} data-selected-date={activeDate} data-pinned-date={selection.pinned??undefined} onMouseLeave={selection.leave} aria-label="身体指标趋势" data-range={mode} style={{visibility:mobileMode===null||!today?"hidden":undefined}}>
      <RecordTrendPanel
       range={<ChartRanges value={mode} items={[...ranges.map(item=>[item.value,item.label]),["custom","自定义"]]} change={value=>{if(value==="custom"){setDraftRange(range);setCalendarOpen(true);}else selectRange(value as MeasurementRange);}}/>}
       custom={calendarOpen&&<CustomRecordRange label="身体" value={{from:draftRange.start,to:draftRange.end}} change={next=>setDraftRange({start:next.from,end:next.to})} apply={()=>{setCustomRange(draftRange);selectRange("custom",draftRange);}} cancel={()=>setCalendarOpen(false)}/>}
       date={activeDate} view={()=>{selection.release();inspectDay(activeDate,chartPeriod);}} readoutLabel="选中日身体记录"
       metrics={metrics.map(metric=>{const selected=buildMeasurementDays(displayedRecords.filter(row=>row.recordDate===activeDate),choices,metric,[activeDate])[0].daytimeRecord;const row=selected?.fasting===true?selected:null;return {label:"晨间"+metricName(metric),value:formatRecordNumber(row?.[metric]),unit:unitFor(metric),note:row?.recordKind==="estimated"?"估计":undefined};})}
       statistics={!mobileMode?summaryContent:undefined}
       title="体重 · kg"
       options={<ChartOptions label={mobileMode?"统计与选项":"图表设置"}>
         {mobileMode&&summaryContent}
         <div className={styles.chartControls}><label className={styles.toggle}><span>晚间</span><input aria-label="晚间数据" type="checkbox" checked={showEvening} onChange={event=>setShowEvening(event.target.checked)}/></label><label className={styles.toggle}><span>估计</span><input aria-label="估计补全" type="checkbox" checked={showEstimates} onChange={event=>setShowEstimates(event.target.checked)}/></label><button type="button" aria-expanded={rulesOpen} onClick={()=>setRulesOpen(!rulesOpen)}>估算规则 {rulesOpen?"−":"＋"}</button></div>
         {rulesOpen && <section id="measurement-estimate-rules" className={styles.rules} aria-label="估算规则">
        <div><h2>历史初始化</h2><p>第一次补齐已有的历史缺口，利用已经存在的前后真实测量恢复中间趋势。</p><p>补全后结果固定，以后新增数据不会反向改写；真实补录会替代对应的估计值。</p></div>
        <div><h2>日常估计</h2><p>只参考目标日期之前的真实历史，有当天实测时以它为基准。优先使用个人真实晨晚差，必要时使用近期真实晨间趋势。</p><p>真实依据不足时保留空缺，不强行补齐。</p></div>
        <p className={styles.rulesPrinciples}>真实测量始终优先。估计只用于辅助趋势，不作为真实测量参与实测统计。</p>
      </section>}
       </ChartOptions>}
       legend={<><span><i style={{background:"#bea478",borderRadius:"50%"}}/>晨间空腹</span>{showEvening&&<span><i style={{background:"#93adb5",borderRadius:"50%"}}/>晚间</span>}{showEstimates&&visibleRecords.some(row=>row.recordKind==="estimated")&&<span>虚线 · 估计</span>}</>}
      ><div data-chart-metric="weightKg"><TrendPlot records={visibleRecords} metric="weightKg" showEvening={showEvening} interval={range} selectedDate={activeDate} selectedPeriod={chartPeriod} selection={selection} onPeriod={setChartPeriod} choices={choices}/></div>
       <div className={styles.additionalMetric} data-chart-metric="bodyFatPercent"><div className={styles.metricHeading}><h2>体脂 · %</h2></div><TrendPlot records={visibleRecords} metric="bodyFatPercent" showEvening={showEvening} interval={range} selectedDate={activeDate} selectedPeriod={chartPeriod} selection={selection} onPeriod={setChartPeriod} choices={choices}/></div>
      </RecordTrendPanel>
    </section>
    <DailyRecords history={<RecordHistory today={today} dates={(catalog.start&&catalog.end?measurementCalendarPage(catalog,calendarOrdinal(catalog.end)-calendarOrdinal(catalog.start)+1):[]).filter(date=>!recent.some(day=>day.date===date))} renderRow={renderDay} view={inspectDay}/>}>{recent.map(day=>renderDay(day.date))}</DailyRecords>
    {drawer && <MeasurementInspector view={drawer} records={records} sources={sources} today={today} timezone={timezone} actions={sourceActions} onUpdated={updated} choices={choices} onChoose={chooseRecord} onClose={() => setDrawer(null)} />}
  </RecordWorkspace>;
}

function Missing() { return <span aria-label="未记录" className={styles.missing}>—</span>; }
function DayActions({ date, today, records, onView, onEntry }: { date: string; today: string; records: MeasurementDisplay[]; onView: () => void; onEntry: (editing: boolean) => void }) {
  const action = measurementDayAction(records, date, today);
  return <div className={styles.rowActions}><button type="button" aria-label={`查看 ${date}`} onClick={onView}>查看</button><button type="button" aria-label={`${action} ${date}`} onClick={() => onEntry(action === "编辑")}>{action}</button></div>;
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
  const estimated = row.recordKind === "estimated";
  const otherMetric = metric === "weightKg" ? "bodyFatPercent" : "weightKg";
  const explanation = estimated ? estimateUserExplanation(row.estimation, row.recordDate, metric) : null;
  return <article className={styles.recordDetails} data-inspector-record={row.id} data-kind={row.recordKind} aria-label="记录详情">
    <p className={styles.recordMetric}>{metricName(metric)}</p>
    <p className={`${styles.recordReading} ${row.period === "daytime" ? styles.dayValue : styles.nightValue}`} data-record-value={metric} data-estimate-value={estimated ? metric : undefined}>
      <strong>{formatRecordNumber(row[metric])}</strong><span>{unitFor(metric)}</span>
    </p>
    {(row[otherMetric] !== null) && <div className={styles.otherReadings} aria-label="同条记录的其他指标">
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
function MeasurementInspector({ view, records, sources, today, timezone, actions, onUpdated, choices, onChoose, onClose }: {
  view: DrawerView; records: MeasurementDisplay[]; sources: string[]; today: string; timezone: string; actions: MeasurementActions;
  onUpdated: (result: Extract<EntryResult, { ok: true }>) => void; choices: Record<string, string>;
  onChoose: (date: string, period: "daytime" | "evening", id: string) => void; onClose: () => void;
}) {
  const dismiss=useRef<()=>void>(()=>onClose());
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [editor, setEditor] = useState<{ date: string; editing: boolean } | null>(() => view.kind === "entry" ? { date: view.date, editing: !!view.editing } : null);
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
  function requestClose(){dismiss.current();}
  useEffect(() => {
    content.current!.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [navigationKey]);
  function entryUpdated(result: Extract<EntryResult, { ok: true }>) {
    if (active && row?.recordKind === "estimated") {
      const replacement = result.records.find(candidate => candidate.recordKind === "observed" && candidate.recordDate === active.date && candidate.period === row.period && candidate[active.metric] !== null);
      if (replacement) setActive({ ...active, recordId: replacement.id });
    }
    onUpdated(result);
  }
  return <Inspector title="身体记录详情" close={onClose} onCloseReady={close=>{dismiss.current=close;}} className={styles.drawer} header={(
    <header className={styles.drawerHeader}><div>
      <h2 ref={heading} tabIndex={-1} id="measurement-drawer-title">{editor ? displayDate(editor.date) : active ? displayDate(active.date) || "记录详情" : "记录详情"}</h2>
      <p>{(editor?weekday(editor.date):active?weekday(active.date):"")+" · 晨间／晚间"}</p>
    </div><button type="button" autoFocus aria-label="关闭记录详情" onClick={requestClose}>×</button></header>)}>
    {(editor || active) && <DayOverview date={editor?.date ?? active!.date} records={records} choices={choices} />}
    <div ref={content} className={styles.drawerContent}>
      {editor && <><button type="button" className={styles.historyBack} onClick={() => { if (view.kind === "entry") requestClose(); else setEditor(null); }}>← {view.kind === "entry" ? "返回身体记录" : active ? "返回记录详情" : "返回身体记录"}</button><MeasurementEntry key={editor.date} date={editor.date} timezone={timezone} records={records} sources={sources} choices={{ ...choices, ...editorChoices }} actions={actions} editing={editor.editing} onUpdated={entryUpdated} onChoose={(date, period, id) => setEditorChoices(previous => ({ ...previous, [`${date}:${period}`]: id }))} /></>}
      {!editor && active && activeDay && <>
        <button type="button" className={styles.editRecord} onClick={() => { if (row?.recordKind === "observed") setEditorChoices(previous => ({ ...previous, [`${active.date}:${row.period}`]: row.id })); setEditor({ date: active.date, editing: true }); }}>{measurementDayAction(records, active.date, today)}</button>
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
              <RepresentativeChoices day={activeDay} period={period} metric={active.metric} choices={choices} onChoose={(date, period, id) => { onChoose(date, period, id); setActive({ ...active, recordId: id || null, period }); }} />
            </> : null}</>}
          </details>;
        })}
      </>}
      {!editor && active && !activeDay && <p className={styles.emptyHistory}>此记录已不可用。</p>}
    </div>
  </Inspector>;
}
function DayOverview({ date, records, choices }: { date: string; records: MeasurementDisplay[]; choices: Record<string, string> }) {
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
function RepresentativeChoices({ day, metric, choices, period: onlyPeriod, onChoose }: {
  day: MeasurementDay; metric: MeasurementMetric; period?: "daytime" | "evening"; choices: Record<string, string>;
  onChoose: (date: string, period: "daytime" | "evening", id: string) => void;
}) {
  return <>{(["daytime", "evening"] as const).map(period => (!onlyPeriod || onlyPeriod === period) && day[period].length > 1 && <label key={period} className={styles.choice}>
    {period === "daytime" ? "白天" : "晚间"}代表记录
    <select aria-label={`${period === "daytime" ? "白天" : "晚间"}代表记录`} value={choices[`${day.date}:${period}`] ?? ""} onChange={event => onChoose(day.date, period, event.target.value)}>
      <option value="">选择用于趋势的记录</option>{day[period].map(row => <option key={row.id} value={row.id}>{recordTimeLabel(row)} · {formatRecordNumber(row[metric])} {unitFor(metric)}</option>)}
    </select>
  </label>)}</>;
}

function TrendPlot({ records, metric, showEvening, interval, selectedDate, selectedPeriod, selection, onPeriod, choices }: {
  records: MeasurementDisplay[]; metric: MeasurementMetric; showEvening: boolean; interval: MeasurementInterval;
  selectedDate: string | null; selectedPeriod?: "daytime" | "evening"; selection:ReturnType<typeof useChartDateSelection>; onPeriod:(period:"daytime"|"evening")=>void; choices: Record<string, string>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const plotId = useId(), mobile=useMobileMode();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [hintRecordId, setHintRecordId] = useState<string | null>(null);
  useEffect(() => {
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
  const hintedRecord = points.find((row) => row.id === hintRecordId) ?? points.find(row => row.recordDate === selectedDate && row.period === (selectedPeriod ?? "daytime")) ?? points.find(row => row.recordDate === selectedDate);
  const activate = (row: MeasurementDisplay) => {selection.pin(row.recordDate);onPeriod(row.period);};


  return <>
    <div className={styles.plotViewport} ref={viewport}>
      <svg className={styles.plot} style={{ visibility: viewportWidth > 0 ? undefined : "hidden" }} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${metricName(metric)}趋势，数值越高位置越高`}>
        <title>{`${metricName(metric)}趋势`}</title>
        {scale?.ticks.map((value) => <g key={value}><line x1="48" x2={width - 24} y1={y(String(value))} y2={y(String(value))} className={styles.grid} /><text x="37" y={y(String(value)) + 4} textAnchor="end" className={styles.axis}>{value.toFixed(1)}</text></g>)}
        {ticks.map((date) => <text key={date} x={x(date)} y={height-10} textAnchor="middle" className={styles.axis}>{date.slice(5).replace("-", "/")}</text>)}
        {selectedDate && <line x1={x(selectedDate)} x2={x(selectedDate)} y1="14" y2={plotBottom+6} className={styles.selectedDayLine} />}
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
          return <g key={row.id} data-point-id={row.id} data-date={row.recordDate} data-value={row[metric]} data-period={row.period} data-kind={row.recordKind} role="button" tabIndex={0} aria-label={label} aria-pressed={row.recordDate === selectedDate} data-chart-date={row.recordDate} onMouseMove={() => { if(!selection.pinned){setHintRecordId(row.id);selection.preview(row.recordDate);onPeriod(row.period);} }} onMouseLeave={() => setHintRecordId(null)} onFocus={() => {setHintRecordId(row.id);selection.choose(row.recordDate);onPeriod(row.period);}} onBlur={() => setHintRecordId(null)} onClick={() => activate(row)} onKeyDown={(event) => {selection.keyDown(event,row.recordDate);if(event.key==="Enter"||event.key===" ")activate(row);}}>
            <title>{estimated ? label : `${recordTimeLabel(row)} · ${label}`}</title>
            <defs><clipPath id={clipId}><rect x={clipLeft} y={clipTop} width={clipRight - clipLeft} height={clipBottom - clipTop} /></clipPath></defs>
            <circle cx={x(row.recordDate)} cy={ownY} r="14" className={styles.hitTarget} clipPath={`url(#${clipId})`} />
            {row.recordDate === selectedDate && <circle cx={x(row.recordDate)} cy={y(row[metric])} r="8" className={styles.selectedPoint} />}
            {estimated ? <path d={`M ${x(row.recordDate)} ${y(row[metric]) - 4} l 4 4 l -4 4 l -4 -4 Z`} className={`${styles.estimatePoint} ${row.period === "daytime" ? styles.dayEstimate : styles.nightEstimate}`} /> : <circle cx={x(row.recordDate)} cy={y(row[metric])} r={row.period === "daytime" ? "4" : "3.2"} className={row.period === "daytime" ? styles.dayPoint : styles.nightPoint} />}
          </g>;
        })}
        {!points.length && <text x={width / 2} y="118" textAnchor="middle" className={styles.emptyChart}>{`此区间暂无${showEvening ? "" : "空腹"}${metricName(metric)}记录`}</text>}
      </svg>
    </div>
    <output className={styles.plotHint} aria-live="polite">{hintedRecord?pointLabel(hintedRecord):""}</output>
  </>;
}
