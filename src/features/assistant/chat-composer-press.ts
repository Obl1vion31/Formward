import { useRef, type PointerEvent } from "react";

export function useComposerPress() {
  const press = useRef<{ id: number; x: number; y: number } | null>(null);

  function release(row: HTMLDivElement) {
    press.current = null;
    delete row.dataset.pressing;
    delete row.dataset.pressMoving;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const row = event.currentTarget;
    if (!event.isPrimary) {
      release(row);
      return;
    }
    if (event.pointerType === "mouse" || (event.target as Element).closest("button,input")) return;
    const box = row.getBoundingClientRect();
    press.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    row.style.setProperty("--press-x", event.clientX - box.left + "px");
    row.style.setProperty("--press-y", event.clientY - box.top + "px");
    row.dataset.pressing = "true";
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = press.current;
    if (!active || event.pointerId !== active.id) return;
    const dx = Math.abs(event.clientX - active.x), dy = Math.abs(event.clientY - active.y);
    const row = event.currentTarget;
    if (dy > 10 && dy > dx) {
      release(row);
      return;
    }
    const box = row.getBoundingClientRect();
    const x = Math.max(0, Math.min(box.width, event.clientX - box.left));
    row.dataset.pressMoving = "true";
    row.style.setProperty("--press-x", x + "px");
  }

  function endPress(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId === press.current?.id) release(event.currentTarget);
  }

  return {
    onPointerDown, onPointerMove,
    onPointerUp: endPress, onPointerCancel: endPress, onLostPointerCapture: endPress, onPointerLeave: endPress,
    onContextMenu: (event: { currentTarget: HTMLDivElement }) => release(event.currentTarget),
  };
}
