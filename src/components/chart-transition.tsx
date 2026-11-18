"use client";

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition} from "react";
import {flushSync} from "react-dom";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useAssistant} from "@/features/assistant/context";
import {confirmDraftDiscard, draftIsBusy} from "./draft-guard";
import {
  ChartTransitionActionsContext, ChartTransitionContext, chartDestinationMatches, chartDestinationSearch,
  matchingChartReadings, type ChartReadingsSnapshot, type ChartTarget, type OverviewViewState
} from "./chart-transition-state";
import type {MetricTrendModel, TrendKind} from "./metric-trend-model";
import type {WorkspaceScene} from "./workspace-motion";

type CardLocation = {kind: TrendKind; scroll: number; rail: number; destination: string};
type ForwardView = {
  href: string;
  destination: string;
  destinationSearch: string;
  model: MetricTrendModel;
  readings: ChartReadingsSnapshot | null;
};
const overviewPath = "/dashboard";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 当前绘制画面的短暂副本。正文可在下一次 React 提交中卸载，离场动画仍从原位开始。 */
function holdWorkspace(page: HTMLElement | null) {
  const layer = page?.parentElement?.querySelector<HTMLElement>(":scope > [data-workspace-previous]");
  if (!page || !layer || reducedMotion() || typeof layer.animate !== "function") return false;
  const snapshot = page.cloneNode(true) as HTMLElement, rect = page.getBoundingClientRect();
  const body = page.querySelector("[data-workspace-body]");
  const snapshotBody = snapshot.querySelector<HTMLElement>("[data-workspace-body]");
  if (body && snapshotBody) {
    const pose = getComputedStyle(body);
    if (Number(pose.opacity) < .12) return false;
    snapshotBody.style.transform = pose.transform;
    snapshotBody.style.opacity = pose.opacity;
  }
  snapshot.querySelector("[data-return-prepared]")?.remove();
  snapshot.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  Object.assign(snapshot.style, {
    position: "absolute", boxSizing: "border-box", top: rect.top + "px", left: rect.left + "px",
    width: rect.width + "px", margin: 0, animation: "none"
  });
  layer.replaceChildren(snapshot);
  const rail = page.querySelector("[data-metric-rail]:not([data-return-prepared] *)");
  const snapshotRail = snapshot.querySelector("[data-metric-rail]:not([data-return-prepared] *)");
  if (rail && snapshotRail) snapshotRail.scrollLeft = rail.scrollLeft;
  return true;
}

export function ChartTransitionProvider({children}: {children: React.ReactNode}) {
  const router = useRouter(), browserPath = usePathname(), browserSearch = useSearchParams().toString();
  const {source: assistantSource} = useAssistant();
  const pathname = assistantSource?.path ?? browserPath;
  const search = assistantSource?.query.slice(1) ?? browserSearch;
  const [, startTransition] = useTransition();
  const [forward, setForward] = useState<ForwardView | null>(null);
  const [scene, setScene] = useState<WorkspaceScene | null>(null);
  const [entered, setEntered] = useState(0);
  const [returningToOverview, setReturningToOverview] = useState(false);
  const forwardRef = useRef<ForwardView | null>(null), activeScene = useRef<WorkspaceScene | null>(null);
  const enteredRef = useRef(0), sequence = useRef(0), navigation = useRef(0);
  const route = useRef(pathname), target = useRef<ChartTarget | null>(null);
  const origin = useRef<CardLocation | null>(null), overview = useRef<OverviewViewState | null>(null);
  const previousCharts = useRef(new Set<string>());
  const returning = useRef(false), returnReady = useRef(false), returnCancelled = useRef(false);
  const focusAfterLoad = useRef<CardLocation | null>(null), focusFrame = useRef(0);

  const showForward = useCallback((next: ForwardView | null) => {
    forwardRef.current = next;
    setForward(next);
  }, []);
  const setReturn = useCallback((active: boolean) => {
    returning.current = active;
    setReturningToOverview(active);
  }, []);
  const stopScene = useCallback(() => {
    activeScene.current = null;
    document.documentElement.removeAttribute("data-chart-travel");
    setScene(null);
  }, []);
  const beginScene = useCallback((direction: WorkspaceScene["direction"], sourcePath: string) => {
    const next = {id: ++sequence.current, direction, sourcePath};
    activeScene.current = next;
    document.documentElement.setAttribute("data-chart-travel", "active");
    setScene(next);
  }, []);
  const revealScene = useCallback((id: number) => {
    if (activeScene.current?.id !== id) return;
    enteredRef.current = id;
    setEntered(id);
  }, []);
  const finishScene = useCallback((id: number) => {
    const current = activeScene.current;
    if (current?.id !== id) return;
    stopScene();
    if (current.direction === "back" && returnReady.current) setReturn(false);
  }, [stopScene, setReturn]);
  const overviewReady = useCallback(() => {
    returnReady.current = true;
    if (activeScene.current?.direction !== "back") setReturn(false);
  }, [setReturn]);
  const invalidate = useCallback(() => {
    showForward(null);
    const current = activeScene.current;
    if (current) finishScene(current.id);
  }, [showForward, finishScene]);

  const claimChartEntry = useCallback((key: string) => {
    const seen = previousCharts.current.has(key);
    previousCharts.current.add(key);
    return !seen;
  }, []);
  const recallOverview = useCallback(() => overview.current, []);
  const rememberOverview = useCallback((state: OverviewViewState) => { overview.current = state; }, []);
  const acceptTarget = useCallback((next: ChartTarget) => {
    const expected = forwardRef.current;
    if (expected && next.kind === expected.model.kind && next.element.isConnected &&
      next.element.getClientRects().length && chartDestinationMatches(expected, location.href)) {
      showForward(null);
    }
  }, [showForward]);
  const register = useCallback((next: ChartTarget) => {
    if (next.skeleton || !next.element.closest("[data-route-content]")) return () => {};
    target.current = next;
    acceptTarget(next);
    return () => { if (target.current === next) target.current = null; };
  }, [acceptTarget]);

  const navigate = useCallback(async (href: string, model: MetricTrendModel, source: SVGSVGElement, rail: HTMLElement | null, readings?: ChartReadingsSnapshot) => {
    if (forwardRef.current?.href === href) return;
    const intent = ++navigation.current;
    if (draftIsBusy() || !await confirmDraftDiscard() || navigation.current !== intent || !source.isConnected) return;
    const {pathname: destination, search} = new URL(href, location.origin);
    origin.current = {kind: model.kind, destination, scroll: scrollY, rail: rail?.scrollLeft ?? 0};
    focusAfterLoad.current = null;
    returnCancelled.current = false;
    flushSync(() => {
      stopScene();
      setReturn(false);
      const held = holdWorkspace(source.closest<HTMLElement>("main[data-workspace-frame]"));
      window.scrollTo({top: 0, behavior: "instant"});
      showForward({href, destination, destinationSearch: chartDestinationSearch(search), model, readings: matchingChartReadings(readings, model.kind, href)});
      if (held) beginScene("forward", overviewPath);
    });
    startTransition(() => router.push(href, {scroll: false}));
  }, [router, beginScene, setReturn, showForward, stopScene]);

  const restore = useCallback((rail: HTMLElement) => {
    if (!rail.isConnected || !rail.clientWidth || rail.closest("[data-return-covered],[data-return-prepared]")) return;
    const saved = returningToOverview ? origin.current : focusAfterLoad.current;
    if (!saved) return;
    if (!returningToOverview && (location.pathname !== overviewPath || rail.closest("[data-workspace-cached]") || rail.hasAttribute("data-metric-rail-pending"))) return;
    if (Math.abs(rail.scrollLeft - saved.rail) > .5) rail.scrollLeft = saved.rail;
    if (Math.abs(scrollY - saved.scroll) > .5) window.scrollTo({top: saved.scroll, behavior: "instant"});
    if (returningToOverview) return;
    focusAfterLoad.current = null;
    origin.current = null;
    const card = rail.querySelector<HTMLElement>(`a[data-metric-card="${saved.kind}"]`);
    const intent = navigation.current;
    card?.focus({preventScroll: true});
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = 0;
      if (navigation.current === intent && location.pathname === overviewPath && card?.isConnected) card.focus({preventScroll: true});
    });
  }, [returningToOverview]);

  const beginReturn = useCallback((sourcePath: string, animate = true) => {
    if (returning.current && !returnCancelled.current) return;
    const saved = origin.current;
    const stillLeaving = activeScene.current?.direction === "forward" && enteredRef.current !== activeScene.current.id;
    const keepOverview = stillLeaving && route.current === overviewPath && location.pathname === overviewPath;
    const held = animate && saved?.destination === sourcePath && !stillLeaving &&
      holdWorkspace(document.querySelector("main[data-workspace-frame]"));
    returnReady.current = false;
    returnCancelled.current = false;
    focusAfterLoad.current = saved;
    stopScene();
    showForward(null);
    setReturn(!keepOverview);
    if (held) beginScene("back", sourcePath);
    return keepOverview;
  }, [beginScene, setReturn, showForward, stopScene]);

  const back = useCallback(async () => {
    if (returning.current && !returnCancelled.current) return;
    const intent = ++navigation.current;
    if (draftIsBusy() || !await confirmDraftDiscard() || navigation.current !== intent) return;
    const sourcePath = forwardRef.current?.destination ?? location.pathname;
    const method = location.pathname === overviewPath ? "replace" : "push";
    const keptOverview = flushSync(() => beginReturn(sourcePath));
    if (keptOverview) {
      const rail = document.querySelector<HTMLElement>("[data-route-content] [data-metric-rail]");
      if (rail) restore(rail);
    }
    startTransition(() => router[method](overviewPath, {scroll: false}));
  }, [beginReturn, restore, router]);

  const cancelOverviewReturn = useCallback((href: string) => {
    const next = new URL(href, location.origin);
    const pending = forwardRef.current;
    if (!returning.current && (!pending || chartDestinationMatches(pending, next.href)) && !activeScene.current) return;
    if (!returning.current && pending && chartDestinationMatches(pending, next.href)) return;
    navigation.current++;
    showForward(null);
    stopScene();
    focusAfterLoad.current = null;
    origin.current = null;
    if (returning.current) {
      returnCancelled.current = true;
      if (next.pathname === location.pathname) setReturn(false);
    }
  }, [setReturn, showForward, stopScene]);

  useLayoutEffect(() => {
    const previous = route.current;
    route.current = pathname;
    const pending = forwardRef.current;
    if (pending && pathname !== overviewPath && !chartDestinationMatches(pending, pathname + "?" + search)) {
      showForward(null);
      stopScene();
    } else if (target.current) acceptTarget(target.current);
    if (previous === pathname) return;
    if (returnCancelled.current && pathname !== overviewPath) setReturn(false);
    if (pathname === overviewPath && origin.current && !returning.current) beginReturn(previous, false);
    if (pathname !== overviewPath && pathname !== origin.current?.destination) {
      origin.current = null;
      focusAfterLoad.current = null;
    }
  }, [pathname, search, browserPath, acceptTarget, beginReturn, setReturn, showForward, stopScene]);

  useEffect(() => {
    const pop = () => {
      navigation.current++;
      if (location.pathname === overviewPath && origin.current) beginReturn(route.current);
      else if (location.pathname !== overviewPath) {
        invalidate();
        setReturn(false);
      }
    };
    const quiet = () => { const scene = activeScene.current; if (scene) finishScene(scene.id); };
    const beforeFocus = (event: PointerEvent | KeyboardEvent) => {
      if (!event.isTrusted || (!returning.current && !focusAfterLoad.current && !focusFrame.current)) return;
      focusAfterLoad.current = null;
      cancelAnimationFrame(focusFrame.current);
      focusFrame.current = 0;
    };
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const onPreference = () => { if (query.matches) quiet(); };
    window.addEventListener("popstate", pop, true);
    window.addEventListener("resize", quiet);
    window.addEventListener("formward-record-saved", invalidate);
    window.addEventListener("formward-record-context-stale", invalidate);
    document.addEventListener("pointerdown", beforeFocus, true);
    document.addEventListener("keydown", beforeFocus, true);
    query.addEventListener("change", onPreference);
    return () => {
      window.removeEventListener("popstate", pop, true);
      window.removeEventListener("resize", quiet);
      window.removeEventListener("formward-record-saved", invalidate);
      window.removeEventListener("formward-record-context-stale", invalidate);
      document.removeEventListener("pointerdown", beforeFocus, true);
      document.removeEventListener("keydown", beforeFocus, true);
      query.removeEventListener("change", onPreference);
      document.documentElement.removeAttribute("data-chart-travel");
      cancelAnimationFrame(focusFrame.current);
    };
  }, [beginReturn, finishScene, invalidate, setReturn]);

  const sceneLeaving = !!scene && entered !== scene.id;
  const displayPath = sceneLeaving ? scene.sourcePath : returningToOverview ? overviewPath : forward?.destination ?? pathname;
  const actions = useMemo(() => ({claimChartEntry, register, invalidate, recallOverview, rememberOverview}), [claimChartEntry, register, invalidate, recallOverview, rememberOverview]);
  const value = {
    ...actions, navigate, restore, back, returningToOverview, overviewReady, cancelOverviewReturn,
    forwardDestination: forward?.href ?? null, previewReadings: forward?.readings ?? null, preview: forward?.model ?? null,
    scene, sceneLeaving, displayPath, revealScene, finishScene
  };
  return <ChartTransitionActionsContext value={actions}><ChartTransitionContext value={value}>{children}</ChartTransitionContext></ChartTransitionActionsContext>;
}
