"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { workspaceMotionTiming } from "@/components/workspace-motion";
import { assistantPath } from "./model";

type WorkspaceOrigin = { path: string; query: string; x: number; y: number };
export type AssistantPageMotion = { direction: "open" | "close" };
export type AssistantPageState = {
  entryId: string | null;
  query: string;
  source: WorkspaceOrigin | null;
  motion: AssistantPageMotion | null;
};

function atSource(source: WorkspaceOrigin | null): source is WorkspaceOrigin {
  return !!source && location.pathname === source.path && location.search === source.query;
}

export function useAssistantPageNavigation() {
  const pathname = usePathname(), query = useSearchParams().toString(), router = useRouter();
  const [page, setPage] = useState<AssistantPageState | null>(() => pathname === assistantPath
    ? { entryId: null, query, source: null, motion: null }
    : null);
  const [closedMotion, setClosedMotion] = useState<AssistantPageMotion | null>(null);
  const [restoringDock, setRestoringDock] = useState(false);
  const visible = useRef(page);
  const origins = useRef(new Map<string, WorkspaceOrigin>());
  const returnFrame = useRef(0);
  const backPending = useRef<WorkspaceOrigin | null>(null);

  const show = useCallback((next: AssistantPageState | null) => {
    if (next) {
      cancelAnimationFrame(returnFrame.current);
      setRestoringDock(false);
    }
    visible.current = next;
    setPage(next);
  }, []);

  const restoreSource = useCallback((source: WorkspaceOrigin) => {
    cancelAnimationFrame(returnFrame.current);
    setRestoringDock(true);
    show(null);

    const stillReturning = () => !visible.current && atSource(source);
    let previous: { dockBottom: number; viewportBottom: number } | undefined;
    const deadline = performance.now() + workspaceMotionTiming.duration;
    function revealDock(now: number) {
      if (!stillReturning()) {
        setRestoringDock(false);
        return;
      }
      const dock = document.querySelector<HTMLElement>("[data-workspace-dock]");
      const viewport = window.visualViewport;
      const dockBottom = dock?.getBoundingClientRect().bottom ?? 0;
      const viewportBottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
      const settled = previous && Math.abs(previous.dockBottom - dockBottom) <= 1 &&
        Math.abs(previous.viewportBottom - viewportBottom) <= 1;
      if (dock && !settled && now < deadline) {
        previous = { dockBottom, viewportBottom };
        returnFrame.current = requestAnimationFrame(revealDock);
        return;
      }
      setRestoringDock(false);
      returnFrame.current = requestAnimationFrame(() => {
        if (stillReturning()) dock?.querySelector<HTMLElement>("[data-assistant-trigger]")?.focus({ preventScroll: true });
      });
    }

    // 卸载助手时滚动锁先恢复来源位置，首帧只补齐路由恢复期间出现的偏差。
    returnFrame.current = requestAnimationFrame(now => {
      if (stillReturning()) {
        const scroller = document.scrollingElement ?? document.documentElement;
        const left = Math.min(source.x, Math.max(0, scroller.scrollWidth - scroller.clientWidth));
        const top = Math.min(source.y, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
        if (Math.abs(scrollX - left) > 1 || Math.abs(scrollY - top) > 1)
          scrollTo({ left, top, behavior: "instant" });
      }
      revealDock(now);
    });
  }, [show]);

  // popstate is immediate. Next's pathname/query also cover normal Link and router calls.
  const sync = useCallback(() => {
    const current = visible.current;
    if (location.pathname !== assistantPath) {
      backPending.current = null;
      if (!current) return;
      if (!atSource(current.source)) show(null);
      else if (current.motion?.direction !== "close") show({ ...current, motion: { direction: "close" } });
      return;
    }

    if (backPending.current) return;
    const key: unknown = window.history.state?.formwardAssistantEntry;
    const source = typeof key === "string" ? origins.current.get(key) ?? null : null;
    const entryId = source && typeof key === "string" ? key : null;
    const nextQuery = new URLSearchParams(location.search).toString();
    if (current && current.entryId === entryId && current.motion?.direction !== "close") {
      if (current.query !== nextQuery) show({ ...current, query: nextQuery });
    } else {
      show({ entryId, query: nextQuery, source, motion: source ? { direction: "open" } : null });
    }
  }, [show]);

  useLayoutEffect(sync, [pathname, query, sync]);
  useEffect(() => {
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      cancelAnimationFrame(returnFrame.current);
    };
  }, [sync]);

  const open = useCallback((view?: "tasks") => {
    if (location.pathname === assistantPath) return;
    const source = { path: location.pathname, query: location.search, x: scrollX, y: scrollY };
    const entryId = crypto.randomUUID();
    const query = view === "tasks" ? "view=tasks" : "";
    const url = assistantPath + (query ? "?" + query : "");
    try {
      window.history.pushState({ formwardAssistantEntry: entryId }, "", url);
    } catch {
      router.push(url, { scroll: false });
      return;
    }
    origins.current.set(entryId, source);
    show({ entryId, query, source, motion: { direction: "open" } });
  }, [router, show]);

  const back = useCallback(() => {
    const current = visible.current;
    if (!current?.source) { router.replace("/dashboard"); return; }
    if (location.pathname !== assistantPath || backPending.current) return;
    backPending.current = current.source;
    // 本页返回先启动退出，原生历史随后同步地址与前进记录。
    show({ ...current, motion: { direction: "close" } });
    window.history.back();
  }, [router, show]);

  const complete = useCallback((motion: AssistantPageMotion) => {
    const current = visible.current;
    if (!current || current.motion !== motion) return;
    if (motion.direction === "open") {
      show({ ...current, motion: null });
      return;
    }
    setClosedMotion(motion);
  }, [show]);

  useLayoutEffect(() => {
    const source = page?.source ?? null;
    // 退出动效可能先结束。浏览器和 Next 路由都回到来源后，才交还已挂载的工作区。
    if (!closedMotion || page?.motion !== closedMotion || !atSource(source) ||
        pathname !== source.path || query !== new URLSearchParams(source.query).toString()) return;
    const frame = requestAnimationFrame(() => {
      if (visible.current?.motion !== closedMotion || !atSource(source)) return;
      restoreSource(source);
    });
    return () => cancelAnimationFrame(frame);
  }, [closedMotion, page, pathname, query, restoreSource]);

  return { page, open, back, complete, dockReturning: restoringDock || page?.motion?.direction === "close" };
}
