"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePageLoading } from "@/components/page-loading-state";
import { useLocalToday } from "@/components/use-local-today";
import { useMobileMode } from "@/components/use-mobile-mode";
import { useChartMotion } from "@/components/use-chart-motion";
import { EditorDialog } from "../meals/meals-view";
import { addCalendarDays, calendarOrdinal } from "../measurements/calendar";
import type { MeasurementDisplay } from "../measurements/entry-state";
import type { Result } from "../meals/model";
import { EnergyEditor } from "./energy-editor";
import { energyDays, energyValue, type EnergyAction, type EnergyDay, type EnergyInput, type EnergySnapshot, type EnergyRecord } from "./model";
import styles from "./energy.module.css";

export type SaveEnergy = (input: EnergyInput) => Promise<Result<{ snapshot: EnergySnapshot; message: string }>>;
const recordType = (record: EnergyRecord) => "effectiveFrom" in record ? "energy_profile" : "name" in record ? "activity" : "energy_day";
export function EnergyBasis({ day }: { day: EnergyDay }) {
  const basis = day.restingBasis;
  return <details className={styles.details}><summary>来源与依据</summary>
    <p>{day.totalSource === "override" ? "总消耗：采用录入总数" : "总消耗：静息与活动合计"}{day.record?.sourceSystem ? ` · ${day.record.sourceSystem}` : ""}</p>
    {basis ? <><p>静息：公式估算 · {basis.carried ? "引用近期晨重" : basis.weightEstimated ? "引用已有体重估计" : "空腹实测"}</p><p>{basis.weightDate} · {Number(basis.weightKg)} kg · {Number(basis.heightCm)} cm · {basis.age} 岁</p><p>10 × {Number(basis.weightKg)} + 6.25 × {Number(basis.heightCm)} − 5 × {basis.age} {basis.sex === "male" ? "+ 5" : "− 161"} = {energyValue(day.restingKcal)} kcal</p></> : day.restingKcal !== null && <p>静息：录入值</p>}
    <p>活动：{day.activeSource === "override" ? "录入合计" : day.activeSource === "activities" ? "已完成活动合计" : "未填写"}</p>
  </details>;
}
export function EnergyView({ snapshot, records, today: initialToday, save, initialDate = null }: { snapshot: EnergySnapshot; records: MeasurementDisplay[]; today: string; save: SaveEnergy; initialDate?: string | null }) {
  const today = useLocalToday(initialToday), mobile = useMobileMode();
  const [local, setLocal] = useState<EnergySnapshot | null>(null), [base, setBase] = useState(snapshot);
  if (base !== snapshot) { setBase(snapshot); setLocal(null); }
  const state = local ?? snapshot;
  const [editing, setEditing] = useState<EnergyAction | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, startTransition] = useTransition(), guard = useRef(false), request = useRef<{ content: string; id: string } | null>(null);
  const [mode, setMode] = useState<string | null>(null), [custom, setCustom] = useState({ from: addCalendarDays(initialDate ?? today, -29), to: initialDate ?? today }), [selected, setSelected] = useState(initialDate ?? today), [limit, setLimit] = useState(50);
  const range = mode ?? (mobile ? "7" : "30"), end = initialDate ?? today;
  const earliest = [end, today, ...state.days.map(day => day.date), ...state.activities.map(row => row.date)].sort()[0];
  const from = range === "all" ? earliest : range === "custom" ? custom.from : addCalendarDays(end, 1 - Number(range)), to = range === "custom" ? custom.to : end;
  const dates = useMemo(() => { try { const length = calendarOrdinal(to) - calendarOrdinal(from) + 1; return length > 0 && length <= 3661 ? Array.from({ length }, (_, index) => addCalendarDays(from, index)) : []; } catch { return []; } }, [from, to]);
  const chartDays = energyDays(state, records, dates), current = energyDays(state, records, [today])[0];
  const inspected = dates.includes(selected) ? selected : dates.at(-1) ?? today, chosen = chartDays.find(day => day.date === inspected);
  const historyDates = [...new Set([today, ...state.days.filter(day => !day.deletedAt).map(day => day.date), ...state.activities.filter(activity => !activity.deletedAt).map(activity => activity.date)])].sort().reverse();
  const history = energyDays(state, records, historyDates.slice(0, limit));
  const removed = [...state.days, ...state.activities, ...state.profiles].filter(record => record.deletedAt);
  usePageLoading({ active: busy, label: "正在保存消耗记录…" });
  function edit(action: EnergyAction) { setError(""); setNotice(""); setEditing(action); }
  function editDay(date: string) {
    const current = state.days.find(day => day.date === date && !day.deletedAt);
    edit({ kind: "save_energy_day", date, ...(current ? { id: current.id, version: current.version, restingKcal: current.restingKcal, activeKcal: current.activeKcal, totalKcal: current.totalKcal, timezone: current.timezone, sourceSystem: current.sourceSystem, sourceRecordId: current.sourceRecordId, sourceOccurredAt: current.sourceOccurredAt } : { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  }
  function addActivity(date: string) { edit({ kind: "save_activity", date, name: "", completed: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); }
  function editProfile() {
    const current = state.profiles.filter(profile => !profile.deletedAt && profile.effectiveFrom <= today).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    edit({ kind: "save_energy_profile", effectiveFrom: today, heightCm: current?.heightCm ?? "", birthDate: current?.birthDate ?? "", sex: current?.sex ?? "male", ...(current?.effectiveFrom === today ? { id: current.id, version: current.version } : {}) });
  }
  function execute(action: EnergyAction) {
    if (guard.current) return; guard.current = true; setError(""); setNotice("");
    const content = JSON.stringify(action); if (request.current?.content !== content) request.current = { content, id: crypto.randomUUID() };
    const operationId = request.current.id;
    startTransition(async () => {
      try { const result = await save({ operationId, actions: [action] }); if (!result.ok) { setError(result.error); return; } setLocal(result.data.snapshot); setNotice(result.data.message); setEditing(null); request.current = null; }
      catch { setError("保存未完成，当前输入已保留，请重试。"); }
      finally { guard.current = false; }
    });
  }
  return <section className={styles.workspace}>
    <header className={styles.heading}><h1>消耗</h1><time dateTime={today}>{today.replaceAll("-", ".")}</time></header>
    <div className={styles.toolbar}><button onClick={() => editDay(today)}>记录当天</button><button onClick={() => addActivity(today)}>添加活动</button><button onClick={editProfile}>公式资料</button></div>
    <div className={styles.summary} role="group" aria-label="今日消耗">{([["总消耗", current.totalKcal], ["静息", current.restingKcal], ["活动", current.activeKcal]] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{energyValue(value)}<small>kcal</small></strong>{(label === "静息" && current.restingBasis || label === "总消耗" && current.estimated) && <small>估计</small>}</div>)}</div>
    {error && !editing && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <section className={styles.section} aria-label="消耗历史趋势"><div className={styles.title}><div className={styles.title}><h2>每日消耗</h2><time>{from.replaceAll("-", ".")} — {to.replaceAll("-", ".")}</time></div><div className={styles.ranges}>{[["7", "7D"], ["30", "30D"], ["90", "90D"], ["all", "全部"], ["custom", "自定义"]].map(([key, label]) => <button key={key} aria-pressed={range === key} onClick={() => setMode(key)}>{label}</button>)}</div></div>
      {range === "custom" && <div className={styles.custom}><label>开始<input type="date" aria-label="消耗开始日期" value={custom.from} onChange={event => setCustom({ ...custom, from: event.target.value })} /></label><label>结束<input type="date" aria-label="消耗结束日期" value={custom.to} onChange={event => setCustom({ ...custom, to: event.target.value })} /></label></div>}
      <div className={styles.legend}><span><i style={{ background: "#6C96B3" }} />静息</span><span><i style={{ background: "#C07B77" }} />活动</span><span><i style={{ background: "#BEA478", height: 2 }} />录入总消耗</span></div>
      {!dates.length ? <p className={styles.empty}>请选择有效日期范围，最长 10 年。</p> : <><div className={styles.readout} aria-live="polite" aria-atomic="true"><time dateTime={inspected}>{inspected.replaceAll("-", ".")}</time>{([["总消耗", chosen?.totalKcal], ["静息", chosen?.restingKcal], ["活动", chosen?.activeKcal]] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{energyValue(value)}<small>kcal</small></strong></div>)}</div><EnergyPlot days={chartDays} selected={inspected} inspect={setSelected} open={editDay} />{chosen && <EnergyBasis day={chosen} />}</>}
    </section>
    <section className={styles.section} aria-label="每日消耗记录"><div className={styles.title}><h2>每日记录</h2></div><div className={styles.list}>{history.map(day => <article className={styles.row} key={day.date} data-energy-day={day.date}><div><time dateTime={day.date}>{day.date}</time><p>静息 {energyValue(day.restingKcal)} · 活动 {energyValue(day.activeKcal)} kcal{day.restingBasis && " · 静息估计"}</p></div><strong>{energyValue(day.totalKcal)}<small>kcal</small></strong><div className={styles.actions}><button disabled={busy} onClick={() => editDay(day.date)}>{day.record ? "编辑" : "录入"}</button><button disabled={busy} onClick={() => addActivity(day.date)}>添加活动</button>{day.record && <button disabled={busy} onClick={() => execute({ kind: "delete_energy_day", id: day.record!.id, version: day.record!.version })}>删除</button>}</div>
      {state.activities.some(activity => activity.date === day.date && !activity.deletedAt) && <details className={styles.details} style={{ width: "100%" }}><summary>活动明细</summary>{state.activities.filter(activity => activity.date === day.date && !activity.deletedAt).map(activity => <div className={styles.row} key={activity.id}><div><h3>{activity.name}</h3><p>{activity.durationMinutes !== null ? `${Number(activity.durationMinutes)} 分钟 · ` : ""}{activity.sourceSystem}{!activity.completed && " · 未完成"}</p></div><strong>{energyValue(activity.caloriesKcal)}<small>kcal</small></strong><div className={styles.actions}><button disabled={busy} onClick={() => { const { deletedAt, syncStatus, ...fields } = activity; void deletedAt; void syncStatus; edit({ kind: "save_activity", ...fields }); }}>编辑活动</button><button disabled={busy} onClick={() => execute({ kind: "delete_activity", id: activity.id, version: activity.version })}>删除活动</button></div></div>)}</details>}
    </article>)}</div>{historyDates.length > limit && <button onClick={() => setLimit(limit + 50)}>查看更早记录</button>}</section>
    <details className={styles.details}><summary>公式资料与历史</summary>{state.profiles.filter(profile => !profile.deletedAt).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map(profile => <div className={styles.row} key={profile.id}><div><h3>{profile.effectiveFrom} 起</h3><p>{Number(profile.heightCm)} cm · {profile.birthDate} · {profile.sex === "male" ? "男性" : "女性"}</p></div><div className={styles.actions}><button disabled={busy} onClick={() => { const { deletedAt, ...fields } = profile; void deletedAt; edit({ kind: "save_energy_profile", ...fields }); }}>编辑资料</button><button disabled={busy} onClick={() => { if (window.confirm(`删除将影响 ${profile.effectiveFrom} 起至下一份有效资料之前的公式估算，确认删除？`)) execute({ kind: "delete_energy_profile", id: profile.id, version: profile.version }); }}>删除资料</button></div></div>)}{!state.profiles.some(profile => !profile.deletedAt) && <p>尚未填写公式资料。</p>}<button onClick={editProfile}>填写公式资料</button></details>
    {removed.length > 0 && <details className={styles.details}><summary>最近删除 · {removed.length}</summary>{removed.map(record => <div className={styles.row} key={record.id}><span>{"name" in record ? record.name : "date" in record ? record.date : `${record.effectiveFrom} · 公式资料`}</span><button disabled={busy} onClick={() => { if ("effectiveFrom" in record && !window.confirm(`恢复将影响 ${record.effectiveFrom} 起至下一份有效资料之前的公式估算，确认恢复？`)) return; execute({ kind: `restore_${recordType(record)}`, id: record.id, version: record.version } as EnergyAction); }}>恢复</button></div>)}</details>}
    {editing && <EditorDialog title={editing.kind === "save_energy_profile" ? "公式资料" : editing.kind === "save_activity" ? "活动记录" : "每日消耗"} busy={busy} close={() => { if (!busy) { setEditing(null); setError(""); } }}><EnergyEditor initial={editing} error={error} busy={busy} save={execute} /></EditorDialog>}
  </section>;
}

function EnergyPlot({ days, selected, inspect, open }: { days: EnergyDay[]; selected: string; inspect: (date: string) => void; open: (date: string) => void }) {
  const container = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); observer.observe(container.current!); return () => observer.disconnect(); }, []);
  useChartMotion(container, width ? days.map(day => `${day.date}:${day.restingKcal}:${day.activeKcal}:${day.totalKcal}`).join("|") : "pending");
  const w = width || 280, left = 48, right = 12, slot = (w - left - right) / days.length, maximum = Math.max(1, ...days.flatMap(day => [Number(day.restingKcal ?? 0) + Number(day.activeKcal ?? 0), Number(day.totalKcal ?? 0)])) * 1.15;
  const y = (value: number) => 220 - value / maximum * 190, barWidth = Math.min(30, slot * .65), x = (index: number) => left + (index + .5) * slot;
  return <div className={styles.plot} ref={container}><svg viewBox={`0 0 ${w} 254`} style={{ visibility: width ? undefined : "hidden" }} role="group" aria-label="每日消耗柱状图">
    {[0, 1, 2, 3, 4].map(index => <g key={index}><line x1={left} x2={w - right} y1={y(maximum * index / 4)} y2={y(maximum * index / 4)} className={styles.grid} /><text x={left - 7} y={y(maximum * index / 4) + 4} textAnchor="end" className={styles.axis}>{Math.round(maximum * index / 4)}</text></g>)}<text x={left - 7} y="15" textAnchor="end" className={styles.axis}>kcal</text>
    {days.map((day, index) => { const resting = Number(day.restingKcal ?? 0), active = Number(day.activeKcal ?? 0), onlyTotal = day.restingKcal === null && day.activeKcal === null && day.totalKcal !== null; return <g key={day.date} role="button" tabIndex={day.date === selected ? 0 : -1} data-energy-date={day.date} aria-label={`${day.date} · 总消耗 ${day.totalKcal ?? "未填写"} kcal`} onMouseEnter={() => inspect(day.date)} onFocus={() => inspect(day.date)} onClick={() => open(day.date)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); open(day.date); } const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null; if (next !== null) { event.preventDefault(); event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-energy-date]")[Math.max(0, Math.min(days.length - 1, next))]?.focus(); } }}>
      <rect className={styles.hit} x={left + index * slot} y="22" width={slot} height="202" />
      {day.restingKcal !== null && <rect data-chart-bar data-chart-zero="220" data-energy-series="resting" data-value={day.restingKcal} x={x(index) - barWidth / 2} y={y(resting)} width={barWidth} height={y(0) - y(resting)} fill="#6C96B3" opacity={day.restingBasis ? .55 : .9} className={styles.mark} />}
      {day.activeKcal !== null && <rect data-chart-bar data-chart-zero="220" data-energy-series="active" data-value={day.activeKcal} x={x(index) - barWidth / 2} y={y(resting + active)} width={barWidth} height={y(resting) - y(resting + active)} fill="#C07B77" className={styles.mark} />}
      {onlyTotal && <rect data-chart-bar data-chart-zero="220" data-energy-series="total-only" data-value={day.totalKcal!} x={x(index) - barWidth / 2} y={y(Number(day.totalKcal))} width={barWidth} height={y(0) - y(Number(day.totalKcal))} fill="#9EAAA9" className={styles.mark} />}
      {day.totalSource === "override" && <line data-energy-total={day.totalKcal!} x1={x(index) - barWidth / 2 - 2} x2={x(index) + barWidth / 2 + 2} y1={y(Number(day.totalKcal))} y2={y(Number(day.totalKcal))} stroke="#BEA478" strokeWidth="2" className={styles.mark} />}
      {days.length <= 7 && <text x={x(index)} y="245" textAnchor="middle" className={styles.axis}>{slot >= 46 ? day.date.slice(5) : day.date.slice(8)}</text>}
    </g>; })}
    <line x1={x(days.findIndex(day => day.date === selected))} x2={x(days.findIndex(day => day.date === selected))} y1="22" y2="225" className={styles.crosshair} />{days.length > 7 && <text x={Math.max(left + 20, Math.min(w - right - 20, x(days.findIndex(day => day.date === selected))))} y="245" textAnchor="middle" className={styles.axis}>{selected.slice(5)}</text>}
  </svg></div>;
}
