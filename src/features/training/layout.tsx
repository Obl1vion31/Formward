import type { ReactNode } from 'react';
import { SkeletonBlock } from '@/components/skeleton-block';
import { TrainingIcon } from './icon';
import { TrainingTabs } from './navigation';
import styles from './training.module.css';
export function TrainingLayout({ children, loading = false }: { children: ReactNode; loading?: boolean }) { return <section className={styles.workspace} data-training-view={!loading || undefined} data-training-loading={loading || undefined} aria-busy={loading || undefined} aria-label={loading ? '训练数据加载中' : undefined}><div className={styles.pageHeading}><TrainingTabs active="training" /></div>{children}</section>; }
export function TodayTrainingCard({ label, title, subtitle, actions }: { label: ReactNode; title: ReactNode; subtitle: ReactNode; actions: ReactNode }) { return <section className={styles.today} aria-label="今日训练"><div><p className={styles.date}>{label}</p><h2>{title}</h2><p className={styles.muted}>{subtitle}</p></div><div className={styles.todayActions}>{actions}</div></section>; }
export const calendarCellCount = 42;

export function TrainingMonthControls({month,previous,next,loading=false}:{month?:string;previous?:()=>void;next?:()=>void;loading?:boolean}){const [year,number]=month?.split('-').map(Number)??[];return <div className={styles.monthControls}><button disabled={loading} className={styles.iconButton} aria-label="上个月" onClick={previous}><TrainingIcon kind="left"/></button><span className={styles.monthLabel} data-training-month>{loading?<SkeletonBlock width={70} height={14}/>:year+'年'+number+'月'}</span><button disabled={loading} className={styles.iconButton} aria-label="下个月" onClick={next}><TrainingIcon kind="right"/></button></div>;}
