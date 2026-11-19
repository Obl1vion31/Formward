"use client";
import {useId,useState,type ReactNode} from "react";
import {displayRecordDate,recordDateLabel} from "./record-dates";
import styles from "./record-ui.module.css";
export function SelectedDateHeading({date,view,status,pending=false}:{date:string;view:()=>void;status?:ReactNode;pending?:boolean}){
 const selectedDate=date?<time dateTime={date}>{displayRecordDate(date)}</time>:<span aria-label="正在读取记录日期">—</span>;
 return <div className={styles.selected} data-selected-date={date}>{status!==undefined?<span className={styles.selectedInfo}>{selectedDate}{status}</span>:selectedDate}<button type="button" disabled={pending||!date} onClick={view}>查看记录 →</button></div>;
}
export function DailyRecords({children,history,actions,loading=false,kind,readingStatus}:{children?:ReactNode;history?:ReactNode;actions?:ReactNode;loading?:boolean;readingStatus?:ReactNode;kind?:"body"}){
 const id=useId(),[expanded,setExpanded]=useState(false),[opened,setOpened]=useState(false);
 return <section className={styles.records} aria-label="最近记录" data-record-slot="records" data-loading={loading||undefined} data-record-kind={kind}><div className={styles.heading}><h2>最近记录</h2>{actions}</div>{loading?<div>{readingStatus}</div>:children}
  <button type="button" disabled={loading} className={styles.historyToggle} data-history-toggle aria-expanded={expanded} aria-controls={id} onClick={()=>{setOpened(true);setExpanded(value=>!value);}}>{expanded?"收起历史 ↑":"查看全部 ↓"}</button>
  <div id={id} hidden={!expanded} data-record-history>{opened&&history}</div>
 </section>;
}
export function DailyRecordRow({date,today,value,status,children,layout,disclosure,details}:{
 date:string;today:string;value:ReactNode;status?:ReactNode;children:ReactNode;
 layout?:"body";disclosure?:ReactNode;details?:ReactNode;
}){
 return <article className={styles.row} data-record-date={date} data-row-layout={layout}>
  <div className={styles.date}>
   <div className={styles.dateHeading}><time dateTime={date}>{recordDateLabel(date,today)}</time>{status&&<div className={styles.status}>{status}</div>}</div>
   <div className={styles.value}>{value}</div>
  </div>
  <div className={styles.actions} data-record-actions>{children}</div>
  {disclosure&&<div className={styles.rowDisclosure}>{disclosure}</div>}
  {details}
 </article>;
}
