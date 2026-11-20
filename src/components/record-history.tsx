"use client";

import { useId, useState, type ReactNode } from "react";
import { displayRecordDate } from "./record-dates";
import styles from "./record-ui.module.css";

/** 页面内日期索引。查看和编辑交给各页的单日 Inspector。 */
export function RecordHistory({ today, dates, renderRow, view }: {
  today: string;
  dates: string[];
  renderRow: (date: string) => ReactNode;
  view: (date: string) => void;
}) {
  const dateId = useId();
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState("");
  const canView = Boolean(selected) && selected <= today;

  return <>
    <form className={styles.historyDate} onSubmit={event => {
      event.preventDefault();
      if (canView) view(selected);
    }}>
      <label htmlFor={dateId}>查看日期</label>
      <div className={styles.dateField}>
        <input
          id={dateId}
          type="date"
          max={today}
          required
          value={selected}
          onChange={event => setSelected(event.target.value)}
        />
        <span className={styles.dateDisplay} data-placeholder={!selected || undefined} aria-hidden="true">
          {selected ? displayRecordDate(selected) : "选择日期"}
        </span>
        <svg className={styles.dateIcon} width="16" height="16" viewBox="0 0 16 16" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/>
          <path d="M5.2 2v3m5.6-3v3M3 7h10"/>
        </svg>
      </div>
      <button className={styles.historyAction} type="submit" disabled={!canView}>
        <span className={styles.actionFace}>查看</span>
      </button>
    </form>
    {dates.slice(0, limit).map(renderRow)}
    {!dates.length && <p className={styles.empty}>没有其他历史记录。</p>}
    {limit < dates.length && <button className={styles.historyAction} type="button" onClick={() => setLimit(value => value + 50)}>
      <span className={styles.actionFace}>加载更早日期</span>
    </button>}
  </>;
}
