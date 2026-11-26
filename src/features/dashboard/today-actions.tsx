"use client";

import { LoadingLink } from "@/components/loading-link";
import { useId, type ReactNode } from "react";
import { formatIntegerNumber } from "@/components/number-format";
import { TaskGuide } from "@/components/task-guide";
import type { OverviewPresentation } from "./presentation";
import styles from "./overview.module.css";
import quick from "@/components/quick-actions.module.css";

export function TodayActions({ date, day, readingStatus }: {
  date: string;
  day?: OverviewPresentation["todayOptions"][number];
  readingStatus?: ReactNode;
}) {
  const recorded = !!day?.mealCount;
  const meal = { id: "meal", label: recorded ? "再记一餐" : "记一餐", href: `/dashboard/meals?date=${date}&entry=1`, icon: <path d="M8 3v10M3 8h10"/> };
  const energy = { id: "energy", label: "估算今天的消耗", href: `/dashboard/energy?date=${date}&entry=1&mode=estimate`,
    icon: <path d="M8.8 1.5c.8 3.4-1.7 4.4-1.2 6.7-1.4-.4-1.7-1.9-1.7-2.8-2.2 1.5-3.1 3.2-2.5 5.5.5 2.1 2.5 3.4 4.7 3.4s4.5-1.7 4.6-4.2c.1-2.2-1.1-3.5-2.1-4.5-.1 1.3-.5 1.8-.9 2-.2-1.8.8-3.9-.9-6.1Z"/> };
  const weight = { id: "weight", label: "记录体重", href: `/dashboard/measurements?date=${date}&entry=daytime`,
    icon: <><rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M6 5.5h4M8 5.5l1 2"/></> };
  const actions = day?.hasEnergy ? [meal] : recorded ? [energy, meal] : [meal, energy];
  if (!day?.hasWeight) actions.push(weight);
  const time = date.split("-").map(Number);
  const heading = useId();
  const primary = !recorded ? meal : !day?.hasEnergy ? energy : null;
  const next = primary ?? (day?.hasWeight ? null : weight);
  const guidance = next === meal ? "点「记一餐」，可以选食材、手填或拍照。"
    : next === energy ? "估算今天的消耗后，就能对照今天的摄入。"
    : "点「记录体重」，填写今天的实测值。";
  return <section className={styles.today} aria-labelledby={heading} data-overview-today data-pending={!day || undefined}>
    <div className={styles.todayHeading}>
      <h2 id={heading} tabIndex={-1} data-overview-today-heading>今天 {date && <time dateTime={date}>{time[1]}月{time[2]}日</time>}</h2>
      <p aria-live={day ? "polite" : undefined}>{day ? (recorded
        ? `已记 ${day.mealCount} 餐${day.intake === null ? "" : " · " + formatIntegerNumber(day.intake) + " 千卡"}`
        : "记下第一餐，查看今天的摄入") : readingStatus}</p>
    </div>
    {day && <nav className={styles.todayActions} aria-label="快捷记录">{actions.map(action =>
      <LoadingLink className={quick.action} key={action.id} href={action.href} data-primary={action === primary || undefined}
        data-guide-target={"today-" + action.id}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{action.icon}</svg>
        {action.label}
      </LoadingLink>
    )}</nav>}
    {day && <div className={styles.todayGuide}><TaskGuide task={"today-" + (next?.id ?? "repeat")} target={"today-" + (next?.id ?? meal.id)}
      text={next ? guidance : "有新的一餐时，点「再记一餐」。"} auto={!!next}/></div>}
  </section>;
}
