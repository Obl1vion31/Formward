"use client";
import { useRef, type PointerEvent, type MouseEvent } from "react";

// 原生 dialog 会把从内容拖到遮罩的 click 定向到 dialog；必须同时检查手势起点和终点。
export function useBackdropDismiss(close: () => void) {
  const gesture = useRef<{ id: number; x: number; y: number; outside: boolean; moved: boolean } | null>(null);
  const eligible = useRef(false);
  const outside = (event: { clientX: number; clientY: number; target: EventTarget; currentTarget: HTMLDialogElement }) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
  };
  return {
    onPointerDownCapture(event: PointerEvent<HTMLDialogElement>) {
      eligible.current = false;
      gesture.current = event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY, outside: outside(event), moved: false } : null;
    },
    onPointerMoveCapture(event: PointerEvent<HTMLDialogElement>) {
      const start = gesture.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) start.moved = true;
    },
    onPointerUpCapture(event: PointerEvent<HTMLDialogElement>) {
      const start = gesture.current;
      eligible.current = !!start && start.id === event.pointerId && start.outside && !start.moved && outside(event);
      gesture.current = null;
    },
    onPointerCancel() { gesture.current = null; eligible.current = false; },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      const dismiss = eligible.current && outside(event); eligible.current = false;
      if (dismiss) close();
    },
  };
}
