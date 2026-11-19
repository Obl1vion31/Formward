import { useRef, type PointerEvent } from "react";

export function useComposerPress() {
  const press = useRef<{ id: number; x: number; y: number; shift: number } | null>(null);

  function release(row: HTMLDivElement) {
    press.current = null;
    delete row.dataset.pressing;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const row = event.currentTarget;
    if (!event.isPrimary) {
      release(row);
      return;
    }
    if (event.pointerType === "mouse" || (event.target as Element).closest("button,input")) return;
    const x = event.clientX - row.getBoundingClientRect().left;
    press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, shift: 0 };
    row.style.setProperty("--press-x", x + "px");
    row.style.setProperty("--press-shift", "0px");
    row.dataset.pressing = "true";
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = press.current;
    if (!active || event.pointerId !== active.id) return;
    const dx = event.clientX - active.x, dy = Math.abs(event.clientY - active.y);
    if (dy > 10 && dy > Math.abs(dx)) {
      release(event.currentTarget);
      return;
    }
    const shift = Math.round(Math.min(12, Math.max(-12, dx * 0.35)));
    if (shift !== active.shift) {
      active.shift = shift;
      event.currentTarget.style.setProperty("--press-shift", shift + "px");
    }
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
