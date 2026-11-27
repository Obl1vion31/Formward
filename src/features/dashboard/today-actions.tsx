"use client";

import { LoadingLink } from "@/components/loading-link";
import { useId, type ReactNode } from "react";
import { TaskGuide } from "@/components/task-guide";
import type { OverviewPresentation } from "./presentation";
import styles from "./overview.module.css";
import quick from "@/components/quick-actions.module.css";

export function TodayActions({ date, day, readingStatus, onGuideRetry }: {
  date: string;
  day?: OverviewPresentation["todayOptions"][number];
  readingStatus?: ReactNode;
  onGuideRetry?: () => void;
}) {
  const recorded = !!day?.mealCount;
  const meal = { id: "meal", label: recorded ? "再记一餐" : "记一餐", href: `/dashboard/meals?date=${date}&entry=1`, icon: <path d="M8 3v10M3 8h10"/> };
  const energy = { id: "energy", label: "估算今天的消耗", href: `/dashboard/energy?date=${date}&entry=1&mode=estimate`,
    icon: <path d="M8.8 1.5c.8 3.4-1.7 4.4-1.2 6.7-1.4-.4-1.7-1.9-1.7-2.8-2.2 1.5-3.1 3.2-2.5 5.5.5 2.1 2.5 3.4 4.7 3.4s4.5-1.7 4.6-4.2c.1-2.2-1.1-3.5-2.1-4.5-.1 1.3-.5 1.8-.9 2-.2-1.8.8-3.9-.9-6.1Z"/> };
  const weight = { id: "weight", label: "记录体重", href: `/dashboard/measurements?date=${date}&entry=daytime`,
    icon: <><rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M6 5.5h4M8 5.5l1 2"/></> };
  const actions = day?.canEstimate ? recorded ? [energy, meal] : [meal, energy] : [meal];
  if (!day?.hasWeight) actions.push(weight);
  const time = date.split("-").map(Number);
  const heading = useId();
  const primary = !recorded ? meal : day?.canEstimate ? energy : null;
  return <section className={styles.today} aria-labelledby={heading} data-overview-today data-guide-target="overview-today" data-pending={!day || undefined}>
    <div className={styles.todayHeading}>
      <h2 id={heading} tabIndex={-1} data-overview-today-heading>今天 {date && <time dateTime={date}>{time[1]}月{time[2]}日</time>}</h2>
      {!day && readingStatus && <p>{readingStatus}</p>}
    </div>
    {day && <nav className={styles.todayActions} aria-label="快捷记录">{actions.map(action =>
      <LoadingLink className={quick.action} key={action.id} href={action.href} data-primary={action === primary || undefined}
        data-guide-target={"today-" + action.id}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{action.icon}</svg>
        {action.label}
      </LoadingLink>
    )}</nav>}
    <div className={styles.todayGuide}><TaskGuide task="overview" onRetry={onGuideRetry} steps={[
      {target:"overview-today",text:"从这里记录今天的饮食、消耗和体重。快捷入口随当天记录和设备来源变化。"},
      {target:"overview-intake",text:"今日摄入显示当天的热量和餐数。点卡片进入饮食趋势。"},
      {target:"overview-morning-weight",text:"这里显示最近一次有效晨重和实际日期。点卡片查看身体记录。"},
      {target:"overview-energy",text:"这里显示当天的消耗和来源。设备的「今日累计」会继续更新。"},
      {target:"overview-trend",text:"上图显示当天收支，下图显示次晨实测变化。点日期后在图下看选中日及对应的近 7 天。"},
      {target:"overview-record",text:"「查看记录」打开图表选中的那一天，可核对饮食、消耗和实测来源。"},
    ]}/></div>
  </section>;
}
