"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { draftIsBusy, draftIsDirty } from "@/components/draft-guard";
import { confirmationIsOpen } from "@/components/confirmation-state";
import { dismissAssistantReminderAction } from "@/app/dashboard/assistant-actions";
import { localMeasurementDate } from "../measurements/entry-state";
import { assistantAvailable, type AssistantContext } from "./model";
import { AssistantStateContext } from "./context";
import { assistantAlreadyShown, markAssistantShown } from "./preferences";
import { AssistantSurface } from "./surface";
import styles from "./surface.module.css";

function preferenceStore() { try { return window.localStorage; } catch { return null; } }
function deviceTime() { return { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, date: localMeasurementDate(new Date()) }; }
function occupied() { return document.hidden || document.documentElement.dataset.chartTravel === "active" || draftIsBusy() || draftIsDirty() || confirmationIsOpen() || !!document.fullscreenElement || !!document.querySelector(".dashboard-menu[open]:not([data-closing=true])") || !!document.querySelector("dialog[open]:not([data-assistant-surface])"); }
type SurfaceController = { dismiss: () => Promise<boolean>; reopen: () => void };

export function AssistantProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const pathname = usePathname(), available = assistantAvailable(pathname);
  const [open, setOpen] = useState(false), [data, setData] = useState<AssistantContext | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [toast, setToast] = useState(false), [paused, setPaused] = useState(false), [clock, setClock] = useState(0), [local, setLocal] = useState<{date:string;timezone:string}|null>(null);
  const dataRef = useRef<AssistantContext | null>(null), request = useRef<AbortController | null>(null), revision = useRef(0), lastRead = useRef(0), activeRoute = useRef(pathname), generation = useRef(0), phase = useRef<"open" | "closing" | "closed">("closed"), surface = useRef<SurfaceController | null>(null), ignored = useRef(new Set<string>()), latestRefresh = useRef<(force?:boolean)=>Promise<void>>(async()=>undefined);
  useEffect(()=>{activeRoute.current=pathname;},[pathname]);
  const apply = useCallback((next: AssistantContext) => {
    const value = { ...next, pending: next.pending.filter(item => !ignored.current.has(item.id)) };
    dataRef.current = value; setData(value);
  }, []);
  const refresh = useCallback(async (force = false) => {
    if (!assistantAvailable(activeRoute.current) || document.hidden || request.current || (!force && Date.now() - lastRead.current < 5000)) return;
    const controller = new AbortController(), ticket = ++generation.current, stamp = revision.current, time = deviceTime();
    request.current = controller; lastRead.current = Date.now(); setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`/api/assistant-context?timezone=${encodeURIComponent(time.timezone)}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 ? "登录已失效，请重新登录。" : "暂时无法读取事项，请重试。");
      const next: AssistantContext = await response.json(), current = deviceTime();
      if (ticket !== generation.current || stamp !== revision.current || time.date !== current.date || time.timezone !== current.timezone) return;
      apply(next); setError("");
    } catch (failure) {
      if (ticket === generation.current) setError(controller.signal.aborted ? "读取超时，请重试。" : failure instanceof Error ? failure.message : "暂时无法读取事项，请重试。");
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
      if (ticket === generation.current) {
        setLoading(false);
        if (stamp !== revision.current) setTimeout(() => void latestRefresh.current(true), 0);
      }
    }
  }, [apply]);
  useEffect(()=>{latestRefresh.current=refresh;},[refresh]);
  const finishHide = useCallback(() => { if (phase.current !== "closing") return; phase.current = "closed"; setOpen(false); }, []);
  const hide = useCallback(async () => {
    phase.current = "closing";
    if (surface.current) { if (await surface.current.dismiss()) finishHide(); }
    else finishHide();
  }, [finishHide]);
  const show = useCallback(() => {
    if (!assistantAvailable(activeRoute.current) || occupied()) return;
    phase.current = "open"; setToast(false); setPaused(false); markAssistantShown(preferenceStore(), accountId, deviceTime().date);
    if (open) surface.current?.reopen(); else setOpen(true);
    void refresh(true);
  }, [accountId, open, refresh]);
  const toggle = useCallback(() => { if (phase.current === "open") void hide(); else show(); }, [hide, show]);
  const controllerReady = useCallback((next: SurfaceController | null) => { surface.current = next; }, []);
  const dismissItem = useCallback(async (id: string) => {
    const result = await dismissAssistantReminderAction({ id, timezone: deviceTime().timezone });
    if (!result.ok) return result.error;
    ignored.current.add(id); revision.current++;
    if (dataRef.current) apply({ ...dataRef.current, pending: dataRef.current.pending.filter(item => item.id !== id) });
    try { preferenceStore()?.setItem("formward:assistant:changed:" + accountId, String(Date.now())); } catch {}
    return "";
  }, [accountId, apply]);
  useEffect(() => {
    const initialFrame=requestAnimationFrame(()=>{setLocal(deviceTime());setClock(Date.now());void refresh();});
    const changed = () => { revision.current++; void refresh(true); };
    const visible = () => { if (!document.hidden) { setLocal(deviceTime());setClock(Date.now()); void refresh(); } };
    const storage = (event: StorageEvent) => { if (event.key === "formward:assistant:changed:" + accountId) changed(); };
    const timer = setInterval(() => { if (!document.hidden) { setLocal(deviceTime());setClock(Date.now()); void refresh(); } }, 60000);
    window.addEventListener("formward-record-saved", changed); window.addEventListener("formward-record-context-stale", changed); window.addEventListener("focus", visible); window.addEventListener("storage", storage); document.addEventListener("visibilitychange", visible);
    return () => { cancelAnimationFrame(initialFrame);clearInterval(timer); window.removeEventListener("formward-record-saved", changed); window.removeEventListener("formward-record-context-stale", changed); window.removeEventListener("focus", visible); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", visible); };
  }, [accountId, refresh]);
  useEffect(() => { const frame=requestAnimationFrame(()=>{if (phase.current !== "closed") void hide(); if (available) void refresh();});return()=>cancelAnimationFrame(frame); }, [pathname, available, hide, refresh]);
  const pending = useMemo(() => {
    if (!data || !local || data.localDate !== local.date || data.timezone !== local.timezone) return [];
    return data.pending.filter(item => !item.expiresAt || Date.parse(item.expiresAt) > clock);
  }, [data, clock, local]);
  useEffect(() => {
    const next = pending.map(item => item.expiresAt && Date.parse(item.expiresAt)).filter((value): value is number => typeof value === "number" && value > Date.now()).sort((a,b)=>a-b)[0];
    if (!next) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(2147483647, next - Date.now() + 20));
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (!available || open || error || !pending.length || assistantAlreadyShown(preferenceStore(), accountId, deviceTime().date)) return;
    const timer = setTimeout(() => { if (!occupied()) { markAssistantShown(preferenceStore(), accountId, deviceTime().date); setPaused(false); setToast(true); } }, 400);
    return () => clearTimeout(timer);
  }, [available, open, error, pending, accountId]);
  useEffect(() => { if (!toast || paused) return; const timer = setTimeout(() => setToast(false), 5000); return () => clearTimeout(timer); }, [toast, paused]);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
  const value = useMemo(() => ({ open: open && available, count: pending.length, show, toggle, hide }), [open, available, pending.length, show, toggle, hide]);
  return <AssistantStateContext.Provider value={value}>{children}
    {toast && available && !open && pending.length > 0 && <aside className={styles.toast} role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <span>{pending.length === 1 ? pending[0].title : `有 ${pending.length} 项待查看`}</span><button type="button" onClick={show}>查看</button><button type="button" aria-label="关闭提醒" onClick={() => setToast(false)}>×</button>
    </aside>}
    {open && available && <AssistantSurface data={data ? { ...data, pending } : null} error={error} loading={loading} close={finishHide} requestClose={hide} retry={() => void refresh(true)} dismissItem={dismissItem} controllerReady={controllerReady}/>}
  </AssistantStateContext.Provider>;
}
