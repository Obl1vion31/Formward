"use client";

import { useContext, useId, useState, type ReactNode, type Ref } from "react";
import { WorkspaceRefreshingContext } from "@/features/dashboard/workspace-cache-context";
import { formatNutrition, macroComposition, metricLabels, type Totals } from "./model";
import { NutritionComposition } from "./nutrition-composition";
import styles from "./nutrition-summary-card.module.css";

const macros = ["proteinG", "carbsG", "fatG"] as const;

export function NutritionSummaryCard({
  date, totals, loading = false, readingStatus, openLibrary, libraryRef,
}: {
  date: string;
  totals?: Totals;
  loading?: boolean;
  readingStatus?: ReactNode;
  openLibrary?: () => void;
  libraryRef?: Ref<HTMLButtonElement>;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const refreshing = useContext(WorkspaceRefreshingContext);
  const libraryReady = Boolean(openLibrary) && !loading && !refreshing;
  const waitingForTotal = loading && totals?.values.caloriesKcal == null;
  const calories = totals?.values.caloriesKcal ?? null;
  const composition = macroComposition(totals);

  return <section
    className={styles.card}
    data-record-slot="metrics"
    data-selected-date={date}
    data-expanded={expanded || undefined}
    aria-label="选中日营养"
    aria-busy={loading || refreshing || undefined}
  >
    <div className={styles.hero}>
      <div className={styles.total}>
        <div className={styles.caption}>
          <span className={styles.desktopCaption}>热量 · 千卡</span>
          <span className={styles.mobileCaption}>当天摄入</span>
          {calories !== null && totals?.incomplete.caloriesKcal && <small>已知部分</small>}
        </div>
        <strong className={styles.calories} aria-live="polite">
          {waitingForTotal ? readingStatus : <>
            <span>{formatNutrition(calories, "caloriesKcal")}</span>
            <small className={styles.mobileUnit}>千卡</small>
          </>}
        </strong>
      </div>
      <div className={styles.ring}><NutritionComposition totals={totals} loading={loading && !totals}/></div>
      <button
        className={styles.details}
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        disabled={loading || refreshing}
        onClick={() => setExpanded(current => !current)}
      >
        营养详情
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
      </button>
    </div>
    <dl className={styles.macros} id={detailsId} aria-live="polite">
      {macros.map(metric => {
        const value = totals?.values[metric] ?? null;
        const share = composition.segments.find(segment => segment.metric === metric);
        const note = value !== null && totals?.incomplete[metric] ? "已知部分" : share ? (share.ratio * 100).toFixed(1) + "%" : null;
        return <div className={styles.macro} key={metric}>
          <dt>{metricLabels[metric]}</dt>
          <dd>
            <strong>
              {loading && value === null ? null : formatNutrition(value, metric)}
              {value !== null && <small>g</small>}
            </strong>
            <span className={styles.note}>{note}</span>
          </dd>
        </div>;
      })}
    </dl>
    <button
      className={styles.library}
      type="button"
      ref={libraryRef}
      aria-label="食材库"
      data-meal-library-entry={libraryReady ? "ready" : "pending"}
      disabled={!libraryReady}
      onClick={openLibrary}
    >
      <span aria-hidden="true" className={styles.libraryLabel}><span>食</span><span>材</span><span>库</span></span>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>
    </button>
  </section>;
}
