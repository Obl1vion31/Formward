"use client";

import {useEffect,useState} from "react";
import styles from "./local-loading.module.css";

export const READING_DELAY_MS = 350;
export const SLOW_READING_MS = 8000;

export function useDelayedReading(active: boolean, delay = READING_DELAY_MS) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => {
      clearTimeout(timer);
      setVisible(false);
    };
  }, [active, delay]);
  return active && visible;
}

export function LocalLoading({active = true, label = "正在读取…", iconOnly = false, onRetry}: {
  active?: boolean;
  label?: string;
  iconOnly?: boolean;
  onRetry?: () => void;
}) {
  const visible = useDelayedReading(active);
  const slow = useDelayedReading(active && !!onRetry, SLOW_READING_MS);
  return <span className={styles.slot} data-reading-status data-local-loading data-visible={visible || undefined} data-icon-only={iconOnly || undefined}>
    <span role="status" aria-atomic="true">
      {visible && (iconOnly ? <><span aria-hidden="true">…</span><span className="sr-only">{label}</span></> : slow ? "读取较慢" : label)}
    </span>
    {slow && <button type="button" onClick={onRetry}>重试</button>}
  </span>;
}

export function ReadingPage({title,label}:{title:string;label:string}){
  return <main className="dashboard-page"><section className="account-reading-page"><h1>{title}</h1><LocalLoading label={label}/></section></main>;
}
