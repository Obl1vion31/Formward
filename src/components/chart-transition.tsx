"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { confirmDraftDiscard, draftIsBusy } from "./draft-guard";
import { ChartTransitionContext, useChartTransition, type ChartOrigin, type ChartTarget } from "./chart-transition-state";
import { createChartFlights, type ChartFlight, type ChartRect } from './chart-flight';
import { trendRangeKey, type MetricTrendModel } from "./metric-trend-model";
import { TrendGlyph } from "./trend-glyph";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rectOf = (element: SVGSVGElement): ChartRect => {
  const matrix=element.getScreenCTM(),box=element.viewBox.baseVal;
  if(matrix&&box.width&&box.height){const a=new DOMPoint(box.x,box.y).matrixTransform(matrix),b=new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix);return{left:a.x,top:a.y,width:b.x-a.x,height:b.y-a.y};}
  const {left,top,width,height}=element.getBoundingClientRect();return{left,top,width,height};
};
const visible = (element: SVGSVGElement) => element.isConnected&&element.getClientRects().length>0&&rectOf(element).width>0&&rectOf(element).height>0;
const inViewport = (rect:ChartRect) => rect.top+rect.height>64&&rect.top<innerHeight-88&&rect.left+rect.width>0&&rect.left<innerWidth;

export function ChartTransitionProvider({ children }: { children: React.ReactNode }) {
  const router=useRouter(),pathname=usePathname(),[pending,startTransition]=useTransition();
  const [flight,setFlight]=useState<ChartFlight|null>(null);
  const motion=useRef(createChartFlights(next=>{
    if(next)document.documentElement.setAttribute('data-chart-travel','active');
    else document.documentElement.removeAttribute('data-chart-travel');
    setFlight(next);
  }));
  const origin=useRef<ChartOrigin|null>(null),target=useRef<ChartTarget|null>(null),route=useRef(pathname);
  const lastTarget=useRef<{model:MetricTrendModel;rect:ChartRect;path:string}|null>(null);
  const clear=useCallback(()=>{motion.current.clear();},[motion]);
  const finish=useCallback((current:ChartFlight)=>{
    if(!motion.current.clear(current.id))return;
    if(current.direction==='back'){
      document.querySelector<HTMLElement>(`[data-metric-card="${current.model.kind}"]`)?.focus({preventScroll:true});
      origin.current=null;motion.current.returning=false;lastTarget.current=null;
    }
  },[motion]);
  const landAt=useCallback((dest:ChartRect,element:SVGSVGElement|null,skeleton:boolean,id:number)=>{
    const current=motion.current.active,node=current?.node;
    if(!current||current.id!==id||!node||!dest.width||!dest.height)return;
    if(reduced()||typeof node.animate!=='function'){clear();return;}
    if(current.destination){
      const d=current.destination;
      if(Math.max(Math.abs(d.left-dest.left),Math.abs(d.top-dest.top),Math.abs(d.width-dest.width),Math.abs(d.height-dest.height))>1){clear();return;}
      if(element){current.hidden?.removeAttribute('data-chart-travelling');current.hidden=element;element.setAttribute('data-chart-travelling','true');}
      if(!skeleton)current.ready=true;
      if(current.arrived&&current.ready)finish(current);
      return;
    }
    const scale=dest.width/current.rect.width;
    if(Math.abs(dest.height/current.rect.height-scale)>.035){clear();return;}
    current.destination=dest;current.landing=true;current.ready=!skeleton;
    if(element){current.hidden=element;element.setAttribute('data-chart-travelling','true');}
    node.setAttribute('data-motion-starts','1');node.style.setProperty('visibility','visible');
    current.animation=node.animate([{transform:'translate(0px,0px) scale(1)'},{transform:`translate(${dest.left-current.rect.left}px,${dest.top-current.rect.top}px) scale(${scale})`}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    void current.animation.finished.then(()=>{
      if(motion.current.active?.id!==id)return;
      current.arrived=true;current.landing=false;
      if(current.ready)finish(current);
    }).catch(()=>{});
  },[motion,clear,finish]);
  const land=useCallback((next:ChartTarget,id:number)=>{
    const current=motion.current.active,saved=origin.current;
    if(!current||current.id!==id||!saved||location.pathname!==saved.destination)return;
    if(trendRangeKey(next.model)!==saved.rangeKey){clear();return;}
    if(!visible(next.element))return;
    landAt(rectOf(next.element),next.element,!!next.skeleton,id);
  },[motion,landAt,clear]);
  const register=useCallback((next:ChartTarget)=>{
    target.current=next;
    if(!next.skeleton&&visible(next.element))lastTarget.current={model:next.model,rect:rectOf(next.element),path:location.pathname};
    const current=motion.current.active;
    if(current?.direction==='forward')requestAnimationFrame(()=>{if(target.current===next)land(next,current.id);});
    return()=>{
      // 旧骨架的清理不能撤销已经注册的新图形。
      if(target.current!==next)return;
      if(location.pathname==='/dashboard'&&!next.skeleton&&visible(next.element))lastTarget.current={model:next.model,rect:rectOf(next.element),path:origin.current?.destination??''};
      else lastTarget.current=null;
      target.current=null;
    };
  },[motion,land]);
  const navigate=useCallback(async(href:string,model:MetricTrendModel,source:SVGSVGElement,rail:HTMLElement|null)=>{
    if(draftIsBusy()||!await confirmDraftDiscard())return;
    const rect=rectOf(source);
    origin.current={kind:model.kind,destination:new URL(href,location.origin).pathname,scroll:scrollY,rail:rail?.scrollLeft??0,rangeKey:trendRangeKey(model),rect,viewport:{width:innerWidth,height:innerHeight}};
    motion.current.returning=false;lastTarget.current=null;
    if(!reduced()&&visible(source)&&typeof Element.prototype.animate==='function'&&model.points.some(point=>point.value!==null||point.segments?.length))motion.current.start(model,rect,'forward');
    startTransition(()=>router.push(href));
  },[router,motion]);
  const restore=useCallback((rail:HTMLElement)=>{
    const saved=origin.current;if(!saved)return;
    rail.scrollLeft=saved.rail;
    if(!motion.current.returning)return;
    window.scrollTo({top:saved.scroll,behavior:'instant'});
    const current=motion.current.active;
    requestAnimationFrame(()=>{
      if(origin.current!==saved||!motion.current.returning)return;
      window.scrollTo({top:saved.scroll,behavior:'instant'});
      const graph=rail.querySelector<SVGSVGElement>(`[data-metric-card="${saved.kind}"] [data-trend-glyph]`);
      if(graph&&visible(graph)&&graph.dataset.trendRange===saved.rangeKey&&current?.direction==='back'&&motion.current.active?.id===current.id)landAt(rectOf(graph),graph,false,current.id);
      else{clear();rail.querySelector<HTMLElement>(`[data-metric-card="${saved.kind}"]`)?.focus({preventScroll:true});origin.current=null;motion.current.returning=false;lastTarget.current=null;}
    });
  },[motion,landAt,clear]);
  const prepareBack=useCallback(()=>{
    const saved=origin.current;if(!saved||motion.current.returning)return;
    const current=motion.current.active,dest=target.current,cached=lastTarget.current;
    let source:{model:MetricTrendModel;rect:ChartRect}|null=null;
    if(!reduced()&&saved.viewport.width===innerWidth&&saved.viewport.height===innerHeight){
      if(current?.direction==='forward'&&current.node&&trendRangeKey(current.model)===saved.rangeKey){const {left,top,width,height}=current.node.getBoundingClientRect();source={model:current.model,rect:{left,top,width,height}};}
      else if(dest){if(!dest.skeleton&&visible(dest.element)&&trendRangeKey(dest.model)===saved.rangeKey&&inViewport(rectOf(dest.element)))source={model:dest.model,rect:rectOf(dest.element)};}
      else if(cached?.path===saved.destination&&trendRangeKey(cached.model)===saved.rangeKey&&inViewport(cached.rect))source={model:cached.model,rect:cached.rect};
    }
    motion.current.beginReturn(source);
  },[motion]);
  const back=useCallback(()=>{
    if(origin.current){
      if(motion.current.returning)return;
      const waiting=pending||!!target.current?.skeleton||!!document.querySelector('.workspace-skeleton');
      prepareBack();startTransition(()=>{if(waiting)router.replace('/dashboard');else router.back();});
    }else startTransition(()=>router.push('/dashboard'));
  },[router,pending,motion,prepareBack]);
  // 已知的来源坐标让回缩立即开始，不等总览数据到达后才在页面下方重现大图。
  useLayoutEffect(()=>{
    const current=motion.current.active,saved=origin.current;
    if(!current||current.id!==flight?.id||!current.node)return;
    if(current.direction==='back'&&saved)landAt(saved.rect,null,true,current.id);
    else if(target.current)land(target.current,current.id);
  },[flight?.id,motion,land,landAt]);
  useEffect(()=>{
    const pop=()=>{if(location.pathname==='/dashboard'&&origin.current&&route.current!=='/dashboard')prepareBack();else if(location.pathname!=='/dashboard')clear();};
    const cancel=()=>{clear();target.current=null;lastTarget.current=null;};
    window.addEventListener('formward-record-saved',cancel);window.addEventListener('formward-record-context-stale',cancel);window.addEventListener('popstate',pop,true);window.addEventListener('resize',cancel);
    return()=>{window.removeEventListener('formward-record-saved',cancel);window.removeEventListener('formward-record-context-stale',cancel);window.removeEventListener('popstate',pop,true);window.removeEventListener('resize',cancel);};
  },[prepareBack,clear]);
  useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>{if(query.matches)clear();};query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[clear]);
  useLayoutEffect(()=>{
    const changed=route.current!==pathname;route.current=pathname;
    if(changed&&origin.current&&pathname!=='/dashboard'&&pathname!==origin.current.destination){origin.current=null;lastTarget.current=null;motion.current.returning=false;clear();}
    if(changed&&pathname==='/dashboard'&&origin.current&&!motion.current.returning)prepareBack();
    if(pathname==='/dashboard'&&motion.current.returning){const rail=document.querySelector<HTMLElement>('[data-metric-rail]');if(rail)restore(rail);}
    const current=motion.current.active;
    if(changed&&current?.direction==='forward'&&pathname!==origin.current?.destination)clear();
    if(current?.direction==='forward'&&!current.landing&&target.current){const next=target.current;const frame=requestAnimationFrame(()=>{if(target.current===next)land(next,current.id);});return()=>cancelAnimationFrame(frame);}
  },[pathname,pending,motion,clear,land,restore,prepareBack]);
  useEffect(()=>()=>{motion.current.clear();},[motion]);
  const invalidate=useCallback(()=>{clear();target.current=null;lastTarget.current=null;},[clear]);
  const value=useMemo(()=>({navigate,register,restore,back,invalidate,preview:flight?.model??null}),[navigate,register,restore,back,invalidate,flight?.model]);
  return <ChartTransitionContext value={value}>{children}{flight&&createPortal(<div key={flight.id} className="chart-flight-layer"><div ref={node=>{if(node&&motion.current.active?.id===flight.id)motion.current.active.node=node;}} className="chart-flight" data-chart-flight={flight.id} data-chart-direction={flight.direction} aria-hidden="true" style={{left:flight.rect.left,top:flight.rect.top,width:flight.rect.width,height:flight.rect.height,visibility:'hidden'}}><TrendGlyph model={flight.model}/></div></div>,document.body)}</ChartTransitionContext>;
}

export function TrendBackLink(){const {back}=useChartTransition();return <button type="button" className="trend-back-link" onClick={back}><span aria-hidden="true">←</span> 总览</button>;}
