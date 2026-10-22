"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocalToday } from "@/components/use-local-today";
import { LoadingLink } from "@/components/loading-link";
import { formatNutrition } from "../meals/model";
import { energyValue } from "../activities/model";
import { OverviewTrend } from "./overview-trend";
import type { OverviewPresentation } from "./presentation";
import styles from "./overview.module.css";
export function OverviewView({ presentation }: { presentation: OverviewPresentation }) {
  const today = presentation.today, data = presentation.summary, body = presentation.body;
  const localToday = useLocalToday(today), router = useRouter();
  useEffect(() => { if (localToday !== today) router.refresh(); }, [localToday, today, router]);
  return <section className={styles.workspace}><header className={styles.heading}><h1>总览</h1><time dateTime={today}>{today.replaceAll("-", ".")}</time></header>
    <OverviewTrend data={presentation} />
    <div className={styles.cards}>
      <LoadingLink href="/dashboard/measurements" className={styles.card} aria-label="身体记录"><div><h2>身体状况</h2><span aria-hidden="true">→</span></div><strong>{body ? Number(body.weightKg) : "—"}<small>kg</small></strong><p>{body ? `${body.recordDate} · 晨间空腹` : "暂无晨间体重"}</p></LoadingLink>
      <LoadingLink href="/dashboard/meals" className={styles.card} aria-label="饮食记录"><div><h2>摄入状况</h2><span aria-hidden="true">→</span></div><strong>{formatNutrition(data.nutrition.values.caloriesKcal, "caloriesKcal")}<small>kcal</small></strong><p>{data.mealCount} 餐{data.nutrition.incomplete.caloriesKcal && " · 部分"}</p></LoadingLink>
      <LoadingLink href="/dashboard/energy" className={styles.card} aria-label="消耗记录"><div><h2>消耗状况</h2><span aria-hidden="true">→</span></div><strong>{energyValue(data.energy.totalKcal)}<small>kcal</small></strong>{data.energy.estimated && <p>含静息估计</p>}</LoadingLink>
    </div>
  </section>;
}
