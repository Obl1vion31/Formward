"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { draftIsDirty } from "@/components/draft-guard";
import { LoadingLink } from "@/components/loading-link";
import { synchronizeSourceAction } from "@/app/dashboard/sources/actions";
import type { ConnectionView } from "./model";
import styles from "./sources.module.css";

export function EnergySourceStatus({ initial, steps, cumulative, protectedDay }: { initial: ConnectionView | null; steps: number | null; cumulative: boolean; protectedDay: boolean }) {
  const [connection, setConnection] = useState(initial), [working, setWorking] = useState(false), [pendingRefresh, setPendingRefresh] = useState(false), [, startTransition] = useTransition();
  const router = useRouter(), running = useRef(false), lastAttempt = useRef(initial?.lastAttemptAt ? +new Date(initial.lastAttemptAt) : 0);
  const [base, setBase] = useState(initial);
  if (base !== initial) { setBase(initial); setConnection(initial); }
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "hidden" || running.current || draftIsDirty() || connection?.status !== "active" || Date.now() - Math.max(lastAttempt.current, initial?.lastAttemptAt ? +new Date(initial.lastAttemptAt) : 0) < 300000) return;
      running.current = true; lastAttempt.current = Date.now(); setWorking(true);
      startTransition(async () => {
        try {
          const result = await synchronizeSourceAction(false);
          if (result.ok) {
            setConnection(result.data.connections[0] ?? null);
            if (result.sync.adoptedDates.length) { if (draftIsDirty()) setPendingRefresh(true); else router.refresh(); }
          }
        } catch { setConnection(c => c ? { ...c, error: "同步未完成，保留上次数据。" } : c); }
        finally { running.current = false; setWorking(false); }
      });
    };
    update(); document.addEventListener("visibilitychange", update); window.addEventListener("focus", update);
    return () => { document.removeEventListener("visibilitychange", update); window.removeEventListener("focus", update); };
  }, [connection?.status, initial?.lastAttemptAt, router]);
  const state = working ? "正在同步…" : connection?.status === "paused" ? "同步已暂停" : connection?.error ? "同步未完成，保留上次数据" : connection && !connection.adopted ? "数据已读取，待对照采用" : connection?.lastSuccessAt ? "上次成功 " + new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(connection.lastSuccessAt)) : "连接设备同步消耗";
  return <div className={styles.syncBar} data-energy-source-status><span>{steps === null ? "步数未知" : new Intl.NumberFormat("zh-CN").format(steps) + " 步"}{protectedDay ? " · 手动保护" : cumulative ? " · 今日累计" : ""}</span>{pendingRefresh ? <button type="button" onClick={() => { if (!draftIsDirty()) { router.refresh(); setPendingRefresh(false); } }}>查看同步更新</button> : <LoadingLink href="/dashboard/sources">{state} <span aria-hidden="true">→</span></LoadingLink>}</div>;
}
