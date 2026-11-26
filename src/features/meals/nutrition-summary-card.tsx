"use client";

import { useContext, useId, type ReactNode, type Ref } from "react";
import { WorkspaceRefreshingContext } from "@/features/dashboard/workspace-cache-context";
import { formatNutrition, macroComposition, metricLabels, type Totals } from "./model";
import { NutritionComposition } from "./nutrition-composition";
import styles from "./nutrition-summary-card.module.css";
import quick from "@/components/quick-actions.module.css";

const macros = ["proteinG", "carbsG", "fatG"] as const;

export function NutritionSummaryCard({
  date, totals, mealCount, estimated, loading = false, readingStatus, expanded = false, onExpandedChange, actions,
}: {
  date: string;
  totals?: Totals;
  loading?: boolean;
  readingStatus?: ReactNode;
  mealCount?: number;
  estimated?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  actions?: ReactNode;
}) {
  const detailsId = useId();
  const refreshing = useContext(WorkspaceRefreshingContext);
  const waitingForTotal = loading && totals?.values.caloriesKcal == null;
  const calories = totals?.values.caloriesKcal ?? null;
  const composition = macroComposition(totals);

  return <section data-guide-target="trend-nutrition-metrics"
    className={styles.card}
    data-record-slot="metrics"
    data-selected-date={date}
    data-expanded={expanded || undefined}
    data-guide-region=""
    data-action-slot={actions !== undefined || undefined}
    data-pending={waitingForTotal || undefined}
    aria-label="选中日营养"
    aria-busy={loading || refreshing || undefined}
  >
    <div className={styles.hero}>
      <div className={styles.total}>
        <div className={styles.caption}>
          <span>当天摄入{mealCount ? ` · ${mealCount} 餐` : ""}</span>
          {calories !== null && totals?.incomplete.caloriesKcal && <small>已知部分</small>}
        </div>
        <strong className={styles.calories} aria-live="polite">
          {waitingForTotal ? readingStatus : <>
            <span>{formatNutrition(calories, "caloriesKcal")}</span>
            <small>千卡</small>
            {calories !== null && estimated && <small className={styles.estimate}>含估算</small>}
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
        onClick={() => onExpandedChange?.(!expanded)}
      >
        营养详情
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
      </button>
    </div>
    <div id={detailsId} className={styles.macroPanel}>
      <div className={styles.macroClip}>
        <dl className={styles.macros} aria-live="polite">
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
      </div>
    </div>
    {actions !== undefined && <div className={styles.actions}>{actions}</div>}
  </section>;
}

export function MealPageActions({ record, openLibrary, libraryRef, historical }: {
  record: () => void;
  openLibrary: () => void;
  libraryRef?: Ref<HTMLButtonElement>;
  historical: boolean;
}) {
  const refreshing = useContext(WorkspaceRefreshingContext);
  return <div className={quick.stack} role="group" aria-label="饮食操作">
    <button className={quick.action} type="button" data-primary data-meal-record-entry data-guide-target="meal-page-entry" disabled={refreshing} onClick={record}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
      {historical ? "补记这天" : "记一餐"}
    </button>
    <button className={quick.action} type="button" ref={libraryRef} disabled={refreshing} onClick={openLibrary}
      data-meal-library-entry={refreshing ? "pending" : "ready"}>
      食材库
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>
    </button>
  </div>;
}
