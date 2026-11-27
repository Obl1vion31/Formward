"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { RecordHistory, type RecordHistoryData } from "./record-history";
import {displayRecordDate,recordDateLabel} from "./record-dates";
import styles from "./record-ui.module.css";
import { highlightLocalChange } from "./local-motion";
export function SelectedDateHeading({date,view,status,pending=false,actions}:{date:string;view:()=>void;status?:ReactNode;pending?:boolean;actions?:ReactNode}){
 const selectedDate=date?<time dateTime={date}>{displayRecordDate(date)}</time>:<span aria-label="正在读取记录日期">—</span>;
 const viewButton=<button type="button" data-guide-target="selected-day-details" disabled={pending||!date} onClick={view}>查看记录 →</button>;
 return <div className={styles.selected} data-selected-date={date}>
  {status!==undefined?<span className={styles.selectedInfo}>{selectedDate}{status}</span>:selectedDate}
  {actions ? <div className={styles.selectedActions}>{actions}{viewButton}</div> : viewButton}
 </div>;
}
type RecordDomain = "mealDay" | "energyDay" | "measurement";

export function DailyRecords({ children, history, actions, loading = false, kind, readingStatus, domain, covered = false }: {
  children?: ReactNode;
  history?: RecordHistoryData;
  actions?: ReactNode;
  loading?: boolean;
  readingStatus?: ReactNode;
  kind?: "body";
  domain?: RecordDomain;
  covered?: boolean;
}) {
  const records = useRef<HTMLElement>(null);
  const [savedDate, setSavedDate] = useState<string>();
  useEffect(() => {
    if (!domain) return;
    const onSaved = (event: Event) => {
      const entries = (event as CustomEvent<readonly { key: string; version: string | null }[]>).detail;
      const match = entries?.find(entry => entry.key.startsWith(domain + ":") && entry.version !== null);
      if (match && !records.current?.closest("[inert]")) setSavedDate(match.key.split(":")[1]);
    };
    window.addEventListener("formward-record-saved", onSaved);
    return () => window.removeEventListener("formward-record-saved", onSaved);
  }, [domain]);

  useLayoutEffect(() => {
    if (!savedDate || covered || loading) return;
    const frame = requestAnimationFrame(() => {
      const row = records.current?.querySelector<HTMLElement>(
        '[data-record-date="' + CSS.escape(savedDate) + '"] [data-record-value]',
      );
      if (row) highlightLocalChange(row, "saved");
      setSavedDate(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [covered, loading, savedDate]);

  return <section ref={records} className={styles.records} aria-label="最近记录" data-record-slot="records"
    data-loading={loading || undefined} data-record-kind={kind}>
    <div className={styles.heading}><h2>最近记录</h2>{actions}</div>
    {loading ? <div>{readingStatus}</div> : children}
    <RecordHistory data={history} loading={loading}/>
  </section>;
}
type RecordRowActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type"> & {
  intent: "edit" | "view";
};

export function RecordRowAction({ intent, children, ...props }: RecordRowActionProps) {
  return <button {...props} type="button" className={styles.rowAction} data-record-action={intent}>
    {intent === "edit" ? <span className={styles.actionFace}>{children}</span> : children}
  </button>;
}

export function DailyRecordRow({date,today,value,status,children,layout}:{
 date:string;today:string;value:ReactNode;status?:ReactNode;children:ReactNode;
 layout?:"body";
}){
 return <article className={styles.row} data-record-date={date} data-row-layout={layout}>
  <div className={styles.date}>
   <div className={styles.dateHeading}><time dateTime={date}>{recordDateLabel(date,today)}</time>{status&&<div className={styles.status}>{status}</div>}</div>
   <div className={styles.value} data-record-value>{value}</div>
  </div>
  <div className={styles.actions} data-record-actions>{children}</div>
 </article>;
}
