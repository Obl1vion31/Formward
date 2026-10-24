"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePageLoading } from "@/components/page-loading-state";
import { useLocalToday } from "@/components/use-local-today";
import { useMobileMode } from "@/components/use-mobile-mode";
import { preferredRecordedDate, rangeContaining, recentRecordDates, recordDateLabel } from "@/components/record-dates";
import { useChartMotion } from "@/components/use-chart-motion";
import { ChartDateControls } from "@/components/chart-date-controls";
import type { SourceRemovalResult } from "@/components/source-input";
import { EditorDialog } from "../meals/meals-view";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import { chartScale } from "@/components/chart-scale";
import type { EnergyPresentation } from "./presentation";
import type { Result } from "../meals/model";
import { EnergyEditor } from "./energy-editor";
import { blankEnergyDay, energyValue, type EnergyAction, type EnergyDay, type EnergyInput, type EnergyRecord } from "./model";
import styles from "./energy.module.css";

export type SaveEnergy = (input: EnergyInput) => Promise<Result<{ presentation: EnergyPresentation; message: string }>>;
const recordType = (record: EnergyRecord) => "restingFrom" in record ? "energy_defaults" : "effectiveFrom" in record ? "energy_profile" : "name" in record ? "activity" : "energy_day";
export function EnergySources({ day }: { day: EnergyDay }) {
  const rest = day.record?.restingSourceSystem ?? day.record?.sourceSystem;
  const active = day.activeSource === "activities" ? [...new Set(day.activities.map(row => row.sourceSystem).filter(Boolean))].join("、") : day.record?.activeSourceSystem ?? day.record?.sourceSystem;
  const sources = day.totalSource === "override" ? [["总消耗", day.record?.sourceSystem]] : [["静息", rest], ["活动", active]];
  return <div className={styles.sourceLine}>{sources.filter(([, source]) => source).map(([label, source]) => <span key={label}>{label} · {source}</span>)}</div>;
}
export function EnergyView({ presentation, save, removeSource, initialDate = null }: { presentation: EnergyPresentation; save: SaveEnergy; removeSource: (label: string) => Promise<SourceRemovalResult>; initialDate?: string | null }) {
  const today = useLocalToday(presentation.today), mobile = useMobileMode();
  const router = useRouter();
  useEffect(() => { if (today !== presentation.today) router.refresh(); }, [today, presentation.today, router]);
  const [local, setLocal] = useState<EnergyPresentation | null>(null), [base, setBase] = useState(presentation);
  if (base !== presentation) { setBase(presentation); setLocal(null); }
  const data = local ?? presentation, state = data.snapshot;
  const [sourceResult, setSourceResult] = useState<{ base: string[]; sources: string[] } | null>(null);
  const sources = sourceResult?.base === data.sources ? sourceResult.sources : data.sources;
  async function remove(label: string) { const result = await removeSource(label); if (result.ok) setSourceResult({ base: data.sources, sources: result.sources }); return result; }
  const byDate = new Map(data.days.map(day => [day.date, day]));
  const [formulaOpen, setFormulaOpen] = useState(false), [historyDate, setHistoryDate] = useState("");
  const latest = preferredRecordedDate(data.days, today, day => day.totalKcal !== null, day => !!day.record || day.activities.length > 0);
  const [editing, setEditing] = useState<EnergyAction | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, startTransition] = useTransition(), guard = useRef(false), request = useRef<{ content: string; id: string } | null>(null);
  const [mode, setMode] = useState<string | null>(null), [custom, setCustom] = useState({ from: addCalendarDays(initialDate ?? today, -29), to: initialDate ?? today }), [selected, setSelected] = useState(initialDate ?? latest), [limit, setLimit] = useState(10);
  const end = initialDate ?? today, range = mode ?? rangeContaining(initialDate ?? latest, end, mobile ? "7" : "30");
  const earliest = [end, today, ...state.days.map(day => day.date), ...state.activities.map(row => row.date)].sort()[0];
  const from = range === "all" ? earliest : range === "custom" ? custom.from : addCalendarDays(end, 1 - Number(range)), to = range === "custom" ? custom.to : end;
  const dates = useMemo(() => { try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; return length > 0 && length <= 3661 ? Array.from({ length }, (_, index) => addCalendarDays(from, index)) : []; } catch { return []; } }, [from, to]);
  const chartDays = dates.map(date => byDate.get(date) ?? blankEnergyDay(date)), formula = data.formula;
  const inspected = dates.includes(selected) ? selected : dates.at(-1) ?? today, chosen = chartDays.find(day => day.date === inspected);
  const historyDates = [...new Set([...recentRecordDates(today), ...(historyDate ? [historyDate] : []), ...state.days.filter(day => !day.deletedAt).map(day => day.date), ...state.activities.filter(activity => !activity.deletedAt).map(activity => activity.date)])].sort().reverse();
  const history = (historyDate ? [historyDate] : historyDates.slice(0, limit)).map(date => byDate.get(date) ?? blankEnergyDay(date));
  const removed = [...state.days, ...state.activities, ...state.profiles].filter(record => record.deletedAt);
  usePageLoading({ active: busy, label: "正在保存消耗记录…" });
  function edit(action: EnergyAction) { setFormulaOpen(false); setError(""); setNotice(""); setEditing(action); }
  function editDay(date: string, details = false) {
    const current = state.days.find(day => day.date === date && !day.deletedAt);
    edit({ kind: "save_energy_day", date, ...(current ? { id: current.id, version: current.version, entryMode: details ? "components" : current.entryMode ?? undefined, activityMode: details ? "activities" : current.activityMode ?? undefined, restingSourceSystem: current.restingSourceSystem ?? current.sourceSystem, activeSourceSystem: current.activeSourceSystem ?? current.sourceSystem, restingEstimated: current.restingEstimated ?? false, restingKcal: current.restingKcal, activeKcal: current.activeKcal, activeEstimated: current.activeEstimated ?? false, notes: current.notes ?? null, totalKcal: current.totalKcal, timezone: current.timezone, sourceSystem: current.sourceSystem, sourceRecordId: current.sourceRecordId, sourceOccurredAt: current.sourceOccurredAt } : { entryMode: "components", activityMode: details ? "activities" : "total", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  }
  function editProfile() {
    const current = state.profiles.filter(profile => !profile.deletedAt && profile.effectiveFrom <= today).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    edit({ kind: "save_energy_profile", effectiveFrom: today, heightCm: current?.heightCm ?? "", birthDate: current?.birthDate ?? "", sex: current?.sex ?? "male", ...(current?.effectiveFrom === today ? { id: current.id, version: current.version } : {}) });
  }
  function execute(input: EnergyAction | EnergyAction[]) {
    const actions = Array.isArray(input) ? input : [input];
    if (guard.current) return; guard.current = true; setError(""); setNotice("");
    const content = JSON.stringify(actions); if (request.current?.content !== content) request.current = { content, id: crypto.randomUUID() };
    const operationId = request.current.id;
    startTransition(async () => {
      try { const result = await save({ operationId, actions }); if (!result.ok) { setError(result.error); return; } setLocal(result.data.presentation); const changed = actions.find(action => "date" in action); if (changed && "date" in changed) setSelected(changed.date); setNotice(result.data.message); setEditing(null); request.current = null; }
      catch { setError("保存未完成，当前输入已保留，请重试。"); }
      finally { guard.current = false; }
    });
  }
  return <section className={styles.workspace}>
    <header className={styles.heading}><h1>消耗</h1></header>
    {error && !editing && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <section className={styles.section} aria-label="消耗历史趋势"><div className={styles.title}><div className={styles.title}><h2>每日消耗</h2><time>{from.replaceAll("-", ".")} — {to.replaceAll("-", ".")}</time></div><details className={styles.pageMenu}><summary aria-label="消耗更多选项">•••</summary><button onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setFormulaOpen(true); }}>静息公式与资料</button></details><div className={styles.ranges}>{[["7", "7D"], ["30", "30D"], ["90", "90D"], ["all", "全部"], ["custom", "自定义"]].map(([key, label]) => <button key={key} aria-pressed={range === key} onClick={() => setMode(key)}>{label}</button>)}</div></div>
      {range === "custom" && <div className={styles.custom}><label>开始<input type="date" aria-label="消耗开始日期" value={custom.from} onChange={event => setCustom({ ...custom, from: event.target.value })} /></label><label>结束<input type="date" aria-label="消耗结束日期" value={custom.to} onChange={event => setCustom({ ...custom, to: event.target.value })} /></label></div>}
      <div className={styles.legend}><span><i style={{ background: "#6C96B3" }} />静息</span><span><i style={{ background: "#C07B77" }} />活动</span><span><i style={{ background: "#9EAAA9" }} />录入总消耗</span></div>
      {!dates.length ? <p className={styles.empty}>请选择有效日期范围，最长 10 年。</p> : <><div className={styles.readout} role="group" aria-label="选中日消耗" aria-live="polite" aria-atomic="true"><time dateTime={inspected}>{recordDateLabel(inspected, today)}</time>{([["总消耗", chosen?.totalKcal], ["静息", chosen?.restingKcal], ["活动", chosen?.activeKcal]] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{energyValue(value)}<small>kcal</small></strong>{(label === "静息" && chosen?.record?.restingEstimated || label === "总消耗" && chosen?.estimated) && <small>估计</small>}</div>)}</div>{chosen && <EnergySources day={chosen} />}<EnergyPlot days={chartDays} selected={inspected} inspect={setSelected} /><div className={styles.chartNavigation}><ChartDateControls label="消耗图表日期" value={inspected} min={dates[0]} max={dates.at(-1)!} onChange={setSelected} /><button type="button" onClick={() => editDay(inspected)}>{chosen?.record ? "编辑所选日" : "录入所选日"} →</button></div></>}
    </section>
    <section className={styles.section} aria-label="每日消耗记录"><div className={styles.title}><h2>每日记录</h2><label className={styles.historyDate}>查看日期<input aria-label="消耗记录日期" type="date" max={today} value={historyDate} onChange={event => { setHistoryDate(event.target.value); setLimit(10); }} /></label>{historyDate && <button onClick={() => setHistoryDate("")}>近期记录</button>}</div><div className={styles.list}>{history.map(day => <article className={styles.row} key={day.date} data-energy-day={day.date}><div><time dateTime={day.date}>{recordDateLabel(day.date, today)}</time><p>静息 {energyValue(day.restingKcal)} · 活动 {energyValue(day.activeKcal)} kcal{day.record?.restingEstimated && " · 静息估计"}</p></div><strong>{energyValue(day.totalKcal)}<small>kcal</small></strong><div className={styles.actions}><button disabled={busy} onClick={() => editDay(day.date)}>{day.record ? "编辑" : day.date < today ? "补录" : "录入"}</button><button disabled={busy} onClick={() => editDay(day.date, true)}>添加活动</button>{day.record && <details className={styles.rowMenu}><summary aria-label={day.date + " 更多记录操作"}>更多</summary><button disabled={busy} onClick={() => execute({ kind: "delete_energy_day", id: day.record!.id, version: day.record!.version })}>删除</button></details>}</div>
      {state.activities.some(activity => activity.date === day.date && !activity.deletedAt) && <details className={styles.details} style={{ width: "100%" }}><summary>活动明细</summary>{state.activities.filter(activity => activity.date === day.date && !activity.deletedAt).map(activity => <div className={styles.row} key={activity.id}><div><h3>{activity.name}</h3><p>{activity.durationMinutes !== null ? `${Number(activity.durationMinutes)} 分钟 · ` : ""}{activity.sourceSystem}{!activity.completed && " · 未完成"}</p></div><strong>{energyValue(activity.caloriesKcal)}<small>kcal</small></strong><div className={styles.actions}><button disabled={busy} onClick={() => { const { deletedAt, syncStatus, ...fields } = activity; void deletedAt; void syncStatus; edit({ kind: "save_activity", ...fields }); }}>编辑活动</button><button disabled={busy} onClick={() => execute({ kind: "delete_activity", id: activity.id, version: activity.version })}>删除活动</button></div></div>)}</details>}
    </article>)}</div>{!historyDate && historyDates.length > limit && <button onClick={() => setLimit(limit + 50)}>查看更早记录</button>}</section>
    {removed.length > 0 && <details className={styles.details}><summary>最近删除 · {removed.length}</summary>{removed.map(record => <div className={styles.row} key={record.id}><span>{"restingFrom" in record ? "日常默认值" : "name" in record ? record.name : "date" in record ? record.date : `${record.effectiveFrom} · 公式资料`}</span><button disabled={busy} onClick={() => { if ("effectiveFrom" in record && !window.confirm(`恢复将影响 ${record.effectiveFrom} 起至下一份有效资料之前的公式估算，确认恢复？`)) return; execute({ kind: `restore_${recordType(record)}`, id: record.id, version: record.version } as EnergyAction); }}>恢复</button></div>)}</details>}
    {formulaOpen && <EditorDialog title="静息公式与资料" busy={busy} close={() => setFormulaOpen(false)}><h3>今天的静息公式对照</h3><p>{today}</p>{formula ? <><p>公式估算 {energyValue(formula.value)} kcal／天 · {formula.basis.age} 岁 · {Number(formula.basis.heightCm)} cm · {Number(formula.basis.weightKg)} kg（{formula.basis.weightDate}）</p></> : <p>填写身高、出生日期和公式性别参数后，结合有效晨重计算。</p>}<button onClick={editProfile}>填写或修改公式资料</button>
    <details className={styles.details}><summary>资料历史</summary>{state.profiles.filter(profile => !profile.deletedAt).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map(profile => <div className={styles.row} key={profile.id}><div><h3>{profile.effectiveFrom} 起</h3><p>{Number(profile.heightCm)} cm · {profile.birthDate} · {profile.sex === "male" ? "男性" : "女性"}</p></div><div className={styles.actions}><button disabled={busy} onClick={() => { const { deletedAt, ...fields } = profile; void deletedAt; edit({ kind: "save_energy_profile", ...fields }); }}>编辑资料</button><button disabled={busy} onClick={() => { if (window.confirm(`删除将影响 ${profile.effectiveFrom} 起至下一份有效资料之前的公式估算，确认删除？`)) execute({ kind: "delete_energy_profile", id: profile.id, version: profile.version }); }}>删除资料</button></div></div>)}{!state.profiles.some(profile => !profile.deletedAt) && <p>尚未填写公式资料。</p>}<button onClick={editProfile}>填写公式资料</button></details>
</EditorDialog>}
    {editing && <EditorDialog title={editing.kind === "save_energy_profile" ? "公式资料" : editing.kind === "save_activity" ? "活动记录" : "每日消耗"} busy={busy} close={() => { if (!busy) { setEditing(null); setError(""); } }}><EnergyEditor initial={editing} error={error} busy={busy} save={execute} saveBatch={execute} sources={sources} removeSource={remove} activities={editing.kind === "save_energy_day" ? state.activities.filter(row => row.date === editing.date && !row.deletedAt) : []} /></EditorDialog>}
  </section>;
}

function EnergyPlot({ days, selected, inspect }: { days: EnergyDay[]; selected: string; inspect: (date: string) => void }) {
  const container = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(container.current!); return () => observer.disconnect(); }, []);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.restingKcal}:${day.activeKcal}:${day.totalKcal}`).join("|") : "pending");
  const stride = Math.max(1, Math.ceil((days.length - 1) / (width < 440 ? 3 : 6)));
  const scale = chartScale(days.flatMap(day => [day.restingKcal == null && day.activeKcal == null ? null : Number(day.restingKcal ?? 0) + Number(day.activeKcal ?? 0), day.totalKcal]));
  const w = width || 280, left = 56, right = 12, slot = (w - left - right) / days.length, maximum = scale.max;
  const bottom = w < 340 ? 180 : 220;
  const y = (value: number) => bottom - value / maximum * (bottom - 30), barWidth = Math.min(30, slot * .65), x = (index: number) => left + (index + .5) * slot;
  return <div className={styles.plot} ref={container}><svg viewBox={`0 0 ${w} ${bottom + 34}`} style={{ visibility: width ? undefined : "hidden" }} role="group" aria-label="每日消耗柱状图">
    {scale.ticks.map(tick => <g key={tick}><line x1={left} x2={w - right} y1={y(tick)} y2={y(tick)} className={styles.grid} /><text x={left - 7} y={y(tick) + 4} textAnchor="end" className={styles.axis}>{tick}</text></g>)}<text x={left - 7} y="15" textAnchor="end" className={styles.axis}>kcal</text>
    {days.map((day, index) => { const resting = Number(day.restingKcal ?? 0), active = Number(day.activeKcal ?? 0), onlyTotal = day.restingKcal === null && day.activeKcal === null && day.totalKcal !== null; return <g key={day.date} role="button" tabIndex={day.date === selected ? 0 : -1} data-energy-date={day.date} aria-label={`${day.date} · 总消耗 ${day.totalKcal ?? "未填写"} kcal`} onMouseEnter={() => inspect(day.date)} onFocus={() => inspect(day.date)} onClick={() => inspect(day.date)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); inspect(day.date); } const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null; if (next !== null) { event.preventDefault(); event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-energy-date]")[Math.max(0, Math.min(days.length - 1, next))]?.focus(); } }}>
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
