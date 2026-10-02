"use client";

import { useEffect } from "react";
import type { TargetProgress } from "./home-timeline";

// 越小越容易触发；阈值只影响方向判断，不影响 425ms 播放速度。
const WHEEL_THRESHOLD_PX = 44;
const TOUCH_THRESHOLD_PX = 40;
const GESTURE_GAP_MS = 250;

// 手势只选择目标端点，永远不把滚动距离传给动画。
export function listenForDirectionIntent(onIntent: (target: TargetProgress) => void): () => void {
  const target = window;
  let wheelDelta = 0;
  let wheelDirection = 0;
  let wheelTriggered = false;
  let lastWheelAt = -Infinity;
  let touch: { id: number; x: number; y: number; delta: number; horizontal: number; direction: number; triggeredDirection: number } | null = null;

  function onWheel(event: WheelEvent) {
    // 排除触控板缩放与以横向为主的滚动，不阻止浏览器自己的页面滚动。
    if (event.ctrlKey || event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const direction = Math.sign(event.deltaY);
    if (event.timeStamp - lastWheelAt > GESTURE_GAP_MS || direction !== wheelDirection) {
      // 间隔过长视为新手势，换方向则重新累计，防止上一方向的数值误触发。
      wheelDelta = 0;
      wheelTriggered = false;
    }
    lastWheelAt = event.timeStamp;
    wheelDirection = direction;
    // WheelEvent 可能按像素、行或页报告距离；先统一成近似像素再比较阈值。
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.innerHeight : 1;
    wheelDelta += Math.abs(event.deltaY) * unit;
    if (!wheelTriggered && wheelDelta >= WHEEL_THRESHOLD_PX) {
      // 同一组同向事件只发一次意图；时间线还会再次防止同向输入重启。
      wheelTriggered = true;
      onIntent(direction > 0 ? 1 : 0);
    }
  }

  function onTouchStart(event: TouchEvent) {
    // 只跟踪一个手指；identifier 防止中途把另一根手指当作原手指。
    if (event.touches.length !== 1) {
      touch = null;
      return;
    }
    const point = event.touches[0];
    touch = { id: point.identifier, x: point.clientX, y: point.clientY, delta: 0, horizontal: 0, direction: 0, triggeredDirection: 0 };
  }

  function readTouch(point: Touch) {
    if (!touch || point.identifier !== touch.id) return;
    // 屏幕坐标向下为正；旧 y − 新 y > 0 表示手指上滑，触发转身到背面。
    const delta = touch.y - point.clientY;
    const horizontal = point.clientX - touch.x;
    touch.x = point.clientX;
    touch.y = point.clientY;
    if (delta === 0) return;
    const direction = Math.sign(delta);
    if (direction !== touch.direction) {
      // 同一次触摸也能反向，不要求先松手；换方向后从零累计移动距离。
      touch.delta = 0;
      touch.horizontal = 0;
    }
    touch.direction = direction;
    touch.delta += Math.abs(delta);
    touch.horizontal += Math.abs(horizontal);
    if (touch.delta >= TOUCH_THRESHOLD_PX && touch.delta > touch.horizontal && direction !== touch.triggeredDirection) {
      // 纵向累计必须大于横向累计，避免把左右滑动当作进入登录。
      touch.triggeredDirection = direction;
      onIntent(direction > 0 ? 1 : 0);
    }
  }

  function onTouchMove(event: TouchEvent) {
    if (event.touches.length !== 1) {
      touch = null;
      return;
    }
    readTouch(event.touches[0]);
  }

  function onTouchEnd(event: TouchEvent) {
    // 某些设备最后一小段移动只出现在 touchend，结束时也补读一次。
    const point = Array.from(event.changedTouches).find((point) => point.identifier === touch?.id);
    if (point) readTouch(point);
    touch = null;
  }

  function onTouchCancel() {
    touch = null;
  }

  function onKeyDown(event: KeyboardEvent) {
    // 保留输入框、按钮、可编辑区域和快捷键的默认行为，避免打字触发转身。
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, button, [contenteditable]")) return;
    if (["ArrowDown", "PageDown", "End"].includes(event.key) || (event.key === " " && !event.shiftKey)) onIntent(1);
    if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) onIntent(0);
  }

  // passive 表示这里不调用 preventDefault；清理函数必须移除同一批回调。
  target.addEventListener("wheel", onWheel, { passive: true });
  target.addEventListener("touchstart", onTouchStart, { passive: true });
  target.addEventListener("touchmove", onTouchMove, { passive: true });
  target.addEventListener("touchend", onTouchEnd, { passive: true });
  target.addEventListener("touchcancel", onTouchCancel, { passive: true });
  target.addEventListener("keydown", onKeyDown);
  return () => {
    target.removeEventListener("wheel", onWheel);
    target.removeEventListener("touchstart", onTouchStart);
    target.removeEventListener("touchmove", onTouchMove);
    target.removeEventListener("touchend", onTouchEnd);
    target.removeEventListener("touchcancel", onTouchCancel);
    target.removeEventListener("keydown", onKeyDown);
  };
}

export function useDirectionTrigger(onIntent: (target: TargetProgress) => void, enabled: boolean) {
  // Hook 只负责与 React 生命周期连接；纯监听函数也能被 Node 单元测试直接调用。
  // enabled 在最终过渡开始后变为 false，React 执行上一次 effect 的清理函数。
  useEffect(() => {
    if (!enabled) return;
    return listenForDirectionIntent(onIntent);
  }, [enabled, onIntent]);
}
