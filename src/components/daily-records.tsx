"use client";
import type {ReactNode} from "react";
import {recordDateLabel} from "./record-dates";
import styles from "./record-ui.module.css";
export function SelectedDateHeading({date,view}:{date:string;view:()=>void}){return <div className={styles.selected} data-selected-date={date}><time dateTime={date}>{date.replaceAll("-",".")}</time><button type="button" onClick={view}>查看记录 →</button></div>;}
export function DailyRecords({children,viewAll}:{children:ReactNode;viewAll:()=>void}){return <section aria-label="最近记录"><div className={styles.heading}><h2>最近记录</h2><button type="button" onClick={viewAll}>查看全部 →</button></div>{children}</section>;}
export function DailyRecordRow({date,today,value,status,children}:{date:string;today:string;value:ReactNode;status?:ReactNode;children:ReactNode}){return <article className={styles.row} data-record-date={date}><div className={styles.date}><time dateTime={date}>{recordDateLabel(date,today)}</time><div className={styles.value}>{value}</div></div><div className={styles.status}>{status}</div><div className={styles.actions}>{children}</div></article>;}
