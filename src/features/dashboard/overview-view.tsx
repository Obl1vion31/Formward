"use client";
import { LoadingLink } from "@/components/loading-link";
import { useLocalToday } from "@/components/use-local-today";
import { formatNutrition, metricLabels, metrics, type MealView } from "../meals/model";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { OverviewTrend } from "./overview-trend";
import { overview } from "./model";
import styles from "./overview.module.css";
export function OverviewView({ meals, records, today: initial }: { meals: MealView[]; records: MeasurementDisplay[]; today: string }) {
 const today = useLocalToday(initial), data = overview(meals, records, today);
 return <section className={styles.workspace}><header className={styles.heading}><h1>总览</h1><time dateTime={today}>{today.replaceAll("-", ".")}</time></header>
 <section className={styles.section} aria-label="今日饮食"><div className={styles.sectionHeading}><div><h2>今天的摄入</h2><p>{data.mealCount ? `${data.mealCount} 餐已记录 · 仅包含已记录摄入` : "今天还没有饮食记录"}</p></div><LoadingLink href="/dashboard/meals">饮食详情 →</LoadingLink></div>
 <div className={styles.nutrition}>{metrics.map(metric => <div key={metric}><span>{metricLabels[metric]}</span><strong>{formatNutrition(data.nutrition.values[metric], metric)}<small>{metric === "caloriesKcal" ? "kcal" : "g"}</small></strong>{data.nutrition.incomplete[metric] && <p>已知合计 · 数据不完整</p>}</div>)}</div></section>
 <section className={styles.section} aria-label="最新身体实测"><div className={styles.sectionHeading}><div><h2>身体状态</h2><p>最近一次晨间空腹实测</p></div><LoadingLink href="/dashboard/measurements">身体详情 →</LoadingLink></div><div className={styles.body}>{data.body.map(row => <div key={row.metric}><span>{row.metric === "weightKg" ? "体重" : "体脂率"}</span><strong>{row.current?.[row.metric] ?? "—"}<small>{row.metric === "weightKg" ? "kg" : "%"}</small></strong><p>{row.current ? `${row.current.recordDate} · 实测` : "暂无空腹实测"}</p><p>7 日变化 <span className={styles.bodyChange}>{row.change === null ? "—" : `${row.change > 0 ? "+" : ""}${row.change.toFixed(2)} ${row.metric === "weightKg" ? "kg" : "百分点"}`}</span></p></div>)}</div></section>
 <OverviewTrend meals={meals} records={records} today={today}/></section>;
}
