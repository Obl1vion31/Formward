'use client';
import { useState } from 'react';
import { useDraftGuard } from '@/components/draft-guard';
import type { RecordAction, RecordRow } from '../records/model';
import { isTraining } from './ai-model';
import { TemplateForm } from './template-form';
import { templateDescription, type TemplateContent } from './model';
import styles from './training.module.css';
const content = (value: NonNullable<RecordRow['training']>['after']): TemplateContent | undefined => value ? 'exercises' in value ? value : value.content : undefined;
export function TrainingPlanReview({ rows, busy, edit, exclude, restore }: { rows: RecordRow[]; busy: boolean; edit: (key: string) => void; exclude: (key: string) => void; restore: (key: string) => void }) {
  return <section className={styles.planReview} aria-label="训练模板与排期"><h2>训练模板与排期</h2>{rows.map(row => {
    const preview = row.training, next = content(preview?.after) ?? (row.action.kind === 'save_training_template' ? row.action.template : undefined), before = content(preview?.before);
    const date = row.action.kind === 'schedule_training' ? row.action.date : null, beforeDate = preview?.before && 'date' in preview.before ? preview.before.date : null;
    return <article key={row.key} id={'record-' + row.key} className={styles.planReviewRow} data-excluded={row.excluded || undefined}><div className={styles.sectionHeading}><div><p className={styles.muted}>{row.persisted ? '已保存' : row.excluded ? '已取消本项' : preview?.unchanged ? '已存在，保持原安排' : preview?.before ? '修改申请' : '新增'} · {date ? '训练计划' : '训练模板'}</p><h3>{next?.name ?? '训练排期'}</h3></div>{!row.persisted && <div className={styles.exerciseActions}>{row.excluded ? <button className={styles.textButton} disabled={busy} onClick={() => restore(row.key)}>恢复本项</button> : <><button className={styles.textButton} disabled={busy} onClick={() => edit(row.key)}>{date ? '修改日期' : '修改模板'}</button><button className={styles.textButton} disabled={busy} onClick={() => exclude(row.key)}>取消本项</button></>}</div>}</div>
      {!row.excluded && <>{date && <p>{beforeDate && beforeDate !== date ? <><del>{beforeDate}</del> → </> : null}<strong>{date}</strong></p>}{date ? <details className={styles.beforePlan}><summary>{next?.exercises.length ?? 0}个动作 · 查看动作和目标</summary>{next?.exercises.map((e, i) => <div className={styles.previewRow} key={i}><span>{e.name}</span><small>{templateDescription(e)}</small></div>)}</details> : next?.exercises.map((e, i) => <div className={styles.previewRow} key={i}><span>{e.name}</span><small>{templateDescription(e)}</small></div>)}{before && JSON.stringify(before) !== JSON.stringify(next) && <details className={styles.beforePlan}><summary>修改前的内容</summary><p>{before.name}</p>{before.exercises.map((e, i) => <p className={styles.muted} key={i}>{e.name} · {templateDescription(e)}</p>)}</details>}{preview?.error && <p className={styles.error} role="alert">{preview.error}</p>}</>}
    </article>;
  })}</section>;
}
export function TrainingPlanReviewEditor({ row, busy, apply }: { row: RecordRow; busy: boolean; apply: (action: RecordAction) => void }) {
  const [date, setDate] = useState(row.action.kind === 'schedule_training' ? row.action.date : '');
  useDraftGuard(row.action.kind === 'schedule_training' && date !== row.action.date, busy);
  if (!isTraining(row.action)) return null;
  const action = row.action, version = row.training?.before?.version ?? action.version;
  if (action.kind === 'save_training_template') return <TemplateForm initial={action.template} busy={busy} submitLabel="应用修改" submit={async template => apply({ ...action, ...(action.id ? { version } : {}), template })} />;
  return <form className={styles.templateForm} onSubmit={event => { event.preventDefault(); apply({ ...action, ...(action.id ? { version } : {}), date }); }}><label className={styles.field}>安排日期<input type="date" required min="2000-01-01" max="2100-12-31" value={date} onChange={event => setDate(event.target.value)} /></label><p className={styles.muted}>应用修改后，仍需返回预览确认保存。</p><div className={styles.buttonRow}><button className={styles.primary} disabled={busy} type="submit">应用修改</button></div></form>;
}
