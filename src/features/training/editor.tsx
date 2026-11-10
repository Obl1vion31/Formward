"use client";
import { useEffect, useRef, useState } from "react";
import { Inspector } from "@/components/inspector";
import { useDraftGuard } from "@/components/draft-guard";
import { confirmAction } from "@/components/confirmation-state";
import { ExercisePicker, MoveExercise, type ExerciseChoice } from './exercise-picker';
import { TrainingIcon } from "./icon";
import { completedSetCount, exerciseSchema, exercisesSchema, newTrainingSet, setDescription, sessionSeconds, type TrainingExercise, type TrainingInput, type TrainingResult, type TrainingSession, type TrainingSnapshot } from "./model";
import styles from "./training.module.css";

type Props = { initial: TrainingSession; save: (input: TrainingInput) => Promise<TrainingResult>; update: (snapshot: TrainingSnapshot) => void; close: (finished?: TrainingSession) => void; refresh: () => Promise<TrainingResult> };
export function TrainingEditor({ initial, save, update, close, refresh }: Props) {
  const [session, setSession] = useState(initial), [exercises, setExercises] = useState(initial.exercises);
  const [savedKey, setSavedKey] = useState(JSON.stringify(initial.exercises)), [error, setError] = useState(""), [busy, setBusy] = useState(false), [working, setWorking] = useState(false);
  const [picker, setPicker] = useState(false), [now, setNow] = useState(Date.now());
  const surfaceClose = useRef<() => Promise<void>>(() => Promise.resolve()), finishedOnClose = useRef<TrainingSession | undefined>(undefined);
  const draft = useRef(exercises), saved = useRef(savedKey), current = useRef(initial), inflight = useRef<Promise<boolean> | null>(null);
  const retry = useRef<{ content: string; input: TrainingInput } | null>(null), mounted = useRef(true);
  const key = JSON.stringify(exercises), dirty = key !== savedKey;
  // 不登记到 Inspector 的放弃机制：关闭会先保存，失败时留在原处。
  useDraftGuard(false, busy || working);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const guard = (event: BeforeUnloadEvent) => { if (saved.current !== JSON.stringify(draft.current) || inflight.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard); return () => { clearInterval(timer); window.removeEventListener("beforeunload", guard); };
  }, []);
  function change(next: TrainingExercise[]) { draft.current = next; setExercises(next); setError(""); }
  async function flush(): Promise<boolean> {
    if (inflight.current) { if (!await inflight.current) return false; }
    const content = JSON.stringify(draft.current);
    if (content === saved.current) return true;
    if (!exercisesSchema.safeParse(draft.current).success) { setError("请检查组次：完成组需要填写对应的次数、时长或距离。"); return false; }
    const input: TrainingInput = retry.current?.content === content ? retry.current.input : { kind: "save", operationId: crypto.randomUUID(), id: current.current.id, version: current.current.version, name: current.current.name, exercises: draft.current };
    retry.current = { content, input }; setBusy(true);
    const task = (async () => {
      try {
        const result = await save(input);
        if (!result.ok) { setError(result.error); return false; }
        const next = result.snapshot.sessions.find(s => s.id === current.current.id);
        if (!next || !["active", "paused"].includes(next.status)) { setError("此训练已在其他页面结束，请重新载入云端进度。"); return false; }
        current.current = next; saved.current = content; retry.current = null;
        if (mounted.current) { setSession(next); setSavedKey(content); update(result.snapshot); setError(""); }
        return true;
      } catch { setError("保存未完成，当前输入已保留，请重试。"); return false; }
      finally { if (mounted.current) setBusy(false); }
    })();
    inflight.current = task;
    const ok = await task; inflight.current = null;
    return ok && JSON.stringify(draft.current) !== saved.current ? flush() : ok;
  }
  useEffect(() => {
    if (!dirty || error || working) return;
    const timer = setTimeout(() => { void flush(); }, 850);
    return () => clearTimeout(timer);
  }); // 每次编辑后重置防抖；flush 串行保存，不覆盖保存途中的新输入。
  async function prepareClose() { if(working)return false;setWorking(true);try{return await flush();}finally{setWorking(false);} }
  async function leave() { if(await prepareClose())await surfaceClose.current(); }
  async function command(kind: "pause" | "resume" | "finish" | "discard") {
    if (working) return;
    if (kind === "finish" && !completedSetCount(draft.current)) { await command("discard"); return; }
    if (kind === "finish" && !await confirmAction({ title: "结束这场训练？", message: "只保存已勾选的组，未完成的组不计入本次记录。", confirmLabel: "结束并保存", cancelLabel: "继续记录" })) return;
    if (kind === "discard" && !await confirmAction({ title: "放弃本次训练？", message: "本次动作和组次不会计入完成记录，今日计划保留。", confirmLabel: "放弃训练", cancelLabel: "继续记录", danger: true })) return;
    setWorking(true);
    try {
      if (kind !== "discard" && !await flush()) return;
      if (inflight.current) await inflight.current;
      const result = await save({ kind, id: current.current.id, version: current.current.version, operationId: crypto.randomUUID() });
      if (!result.ok) { setError(result.error); return; }
      const next = result.snapshot.sessions.find(s => s.id === current.current.id);
      if (kind === "finish" || kind === "discard") { finishedOnClose.current = kind === "finish" ? next : undefined; await surfaceClose.current(); }
      else if (next) { current.current = next; setSession(next); }
      update(result.snapshot);
    } catch { setError("操作未完成，当前输入已保留，请重试。"); }
    finally { setWorking(false); }
  }
  async function loadLatest() {
    if (working || busy || !await confirmAction({ title: "载入云端进度？", message: "当前尚未保存的输入将由云端最新记录替换。", confirmLabel: "载入云端", cancelLabel: "保留输入" })) return;
    const result = await refresh(); if (!result.ok) { setError(result.error); return; }
    const next = result.snapshot.sessions.find(s => s.id === current.current.id); update(result.snapshot);
    if (!next || !["active", "paused"].includes(next.status)) { close(); return; }
    current.current = next; draft.current = next.exercises; saved.current = JSON.stringify(next.exercises); retry.current = null; setExercises(next.exercises); setSavedKey(saved.current); setSession(next); setError("");
  }
  function editSet(ei: number, si: number, field: "weightKg" | "reps" | "durationSeconds" | "distanceMeters", value: string) {
    const number = value === "" ? null : Number(value);
    change(draft.current.map((e, i) => i === ei ? { ...e, sets: e.sets.map((s, j) => j === si ? { ...s, [field]: number, completed: false } : s) } : e));
  }
  async function removeExercise(index: number) {
    const e = draft.current[index];
    if (e.sets.some(s => s.completed || s.weightKg !== null || s.reps !== null || s.durationSeconds != null || s.distanceMeters != null) && !await confirmAction({ title: "移除这个动作？", message: "此动作已填写的组次也会移除。", confirmLabel: "移除动作", cancelLabel: "保留" })) return;
    change(draft.current.filter((_, i) => i !== index));
  }
  async function removeSet(ei: number, si: number) {
    const s = draft.current[ei].sets[si];
    if ((s.completed || s.weightKg !== null || s.reps !== null || s.durationSeconds != null || s.distanceMeters != null) && !await confirmAction({ title: "移除这一组？", message: "这一组已填写的记录会移除。", confirmLabel: "移除", cancelLabel: "保留" })) return;
    change(draft.current.map((e, i) => i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e));
  }
  function addExercises(items: ExerciseChoice[]) {
    if (draft.current.length + items.length > 50) { setError('每次训练最多50个动作。'); return; }
    change([...draft.current, ...items.map(e => ({ ...e, id: crypto.randomUUID(), sets: [newTrainingSet()] }))]); setPicker(false);
  }
  function moveExercise(index: number, delta: number) { const next = [...draft.current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; change(next); }
  const seconds = sessionSeconds(session, now);
  return <Inspector title={session.name} className={styles.sheet} busy={working} beforeClose={prepareClose} onSavedCloseReady={callback => { surfaceClose.current = callback; }} close={() => close(finishedOnClose.current)} header={<div className={styles.sheetHead}><h2>{picker ? "添加动作" : session.name}</h2><button aria-label={picker ? "返回训练" : "保存并收起训练"} disabled={working} onClick={() => picker ? setPicker(false) : void leave()}><TrainingIcon kind="close" /></button></div>}>
    <div className={styles.sheetBody} data-entry-form="training" data-training-editor aria-busy={working}>
      {picker ? <ExercisePicker choose={addExercises} cancel={() => setPicker(false)} limit={50 - exercises.length} /> :
      <><div className={styles.sessionToolbar}><div><strong className={styles.timer}>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><button className={styles.textButton} disabled={working} onClick={() => void command(session.status === "active" ? "pause" : "resume")}>{session.status === "active" ? "暂停" : "继续计时"}</button></div><button className={styles.textButton} disabled={working} onClick={() => void leave()}>稍后继续</button></div>
      <p className={styles.muted} role="status">{busy ? "正在保存进度…" : dirty ? "等待保存进度" : "进度已保存"} · 重量可留空</p>
      {error && <div className={styles.error} role="alert"><p>{error}</p><div className={styles.buttonRow}><button className={styles.secondary} disabled={working || busy} onClick={() => { setError(""); void flush(); }}>重试保存</button><button className={styles.textButton} disabled={working || busy} onClick={() => void loadLatest()}>载入云端进度</button></div></div>}
      <div className={styles.exerciseList}>{exercises.map((e, ei) => {
        const type = e.recordingType ?? 'reps', fields = type === 'reps' ? ['weightKg', 'reps'] as const : type === 'cardio' ? ['durationSeconds', 'distanceMeters'] as const : ['durationSeconds'] as const;
        const labels = { weightKg: '重量 / kg', reps: '次数', durationSeconds: '时长 / 秒', distanceMeters: '距离 / 米' };
        const aria = { weightKg: '重量公斤', reps: '次数', durationSeconds: '秒数', distanceMeters: '米数' };
        return <section key={e.id} className={styles.exercise}><div className={styles.exerciseHeading}><h3>{e.name}</h3><div className={styles.exerciseActions}><MoveExercise name={e.name} index={ei} count={exercises.length} move={moveExercise} disabled={working} /><button className={styles.iconButton} aria-label={'移除' + e.name} disabled={working} onClick={() => void removeExercise(ei)}><TrainingIcon kind="close" /></button></div></div>
        {e.target && Object.values(e.target).some(v => v != null) && <p className={styles.targetHint}>模板目标：{setDescription(type, e.target)}</p>}
        <div className={styles.setHeading} data-recording-type={type}><span>组</span>{fields.map(field => <span key={field}>{labels[field]}</span>)}<span>完成</span><span /></div>
        {e.sets.map((s, si) => <div data-record-guide-fields className={styles.setRow} data-recording-type={type} key={s.id}><span>{si + 1}</span>{fields.map(field => <input key={field} type="number" min={field === 'weightKg' ? '0' : field === 'distanceMeters' ? '0' : '1'} max={field === 'weightKg' ? '9999' : field === 'reps' ? '999' : field === 'durationSeconds' ? '86400' : '1000000'} step={field === 'weightKg' || field === 'distanceMeters' ? 'any' : '1'} inputMode={field === 'weightKg' || field === 'distanceMeters' ? 'decimal' : 'numeric'} aria-label={e.name + '第' + (si + 1) + '组' + aria[field]} placeholder={field === 'weightKg' ? '选填' : labels[field].split(' / ')[0]} value={s[field] ?? ''} disabled={working} onChange={event => editSet(ei, si, field, event.target.value)} />)}<button className={styles.completeSet} aria-label={e.name + '第' + (si + 1) + '组完成'} aria-pressed={s.completed} disabled={working} onClick={() => {
          const parsed = exerciseSchema.safeParse({ ...e, sets: [{ ...s, completed: true }] });
          if (!s.completed && !parsed.success) { setError(type === 'reps' ? '请先填写1–999的整数次数，重量可留空。' : type === 'duration' ? '请先填写1–86400的整数秒数。' : '请先填写有效的时间或距离，未知项留空。'); return; }
          change(draft.current.map((row, i) => i === ei ? { ...row, sets: row.sets.map((set, j) => j === si ? { ...set, completed: !set.completed } : set) } : row));
        }}><TrainingIcon kind="check" /></button><button className={styles.deleteSet} aria-label={'移除' + e.name + '第' + (si + 1) + '组'} disabled={working} onClick={() => void removeSet(ei, si)}><TrainingIcon kind="close" /></button></div>)}
        <button className={styles.textButton} disabled={working || e.sets.length >= 100} onClick={() => change(draft.current.map((row, i) => i === ei ? { ...row, sets: [...row.sets, newTrainingSet()] } : row))}><TrainingIcon />添加一组</button></section>;
      })}</div>
      {!exercises.length && <p className={styles.empty}>从第一个动作开始记录。</p>}
      <div className={styles.buttonRow}><button data-record-guide-fields className={styles.secondary} disabled={working || exercises.length >= 50} onClick={() => setPicker(true)}><TrainingIcon />添加动作</button><button data-record-guide-save className={styles.primary} disabled={working} onClick={() => void command("finish")}>{working ? "正在保存…" : "结束训练"}</button></div><button className={styles.textButton} disabled={working} onClick={() => void command("discard")}>放弃本次训练</button></>}
    </div>
  </Inspector>;
}
