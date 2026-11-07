"use client";
import {AssistantSeed} from "../assistant/seed";
import type {AssistantContext} from "../assistant/model";
import {RecordWorkspace} from "@/components/record-trend-panel";
import {useCallback} from 'react';
import {useRouter} from 'next/navigation';
import { useLocalToday } from "@/components/use-local-today";
import { MetricCardRail } from "@/components/metric-card-rail";
import { summaryCards } from "./summary-cards";
import { OverviewTrend } from "./overview-trend";
import type { OverviewPresentation } from "./presentation";
import styles from "./overview.module.css";
export function OverviewView({ presentation,assistant,accountId }: { accountId?:string; presentation: OverviewPresentation;assistant?:AssistantContext }) {
  const { today } = presentation;
  const router=useRouter(),refreshAtMidnight=useCallback(()=>router.refresh(),[router]);
  const localToday = useLocalToday(today,refreshAtMidnight);
  return <RecordWorkspace title="总览" className={styles.workspace}>
    {assistant&&<AssistantSeed data={assistant}/>}
    <MetricCardRail accountId={accountId} cards={summaryCards(presentation,localToday)}/>
    <OverviewTrend data={presentation} />
  </RecordWorkspace>;
}
