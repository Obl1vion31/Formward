"use client";
import { useEffect, useRef, useState } from "react";
import { Inspector } from "@/components/inspector";
import { useDraftGuard } from "@/components/draft-guard";
import { confirmAction } from "@/components/confirmation-state";
import { TrainingIcon } from "./icon";
import { completedSetCount, exercisesSchema, sessionSeconds, type TrainingExercise, type TrainingInput, type TrainingResult, type TrainingSession, type TrainingSnapshot } from "./model";
import styles from "./training.module.css";

type Props = { initial: TrainingSession; save: (input: TrainingInput) => Promise<TrainingResult>; update: (snapshot: TrainingSnapshot) => void; close: (finished?: TrainingSession) => void; refresh: () => Promise<TrainingResult> };
const library = ["杠铃卧推", "上斜哑铃卧推", "哑铃侧平举", "绳索下压", "高位下拉", "坐姿划船", "哑铃弯举", "杠铃深蹲", "罗马尼亚硬拉", "徒手深蹲"];
const newSet = () => ({ id: crypto.randomUUID(), weightKg: null, reps: null, completed: false });
export function TrainingEditor({ initial, save, update, close, refresh }: Props) {
  const [session, setSession] = useState(initial), [exercises, setExercises] = useState(initial.exercises);
  const [savedKey, setSavedKey] = useState(JSON.stringify(initial.exercises)), [error, setError] = useState(""), [busy, setBusy] = useState(false), [working, setWorking] = useState(false);
  const [picker, setPicker] = useState(false), [query, setQuery] = useState(""), [now, setNow] = useState(Date.now());
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
    if (!exercisesSchema.safeParse(draft.current).success) { setError("请检查组次：完成组必须填写正整数次数，重量可留空。"); return false; }
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
  async function leave() { if (working) return; setWorking(true); try { if (await flush()) close(); } finally { setWorking(false); } }
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
      update(result.snapshot);
      const next = result.snapshot.sessions.find(s => s.id === current.current.id);
      if (kind === "finish" || kind === "discard") close(kind === "finish" ? next : undefined);
      else if (next) { current.current = next; setSession(next); }
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
  function editSet(ei: number, si: number, field: "weightKg" | "reps", value: string) {
    const number = value === "" ? null : Number(value);
    change(draft.current.map((e, i) => i === ei ? { ...e, sets: e.sets.map((s, j) => j === si ? { ...s, [field]: number, completed: false } : s) } : e));
  }
  async function removeExercise(index: number) {
    const e = draft.current[index];
    if (e.sets.some(s => s.completed || s.weightKg !== null || s.reps !== null) && !await confirmAction({ title: "移除这个动作？", message: "此动作已填写的组次也会移除。", confirmLabel: "移除动作", cancelLabel: "保留" })) return;
    change(draft.current.filter((_, i) => i !== index));
  }
  async function removeSet(ei: number, si: number) {
    const s = draft.current[ei].sets[si];
    if ((s.completed || s.weightKg !== null || s.reps !== null) && !await confirmAction({ title: "移除这一组？", message: "这一组已填写的重量和次数会移除。", confirmLabel: "移除", cancelLabel: "保留" })) return;
    change(draft.current.map((e, i) => i === ei ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e));
  }
  function addExercise(name: string) { if (!name.trim()) return; if (draft.current.length >= 50) { setError("每次训练最多50个动作。"); return; } change([...draft.current, { id: crypto.randomUUID(), name: name.trim(), sets: [newSet()] }]); setPicker(false); setQuery(""); }
  const seconds = sessionSeconds(session, now);
  return <Inspector title={session.name} className={styles.sheet} busy={working} close={() => { void leave(); }} header={<div className={styles.sheetHead}><h2>{picker ? "添加动作" : session.name}</h2><button aria-label={picker ? "返回训练" : "保存并收起训练"} disabled={working} onClick={() => picker ? setPicker(false) : void leave()}><TrainingIcon kind="close" /></button></div>}>
    <div className={styles.sheetBody} data-training-editor>
      {picker ? <><form onSubmit={event => { event.preventDefault(); addExercise(query); }}><label className={styles.field}>动作名称<input maxLength={80} value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索或输入自己的动作" autoFocus /></label><button className={styles.secondary} type="submit" disabled={!query.trim()}>添加这个动作</button></form><div className={styles.choices}>{library.filter(n => n.includes(query.trim())).map(n => <button key={n} onClick={() => addExercise(n)}>{n}<TrainingIcon /></button>)}</div></> :
      <><div className={styles.sessionToolbar}><div><strong className={styles.timer}>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><button className={styles.textButton} disabled={working} onClick={() => void command(session.status === "active" ? "pause" : "resume")}>{session.status === "active" ? "暂停" : "继续计时"}</button></div><button className={styles.textButton} disabled={working} onClick={() => void leave()}>稍后继续</button></div>
      <p className={styles.muted} role="status">{busy ? "正在保存进度…" : dirty ? "等待保存进度" : "进度已保存"} · 重量可留空</p>
      {error && <div className={styles.error} role="alert"><p>{error}</p><div className={styles.buttonRow}><button className={styles.secondary} disabled={working || busy} onClick={() => { setError(""); void flush(); }}>重试保存</button><button className={styles.textButton} disabled={working || busy} onClick={() => void loadLatest()}>载入云端进度</button></div></div>}
      <div className={styles.exerciseList}>{exercises.map((e, ei) => <section key={e.id} className={styles.exercise}><div className={styles.exerciseHeading}><h3>{e.name}</h3><button className={styles.iconButton} aria-label={"移除" + e.name} disabled={working} onClick={() => void removeExercise(ei)}><TrainingIcon kind="close" /></button></div><div className={styles.setHeading}><span>组</span><span>重量 / kg</span><span>次数</span><span>完成</span><span /></div>
      {e.sets.map((s, si) => <div className={styles.setRow} key={s.id}><span>{si + 1}</span><input type="number" min="0" max="9999" step="any" inputMode="decimal" aria-label={e.name + "第" + (si + 1) + "组重量公斤"} placeholder="选填" value={s.weightKg ?? ""} disabled={working} onChange={event => editSet(ei, si, "weightKg", event.target.value)} /><input type="number" min="1" max="999" step="1" inputMode="numeric" aria-label={e.name + "第" + (si + 1) + "组次数"} placeholder="次数" value={s.reps ?? ""} disabled={working} onChange={event => editSet(ei, si, "reps", event.target.value)} /><button className={styles.completeSet} aria-label={e.name + "第" + (si + 1) + "组完成"} aria-pressed={s.completed} disabled={working} onClick={() => { if (!s.completed && (s.reps === null || !Number.isInteger(s.reps) || s.reps < 1 || s.reps > 999 || (s.weightKg !== null && (s.weightKg < 0 || s.weightKg > 9999)))) { setError("请先填写1–999的整数次数，重量可留空。"); return; } change(draft.current.map((row, i) => i === ei ? { ...row, sets: row.sets.map((set, j) => j === si ? { ...set, completed: !set.completed } : set) } : row)); }}><TrainingIcon kind="check" /></button><button className={styles.deleteSet} aria-label={"移除" + e.name + "第" + (si + 1) + "组"} disabled={working} onClick={() => void removeSet(ei, si)}><TrainingIcon kind="close" /></button></div>)}
      <button className={styles.textButton} disabled={working || e.sets.length >= 100} onClick={() => change(draft.current.map((row, i) => i === ei ? { ...row, sets: [...row.sets, newSet()] } : row))}><TrainingIcon />添加一组</button></section>)}</div>
      {!exercises.length && <p className={styles.empty}>从第一个动作开始记录。</p>}
      <div className={styles.buttonRow}><button className={styles.secondary} disabled={working} onClick={() => setPicker(true)}><TrainingIcon />添加动作</button><button className={styles.primary} disabled={working} onClick={() => void command("finish")}>{working ? "正在保存…" : "结束训练"}</button></div><button className={styles.textButton} disabled={working} onClick={() => void command("discard")}>放弃本次训练</button></>}
    </div>
  </Inspector>;
}
