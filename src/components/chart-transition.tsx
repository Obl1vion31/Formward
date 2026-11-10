"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal,flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { confirmDraftDiscard, draftIsBusy } from "./draft-guard";
import { ChartTransitionContext, type ChartOrigin, type ChartTarget, type OverviewViewState } from "./chart-transition-state";
import { createChartFlights, type ChartFlight, type ChartRect } from './chart-flight';
import { trendKey,trendRangeKey, type MetricTrendModel } from "./metric-trend-model";
import { TrendGlyph, detailStroke, detailRadius } from "./trend-glyph";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rectOf = (element: SVGSVGElement): ChartRect => {
  const matrix=element.getScreenCTM(),box=element.viewBox.baseVal;
  if(matrix&&box.width&&box.height){const a=new DOMPoint(box.x,box.y).matrixTransform(matrix),b=new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix);return{left:a.x,top:a.y,width:b.x-a.x,height:b.y-a.y};}
  const {left,top,width,height}=element.getBoundingClientRect();return{left,top,width,height};
};
const visible = (element: SVGSVGElement) => element.isConnected&&element.getClientRects().length>0&&rectOf(element).width>0&&rectOf(element).height>0;
const inViewport = (rect:ChartRect) => rect.top+rect.height>64&&rect.top<innerHeight-(matchMedia("(max-width:700px),(hover:none) and (pointer:coarse)").matches?88:0)&&rect.left+rect.width>0&&rect.left<innerWidth;

export function ChartTransitionProvider({ children }: { children: React.ReactNode }) {
  const router=useRouter(),pathname=usePathname(),[pending,startTransition]=useTransition();
  const [flight,setFlight]=useState<ChartFlight|null>(null),[returningToOverview,setReturningToOverview]=useState(false);
  const returnCancelled=useRef(false),returnReady=useRef(true);
  const [returnPreview,setReturnPreview]=useState<MetricTrendModel|null>(null);
  const motion=useRef(createChartFlights(next=>{
    if(next)document.documentElement.setAttribute('data-chart-travel','active');
    else document.documentElement.removeAttribute('data-chart-travel');
    setFlight(next);
  }));
  const focusAfterLoad=useRef<string|null>(null),origin=useRef<ChartOrigin|null>(null),target=useRef<ChartTarget|null>(null),route=useRef(pathname);
  // 持久认证布局按账号重建；这里只保留显示选项与本次转场快照，不维护跨页面健康查询缓存。
  const overview=useRef<OverviewViewState|null>(null),navigation=useRef(0),requested=useRef<string|null>(null);
  const recallOverview=useCallback(()=>overview.current,[]);
  const rememberOverview=useCallback((state:OverviewViewState)=>{overview.current=state;},[]);
  const lastTarget=useRef<{model:MetricTrendModel;rect:ChartRect;path:string}|null>(null);
  const overviewReady=useCallback(()=>{returnReady.current=true;setReturnPreview(null);setReturningToOverview(false);if(!motion.current.active)origin.current=null;},[motion]);
  const clear=useCallback(()=>{motion.current.clear();},[motion]);
  const finish=useCallback((current:ChartFlight)=>{
    if(!motion.current.clear(current.id))return;
    if(current.direction==='back'){
      const card=document.querySelector<HTMLElement>(`a[data-metric-card="${current.model.kind}"]`);
      if(card)card.focus({preventScroll:true});else focusAfterLoad.current=current.model.kind;
      if(returnReady.current)origin.current=null;motion.current.returning=false;lastTarget.current=null;
    }
  },[motion]);
  const landAt=useCallback((dest:ChartRect,element:SVGSVGElement|null,skeleton:boolean,id:number)=>{
    const current=motion.current.active,node=current?.node;
    if(!current||current.id!==id||!node||!dest.width||!dest.height)return;
    if(reduced()||typeof node.animate!=='function'){clear();return;}
    if(current.destination){
      const d=current.destination;
      if(Math.max(Math.abs(d.left-dest.left),Math.abs(d.top-dest.top),Math.abs(d.width-dest.width),Math.abs(d.height-dest.height))>1){clear();return;}
      motion.current.reveal(id,element);
      if(!skeleton)current.ready=true;
      if(current.arrived&&current.ready)finish(current);
      return;
    }
    const scale=dest.width/current.rect.width;
    if(Math.abs(dest.height/current.rect.height-scale)>.035){clear();return;}
    current.destination=dest;current.landing=true;current.ready=!skeleton;
    motion.current.reveal(id,element);
    // 来源图已在上一页面显示；目标落位后立即启动，不再等待一次额外的绘制帧。
    if(motion.current.active?.id!==id||!node.isConnected)return;
    node.setAttribute('data-motion-starts','1');
    if(current.model.kind==="morning-weight"){
      const count=current.model.points.length,forward=current.direction==='forward';
      const from=node.querySelector<SVGSVGElement>('[data-chart-glyph-layer="source"]'),to=node.querySelector<SVGSVGElement>('[data-chart-glyph-layer="destination"]');
      node.style.setProperty('--flight-stroke',((forward?detailStroke(count):1.25)/scale)+'px');
      node.style.setProperty('--flight-radius',(forward?detailRadius(count)/(dest.width/240):3.6)+'px');
      const options={duration:300,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards' as const};
      // 两张静态同坐标图层一起缩放并交接笔触；不再逐帧重画每条线和圆点。
      current.decorations=from&&to?[from.animate([{opacity:1},{opacity:0}],options),to.animate([{opacity:0},{opacity:1}],options)]:[];
    }

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
    if(!saved.paired||trendRangeKey(next.model)!==saved.rangeKey||trendKey(next.model)!==saved.modelKey){saved.paired=false;clear();return;}
    if(!visible(next.element))return;
    landAt(rectOf(next.element),next.element,!!next.skeleton,id);
  },[motion,landAt,clear]);
  const register=useCallback((next:ChartTarget)=>{
    target.current=next;
    if(origin.current&&location.pathname===origin.current.destination&&trendKey(next.model)!==origin.current.modelKey)origin.current.paired=false;
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
    if(requested.current===href&&motion.current.active?.direction==="forward")return;
    const intent=++navigation.current;
    if(draftIsBusy()||!await confirmDraftDiscard()||navigation.current!==intent||!source.isConnected)return;
    requested.current=href;setReturningToOverview(false);returnCancelled.current=false;setReturnPreview(null);
    const rect=rectOf(source);
    origin.current={kind:model.kind,destination:new URL(href,location.origin).pathname,scroll:scrollY,rail:rail?.scrollLeft??0,rangeKey:trendRangeKey(model),modelKey:trendKey(model),paired:true,rect,viewport:{width:innerWidth,height:innerHeight}};
    motion.current.returning=false;lastTarget.current=null;
    router.prefetch('/dashboard');
    if(!reduced()&&visible(source)&&typeof Element.prototype.animate==='function'&&model.points.some(point=>point.value!==null||point.segments?.length))motion.current.start(model,rect,'forward');
    startTransition(()=>router.push(href));
  },[router,motion]);
  const restore=useCallback((rail:HTMLElement)=>{
    if(focusAfterLoad.current&&!rail.hasAttribute("data-metric-rail-skeleton")){const card=rail.querySelector<HTMLElement>(`a[data-metric-card="${focusAfterLoad.current}"]`);if(document.activeElement===document.body||document.activeElement?.closest('a[href="/dashboard"]'))card?.focus({preventScroll:true});focusAfterLoad.current=null;}
    const saved=origin.current;if(!saved)return;
    rail.scrollLeft=saved.rail;
    if(motion.current.returning||!returnReady.current)window.scrollTo({top:saved.scroll,behavior:'instant'});
    if(!motion.current.returning)return;
    const current=motion.current.active;
    if(!current||current.direction!=='back'){motion.current.returning=false;return;}
    // 卡片在 layout effect 中已落位；先恢复再测量，同一帧交给浮层，避免额外等待一帧。
    const graph=rail.querySelector<SVGSVGElement>(`[data-metric-card="${saved.kind}"] [data-trend-glyph]`);
    if(graph&&visible(graph)&&graph.dataset.trendRange===saved.rangeKey&&graph.dataset.trendKey===saved.modelKey&&current?.direction==='back'&&motion.current.active?.id===current.id)landAt(rectOf(graph),graph,false,current.id);
    else{clear();rail.querySelector<HTMLElement>(`[data-metric-card="${saved.kind}"]`)?.focus({preventScroll:true});if(returnReady.current)origin.current=null;motion.current.returning=false;lastTarget.current=null;}
  },[motion,landAt,clear]);
  const prepareBack=useCallback(()=>{
    const saved=origin.current;if(!saved||motion.current.returning)return;
    setReturningToOverview(true);returnCancelled.current=false;returnReady.current=false;
    const current=motion.current.active,dest=target.current,cached=lastTarget.current;
    let source:{model:MetricTrendModel;rect:ChartRect}|null=null;
    if(saved.paired&&!reduced()&&saved.viewport.width===innerWidth&&saved.viewport.height===innerHeight){
      if(current?.direction==='forward'&&current.node&&trendRangeKey(current.model)===saved.rangeKey){const {left,top,width,height}=current.node.getBoundingClientRect();source={model:current.model,rect:{left,top,width,height}};}
      else if(dest){if(!dest.skeleton&&visible(dest.element)&&trendKey(dest.model)===saved.modelKey&&inViewport(rectOf(dest.element)))source={model:dest.model,rect:rectOf(dest.element)};}
      else if(cached?.path===saved.destination&&trendKey(cached.model)===saved.modelKey&&inViewport(cached.rect))source={model:cached.model,rect:cached.rect};
    }
    setReturnPreview(source?.model??null);
    motion.current.beginReturn(source);
  },[motion]);
  const back=useCallback(async()=>{
    if(returningToOverview&&!returnCancelled.current)return;
    const intent=++navigation.current;
    if(draftIsBusy()||!await confirmDraftDiscard()||navigation.current!==intent)return;
    // 点击确认后先提交持久返回外壳及图形目标，再启动可等待服务器的路由更新。
    flushSync(()=>{
      setReturningToOverview(true);returnCancelled.current=false;returnReady.current=false;
      if(origin.current&&!motion.current.returning)prepareBack();
    });
    startTransition(()=>router.push('/dashboard',{scroll:false}));
  },[router,motion,prepareBack,returningToOverview]);
  // 进入时接入实际目标；返回由恢复后的卡片或骨架目标接管。
  useLayoutEffect(()=>{
    const current=motion.current.active;
    if(!current||current.id!==flight?.id||!current.node)return;
    if(current.direction==='forward'&&target.current)land(target.current,current.id);
    if(current.direction==='back'){const rail=document.querySelector<HTMLElement>('[data-metric-rail]');if(rail)restore(rail);}
  },[flight?.id,returningToOverview,motion,land,landAt,restore]);
  useEffect(()=>{
    const pop=()=>{if(location.pathname==='/dashboard'&&origin.current&&route.current!=='/dashboard')prepareBack();else if(location.pathname!=='/dashboard'){returnCancelled.current=true;motion.current.returning=false;origin.current=null;overviewReady();clear();}};
    const cancel=()=>{if(origin.current)origin.current.paired=false;clear();lastTarget.current=null;};
    window.addEventListener('formward-record-saved',cancel);window.addEventListener('formward-record-context-stale',cancel);window.addEventListener('popstate',pop,true);window.addEventListener('resize',cancel);
    return()=>{window.removeEventListener('formward-record-saved',cancel);window.removeEventListener('formward-record-context-stale',cancel);window.removeEventListener('popstate',pop,true);window.removeEventListener('resize',cancel);};
  },[prepareBack,clear,motion,overviewReady]);
  useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>{if(query.matches)clear();};query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[clear]);
  useLayoutEffect(()=>{
    const changed=route.current!==pathname;route.current=pathname;if(changed){requested.current=null;if(pathname!=='/dashboard'&&returnCancelled.current)overviewReady();}
    if(changed&&origin.current&&pathname!=='/dashboard'&&pathname!==origin.current.destination){origin.current=null;lastTarget.current=null;motion.current.returning=false;clear();}
    if(changed&&pathname==='/dashboard'&&origin.current&&!motion.current.returning&&!returningToOverview)prepareBack();
    if(pathname==='/dashboard'&&motion.current.returning){const rail=document.querySelector<HTMLElement>('[data-metric-rail]');if(rail)restore(rail);}
    const current=motion.current.active;
    if(changed&&current?.direction==='forward'&&pathname!==origin.current?.destination)clear();
    if(current?.direction==='forward'&&!current.landing&&target.current){const next=target.current;const frame=requestAnimationFrame(()=>{if(target.current===next)land(next,current.id);});return()=>cancelAnimationFrame(frame);}
  },[pathname,pending,motion,clear,land,restore,prepareBack,overviewReady,returningToOverview]);
  useEffect(()=>()=>{motion.current.clear();},[motion]);
  const invalidate=useCallback(()=>{if(origin.current)origin.current.paired=false;clear();lastTarget.current=null;},[clear]);
  const cancelOverviewReturn=useCallback((href:string)=>{
    if(!returningToOverview)return;
    if(!returnCancelled.current){returnCancelled.current=true;setReturnPreview(null);navigation.current++;motion.current.returning=false;origin.current=null;lastTarget.current=null;clear();}
    if(new URL(href,location.origin).pathname===pathname)overviewReady();
  },[returningToOverview,pathname,motion,clear,overviewReady]);
  useEffect(()=>{
    if(!returningToOverview)return;
    const leave=(event:MouseEvent)=>{
      if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!(event.target instanceof Element))return;
      const link=event.target.closest<HTMLAnchorElement>('a[href]');if(!link||link.target==='_blank')return;
      const url=new URL(link.href,location.origin);
      if(url.origin===location.origin&&url.pathname!=='/dashboard')cancelOverviewReturn(url.href);
    };
    document.addEventListener('click',leave);return()=>document.removeEventListener('click',leave);
  },[returningToOverview,cancelOverviewReturn]);
  const value=useMemo(()=>({navigate,register,restore,back,invalidate,recallOverview,rememberOverview,returningToOverview,overviewReady,cancelOverviewReturn,preview:flight?.model??(returningToOverview?returnPreview:null)}),[navigate,register,restore,back,invalidate,recallOverview,rememberOverview,returningToOverview,overviewReady,cancelOverviewReturn,returnPreview,flight?.model]);
  return <ChartTransitionContext value={value}>{children}{flight&&createPortal(<div key={flight.id} className="chart-flight-layer"><div ref={node=>{if(node&&motion.current.active?.id===flight.id)motion.current.active.node=node;}} className="chart-flight" data-chart-flight={flight.id} data-chart-direction={flight.direction} aria-hidden="true" style={{left:flight.rect.left,top:flight.rect.top,width:flight.rect.width,height:flight.rect.height,visibility:'hidden'}}>{flight.model.kind==="morning-weight"?<><TrendGlyph flightLayer="source" model={flight.model} detail={flight.direction==="back"} width={flight.rect.width} height={flight.rect.height}/><TrendGlyph flightLayer="destination" model={flight.model} detail={flight.direction==="back"} width={flight.rect.width} height={flight.rect.height}/></>:<TrendGlyph model={flight.model} detail={flight.direction==="back"} width={flight.rect.width} height={flight.rect.height}/>}</div></div>,document.body)}</ChartTransitionContext>;
}
