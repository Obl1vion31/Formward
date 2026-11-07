'use client';
import { SkeletonBlock } from '@/components/skeleton-block';
import { TrainingLayout, TodayTrainingCard, TrainingMonthControls, calendarCellCount } from './layout';
import styles from './training.module.css';
export function TrainingSkeleton() {
  const block = (width: number | string, height = 14) => <SkeletonBlock width={width} height={height} />;
  return <TrainingLayout loading><TodayTrainingCard label={block(120)} title={block('min(260px, 85%)', 30)} subtitle={block('min(270px, 95%)')} actions={block('100%', 46)} />
    <div className={styles.columns}><section className={styles.calendarSection} aria-label="训练日历加载中"><div className={styles.sectionHeading}><h2>训练日历</h2><TrainingMonthControls loading /></div><p className={styles.muted}>{block(130)}</p><div className={styles.weekdays} aria-hidden="true">{['一','二','三','四','五','六','日'].map(day => <span key={day}>{day}</span>)}</div><div className={styles.calendar}>{Array.from({ length: calendarCellCount }, (_, i) => <div className={styles.day + ' ' + styles.skeletonDay} key={i}>{block(16, 12)}</div>)}</div><div className={styles.legend}><span><i className={styles.planDot} />计划</span><span><i className={styles.doneDot} />完成</span><span className={styles.heatLegend}>训练时长<i className={styles.heat1} /><i className={styles.heat2} /><i className={styles.heat3} /></span></div><div className={styles.dayDetail}><div className={styles.sectionHeading}><h3>{block(90)}</h3><button disabled className={styles.textButton}>安排训练</button></div><p className={styles.emptyDay}>{block('65%')}</p></div></section>
    <aside className={styles.templates}><div className={styles.sectionHeading}><h2>训练模板</h2><button disabled className={styles.textButton}>＋ 新建</button></div><p className={styles.emptyDay}>{block('100%')}{block('72%')}</p></aside></div>
  </TrainingLayout>;
}
