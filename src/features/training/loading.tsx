'use client';
import {useContext} from 'react';
import {WorkspaceTodayContext} from '@/components/workspace-frame-state';
import {useSearchParams} from 'next/navigation';
import {useLocalToday} from '@/components/use-local-today';
import {LocalLoading} from '@/components/local-loading';
import {WorkspacePending} from '@/features/dashboard/workspace-cache';
import {TrainingLayout,TodayTrainingCard,TrainingTemplates,TrainingMonthControls,calendarCellCount} from './layout';
import {linkedDate} from '../measurements/calendar';
import {TrainingIcon} from './icon';
import styles from './training.module.css';
export function TrainingSkeleton(){
 const params=useSearchParams(),today=useLocalToday(useContext(WorkspaceTodayContext)),date=linkedDate(params.get('date'))??today,month=date.slice(0,7);
 const first=month?new Date(month+'-01T00:00:00Z'):null,start=first?first.getTime()-((first.getUTCDay()+6)%7)*86400000:0;
 return <WorkspacePending><TrainingLayout loading>
  <TodayTrainingCard label={date?date.replaceAll('-','.'): '今天'} title="今日训练" actions={<button type="button" className={styles.primary} disabled aria-label="开始训练，正在读取当前训练状态"><TrainingIcon/>开始训练</button>}/>
  <TrainingTemplates loading/>
  <section className={styles.calendarSection} aria-label="训练日历加载中">
   <div className={styles.sectionHeading}><h2>训练日历</h2><TrainingMonthControls month={month||undefined} loading/></div>
   <div className={styles.weekdays} aria-hidden="true">{['一','二','三','四','五','六','日'].map(day=><span key={day}>{day}</span>)}</div>
   <div className={styles.calendar}>{first&&Array.from({length:calendarCellCount},(_,index)=>{const value=new Date(start+index*86400000),iso=value.toISOString().slice(0,10);return <div className={styles.day} key={iso}><time dateTime={iso} style={{color:iso.startsWith(month)?undefined:'var(--muted)'}}>{value.getUTCDate()}</time></div>;})}</div>
   <div className={styles.calendarFooter}><div className={styles.legend}><span><i className={styles.planDot}/>计划</span><span><i className={styles.doneDot}/>完成</span><span className={styles.heatLegend}>训练时长<i className={styles.heat1}/><i className={styles.heat2}/><i className={styles.heat3}/></span></div></div>
   <div className={styles.dayDetail}><div className={styles.sectionHeading}><h3>{date?date.replaceAll('-','.'): '所选日期'}</h3><button disabled className={styles.textButton}>安排训练</button></div><LocalLoading label="正在读取训练记录…"/></div>
  </section>
 </TrainingLayout></WorkspacePending>;
}
