"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { animateSurface } from "./surface-motion";
import { animateGlassMenuFace, GlassMenuFace, stopGlassMenuFace } from "./glass-menu-face";
import glass from "./glass-controls.module.css";

export function GlassMenu({ children, icon, onOpen, onCloseReady, onEscape, mobileGlass = false, label = "账号菜单" }: {
  label?: string;
  mobileGlass?: boolean;
  children: ReactNode;
  icon: ReactNode;
  onOpen: () => void | Promise<void>;
  onCloseReady?: (close: () => Promise<void>) => void;
  onEscape?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const generation = useRef(0);
  const closing = useRef<Promise<void> | null>(null);
  const pathname = usePathname();
  const morph = mobileGlass;
  const motion = useCallback((direction: "open" | "close") => {
    const node = surface.current;
    const anchor = trigger.current;
    if (!node || !anchor) return Promise.resolve(false);
    return morph ? animateGlassMenuFace(node, anchor, direction) : animateSurface(node, direction, anchor);
  }, [morph]);

  const close = useCallback(() => {
    if (closing.current) return closing.current;
    if (!surface.current || !ref.current?.open) {
      generation.current++;
      return Promise.resolve();
    }
    const ticket = ++generation.current;
    const pending = motion("close").then(finished => {
      if (finished && ticket === generation.current) setOpen(false);
      if (closing.current === pending) closing.current = null;
    });
    closing.current = pending;
    return pending;
  }, [motion]);

  useEffect(() => { onCloseReady?.(close); }, [onCloseReady, close]);
  useLayoutEffect(() => {
    const node = surface.current;
    const anchor = trigger.current;
    if (!open || !node || !anchor) return;
    void motion("open");
    if (morph) return () => stopGlassMenuFace(node, anchor);
  }, [open, morph, motion]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) void close(); };
    const dismiss = () => { void close(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("formward-close-account-menu", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("formward-close-account-menu", dismiss);
    };
  }, [close]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { void close(); });
    return () => cancelAnimationFrame(frame);
  }, [pathname, close]);

  return <details className="dashboard-menu glass-menu" ref={ref} open={open} onKeyDown={event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (onEscape?.()) {
      event.stopPropagation();
      return;
    }
    void close();
    trigger.current?.focus({ preventScroll: true });
  }}>
    <summary ref={trigger} className={mobileGlass ? glass.mobileButton : undefined} aria-label={label} onClick={async event => {
      event.preventDefault();
      if (open && !closing.current) {
        void close();
        return;
      }
      if (open) {
        generation.current++;
        closing.current = null;
        void motion("open");
        return;
      }
      const ticket = ++generation.current;
      await onOpen();
      if (ticket === generation.current) setOpen(true);
    }}>{icon}</summary>
    <div ref={surface} data-glass-morph={morph || undefined} onClick={event => {
      const control = (event.target as Element).closest("button,a");
      if (control && !control.hasAttribute("data-menu-stay-open")) void close();
    }}>
      {morph ? <>
        {open && <GlassMenuFace/>}
        <div data-glass-content>{children}</div>
      </> : children}
    </div>
  </details>;
}
