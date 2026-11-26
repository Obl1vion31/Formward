"use client";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { guidePresent, type GuideStep } from "./guide-position";
import { PageTour } from "./page-tour";
import styles from "./task-guide.module.css";

type Run = { task: string; configuration: string; path: string };
type GuideSession = {
  account: string; task: string | null;
  register: (task: string, previous: HTMLButtonElement | null, node: HTMLButtonElement | null, retry?: () => void) => void;
  open: (task: string, steps: GuideStep[]) => void;
  close: (restoreFocus: boolean) => void;
};
const GuideContext = createContext<GuideSession | null>(null);

export function TaskGuideProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  return <GuideSession key={accountId} account={accountId}>{children}</GuideSession>;
}

// 导览属于当前页面会话。读取外壳被真实内容替换时，编号与说明继续保留。
function GuideSession({ account, children }: { account: string; children: ReactNode }) {
  const ownerId = useId(), pathname = usePathname(), router = useRouter();
  const triggers = useRef(new Map<string, Set<HTMLButtonElement>>());
  const retries = useRef(new Map<HTMLButtonElement, () => void>());
  const [run, setRun] = useState<Run | null>(null);
  const active = run?.path === pathname ? run : null;
  useEffect(() => {
    if (run && run.path !== pathname) {
      // 路由提交结束手动打开的导览，浏览器返回不能重新打开旧会话。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRun(null);
    }
  }, [pathname, run]);
  const register = useCallback((task: string, previous: HTMLButtonElement | null, node: HTMLButtonElement | null, retry?: () => void) => {
    const nodes = triggers.current.get(task) ?? new Set<HTMLButtonElement>();
    if (previous) { nodes.delete(previous); retries.current.delete(previous); }
    if (node) { nodes.add(node); if (retry) retries.current.set(node, retry); }
    if (nodes.size) triggers.current.set(task, nodes); else triggers.current.delete(task);
    window.dispatchEvent(new Event("formward-guide-targets"));
  }, []);
  const getOrigin = useCallback(() => run ? [...(triggers.current.get(run.task) ?? [])].reverse().find(node => guidePresent(node)) ?? null : null, [run]);
  const close = useCallback((restoreFocus: boolean) => {
    const opener = getOrigin();
    setRun(current => current === run ? null : current);
    if (restoreFocus && guidePresent(opener)) opener.focus({ preventScroll: true });
  }, [getOrigin, run]);
  const open = useCallback((task: string, steps: GuideStep[]) => {
    setRun({ task, configuration: JSON.stringify(steps), path: window.location.pathname });
  }, []);
  const retry = useCallback(() => {
    const origin = getOrigin(), read = origin ? retries.current.get(origin) : undefined;
    if (read) read(); else router.refresh();
  }, [getOrigin, router]);
  const value = useMemo(() => ({ account, task: active?.task ?? null, register, open, close }), [account, active?.task, register, open, close]);
  return <GuideContext value={value}>{children}{active && <PageTour ownerId={ownerId} getOrigin={getOrigin}
    configuration={active.configuration} onClose={close} onRetry={retry}/>}</GuideContext>;
}

/** 已知入口不依赖健康数据；只有主动点击才创建页面讲解。 */
export function TaskGuide({ task, steps, onRetry }: { task: string; steps: GuideStep[]; onRetry?: () => void }) {
  const session = useContext(GuideContext), origin = useRef<HTMLButtonElement | null>(null);
  const register = session?.register;
  const bind = useCallback((node: HTMLButtonElement | null) => {
    register?.(task, origin.current, node, onRetry);
    origin.current = node;
  }, [register, task, onRetry]);
  if (!session?.account || !steps.length) return null;
  const selected = session.task === task;
  return <div className={styles.guide} data-task-guide={task}>
    <button type="button" className={styles.trigger} ref={bind} aria-pressed={selected}
      onClick={() => selected ? session.close(true) : session.open(task, steps)}>使用指引</button>
  </div>;
}

const trendCopy = {
  nutrition: { summary: "看所选日期的摄入热量、餐数和营养。选历史日期后可补记当天。", chart: "柱形显示每天的摄入，图例说明营养组成和待确认状态。" },
  energy: { summary: "看所选日期的总消耗、静息和活动，以及当日可用的入口。", chart: "柱形显示每天已记录的消耗。点日期，读数会切到同一天。" },
  body: { summary: "读数来自所选日期的实测记录。7 日平均按有效样本计算。", chart: "点日期查看当天实测。缺测的位置留空，可切换看晚间记录。" },
} as const;

export function TrendGuide({ kind, device, onRetry }: { kind: keyof typeof trendCopy; device?: boolean; onRetry?: () => void }) {
  const copy = trendCopy[kind];
  return <TaskGuide task={kind + "-page"} onRetry={onRetry} steps={[
    { target: "trend-" + kind + "-metrics", text: kind === "energy" && device ? "这里显示所选日期的设备消耗。今日累计会随同步更新。" : copy.summary },
    { target: "trend-range", text: "选择要看的日期区间，图表和记录读数会一起更新。" },
    { target: "trend-chart", text: copy.chart },
    { target: "selected-day-details", text: "这里打开当前选中的日期，查看记录及其来源。" },
  ]}/>;
}
