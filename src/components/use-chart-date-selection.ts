"use client";
import { useEffect, useId, useState, type KeyboardEvent } from "react";

/** 只维护查看日期，不写入业务记录。四页共用预览、固定及解除。 */
export function useChartDateSelection(dates: string[], initial: string, fallback = initial, previewPaused = false) {
  const regionId=useId();
  const [committed, setCommitted] = useState(initial), [hovered, setHovered] = useState<string|null>(null), [fixed, setFixed] = useState<string|null>(null);
  const rangeKey = dates.join("|"), validPin = fixed !== null && dates.includes(fixed) ? fixed : null;
  const selected = [validPin, hovered, committed, fallback, dates.at(-1)].find(date => date != null && dates.includes(date)) ?? fallback;
  const [previousRange,setPreviousRange]=useState(rangeKey);
  if(previousRange!==rangeKey){setPreviousRange(rangeKey);setHovered(null);if(fixed&&!dates.includes(fixed)){setFixed(null);setCommitted(fallback);}}
  const release = () => { setFixed(null); setHovered(null); };
  useEffect(() => {
    if (!validPin) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-chart-controls], [data-overview-range-controls], dialog")) return;
      if (event.target instanceof Element && event.target.closest("[data-chart-selection]")?.getAttribute("data-chart-selection")!==regionId) release();
    };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") release(); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [validPin,regionId]);
  const choose = (date: string) => { setCommitted(date); setHovered(null); if (validPin) setFixed(date); };
  const pin = (date: string) => { setCommitted(date); setHovered(null); setFixed(date); };
  const preview = (date: string) => { if (!validPin&&!previewPaused) setHovered(date); };
  const keyDown = (event: KeyboardEvent<SVGGElement>, date: string) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pin(date); return; }
    if (event.key === "Escape") { event.preventDefault(); release(); return; }
    const nodes = [...(event.currentTarget.ownerSVGElement?.querySelectorAll<SVGGElement>("[data-chart-date]") ?? [])];
    const index = nodes.indexOf(event.currentTarget), next = event.key === "ArrowLeft" ? index-1 : event.key === "ArrowRight" ? index+1 : event.key === "Home" ? 0 : event.key === "End" ? nodes.length-1 : null;
    if (next !== null) { event.preventDefault(); const node=nodes[Math.max(0,Math.min(nodes.length-1,next))]; if(node){choose(node.dataset.chartDate!);node.focus();} }
  };
  return {regionId, selected, pinned:validPin, choose, pin, preview, release, leave:()=>setHovered(null), keyDown};
}
