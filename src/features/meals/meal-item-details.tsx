"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./meal-editor.module.css";

type Props = {
  id: string;
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  variant?: "menu" | "attached" | "choices";
  className?: string;
};

/** The native top layer lets row details overlap the list without clipping or moving it. */
export function MealItemDetails({ id, label, trigger, children, variant = "menu", className }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => { setHost(button.current?.closest("dialog") ?? null); }, []);
  useLayoutEffect(() => {
    if (!open || !button.current || !bubble.current || !host) return;
    const anchor = button.current, popup = bubble.current, dialog = host;
    const row = variant === "attached" ? anchor.closest<HTMLElement>("[data-meal-row]") : null;
    const viewport = window.visualViewport;
    let frame = 0, dismissFrame = 0, revealed = false;

    function place() {
      if (!popup.matches(":popover-open")) return;
      const bounds = dialog.getBoundingClientRect(), triggerBox = anchor.getBoundingClientRect();
      const rowBox = row?.getBoundingClientRect() ?? triggerBox;
      const left = Math.max(bounds.left, viewport?.offsetLeft ?? 0) + 8;
      const right = Math.min(bounds.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth)) - 8;
      const headerOffset = parseFloat(getComputedStyle(dialog).getPropertyValue("--inspector-sticky-offset")) || 0;
      const top = Math.max(bounds.top + 8, (viewport?.offsetTop ?? 0) + 8, bounds.top + headerOffset);
      const footer = dialog.querySelector<HTMLElement>("[data-meal-footer]")?.getBoundingClientRect();
      let bottom = Math.min(bounds.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight)) - 8;
      if ((row || variant === "choices") && footer && footer.height > 0 && footer.top > top) bottom = Math.min(bottom, footer.top - 6);
      if (triggerBox.bottom <= top || triggerBox.top >= bottom || triggerBox.width === 0 || right <= left) {
        // A container switch can move the trigger in the same frame as a resize.
        cancelAnimationFrame(dismissFrame);
        dismissFrame = requestAnimationFrame(() => {
          const current = anchor.getBoundingClientRect();
          if (!current.width || current.bottom <= top || current.top >= bottom) popup.hidePopover();
          else place();
        });
        return;
      }

      const gap = row ? 2 : variant === "choices" ? 4 : 8;
      const detailWidth = variant === "choices" ? 172 : 312;
      const width = Math.min(row ? rowBox.width : detailWidth, right - left);
      popup.style.width = width + "px";
      popup.style.maxHeight = "none";
      const height = popup.getBoundingClientRect().height;
      const below = bottom - rowBox.bottom - gap;
      const above = triggerBox.top - top - gap;

      if (row && !revealed && below < height) {
        revealed = true;
        const needed = Math.min(height - below, Math.max(0, rowBox.top - top - 4));
        const position = dialog.scrollTop;
        dialog.scrollBy({ top: needed, behavior: "instant" });
        if (dialog.scrollTop !== position) {
          place();
          return;
        }
      }
      revealed = true;
      const down = !!row || below >= height || below >= above;
      const maxHeight = Math.max(0, Math.min(360, down ? below : above));
      if (maxHeight < 24) {
        popup.hidePopover();
        return;
      }
      popup.style.left = Math.max(left, Math.min(row ? rowBox.left : triggerBox.right - width, right - width)) + "px";
      popup.style.top = (down ? rowBox.bottom + gap : triggerBox.top - gap - Math.min(height, maxHeight)) + "px";
      popup.style.maxHeight = maxHeight + "px";
      popup.dataset.positioned = "true";
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    }

    function outside(event: PointerEvent) {
      const path = event.composedPath();
      if (!path.includes(popup) && !path.includes(anchor)) popup.hidePopover();
    }

    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !popup.matches(":popover-open")) return;
      event.preventDefault();
      event.stopPropagation();
      popup.hidePopover();
      anchor.focus({ preventScroll: true });
    }

    place();
    if (variant === "choices" && popup.dataset.positioned) {
      const selected = popup.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      (selected ?? popup.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(dialog);
    observer.observe(popup);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(dismissFrame);
      observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      delete popup.dataset.positioned;
    };
  }, [open, host, variant]);

  function close() {
    bubble.current?.hidePopover();
    button.current?.focus({ preventScroll: true });
  }

  return <>
    <button ref={button} type="button" className={className} popoverTarget={id}
      aria-label={label} aria-expanded={open} onClick={() => {
        host?.querySelectorAll<HTMLElement>("[data-meal-details]:popover-open").forEach(node => {
          if (node !== bubble.current) node.hidePopover();
        });
      }}>{trigger}</button>
    {host && createPortal(
      <div ref={bubble} popover="manual" id={id} data-meal-details={variant}
        className={styles.detailLayer} role={variant === "attached" ? "region" : "dialog"} aria-label={label}
        onClick={variant === "choices" ? event => {
          if (event.target instanceof Element && event.target.closest("button")) close();
        } : undefined}
        onToggle={event => setOpen(event.currentTarget.matches(":popover-open"))}>{children}</div>, host,
    )}
  </>;
}
