"use client";

import {useCallback, useLayoutEffect, useRef} from "react";

const svgNS = "http://www.w3.org/2000/svg";
const duration = 300;
const presets = new Set(["7", "30", "90"]);
const attributes = {
  line: ["x1", "y1", "x2", "y2"],
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  text: ["x", "y"],
};
type Shape = keyof typeof attributes;
type Mark = {element: SVGElement; shape: Shape; position: number[]; opacity: number};
type Marks = Map<string, Mark>;
type Range = {mode: string; from: string; to: string; series?: string};
type Motion = {
  target: string;
  frame: number;
  layer: SVGSVGElement;
  current: Marks;
  reduce: MediaQueryList;
  stop: () => void;
};

export const isNestedChartPreset = (mode: string) => presets.has(mode.replace(/d$/, ""));

function measureMarks(root: HTMLElement): Marks {
  const bounds = root.getBoundingClientRect();
  const marks: Marks = new Map();
  for (const element of root.querySelectorAll<SVGGraphicsElement>("[data-range-mark]")) {
    const matrix = element.getScreenCTM(), key = element.dataset.rangeMark;
    if (!matrix || !key) continue;
    const style = getComputedStyle(element), tag = element.localName;
    const read = (name: string) => Number(element.getAttribute(name) ?? 0);
    const x = (name: string) => read(name) * matrix.a + matrix.e - bounds.left;
    const y = (name: string) => read(name) * matrix.d + matrix.f - bounds.top;
    const w = (name: string) => read(name) * matrix.a;
    const h = (name: string) => read(name) * matrix.d;
    const tagIsDot = tag === "ellipse" || tag === "circle";
    const shape = tagIsDot ? "ellipse" : tag === "rect" || tag === "text" ? tag : "line";
    let position: number[];
    switch (shape) {
      case "ellipse": position = [x("cx"), y("cy"), w(tag === "circle" ? "r" : "rx"), h(tag === "circle" ? "r" : "ry")]; break;
      case "rect": position = [x("x"), y("y"), w("width"), h("height"), w("rx"), h(element.hasAttribute("ry") ? "ry" : "rx")]; break;
      case "text": position = [x("x"), y("y")]; break;
      case "line": position = [x("x1"), y("y1"), x("x2"), y("y2")]; break;
    }
    const copy = document.createElementNS(svgNS, shape);
    copy.dataset.rangeCopy = key;
    copy.style.fill = style.fill;
    copy.style.stroke = style.stroke;
    copy.style.fillOpacity = style.fillOpacity;
    copy.style.strokeOpacity = style.strokeOpacity;
    copy.style.strokeLinecap = style.strokeLinecap;
    const strokeScale = style.vectorEffect === "non-scaling-stroke" ? 1 : Math.min(matrix.a, matrix.d);
    copy.style.strokeWidth = (parseFloat(style.strokeWidth) * strokeScale) + "px";
    copy.style.strokeDasharray = element.getAttribute("stroke-dasharray") ?? style.strokeDasharray;
    if (shape === "text") {
      copy.textContent = element.textContent;
      copy.style.textAnchor = style.textAnchor;
      copy.style.fontFamily = style.fontFamily;
      copy.style.fontWeight = style.fontWeight;
      copy.style.fontSize = parseFloat(style.fontSize) * matrix.d + "px";
    }
    marks.set(key, {element: copy, shape, position, opacity: Number(style.opacity)});
  }
  return marks;
}

function paint(mark: Mark) {
  mark.element.style.opacity = String(mark.opacity);
  attributes[mark.shape].forEach((attribute, i) => mark.element.setAttribute(attribute, String(mark.position[i])));
}

const ease = (value: number) => 1 - (1 - Math.max(0, Math.min(1, value))) ** 3;

function drawBetween(before: Mark | undefined, after: Mark | undefined, progress: number, expands: boolean) {
  const move = ease(expands ? progress / .6 : (progress - .36) / .64);
  const reveal = ease(expands ? (progress - .6) / .4 : progress / .36);
  if (!before && after) return {...after, opacity: after.opacity * (expands ? reveal : move)};
  if (before && !after) return {...before, opacity: before.opacity * (1 - (expands ? move : reveal))};
  if (!before || !after) return null;
  return {
    ...after,
    position: after.position.map((value, index) => before.position[index] + (value - before.position[index]) * move),
    opacity: before.opacity + (after.opacity - before.opacity) * move,
  };
}

/** 先排布共同日期，再显现较早日期。过渡图层只绘制，焦点及命中区来自正式图。 */
export function useNestedChartRange({mode, from, to, series}: Range) {
  const plot = useRef<HTMLDivElement | null>(null);
  const running = useRef<Motion | null>(null);
  const finish = useCallback(() => running.current?.stop(), []);
  const bindPlot = useCallback((node: HTMLDivElement | null) => {
    if (plot.current !== node) finish();
    plot.current = node;
  }, [finish]);
  const previous = useRef<Range>({mode, from, to, series});

  function prepare(next: string) {
    if (mode === next) return;
    const root = plot.current;
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const eligible = isNestedChartPreset(mode) && isNestedChartPreset(next) && !reduce.matches;
    const current = eligible ? running.current?.current ?? measureMarks(root) : null;
    running.current?.stop();
    if (!current?.size) return;

    const layer = document.createElementNS(svgNS, "svg");
    layer.setAttribute("aria-hidden", "true");
    layer.dataset.chartRangeLayer = "";
    root.dataset.chartRangeMotion = "ready";
    root.append(layer);
    for (const mark of current.values()) {
      layer.append(mark.element);
      paint(mark);
    }
    const stop = () => {
      if (running.current?.layer !== layer) return;
      cancelAnimationFrame(running.current.frame);
      running.current = null;
      layer.remove();
      delete root.dataset.chartRangeMotion;
      reduce.removeEventListener("change", stop);
    };
    running.current = {target: next, frame: 0, layer, current, reduce, stop};
    reduce.addEventListener("change", stop);
  }

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = {mode, from, to, series};
    const motion = running.current, root = plot.current;
    if (!root || !motion) return;
    if (motion.target !== mode || before.to !== to || from === before.from || series !== before.series) {
      motion.stop();
      return;
    }
    const source = motion.current, expands = from < before.from;
    let attempts = 0;
    const start = () => {
      if (running.current !== motion || motion.reduce.matches) return;
      // 7D 可能由居中的窄图切到全宽，也可能由另一种柱图实现接管。
      const chart = root.querySelector<SVGSVGElement>("svg[role=group]");
      const usable = chart && getComputedStyle(chart).visibility !== "hidden"
        && Math.abs(chart.clientWidth - chart.viewBox.baseVal.width) < 2;
      if (!usable && attempts++ < 2) {
        motion.frame = requestAnimationFrame(start);
        return;
      }
      const target = measureMarks(root);
      if (![...target.keys()].some(key => source.has(key))) {
        motion.stop();
        return;
      }
      const keys = [...new Set([...source.keys(), ...target.keys()])];
      motion.layer.replaceChildren(...keys.map(key => (target.get(key) ?? source.get(key))!.element));
      const startAt = performance.now();
      const frame = (now: number) => {
        if (running.current !== motion) return;
        const progress = Math.max(0, Math.min(1, (now - startAt) / duration));
        if (progress === 1) {
          motion.stop();
          return;
        }
        const marks: Marks = new Map();
        for (const key of keys) {
          const mark = drawBetween(source.get(key), target.get(key), progress, expands);
          if (mark) {
            marks.set(key, mark);
            paint(mark);
          }
        }
        motion.current = marks;
        root.dataset.chartRangeMotion = expands
          ? progress < .6 ? "moving" : "revealing"
          : progress < .36 ? "fading" : "moving";
        motion.frame = requestAnimationFrame(frame);
      };
      frame(startAt);
    };
    motion.frame = requestAnimationFrame(start);
  }, [mode, from, to, series]);

  useLayoutEffect(() => () => running.current?.stop(), []);
  return {bindPlot, prepare, finish};
}
