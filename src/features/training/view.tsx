"use client";
import { useEffect, useRef, useState } from "react";
import { Inspector } from "@/components/inspector";
import { useDraftGuard } from "@/components/draft-guard";
import { confirmAction } from "@/components/confirmation-state";
import { TrainingEditor } from "./editor";
import { TrainingTabs } from "./navigation";
import { TrainingIcon } from "./icon";
import { completedSetCount, type TemplateContent, type TrainingInput, type TrainingPlan, type TrainingResult, type TrainingSession, type TrainingSnapshot, type TrainingTemplate } from "./model";
import styles from "./training.module.css";
import { localMeasurementDate } from "../measurements/entry-state";

type Props = { initial: TrainingSnapshot; today: string; save: (input: TrainingInput) => Promise<TrainingResult>; refresh: () => Promise<TrainingResult> };
type Panel = { kind: "template"; template: TrainingTemplate; plan?: TrainingPlan } | { kind: "schedule"; template?: TrainingTemplate } | { kind: "new"; content?: TemplateContent } | { kind: "history"; session: TrainingSession } | null;
export const trainingDateLabel = (date: string) => Number(date.slice(5, 7)) + "月" + Number(date.slice(8)) + "日";
const minutes = (seconds: number) => seconds < 60 ? "不足1分钟" : Math.floor(seconds / 60) + "分钟";
export function TrainingView({ initial, today: initialToday, save, refresh }: Props) {
  const [snapshot, setSnapshot] = useState(initial), [today, setToday] = useState(initialToday);
  const [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState(today), [editing, setEditing] = useState<string | null>(null), [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const pending = useRef(false), request = useRef<{ key: string; input: TrainingInput } | null>(null);
  const drag = useRef<{ element: HTMLElement; id: string; x: number; y: number; moved: boolean } | null>(null);
  useDraftGuard(false, busy);
  useEffect(() => { const date=localMeasurementDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone); if(date===initialToday)return;const timer=setTimeout(()=>{setToday(date);setMonth(date.slice(0,7));setSelected(date);},0);return()=>clearTimeout(timer); },[initialToday]);
  const active = snapshot.sessions.find(s => ["active", "paused"].includes(s.status)), plansToday = snapshot.plans.filter(p => p.date === today && p.status === "planned"), plan = plansToday[0];
  const session = snapshot.sessions.find(s => s.id === editing), completed = snapshot.sessions.filter(s => s.status === "completed"), completedToday = completed.filter(s => s.date === today);
  async function execute(input: TrainingInput) {
    if (pending.current) return null; pending.current = true; setBusy(true); setError("");
    const key = JSON.stringify({ ...input, operationId: "", ...(["start", "template", "schedule"].includes(input.kind) ? { id: "" } : {}) });
    if (request.current?.key !== key) request.current = { key, input };
    try {
      const result = await save(request.current.input);
      if (!result.ok) { setError(result.error); return null; }
      request.current = null; setSnapshot(result.snapshot); return result;
    } catch { setError("保存未完成，请重试；当前输入已保留。"); return null; }
    finally { pending.current = false; setBusy(false); }
  }
  async function start(template?: TrainingTemplate, chosenPlan?: TrainingPlan) {
    if (active) { setEditing(active.id); setPanel(null); return; }
    const result = await execute({ kind: "start", operationId: crypto.randomUUID(), id: crypto.randomUUID(), date: today, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(chosenPlan ? { planId: chosenPlan.id } : template ? { templateId: template.id } : {}) });
    if (result?.entityId) { setEditing(result.entityId); setPanel(null); }
  }
  async function schedule(templateId: string, date: string) {
    const result = await execute({ kind: "schedule", operationId: crypto.randomUUID(), id: crypto.randomUUID(), templateId, date });
    if (result) { setSelected(date); setMonth(date.slice(0, 7)); setPanel(null); setNotice("已安排到" + trainingDateLabel(date)); return true; }
    return false;
  }
  async function unschedule(p: TrainingPlan) {
    if (!await confirmAction({ title: "取消这次安排？", message: "只取消这一天的计划，训练模板和已完成记录保留。", confirmLabel: "取消安排", cancelLabel: "保留" })) return;
    if (await execute({ kind: "unschedule", operationId: crypto.randomUUID(), id: p.id, version: p.version })) { setPanel(null); setNotice("已取消安排。"); }
  }
  const [year, monthNumber] = month.split("-").map(Number), count = new Date(year, monthNumber, 0).getDate(), offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const monthCompleted = completed.filter(s => s.date.startsWith(month));
  function moveMonth(delta: number) { const d = new Date(Date.UTC(year, monthNumber - 1 + delta, 1)); if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return; const next = d.toISOString().slice(0, 7); setMonth(next); setSelected(next + "-01"); }
  function dragMove(event: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    if (!d.moved && Math.hypot(event.clientX - d.x, event.clientY - d.y) > 7) { d.moved = true; d.element.classList.add(styles.dragging); }
    if (!d.moved) return; event.preventDefault(); document.querySelectorAll("[data-training-drop]").forEach(e => e.removeAttribute("data-training-drop"));
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-training-date]"); cell?.setAttribute("data-training-drop", "true");
  }
  function endDrag(event: React.PointerEvent) {
    const d = drag.current; drag.current = null; if (!d) return; d.element.releasePointerCapture(event.pointerId); d.element.classList.remove(styles.dragging);
    document.querySelectorAll("[data-training-drop]").forEach(e => e.removeAttribute("data-training-drop"));
    if (event.type === "pointercancel" || !d.moved) return;
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-training-date]"); if (cell?.dataset.trainingDate) void schedule(d.id, cell.dataset.trainingDate);
  }
  return <section className={styles.workspace} data-training-view>
    <div className={styles.pageHeading}><TrainingTabs active="training" /></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <section className={styles.today} aria-label="今日训练"><div><p className={styles.date}>{trainingDateLabel(today)} · {active ? "训练进行中" : plan ? "今日计划" : completedToday.length ? "已完成" : "自由安排"}</p><h2>{active?.name ?? plan?.content.name ?? (completedToday.length ? "今天已经练过了" : "今天，自由安排")}</h2><p className={styles.muted}>{active ? active.exercises.length + "个动作 · " + completedSetCount(active.exercises) + "组已完成" + (active.date !== today ? " · 开始于" + trainingDateLabel(active.date) : "") : plan ? plan.content.exercises.length + "个动作 · " + plan.content.exercises.reduce((n, e) => n + e.sets, 0) + "组计划" : completedToday.length ? completedToday.length + "次训练已完成" : "从模板开始，或边练边添加动作"}</p>{plan && !active && <button className={styles.textButton} onClick={() => setPanel({ kind: "template", template: { id: plan.templateId, version: 1, ...plan.content }, plan })}>查看动作<TrainingIcon kind="right" /></button>}</div><div className={styles.todayActions}><button className={styles.primary} disabled={busy} onClick={() => active ? setEditing(active.id) : void start(undefined, plan)}><TrainingIcon />{busy ? "正在开始…" : active ? "继续训练" : "开始训练"}</button>{!active && <button className={styles.textButton} disabled={busy} onClick={() => void start()}>自由训练</button>}</div></section>
    <div className={styles.columns}><section aria-labelledby="training-calendar-title" className={styles.calendarSection}><div className={styles.sectionHeading}><h2 id="training-calendar-title">训练日历</h2><div className={styles.monthControls}><button className={styles.iconButton} aria-label="上个月" onClick={() => moveMonth(-1)}><TrainingIcon kind="left" /></button><span>{year}年{monthNumber}月</span><button className={styles.iconButton} aria-label="下个月" onClick={() => moveMonth(1)}><TrainingIcon kind="right" /></button></div></div><p className={styles.muted}>{monthCompleted.length}次完成 · {Math.floor(monthCompleted.reduce((n, s) => n + s.elapsedSeconds, 0) / 60)}分钟</p><div className={styles.weekdays} aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map(d => <span key={d}>{d}</span>)}</div>
    <div className={styles.calendar} aria-label="训练月历">{Array.from({ length: offset }, (_, i) => <span key={"blank" + i} />)}{Array.from({ length: count }, (_, i) => {
      const date = month + "-" + String(i + 1).padStart(2, "0"), done = completed.filter(s => s.date === date), plans = snapshot.plans.filter(p => p.date === date && p.status === "planned"), seconds = done.reduce((n, s) => n + s.elapsedSeconds, 0);
      return <button key={date} data-training-date={date} className={styles.day + " " + (done.length ? seconds < 2700 ? styles.heat1 : seconds < 3600 ? styles.heat2 : styles.heat3 : plans.length ? styles.planned : "")} aria-pressed={selected === date} aria-label={trainingDateLabel(date) + (done.length ? "，" + done.length + "次完成，" + minutes(seconds) : "") + (plans.length ? "，" + plans.length + "次计划" : "")} onClick={() => setSelected(date)}><span className={date === today ? styles.todayNumber : ""}>{i + 1}</span>{(done.length > 0 || plans.length > 0) && <i className={done.length ? styles.doneDot : styles.planDot} />}</button>;
    })}</div><div className={styles.legend}><span><i className={styles.planDot} />计划</span><span><i className={styles.doneDot} />完成</span><span className={styles.heatLegend}>训练时长<i className={styles.heat1} /><i className={styles.heat2} /><i className={styles.heat3} /></span></div><div className={styles.dayDetail}><div className={styles.sectionHeading}><h3>{trainingDateLabel(selected)}{selected === today ? " · 今天" : ""}</h3><button className={styles.textButton} disabled={busy || !snapshot.templates.length} onClick={() => setPanel({ kind: "schedule" })}>安排训练</button></div>
      {completed.filter(s => s.date === selected).map(s => <div className={styles.record} key={s.id}><div><h3>{s.name}</h3><p className={styles.muted}>已完成 · {minutes(s.elapsedSeconds)} · {completedSetCount(s.exercises)}组</p></div><button className={styles.textButton} onClick={() => setPanel({ kind: "history", session: s })}>回看</button></div>)}
      {snapshot.plans.filter(p => p.date === selected && p.status === "planned").map(p => <div className={styles.record} key={p.id}><div><h3>{p.content.name}</h3><p className={styles.muted}>计划 · {p.content.exercises.length}个动作</p></div><button className={styles.textButton} onClick={() => setPanel({ kind: "template", template: { id: p.templateId, version: 1, ...p.content }, plan: p })}>查看</button></div>)}
      {!completed.some(s => s.date === selected) && !snapshot.plans.some(p => p.date === selected && p.status === "planned") && <p className={styles.emptyDay}>这一天还没有训练记录或安排。</p>}
    </div></section>
    <aside className={styles.templates} aria-labelledby="training-templates-title"><div className={styles.sectionHeading}><h2 id="training-templates-title">训练模板</h2><button className={styles.textButton} onClick={() => setPanel({ kind: "new" })}>＋ 新建</button></div>{snapshot.templates.length > 0 ? <p className={styles.muted}>选择模板排期；电脑可拖到日历</p> : <p className={styles.emptyDay}>把常练的动作存为模板，下次直接开始。</p>}
      {snapshot.templates.map(t => <article className={styles.template} key={t.id} onPointerDown={event => { if (event.pointerType === "touch" || event.button !== 0 || (event.target as HTMLElement).closest("button")) return; drag.current = { element: event.currentTarget, id: t.id, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={dragMove} onPointerUp={endDrag} onPointerCancel={endDrag}><div className={styles.templateTitle}><h3>{t.name}</h3><TrainingIcon kind="grip" /></div><p className={styles.muted}>{t.exercises.length}个动作 · {t.exercises.reduce((n, e) => n + e.sets, 0)}组计划</p><div className={styles.templateActions}><button className={styles.textButton} onClick={() => setPanel({ kind: "template", template: t })}>查看动作</button><button className={styles.textButton} disabled={busy} onClick={() => setPanel({ kind: "schedule", template: t })}>排期</button></div></article>)}</aside></div>
    {session && ["active", "paused"].includes(session.status) && <TrainingEditor key={session.id} initial={session} save={save} refresh={refresh} update={setSnapshot} close={finished => { setEditing(null); if(finished?.status==="completed"){setPanel({kind:"history",session:finished});setNotice("训练已完成并保存。");}else setNotice("训练进度已保存。"); }} />}
    {panel && <Inspector title={panel.kind === "new" ? "新建训练模板" : panel.kind === "schedule" ? "安排训练" : panel.kind === "history" ? panel.session.name : panel.template.name} className={styles.sheet} busy={busy} close={() => setPanel(null)}><div className={styles.panelBody}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {panel.kind === "new" && <TemplateForm initial={panel.content} busy={busy} submit={async template => { if (await execute({ kind: "template", operationId: crypto.randomUUID(), id: crypto.randomUUID(), template })) { setPanel(null); setNotice("训练模板已保存。"); } }} />}
      {panel.kind === "schedule" && <ScheduleForm templates={snapshot.templates} initialTemplate={panel.template?.id} date={selected} busy={busy} submit={schedule} />}
      {panel.kind === "template" && <><p className={styles.muted}>{panel.plan ? trainingDateLabel(panel.plan.date) + " · 计划训练" : "训练模板"}</p>{panel.template.exercises.map((e, i) => <div className={styles.previewRow} key={i}><span>{e.name}</span><small>{e.sets}组{e.reps !== null ? " × " + e.reps + "次" : ""}</small></div>)}<div className={styles.buttonRow}><button className={styles.secondary} disabled={busy} onClick={() => setPanel({ kind: "schedule", template: panel.template })}>安排日期</button><button className={styles.primary} disabled={busy} onClick={() => void start(panel.template, panel.plan?.date === today ? panel.plan : undefined)}>{active ? "继续当前训练" : panel.plan?.date === today ? "开始训练" : "用模板练今天"}</button></div>{panel.plan && <button className={styles.textButton} disabled={busy} onClick={() => void unschedule(panel.plan!)}>取消这次安排</button>}</>}
      {panel.kind === "history" && <><p className={styles.muted}>{trainingDateLabel(panel.session.date)} · 已完成</p><div className={styles.stats}><div><strong>{minutes(panel.session.elapsedSeconds)}</strong><span>训练时长</span></div><div><strong>{panel.session.exercises.length}</strong><span>完成动作</span></div><div><strong>{completedSetCount(panel.session.exercises)}</strong><span>完成组数</span></div></div>{panel.session.exercises.map(e => <div className={styles.historyExercise} key={e.id}><h3>{e.name}</h3>{e.sets.map((s, i) => <p className={styles.muted} key={s.id}>第{i + 1}组 · {s.weightKg === null ? "重量未记" : s.weightKg + " kg"} · {s.reps}次</p>)}</div>)}<button className={styles.secondary} onClick={() => setPanel({ kind: "new", content: { name: panel.session.name, exercises: panel.session.exercises.map(e => ({ name: e.name, sets: e.sets.length, reps: e.sets[0]?.reps ?? null })) } })}>存为模板</button></>}
    </div></Inspector>}
  </section>;
}
function TemplateForm({ initial, busy, submit }: { initial?: TemplateContent; busy: boolean; submit: (content: TemplateContent) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? ""), [text, setText] = useState(initial?.exercises.map(e => e.name).join("\n") ?? ""), [error, setError] = useState("");
  useDraftGuard(name !== (initial?.name ?? "") || text !== (initial?.exercises.map(e => e.name).join("\n") ?? ""), busy);
  return <form onSubmit={event => { event.preventDefault(); const lines = text.split(/\r?\n/).map(n => n.trim()).filter(Boolean); if (!name.trim() || !lines.length || lines.length > 50 || lines.some(n => n.length > 80)) { setError("请填写模板名称和1–50个动作，每个名称不超过80字。"); return; } void submit({ name: name.trim(), exercises: lines.map((n, i) => ({ name: n, sets: initial?.exercises[i]?.sets ?? 3, reps: initial?.exercises[i]?.reps ?? 10 })) }); }}><label className={styles.field}>模板名称<input value={name} maxLength={80} required onChange={event => setName(event.target.value)} placeholder="例如：胸 · 肩 · 三头" /></label><label className={styles.field}>动作清单<textarea value={text} maxLength={4050} required onChange={event => setText(event.target.value)} placeholder={"每行一个动作\n例如：杠铃卧推\n哑铃侧平举"} /><small>新动作默认3组；实际次数和重量在训练中填写。</small></label>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.primary} type="submit" disabled={busy}>{busy ? "正在保存…" : "保存模板"}</button></form>;
}
function ScheduleForm({ templates, initialTemplate, date, busy, submit }: { templates: TrainingTemplate[]; initialTemplate?: string; date: string; busy: boolean; submit: (id: string, date: string) => Promise<boolean> }) {
  const [id, setId] = useState(initialTemplate ?? templates[0]?.id ?? ""), [day, setDay] = useState(date);
  useDraftGuard(day !== date || id !== (initialTemplate ?? templates[0]?.id ?? ""), busy);
  return <form onSubmit={event => { event.preventDefault(); void submit(id, day); }}><label className={styles.field}>训练模板<select value={id} onChange={event => setId(event.target.value)}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className={styles.field}>安排日期<input type="date" value={day} min="2000-01-01" max="2100-12-31" required onChange={event => setDay(event.target.value)} /></label><p className={styles.muted}>计划与完成分开记录，结束训练后才点亮日历。</p><button className={styles.primary} type="submit" disabled={busy || !id}>{busy ? "正在保存…" : "加入日历"}</button></form>;
}
