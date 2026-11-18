"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const visible = useRef(page);
  const origins = useRef(new Map<string, WorkspaceOrigin>());
  const restoredFocus = useRef(0);
  const backPending = useRef<WorkspaceOrigin | null>(null);

  const show = useCallback((next: AssistantPageState | null) => {
    visible.current = next;
    setPage(next);
  }, []);

  const restoreSource = useCallback((source: WorkspaceOrigin) => {
    cancelAnimationFrame(restoredFocus.current);
    restoredFocus.current = requestAnimationFrame(() => {
      if (visible.current || !atSource(source)) return;
      scrollTo(source.x, source.y);
      const trigger = document.querySelector<HTMLElement>("[data-workspace-dock] [data-assistant-trigger]");
      trigger?.focus({ preventScroll: true });
    });
  }, []);

  // popstate is immediate. Next's pathname/query also cover normal Link and router calls.
  const sync = useCallback(() => {
    const current = visible.current;
    if (location.pathname !== assistantPath) {
      const pending = backPending.current;
      backPending.current = null;
      if (!current && atSource(pending)) restoreSource(pending);
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
  }, [restoreSource, show]);

  useLayoutEffect(sync, [pathname, query, sync]);
  useEffect(() => {
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      cancelAnimationFrame(restoredFocus.current);
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

  useLayoutEffect(() => {
    if (page?.motion?.direction === "close" && page.source) scrollTo(page.source.x, page.source.y);
  }, [page]);

  const complete = useCallback((motion: AssistantPageMotion) => {
    const current = visible.current;
    if (!current || current.motion !== motion) return;
    if (motion.direction === "open") {
      show({ ...current, motion: null });
      return;
    }
    show(null);
    if (current.source && !backPending.current) restoreSource(current.source);
  }, [restoreSource, show]);

  return { page, open, back, complete };
}
