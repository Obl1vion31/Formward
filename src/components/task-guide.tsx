"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { followPopoverAnchor, readPopoverBounds, trackPopoverPosition } from "./anchored-popover";
import { guidePresent, guideScope, guideTarget, openGuide, operationObstacles, placeGuideCard, type GuideStep } from "./guide-position";
import { PageTour } from "./page-tour";
import { Inspector } from "./inspector";
import { useMobileMode } from "./use-mobile-mode";
import { WorkspaceRefreshingContext } from "@/features/dashboard/workspace-cache-context";
import styles from "./task-guide.module.css";

type Film = "overview" | "food-library" | "photo" | "energy" | "body" | "device";
const filmTitles: Record<Film, string> = {
  overview: "使用总览查看趋势", "food-library": "从食材库记一餐", photo: "拍照和核对保存",
  energy: "估算与保存当天消耗", body: "记录实测体重", device: "查看设备同步状态",
};
type GuideState = { account: string; workflow: string | null; setWorkflow: Dispatch<SetStateAction<string | null>> };
const GuideContext = createContext<GuideState>({ account: "", workflow: null, setWorkflow: () => {} });
const storageKey = (account: string, task: string) => "formward:guide-v2:" + account + ":" + task;

export function TaskGuideProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  return <GuideSession key={accountId} account={accountId}>{children}</GuideSession>;
}

function GuideSession({ account, children }: { account: string; children: ReactNode }) {
  const [workflow, setWorkflow] = useState<string | null>(null);
  return <GuideContext value={{account,workflow,setWorkflow}}>{children}</GuideContext>;
}

export function useGuideWorkflow() {
  const {account,workflow,setWorkflow}=useContext(GuideContext);
  return {
    workflow,
    finish(task:string) {
      if(workflow!==task)return;
      try { localStorage.setItem(storageKey(account,task),"complete"); } catch {}
      setWorkflow(current=>current===task?null:current);
    },
  };
}

function canPointAt(anchor:HTMLElement) {
  if (document.hidden || anchor.closest('[data-surface-phase="opening"],[data-surface-phase="closing"]')) return false;
  const box=anchor.getBoundingClientRect();
  return anchor.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));
}

type GuideProps = { task:string; target?:string; text?:string; steps?:GuideStep[]; mode?:"tour"|"operation"; auto?:boolean; video?:Film };

export function TaskGuide({ task, target=task, text, steps, mode="operation", auto=false, video }: GuideProps) {
  const {account,workflow,setWorkflow}=useContext(GuideContext);
  const refreshing=useContext(WorkspaceRefreshingContext);
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),hint=useRef<HTMLDivElement>(null);
  const [menuOpen,setMenuOpen]=useState(false),[tour,setTour]=useState(false),[film,setFilm]=useState(false);
  const [message,setMessage]=useState("");
  const configured=JSON.stringify(steps??(text?[{target,text}]:[]));
  const count=steps?.length??(text?1:0);
  const running=workflow===task;
  const menuLabel=mode==="tour"?"页面导览":"操作引导";
  const [hintOpen,setHintOpen]=useState(false);
  const key=storageKey(account,task);

  const close=useCallback(() => {
    if(hint.current?.matches(":popover-open"))hint.current.hidePopover();
    if(workflow===task){
      try { localStorage.setItem(key,"dismissed"); } catch {}
      setWorkflow(null);
    }
    if(!document.activeElement||hint.current?.contains(document.activeElement)||document.activeElement===document.body)
      trigger.current?.focus({preventScroll:true});
  },[key,setWorkflow,task,workflow]);

  const closeTour=useCallback((restoreFocus:boolean)=>{
    setTour(false);
    if(restoreFocus&&guidePresent(trigger.current))trigger.current.focus({preventScroll:true});
  },[]);

  useEffect(()=>{
    function opened(event:Event){
      const selected=(event as CustomEvent<HTMLElement>).detail;
      if(selected?.dataset.guideOwner!==id)setTour(false);
    }
    window.addEventListener("formward-guide-open",opened);
    return ()=>window.removeEventListener("formward-guide-open",opened);
  },[id]);

  useEffect(()=>{
    if(!menuOpen||!menu.current||!trigger.current)return;
    const owner=trigger.current.closest<HTMLElement>("dialog,[data-assistant-page]")??document.body;
    return trackPopoverPosition(menu.current,trigger.current,{owner,width:216,minHeight:44,margin:12,gap:6});
  },[menuOpen]);

  useEffect(()=>{
    if(mode!=="operation"||!account||!count||refreshing||film||menuOpen||!running&&!auto)return;
    if(!running){
      if(workflow&&Array.from(document.querySelectorAll<HTMLElement>("[data-task-guide]")).some(other=>other.dataset.taskGuide===workflow&&guidePresent(other)))return;
      try{if(localStorage.getItem(key))return;}catch{}
    }
    const origin=trigger.current,node=hint.current;
    if(!origin||!node)return;
    const steps=JSON.parse(configured) as GuideStep[];
    const scope=guideScope(origin);
    let frame=0,active:HTMLElement|undefined,reposition:(()=>void)|undefined,release=()=>{};
    function hide(){
      release();release=()=>{};active=undefined;reposition=undefined;
      if(node?.matches(":popover-open"))node.hidePopover();
    }
    function inspect(){
      frame=0;
      if(!guidePresent(origin)||!node?.isConnected||document.documentElement.dataset.guideTour)return hide();
      const pair=steps.map(step=>({step,anchor:guideTarget(origin,step.target)})).find(choice=>choice.anchor);
      if(!pair?.anchor||!canPointAt(pair.anchor))return hide();
      const {step,anchor}=pair;
      if(active===anchor){reposition?.();return;}
      hide();active=anchor;
      if(!running){
        try { localStorage.setItem(key,"started"); } catch {}
        setWorkflow(task);
        return;
      }
      setMessage(step.text);
      const owner=anchor.closest<HTMLElement>("dialog,[data-assistant-page]")??document.body;
      const old=anchor.getAttribute("aria-describedby");
      anchor.setAttribute("aria-describedby",[old,id+"-text"].filter(Boolean).join(" "));
      anchor.setAttribute("data-guide-highlight","");
      openGuide(node);
      const position = () => {
        if(!node.matches(":popover-open"))return;
        const box=anchor.getBoundingClientRect(), bounds=readPopoverBounds(owner,12,true);
        const placement=placeGuideCard(node,box,bounds,{
          width:238, sides:["left","right","bottom","top"], avoid:operationObstacles(scope,anchor),
        });
        node.style.visibility=placement?"visible":"hidden";
      };
      reposition=position;
      const stop=followPopoverAnchor(node,anchor,owner,position);
      owner.addEventListener("focusin",position);
      release=()=>{
        stop();owner.removeEventListener("focusin",position);
        node.style.removeProperty("visibility");
        anchor.removeAttribute("data-guide-highlight");
        const remaining=anchor.getAttribute("aria-describedby")?.split(/\s+/).filter(token=>token!==id+"-text").join(" ");
        if(remaining)anchor.setAttribute("aria-describedby",remaining);else anchor.removeAttribute("aria-describedby");
      };
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(inspect);};
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=="Escape"||!node.matches(":popover-open"))return;
      event.preventDefault();event.stopPropagation();close();
    };
    const observer=new MutationObserver(schedule);
    observer.observe(scope,{subtree:true,childList:true,attributes:true,
      attributeFilter:["open","disabled","hidden","inert","data-guide-target","data-return-prepared","data-surface-phase","data-meal-pane-transition","aria-disabled"]});
    window.addEventListener("scroll",schedule,true);
    window.addEventListener("resize",schedule);
    window.visualViewport?.addEventListener("resize",schedule);
    document.addEventListener("toggle",schedule,true);
    document.addEventListener("visibilitychange",schedule);
    document.addEventListener("keydown",escape,true);
    schedule();
    return ()=>{
      cancelAnimationFrame(frame);observer.disconnect();hide();
      window.removeEventListener("scroll",schedule,true);window.removeEventListener("resize",schedule);
      window.visualViewport?.removeEventListener("resize",schedule);
      document.removeEventListener("toggle",schedule,true);document.removeEventListener("visibilitychange",schedule);
      document.removeEventListener("keydown",escape,true);
    };
  },[account,auto,close,configured,count,film,id,key,menuOpen,mode,refreshing,running,setWorkflow,task,workflow]);
  if(!account||!count)return null;
  return <div className={styles.guide} data-task-guide={task}>
    <button type="button" className={styles.trigger} ref={trigger} title={video?menuLabel+"与操作视频":menuLabel} aria-expanded={menuOpen} aria-controls={id+"-menu"} onClick={()=>{
      if(menu.current?.matches(":popover-open")){menu.current.hidePopover();return;}
      if(mode==="tour")setTour(false);
      if(workflow)setWorkflow(null);
      openGuide(menu.current);
    }}>使用指引</button>
    <div ref={menu} id={id+"-menu"} className={styles.menu} popover="auto" data-guide-float="menu" data-guide-owner={id} role="group" aria-label="使用指引选项"
      onToggle={event=>setMenuOpen(event.newState==="open")}>
      <button type="button" onClick={()=>{
        menu.current?.hidePopover();
        if(mode==="tour")setTour(true);else setWorkflow(task);
      }}><GuideIcon type="steps"/>{menuLabel}</button>
      {video&&<button type="button" onClick={()=>{menu.current?.hidePopover();setFilm(true);}}>
        <GuideIcon type="play"/>观看操作视频
      </button>}
    </div>
    {mode==="operation"&&<div ref={hint} className={styles.hint} popover="manual" data-guide-float="hint" data-guide-owner={id} data-guide-hint
      aria-label={menuLabel} onToggle={event=>setHintOpen(event.newState==="open")}
      onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();close();}}}>
      <div className={styles.hintText}>
        <span id={id+"-text"}>{message.split(/(「[^」]+」)/).map((part,index)=>
          part.startsWith("「")?<strong key={index}>{part}</strong>:part
        )}</span>
        <button className={styles.close} type="button" aria-label="关闭使用指引" onClick={close}><GuideIcon type="close"/></button>
      </div>
      {hintOpen&&<span className="sr-only" role="status">{message}</span>}
    </div>}
    {mode==="tour"&&tour&&!refreshing&&<PageTour ownerId={id} origin={trigger} configuration={configured} onClose={closeTour}/>}
    {film&&video&&<GuideVideo topic={video} close={()=>setFilm(false)}/>}
  </div>;
}

function GuideIcon({type}:{type:"steps"|"play"|"close"}){
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type==="close"?<path d="m4 4 8 8m0-8-8 8"/>:type==="play"?<><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="m6.5 5.5 4 2.5-4 2.5z"/></>:<path d="M8 3.5v9m0-9c-1.8-1.6-4.3-1.8-6.5-1v9c2.2-.8 4.7-.5 6.5 1m0-9c1.8-1.6 4.3-1.8 6.5-1v9c-2.2-.8-4.7-.5-6.5 1"/>}
  </svg>;
}

function GuideVideo({topic,close}:{topic:Film;close:()=>void}){
  const mobile=useMobileMode(),[attempt,setAttempt]=useState(0),[error,setError]=useState(false);
  const title=filmTitles[topic];
  return <Inspector title={title} close={close} closeLabel="关闭操作视频" wide>
    <div className={styles.video}>
      {error?<p role="alert">视频暂时无法播放。<button type="button" onClick={()=>{setError(false);setAttempt(attempt+1);}}>重新加载</button></p>:
        <video key={attempt} controls muted playsInline preload="metadata" aria-label={title} data-guide-film={topic} onError={()=>setError(true)}
          src={"/tutorials/guidance-"+topic+"-"+(mobile?"mobile":"desktop")+".mp4"}/>}
    </div>
  </Inspector>;
}

const trendCopy = {
  nutrition: {summary:"看所选日期的摄入热量、餐数和营养。选历史日期后可补记当天。",chart:"柱形显示每天的摄入，图例说明营养组成和待确认状态。",video:"food-library"},
  energy: {summary:"看所选日期的总消耗、静息和活动，以及当日可用的入口。",chart:"柱形显示每天已记录的消耗。点日期，读数会切到同一天。",video:"energy"},
  body: {summary:"读数来自所选日期的实测记录。7 日平均按有效样本计算。",chart:"点日期查看当天实测。缺测的位置留空，可切换看晚间记录。",video:"body"},
} as const;

export function TrendGuide({kind,device}:{kind:keyof typeof trendCopy;device?:boolean}){
  const copy=trendCopy[kind];
  return <TaskGuide task={kind+"-page"} mode="tour" video={kind==="energy"&&device?"device":copy.video} steps={[
    {target:"trend-"+kind+"-metrics",text:kind==="energy"&&device?"这里显示所选日期的设备消耗。今日累计会随同步更新。":copy.summary},
    {target:"trend-range",text:"选择要看的日期区间，图表和记录读数会一起更新。"},
    {target:"trend-chart",text:copy.chart},
    {target:"selected-day-details",text:"这里打开当前选中的日期，查看记录及其来源。"},
  ]}/>;
}
