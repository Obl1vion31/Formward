"use client";

import { useId, useState, type ReactNode } from "react";
import { displayRecordDate } from "./record-dates";
import styles from "./record-ui.module.css";

export type RecordHistoryData = {
  today: string;
  dates: string[];
  renderRow: (date: string) => ReactNode;
  view: (date: string) => void;
};

/** 查询与历史展开共用一行，收起后保留已经查看的日期和批次。 */
export function RecordHistory({ data, loading }: { data?: RecordHistoryData; loading: boolean }) {
  const historyId = useId();
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState(false);
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState("");
  const today = data?.today ?? "";
  const canView = !loading && Boolean(today && selected) && selected <= today;

  return <>
    <form className={styles.historyDate} data-history-expanded={expanded || undefined} onSubmit={event => {
      event.preventDefault();
      if (expanded && canView) data?.view(selected);
    }}>
      <button
        type="button"
        disabled={loading || !data}
        className={styles.historyAction}
        data-history-toggle
        aria-expanded={expanded}
        aria-controls={historyId}
        onClick={() => {
          setOpened(true);
          setExpanded(value => !value);
        }}
      >
        <span className={styles.actionFace}>
          {expanded ? "收起历史" : "查看全部"}
          <span className={styles.historyArrow} aria-hidden="true">{expanded ? "↑" : "↓"}</span>
        </span>
      </button>
      {expanded && <>
        <div className={styles.dateField}>
          <input
            aria-label="查看日期"
            type="date"
            max={today}
            required
            value={selected}
            onChange={event => setSelected(event.target.value)}
          />
          <span className={styles.dateDisplay} data-placeholder={!selected || undefined} aria-hidden="true">
            {selected ? displayRecordDate(selected) : "选择日期"}
          </span>
          <svg className={styles.dateIcon} width="14" height="14" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/>
            <path d="M5.2 2v3m5.6-3v3M3 7h10"/>
          </svg>
        </div>
        <button className={styles.historyAction} type="submit" disabled={!canView}>
          <span className={styles.actionFace}>查询</span>
        </button>
      </>}
    </form>
    <div id={historyId} hidden={!expanded} data-record-history>
      {opened && data?.dates.slice(0, limit).map(data.renderRow)}
      {opened && data?.dates.length === 0 && <p className={styles.empty}>没有其他历史记录。</p>}
      {opened && data && limit < data.dates.length && (
        <button className={styles.historyAction} type="button" onClick={() => setLimit(value => value + 50)}>
          <span className={styles.actionFace}>加载更早日期</span>
        </button>
      )}
    </div>
  </>;
}
