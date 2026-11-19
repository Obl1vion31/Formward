"use client";
import {useLayoutEffect,useRef,type RefObject} from "react";
import {useChartTransitionActions} from "./chart-transition-state";

export const chartZeroGrowthEasing = "cubic-bezier(.2,.65,.3,1)";

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
  if(node.closest("[data-chart-range-motion]")||reduced.matches||typeof Element.prototype.animate!=="function"||first&&(!fresh||node.closest('[data-shared-route]')))return;
  if(growthDuration!==undefined)return growChartFromZero(node,growthDuration,reduced);
  const animations:Animation[]=[];
  const lineGroups=node.querySelectorAll<SVGElement>('[data-trend-glyph="morning-weight"]');
  for(const glyph of lineGroups)animations.push(glyph.animate([{clipPath:"inset(-8px 100% -8px -8px)"},{clipPath:"inset(-8px -8px -8px -8px)"}],{duration:600,easing:"cubic-bezier(.2,.65,.3,1)"}));
  for(const element of node.querySelectorAll<SVGElement>("[data-chart-line]")){
   if(element.closest('[data-trend-glyph="morning-weight"]'))continue;
   const length=element instanceof SVGGeometryElement?element.getTotalLength():0;
   if(length)animations.push(element.animate([{strokeDasharray:String(length),strokeDashoffset:length},{strokeDasharray:String(length),strokeDashoffset:0}],{duration:600,easing:"ease-out"}));
  }
  for(const bar of node.querySelectorAll<SVGElement>("[data-chart-bar]")){
   bar.style.transformBox="view-box";bar.style.transformOrigin="0px "+(bar.getAttribute("data-chart-zero")??"0")+"px";
   animations.push(bar.animate([{transform:"scaleY(0)"},{transform:"scaleY(1)"}],{duration:400,easing:"cubic-bezier(.2,.65,.3,1)"}));
  }
  const cancel=()=>animations.forEach(animation=>animation.cancel());
  reduced.addEventListener("change",cancel);return()=>{cancel();reduced.removeEventListener("change",cancel);};
 },[container,changeKey,viewKey,claimChartEntry,growthDuration]);
}
