'use client';
import { useState } from 'react';
import { useDraftGuard } from '@/components/draft-guard';
import { ExercisePicker, MoveExercise, type ExerciseChoice } from './exercise-picker';
import { templateSchema, type TemplateContent } from './model';
import styles from './training.module.css';
export function TemplateForm({ initial, busy, submit, submitLabel = '保存模板' }: { initial?: TemplateContent; submitLabel?: string; busy: boolean; submit: (content: TemplateContent) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? ''), [exercises, setExercises] = useState(initial?.exercises ?? []), [picker, setPicker] = useState(false), [error, setError] = useState('');
  useDraftGuard(name !== (initial?.name ?? '') || JSON.stringify(exercises) !== JSON.stringify(initial?.exercises ?? []), busy);
  function add(items: ExerciseChoice[]) { setExercises(previous => [...previous, ...items.map(e => ({ ...e, sets: e.recordingType === 'reps' ? 3 : 1, reps: null, weightKg: null, durationSeconds: null, distanceMeters: null }))]); setPicker(false); }
  function move(index: number, delta: number) { setExercises(previous => { const next = [...previous]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); }
  function edit(index: number, field: 'sets' | 'reps' | 'weightKg' | 'durationSeconds' | 'distanceMeters', text: string) { setExercises(previous => previous.map((e, i) => i === index ? { ...e, [field]: text === '' ? null : Number(text) } : e)); }
  if (picker) return <ExercisePicker choose={add} cancel={() => setPicker(false)} limit={50 - exercises.length} />;
  return <form className={styles.templateForm} data-training-template-form onSubmit={event => { event.preventDefault(); const parsed = templateSchema.safeParse({ name, exercises }); if (!parsed.success) { setError('请填写模板名称、1–50个动作和有效目标；每项至少1组。'); return; } setError(''); void submit(parsed.data); }}>
    <label className={styles.field}>模板名称<input value={name} maxLength={80} required onChange={event => setName(event.target.value)} placeholder="例如：胸 · 肩 · 三头" /></label>
    <div className={styles.sectionHeading}><h3>动作清单</h3><button type="button" className={styles.textButton} disabled={busy || exercises.length >= 50} onClick={() => setPicker(true)}>＋ 添加动作</button></div>
    {!exercises.length && <p className={styles.emptyDay}>从动作库选择常练动作，也可以添加自定义动作。</p>}
    {exercises.map((e, i) => <section className={styles.templateExercise} key={i}><div className={styles.exerciseHeading}><h3>{i + 1}. {e.name}</h3><div className={styles.exerciseActions}><MoveExercise name={e.name} index={i} count={exercises.length} move={move} disabled={busy} /><button type="button" className={styles.iconButton} aria-label={'移除' + e.name} disabled={busy} onClick={() => setExercises(previous => previous.filter((_, index) => index !== i))}>×</button></div></div>
      <div className={styles.targetFields}><label>组数<input aria-label={e.name + '目标组数'} type="number" required min="1" max="100" step="1" value={e.sets ?? ''} disabled={busy} onChange={event => edit(i, 'sets', event.target.value)} /></label>
      {(e.recordingType ?? 'reps') === 'reps' ? <><label>目标次数<input aria-label={e.name + '目标次数'} type="number" min="1" max="999" step="1" placeholder="选填" value={e.reps ?? ''} disabled={busy} onChange={event => edit(i, 'reps', event.target.value)} /></label><label>目标重量 / kg<input aria-label={e.name + '目标重量公斤'} type="number" min="0" max="9999" step="any" placeholder="选填" value={e.weightKg ?? ''} disabled={busy} onChange={event => edit(i, 'weightKg', event.target.value)} /></label></> : <><label>目标时长 / 秒<input aria-label={e.name + '目标秒数'} type="number" min="1" max="86400" step="1" placeholder="选填" value={e.durationSeconds ?? ''} disabled={busy} onChange={event => edit(i, 'durationSeconds', event.target.value)} /></label>{e.recordingType === 'cardio' && <label>目标距离 / 米<input aria-label={e.name + '目标米数'} type="number" min="0" max="1000000" step="any" placeholder="选填" value={e.distanceMeters ?? ''} disabled={busy} onChange={event => edit(i, 'distanceMeters', event.target.value)} /></label>}</>}
      </div></section>)}
    <p className={styles.muted}>目标可以留空，实际完成情况在训练中填写。</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.buttonRow}><button type="submit" className={styles.primary} disabled={busy || !name.trim() || !exercises.length}>{busy ? '正在保存…' : submitLabel}</button></div>
  </form>;
}
