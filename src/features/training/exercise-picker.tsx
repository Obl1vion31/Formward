'use client';
import { useState } from 'react';
import { catalogSnapshot, categoryLabels, exerciseCatalog, recordingLabels, searchExercises } from './catalog';
import type { RecordingType } from './model';
import { TrainingIcon } from './icon';
import styles from './training.module.css';
export type ExerciseChoice = { name: string; recordingType: RecordingType; catalogId?: string };
export function ExercisePicker({ choose, cancel, limit = 50 }: { choose: (items: ExerciseChoice[]) => void; cancel: () => void; limit?: number }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [body, setBody] = useState(''), [equipment, setEquipment] = useState('');
  const [selected, setSelected] = useState<ExerciseChoice[]>([]), [custom, setCustom] = useState(false), [customType, setCustomType] = useState<RecordingType>('reps'), [customName, setCustomName] = useState('');
  const results = searchExercises(query, category, body, equipment);
  const key = (item: ExerciseChoice) => item.catalogId ?? item.name + ':' + item.recordingType;
  function toggle(item: ExerciseChoice) { setSelected(previous => previous.some(e => key(e) === key(item)) ? previous.filter(e => key(e) !== key(item)) : previous.length < limit ? [...previous, item] : previous); }
  return <section className={styles.picker} aria-label="动作库">
    <div className={styles.sectionHeading}><h3>选择动作</h3><button type="button" className={styles.textButton} onClick={cancel}>返回</button></div>
    <label className={styles.field}>搜索动作<input autoFocus type="search" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} placeholder="中文、英文或常用名称" /></label>
    <div className={styles.catalogFilters}>
      <label>类型<select value={category} onChange={event => setCategory(event.target.value)}><option value="">全部类型</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>部位<select value={body} onChange={event => setBody(event.target.value)}><option value="">全部部位</option>{[...new Set(exerciseCatalog.flatMap(e => e.bodyParts))].map(part => <option key={part}>{part}</option>)}</select></label>
      <label>器械<select value={equipment} onChange={event => setEquipment(event.target.value)}><option value="">全部器械</option>{[...new Set(exerciseCatalog.map(e => e.equipment))].map(gear => <option key={gear}>{gear}</option>)}</select></label>
    </div>
    <div className={styles.sectionHeading}><p className={styles.muted}>{results.length}个动作 · 已选{selected.length}个</p><button type="button" className={styles.textButton} onClick={() => { setCustom(value => !value); setCustomName(query); }}>自定义动作</button></div>
    {custom && <div className={styles.customExercise}><label className={styles.field}>动作名称<input value={customName} maxLength={80} onChange={event => setCustomName(event.target.value)} /></label><label className={styles.field}>记录方式<select value={customType} onChange={event => setCustomType(event.target.value as RecordingType)}>{Object.entries(recordingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" className={styles.secondary} disabled={!customName.trim() || selected.length >= limit} onClick={() => { toggle({ name: customName.trim(), recordingType: customType }); setCustom(false); }}>选入清单</button></div>}
    <div className={styles.catalogResults} aria-label="动作搜索结果">{results.map(e => { const pressed = selected.some(item => item.catalogId === e.id); return <button key={e.id} type="button" aria-pressed={pressed} disabled={!pressed && selected.length >= limit} className={styles.catalogRow} onClick={() => toggle(catalogSnapshot(e))}><span><strong>{e.name}</strong><small>{e.bodyParts.join(' / ')} · {e.equipment} · {recordingLabels[e.recordingType]}</small></span><span className={styles.pickCheck}><TrainingIcon kind={pressed ? 'check' : 'plus'} /></span></button>; })}{!results.length && <p className={styles.empty}>没有匹配动作，可以更换筛选或添加自定义动作。</p>}</div>
    <div className={styles.pickerFooter}><p className={styles.muted}>{selected.length ? selected.map(e => e.name).join('、') : '可选择多个动作，添加后调整顺序'}</p><button type="button" className={styles.primary} disabled={!selected.length} onClick={() => choose(selected)}>{selected.length ? '添加' + selected.length + '个动作' : '添加动作'}</button></div>
  </section>;
}
export function MoveExercise({ name, index, count, move, disabled = false }: { name: string; index: number; count: number; move: (index: number, delta: number) => void; disabled?: boolean }) { return <div className={styles.moveExercise}><button type="button" className={styles.iconButton} disabled={disabled || !index} aria-label={'上移' + name} onClick={() => move(index, -1)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button><button type="button" className={styles.iconButton} disabled={disabled || index === count - 1} aria-label={'下移' + name} onClick={() => move(index, 1)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button></div>; }
