"use client";

import { useEffect, useRef, useState } from "react";
import { buildMeasurementDays, recentMeasurementDays, type DailyMeasurement } from "./days";
import { measurementSummary } from "./summary";
import { calendarOrdinal, measurementDateTicks, measurementRange, measurementTrend, metricDifference, normalScale, type MeasurementInterval, type MeasurementMetric, type MeasurementRange } from "./trend";
import styles from "./measurements-view.module.css";
import { estimateLabel, estimateBasisLabel as metadataBasisLabel, estimateCalculation } from "./estimate-explanation";
import { isInitializationEstimate } from "./estimation";
import type { EstimationMetadata } from "./estimation";

export type MeasurementDisplay = DailyMeasurement & {
  bmi: string | null;
  timezone: string | null;
  localDate: string;
  sourceType: string;
  sourceSystem: string | null;
  sourceRecordId: string | null;
  recordKind: "observed" | "estimated";
  entryChannel: "api" | "manual" | "development_backend" | null;
  deviceName: string | null;
  companionApp: string | null;
  estimation: EstimationMetadata | null;
  timePrecision: string;
};
type MeasurementDay = ReturnType<typeof buildMeasurementDays<MeasurementDisplay>>[number];
const ranges: { value: MeasurementRange; label: string }[] = [{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "90d", label: "90D" }, { value: "all", label: "全部" }];
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const displayDate = (date: string) => date.replaceAll("-", ".");
const shortDate = (date: string) => date.slice(5).replace("-", ".");
const weekday = (date: string) => weekdays[new Date(calendarOrdinal(date) * 86_400_000).getUTCDay()];
const unitFor = (metric: MeasurementMetric) => metric === "weightKg" ? "kg" : "%";
const metricName = (metric: MeasurementMetric) => metric === "weightKg" ? "体重" : "体脂率";

export function MeasurementsView({ records }: { records: MeasurementDisplay[] }) {
  const recordedDates = records.map((row) => row.analysisDate).sort();
  const latestDate = recordedDates.at(-1) ?? "";
  const earliestDate = recordedDates[0] ?? "";
  const [mode, setMode] = useState<MeasurementRange>("30d");
  const [customRange, setCustomRange] = useState<MeasurementInterval>({ start: earliestDate, end: latestDate });
  const [draftRange, setDraftRange] = useState(customRange);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const calendarButton = useRef<HTMLButtonElement>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [metric, setMetric] = useState<MeasurementMetric>("weightKg");
  const [showEvening, setShowEvening] = useState(true);
  const [showEstimates, setShowEstimates] = useState(true);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<"history" | string | null>(null);
  if (!latestDate) return <section className={styles.empty}><h1>身体记录</h1><p>暂无测量记录。</p></section>;

  const range = measurementRange(latestDate, mode, mode === "custom" ? customRange : { start: earliestDate, end: latestDate });
  const displayedRecords = records.filter((row) => showEstimates || row.recordKind !== "estimated");
  const visibleRecords = displayedRecords.filter((row) => row.analysisDate >= range.start && row.analysisDate <= range.end);
  const allDays = buildMeasurementDays(records, choices, metric);
  const recent = recentMeasurementDays(displayedRecords, range, choices, 10, metric);
  const activeDate = selectedDate && selectedDate >= range.start && selectedDate <= range.end ? selectedDate : null;
  const selected = buildMeasurementDays(displayedRecords, choices, metric).find((day) => day.date === activeDate);
  const summary = measurementSummary(records, metric, choices);
  const unit = unitFor(metric);

  function selectRange(nextMode: MeasurementRange, nextInterval = customRange) {
    const next = measurementRange(latestDate, nextMode, nextMode === "custom" ? nextInterval : { start: earliestDate, end: latestDate });
    if (selectedDate && (selectedDate < next.start || selectedDate > next.end)) setSelectedDate(null);
    setMode(nextMode);
    setCalendarOpen(false);
  }
  function chooseRecord(date: string, period: "daytime" | "evening", id: string) {
    setChoices((previous) => ({ ...previous, [`${date}:${period}`]: id }));
  }

  return <section className={styles.workspace} aria-labelledby="body-records-title">
    <div className={styles.heading}>
      <h1 id="body-records-title">身体记录</h1>
      <div className={styles.metricTabs} aria-label="趋势指标">
        <button type="button" aria-pressed={metric === "weightKg"} onClick={() => setMetric("weightKg")}>体重</button>
        <button type="button" aria-pressed={metric === "bodyFatPercent"} onClick={() => setMetric("bodyFatPercent")}>体脂率</button>
      </div>
    </div>
    <section className={styles.summary} aria-label="最新空腹摘要">
      <div className={styles.current} data-summary="current">
        <span>当前{metricName(metric)}</span>
        <strong>{summary.current?.[metric] ?? "—"}<small>{unit}</small></strong>
        <p>{summary.current ? <>晨间空腹 · <time dateTime={summary.current.analysisDate}>{displayDate(summary.current.analysisDate)}</time></> : "暂无空腹记录"}</p>
      </div>
      <div data-summary="change">
        <span>7 日内变化</span>
        <strong>{formatDifference(summary.change, metric, false) ?? "—"}<small>{metric === "weightKg" ? "kg" : "百分点"}</small></strong>
        <p>{summary.changeStart ? `${shortDate(summary.changeStart)} — ${shortDate(summary.end!)}` : "不足 2 个记录日"}</p>
      </div>
      <div data-summary="average">
        <span>7 日均值</span>
        <strong>{summary.average?.toFixed(2) ?? "—"}<small>{unit}</small></strong>
        <p>{summary.coverage}/7 天{summary.end && ` · 截至 ${shortDate(summary.end)}`}</p>
      </div>
      <div data-summary="companion">
        <span>当前{metricName(summary.companionMetric)}</span>
        <strong>{summary.companion?.[summary.companionMetric] ?? "—"}<small>{unitFor(summary.companionMetric)}</small></strong>
        <p>{summary.companion ? `晨间空腹 · ${displayDate(summary.companion.analysisDate)}` : "暂无空腹记录"}</p>
      </div>
    </section>
    <section className={styles.chartPanel} aria-label="身体指标趋势">
      <div className={styles.chartToolbar}>
        <span className={styles.rangeCaption}>{displayDate(range.start)} <span>—</span> {displayDate(range.end)}</span>
        <div className={styles.chartControls}>
          <div className={styles.rangeTabs} aria-label="日期视角">
            {ranges.map((item) => <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => selectRange(item.value)}>{item.label}</button>)}
            <button type="button" ref={calendarButton} aria-label="自定义日期" aria-pressed={mode === "custom"} aria-expanded={calendarOpen} aria-controls="measurement-calendar" onClick={() => { setDraftRange(range); setRangeError(""); setCalendarOpen(!calendarOpen); }}><CalendarIcon /><span>自定义</span></button>
          </div>
          <label className={styles.toggle}><span>晚间</span><input aria-label="晚间数据" type="checkbox" checked={showEvening} onChange={(event) => setShowEvening(event.target.checked)} /></label>
          {records.some((row) => row.recordKind === "estimated") && <label className={styles.toggle}><span>估计</span><input aria-label="估计补全" type="checkbox" checked={showEstimates} onChange={(event) => setShowEstimates(event.target.checked)} /></label>}
        </div>
      </div>
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
      <TrendPlot key={`${range.start}:${range.end}:${metric}:${showEvening}`} records={visibleRecords} metric={metric} showEvening={showEvening} interval={range} selectedDate={activeDate} onSelect={setSelectedDate} choices={choices} />
    </section>
    {selected && <section className={styles.dayPanel} aria-label="所选日期测量详情">
      <div className={styles.dayHeading}><h2>{displayDate(selected.date)}</h2><span>{weekday(selected.date)}</span></div>
      <div className={styles.readings}>
        <CompactReading label={!selected.daytimeRecord || selected.daytimeRecord.fasting === true ? "晨间空腹" : "白天"} row={selected.daytimeRecord} metric={metric} />
        <CompactReading label="晚间 · 非空腹" row={selected.eveningRecord} metric={metric} evening />
        <div className={styles.difference}><span>晨晚差</span><strong>{formatDifference(metricDifference(selected.daytimeRecord, selected.eveningRecord, metric), metric)}</strong></div>
      </div>
      <div className={styles.dayActions}><button type="button" onClick={() => setDrawer(selected.date)}>详情{selected.needsSelection && " · 待选择"}</button><button type="button" aria-label="关闭日期详情" onClick={() => setSelectedDate(null)}>×</button></div>
    </section>}
    <section className={styles.history} aria-label="最近记录">
      <div className={styles.sectionTitle}><h2>最近记录</h2><span>{metric === "weightKg" ? "kg · 实测晨晚差" : "% · 差值为百分点"}</span></div>
      {recent.length ? <table>
        <thead><tr><th scope="col">日期</th><th scope="col">晨间</th><th scope="col" title="晚间 · 非空腹">晚间<small> · 非空腹</small></th><th scope="col">差值{metric === "bodyFatPercent" && <small> · 百分点</small>}</th></tr></thead>
        <tbody>{recent.map((day) => <tr key={day.date} data-selected={day.date === activeDate}>
          <th scope="row"><button type="button" aria-label={`查看 ${day.date}`} aria-pressed={day.date === activeDate} onClick={() => setSelectedDate(day.date)}><time dateTime={day.date}>{shortDate(day.date)}</time><small>{weekday(day.date)}</small></button></th>
          <td className={styles.dayValue}>{day.daytimeRecord?.recordKind === "estimated" ? <button className={styles.estimateValue} aria-label={`查看 ${day.date} 晨间估计依据`} onClick={() => setDrawer(day.date)}>{day.daytimeRecord[metric]}<small>{estimateLabel(day.daytimeRecord.estimation)}</small></button> : day.daytimeRecord?.[metric] ?? (day.daytime.length > 1 ? "待选择" : <Missing />)}{day.daytimeRecord && day.daytimeRecord.fasting !== true && <small>{fastingLabel(day.daytimeRecord)}</small>}</td>
          <td className={styles.nightValue}>{day.eveningRecord?.recordKind === "estimated" ? <button className={styles.estimateValue} aria-label={`查看 ${day.date} 晚间估计依据`} onClick={() => setDrawer(day.date)}>{day.eveningRecord[metric]}<small>{estimateLabel(day.eveningRecord.estimation)}</small></button> : day.eveningRecord?.[metric] ?? (day.evening.length > 1 ? "待选择" : <Missing />)}</td>
          <td>{formatDifference(metricDifference(day.daytimeRecord, day.eveningRecord, metric), metric, false) ?? <Missing />}</td>
        </tr>)}</tbody>
      </table> : <p className={styles.emptyHistory}>此区间暂无记录。</p>}
      <button type="button" className={styles.fullHistory} onClick={() => setDrawer("history")}>查看全部 <span aria-hidden="true">↗</span></button>
    </section>
    {drawer && <HistoryDrawer view={drawer} days={allDays} metric={metric} choices={choices} onChoose={chooseRecord} onClose={() => setDrawer(null)} />}
  </section>;
}

function Missing() { return <span aria-label="未记录" className={styles.missing}>—</span>; }
function estimateBasisLabel(row: MeasurementDisplay, metric: MeasurementMetric) { return metadataBasisLabel(row.estimation, metric); }
function EstimationDetails({ row }: { row: MeasurementDisplay }) {
  const metadata = row.estimation;
  if (!metadata) return null;
  const legacy = metadata.method === "linear-trend-v1";
  const range = legacy ? metadata.trainingRange : metadata.historyRange;
  const initialized = isInitializationEstimate(metadata);
  return <><div><dt>估计方法</dt><dd>{initialized ? "历史初始化估计" : legacy ? "历史趋势估计（旧版本）" : "正常估计 · 晨间基准"}</dd></div>
    <div><dt>规则版本</dt><dd>{metadata.method}</dd></div>
    <div><dt>历史参考</dt><dd>{displayDate(range.start)} — {displayDate(range.end)}{!initialized && !legacy && <><br />此前 28 天；晨间趋势至少 3 日、最多 7 日，最新实测距目标不超过 7 天</>}</dd></div>
    {"generatedAt" in metadata && <div><dt>生成时间</dt><dd>{metadata.generatedAt.replace("T", " ").slice(0, 19)} UTC</dd></div>}
    {initialized && <><div><dt>初始化批次</dt><dd>{metadata.batchId}</dd></div><div className={styles.calculation}><dt>历史初始化说明</dt><dd>本次初始化允许使用后续已经存在的真实历史记录。历史结果已冻结，补录只替换对应实测指标。</dd></div></>}
    {(["weightKg", "bodyFatPercent"] as const).filter(metric => metadata[metric] !== null).map(metric => {
      if (metadata.method === "linear-trend-v1") return <div key={metric}><dt>{metricName(metric)}依据</dt><dd>{metadata[metric]!.model.sampleCount} 条历史真实记录</dd></div>;
      const prediction = metadata[metric]!, calculation = estimateCalculation(prediction, row.analysisDate, metric);
      return <div className={styles.calculation} key={metric}><dt>{metricName(metric)}依据</dt><dd>{estimateBasisLabel(row, metric)}
        <p className={styles.formula}>{calculation.formula}</p>
        {calculation.notes.map(note => <p className={styles.estimateNote} key={note}>{note}</p>)}
        {initialized && <p className={styles.estimateNote}>此指标实际使用目标日期之后的数据：{prediction.usesFutureData ? "是" : "否"}</p>}
        <details className={styles.references}><summary>查看真实参考记录（{calculation.references.length} 条）</summary><ul>{calculation.references.map((reference, index) => <li key={index}>{reference}</li>)}</ul></details>
      </dd></div>;
    })}</>;
}
function sourceLabel(row: MeasurementDisplay) {
  if (row.recordKind === "estimated") return isInitializationEstimate(row.estimation) ? "历史初始化估计" : "系统趋势估计";
  return row.entryChannel === "development_backend" ? "开发后台加入" : row.entryChannel === "manual" ? "人为录入" : row.entryChannel === "api" ? "API 写入" : row.sourceSystem ?? (row.sourceType === "import" ? "导入 · 来源系统未提供" : row.sourceType === "manual" ? "手动记录" : row.sourceType);
}
function recordTimeLabel(row: MeasurementDisplay) { return `${row.sourceLocalTime}${row.timePrecision === "assumed" ? " · 时间为占位" : row.timePrecision === "day_period" ? " · 仅日期与时段" : ""}`; }
function fastingLabel(row: MeasurementDisplay) { return row.period === "evening" || row.fasting === false ? "非空腹" : row.fasting === true ? "空腹" : "未确认"; }
function formatDifference(value: number | null, metric: MeasurementMetric, withUnit = true) {
  return value === null ? withUnit ? "—" : null : `${value > 0 ? "+" : ""}${value.toFixed(2)}${withUnit ? metric === "weightKg" ? " kg" : " 百分点" : ""}`;
}
function CalendarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7 2v6M17 2v6M4 11h16" /></svg>;
}
function CompactReading({ label, row, metric, evening = false }: { label: string; row: MeasurementDisplay | null; metric: MeasurementMetric; evening?: boolean }) {
  return <div className={evening ? `${styles.reading} ${styles.evening}` : styles.reading}><span>{label}{row?.recordKind === "estimated" && ` · ${estimateLabel(row.estimation)}`}</span><strong>{row?.[metric] ?? "—"}<small>{unitFor(metric)}</small></strong></div>;
}

function HistoryDrawer({ view, days, metric, choices, onChoose, onClose }: {
  view: string; days: MeasurementDay[]; metric: MeasurementMetric; choices: Record<string, string>;
  onChoose: (date: string, period: "daytime" | "evening", id: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement || previousFocus instanceof SVGElement) previousFocus.focus();
    };
  }, []);
  const selected = days.find((day) => day.date === view);
  return <dialog ref={dialog} className={styles.drawer} aria-labelledby="measurement-drawer-title" onClose={(event) => {
    // Strict Mode 清理时的 close 事件可能在再次 showModal 后送达；只同步真正关闭的状态。
    if (!event.currentTarget.open) onClose();
  }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    // 原生 dialog 隔离背景；显式循环 Tab，避免从最后一个控件移到浏览器工具栏。
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, select, input, summary, [tabindex]')]
      .filter((node) => node.tabIndex >= 0 && !node.hasAttribute("disabled") && node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={(event) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.current?.close();
  }}>
    <header className={styles.drawerHeader}><div><h2 id="measurement-drawer-title">{selected ? displayDate(selected.date) : "完整历史"}</h2><p>{selected ? weekday(selected.date) : `${days.length} 个记录日 · ${days.flatMap((day) => day.records).filter((row) => row.recordKind !== "estimated").length} 条实测 · ${days.flatMap((day) => day.records).filter((row) => row.recordKind === "estimated").length} 条估计`}</p></div><button type="button" autoFocus aria-label="关闭历史抽屉" onClick={() => dialog.current?.close()}>×</button></header>
    <div className={styles.drawerContent}>
      {selected ? <DayDetails day={selected} metric={metric} choices={choices} onChoose={onChoose} /> : days.map((day) => <details className={styles.historyDay} key={day.date}>
        <summary><time dateTime={day.date}>{displayDate(day.date)}</time><span><span className={styles.dayValue}>{day.daytimeRecord?.[metric] ?? "—"}{day.daytimeRecord?.recordKind === "estimated" && <small> {estimateLabel(day.daytimeRecord.estimation)}</small>}</span><span className={styles.nightValue}>{day.eveningRecord?.[metric] ?? "—"}{day.eveningRecord?.recordKind === "estimated" && <small> {estimateLabel(day.eveningRecord.estimation)}</small>}</span>{day.needsSelection && <small>待选择</small>}</span></summary>
        <DayDetails day={day} metric={metric} choices={choices} onChoose={onChoose} />
      </details>)}
    </div>
  </dialog>;
}

function DayDetails({ day, metric, choices, onChoose }: {
  day: MeasurementDay; metric: MeasurementMetric; choices: Record<string, string>;
  onChoose: (date: string, period: "daytime" | "evening", id: string) => void;
}) {
  return <div className={styles.dayDetails}>
    {(["daytime", "evening"] as const).map((period) => day[period].length > 1 && <label key={period} className={styles.choice}>
      {period === "daytime" ? "白天" : "晚间"}代表记录
      <select aria-label={`${period === "daytime" ? "白天" : "晚间"}代表记录`} value={choices[`${day.date}:${period}`] ?? ""} onChange={(event) => onChoose(day.date, period, event.target.value)}>
        <option value="">选择一条查看</option>{day[period].map((row) => <option key={row.id} value={row.id}>{row.sourceLocalTime} · {row[metric] ?? "—"} {unitFor(metric)}</option>)}
      </select>
    </label>)}
    <h3>记录详情</h3>
    {[...day.records].sort((a, b) => b.sourceLocalTime.localeCompare(a.sourceLocalTime)).map((row) => <article className={styles.rawRecord} key={row.id}>
      <header><time dateTime={row.timePrecision === "second" ? row.sourceLocalTime.replace(" ", "T") : row.localDate}>{recordTimeLabel(row)}</time><span>{row.period === "daytime" ? "白天" : "晚间"} · {fastingLabel(row)} · {row.recordKind === "estimated" ? estimateLabel(row.estimation) : "真实测量"}</span></header>
      <dl><div><dt>体重</dt><dd>{row.weightKg === null ? "—" : `${row.weightKg} kg`}</dd></div><div><dt>体脂率</dt><dd>{row.bodyFatPercent === null ? "—" : `${row.bodyFatPercent} %`}</dd></div><div><dt>BMI</dt><dd>{row.bmi ?? "—"}</dd></div><div><dt>归属日</dt><dd>{displayDate(row.analysisDate)}</dd></div><div><dt>时区</dt><dd>{row.timezone ?? "未提供"}</dd></div><div><dt>来源</dt><dd>{sourceLabel(row)}</dd></div>{row.deviceName && <div><dt>设备</dt><dd>{row.deviceName}</dd></div>}{row.companionApp && <div><dt>连接应用</dt><dd>{row.companionApp}</dd></div>}{row.sourceSystem && <div><dt>来源系统</dt><dd>{row.sourceSystem}</dd></div>}{row.sourceRecordId && <div><dt>来源记录</dt><dd>{row.sourceRecordId}</dd></div>}<EstimationDetails row={row} /></dl>
      {row.estimation && <p className={styles.estimateNote}>用于辅助趋势，非实际测量。</p>}
    </article>)}
  </div>;
}

function TrendPlot({ records, metric, showEvening, interval, selectedDate, onSelect, choices }: {
  records: MeasurementDisplay[]; metric: MeasurementMetric; showEvening: boolean; interval: MeasurementInterval;
  selectedDate: string | null; onSelect: (date: string) => void; choices: Record<string, string>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [hint, setHint] = useState("");
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
  const ticks = measurementDateTicks(interval, width < 500 ? 4 : width < 900 ? 6 : 8);
  const unit = unitFor(metric);
  const selectKey = (event: React.KeyboardEvent, date: string) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(date); } };

  return <>
    <div className={styles.plotViewport} ref={viewport}>
      <svg className={styles.plot} width={width} height={252} viewBox={`0 0 ${width} 252`} role="group" aria-label={`${metricName(metric)}趋势，数值越高位置越高`}>
        <title>{`${metricName(metric)}趋势`}</title>
        {scale?.ticks.map((value) => <g key={value}><line x1="48" x2={width - 24} y1={y(String(value))} y2={y(String(value))} className={styles.grid} /><text x="37" y={y(String(value)) + 4} textAnchor="end" className={styles.axis}>{value.toFixed(1)}</text></g>)}
        {ticks.map((date) => <text key={date} x={x(date)} y="242" textAnchor="middle" className={styles.axis}>{date.slice(5).replace("-", "/")}</text>)}
        {selectedDate && <line x1={x(selectedDate)} x2={x(selectedDate)} y1="14" y2="218" className={styles.selectedDayLine} />}
        {pairs.map((day) => <line data-pair={day.date} key={day.date} x1={x(day.date)} x2={x(day.date)} y1={y(day.daytimeRecord![metric])} y2={y(day.eveningRecord![metric])} className={styles.pairLine} />)}
        {segments.map(({ a, b, period, estimated, missingDayCount }) => <line key={`${a.id}:${b.id}`} data-segment={estimated ? "estimated" : missingDayCount ? "gap" : "continuous"} data-period={period} x1={x(a.analysisDate)} y1={y(a[metric])} x2={x(b.analysisDate)} y2={y(b[metric])} className={`${period === "daytime" ? styles.dayLine : styles.nightLine} ${estimated ? styles.estimateLine : missingDayCount ? styles.gapLine : ""}`} />)}
        {[...points].sort((a, b) => Number(a.period === "daytime") - Number(b.period === "daytime")).map((row) => {
          const estimated = row.recordKind === "estimated";
          const label = `${row.analysisDate} · ${row.period === "daytime" ? "空腹" : "晚间非空腹"} · ${row[metric]} ${unit} · ${estimated ? `${estimateLabel(row.estimation)} · ${estimateBasisLabel(row, metric)}` : "实测"}`;
          return <g key={row.id} data-point-id={row.id} data-date={row.analysisDate} data-value={row[metric]} data-period={row.period} data-kind={row.recordKind} role="button" tabIndex={0} aria-label={label} aria-pressed={row.analysisDate === selectedDate} onMouseEnter={() => setHint(label)} onMouseLeave={() => setHint("")} onFocus={() => setHint(label)} onBlur={() => setHint("")} onClick={() => onSelect(row.analysisDate)} onKeyDown={(event) => selectKey(event, row.analysisDate)}>
            <title>{`${recordTimeLabel(row)} · ${label}`}</title><circle cx={x(row.analysisDate)} cy={y(row[metric])} r="14" className={styles.hitTarget} />
            {row.analysisDate === selectedDate && <circle cx={x(row.analysisDate)} cy={y(row[metric])} r="8" className={styles.selectedPoint} />}
            {estimated ? <path d={`M ${x(row.analysisDate)} ${y(row[metric]) - 4} l 4 4 l -4 4 l -4 -4 Z`} className={`${styles.estimatePoint} ${row.period === "daytime" ? styles.dayEstimate : styles.nightEstimate}`} /> : <circle cx={x(row.analysisDate)} cy={y(row[metric])} r={row.period === "daytime" ? "4" : "3.2"} className={row.period === "daytime" ? styles.dayPoint : styles.nightPoint} />}
          </g>;
        })}
        {!points.length && <text x={width / 2} y="118" textAnchor="middle" className={styles.emptyChart}>{`此区间暂无${showEvening ? "" : "空腹"}${metricName(metric)}记录`}</text>}
      </svg>
    </div>
    <div className={styles.plotFooter}><div className={styles.legend}><span><i className={styles.dayDot} />晨间空腹</span>{showEvening && <span><i className={styles.nightDot} />晚间 · 非空腹</span>}{points.some((row) => row.recordKind === "estimated") && <span><i className={styles.estimateDot} />虚线 · 估计</span>}</div><output className={styles.plotHint} aria-live="polite">{hint}</output></div>
  </>;
}
