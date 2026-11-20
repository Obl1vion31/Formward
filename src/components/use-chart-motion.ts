"use client";
import {useLayoutEffect,useRef,type RefObject} from "react";
import {useChartTransitionActions} from "./chart-transition-state";

export const chartZeroGrowthEasing = "cubic-bezier(.2,.65,.3,1)";
export const chartPointPhase = .3;
export const chartLineEasing = "ease-out";

const bodyDrawDuration = 600;
const pointDuration = bodyDrawDuration * chartPointPhase;

function growChartFromZero(node: HTMLElement, duration: number, reduced: MediaQueryList) {
 const animations = [...node.querySelectorAll<SVGGElement>("[data-chart-grow-from]")].map(layer => {
  layer.style.transformBox = "view-box";
  layer.style.transformOrigin = "0px " + layer.dataset.chartGrowFrom + "px";
  return layer.animate([{transform:"scaleY(0)"}, {transform:"scaleY(1)"}], {
   duration, easing:chartZeroGrowthEasing
  });
 });
 const [clock] = animations;
 if (!clock) return;
 let observer: IntersectionObserver | undefined;
 let finished = false;
 const finish = () => {
  if (finished) return;
  finished = true;
  observer?.disconnect();
  clock.removeEventListener("finish", finish);
  animations.forEach(animation => animation.cancel());
  node.removeEventListener("pointerdown", finish);
  node.removeEventListener("focusin", finish);
  node.removeEventListener("keydown", finish);
  reduced.removeEventListener("change", finish);
 };
 const bounds = node.getBoundingClientRect();
 if (typeof IntersectionObserver === "function" && (bounds.bottom <= 0 || bounds.top >= innerHeight)) {
  animations.forEach(animation => {
   animation.pause();
   animation.currentTime = 0;
  });
  observer = new IntersectionObserver(entries => {
   if (finished || !entries.some(entry => entry.isIntersecting)) return;
   observer?.disconnect();
   animations.forEach(animation => animation.play());
  });
  observer.observe(node);
 }
 clock.addEventListener("finish", finish, {once:true});
 node.addEventListener("pointerdown", finish);
 node.addEventListener("focusin", finish);
 node.addEventListener("keydown", finish);
 reduced.addEventListener("change", finish);
 return finish;
}

/** 真实数据首次到达或主动换区间时绘制；坐标、读数和命中区始终在最终位置。 */
export function useChartMotion(container:RefObject<HTMLElement|null>,changeKey:string,viewKey=changeKey,growthDuration?:number){
 const entered=useRef<string|null>(null),{claimChartEntry}=useChartTransitionActions();
 useLayoutEffect(()=>{
  const node=container.current;if(!node||changeKey==="pending")return;
  if(growthDuration!==undefined&&(!node.closest("[data-route-content]")||node.closest("[data-return-covered],[data-workspace-cached]")))return;
  const key=location.pathname+":"+viewKey,first=entered.current===null,changed=entered.current!==key;
  if(!changed)return;
  entered.current=key;
  const fresh=claimChartEntry(key,node),reduced=matchMedia("(prefers-reduced-motion: reduce)");
  if(node.closest("[data-chart-range-motion]")||reduced.matches||typeof Element.prototype.animate!=="function"||first&&(!fresh||node.closest('[data-linked-plot]')))return;
  if(growthDuration!==undefined)return growChartFromZero(node,growthDuration,reduced);
  const animations:Animation[]=[];
  for (const point of node.querySelectorAll<SVGElement>("[data-chart-point]")) {
   animations.push(point.animate([{opacity:0}, {opacity:1}], {
    duration:pointDuration, easing:chartZeroGrowthEasing, fill:"backwards",
   }));
  }
  for (const line of node.querySelectorAll<SVGLineElement>("[data-chart-line]")) {
   const matrix = line.getScreenCTM();
   const length = getComputedStyle(line).vectorEffect === "non-scaling-stroke" && matrix
    ? Math.hypot((line.x2.baseVal.value - line.x1.baseVal.value) * matrix.a, (line.y2.baseVal.value - line.y1.baseVal.value) * matrix.d)
    : line.getTotalLength();
   if (!length) continue;
   const dash = length + " " + length;
   animations.push(line.animate([
    {strokeDasharray:dash, strokeDashoffset:length, visibility:"hidden"},
    {strokeDasharray:dash, strokeDashoffset:0, visibility:"visible"},
   ], {delay:pointDuration, duration:bodyDrawDuration - pointDuration, easing:chartLineEasing, fill:"backwards"}));
  }
  for(const bar of node.querySelectorAll<SVGElement>("[data-chart-bar]")){
   bar.style.transformBox="view-box";bar.style.transformOrigin="0px "+(bar.getAttribute("data-chart-zero")??"0")+"px";
   animations.push(bar.animate([{transform:"scaleY(0)"},{transform:"scaleY(1)"}],{duration:400,easing:"cubic-bezier(.2,.65,.3,1)"}));
  }
  const cancel=()=>animations.forEach(animation=>animation.cancel());
  reduced.addEventListener("change",cancel);return()=>{cancel();reduced.removeEventListener("change",cancel);};
 },[container,changeKey,viewKey,claimChartEntry,growthDuration]);
}
