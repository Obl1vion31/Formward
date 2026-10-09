"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { lockPageScroll } from "./scroll-lock";
import { LoadingContext, LoadingVisibleContext, usePageLoading } from "./page-loading-state";

const LOADING_DELAY_MS = 200;

function LoadingIndicator({ label }: { label: string }) {
  return <div className="page-loading-indicator">
    <span className="page-loading-spinner" aria-hidden="true" />
    <p className="page-loading-message" role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>{label}</p>
  </div>;
}

function LoadingDialog({ label }: { label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    const previousFocus = document.activeElement;
    const unlock = lockPageScroll();
    node.showModal();
    node.querySelector<HTMLElement>(".page-loading-message")?.focus({ preventScroll: true });
    return () => {
      node.close();
      unlock();
      if ((previousFocus instanceof HTMLElement || previousFocus instanceof SVGElement) && previousFocus.isConnected && !previousFocus.matches(":disabled, [inert]")) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);
  return <dialog ref={dialog} className="page-loading-dialog" aria-label="加载中" onCancel={event => event.preventDefault()} onKeyDown={event => {
    // 同时阻止 Escape 的浏览器停止加载动作，避免中断请求或开发热更新连接。
    if (event.key === "Tab" || event.key === "Escape") event.preventDefault();
  }}>
    <LoadingIndicator label={label} />
  </dialog>;
}

export function PageLoadingProvider({ children }: { children: ReactNode }) {
  const tasks = useRef(new Map<symbol, string>());
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const set = useCallback((id: symbol, nextLabel: string | null) => {
    const current = tasks.current;
    if (nextLabel === null) current.delete(id);
    else {
      if (current.get(id) === nextLabel) return;
      current.delete(id);
      current.set(id, nextLabel);
    }
    if (finishTimer.current !== null) { clearTimeout(finishTimer.current); finishTimer.current = null; }
    if (current.size) {
      setLabel([...current.values()].at(-1)!);
      if (showTimer.current === null) {
        showTimer.current = setTimeout(() => {
          if (tasks.current.size) setVisible(true);
        }, LOADING_DELAY_MS);
      }
    } else {
      // Link 的 pending 与路由 fallback 在同一轮提交中交接，避免重复计时或闪烁。
      finishTimer.current = setTimeout(() => {
        finishTimer.current = null;
        if (tasks.current.size) return;
        if (showTimer.current !== null) { clearTimeout(showTimer.current); showTimer.current = null; }
        setLabel(null);
        setVisible(false);
      }, 0);
    }
  }, []);
  const controller = useMemo(() => ({ set }), [set]);
  useEffect(() => () => {
    if (showTimer.current !== null) clearTimeout(showTimer.current);
    if (finishTimer.current !== null) clearTimeout(finishTimer.current);
    showTimer.current = null; finishTimer.current = null;
    tasks.current.clear();
  }, []);
  return <LoadingContext.Provider value={controller}><LoadingVisibleContext.Provider value={visible}>
    <div data-page-content aria-busy={label !== null}>{children}</div>
    {visible && label && <LoadingDialog label={label} />}
  </LoadingVisibleContext.Provider></LoadingContext.Provider>;
}

// 首次响应在水合之前也有提示；全局模态层出现后移除后备，始终只显示一份。
export function RouteLoading() {
  usePageLoading({ active: true, label: "正在加载页面…" });
  const visible = useContext(LoadingVisibleContext);
  return <div className="page-loading-fallback" hidden={visible}><LoadingIndicator label="正在加载页面…" /></div>;
}
