"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { followPopoverAnchor, readPopoverBounds } from "@/components/anchored-popover";
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
    let dismissFrame = 0, revealed = false;

    function deferUnavailable() {
      popup.style.visibility = "hidden";
      if (dismissFrame) return;
      dismissFrame = requestAnimationFrame(() => {
        place(true);
        dismissFrame = 0;
      });
    }

    function place(retry = false) {
      if (!popup.matches(":popover-open")) return;
      const { left, right, top, bottom: surfaceBottom } = readPopoverBounds(dialog, 8, true);
      const triggerBox = anchor.getBoundingClientRect();
      const rowBox = row?.getBoundingClientRect() ?? triggerBox;
      const footer = dialog.querySelector<HTMLElement>("[data-meal-footer]")?.getBoundingClientRect();
      const bottom = (row || variant === "choices") && footer && footer.height > 0 && footer.top > top
        ? Math.min(surfaceBottom, footer.top - 6)
        : surfaceBottom;
      if (!triggerBox.width || triggerBox.bottom <= top || triggerBox.top >= bottom ||
        triggerBox.left >= right || triggerBox.right <= left || right <= left) {
        // Scroll and viewport changes can arrive a frame apart while Safari resizes.
        if (retry) popup.hidePopover();
        else deferUnavailable();
        return;
      }

      const gap = row ? 2 : variant === "choices" ? 4 : 8;
      const detailWidth = variant === "choices" ? 172 : 312;
      const width = Math.min(row ? rowBox.width : detailWidth, right - left);
      popup.style.width = width + "px";
      const height = Math.min(360, popup.scrollHeight + popup.offsetHeight - popup.clientHeight);
      const below = bottom - rowBox.bottom - gap;
      const above = rowBox.top - top - gap;

      if (row && !revealed && below < height) {
        revealed = true;
        const needed = Math.min(height - below, Math.max(0, rowBox.top - top - 4));
        const position = dialog.scrollTop;
        dialog.scrollBy({ top: needed, behavior: "instant" });
        if (dialog.scrollTop !== position) {
          place(retry);
          return;
        }
      }
      revealed = true;
      const minHeight = variant === "choices" ? 54 : 44;
      const down = below >= minHeight && (below >= height || !!row || below >= above);
      const maxHeight = Math.min(360, down ? below : above);
      if (maxHeight < minHeight) {
        if (retry) popup.hidePopover();
        else deferUnavailable();
        return;
      }

      cancelAnimationFrame(dismissFrame);
      dismissFrame = 0;
      popup.style.left = Math.max(left, Math.min(row ? rowBox.left : triggerBox.right - width, right - width)) + "px";
      popup.style.top = (down ? rowBox.bottom + gap : rowBox.top - gap - Math.min(height, maxHeight)) + "px";
      popup.style.maxHeight = maxHeight + "px";
      popup.style.removeProperty("visibility");
      popup.dataset.positioned = "true";
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

    const stopPositioning = followPopoverAnchor(popup, anchor, dialog, place);
    if (variant === "choices" && popup.dataset.positioned) {
      const selected = popup.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      (selected ?? popup.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      stopPositioning();
      cancelAnimationFrame(dismissFrame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      popup.style.removeProperty("visibility");
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
