"use client";
import { LoadingLink } from "@/components/loading-link";
import { useLocalToday } from "@/components/use-local-today";
import { formatNutrition, type MealView } from "../meals/model";
import type { MeasurementDisplay } from "../measurements/entry-state";
import { emptyEnergy, energyValue, type EnergySnapshot } from "../activities/model";
import { OverviewTrend } from "./overview-trend";
import { latestMorningWeight, overview } from "./model";
import styles from "./overview.module.css";
export function OverviewView({ meals, records, today: initial, energy = emptyEnergy() }: { meals: MealView[]; records: MeasurementDisplay[]; today: string; energy?: EnergySnapshot }) {
  const today = useLocalToday(initial), data = overview(meals, records, today, energy), body = latestMorningWeight(records, today);
  return <section className={styles.workspace}><header className={styles.heading}><h1>总览</h1><time dateTime={today}>{today.replaceAll("-", ".")}</time></header>
    <OverviewTrend records={records} meals={meals} energy={energy} today={today} />
    <div className={styles.cards}>
      <LoadingLink href="/dashboard/measurements" className={styles.card} aria-label="身体记录"><div><h2>身体状况</h2><span aria-hidden="true">→</span></div><strong>{body ? Number(body.weightKg) : "—"}<small>kg</small></strong><p>{body ? `${body.recordDate} · 晨间空腹` : "暂无晨间体重"}</p></LoadingLink>
      <LoadingLink href="/dashboard/meals" className={styles.card} aria-label="饮食记录"><div><h2>摄入状况</h2><span aria-hidden="true">→</span></div><strong>{formatNutrition(data.nutrition.values.caloriesKcal, "caloriesKcal")}<small>kcal</small></strong><p>{data.mealCount} 餐{data.nutrition.incomplete.caloriesKcal && " · 部分"}</p></LoadingLink>
      <LoadingLink href="/dashboard/energy" className={styles.card} aria-label="消耗记录"><div><h2>消耗状况</h2><span aria-hidden="true">→</span></div><strong>{energyValue(data.energy.totalKcal)}<small>kcal</small></strong>{data.energy.estimated && <p>含静息估计</p>}</LoadingLink>
    </div>
  </section>;
}
