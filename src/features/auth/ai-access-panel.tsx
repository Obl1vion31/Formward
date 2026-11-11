"use client";
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Inspector } from "@/components/inspector";
import { useMobileMode } from "@/components/use-mobile-mode";
import styles from "./ai-access.module.css";

/** 权限与连接管理共用同一入口：电脑锚定，手机沿用现有底部面板。 */
export function AiAccessPanel({ title, anchor, close, children }: { title: string; anchor: HTMLElement; close: () => void; children: ReactNode }) {
  const mobile = useMobileMode();
  return mobile ? <Inspector title={title} close={close} closeLabel="关闭连接面板" stableScroll motionDuration={160}><div className={`ai-page ${styles.settings} ${styles.sheetContent}`} data-ai-panel>{children}</div></Inspector> : <AnchoredPanel title={title} anchor={anchor} close={close}>{children}</AnchoredPanel>;
}
function AnchoredPanel({ title, anchor, close, children }: { title: string; anchor: HTMLElement; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), callback = useRef(close), closing = useRef(false);
  useLayoutEffect(() => { callback.current = close; });
  const dismiss = useCallback(() => {
    if (closing.current) return;
    const node = ref.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) { callback.current(); return; }
    closing.current = true;
    void node.animate([{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: "0 4px" }], { duration: 160, easing: "ease-in", fill: "forwards" }).finished.then(() => callback.current(), () => {});
  }, []);
  useLayoutEffect(() => {
    const node = ref.current!;
    function position() {
      const rect = anchor.getBoundingClientRect(), panel = node.getBoundingClientRect();
      node.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - panel.width - 16))}px`;
      node.style.top = `${Math.max(16, Math.min(rect.bottom + 8, innerHeight - panel.height - 16))}px`;
    }
    position(); node.focus({ preventScroll: true });
    const observer = new ResizeObserver(position); observer.observe(node);
    function outside(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !node.contains(target) && !anchor.contains(target) && !(target instanceof Element && target.closest("dialog[open]"))) dismiss();
    }
    function focus(event: FocusEvent) {
      const target = event.target;
      if (target instanceof Node && !node.contains(target) && !anchor.contains(target) && !(target instanceof Element && target.closest("dialog[open]"))) dismiss();
    }
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", focus);
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect(); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", focus);
      window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true);
      node.getAnimations().forEach(animation => animation.cancel()); closing.current = false;
      if (anchor.isConnected && (!document.activeElement || node.contains(document.activeElement) || document.activeElement === document.body)) anchor.focus({ preventScroll: true });
    };
  }, [anchor, dismiss]);
  return createPortal(<div className={`ai-page ${styles.settings} ${styles.panel}`} data-ai-panel ref={ref} role="dialog" aria-label={title} tabIndex={-1} onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); dismiss(); } }}>
    <header className={styles.panelHeading}><h2>{title}</h2><button type="button" className={styles.textAction} aria-label="关闭连接面板" onClick={dismiss}>×</button></header>{children}
  </div>, document.body);
}
