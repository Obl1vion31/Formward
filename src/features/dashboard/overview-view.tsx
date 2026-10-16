"use client";
import { LoadingLink } from "@/components/loading-link";
import { useLocalToday } from "@/components/use-local-today";
import { formatNutrition, type MealView } from "../meals/model";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { OverviewTrend } from "./overview-trend";
import { latestRealWeight, overview } from "./model";
import styles from "./overview.module.css";
export function OverviewView({ meals, records, today: initial }: { meals: MealView[]; records: MeasurementDisplay[]; today: string }) {
 const today=useLocalToday(initial),data=overview(meals,records,today),body=latestRealWeight(records,today);
 return <section className={styles.workspace}><header className={styles.heading}><h1>总览</h1><time dateTime={today}>{today.replaceAll("-",".")}</time></header>
 <OverviewTrend meals={meals} records={records} today={today}/>
 <div className={styles.cards}>
 <LoadingLink href="/dashboard/measurements" className={styles.card} aria-label="身体记录"><div><h2>身体状况</h2><span>身体记录 →</span></div><strong>{body?Number(body.weightKg):"—"}<small>kg</small></strong><p>{body?`${body.recordDate} · ${body.period==="daytime"?"晨间空腹":"晚间"}实测`:"暂无体重实测"}</p></LoadingLink>
 <LoadingLink href="/dashboard/meals" className={styles.card} aria-label="饮食记录"><div><h2>摄入状况</h2><span>饮食记录 →</span></div><strong>{formatNutrition(data.nutrition.values.caloriesKcal,"caloriesKcal")}<small>kcal</small></strong><p>今天 · {data.mealCount} 餐已记录{data.nutrition.incomplete.caloriesKcal?" · 已知合计":""}</p><p>预算未设置</p></LoadingLink>
 </div></section>;
}
