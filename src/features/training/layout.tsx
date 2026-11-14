import type { ReactNode } from 'react';
import { TrainingIcon } from './icon';
import styles from './training.module.css';
export function TrainingLayout({ children, loading = false }: { children: ReactNode; loading?: boolean }) { return <section className={styles.workspace} data-training-view={!loading || undefined} data-training-loading={loading || undefined} aria-busy={loading || undefined} aria-label={loading ? '训练数据加载中' : undefined}>{children}</section>; }
export function TodayTrainingCard({ label, title, actions }: { label: ReactNode; title: ReactNode; actions: ReactNode }) { return <section className={styles.today} aria-label="今日训练"><div><p className={styles.date}>{label}</p><h2>{title}</h2></div><div className={styles.todayActions}>{actions}</div></section>; }
export const calendarCellCount = 42;

export function TrainingMonthControls({month,previous,next,loading=false}:{month?:string;previous?:()=>void;next?:()=>void;loading?:boolean}){const [year,number]=month?.split('-').map(Number)??[];return <div className={styles.monthControls}><button disabled={loading} className={styles.iconButton} aria-label="上个月" onClick={previous}><TrainingIcon kind="left"/></button><span className={styles.monthLabel} data-training-month>{month?year+'年'+number+'月':'日期读取中'}</span><button disabled={loading} className={styles.iconButton} aria-label="下个月" onClick={next}><TrainingIcon kind="right"/></button></div>;}

export function TrainingTemplates({ children, expanded = false, toggle, create, loading = false }: { children?: ReactNode; expanded?: boolean; toggle?: () => void; create?: () => void; loading?: boolean }) {
  return <section className={styles.templates} data-training-templates aria-labelledby="training-templates-title"><div className={styles.templateHeading}><h2 id="training-templates-title"><button className={styles.templateToggle} aria-expanded={expanded} aria-controls="training-template-list" onClick={toggle} disabled={loading}>训练模板<span className={styles.chevron} data-expanded={expanded}><TrainingIcon kind="right" /></span></button></h2><button className={styles.textButton} onClick={create} disabled={loading}><TrainingIcon kind="plus" />新建</button></div><div id="training-template-list" className={styles.templateList} hidden={!expanded}>{children}</div></section>;
}
