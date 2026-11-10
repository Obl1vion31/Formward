"use client";
import {RecordWorkspace} from "@/components/record-trend-panel";
import {useCallback,useLayoutEffect} from 'react';
import {useChartTransition} from '@/components/chart-transition-state';
import {useRouter,usePathname} from 'next/navigation';
import { useLocalToday } from "@/components/use-local-today";
import { MetricCardRail } from "@/components/metric-card-rail";
import { summaryCards } from "./summary-cards";
import { OverviewTrend } from "./overview-trend";
import type { OverviewPresentation } from "./presentation";
import styles from "./overview.module.css";
export function OverviewView({ presentation,accountId }: { accountId?:string; presentation: OverviewPresentation }) {
  const { today } = presentation;
  const path=usePathname(),{returningToOverview,overviewReady}=useChartTransition();
  useLayoutEffect(()=>{if(returningToOverview&&path==='/dashboard')overviewReady?.();},[returningToOverview,overviewReady,path]);
  const router=useRouter(),refreshAtMidnight=useCallback(()=>router.refresh(),[router]);
  const localToday = useLocalToday(today,refreshAtMidnight);
  return <RecordWorkspace title="总览" className={styles.workspace}>
    <MetricCardRail accountId={accountId} cards={summaryCards(presentation,localToday)}/>
    <OverviewTrend data={presentation} />
  </RecordWorkspace>;
}
