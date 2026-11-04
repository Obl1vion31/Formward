"use client";
import { useState } from "react";
import { LoadingLink } from "@/components/loading-link";
import type { OverviewDay } from "./model";
import { rangeCoverage } from "./range-coverage";
import styles from "./overview.module.css";

export function RangeCoverage({ days, today, from, to }: { days: OverviewDay[]; today: string; from: string; to: string }) {
  const [limit, setLimit] = useState(50), result = rangeCoverage(days, today);
  return <section className={styles.rangeCoverage} aria-label="区间记录摘要" data-overview-range-summary>
    <div><span>{from.replaceAll("-", ".")} — {to.replaceAll("-", ".")}</span><p>{result.total ? <>已有 {result.covered}/{result.total} 天可计算收支{result.gaps.length > 0 && <>，{result.gaps.length} 天资料不足</>}</> : "该区间暂无已发生的记录日期"}</p></div>
    {result.gaps.length > 0 && <details key={from + to}><summary>查看缺口</summary><p className={styles.coverageHint}>仅说明现有记录是否足够计算，不代表这些日期必须补齐</p><ul>{result.gaps.slice().reverse().slice(0, limit).map(gap => <li key={gap.date}><time dateTime={gap.date}>{gap.date.replaceAll("-", ".")}</time><div>{gap.meals && <LoadingLink href={`/dashboard/meals?date=${gap.date}`}>{gap.meals} →</LoadingLink>}{gap.energy && <LoadingLink href={`/dashboard/energy?date=${gap.date}`}>{gap.energy} →</LoadingLink>}</div></li>)}</ul>{result.gaps.length > limit && <button type="button" onClick={() => setLimit(value => value + 50)}>加载更早日期</button>}</details>}
  </section>;
}
