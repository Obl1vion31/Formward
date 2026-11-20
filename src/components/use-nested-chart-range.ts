"use client";

import {useCallback, useLayoutEffect, useRef} from "react";
import {chartLineEasing, chartPointPhase, chartZeroGrowthEasing} from "./use-chart-motion";

const svgNS = "http://www.w3.org/2000/svg";
const duration = 300;
const addedValuesDuration = 220;
const presets = new Set(["7", "30", "90"]);
const attributes = {
  line: ["x1", "y1", "x2", "y2"],
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  text: ["x", "y"],
};
type Shape = keyof typeof attributes;
type Mark = {element: SVGElement; shape: Shape; position: number[]; opacity: number; zero?: number; entry?: "point" | "line"};
type Marks = Map<string, Mark>;
type Range = {mode: string; from: string; to: string; series?: string};
type Progress = {expands: boolean; move: number; reveal: number; grow: number; point: number; line: number};
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
    const origin = element.closest<SVGElement>("[data-chart-grow-from]")?.dataset.chartGrowFrom
      ?? element.closest<SVGElement>("[data-chart-bar]")?.dataset.chartZero;
    const zero = origin === undefined ? undefined : Number(origin) * matrix.d + matrix.f - bounds.top;
    const entry = element.hasAttribute("data-chart-point") ? "point"
      : element.hasAttribute("data-chart-line") ? "line" : undefined;
    let opacity = Number(style.opacity);
    // 首次绘制中换档时，保留已经描出的长度。目标图的静态线没有描边动画。
    if (entry === "line" && style.strokeDasharray !== "none") {
      const length = parseFloat(style.strokeDasharray);
      const offset = parseFloat(style.strokeDashoffset);
      if (length > 0 && offset > 0) {
        const drawn = clampProgress(1 - offset / length);
        position[2] = position[0] + (position[2] - position[0]) * drawn;
        position[3] = position[1] + (position[3] - position[1]) * drawn;
        if (!drawn) opacity = 0;
        copy.style.strokeDasharray = "none";
      }
    }
    marks.set(key, {element: copy, shape, position, opacity, zero, entry});
  }
  return marks;
}

function paint(mark: Mark) {
  mark.element.style.opacity = String(mark.opacity);
  attributes[mark.shape].forEach((attribute, i) => mark.element.setAttribute(attribute, String(mark.position[i])));
}

const clampProgress = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => 1 - (1 - clampProgress(value)) ** 3;

function growMark(mark: Mark, zero: number, progress: number): Mark {
  const position = mark.position.slice();
  position[1] = zero + (position[1] - zero) * progress;
  if (mark.shape === "line") position[3] = zero + (position[3] - zero) * progress;
  else position[3] *= progress;
  if (mark.shape === "rect") position[5] *= progress;
  return {...mark, position, opacity: progress > 0 ? mark.opacity : 0};
}

function drawBetween(before: Mark | undefined, after: Mark | undefined, {expands, move, reveal, grow, point, line}: Progress) {
  if (!before && after) {
    if (expands && after.zero !== undefined && after.shape !== "text") return growMark(after, after.zero, grow);
    if (expands && after.entry === "point") return {...after, opacity: after.opacity * point};
    if (expands && after.entry === "line") {
      const [x1, y1, x2, y2] = after.position;
      return {...after, position: [x1, y1, x1 + (x2 - x1) * line, y1 + (y2 - y1) * line],
        opacity: line > 0 ? after.opacity : 0};
    }
    return {...after, opacity: after.opacity * (expands ? reveal : move)};
  }
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
    const snapshot = eligible ? running.current?.current ?? measureMarks(root) : null;
    const current = snapshot && new Map([...snapshot].filter(([, mark]) => mark.opacity > 0));
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
      const keys = [...new Set([...source.keys(), ...target.keys()])];
      const entering = [...target].filter(([key]) => !source.has(key)).map(([, mark]) => mark);
      const hasGrowth = expands && entering.some(mark => mark.zero !== undefined);
      const hasPoints = expands && entering.some(mark => mark.entry !== undefined);
      // 入场和换档使用相同的缓动。量出当前帧几何，供下一次换档接续。
      const timing = (easing: string) => typeof Animation === "function" && typeof KeyframeEffect === "function"
        ? new Animation(new KeyframeEffect(null, [], {duration: 1, easing, fill: "both"})) : null;
      const growthTiming = hasGrowth || hasPoints ? timing(chartZeroGrowthEasing) : null;
      const lineTiming = hasPoints ? timing(chartLineEasing) : null;
      const sample = (clock: Animation | null, progress: number) => {
        if (!clock) return ease(progress);
        clock.currentTime = clampProgress(progress);
        return clock.effect?.getComputedTiming().progress ?? ease(progress);
      };
      const total = hasGrowth || hasPoints ? duration * .6 + addedValuesDuration : duration;
      const revealStart = duration * .6 / total;
      motion.layer.replaceChildren(...keys.map(key => (target.get(key) ?? source.get(key))!.element));
      const startAt = performance.now();
      const frame = (now: number) => {
        if (running.current !== motion) return;
        const progress = clampProgress((now - startAt) / total);
        if (progress === 1) {
          motion.stop();
          return;
        }
        const revealProgress = expands ? (progress - revealStart) / (1 - revealStart) : progress / .36;
        const progressByMark: Progress = {
          expands,
          move: ease(expands ? progress / revealStart : (progress - .36) / .64),
          reveal: ease(revealProgress),
          grow: sample(growthTiming, revealProgress),
          point: sample(growthTiming, revealProgress / chartPointPhase),
          line: sample(lineTiming, (revealProgress - chartPointPhase) / (1 - chartPointPhase)),
        };
        const marks: Marks = new Map();
        for (const key of keys) {
          const mark = drawBetween(source.get(key), target.get(key), progressByMark);
          if (mark) {
            marks.set(key, mark);
            paint(mark);
          }
        }
        motion.current = marks;
        root.dataset.chartRangeMotion = expands
          ? progress < revealStart ? "moving" : "revealing"
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
