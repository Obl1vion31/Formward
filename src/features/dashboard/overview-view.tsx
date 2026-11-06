"use client";
import {AssistantSeed} from "../assistant/seed";
import type {AssistantContext} from "../assistant/model";
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
export function OverviewView({ presentation,assistant }: { presentation: OverviewPresentation;assistant?:AssistantContext }) {
  const { today, body, latestIntake: intake, latestEnergy: energy } = presentation;
  const localToday = useLocalToday(today), router = useRouter();
  useEffect(() => { if (localToday !== today) router.refresh(); }, [localToday, today, router]);
  return <RecordWorkspace title="总览" className={styles.workspace}>
    {assistant&&<AssistantSeed data={assistant}/>}
    <div className={styles.mobileHome}>
      <div className={styles.mobileIntro}><h2>今天</h2><time dateTime={localToday}>{localToday.replaceAll("-",".")}</time></div>
      <nav className={styles.quickRecord} aria-label="快捷记录">
        <LoadingLink href={`/dashboard/meals?date=${localToday}&entry=1`}>记饮食</LoadingLink>
        <LoadingLink href={`/dashboard/measurements?date=${localToday}&entry=daytime`}>记身体</LoadingLink>
        <LoadingLink href={`/dashboard/energy?date=${localToday}&entry=1`}>记消耗</LoadingLink>
      </nav>
      <div className={styles.homeStatus}>
        <LoadingLink href={"/dashboard/meals"+(intake?"?date="+intake.date:"")}><span>{intake?.date===localToday?"今日摄入":"最近摄入"}</span><strong>{formatNutrition(intake?.totals.values.caloriesKcal??null,"caloriesKcal")}<small>kcal</small></strong><p>{intake?<>{intake.date===localToday?"":intake.date+" · "}{intake.meals.length}餐 · {intake.day.status==="complete"?"已记全":intake.day.status==="incomplete"?"未记全":"待确认"}{intake.totals.incomplete.caloriesKcal?" · 部分已知":""}</>:"今天可以开始记录"}</p></LoadingLink>
        <LoadingLink href={"/dashboard/measurements"+(body?"?date="+body.recordDate:"")}><span>{body?.recordDate===localToday?"今晨体重":"最近晨重"}</span><strong>{body?formatRecordNumber(body.weightKg):"—"}<small>kg</small></strong><p>{body?body.recordDate===localToday?"晨间空腹":body.recordDate:"暂无晨间实测"}</p></LoadingLink>
      </div>
    </div>
    <OverviewTrend data={presentation} />
    <div className={styles.cards}>
      <LoadingLink href="/dashboard/measurements" className={styles.card} aria-label="身体记录"><div><h2>身体状况</h2><span aria-hidden="true">→</span></div><strong>{body ? formatRecordNumber(body.weightKg) : "—"}<small>kg</small></strong><p>{body ? `${body.recordDate} · 晨间空腹` : "暂无晨间体重"}</p></LoadingLink>
      <LoadingLink href="/dashboard/meals" className={styles.card} aria-label="饮食记录"><div><h2>摄入状况</h2><span aria-hidden="true">→</span></div><strong>{formatNutrition(intake?.totals.values.caloriesKcal ?? null, "caloriesKcal")}<small>kcal</small></strong><p>{intake ? <><time dateTime={intake.date}>{intake.date}</time> · {intake.meals.length} 餐{intake.totals.incomplete.caloriesKcal && " · 部分"}</> : "暂无摄入记录"}</p></LoadingLink>
      <LoadingLink href="/dashboard/energy" className={styles.card} aria-label="消耗记录"><div><h2>消耗状况</h2><span aria-hidden="true">→</span></div><strong>{energyValue(energy?.totalKcal)}<small>kcal</small></strong><p>{energy ? <><time dateTime={energy.date}>{energy.date}</time>{energy.totalKcal === null && " · 部分"}</> : "暂无消耗记录"}</p></LoadingLink>
    </div>
  </RecordWorkspace>;
}
