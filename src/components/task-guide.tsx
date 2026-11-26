"use client";
import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { guidePresent, type GuideStep } from "./guide-position";
import { PageTour } from "./page-tour";
import { WorkspaceRefreshingContext } from "@/features/dashboard/workspace-cache-context";
import styles from "./task-guide.module.css";

const GuideContext = createContext("");
export function TaskGuideProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  return <GuideContext key={accountId} value={accountId}>{children}</GuideContext>;
}

/** 页面讲解只在明确点击后打开，不跟踪录入或保存进度。 */
export function TaskGuide({ task, steps }: { task: string; steps: GuideStep[] }) {
  const account = useContext(GuideContext);
  const refreshing = useContext(WorkspaceRefreshingContext);
  const id = useId();
  const [origin, setOrigin] = useState<HTMLButtonElement | null>(null);
  const [tour, setTour] = useState(false);
  const close = useCallback((restoreFocus: boolean) => {
    setTour(false);
    if (restoreFocus && guidePresent(origin)) origin.focus({ preventScroll: true });
  }, [origin]);
  useEffect(() => {
    function opened(event: Event) {
      if ((event as CustomEvent<HTMLElement>).detail?.dataset.guideOwner !== id) setTour(false);
    }
    window.addEventListener("formward-guide-open", opened);
    return () => window.removeEventListener("formward-guide-open", opened);
  }, [id]);
  if (!account || !steps.length) return null;
  return <div className={styles.guide} data-task-guide={task}>
    <button type="button" className={styles.trigger} ref={setOrigin} aria-pressed={tour}
      onClick={() => tour ? close(true) : setTour(true)}>使用指引</button>
    {origin && tour && !refreshing && <PageTour ownerId={id} origin={origin}
      configuration={JSON.stringify(steps)} onClose={close}/>}
  </div>;
}

const trendCopy = {
  nutrition: { summary: "看所选日期的摄入热量、餐数和营养。选历史日期后可补记当天。", chart: "柱形显示每天的摄入，图例说明营养组成和待确认状态。" },
  energy: { summary: "看所选日期的总消耗、静息和活动，以及当日可用的入口。", chart: "柱形显示每天已记录的消耗。点日期，读数会切到同一天。" },
  body: { summary: "读数来自所选日期的实测记录。7 日平均按有效样本计算。", chart: "点日期查看当天实测。缺测的位置留空，可切换看晚间记录。" },
} as const;

export function TrendGuide({ kind, device }: { kind: keyof typeof trendCopy; device?: boolean }) {
  const copy = trendCopy[kind];
  return <TaskGuide task={kind + "-page"} steps={[
    { target: "trend-" + kind + "-metrics", text: kind === "energy" && device ? "这里显示所选日期的设备消耗。今日累计会随同步更新。" : copy.summary },
    { target: "trend-range", text: "选择要看的日期区间，图表和记录读数会一起更新。" },
    { target: "trend-chart", text: copy.chart },
    { target: "selected-day-details", text: "这里打开当前选中的日期，查看记录及其来源。" },
  ]}/>;
}
