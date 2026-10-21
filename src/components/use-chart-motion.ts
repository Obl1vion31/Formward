"use client";
import { useEffect, useRef, type RefObject } from "react";

/** 只动画数据图形；坐标、读数与可点击区域保持最终位置。 */
export function useChartMotion(container: RefObject<HTMLElement | null>, changeKey: string) {
  const entered = useRef(false);
  useEffect(() => {
    const node = container.current;
    if (!node || changeKey === "pending") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animations: Animation[] = [], frame = 0;
    const cancel = () => { cancelAnimationFrame(frame); animations.forEach(animation => animation.cancel()); animations = []; };
    const run = () => {
      if (reduced.matches || typeof Element.prototype.animate !== "function") return;
      const duration = entered.current ? 200 : 450;
      entered.current = true;
      frame = requestAnimationFrame(() => {
        for (const element of node.querySelectorAll<SVGElement>("[data-chart-bar]")) {
          const origin = element.getAttribute("data-chart-zero") ?? "0";
          const frames = [{ transform: "scaleY(0)", transformOrigin: `0px ${origin}px` }, { transform: "scaleY(1)", transformOrigin: `0px ${origin}px` }];
          animations.push(element.animate(frames, { duration, easing: "cubic-bezier(.22,1,.36,1)" }));
        }
        for (const element of node.querySelectorAll<SVGElement>("[data-chart-line]")) animations.push(element.animate([{ opacity: 0, clipPath: "inset(0 100% 0 0)" }, { opacity: 1, clipPath: "inset(0 0 0 0)" }], { duration, easing: "ease-out" }));
      });
    };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); run(); } }, { threshold: .05 });
    observer.observe(node);
    const motionChanged = () => { if (reduced.matches) cancel(); };
    reduced.addEventListener("change", motionChanged);
    return () => { observer.disconnect(); reduced.removeEventListener("change", motionChanged); cancel(); };
  }, [container, changeKey]);
}
