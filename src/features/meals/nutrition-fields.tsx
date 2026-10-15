"use client";
import { useId } from "react";
import { metrics, metricLabels, type FoodDraft, type Nutrition } from "./model";
import styles from "./meals.module.css";
export function NutritionFields({ value, change, readOnly = false }: { value: Nutrition; change: (value: Nutrition) => void; readOnly?: boolean }) {
  return <div className={styles.nutritionFields}>{metrics.map(metric => <label key={metric}>{metricLabels[metric]} <small>{metric === "caloriesKcal" ? "kcal" : "g"}</small><input aria-label={metricLabels[metric]} type="number" min="0" max="1000000" step="0.0001" inputMode="decimal" readOnly={readOnly} placeholder="未知" value={value[metric] == null ? "" : readOnly ? Number(value[metric]) : value[metric]} onChange={event => change({ ...value, [metric]: event.target.value || null })} /></label>)}</div>;
}
type SourceValue={ sourceKind: FoodDraft["sourceKind"]; basis?: string | null; evidenceUrl?: string | null };
export function SourceFields({ value, change, detailed = false }: { value: SourceValue; change: (next: SourceValue) => void; detailed?: boolean }) {
  const name=useId();
  const reference = ["label", "composition_table", "reference"].includes(value.sourceKind);
  return <div className={styles.sourceFields}>
    <fieldset className={styles.sourceChoices}><legend>营养依据</legend><label><input type="radio" name={name} checked={reference} onChange={()=>change({...value,sourceKind:reference?value.sourceKind:"reference"})}/>标签／成分表</label><label><input type="radio" name={name} checked={value.sourceKind==="estimated"} onChange={()=>change({...value,sourceKind:"estimated"})}/>直接预估</label></fieldset>
    <details className={styles.evidence} open={detailed||undefined}><summary>{detailed?"来源与估算依据":"补充说明（可选）"}</summary><label>依据／备注<textarea rows={2} value={value.basis ?? ""} placeholder="简短说明标签口径或估算方法" onChange={event => change({ ...value, basis: event.target.value || null })} /></label><label>来源链接（可选）<input type="url" value={value.evidenceUrl ?? ""} onChange={event => change({ ...value, evidenceUrl: event.target.value || null })} /></label></details>
  </div>;
}
