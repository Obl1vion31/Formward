"use client";
import {AssistantSeed} from "../assistant/seed";
import type {AssistantContext} from "../assistant/model";
import {RecordWorkspace} from "@/components/record-trend-panel";
import {formatRecordNumber} from "@/components/number-format";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocalToday } from "@/components/use-local-today";
import { LoadingLink } from "@/components/loading-link";
import { MetricCardRail } from "@/components/metric-card-rail";
import { summaryCards } from "./summary-cards";
import { formatNutrition } from "../meals/model";
import { energyValue } from "../activities/model";
import { OverviewTrend } from "./overview-trend";
import type { OverviewPresentation } from "./presentation";
import styles from "./overview.module.css";
export function OverviewView({ presentation,assistant }: { presentation: OverviewPresentation;assistant?:AssistantContext }) {
  const { today, body, latestIntake: intake, latestEnergy: energy } = presentation;
  const localToday = useLocalToday(today), router = useRouter();
  useEffect(() => { if (localToday !== today) router.refresh(); }, [localToday, today, router]);
  return <RecordWorkspace title="总览" className={styles.workspace}>
    {assistant&&<AssistantSeed data={assistant}/>}
    <div className={styles.mobileHome}>
      <div className={styles.mobileIntro}><h2>今天</h2><time dateTime={localToday}>{localToday.replaceAll("-",".")}</time></div>
      <nav className={styles.quickRecord} aria-label="快捷记录">
        <LoadingLink href={`/dashboard/meals?date=${localToday}&entry=1`}><Plus/>记录饮食</LoadingLink>
        <LoadingLink href={`/dashboard/measurements?date=${localToday}&entry=daytime`}><Plus/>记录测量</LoadingLink>
        <LoadingLink href={`/dashboard/energy?date=${localToday}&entry=1`}><Plus/>记录消耗</LoadingLink>
      </nav>
      <MetricCardRail cards={summaryCards(presentation,localToday)}/>
    </div>
    <OverviewTrend data={presentation} />
    <div className={styles.cards}>
      <LoadingLink href="/dashboard/measurements" className={styles.card} aria-label="身体记录"><div><h2>身体状况</h2><span aria-hidden="true">→</span></div><strong>{body ? formatRecordNumber(body.weightKg) : "—"}<small>kg</small></strong><p>{body ? `${body.recordDate} · 晨间空腹` : "暂无晨间体重"}</p></LoadingLink>
      <LoadingLink href="/dashboard/meals" className={styles.card} aria-label="饮食记录"><div><h2>摄入状况</h2><span aria-hidden="true">→</span></div><strong>{formatNutrition(intake?.totals.values.caloriesKcal ?? null, "caloriesKcal")}<small>kcal</small></strong><p>{intake ? <><time dateTime={intake.date}>{intake.date}</time> · {intake.meals.length} 餐{intake.totals.incomplete.caloriesKcal && " · 部分"}</> : "暂无摄入记录"}</p></LoadingLink>
      <LoadingLink href="/dashboard/energy" className={styles.card} aria-label="消耗记录"><div><h2>消耗状况</h2><span aria-hidden="true">→</span></div><strong>{energyValue(energy?.totalKcal)}<small>kcal</small></strong><p>{energy ? <><time dateTime={energy.date}>{energy.date}</time>{energy.totalKcal === null && " · 部分"}</> : "暂无消耗记录"}</p></LoadingLink>
    </div>
  </RecordWorkspace>;
}
function Plus(){return <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>;}
