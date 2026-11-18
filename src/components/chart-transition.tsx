"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal,flushSync } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { confirmDraftDiscard, draftIsBusy } from "./draft-guard";
import { ChartTransitionContext, ChartTransitionActionsContext, matchingChartReadings, forwardedChartReadings, chartDestinationSearch, chartDestinationMatches, type ChartReadingsSnapshot, type ChartOrigin, type ChartTarget, type OverviewViewState } from "./chart-transition-state";
import { createChartFlights, chartModelMatches, chartRectMatches, type ChartFlight, type ChartRect } from './chart-flight';
import { trendKey,trendRangeKey, type MetricTrendModel } from "./metric-trend-model";
import { TrendGlyph, detailStroke, detailRadius } from "./trend-glyph";
import {prepareChartFlightBitmap} from './chart-flight-bitmap';

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rectOf = (element: SVGSVGElement): ChartRect => {
  const matrix=element.getScreenCTM(),box=element.viewBox.baseVal;
  if(matrix&&box.width&&box.height){const a=new DOMPoint(box.x,box.y).matrixTransform(matrix),b=new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix);return{left:a.x,top:a.y,width:b.x-a.x,height:b.y-a.y};}
  const {left,top,width,height}=element.getBoundingClientRect();return{left,top,width,height};
};
const visible = (element: SVGSVGElement) => {
  if(!element.isConnected||element.closest('[data-return-covered],[data-return-prepared]')||!element.getClientRects().length)return false;
  const rect=rectOf(element);return rect.width>0&&rect.height>0;
};
const inViewport = (rect:ChartRect) => rect.top+rect.height>64&&rect.top<innerHeight-(matchMedia("(max-width:700px),(hover:none) and (pointer:coarse)").matches?88:0)&&rect.left+rect.width>0&&rect.left<innerWidth;

export function ChartTransitionProvider({ children }: { children: React.ReactNode }) {
  const router=useRouter(),pathname=usePathname(),search=useSearchParams().toString(),[pending,startTransition]=useTransition();
  const [flight,setFlight]=useState<ChartFlight|null>(null),[returningToOverview,setReturningToOverview]=useState(false);
  const [forwardChartMoving,setForwardChartMoving]=useState(false);
  const returnCancelled=useRef(false),returnReady=useRef(true),returnFromHistory=useRef(false),returnFocusUntouched=useRef(true),focusFrame=useRef(0);
  const [returnPreview,setReturnPreview]=useState<MetricTrendModel|null>(null),[previewReadings,setPreviewReadings]=useState<ChartReadingsSnapshot|null>(null),[forwardPreview,setForwardPreview]=useState<MetricTrendModel|null>(null),[forwardDestination,setForwardDestination]=useState<string|null>(null);
  const origin=useRef<ChartOrigin|null>(null);
  const motion=useRef(createChartFlights((next,reason)=>{
    if(next)document.documentElement.setAttribute('data-chart-travel','active');
    else document.documentElement.removeAttribute('data-chart-travel');
    if(!next||next.direction==='back')setForwardChartMoving(false);
    if(next?.direction==='back'||!next&&reason!=='timeout'){setPreviewReadings(null);setForwardPreview(null);setForwardDestination(null);}setFlight(next);
  }));
  const claimChartEntry=useCallback((key:string,container?:HTMLElement|null)=>motion.current.claimEntry(key,container),[]);
  const focusAfterLoad=useRef<{kind:string;rail:number;scroll:number}|null>(null),target=useRef<ChartTarget|null>(null),route=useRef(pathname);
  // 持久认证布局按账号重建；这里只保留显示选项与本次转场快照，不维护跨页面健康查询缓存。
  const overview=useRef<OverviewViewState|null>(null),navigation=useRef(0),requested=useRef<string|null>(null);
  const focusReturnCard=useCallback((card:HTMLElement|null)=>{if(!card||!returnFocusUntouched.current)return;const intent=navigation.current;card.focus({preventScroll:true});cancelAnimationFrame(focusFrame.current);focusFrame.current=requestAnimationFrame(()=>{focusFrame.current=0;if(intent===navigation.current&&returnFocusUntouched.current&&card.isConnected&&location.pathname==='/dashboard')card.focus({preventScroll:true});});},[]);
  const recallOverview=useCallback(()=>overview.current,[]);
  const rememberOverview=useCallback((state:OverviewViewState)=>{overview.current=state;},[]);
  const lastTarget=useRef<{model:MetricTrendModel;rect:ChartRect;path:string}|null>(null);
  const overviewReady=useCallback(()=>{returnReady.current=true;if(motion.current.active?.direction==='back')return;setReturnPreview(null);setReturningToOverview(false);},[]);
  // 数据读取与图形回程独立完成；两者均完成后才交出稳定的缓存外壳。
  useLayoutEffect(()=>{if(returningToOverview&&!flight&&returnReady.current)overviewReady();},[flight,returningToOverview,overviewReady]);
  const clear=useCallback(()=>{setForwardDestination(null);motion.current.clear();},[motion]);
  const finish=useCallback((current:ChartFlight)=>{
    if(!motion.current.complete(current.id))return;
    if(current.direction==='back'){
      const saved=origin.current;
      if(saved)focusAfterLoad.current={kind:current.model.kind,rail:saved.rail,scroll:saved.scroll};
      const card=[...document.querySelectorAll<HTMLElement>(`a[data-metric-card="${current.model.kind}"]`)].find(node=>node.getClientRects().length>0&&!node.closest('[data-return-covered],[inert]'));
      focusReturnCard(card??null);
      if(returnReady.current)origin.current=null;motion.current.returning=false;lastTarget.current=null;
    }
  },[motion,focusReturnCard]);
  const landAt=useCallback((dest:ChartRect,element:SVGSVGElement|null,skeleton:boolean,id:number)=>{
    const current=motion.current.active,node=current?.node;
    if(!current||current.id!==id||!node||!dest.width||!dest.height)return;
    if(reduced()||typeof node.animate!=='function'){clear();return;}
    if(current.destination){
      const d=current.destination;
      if(!chartRectMatches(d,dest)){clear();return;}
      motion.current.reveal(id,element);
      if(!skeleton)current.ready=true;
      if(current.arrived&&current.ready)finish(current);
      return;
    }
    const scale=dest.width/current.rect.width,scaleY=dest.height/current.rect.height;
    current.destination=dest;current.landing=true;current.ready=!skeleton;
    motion.current.reveal(id,element);
    if(current.model.kind==="morning-weight"){
      const count=current.model.points.length,forward=current.direction==='forward';
      const to=node.querySelector<SVGSVGElement>('[data-chart-glyph-layer="destination"]');
      node.style.setProperty('--flight-stroke',((forward?detailStroke(count):1.25)/scale)+'px');
      to?.querySelectorAll<SVGEllipseElement>('[data-glyph-point]').forEach(point=>{
        point.setAttribute('rx',String(forward?detailRadius()/(dest.width/240):3.6));
        point.setAttribute('ry',String(forward?detailRadius()/(dest.height/120):3.6));
      });
    }
    const begin=()=>{
    if(motion.current.active?.id!==id||!node.isConnected)return;
    node.setAttribute('data-motion-starts','1');
    if(current.model.kind==='morning-weight'){
      const from=node.querySelector<HTMLElement>('[data-flight-bitmap][data-chart-glyph-layer="source"]')??node.querySelector<SVGSVGElement>('[data-chart-glyph-layer="source"]'),to=node.querySelector<HTMLElement>('[data-flight-bitmap][data-chart-glyph-layer="destination"]')??node.querySelector<SVGSVGElement>('[data-chart-glyph-layer="destination"]');
      const options={duration:300,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards' as const};
      current.decorations=from&&to?[from.animate([{opacity:1},{opacity:0}],options),to.animate([{opacity:0},{opacity:1}],options)]:[];
    }
    current.animation=node.animate([{transform:'translate(0px,0px) scale(1)'},{transform:`translate(${dest.left-current.rect.left}px,${dest.top-current.rect.top}px) scale(${scale},${scaleY})`}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    if(current.direction==='forward'){
      // 先让动画本身的起点完成合成，再开始计时。仅提前绘制静态SVG／canvas
      // 不能保证浏览器已准备动画图层，冷导航时会把300ms消耗在首帧栅格化中。
      const animation=current.animation,animations=[animation,...current.decorations??[]];
      for(const item of animations){item.pause();item.currentTime=0;}
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(motion.current.active?.id!==id||current.animation!==animation||!node.isConnected)return;
        animations.forEach(item=>item.play());
      }));
    }
    void current.animation.finished.then(()=>{
      if(motion.current.active?.id!==id)return;
      current.arrived=true;current.landing=false;
      if(current.direction==='forward')setForwardChartMoving(false);
      if(current.ready)finish(current);
    }).catch(()=>{});
    };
    // 返回沿用已发布的同步SVG收束；放大所需的纹理准备不能延迟原本可立即开始的回程。
    if(current.direction==='back'&&!returnFromHistory.current){begin();return;}
    // 历史返回可能与路由恢复在同一次popstate提交中；和前进放大一样，等实际图层可绘制再计时。
    // 页面读取与导航照常执行，稳定的来源图形在准备期间保持可见。
    requestAnimationFrame(async()=>{
      if(motion.current.active?.id!==id||!node.isConnected)return;
      await prepareChartFlightBitmap(node,dest);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      begin();
    });
  },[motion,clear,finish]);
  const land=useCallback((next:ChartTarget,id:number)=>{
    const current=motion.current.active,saved=origin.current;
    if(!current||current.id!==id||!saved||location.pathname!==saved.destination&&(!requested.current||!chartDestinationMatches(saved,requested.current)))return;
    if(!saved.paired||!chartDestinationMatches(saved,location.href)&&(!requested.current||!chartDestinationMatches(saved,requested.current))||!chartModelMatches(saved,next.model)){saved.paired=false;clear();return;}
    if(!visible(next.element))return;
    landAt(rectOf(next.element),next.element,!!next.skeleton,id);
  },[motion,landAt,clear]);
  const register=useCallback((next:ChartTarget)=>{
    // 设备接管时隐藏分支不能抢走可见图形的转场所有权。
    if(!visible(next.element)||next.skeleton&&next.element.closest('[data-forward-covered]'))return ()=>{};
    target.current=next;
    const saved=origin.current;
    if(saved&&location.pathname===saved.destination&&(!chartDestinationMatches(saved,location.href)||!chartModelMatches(saved,next.model))){saved.paired=false;clear();}
    if(!next.skeleton&&visible(next.element))lastTarget.current={model:next.model,rect:rectOf(next.element),path:location.pathname};
    if(!next.skeleton&&saved&&location.pathname===saved.destination)setForwardDestination(null);
    const current=motion.current.active;
    if(current?.direction==='forward')land(next,current.id);
    else if(motion.current.handoff&&saved?.paired&&chartDestinationMatches(saved,location.href))motion.current.acceptHandoff(motion.current.handoff.id,{model:next.model,element:next.element,rect:rectOf(next.element),skeleton:next.skeleton});
    return()=>{
      // 旧骨架的清理不能撤销已经注册的新图形。
      if(target.current!==next)return;
      if(location.pathname==='/dashboard'&&!next.skeleton&&visible(next.element))lastTarget.current={model:next.model,rect:rectOf(next.element),path:origin.current?.destination??''};
      else lastTarget.current=null;
      target.current=null;
    };
  },[motion,land,clear]);
  const navigate=useCallback(async(href:string,model:MetricTrendModel,source:SVGSVGElement,rail:HTMLElement|null,readings?:ChartReadingsSnapshot)=>{
    if(requested.current===href&&motion.current.active?.direction==="forward")return;
    const intent=++navigation.current;
    if(draftIsBusy()||!await confirmDraftDiscard()||navigation.current!==intent||!source.isConnected)return;
    motion.current.clear();
    focusAfterLoad.current=null;
    requested.current=href;setReturningToOverview(false);returnCancelled.current=false;setReturnPreview(null);setPreviewReadings(null);setForwardPreview(null);
    const rect=rectOf(source),destination=new URL(href,location.origin);
    origin.current={destinationSearch:chartDestinationSearch(destination.search),readings:matchingChartReadings(readings,model.kind,href),kind:model.kind,destination:destination.pathname,scroll:scrollY,rail:rail?.scrollLeft??0,rangeKey:trendRangeKey(model),modelKey:trendKey(model),paired:true,rect,viewport:{width:innerWidth,height:innerHeight}};
    motion.current.returning=false;lastTarget.current=null;
    router.prefetch('/dashboard');
    const animated=!reduced()&&visible(source)&&typeof Element.prototype.animate==='function'&&model.points.some(point=>point.value!==null||point.segments?.length);
    flushSync(()=>{window.scrollTo({top:0,behavior:'instant'});setForwardDestination(href);if(animated){const next=motion.current.start(model,rect,'forward');setForwardChartMoving(true);setPreviewReadings(forwardedChartReadings(origin.current,next));setForwardPreview(model);}});
    startTransition(()=>router.push(href));
  },[router,motion]);
  const restore=useCallback((rail:HTMLElement)=>{
    if(!rail.isConnected||rail.closest('[data-return-covered],[data-return-prepared]')||!rail.clientWidth)return;
    if(focusAfterLoad.current&&!rail.hasAttribute("data-metric-rail-skeleton")&&!rail.closest('[data-workspace-cached]')){const pending=focusAfterLoad.current;rail.scrollLeft=pending.rail;if(scrollY!==pending.scroll)window.scrollTo({top:pending.scroll,behavior:'instant'});focusReturnCard(rail.querySelector<HTMLElement>(`a[data-metric-card="${pending.kind}"]`));focusAfterLoad.current=null;}
    const saved=origin.current;if(!saved)return;
    if(rail.scrollLeft!==saved.rail)rail.scrollLeft=saved.rail;
    if((motion.current.returning||!returnReady.current)&&scrollY!==saved.scroll)window.scrollTo({top:saved.scroll,behavior:'instant'});
    // 无配对动画也要等真实总览显示后恢复位置，再释放来源；隐藏路由和临时外壳不能提前消费它。
    if(!returningToOverview&&returnReady.current&&!motion.current.active&&!rail.hasAttribute('data-metric-rail-skeleton')&&location.pathname==='/dashboard'){
      if(rail.closest('[data-workspace-cached]'))focusAfterLoad.current={kind:saved.kind,rail:saved.rail,scroll:saved.scroll};
      focusReturnCard(rail.querySelector<HTMLElement>(`[data-metric-card="${saved.kind}"]`));
      origin.current=null;
    }
    if(!motion.current.returning)return;
    const current=motion.current.active;
    if(!current||current.direction!=='back'){motion.current.returning=false;return;}
    // 卡片在 layout effect 中已落位；先恢复再测量，同一帧交给浮层，避免额外等待一帧。
    const graph=rail.querySelector<SVGSVGElement>(`[data-metric-card="${saved.kind}"] [data-trend-glyph]`);
    if(current.destination&&current.hidden===graph)return;
    if(graph&&visible(graph)&&graph.dataset.trendRange===saved.rangeKey&&graph.dataset.trendKey===saved.modelKey&&current?.direction==='back'&&motion.current.active?.id===current.id)landAt(rectOf(graph),graph,false,current.id);
    else{clear();focusReturnCard(rail.querySelector<HTMLElement>(`[data-metric-card="${saved.kind}"]`));if(returnReady.current)origin.current=null;motion.current.returning=false;lastTarget.current=null;}
  },[motion,landAt,clear,returningToOverview,focusReturnCard]);
  const prepareBack=useCallback((fromHistory=false)=>{
    const saved=origin.current;if(!saved||motion.current.returning)return;
    setReturningToOverview(true);returnCancelled.current=false;returnReady.current=false;returnFromHistory.current=fromHistory;returnFocusUntouched.current=true;
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
      setReturningToOverview(true);returnCancelled.current=false;returnReady.current=false;returnFocusUntouched.current=true;
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
    const pop=()=>{if(location.pathname==='/dashboard'&&origin.current&&route.current!=='/dashboard')prepareBack(true);else if(location.pathname!=='/dashboard'){returnCancelled.current=true;motion.current.returning=false;origin.current=null;overviewReady();clear();}};
    const cancel=()=>{if(origin.current)origin.current.paired=false;clear();lastTarget.current=null;};
    window.addEventListener('formward-record-saved',cancel);window.addEventListener('formward-record-context-stale',cancel);window.addEventListener('popstate',pop,true);window.addEventListener('resize',cancel);
    return()=>{window.removeEventListener('formward-record-saved',cancel);window.removeEventListener('formward-record-context-stale',cancel);window.removeEventListener('popstate',pop,true);window.removeEventListener('resize',cancel);};
  },[prepareBack,clear,motion,overviewReady]);
  useEffect(()=>{const moved=(event:Event)=>{if(event.isTrusted&&(motion.current.returning||!returnReady.current||focusAfterLoad.current||focusFrame.current)){returnFocusUntouched.current=false;focusAfterLoad.current=null;cancelAnimationFrame(focusFrame.current);focusFrame.current=0;}};document.addEventListener('pointerdown',moved,true);document.addEventListener('keydown',moved,true);return()=>{document.removeEventListener('pointerdown',moved,true);document.removeEventListener('keydown',moved,true);cancelAnimationFrame(focusFrame.current);};},[]);
  useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>{if(query.matches)clear();};query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);},[clear]);
  useLayoutEffect(()=>{
    const changed=route.current!==pathname;route.current=pathname;if(changed){requested.current=null;if(pathname!=='/dashboard'&&returnCancelled.current)overviewReady();}
    if(changed&&origin.current&&pathname!=='/dashboard'&&pathname!==origin.current.destination){origin.current=null;lastTarget.current=null;motion.current.returning=false;clear();}
    if(origin.current&&pathname===origin.current.destination&&!chartDestinationMatches(origin.current,pathname+(search?'?'+search:''))){origin.current.paired=false;lastTarget.current=null;clear();}
    if(changed&&pathname==='/dashboard'&&origin.current&&!motion.current.returning&&!returningToOverview)prepareBack(true);
    if(pathname==='/dashboard'&&motion.current.returning){const rail=document.querySelector<HTMLElement>('[data-metric-rail]');if(rail)restore(rail);}
    const current=motion.current.active;
    if(changed&&current?.direction==='forward'&&pathname!==origin.current?.destination)clear();
    if(current?.direction==='forward'&&!current.landing&&target.current)land(target.current,current.id);
  },[pathname,search,pending,motion,clear,land,restore,prepareBack,overviewReady,returningToOverview]);
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
  const value=useMemo(()=>({claimChartEntry,navigate,register,restore,back,invalidate,recallOverview,rememberOverview,returningToOverview,overviewReady,cancelOverviewReturn,forwardDestination,forwardChartMoving,previewReadings,preview:flight?.model??forwardPreview??(returningToOverview?returnPreview:null)}),[claimChartEntry,navigate,register,restore,back,invalidate,recallOverview,rememberOverview,returningToOverview,overviewReady,cancelOverviewReturn,returnPreview,previewReadings,forwardPreview,forwardDestination,forwardChartMoving,flight]);
  const actions=useMemo(()=>({claimChartEntry,register,invalidate,recallOverview,rememberOverview}),[claimChartEntry,register,invalidate,recallOverview,rememberOverview]);
  return <ChartTransitionActionsContext value={actions}><ChartTransitionContext value={value}>{children}{flight&&createPortal(<div key={flight.id} className="chart-flight-layer"><div ref={node=>{if(node&&motion.current.active?.id===flight.id)motion.current.active.node=node;}} className="chart-flight" data-chart-flight={flight.id} data-chart-direction={flight.direction} aria-hidden="true" style={{left:flight.rect.left,top:flight.rect.top,width:flight.rect.width,height:flight.rect.height,visibility:'hidden'}}>{flight.model.kind==="morning-weight"?<><TrendGlyph flightLayer="source" model={flight.model} detail={flight.direction==="back"} width={flight.rect.width} height={flight.rect.height}/><TrendGlyph flightLayer="destination" model={flight.model} detail={flight.direction==="back"} width={flight.rect.width} height={flight.rect.height}/></>:<TrendGlyph model={flight.model} detail={flight.direction==="back"} width={flight.rect.width} height={flight.rect.height}/>}</div></div>,document.body)}</ChartTransitionContext></ChartTransitionActionsContext>;
}
