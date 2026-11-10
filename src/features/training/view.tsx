"use client";
import { useEffect, useRef, useState } from "react";
import { Inspector } from "@/components/inspector";
import { useDraftGuard } from "@/components/draft-guard";
import { confirmAction } from "@/components/confirmation-state";
import { TrainingEditor } from "./editor";
import { TrainingLayout, TodayTrainingCard, TrainingTemplates, TrainingMonthControls, calendarCellCount } from "./layout";
import { TemplateForm } from './template-form';
import { useTemplateDrag } from './use-template-drag';
import { TrainingIcon } from "./icon";
import { trainingEntry, completedSetCount, exerciseToTemplate, setDescription, templateDescription, type TemplateContent, type TrainingInput, type TrainingPlan, type TrainingResult, type TrainingSession, type TrainingSnapshot, type TrainingTemplate } from "./model";
import styles from "./training.module.css";
import { localMeasurementDate } from "../measurements/entry-state";

type Props = { initialDate?:string|null; initial: TrainingSnapshot; today: string; save: (input: TrainingInput) => Promise<TrainingResult>; refresh: () => Promise<TrainingResult> };
type ErrorArea = 'today' | 'templates' | 'calendar' | 'panel';
type Panel = { kind: "template"; template: TrainingTemplate; plan?: TrainingPlan } | { kind: "schedule"; template?: TrainingTemplate } | { kind: "new"; content?: TemplateContent } | { kind: "history"; session: TrainingSession } | null;
export const trainingDateLabel = (date: string) => Number(date.slice(5, 7)) + "月" + Number(date.slice(8)) + "日";
const minutes = (seconds: number) => seconds < 60 ? "不足1分钟" : Math.floor(seconds / 60) + "分钟";
export function TrainingView({ initial, today: initialToday, initialDate=null, save, refresh }: Props) {
  const [snapshot, setSnapshot] = useState(initial), [today, setToday] = useState(initialToday);
  const [month, setMonth] = useState((initialDate??today).slice(0, 7)), [selected, setSelected] = useState(initialDate??today), [editing, setEditing] = useState<string | null>(null), [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false), [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  const [errorArea, setErrorArea] = useState<ErrorArea>('today'), [conflict, setConflict] = useState(false);
  const panelClose = useRef<() => Promise<void>>(() => Promise.resolve());
  const pending = useRef(false), request = useRef<{ key: string; input: TrainingInput } | null>(null);
  useDraftGuard(false, busy);
  useEffect(() => { const date=localMeasurementDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone); if(date===initialToday)return;const timer=setTimeout(()=>{setToday(date);if(!initialDate){setMonth(date.slice(0,7));setSelected(date);}},0);return()=>clearTimeout(timer); },[initialToday,initialDate]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  const entry = trainingEntry(snapshot, today), active = entry.kind === 'active' ? entry.session : undefined, plan = entry.kind === 'plan' ? entry.plan : undefined;
  const session = snapshot.sessions.find(s => s.id === editing), completed = snapshot.sessions.filter(s => s.status === 'completed');
  const dragHandle = useTemplateDrag(busy || !templatesOpen, schedule);
  async function execute(input: TrainingInput, area: ErrorArea = panel ? 'panel' : ['schedule', 'unschedule', 'delete_completed'].includes(input.kind) ? 'calendar' : 'today') {
    if (pending.current) return null; pending.current = true; setBusy(true); setError(""); setErrorArea(area); setConflict(false);
    const key = JSON.stringify({ ...input, operationId: "", ...(["start", "template", "schedule"].includes(input.kind) ? { id: "" } : {}) });
    if (request.current?.key !== key) request.current = { key, input };
    try {
      const result = await save(request.current.input);
      if (!result.ok) { setError(result.error); setConflict(Boolean(result.conflict)); return null; }
      request.current = null; setSnapshot(result.snapshot); return result;
    } catch { setError("保存未完成，请重试；当前输入已保留。"); return null; }
    finally { pending.current = false; setBusy(false); }
  }
  async function start(template?: TrainingTemplate, chosenPlan?: TrainingPlan) {
    if (active) { if(panel)await panelClose.current(); setEditing(active.id); return; }
    const result = await execute({ kind: "start", operationId: crypto.randomUUID(), id: crypto.randomUUID(), date: today, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(chosenPlan ? { planId: chosenPlan.id } : template ? { templateId: template.id } : {}) }, panel ? 'panel' : template ? 'templates' : 'today');
    if (result?.entityId) { if(panel)await panelClose.current(); setEditing(result.entityId); }
  }
  async function schedule(templateId: string, date: string) {
    const result = await execute({ kind: "schedule", operationId: crypto.randomUUID(), id: crypto.randomUUID(), templateId, date });
    if (result) { setSelected(date); setMonth(date.slice(0, 7)); if (panel) await panelClose.current(); setNotice("已安排到" + trainingDateLabel(date)); return true; }
    return false;
  }
  async function unschedule(p: TrainingPlan) {
    if (!await confirmAction({ title: "取消这次安排？", message: "只取消这一天的计划，训练模板和已完成记录保留。", confirmLabel: "取消安排", cancelLabel: "保留" })) return;
    if (await execute({ kind: "unschedule", operationId: crypto.randomUUID(), id: p.id, version: p.version })) { await panelClose.current(); setNotice("已取消安排。"); }
  }
  const [year, monthNumber] = month.split("-").map(Number), count = new Date(year, monthNumber, 0).getDate(), offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const monthCompleted = completed.filter(s => s.date.startsWith(month));
  function moveMonth(delta: number) { const d = new Date(Date.UTC(year, monthNumber - 1 + delta, 1)); if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return; const next = d.toISOString().slice(0, 7); setMonth(next); setSelected(next + "-01"); }
  async function deleteCompleted(done: TrainingSession) {
    const restoresPlan = done.planId && completed.filter(s => s.planId === done.planId).length === 1 && snapshot.plans.some(p => p.id === done.planId && p.status === 'completed');
    if (!await confirmAction({ title: '删除' + trainingDateLabel(done.date) + ' · ' + done.name + '？', message: '将永久删除这次训练的动作、组次和时长。' + (restoresPlan ? '当天对应计划将恢复为待训练。' : '') + '其他训练记录与模板保留。', confirmLabel: '删除训练', cancelLabel: '保留', danger: true })) return;
    if (await execute({ kind: 'delete_completed', operationId: crypto.randomUUID(), id: done.id, version: done.version }, 'calendar')) {
      setNotice('训练已删除'); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-training-date="' + done.date + '"]')?.focus({ preventScroll: true }));
    }
  }
  async function loadLatest() {
    if (pending.current) return; pending.current = true; setBusy(true);
    try { const result = await refresh(); if (result.ok) { setSnapshot(result.snapshot); setError(''); setConflict(false); request.current = null; } else setError(result.error); }
    catch { setError('加载未完成，请重试。'); } finally { pending.current = false; setBusy(false); }
  }
  const feedback = (area: ErrorArea) => error && errorArea === area ? <div className={styles.actionError}><p role="alert">{error}</p>{conflict && <button className={styles.textButton} disabled={busy} onClick={() => void loadLatest()}>加载最新记录</button>}</div> : null;
  const entryDate = active?.date ?? today, entryStatus = entry.kind === 'active' ? '进行中' : entry.kind === 'plan' ? '计划' : entry.kind === 'completed' ? '已完成' : '';
  const entryName = entry.kind === 'plan' ? entry.plan.content.name : entry.kind === 'active' || entry.kind === 'completed' ? entry.session.name : '自由训练';
  function toggleTemplate(id: string) { setExpandedTemplates(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return <TrainingLayout>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <TodayTrainingCard label={trainingDateLabel(entryDate) + (entryStatus ? ' · ' + entryStatus : '')}
      title={entry.kind === 'plan' ? <button className={styles.planTitle} onClick={() => setPanel({ kind: 'template', template: { id: entry.plan.templateId, version: 1, ...entry.plan.content }, plan: entry.plan })}>{entryName}<TrainingIcon kind="right" /></button> : entry.kind === 'completed' ? <button className={styles.planTitle} onClick={() => setPanel({ kind: 'history', session: entry.session })}>{entryName}<TrainingIcon kind="right" /></button> : entryName}
      actions={<><button data-record-guide-entry="training" className={styles.primary} disabled={busy} onClick={() => active ? setEditing(active.id) : void start(undefined, plan)}><TrainingIcon />{busy && errorArea === 'today' ? '正在开始…' : active ? '继续训练' : plan ? '按计划训练' : '开始训练'}</button>{plan && !active && <button className={styles.textButton} disabled={busy} onClick={() => void start()}>自由训练</button>}</>} />
    {feedback('today')}
    <TrainingTemplates expanded={templatesOpen} toggle={() => setTemplatesOpen(value => !value)} create={() => setPanel({ kind: 'new' })} loading={busy}>
      {snapshot.templates.length === 0 && <p className={styles.emptyTemplates}>暂无模板</p>}
      {snapshot.templates.map(t => <article className={styles.template} key={t.id} data-training-template={t.id}>
        <div className={styles.templateTitle}><h3><button className={styles.templateName} aria-expanded={expandedTemplates.has(t.id)} aria-controls={'template-content-' + t.id} onClick={() => toggleTemplate(t.id)}>{t.name}<span className={styles.chevron} data-expanded={expandedTemplates.has(t.id)}><TrainingIcon kind="right" /></span></button></h3><button className={styles.dragHandle} type="button" aria-label={'拖动' + t.name + '到日历'} disabled={busy} {...dragHandle(t)}><TrainingIcon kind="grip" /></button></div>
        <div className={styles.templateDetails} id={'template-content-' + t.id} hidden={!expandedTemplates.has(t.id)}>{t.exercises.map((exercise, index) => <div key={index} className={styles.previewRow}><span>{exercise.name}</span><small>{templateDescription(exercise)}</small></div>)}</div>
        <div className={styles.templateActions}><span className={styles.muted}>{t.exercises.length}个动作</span><button className={styles.textButton} disabled={busy} onClick={() => void start(t)}>开始训练</button><button className={styles.textButton} disabled={busy} onClick={() => setPanel({ kind: 'schedule', template: t })}>排期</button></div>
      </article>)}
      {feedback('templates')}
    </TrainingTemplates>
    <section aria-labelledby="training-calendar-title" className={styles.calendarSection}><div className={styles.sectionHeading}><h2 id="training-calendar-title">训练日历</h2><TrainingMonthControls month={month} previous={() => moveMonth(-1)} next={() => moveMonth(1)} /></div>
    <div className={styles.weekdays} aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map(d => <span key={d}>{d}</span>)}</div>
    <div className={styles.calendar} aria-label="训练月历">{Array.from({ length: offset }, (_, i) => <span key={'blank' + i} />)}{Array.from({ length: count }, (_, i) => {
      const date = month + '-' + String(i + 1).padStart(2, '0'), done = completed.filter(s => s.date === date), plans = snapshot.plans.filter(p => p.date === date && p.status === 'planned'), seconds = done.reduce((n, s) => n + s.elapsedSeconds, 0);
      return <button key={date} data-training-date={date} className={styles.day + ' ' + (done.length ? seconds < 2700 ? styles.heat1 : seconds < 3600 ? styles.heat2 : styles.heat3 : plans.length ? styles.planned : '')} aria-pressed={selected === date} aria-label={trainingDateLabel(date) + (done.length ? '，' + done.length + '次完成，' + minutes(seconds) : '') + (plans.length ? '，' + plans.length + '次计划' : '')} onClick={() => setSelected(date)}><span className={date === today ? styles.todayNumber : ''}>{i + 1}</span>{(done.length > 0 || plans.length > 0) && <i className={done.length ? styles.doneDot : styles.planDot} />}</button>;
    })}{Array.from({ length: calendarCellCount - offset - count }, (_, i) => <span key={'after' + i} aria-hidden="true" />)}</div>
    <div className={styles.calendarFooter}><div className={styles.legend}><span><i className={styles.planDot} />计划</span><span><i className={styles.doneDot} />完成</span><span className={styles.heatLegend}>训练时长<i className={styles.heat1} /><i className={styles.heat2} /><i className={styles.heat3} /></span></div>{monthCompleted.length > 0 && <p className={styles.muted}>{monthCompleted.length}次 · {Math.floor(monthCompleted.reduce((n, s) => n + s.elapsedSeconds, 0) / 60)}分钟</p>}</div>
    <div className={styles.dayDetail}><div className={styles.sectionHeading}><h3>{trainingDateLabel(selected)}</h3><button className={styles.textButton} disabled={busy || !snapshot.templates.length} onClick={() => setPanel({ kind: 'schedule' })}>安排训练</button></div>
      {feedback('calendar')}
      {completed.filter(s => s.date === selected).map(s => <div className={styles.record} key={s.id}><div><h3>{s.name}</h3><p className={styles.muted}>已完成 · {minutes(s.elapsedSeconds)} · {completedSetCount(s.exercises)}组</p></div><div className={styles.recordActions}><button className={styles.textButton} onClick={() => setPanel({ kind: 'history', session: s })}>回看</button><CompletedTrainingMenu session={s} busy={busy} remove={() => deleteCompleted(s)} /></div></div>)}
      {snapshot.plans.filter(p => p.date === selected && p.status === 'planned').map(p => <div className={styles.record} key={p.id}><div><h3>{p.content.name}</h3><p className={styles.muted}>计划 · {p.content.exercises.length}个动作</p></div><button className={styles.textButton} onClick={() => setPanel({ kind: 'template', template: { id: p.templateId, version: 1, ...p.content }, plan: p })}>查看</button></div>)}
      {!completed.some(s => s.date === selected) && !snapshot.plans.some(p => p.date === selected && p.status === 'planned') && <p className={styles.emptyDay}>暂无训练</p>}
    </div></section>
    {session && ["active", "paused"].includes(session.status) && <TrainingEditor key={session.id} initial={session} save={save} refresh={refresh} update={setSnapshot} close={finished => { setEditing(null); if(finished?.status==="completed"){setPanel({kind:"history",session:finished});setNotice("");}else setNotice("训练进度已保存。"); }} />}
    {panel && <Inspector title={panel.kind === "new" ? "新建训练模板" : panel.kind === "schedule" ? "安排训练" : panel.kind === "history" ? panel.session.name : panel.template.name} className={styles.sheet} busy={busy} onSavedCloseReady={close => { panelClose.current = close; }} close={() => setPanel(null)}><div className={styles.panelBody}>
      {feedback('panel')}
      {panel.kind === "new" && <TemplateForm initial={panel.content} busy={busy} submit={async template => { if (await execute({ kind: "template", operationId: crypto.randomUUID(), id: crypto.randomUUID(), template })) { await panelClose.current(); setNotice("训练模板已保存。"); } }} />}
      {panel.kind === "schedule" && <ScheduleForm templates={snapshot.templates} initialTemplate={panel.template?.id} date={selected} busy={busy} submit={schedule} />}
      {panel.kind === "template" && <><p className={styles.muted}>{panel.plan ? trainingDateLabel(panel.plan.date) + " · 计划训练" : "训练模板"}</p>{panel.template.exercises.map((e, i) => <div className={styles.previewRow} key={i}><span>{e.name}</span><small>{templateDescription(e)}</small></div>)}<div className={styles.buttonRow}><button className={styles.secondary} disabled={busy} onClick={() => setPanel({ kind: "schedule", template: panel.template })}>安排日期</button><button className={styles.primary} disabled={busy} onClick={() => void start(panel.template, panel.plan?.date === today ? panel.plan : undefined)}>{active ? "继续当前训练" : panel.plan?.date === today ? "开始训练" : "用模板练今天"}</button></div>{panel.plan && <button className={styles.textButton} disabled={busy} onClick={() => void unschedule(panel.plan!)}>取消这次安排</button>}</>}
      {panel.kind === "history" && <><p className={styles.muted}>{trainingDateLabel(panel.session.date)} · 已完成</p><div className={styles.stats}><div><strong>{minutes(panel.session.elapsedSeconds)}</strong><span>训练时长</span></div><div><strong>{panel.session.exercises.length}</strong><span>完成动作</span></div><div><strong>{completedSetCount(panel.session.exercises)}</strong><span>完成组数</span></div></div>{panel.session.exercises.map(e => <div className={styles.historyExercise} key={e.id}><h3>{e.name}</h3>{e.sets.map((s, i) => <p className={styles.muted} key={s.id}>第{i + 1}组 · {setDescription(e.recordingType ?? "reps", s)}</p>)}</div>)}<button className={styles.secondary} onClick={() => setPanel({ kind: "new", content: { name: panel.session.name, exercises: panel.session.exercises.map(exerciseToTemplate) } })}>存为模板</button></>}
    </div></Inspector>}
  </TrainingLayout>;
}
function ScheduleForm({ templates, initialTemplate, date, busy, submit }: { templates: TrainingTemplate[]; initialTemplate?: string; date: string; busy: boolean; submit: (id: string, date: string) => Promise<boolean> }) {
  const [id, setId] = useState(initialTemplate ?? templates[0]?.id ?? ""), [day, setDay] = useState(date);
  useDraftGuard(day !== date || id !== (initialTemplate ?? templates[0]?.id ?? ""), busy);
  return <form onSubmit={event => { event.preventDefault(); void submit(id, day); }}><label className={styles.field}>训练模板<select value={id} onChange={event => setId(event.target.value)}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className={styles.field}>安排日期<input type="date" value={day} min="2000-01-01" max="2100-12-31" required onChange={event => setDay(event.target.value)} /></label><p className={styles.muted}>计划与完成分开记录，结束训练后才点亮日历。</p><button className={styles.primary} type="submit" disabled={busy || !id}>{busy ? "正在保存…" : "加入日历"}</button></form>;
}

function CompletedTrainingMenu({ session, busy, remove }: { session: TrainingSession; busy: boolean; remove: () => Promise<void> }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { const outside = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false; }; document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside); }, []);
  return <details ref={ref} className={styles.recordMenu} data-training-menu onBlur={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }} onToggle={event => { if (event.currentTarget.open) document.querySelectorAll<HTMLDetailsElement>('[data-training-menu]').forEach(menu => { if (menu !== ref.current) menu.open = false; }); }}>
    <summary aria-label={session.name + '更多操作'}><TrainingIcon kind="more" /></summary><div className={styles.recordMenuPanel} role="group" aria-label="训练记录操作"><button type="button" disabled={busy} onClick={() => { if (ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); } void remove(); }}>删除训练</button></div>
  </details>;
}
