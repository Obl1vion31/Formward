import styles from "./chart-preparation.module.css";

export function PlotSkeleton({ still = false }: { still?: boolean }) {
  return <div className={styles.skeleton} aria-hidden="true" data-chart-skeleton data-still={still||undefined}/>;
}

/** 正式数据到达后，尺寸测量期间仍在同一图框内等待。 */
export function ChartPreparation({active}: {active: boolean}) {
  if (!active) return null;
  return <><PlotSkeleton/><span className="sr-only" role="status">正在读取图表…</span></>;
}
