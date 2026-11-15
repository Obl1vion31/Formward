"use client";
import {useSyncExternalStore} from "react";
import {approvePageRefresh, draftIsBusy, draftIsDirty} from "./draft-guard";
import {confirmAction} from "./confirmation-state";

export const currentBuild = process.env.NEXT_PUBLIC_APP_VERSION ?? "development";
type UpdateSnapshot = {
  status: "idle" | "checking" | "latest" | "available" | "error";
  availableVersion: string | null;
};
const initial: UpdateSnapshot = {status: "idle", availableVersion: null};
let snapshot = initial;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let refreshing = false;
const subscribe = (notify: () => void) => {listeners.add(notify); return () => {listeners.delete(notify);};};
const read = () => snapshot;
const server = () => initial;
function publish(next: UpdateSnapshot) {snapshot = next; for (const notify of listeners) notify();}

export function useAppUpdate() {return useSyncExternalStore(subscribe, read, server);}

/** 自动提醒与手动检查合并同一请求；只有公开版本号经过此接口。 */
export function checkForAppUpdate(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = Promise.resolve().then(async () => {
    publish({...snapshot, status: "checking"});
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/app-version", {cache: "no-store", credentials: "omit", signal: controller.signal});
      if (!response.ok) throw new Error("version unavailable");
      const result: unknown = await response.json();
      const version = result && typeof result === "object" && "version" in result ? result.version : null;
      if (typeof version !== "string" || !/^[a-zA-Z0-9._-]{1,120}$/.test(version) || version === "development" || currentBuild === "development") throw new Error("invalid version");
      const availableVersion = version === currentBuild ? null : version;
      publish({status: availableVersion ? "available" : "latest", availableVersion});
    } catch {
      // 临时故障不撤回已经发现的更新，也不把失败冒充“已是最新”。
      publish({...snapshot, status: "error"});
    } finally {
      clearTimeout(timeout);
    }
  }).finally(() => {inFlight = null;});
  return inFlight;
}

export async function refreshToAppUpdate(): Promise<"busy" | "cancelled" | "reloading"> {
  if (refreshing) return "cancelled";
  if (draftIsBusy()) return "busy";
  refreshing = true;
  try {
    if (draftIsDirty() && !await confirmAction({title: "刷新到新版本？", message: "当前尚未保存的输入将丢失。请先保存，或确认放弃后刷新。已保存记录保持。", confirmLabel: "放弃输入并刷新"})) return "cancelled";
    if (draftIsBusy()) return "busy";
    approvePageRefresh();
    window.location.reload();
    return "reloading";
  } finally {refreshing = false;}
}
