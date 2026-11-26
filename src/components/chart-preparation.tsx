"use client";

import type {CSSProperties} from "react";
import {LocalLoading, READING_DELAY_MS} from "./local-loading";
import styles from "./chart-preparation.module.css";

type PlotInsets = {top: number; right: number; bottom: number; left: number};

export function PlotLoadingGuides({top, right, bottom, left, desktopOnly = false}: PlotInsets & {desktopOnly?: boolean}) {
  const style = {
    inset: `${top}px ${right}px ${bottom}px ${left}px`,
    "--plot-wait-delay": READING_DELAY_MS + "ms",
  } as CSSProperties;
  return <div className={desktopOnly ? styles.guides + " desktop-only" : styles.guides} style={style} aria-hidden="true" data-chart-loading-guides=""/>;
}

/** 正式数据到达后，尺寸测量期间仍在同一图框内等待。 */
export function ChartPreparation({active, guideInsets}: {active: boolean; guideInsets?: PlotInsets}) {
  if (!active) return null;
  return <>
    {guideInsets && <PlotLoadingGuides {...guideInsets}/>}
    <div className="chart-preparation"><LocalLoading label="正在读取图表…" immediate/></div>
  </>;
}
