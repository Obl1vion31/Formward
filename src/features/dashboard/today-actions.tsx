"use client";

import { LoadingLink } from "@/components/loading-link";
import { useId } from "react";
import { formatIntegerNumber } from "@/components/number-format";
import type { OverviewPresentation } from "./presentation";
import styles from "./overview.module.css";

export function TodayActions({ date, day }: {
  date: string;
  day?: OverviewPresentation["todayOptions"][number];
}) {
  const recorded = !!day?.mealCount;
  const meal = { label: recorded ? "再记一餐" : "记一餐", href: `/dashboard/meals?date=${date}&entry=1` };
  const energy = { label: "估算今天的消耗", href: `/dashboard/energy?date=${date}&entry=1&mode=estimate` };
  const weight = { label: "记录体重", href: `/dashboard/measurements?date=${date}&entry=daytime` };
  const actions = day?.hasEnergy ? [meal] : recorded ? [energy, meal] : [meal, energy];
  if (!day?.hasWeight) actions.push(weight);
  const time = date.split("-").map(Number);
  const heading = useId();
  return <section className={styles.today} aria-labelledby={heading} data-overview-today>
    <div className={styles.todayHeading}>
      <h2 id={heading} tabIndex={-1} data-overview-today-heading>今天 {date && <time dateTime={date}>{time[1]}月{time[2]}日</time>}</h2>
      <p aria-live="polite">{day && (recorded
        ? `已记 ${day.mealCount} 餐${day.intake === null ? "" : " · " + formatIntegerNumber(day.intake) + " 千卡"}`
        : "记下第一餐，查看今天的摄入")}</p>
    </div>
    <nav className={styles.todayActions} aria-label="快捷记录">{actions.map(({ label, href }, index) => {
      const content = <><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>{label}</>;
      return day ? <LoadingLink key={href} href={href} data-primary={index === 0 || undefined}>{content}</LoadingLink>
        : <button key={href} type="button" disabled>{content}</button>;
    })}</nav>
  </section>;
}
