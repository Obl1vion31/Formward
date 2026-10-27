"use client";
import {RecordWorkspace} from "@/components/record-trend-panel";
import {formatRecordNumber} from "@/components/number-format";
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
  const { today, body, latestIntake: intake, latestEnergy: energy } = presentation;
  const localToday = useLocalToday(today), router = useRouter();
  useEffect(() => { if (localToday !== today) router.refresh(); }, [localToday, today, router]);
  return <RecordWorkspace title="总览" className={styles.workspace}>
    <OverviewTrend data={presentation} />
    <div className={styles.cards}>
      <LoadingLink href="/dashboard/measurements" className={styles.card} aria-label="身体记录"><div><h2>身体状况</h2><span aria-hidden="true">→</span></div><strong>{body ? formatRecordNumber(body.weightKg) : "—"}<small>kg</small></strong><p>{body ? `${body.recordDate} · 晨间空腹` : "暂无晨间体重"}</p></LoadingLink>
      <LoadingLink href="/dashboard/meals" className={styles.card} aria-label="饮食记录"><div><h2>摄入状况</h2><span aria-hidden="true">→</span></div><strong>{formatNutrition(intake?.totals.values.caloriesKcal ?? null, "caloriesKcal")}<small>kcal</small></strong><p>{intake ? <><time dateTime={intake.date}>{intake.date}</time> · {intake.meals.length} 餐{intake.totals.incomplete.caloriesKcal && " · 部分"}</> : "暂无摄入记录"}</p></LoadingLink>
      <LoadingLink href="/dashboard/energy" className={styles.card} aria-label="消耗记录"><div><h2>消耗状况</h2><span aria-hidden="true">→</span></div><strong>{energyValue(energy?.totalKcal)}<small>kcal</small></strong><p>{energy ? <><time dateTime={energy.date}>{energy.date}</time>{energy.totalKcal === null && " · 部分"}{energy.estimated && " · 含估计"}</> : "暂无消耗记录"}</p></LoadingLink>
    </div>
  </RecordWorkspace>;
}
