"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { localMotionEasing, localTargetVisible, permitsLocalMotion } from "./local-motion";

/** 保留退出中的实内容，命中与可读树立即跟随新状态。 */
export function AnimatedRegion({ open, children, id, keepMounted = false, onCollapsed, label, kind }: {
  open: boolean;
  children: ReactNode;
  id?: string;
  keepMounted?: boolean;
  onCollapsed?: () => void;
  label?: string;
  kind: "food" | "review" | "history";
}) {
  const region = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const running = useRef<Animation | null>(null);
  const previous = useRef(open);
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const callback = useRef(onCollapsed);
  useLayoutEffect(() => { callback.current = onCollapsed; }, [onCollapsed]);
  useLayoutEffect(() => () => running.current?.cancel(), []);

  useLayoutEffect(() => {
    if (previous.current === open) return;
    previous.current = open;
    const node = region.current, inner = content.current;
    const height = inner?.getBoundingClientRect().height ?? 0;
    const from = running.current && node ? node.getBoundingClientRect().height : open ? 0 : height;
    const opacity = running.current && node ? getComputedStyle(node).opacity : open ? "0" : "1";
    running.current?.cancel();
    running.current = null;
    if (node) delete node.dataset.regionMotion;

    const after = open ? height : 0;
    if (!node || !inner || !permitsLocalMotion() || typeof node.animate !== "function" || Math.abs(from - after) < 1
        || !localTargetVisible(inner)) {
      if (!open) queueMicrotask(() => {
        if (previous.current || !node?.isConnected) return;
        setPresent(false);
        callback.current?.();
      });
      return;
    }

    const animation = node.animate([
      { height: from + "px", opacity, overflow: "clip" },
      { height: after + "px", opacity: open ? 1 : 0, overflow: "clip" },
    ], { duration: kind === "history" ? 170 : 200, easing: localMotionEasing });
    running.current = animation;
    node.dataset.regionMotion = open ? "opening" : "closing";
    void animation.finished.then(() => {
      if (running.current !== animation) return;
      running.current = null;
      delete node.dataset.regionMotion;
      if (!open) {
        setPresent(false);
        callback.current?.();
      }
    }, () => {});
  }, [kind, open]);

  const shown = open || present;
  return <div ref={region} id={id} data-animated-region={kind} hidden={!shown}
    aria-label={label} inert={!open || undefined}>
    <div ref={content} style={{ display: "flow-root" }}>{(shown || keepMounted) && children}</div>
  </div>;
}
