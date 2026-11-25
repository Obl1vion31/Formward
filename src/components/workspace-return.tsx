"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { confirmDraftDiscard } from "./draft-guard";
import { workspacePages } from "./workspace-pages";

export type ReturnScope = "workspace" | "account" | "assistant";
type TaskDisplay = { tools: boolean; supplements: boolean; reviews?: boolean; scroll: number };
type Visit = {
  id: string;
  source: string;
  target: string;
  link: string;
  linkName?: string;
  scroll: number;
  scope: ReturnScope;
  quick: boolean;
  tasks?: TaskDisplay;
};

type WorkspaceReturn = {
  visit: Visit | null;
  restoring: Visit | null;
  capture: (link: string, trigger: HTMLElement | null, scope?: ReturnScope) => (() => void) | undefined;
  back: (fallback: string) => Promise<void>;
  entryClosed: (path: string) => void;
  watchEntry: (close: () => void) => () => void;
};

const Context = createContext<WorkspaceReturn | null>(null);
export const useWorkspaceReturn = () => useContext(Context);

const workspaceUrl = (url: URL) => url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/");
const currentLocation = () => location.pathname + location.search;
const linkName = (element?: HTMLElement | null) => element?.getAttribute("aria-label") ?? element?.textContent?.trim();
const visitLocation = (url: URL) => url.pathname + url.search;
const moduleLabels = new Map<string, string>([...workspacePages, ["/dashboard/ai", "AI 接入"], ["/dashboard/sources", "设备与数据来源"]]);

function taskDisplay(taskList: HTMLElement): TaskDisplay {
  const open = (group: string) => {
    const value = taskList.querySelector('[data-assistant-group="' + group + '"]')?.getAttribute("aria-expanded");
    return value == null ? undefined : value === "true";
  };
  return { tools: !!open("tools"), supplements: !!open("supplements"), reviews: open("reviews"), scroll: taskList.scrollTop };
}

function see(element: HTMLElement | undefined | null): element is HTMLElement {
  return !!element && !!element.getClientRects().length && !element.closest("[inert]") && getComputedStyle(element).visibility === "visible";
}

export function WorkspaceReturnProvider({ children }: { children: ReactNode }) {
  const router = useRouter(), path = usePathname(), search = useSearchParams().toString();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [restoring, setRestoring] = useState<Visit | null>(null);
  const visits = useRef(new Map<string, Visit>());
  const pending = useRef<Visit | null>(null), active = useRef<Visit | null>(null);
  const entryClose = useRef<(() => void) | null>(null);
  const returning = useRef<string | null>(null), rewinding = useRef<string | null>(null);

  const capture = useCallback((link: string, trigger: HTMLElement | null, scope?: ReturnScope) => {
    const from = new URL(location.href), to = new URL(link, from);
    const current = active.current;
    // A Server Action may refresh the current history state before the user opens a receipt link.
    if (current?.target === visitLocation(from) && window.history.state?.formwardReturnVisit !== current.id) {
      window.history.replaceState({ ...window.history.state, formwardReturnVisit: current.id }, "");
    }
    const quick = to.searchParams.has("entry") && ["/dashboard/meals", "/dashboard/energy", "/dashboard/measurements"].includes(to.pathname);
    if ((!scope && !quick) || to.origin !== from.origin || !workspaceUrl(from) || !workspaceUrl(to)) return;
    const source = visitLocation(from), target = visitLocation(to);
    if (source === target) return;
    const list = trigger?.closest<HTMLElement>("[data-assistant-task-scroll]");
    const record: Visit = {
      id: crypto.randomUUID(), source, target, link, linkName: linkName(trigger), scroll: scrollY,
      scope: scope ?? "workspace", quick, tasks: list ? taskDisplay(list) : undefined,
    };
    return () => {
      if (currentLocation() !== record.source) return;
      visits.current.set(record.id, record);
      setRestoring(null);
      pending.current = record;
      window.history.replaceState({ ...window.history.state, formwardReturnSource: record.id }, "");
    };
  }, []);

  useLayoutEffect(() => {
    const candidate = pending.current;
    if (candidate?.target === currentLocation()) {
      window.history.replaceState({ ...window.history.state, formwardReturnVisit: candidate.id }, "");
      pending.current = null;
    } else if (candidate && candidate.source !== currentLocation()) pending.current = null;
    const record = visits.current.get(window.history.state?.formwardReturnVisit);
    const next = record?.target === currentLocation() ? record : null;
    active.current = next;
    setVisit(next);
  }, [path, search]);

  const watchEntry = useCallback((close: () => void) => {
    entryClose.current = close;
    return () => { if (entryClose.current === close) entryClose.current = null; };
  }, []);

  useLayoutEffect(() => {
    const handleBack = (event: PopStateEvent) => {
      if (rewinding.current && rewinding.current === active.current?.id && currentLocation() === active.current.target) {
        event.stopImmediatePropagation();
        rewinding.current = null;
        entryClose.current?.();
        return;
      }
      const record = active.current;
      if (!record || event.state?.formwardReturnSource !== record.id || currentLocation() !== record.source) {
        returning.current = null;
        rewinding.current = null;
        return;
      }
      if (record.quick && returning.current !== record.id && entryClose.current) {
        // Keep the editor mounted while asking through its normal draft guard.
        event.stopImmediatePropagation();
        rewinding.current = record.id;
        history.forward();
        return;
      }
      returning.current = null;
      setRestoring(record);
    };
    window.addEventListener("popstate", handleBack, true);
    return () => window.removeEventListener("popstate", handleBack, true);
  }, []);

  const back = useCallback(async (fallback: string) => {
    if (returning.current || !await confirmDraftDiscard() || returning.current) return;
    const record = active.current;
    if (record && currentLocation() === record.target) {
      returning.current = record.id;
      history.back();
    } else router.replace(fallback);
  }, [router]);

  const entryClosed = useCallback((path: string) => {
    if (path !== location.pathname) return;
    const url = new URL(location.href);
    if (!url.searchParams.has("entry")) return;
    url.searchParams.delete("entry");
    url.searchParams.delete("date");
    url.searchParams.delete("intent");
    const record = active.current;
    if (!record?.quick || record.target !== currentLocation()) {
      router.replace(visitLocation(url), { scroll: false });
      return;
    }
    // Retire this editor entry so browser Forward cannot reopen a discarded draft.
    const next = { ...window.history.state };
    delete next.formwardReturnVisit;
    window.history.replaceState(next, "", url);
    returning.current = record.id;
    history.back();
  }, [router]);

  useLayoutEffect(() => {
    if (!restoring || restoring.source !== currentLocation()) return;
    let frame = 0;
    const until = performance.now() + 3000;
    const restore = () => {
      if (currentLocation() !== restoring.source) return;
      window.scrollTo({ top: restoring.scroll, behavior: "instant" });
      const link = Array.from(document.querySelectorAll<HTMLElement>("[data-workspace-origin-link]"))
        .find(element => element.dataset.workspaceOriginLink === restoring.link &&
          (!restoring.linkName || linkName(element) === restoring.linkName) && see(element));
      const taskList = Array.from(document.querySelectorAll<HTMLElement>("[data-assistant-task-scroll]")).find(see);
      if (taskList && restoring.tasks) taskList.scrollTop = restoring.tasks.scroll;
      const target = restoring.scope === "account" ? document.querySelector<HTMLElement>('summary[aria-label="账号菜单"]') : link;
      if (see(target)) {
        target.focus({ preventScroll: true });
        setRestoring(null);
      } else if (performance.now() < until) frame = requestAnimationFrame(restore);
      else {
        const fallback = taskList?.querySelector<HTMLElement>('[data-assistant-group="tools"]');
        if (see(fallback)) fallback.focus({ preventScroll: true });
        setRestoring(null);
      }
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [path, search, restoring]);

  const value = useMemo(() => ({ visit, restoring, capture, back, entryClosed, watchEntry }),
    [visit, restoring, capture, back, entryClosed, watchEntry]);
  return <Context value={value}>{children}</Context>;
}

export function workspaceReturnLabel(visit: Visit | null | undefined, fallback: string) {
  if (visit?.scope === "assistant") return visit.tasks ? "返回待办" : "返回小助手";
  const from = visit?.source ?? fallback;
  if (from === "/dashboard/meals?section=foods") return "返回食材库";
  return "返回" + (from.startsWith("/dashboard/assistant") ? "待办" : moduleLabels.get(from.split("?")[0]) ?? "原页面");
}

export function WorkspaceReturnLink({ fallback = "/dashboard", className, assistantOnly = false, disabled = false }: {
  fallback?: string;
  className?: string;
  assistantOnly?: boolean;
  disabled?: boolean;
}) {
  const state = useWorkspaceReturn();
  if (assistantOnly && state?.visit?.scope !== "assistant") return null;
  const label = workspaceReturnLabel(state?.visit, fallback);
  if (disabled) return <span className={className ?? "dashboard-subpage-return"} aria-disabled="true">← {label}</span>;
  return <Link href={state?.visit?.source ?? fallback} prefetch={false} className={className ?? "dashboard-subpage-return"}
    onNavigate={state ? event => { event.preventDefault(); void state.back(fallback); } : undefined}>← {label}</Link>;
}
