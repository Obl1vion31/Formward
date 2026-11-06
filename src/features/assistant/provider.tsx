"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { draftIsBusy, draftIsDirty } from "@/components/draft-guard";
import { confirmationIsOpen } from "@/components/confirmation-state";
import { localMeasurementDate } from "../measurements/entry-state";
import { assistantAvailable, type AssistantContext } from "./model";
import { AssistantStateContext } from "./context";
import { assistantAlreadyShown, assistantAutoEnabled, assistantAutoKey, assistantSeenKey, markAssistantShown } from "./preferences";
import { AssistantSurface } from "./surface";

function preferenceStore() { try { return window.localStorage; } catch { return null; } }
function deviceTime() { const now = new Date(); return { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, date: localMeasurementDate(now), period: now.getHours() < 6 ? 0 : now.getHours() < 18 ? 1 : 2 }; }
function occupied() { return document.hidden || !!document.querySelector('[data-workspace-pending="true"]') || draftIsBusy() || draftIsDirty() || confirmationIsOpen() || !!document.fullscreenElement || !!document.querySelector(".dashboard-menu[open]") || !!document.querySelector('dialog[open]:not([data-assistant-surface])'); }

export function AssistantProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const pathname = usePathname(), available = assistantAvailable(pathname);
  const [open, setOpen] = useState(false), [data, setData] = useState<AssistantContext | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [automatic, setAutomatic] = useState(() => typeof window === "undefined" ? true : assistantAutoEnabled(preferenceStore(), accountId));
  const dataRef = useRef(data), request = useRef<AbortController | null>(null), epoch = useRef(0), stale = useRef(true), attempted = useRef(false), origin = useRef<"manual" | "auto">("manual"), claimDone = useRef<(() => void) | null>(null), shown = useRef(new Set<string>()), previousRoute = useRef(pathname), activeRoute = useRef(pathname);
  useEffect(() => { dataRef.current = data; activeRoute.current = pathname; }, [data, pathname]);
  const hide = useCallback(() => { setOpen(false); claimDone.current?.(); claimDone.current = null; }, []);
  const refresh = useCallback(async () => {
    if (!assistantAvailable(activeRoute.current) || document.hidden) return;
    request.current?.abort(); const controller = new AbortController(), generation = ++epoch.current, time = deviceTime(); request.current = controller;
    setLoading(true); setError("");
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`/api/assistant-context?timezone=${encodeURIComponent(time.timezone)}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (response.status === 401) throw new Error("登录已失效，请重新登录。");
      if (!response.ok) throw new Error("暂时无法核对记录，请重试。");
      const next: AssistantContext = await response.json();
      const current = deviceTime();
      if (generation !== epoch.current || time.date !== current.date || time.timezone !== current.timezone || !assistantAvailable(activeRoute.current)) return;
      setData(next); stale.current = false;
    } catch (failure) {
      if (generation === epoch.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "暂时无法核对记录，请重试。");
      else if (generation === epoch.current && controller.signal.aborted) setError("核对超时，请重试。");
    } finally { clearTimeout(timeout); if (generation === epoch.current) setLoading(false); }
  }, []);
  const seed = useCallback((next: AssistantContext) => {
    const time = deviceTime();
    if (next.localDate !== time.date || next.timezone !== time.timezone) { void refresh(); return; }
    if (dataRef.current && dataRef.current.generatedAt > next.generatedAt) return;
    request.current?.abort(); epoch.current++; stale.current = false;
    setData(next); setError(""); setLoading(false);
  }, [refresh]);
  const show = useCallback(() => {
    if (!assistantAvailable(activeRoute.current) || occupied()) return;
    origin.current = "manual"; setOpen(true);
    const current = dataRef.current, time = deviceTime();
    if (stale.current || !current || current.localDate !== time.date || current.timezone !== time.timezone) void refresh();
  }, [refresh]);
  const presented = useCallback(() => {
    const date = deviceTime().date;
    shown.current.add(date); markAssistantShown(preferenceStore(), accountId, date);
    claimDone.current?.(); claimDone.current = null;
  }, [accountId]);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === assistantAutoKey(accountId)) setAutomatic(assistantAutoEnabled(preferenceStore(), accountId));
      if (event.key === assistantSeenKey(accountId, deviceTime().date) && event.newValue && origin.current === "auto") hide();
    };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [accountId, hide]);
  useEffect(() => {
    if (previousRoute.current !== pathname) { attempted.current = false; previousRoute.current = pathname; hide(); }
    if (!available) { request.current?.abort(); epoch.current++; }
  }, [pathname, available, hide]);
  useEffect(() => {
    if (pathname !== "/dashboard" || !data || !data.pending.length || attempted.current || !automatic) return;
    const time = deviceTime(); if (data.localDate !== time.date || data.timezone !== time.timezone) return;
    attempted.current = true;
    const timer = setTimeout(() => {
      const claim = async () => {
        if (occupied() || activeRoute.current !== "/dashboard" || shown.current.has(time.date) || assistantAlreadyShown(preferenceStore(), accountId, time.date) || !assistantAutoEnabled(preferenceStore(), accountId)) return;
        origin.current = "auto";
        await new Promise<void>(resolve => { claimDone.current = resolve; setOpen(true); });
      };
      if (navigator.locks) void navigator.locks.request(`formward-assistant:${accountId}:${time.date}`, { ifAvailable: true }, lock => lock ? claim() : undefined);
      else void claim();
    }, 250);
    return () => clearTimeout(timer);
  }, [pathname, data, automatic, accountId]);
  useEffect(() => {
    let time = deviceTime();
    const invalidated = () => { stale.current = true; void refresh(); };
    const timeChanged = () => { const next = deviceTime(); const changed = next.date !== time.date || next.timezone !== time.timezone || next.period !== time.period; if (changed) { time = next; stale.current = true; setData(null); } return changed; };
    const visible = () => { if (!document.hidden) { timeChanged(); if (open) void refresh(); } };
    const clock = setInterval(() => { if (timeChanged() && open) void refresh(); }, 60000);
    window.addEventListener("formward-record-saved", invalidated); window.addEventListener("formward-record-context-stale", invalidated);
    document.addEventListener("visibilitychange", visible); window.addEventListener("focus", visible);
    return () => { clearInterval(clock); window.removeEventListener("formward-record-saved", invalidated); window.removeEventListener("formward-record-context-stale", invalidated); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [open, refresh]);
  useEffect(() => () => { request.current?.abort(); epoch.current++; claimDone.current?.(); }, []);
  const value = useMemo(() => ({ open: open && available, count: error ? 0 : data?.pending.length ?? 0, show, hide, seed }), [open, available, error, data, show, hide, seed]);
  return <AssistantStateContext.Provider value={value}>{children}{open && available && <AssistantSurface data={data} error={error} loading={loading} automatic={automatic} close={hide} presented={presented} retry={() => void refresh()} changeAutomatic={enabled => { setAutomatic(enabled); try { preferenceStore()?.setItem(assistantAutoKey(accountId), enabled ? "on" : "off"); } catch {} }}/>}</AssistantStateContext.Provider>;
}
