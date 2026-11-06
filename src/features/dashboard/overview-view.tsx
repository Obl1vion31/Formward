"use client";
import {AssistantSeed} from "../assistant/seed";
import type {AssistantContext} from "../assistant/model";
import {RecordWorkspace} from "@/components/record-trend-panel";
import {useCallback} from 'react';
import {useRouter} from 'next/navigation';
import {formatRecordNumber} from "@/components/number-format";


import { useLocalToday } from "@/components/use-local-today";
import { LoadingLink } from "@/components/loading-link";
import { MetricCardRail } from "@/components/metric-card-rail";
import { summaryCards } from "./summary-cards";
import { formatNutrition } from "../meals/model";
import { energyValue } from "../activities/model";
import { OverviewTrend } from "./overview-trend";
import type { OverviewPresentation } from "./presentation";
import styles from "./overview.module.css";
export function OverviewView({ presentation,assistant,accountId }: { accountId?:string; presentation: OverviewPresentation;assistant?:AssistantContext }) {
  const { today, body, latestIntake: intake, latestEnergy: energy } = presentation;
  const router=useRouter(),refreshAtMidnight=useCallback(()=>router.refresh(),[router]);
  const localToday = useLocalToday(today,refreshAtMidnight);
  return <RecordWorkspace title="总览" className={styles.workspace}>
    {assistant&&<AssistantSeed data={assistant}/>}
    <div className="mobile-only">
      <MetricCardRail accountId={accountId} cards={summaryCards(presentation,localToday)}/>
    </div>
    <OverviewTrend data={presentation} />
    <div className={styles.cards}>
      <LoadingLink href="/dashboard/measurements" className={styles.card} aria-label="身体记录"><div><h2>身体状况</h2><span aria-hidden="true">→</span></div><strong>{body ? formatRecordNumber(body.weightKg) : "—"}<small>kg</small></strong><p>{body ? `${body.recordDate} · 晨间空腹` : "暂无晨间体重"}</p></LoadingLink>
      <LoadingLink href="/dashboard/meals" className={styles.card} aria-label="饮食记录"><div><h2>摄入状况</h2><span aria-hidden="true">→</span></div><strong>{formatNutrition(intake?.totals.values.caloriesKcal ?? null, "caloriesKcal")}<small>kcal</small></strong><p>{intake ? <><time dateTime={intake.date}>{intake.date}</time> · {intake.meals.length} 餐{intake.totals.incomplete.caloriesKcal && " · 部分"}</> : "暂无摄入记录"}</p></LoadingLink>
      <LoadingLink href="/dashboard/energy" className={styles.card} aria-label="消耗记录"><div><h2>消耗状况</h2><span aria-hidden="true">→</span></div><strong>{energyValue(energy?.totalKcal)}<small>kcal</small></strong><p>{energy ? <><time dateTime={energy.date}>{energy.date}</time>{energy.totalKcal === null && " · 部分"}</> : "暂无消耗记录"}</p></LoadingLink>
    </div>
  </RecordWorkspace>;
}
