import type { CSSProperties } from "react";
import { formatIntegerNumber } from "@/components/number-format";
import type { OverviewDay } from "./model";
import { balanceLabel, hasExpenditureRecord, morningChangeReading, shortDate } from "./day-readings";
import styles from "./overview.module.css";

export function BalanceReading({ balance }: { balance: number | null }) {
  const label = balanceLabel(balance);
  if (balance === null || balance === 0) return label;
  return <>{label} <b>{formatIntegerNumber(Math.abs(balance))}</b> <small>千卡</small></>;
}

function EnergyReading({ value, missing }: { value: string | null; missing: string }) {
  if (value === null) return <span className={styles.dayDetailMissing}>{missing}</span>;
  return <><strong>{formatIntegerNumber(value)}</strong> <small>千卡</small></>;
}

export function DayReadout({ day, id, style }: { day: OverviewDay; id: string; style: CSSProperties }) {
  const intake = day.nutrition?.values.caloriesKcal ?? null;
  const intakePartial = day.mealDayStatus !== "complete" || day.nutrition?.incomplete.caloriesKcal;
  return <div id={id} role="tooltip" data-overview-day-readout={day.date} className={styles.dayReadoutCard} style={style}>
    <header>
      <time dateTime={day.date}>{shortDate(day.date)}</time>
      <span><BalanceReading balance={day.energyBalance} /></span>
    </header>
    <dl className={styles.dayDetailEnergy}>
      <div className={styles.dayDetailIntake}>
        <dt>{intake !== null && intakePartial ? "已记摄入" : "摄入"}</dt>
        <dd><EnergyReading value={intake} missing={day.meals.length > 0 ? "热量未知" : "无记录"} /></dd>
      </div>
      <div className={styles.dayDetailExpenditure}>
        <dt>{day.energy.cumulative ? "消耗累计" : "消耗"}</dt>
        <dd><EnergyReading value={day.energy.totalKcal} missing={hasExpenditureRecord(day) ? "缺总量" : "无记录"} /></dd>
      </div>
    </dl>
    <p className={styles.dayDetailWeight}><span>次晨变化</span><b>{morningChangeReading(day)}</b></p>
  </div>;
}
