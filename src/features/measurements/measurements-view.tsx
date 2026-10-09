"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buildMeasurementDays, recentMeasurementDays } from "./days";
import { measurementCalendarPage, measurementCalendarRange } from "./calendar";
import { measurementSummary } from "./summary";
import { calendarOrdinal, measurementDateTicks, measurementRange, measurementTrend, metricDifference, normalScale, type MeasurementInterval, type MeasurementMetric, type MeasurementRange } from "./trend";
import styles from "./measurements-view.module.css";
import { estimateModeLabel, estimateUserExplanation } from "./estimate-explanation";
import { localMeasurementDate, measurementDayAction, type EntryResult, type MeasurementActions, type MeasurementDateDisplay, type MeasurementDisplay } from "./entry-state";
import { MeasurementEntry } from "./measurement-entry";
import { lockPageScroll } from "@/components/scroll-lock";
import { timezoneLabel } from "./timezone";
export type { MeasurementDisplay } from "./entry-state";

type MeasurementDay = ReturnType<typeof buildMeasurementDays<MeasurementDisplay>>[number];
type DrawerView = { kind: "entry"; date: string; editing?: boolean } | { kind: "history" } | { kind: "day"; date: string; period?: "daytime" | "evening"; metric: MeasurementMetric } | { kind: "record"; recordId: string; metric: MeasurementMetric };
const metrics = ["weightKg", "bodyFatPercent"] as const;
const ranges: { value: MeasurementRange; label: string }[] = [{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }, { value: "all", label: "全部" }];
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const displayDate = (date: string) => date.replaceAll("-", ".");
const shortDate = (date: string) => date.slice(5).replace("-", ".");
const weekday = (date: string) => weekdays[new Date(calendarOrdinal(date) * 86_400_000).getUTCDay()];
const unitFor = (metric: MeasurementMetric) => metric === "weightKg" ? "kg" : "%";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";

export function MeasurementsView({ records: serverRecords, dates: serverDates, sources: serverSources, accountCreatedAt, actions }: { records: MeasurementDisplay[]; dates: MeasurementDateDisplay[]; sources: string[]; accountCreatedAt: string; actions: MeasurementActions }) {
  const [actionResult, setActionResult] = useState<(Extract<EntryResult, { ok: true }> & { base: MeasurementDisplay[] }) | null>(null);
  // 保存结果即时反馈；新的服务端快照抵达后接管，不能长期保留首次加载数据。
  const { records, dates, sources } = actionResult?.base === serverRecords ? actionResult : { records: serverRecords, dates: serverDates, sources: serverSources };
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
  const [mode, setMode] = useState<MeasurementRange>("30d");
  const [customRange, setCustomRange] = useState<MeasurementInterval>({ start: earliestDate, end: latestDate });
  const [draftRange, setDraftRange] = useState(customRange);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const calendarButton = useRef<HTMLButtonElement>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showEvening, setShowEvening] = useState(true);
  const [showEstimates, setShowEstimates] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<DrawerView | null>(null);
  function updated(result: Extract<EntryResult, { ok: true }>) { setActionResult({ ...result, base: serverRecords }); }
  if (!latestDate) return <section className={styles.empty}><h1>身体记录</h1><p>暂无测量记录。</p></section>;

  const range = measurementRange(latestDate, mode, mode === "custom" ? customRange : { start: earliestDate, end: latestDate });
  const displayedRecords = records.filter((row) => showEstimates || row.recordKind !== "estimated");
  const visibleRecords = displayedRecords.filter((row) => row.recordDate >= range.start && row.recordDate <= range.end);
  const recentInterval = { start: range.start > catalog.start ? range.start : catalog.start, end: range.end < catalog.end ? range.end : catalog.end };
  const recent = recentMeasurementDays(displayedRecords, recentInterval, choices);
  const fatDays = new Map(recentMeasurementDays(displayedRecords, recentInterval, choices, 10, "bodyFatPercent").map(day => [day.date, day]));
  const activeDate = selectedDate && selectedDate >= range.start && selectedDate <= range.end ? selectedDate : null;
  const summaries = metrics.map(metric => ({ metric, ...measurementSummary(records, metric, choices) }));

  function selectRange(nextMode: MeasurementRange, nextInterval = customRange) {
    const next = measurementRange(latestDate, nextMode, nextMode === "custom" ? nextInterval : { start: earliestDate, end: latestDate });
    if (selectedDate && (selectedDate < next.start || selectedDate > next.end)) setSelectedDate(null);
    setMode(nextMode);
    setCalendarOpen(false);
  }
  function chooseRecord(date: string, period: "daytime" | "evening", id: string) {
    setChoices((previous) => ({ ...previous, [`${date}:${period}`]: id }));
  }
  function inspectRecord(row: MeasurementDisplay, metric: MeasurementMetric) {
    setSelectedDate(row.recordDate);
    setDrawer({ kind: "record", recordId: row.id, metric });
  }
  function inspectDay(date: string, period?: "daytime" | "evening", metric: MeasurementMetric = "weightKg") {
    setSelectedDate(date);
    setDrawer({ kind: "day", date, period, metric });
  }

  return <section className={styles.workspace} aria-labelledby="body-records-title">
    <div className={styles.heading}>
      <h1 id="body-records-title">身体记录</h1>
    </div>
    {!records.length && <p className={styles.emptyHistory}>暂无测量记录。点击日期行的录入开始记录。</p>}
    <section className={styles.summary} aria-label="最新空腹摘要">
      {summaries.map(summary => <div key={summary.metric} className={styles.current} data-summary="current" data-metric={summary.metric}>
        <span>当前{metricName(summary.metric)}</span>
        <strong>{summary.current?.[summary.metric] ?? "—"}<small>{unitFor(summary.metric)}</small></strong>
        <p>{summary.current ? <>晨间空腹 · <time dateTime={summary.current.recordDate}>{displayDate(summary.current.recordDate)}</time></> : "暂无空腹记录"}</p>
      </div>)}
      {summaries.map(summary => <div key={summary.metric} data-summary="change" data-metric={summary.metric}>
        <span>{metricName(summary.metric)} · 7 日变化</span>
        <strong>{formatDifference(summary.change, summary.metric, false) ?? "—"}<small>{summary.metric === "weightKg" ? "kg" : "百分点"}</small></strong>
        <p>{summary.changeStart ? `${shortDate(summary.changeStart)} — ${shortDate(summary.end!)}` : "不足 2 个记录日"}</p>
      </div>)}
      {summaries.map(summary => <div key={summary.metric} data-summary="average" data-metric={summary.metric}>
        <span>{metricName(summary.metric)} · 7 日均值</span>
        <strong>{summary.average?.toFixed(2) ?? "—"}<small>{unitFor(summary.metric)}</small></strong>
        <p>{summary.coverage}/7 天{summary.end && ` · 截至 ${shortDate(summary.end)}`}</p>
      </div>)}
    </section>
    <section className={styles.chartPanel} aria-label="身体指标趋势">
      <div className={styles.chartToolbar}>
        <span className={styles.rangeCaption} title={`${displayDate(range.start)} — ${displayDate(range.end)}`}>
          <span className={styles.rangeFull}>{displayDate(range.start)} — {displayDate(range.end)}</span>
          <span className={styles.rangeShort}><small>{range.start.slice(0, 4) === range.end.slice(0, 4) ? range.end.slice(0, 4) : `${range.start.slice(0, 4)} — ${range.end.slice(0, 4)}`}</small><span>{shortDate(range.start)} — {shortDate(range.end)}</span></span>
        </span>
        <div className={styles.rangeTabs} aria-label="日期视角">
            {ranges.map((item) => <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => selectRange(item.value)}>{item.label}</button>)}
            <button type="button" ref={calendarButton} aria-label="自定义日期" aria-pressed={mode === "custom"} aria-expanded={calendarOpen} aria-controls="measurement-calendar" onClick={() => { setDraftRange(range); setRangeError(""); setCalendarOpen(!calendarOpen); }}><CalendarIcon /><span>自定义</span></button>
        </div>
        <div className={styles.chartControls}>
          <label className={styles.toggle}><span>晚间</span><input aria-label="晚间数据" type="checkbox" checked={showEvening} onChange={(event) => setShowEvening(event.target.checked)} /></label>
          <div className={styles.estimateControls}>
            <label className={styles.toggle}><span>估计</span><input aria-label="估计补全" type="checkbox" checked={showEstimates} onChange={(event) => setShowEstimates(event.target.checked)} /></label>
            <button type="button" className={styles.rulesButton} aria-expanded={rulesOpen} aria-controls="measurement-estimate-rules" onClick={() => setRulesOpen(!rulesOpen)}>估算规则<span aria-hidden="true">{rulesOpen ? "−" : "+"}</span></button>
          </div>
        </div>
      </div>
      {rulesOpen && <section id="measurement-estimate-rules" className={styles.rules} aria-label="估算规则">
        <div><h2>历史初始化</h2><p>第一次补齐已有的历史缺口，利用已经存在的前后真实测量恢复中间趋势。</p><p>补全后结果固定，以后新增数据不会反向改写；真实补录会替代对应的估计值。</p></div>
        <div><h2>日常估计</h2><p>只参考目标日期之前的真实历史，有当天实测时以它为基准。优先使用个人真实晨晚差，必要时使用近期真实晨间趋势。</p><p>真实依据不足时保留空缺，不强行补齐。</p></div>
        <p className={styles.rulesPrinciples}>真实测量始终优先。估计只用于辅助趋势，不作为真实测量参与实测统计。</p>
      </section>}
      {calendarOpen && <form id="measurement-calendar" className={styles.calendar} aria-label="自定义日期范围" onKeyDown={(event) => { if (event.key === "Escape") { setCalendarOpen(false); calendarButton.current?.focus(); } }} onSubmit={(event) => {
        event.preventDefault();
        try { measurementRange(latestDate, "custom", draftRange); }
        catch { setRangeError("请输入有效日期，起始日期不能晚于结束日期。"); return; }
        setCustomRange(draftRange); selectRange("custom", draftRange); calendarButton.current?.focus();
      }}>
        <label>起始日期<input autoFocus required type="date" min="1000-01-01" max="9999-12-31" value={draftRange.start} onChange={(event) => setDraftRange({ ...draftRange, start: event.target.value })} /></label>
        <label>结束日期<input required type="date" min="1000-01-01" max="9999-12-31" value={draftRange.end} onChange={(event) => setDraftRange({ ...draftRange, end: event.target.value })} /></label>
        <button type="submit">应用</button><button type="button" onClick={() => { setCalendarOpen(false); calendarButton.current?.focus(); }}>取消</button>
        {rangeError && <p role="alert">{rangeError}</p>}
      </form>}
      {metrics.map(metric => <div className={styles.metricPlot} key={metric} data-chart-metric={metric}>
        <h2>{metricName(metric)}<small>{unitFor(metric)}</small></h2>
        <TrendPlot records={visibleRecords} metric={metric} showEvening={showEvening} interval={range} selectedDate={activeDate} onInspect={row => inspectRecord(row, metric)} choices={choices} />
      </div>)}
    </section>
    <section className={styles.history} aria-label="最近记录">
      <div className={styles.sectionTitle}><h2>最近记录</h2><span>● 实测 · ◇ 估计 · 实测晨晚差</span></div>
      {recent.length ? <table>
        <colgroup><col className={styles.dateColumn} /><col className={styles.readingColumn} /><col className={styles.readingColumn} /><col className={styles.differenceColumn} /><col className={styles.actionColumn} /></colgroup>
        <thead><tr><th scope="col">日期</th><th scope="col">晨间</th><th scope="col" title="晚间 · 非空腹">晚间<small> · 非空腹</small></th><th scope="col">差值</th><th scope="col">操作</th></tr></thead>
        <tbody>{recent.map((day) => <tr data-date={day.date} key={day.date} data-selected={day.date === activeDate}>
          <th scope="row"><button type="button" aria-label={`查看日期 ${day.date}`} aria-pressed={day.date === activeDate} onClick={() => inspectDay(day.date)}><time dateTime={day.date}>{shortDate(day.date)}</time><small>{weekday(day.date)}</small></button></th>
          {(["daytime", "evening"] as const).map(period => <td key={period} className={period === "daytime" ? styles.dayValue : styles.nightValue}>{metrics.map(metric => {
            const metricDay = metric === "weightKg" ? day : fatDays.get(day.date)!;
            const row = period === "daytime" ? metricDay.daytimeRecord : metricDay.eveningRecord;
            return <div className={styles.tableLine} key={metric} data-table-metric={metric}><TableReading row={row} metric={metric} pendingLabel={metricDay[period].length > 1 ? `查看 ${day.date} ${period === "daytime" ? "白天" : "晚间"}${metricName(metric)}候选记录` : null} onInspect={row => inspectRecord(row, metric)} onInspectCandidates={() => inspectDay(day.date, period, metric)} /></div>;
          })}</td>)}
          <td>{metrics.map(metric => { const metricDay = metric === "weightKg" ? day : fatDays.get(day.date)!; return <div className={styles.tableLine} key={metric} data-difference-metric={metric}>{formatDifference(metricDifference(metricDay.daytimeRecord, metricDay.eveningRecord, metric), metric, false) ?? <Missing />}<small>{metric === "weightKg" ? "kg" : "百分点"}</small></div>; })}</td>
          <td><DayActions date={day.date} today={today} records={records} onView={() => inspectDay(day.date)} onEntry={editing => setDrawer({ kind: "entry", date: day.date, editing })} /></td>
        </tr>)}</tbody>
      </table> : <p className={styles.emptyHistory}>此区间暂无记录。</p>}
      <div className={styles.historyFooter}><button type="button" className={styles.fullHistory} onClick={() => setDrawer({ kind: "history" })}>查看全部 <span aria-hidden="true">↗</span></button></div>
    </section>
    {drawer && <MeasurementInspector view={drawer} records={records} sources={sources} today={today} timezone={timezone} actions={actions} onUpdated={updated} catalog={catalog} choices={choices} onChoose={chooseRecord} onClose={() => setDrawer(null)} />}
  </section>;
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
    <span className={styles.readingStatus} title={row.recordKind === "estimated" ? "估计" : "实测"} aria-hidden="true">{row.recordKind === "estimated" ? "◇" : "●"}</span>{row[metric]}<small>{unitFor(metric)}</small>
  </button>;
}
function RecordDetails({ row, metric, onMetric }: { row: MeasurementDisplay; metric: MeasurementMetric; onMetric: (metric: MeasurementMetric) => void }) {
  const estimated = row.recordKind === "estimated";
  const otherMetric = metric === "weightKg" ? "bodyFatPercent" : "weightKg";
  const explanation = estimated ? estimateUserExplanation(row.estimation, row.recordDate, metric) : null;
  return <article className={styles.recordDetails} data-inspector-record={row.id} data-kind={row.recordKind} aria-label="记录详情">
    <p className={styles.recordMetric}>{metricName(metric)}</p>
    <p className={`${styles.recordReading} ${row.period === "daytime" ? styles.dayValue : styles.nightValue}`} data-record-value={metric} data-estimate-value={estimated ? metric : undefined}>
      <strong>{row[metric] ?? "—"}</strong><span>{unitFor(metric)}</span>
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
  return row.entryChannel === "development_backend" ? "开发后台加入" : row.entryChannel === "manual" ? "手动录入" : row.entryChannel === "api" ? "API 写入" : row.sourceSystem ?? (row.sourceType === "import" ? "导入 · 来源系统未提供" : row.sourceType === "manual" ? "手动录入" : row.sourceType);
}
function recordTimeLabel(row: MeasurementDisplay) { return row.timePrecision === "second" ? row.sourceLocalTime : "无"; }
function formatDifference(value: number | null, metric: MeasurementMetric, withUnit = true) {
  return value === null ? withUnit ? "—" : null : `${value > 0 ? "+" : ""}${value.toFixed(2)}${withUnit ? metric === "weightKg" ? " kg" : " 百分点" : ""}`;
}
function CalendarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7 2v6M17 2v6M4 11h16" /></svg>;
}
type InspectorSelection = { date: string; recordId: string | null; metric: MeasurementMetric; period?: "daytime" | "evening" };
function MeasurementInspector({ view, records, sources, today, timezone, actions, onUpdated, catalog, choices, onChoose, onClose }: {
  view: DrawerView; records: MeasurementDisplay[]; sources: string[]; today: string; timezone: string; actions: MeasurementActions;
  onUpdated: (result: Extract<EntryResult, { ok: true }>) => void; catalog: MeasurementInterval; choices: Record<string, string>;
  onChoose: (date: string, period: "daytime" | "evening", id: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const historyPosition = useRef({ scroll: 0, trigger: null as HTMLElement | null });
  const [editor, setEditor] = useState<{ date: string; editing: boolean } | null>(() => view.kind === "entry" ? { date: view.date, editing: !!view.editing } : null);
  const [historyLimit, setHistoryLimit] = useState(50);
  const historyDates = measurementCalendarPage(catalog, historyLimit);
  const historySet = new Set(historyDates);
  const days = buildMeasurementDays(records.filter(row => historySet.has(row.recordDate)), choices, "weightKg", historyDates);
  const historyFat = new Map(buildMeasurementDays(records.filter(row => historySet.has(row.recordDate)), choices, "bodyFatPercent", historyDates).map(day => [day.date, day]));
  const totalDays = calendarOrdinal(catalog.end) - calendarOrdinal(catalog.start) + 1;
  const [editorChoices, setEditorChoices] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string[]>(() => view.kind === "record" ? [records.find(row => row.id === view.recordId)?.period ?? "daytime"] : view.kind === "day" && view.period ? [view.period] : []);
  const [active, setActive] = useState<InspectorSelection | null>(() => {
    if (view.kind === "history") return null;
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
  const closing = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const closeCallback = useRef(onClose);
  useEffect(() => { closeCallback.current = onClose; }, [onClose]);
  function requestClose() {
    if (closing.current) return;
    closing.current = true;
    const node = dialog.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { closeCallback.current(); return; }
    node.dataset.motion = "closing";
    // animationend 是正常退出路径，计时器覆盖动画被取消或浏览器未派发事件。
    closeTimer.current = window.setTimeout(() => closeCallback.current(), 280);
  }
  useEffect(() => {
    const node = dialog.current!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduceMotion = () => {
      if (!motion.matches) return;
      if (closing.current) closeCallback.current();
      else node.dataset.motion = "open";
    };
    const previousFocus = document.activeElement;
    node.showModal();
    const unlock = lockPageScroll();
    closing.current = false;
    node.dataset.motion = motion.matches ? "open" : "opening";
    motion.addEventListener("change", reduceMotion);
    return () => {
      motion.removeEventListener("change", reduceMotion);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      node.close();
      unlock();
      if (previousFocus instanceof HTMLElement || previousFocus instanceof SVGElement) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (navigationKey === "history") {
      content.current!.scrollTop = historyPosition.current.scroll;
      historyPosition.current.trigger?.focus({ preventScroll: true });
    } else {
      content.current!.scrollTop = 0;
      heading.current?.focus({ preventScroll: true });
    }
  }, [navigationKey]);
  function inspectFromHistory(day: MeasurementDay, row: MeasurementDisplay, trigger: HTMLElement, metric: MeasurementMetric = "weightKg") {
    historyPosition.current = { scroll: content.current!.scrollTop, trigger };
    setActive({ date: day.date, recordId: row.id, metric, period: row.period }); setExpanded([row.period]);
  }
  function entryUpdated(result: Extract<EntryResult, { ok: true }>) {
    if (active && row?.recordKind === "estimated") {
      const replacement = result.records.find(candidate => candidate.recordKind === "observed" && candidate.recordDate === active.date && candidate.period === row.period && candidate[active.metric] !== null);
      if (replacement) setActive({ ...active, recordId: replacement.id });
    }
    onUpdated(result);
  }
  return <dialog ref={dialog} className={styles.drawer} aria-labelledby="measurement-drawer-title" onCancel={event => { event.preventDefault(); requestClose(); }} onAnimationEnd={event => {
    if (event.target !== event.currentTarget || event.nativeEvent.pseudoElement || event.animationName !== window.getComputedStyle(event.currentTarget).animationName) return;
    if (closing.current) { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); closeCallback.current(); }
    else event.currentTarget.dataset.motion = "open";
  }} onClose={(event) => {
    // Strict Mode 清理时的 close 事件可能在再次 showModal 后送达；只同步真正关闭的状态。
    if (!event.currentTarget.open) requestClose();
  }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const collapsed = [...event.currentTarget.querySelectorAll('details:not([open])')];
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, select, input, summary, [tabindex]')]
      // 折叠内容可能仍有布局矩形；其中只有直接的 summary 可以接收焦点。
      .filter((node) => node.tabIndex >= 0 && !node.matches(":disabled") && node.getClientRects().length > 0
        && collapsed.every(details => !details.contains(node) || details.querySelector(":scope > summary") === node));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={(event) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) requestClose();
  }}>
    <header className={styles.drawerHeader}><div>
      {!editor && view.kind === "history" && active && <button type="button" className={styles.historyBack} onClick={() => setActive(null)}>← 返回完整历史</button>}
      <h2 ref={heading} tabIndex={-1} id="measurement-drawer-title">{editor ? displayDate(editor.date) : active ? displayDate(active.date) || "记录详情" : "完整历史"}</h2>
      <p>{editor ? `${weekday(editor.date)} · 体重与体脂 · 晨间／晚间` : active ? `${weekday(active.date)} · 晨间／晚间` : `${totalDays} 个日期 · ${records.filter(row => row.recordKind !== "estimated").length} 条实测 · ${records.filter(row => row.recordKind === "estimated").length} 条估计`}</p>
    </div><button type="button" autoFocus aria-label="关闭记录详情" onClick={requestClose}>×</button></header>
    {(editor || active) && <DayOverview date={editor?.date ?? active!.date} records={records} choices={choices} />}
    <div ref={content} className={styles.drawerContent}>
      {editor && <><button type="button" className={styles.historyBack} onClick={() => { if (view.kind === "entry") requestClose(); else setEditor(null); }}>← {view.kind === "entry" ? "返回身体记录" : active ? "返回记录详情" : "返回完整历史"}</button><MeasurementEntry key={editor.date} date={editor.date} timezone={timezone} records={records} sources={sources} choices={{ ...choices, ...editorChoices }} actions={actions} editing={editor.editing} onUpdated={entryUpdated} onChoose={(date, period, id) => setEditorChoices(previous => ({ ...previous, [`${date}:${period}`]: id }))} /></>}
      {view.kind === "history" && <div hidden={active !== null || editor !== null}>
        {days.map(day => <details className={styles.historyDay} key={day.date}>
          <summary><time dateTime={day.date}>{displayDate(day.date)}</time><span>{(["daytime", "evening"] as const).map(period => <span key={period} className={period === "daytime" ? styles.dayValue : styles.nightValue}>{metrics.map(metric => { const metricDay = metric === "weightKg" ? day : historyFat.get(day.date)!; const row = period === "daytime" ? metricDay.daytimeRecord : metricDay.eveningRecord; return <span className={styles.historyReading} key={metric}>{row?.[metric] ?? "—"} <small>{unitFor(metric)}{row?.recordKind === "estimated" && " ◇"}</small></span>; })}</span>)}</span></summary>
          {day.records.length > 0 && <RecordList day={day} metric="weightKg" onInspect={(row, trigger, metric) => inspectFromHistory(day, row, trigger, metric)} />}
          <DayActions date={day.date} today={today} records={records} onView={() => { historyPosition.current = { scroll: content.current!.scrollTop, trigger: document.activeElement as HTMLElement }; setActive({ date: day.date, recordId: null, metric: "weightKg" }); setExpanded([]); }} onEntry={editing => { historyPosition.current = { scroll: content.current!.scrollTop, trigger: document.activeElement as HTMLElement }; setEditor({ date: day.date, editing }); }} />
        </details>)}
        {historyLimit < totalDays && <button type="button" className={styles.loadHistory} onClick={() => setHistoryLimit(limit => limit + 50)}>加载更早日期</button>}
      </div>}
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
  </dialog>;
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
      <option value="">选择用于趋势的记录</option>{day[period].map(row => <option key={row.id} value={row.id}>{recordTimeLabel(row)} · {row[metric] ?? "—"} {unitFor(metric)}</option>)}
    </select>
  </label>)}</>;
}

function TrendPlot({ records, metric, showEvening, interval, selectedDate, onInspect, choices }: {
  records: MeasurementDisplay[]; metric: MeasurementMetric; showEvening: boolean; interval: MeasurementInterval;
  selectedDate: string | null; onInspect: (row: MeasurementDisplay) => void; choices: Record<string, string>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const plotId = useId();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [hintRecordId, setHintRecordId] = useState<string | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, []);
  const { points, segments, pairs } = measurementTrend(records, metric, showEvening, choices);
  const width = Math.max(240, viewportWidth || 960);
  const span = calendarOrdinal(interval.end) - calendarOrdinal(interval.start);
  const x = (date: string) => span ? 48 + (calendarOrdinal(date) - calendarOrdinal(interval.start)) / span * (width - 72) : (width + 24) / 2;
  const scale = points.length ? normalScale(points.map((row) => Number(row[metric]))) : null;
  const y = (value: string | null) => 22 + (scale?.position(Number(value)) ?? .5) * 190;
  const pointDays = [...new Set(points.map(row => row.recordDate))].sort();
  const hitColumns = new Map(pointDays.map((date, index) => [date, {
    left: index ? (x(pointDays[index - 1]) + x(date)) / 2 : 0,
    right: index < pointDays.length - 1 ? (x(date) + x(pointDays[index + 1])) / 2 : width,
  }]));
  const pointByPeriod = new Map(points.map(row => [`${row.recordDate}:${row.period}`, row]));
  const ticks = measurementDateTicks(interval, width < 500 ? 4 : width < 900 ? 6 : 8);
  const unit = unitFor(metric);
  const pointLabel = (row: MeasurementDisplay) => `${row.recordDate} · ${row.period === "daytime" ? "空腹" : "晚间非空腹"} · ${row[metric]} ${unit} · ${row.recordKind === "estimated" ? `估计 · ${estimateUserExplanation(row.estimation, row.recordDate, metric).method}` : "实测"}`;
  const hintedRecord = points.find((row) => row.id === hintRecordId);
  const activate = (row: MeasurementDisplay) => onInspect(row);
  const selectKey = (event: React.KeyboardEvent, row: MeasurementDisplay) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(row); } };

  return <>
    <div className={styles.plotViewport} ref={viewport}>
      <svg className={styles.plot} width={width} height={252} viewBox={`0 0 ${width} 252`} role="group" aria-label={`${metricName(metric)}趋势，数值越高位置越高`}>
        <title>{`${metricName(metric)}趋势`}</title>
        {scale?.ticks.map((value) => <g key={value}><line x1="48" x2={width - 24} y1={y(String(value))} y2={y(String(value))} className={styles.grid} /><text x="37" y={y(String(value)) + 4} textAnchor="end" className={styles.axis}>{value.toFixed(1)}</text></g>)}
        {ticks.map((date) => <text key={date} x={x(date)} y="242" textAnchor="middle" className={styles.axis}>{date.slice(5).replace("-", "/")}</text>)}
        {selectedDate && <line x1={x(selectedDate)} x2={x(selectedDate)} y1="14" y2="218" className={styles.selectedDayLine} />}
        {pairs.map((day) => <line data-pair={day.date} key={day.date} x1={x(day.date)} x2={x(day.date)} y1={y(day.daytimeRecord![metric])} y2={y(day.eveningRecord![metric])} className={styles.pairLine} />)}
        {segments.map(({ a, b, period, estimated, missingDayCount }) => <line key={`${a.id}:${b.id}`} data-segment={estimated ? "estimated" : missingDayCount ? "gap" : "continuous"} data-period={period} x1={x(a.recordDate)} y1={y(a[metric])} x2={x(b.recordDate)} y2={y(b[metric])} className={`${period === "daytime" ? styles.dayLine : styles.nightLine} ${estimated ? styles.estimateLine : missingDayCount ? styles.gapLine : ""}`} />)}
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
          const clipBottom = midpoint !== null && !coincident && ownY < companionY! ? midpoint : 252;
          const clipId = `${plotId}-${row.id}`;
          return <g key={row.id} data-point-id={row.id} data-date={row.recordDate} data-value={row[metric]} data-period={row.period} data-kind={row.recordKind} role="button" tabIndex={0} aria-label={label} aria-pressed={row.recordDate === selectedDate} aria-haspopup={estimated ? "dialog" : undefined} onMouseEnter={() => setHintRecordId(row.id)} onMouseLeave={() => setHintRecordId(null)} onFocus={() => setHintRecordId(row.id)} onBlur={() => setHintRecordId(null)} onClick={() => activate(row)} onKeyDown={(event) => selectKey(event, row)}>
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
    <div className={styles.plotFooter}><div className={styles.legend}><span><i className={styles.dayDot} />晨间空腹</span>{showEvening && <span><i className={styles.nightDot} />晚间 · 非空腹</span>}{points.some((row) => row.recordKind === "estimated") && <span><i className={styles.estimateDot} />虚线 · 估计</span>}</div><output className={styles.plotHint} aria-live="polite">{hintedRecord ? pointLabel(hintedRecord) : ""}</output></div>
  </>;
}
