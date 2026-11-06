"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { draftIsBusy, confirmDraftDiscard } from "./draft-guard";

import { ChartTransitionContext, useChartTransition, type ChartOrigin, type ChartTarget } from "./chart-transition-state";
import type { MetricTrendModel } from "./metric-trend-model";
import { TrendGlyph } from "./trend-glyph";

type Rect = { left: number; top: number; width: number; height: number };
type Flight = { id: number; model: MetricTrendModel; rect: Rect; direction: "forward" | "back"; landing: boolean; destination?: Rect; arrived?: boolean; ready?: boolean; animation?: Animation; hidden?: Element; deadline?: ReturnType<typeof setTimeout> };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rectOf = (element: SVGSVGElement): Rect => {
  // 嵌套 SVG 的 DOMRect 可能只包住非空数据，不能把缺测留白裁掉再放大。
  const matrix=element.getScreenCTM(), box=element.viewBox.baseVal;
  if(matrix&&box.width&&box.height){const a=new DOMPoint(box.x,box.y).matrixTransform(matrix),b=new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix);return {left:a.x,top:a.y,width:b.x-a.x,height:b.y-a.y};}
  const {left,top,width,height}=element.getBoundingClientRect();return {left,top,width,height};
};

/** 图层留在已认证的持久框架中，等真实目标就绪再交接，不延长请求或伪造数值。 */
export function ChartTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter(), pathname = usePathname(), [pending,startTransition] = useTransition();
  const [flight,setFlight] = useState<Flight|null>(null), active = useRef<Flight|null>(null), overlay = useRef<HTMLDivElement>(null);
  const serial = useRef(0), origin = useRef<ChartOrigin|null>(null), returning=useRef(false), target = useRef<ChartTarget|null>(null), route = useRef(pathname);
  const lastTarget=useRef<{model:MetricTrendModel;rect:Rect}|null>(null);

  const clear = useCallback(() => {
    const current=active.current;active.current=null;clearTimeout(current?.deadline);current?.animation?.cancel();current?.hidden?.removeAttribute("data-chart-travelling");
    document.documentElement.removeAttribute("data-chart-travel");setFlight(null);
  },[]);
  const finish = useCallback((current:Flight)=>{
    if(active.current?.id!==current.id)return;
    const back=current.direction==='back';clear();
    if(back){document.querySelector<HTMLElement>(`[data-metric-card="${current.model.kind}"]`)?.focus({preventScroll:true});origin.current=null;returning.current=false;}
  },[clear]);
  const land = useCallback((element: SVGSVGElement, skeleton=false) => {
    const current=active.current,node=overlay.current;if(!current||!node||!element.isConnected)return;
    const dest=rectOf(element);if(!dest.width||!dest.height)return;
    if(reduced()||typeof node.animate!=='function'){clear();return;}
    if(current.destination){
      const d=current.destination;
      // Same slot, new data: hand over without a second movement. A changed layout cancels the flight.
      if(Math.max(Math.abs(d.left-dest.left),Math.abs(d.top-dest.top),Math.abs(d.width-dest.width),Math.abs(d.height-dest.height))>1){clear();return;}
      current.hidden?.removeAttribute('data-chart-travelling');current.hidden=element;element.setAttribute('data-chart-travelling','true');
      if(!skeleton)current.ready=true;
      if(current.arrived&&current.ready)finish(current);return;
    }
    const scale=dest.width/current.rect.width;
    if(Math.abs(dest.height/current.rect.height-scale)>.035){clear();return;}
    current.destination=dest;current.landing=true;current.ready=!skeleton;current.hidden=element;element.setAttribute('data-chart-travelling','true');node.dataset.motionStarts='1';
    const animation=node.animate([{transform:'translate(0px,0px) scale(1)'},{transform:`translate(${dest.left-current.rect.left}px,${dest.top-current.rect.top}px) scale(${scale})`}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    current.animation=animation;
    void animation.finished.then(()=>{if(active.current?.id!==current.id)return;current.arrived=true;current.landing=false;if(current.ready)finish(current);}).catch(()=>{});
  },[clear,finish]);
  const start = useCallback((model:MetricTrendModel, source:SVGSVGElement|Rect, direction:Flight["direction"])=>{
    clear();const next:Flight={id:++serial.current,model,rect:source instanceof SVGSVGElement?rectOf(source):source,direction,landing:false};
    // 目标异常时退回正常导航反馈；不把悬空缩略图当成无限等待层。
    next.deadline=setTimeout(()=>{if(active.current?.id===next.id)clear();},8000);
    active.current=next;document.documentElement.setAttribute("data-chart-travel","active");setFlight(next);
  },[clear]);
  const register=useCallback((next:ChartTarget)=>{
    target.current=next;
    if(!next.skeleton)lastTarget.current={model:next.model,rect:rectOf(next.element)};
    const current=active.current;
    if(current?.direction==="forward"&&current.model.kind===next.kind)requestAnimationFrame(()=>land(next.element,next.skeleton));
    return ()=>{if(location.pathname==="/dashboard"&&next.element.isConnected)lastTarget.current={model:next.model,rect:rectOf(next.element)};else lastTarget.current=null;if(target.current?.element===next.element)target.current=null;};
  },[land]);
  const navigate=useCallback(async(href:string,model:MetricTrendModel,source:SVGSVGElement,rail:HTMLElement|null)=>{
    if(draftIsBusy()||!await confirmDraftDiscard())return;
    origin.current={kind:model.kind,destination:new URL(href,location.origin).pathname,scroll:window.scrollY,rail:rail?.scrollLeft??0};
    returning.current=false;
    if(!reduced()&&typeof Element.prototype.animate==="function"&&model.points.some(point=>point.value!==null))start(model,source,"forward");
    startTransition(()=>router.push(href));
  },[router,start]);
  const restore=useCallback((rail:HTMLElement)=>{
    const saved=origin.current;if(!saved)return;
    rail.scrollLeft=saved.rail;
    if(!returning.current)return;
    window.scrollTo({top:saved.scroll,behavior:"instant"});
    requestAnimationFrame(()=>{
      window.scrollTo({top:saved.scroll,behavior:"instant"});
      const graph=rail.querySelector<SVGSVGElement>(`[data-metric-card="${saved.kind}"] [data-trend-glyph]`);
      if(graph&&active.current?.direction==="back")land(graph);
      else {clear();rail.querySelector<HTMLElement>(`[data-metric-card="${saved.kind}"]`)?.focus({preventScroll:true});origin.current=null;returning.current=false;}
    });
  },[land,clear]);
  const prepareBack=useCallback(()=>{
    returning.current=!!origin.current;
    const dest=target.current, flying=active.current, node=overlay.current;
    if(origin.current&&flying&&node&&!reduced()){const {left,top,width,height}=node.getBoundingClientRect();start(flying.model,{left,top,width,height},"back");}
    else if(origin.current&&dest&&dest.kind===origin.current.kind&&!reduced())start(dest.model,dest.element,"back");
    else if(origin.current&&lastTarget.current?.model.kind===origin.current.kind&&!reduced())start(lastTarget.current.model,lastTarget.current.rect,"back");
    else clear();
  },[start,clear]);
  const back=useCallback(()=>{
    if(origin.current){
      // loading 边界提交后 React pending 可能已结束，但目标数据仍在流入。
      const waiting=pending||!!target.current?.skeleton||!!document.querySelector('.workspace-skeleton');
      prepareBack();startTransition(()=>{if(waiting)router.replace('/dashboard');else router.back();});
    }
    else startTransition(()=>router.push("/dashboard"));
  },[router,prepareBack,pending]);
  useEffect(()=>{
    const pop=()=>{if(location.pathname==="/dashboard"&&origin.current&&route.current!=="/dashboard")prepareBack();else clear();};
    const cancel=()=>clear();window.addEventListener("formward-record-saved",cancel);window.addEventListener("formward-record-context-stale",cancel);window.addEventListener("popstate",pop,true);window.addEventListener("resize",cancel);
    return()=>{window.removeEventListener("formward-record-saved",cancel);window.removeEventListener("formward-record-context-stale",cancel);window.removeEventListener("popstate",pop,true);window.removeEventListener("resize",cancel);};
  },[prepareBack,clear]);
  useEffect(()=>{const query=matchMedia("(prefers-reduced-motion: reduce)");const changed=()=>{if(query.matches)clear();};query.addEventListener("change",changed);return()=>query.removeEventListener("change",changed);},[clear]);
  useEffect(()=>{
    const changed=route.current!==pathname;route.current=pathname;
    if(changed&&origin.current&&pathname!=="/dashboard"&&pathname!==origin.current.destination){origin.current=null;lastTarget.current=null;returning.current=false;clear();}
    if(changed&&pathname==="/dashboard"&&origin.current&&!returning.current)prepareBack();
    if(pathname==="/dashboard"&&returning.current){const rail=document.querySelector<HTMLElement>("[data-metric-rail]");if(rail)restore(rail);}
    const current=active.current;
    if(changed&&current?.direction==="forward"&&!pathname.startsWith(`/dashboard/${current.model.kind==="intake"?"meals":current.model.kind==="morning-weight"?"measurements":"energy"}`))clear();
    // 真正结束的错误／登录／不支持的目标不能留下一张悬空图。
    if(!pending&&current&&!current.landing) {
      const frame=requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const live=active.current;if(!live||live.id!==current.id||live.landing)return;
        if(live.direction==="forward"&&target.current?.kind===live.model.kind)land(target.current.element,target.current.skeleton);
        // 专页还要等客户端尺寸与图形就绪；路由提交不等于目标已经可测量。
      }));return()=>cancelAnimationFrame(frame);
    }
  },[pathname,pending,clear,land,restore,prepareBack]);
  useEffect(()=>()=>{clearTimeout(active.current?.deadline);active.current?.animation?.cancel();active.current?.hidden?.removeAttribute("data-chart-travelling");document.documentElement.removeAttribute("data-chart-travel");},[]);
  const invalidate=useCallback(()=>{clear();target.current=null;lastTarget.current=null;},[clear]);
  const value=useMemo(()=>({navigate,register,restore,back,invalidate,preview:flight?.model??null}),[navigate,register,restore,back,invalidate,flight?.model]);
  return <ChartTransitionContext value={value}>{children}{flight&&createPortal(<div ref={overlay} className="chart-flight" data-chart-flight={flight.id} aria-hidden="true" style={{left:flight.rect.left,top:flight.rect.top,width:flight.rect.width,height:flight.rect.height}}><TrendGlyph model={flight.model}/></div>,document.body)}</ChartTransitionContext>;
}

export function TrendBackLink(){const {back}=useChartTransition();return <button type="button" className="trend-back-link" onClick={back}><span aria-hidden="true">←</span> 总览</button>;}
