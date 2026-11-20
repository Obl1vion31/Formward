import { formatNutrition, metricLabels, metrics, type Metric, type Nutrition } from "./model";
import styles from "./meal-editor.module.css";

export function MealInfoIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="10" cy="10" r="7.25" /><path d="M10 9v5m0-8v1" />
  </svg>;
}

export const nutrientUnit = (metric: Metric) => metric === "caloriesKcal" ? "千卡" : "g";

export function MealNutrientValue({ value, metric }: { value: string | null; metric: Metric }) {
  return <span className={styles.nutrientValue}>{formatNutrition(value, metric)}
    {value !== null && <small>{"\u00a0"}{nutrientUnit(metric)}</small>}
  </span>;
}

export function MealEntryReadings({ nutrition }: { nutrition: Nutrition }) {
  return <dl className={styles.readings}>
    {metrics.map(metric => <div key={metric} data-meal-reading={metric}>
      <dt>{metricLabels[metric]}</dt>
      <dd><MealNutrientValue metric={metric} value={nutrition[metric]} /></dd>
    </div>)}
  </dl>;
}

// Render measurements in the editor's language without changing the saved unit.
export const editorUnit = (unit: string) => unit === "g" ? "克" : /^ml$/i.test(unit) ? "毫升" : unit;
