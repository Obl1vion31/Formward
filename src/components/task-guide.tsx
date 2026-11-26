"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { trackPopoverPosition } from "./anchored-popover";
import { Inspector } from "./inspector";
import { useMobileMode } from "./use-mobile-mode";
import { WorkspaceRefreshingContext } from "@/features/dashboard/workspace-cache-context";
import styles from "./task-guide.module.css";

type Step = { target: string; text: string };
type Film = "overview" | "food-library" | "photo" | "energy" | "body" | "device";
const filmTitles: Record<Film, string> = {
  overview: "使用总览查看趋势", "food-library": "从食材库记一餐", photo: "拍照和核对保存",
  energy: "估算与保存当天消耗", body: "记录实测体重", device: "查看设备同步状态",
};
type GuideState = { account: string; workflow: string | null; setWorkflow: Dispatch<SetStateAction<string | null>> };
const GuideContext = createContext<GuideState>({ account: "", workflow: null, setWorkflow: () => {} });
const hidden = "[inert],[hidden],[data-return-prepared]";
const guideUI = "[data-guide-float]:popover-open";
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

function present(element: HTMLElement | null): element is HTMLElement {
  return !!element?.getClientRects().length && !element.closest(hidden) &&
    !element.matches(":disabled,[aria-disabled=true]") &&
    getComputedStyle(element).visibility === "visible";
}

function findTarget(trigger: HTMLElement, name: string) {
  const scope=trigger.closest("[data-guide-scope],dialog,[data-assistant-page],[data-record-workspace]")??document;
  return Array.from(scope.querySelectorAll<HTMLElement>("[data-guide-target]")).find(node=>
    node.dataset.guideTarget===name && present(node));
}

function canPointAt(anchor:HTMLElement) {
  if (document.hidden || anchor.closest('[data-surface-phase="opening"],[data-surface-phase="closing"]')) return false;
  const box=anchor.getBoundingClientRect();
  const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
  return anchor.contains(hit);
}

function openGuide(node:HTMLElement | null) {
  if (!node?.isConnected) return;
  window.dispatchEvent(new CustomEvent("formward-guide-open",{detail:node}));
  for (const other of document.querySelectorAll<HTMLElement>(guideUI)) if(other!==node)other.hidePopover();
  if(!node.matches(":popover-open"))node.showPopover();
}

type GuideProps = { task:string; target?:string; text?:string; steps?:Step[]; mode?:"tour"|"operation"; auto?:boolean; video?:Film };

export function TaskGuide({ task, target=task, text, steps, mode="operation", auto=false, video }: GuideProps) {
  const {account,workflow,setWorkflow}=useContext(GuideContext);
  const refreshing=useContext(WorkspaceRefreshingContext);
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),hint=useRef<HTMLDivElement>(null);
  const [menuOpen,setMenuOpen]=useState(false),[tour,setTour]=useState<number|null>(null),[film,setFilm]=useState(false);
  const [message,setMessage]=useState("");
  const configured=JSON.stringify(steps??(text?[{target,text}]:[]));
  const count=steps?.length??(text?1:0);
  const running=mode==="tour"?tour!==null:workflow===task;
  const menuLabel=mode==="tour"?"页面导览":"操作引导";
  const initiated=useRef(false);
  const [hintOpen,setHintOpen]=useState(false);
  const key=storageKey(account,task);

  const close=useCallback(() => {
    if(hint.current?.matches(":popover-open"))hint.current.hidePopover();
    setTour(null);
    if(workflow===task){
      try { localStorage.setItem(key,"dismissed"); } catch {}
      setWorkflow(null);
    }
    if(!document.activeElement||hint.current?.contains(document.activeElement)||document.activeElement===document.body)
      trigger.current?.focus({preventScroll:true});
  },[key,setWorkflow,task,workflow]);

  useEffect(()=>{
    function opened(event:Event){
      const selected=(event as CustomEvent<HTMLElement>).detail;
      if(selected!==menu.current&&selected!==hint.current)setTour(null);
    }
    window.addEventListener("formward-guide-open",opened);
    return ()=>window.removeEventListener("formward-guide-open",opened);
  },[]);

  useEffect(()=>{
    if(!menuOpen||!menu.current||!trigger.current)return;
    const owner=trigger.current.closest<HTMLElement>("dialog,[data-assistant-page]")??document.body;
    return trackPopoverPosition(menu.current,trigger.current,{owner,width:216,minHeight:44,margin:12,gap:6});
  },[menuOpen]);

  useEffect(()=>{
    if(!account||!count||refreshing||film||menuOpen||mode==="tour"&&tour===null||!running&&!auto)return;
    if(!running){
      if(workflow&&Array.from(document.querySelectorAll<HTMLElement>("[data-task-guide]")).some(other=>other.dataset.taskGuide===workflow&&present(other)))return;
      try{if(localStorage.getItem(key))return;}catch{}
    }
    const origin=trigger.current,node=hint.current;
    if(!origin||!node)return;
    const list=JSON.parse(configured) as Step[];
    const available=mode==="tour"?list.slice(tour??0,(tour??0)+1):list;
    let frame=0,active:HTMLElement|undefined,attempted:HTMLElement|undefined,unavailable:HTMLElement|undefined,release=()=>{};
    const originalScope=origin.closest("dialog,[data-guide-scope],[data-record-workspace],[data-assistant-page]")??document.body;
    function hide(){
      release();release=()=>{};active=undefined;
      if(node?.matches(":popover-open"))node.hidePopover();
    }
    const inspect=()=>{
      frame=0;
      if(!present(origin)||!node?.isConnected)return hide();
      const pair=available.map(step=>({step,anchor:findTarget(origin,step.target)})).find(choice=>choice.anchor);
      if(!pair?.anchor)return hide();
      const {step,anchor}=pair;
      if(!canPointAt(anchor)){
        if(attempted!==anchor&&(mode==="tour"||initiated.current)&&!anchor.closest('[data-surface-phase="opening"]')){
          attempted=anchor;anchor.scrollIntoView({block:"center",inline:"center",behavior:"instant"});
          schedule();
        }
        return hide();
      }
      if(active===anchor||unavailable===anchor)return;
      hide();active=anchor;attempted=anchor;
      if(!running){
        try { localStorage.setItem(key,"started"); } catch {}
        setWorkflow(task);
        return;
      }
      setMessage(step.text);
      const owner=anchor.closest<HTMLElement>("dialog,[data-assistant-page]")??document.body;
      const footer=anchor.closest<HTMLElement>("[data-entry-footer],[data-meal-footer],[data-review-footer]");
      // 操作目标始终是控件本身。底部表单的提示放在整个保存区外，避免遮住缺项和其他操作。
      const lane=footer??anchor.closest<HTMLElement>("[data-guide-flow]");
      const placement=lane??anchor;
      // 操作区空间不足时给提示留出位置，读数、输入和保存区仍能完整看到。
      const spacer=lane&&document.createElement(lane.tagName==="LI"?"li":"div");
      if(spacer&&lane){
        spacer.className=styles.spacer;
        spacer.setAttribute("aria-hidden","true");
        spacer.style.blockSize=(mode==="tour"?118:60)+"px";
        lane.insertAdjacentElement(footer?"beforebegin":"afterend",spacer);
        const bounds=spacer.getBoundingClientRect();
        if(mode==="tour"&&bounds.bottom>innerHeight-80)spacer.scrollIntoView({block:"end",behavior:"instant"});
      }
      const old=anchor.getAttribute("aria-describedby");
      anchor.setAttribute("aria-describedby",[old,id+"-text"].filter(Boolean).join(" "));
      anchor.setAttribute("data-guide-highlight","");
      openGuide(node);
      const stop=trackPopoverPosition(node,placement,{
        owner,width:mode==="tour"?310:238,maxHeight:164,minHeight:40,gap:9,margin:16,
        horizontalAnchor:anchor,
        preferLeft:mode==="operation"&&!lane,preferAbove:!!footer||!lane&&mode==="operation",
        align:footer?.hasAttribute("data-entry-footer")?"start":"end",
        onPosition:box=>{
          const targetBox=anchor.getBoundingClientRect();
          const side=box.right<=targetBox.left?"right":box.bottom<=targetBox.top?"bottom":"top";
          node.dataset.pointSide=side;
          node.style.setProperty("--pointer-left",Math.max(14,Math.min(box.width-14,targetBox.left+targetBox.width/2-box.left))+"px");
          node.style.setProperty("--pointer-top",Math.max(14,Math.min(box.height-14,targetBox.top+targetBox.height/2-box.top))+"px");
        },
        onUnavailable:()=>{unavailable=anchor;hide();},
      });
      release=()=>{
        stop();spacer?.remove();anchor.removeAttribute("data-guide-highlight");
        if(old)anchor.setAttribute("aria-describedby",old);else anchor.removeAttribute("aria-describedby");
      };
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(inspect);};
    const reposition=()=>{unavailable=undefined;schedule();};
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=="Escape"||!node.matches(":popover-open"))return;
      event.preventDefault();event.stopPropagation();close();
    };
    const observer=new MutationObserver(schedule);
    observer.observe(originalScope,{subtree:true,childList:true,attributes:true,
      attributeFilter:["open","disabled","hidden","inert","data-guide-target","data-return-prepared","data-surface-phase","data-meal-pane-transition","aria-disabled"]});
    window.addEventListener("scroll",reposition,true);
    window.addEventListener("resize",reposition);
    window.visualViewport?.addEventListener("resize",reposition);
    document.addEventListener("toggle",schedule,true);
    document.addEventListener("visibilitychange",schedule);
    document.addEventListener("keydown",escape,true);
    schedule();
    return ()=>{
      cancelAnimationFrame(frame);observer.disconnect();hide();
      window.removeEventListener("scroll",reposition,true);window.removeEventListener("resize",reposition);
      window.visualViewport?.removeEventListener("resize",reposition);
      document.removeEventListener("toggle",schedule,true);document.removeEventListener("visibilitychange",schedule);
      document.removeEventListener("keydown",escape,true);
    };
  },[account,auto,close,configured,count,film,id,key,menuOpen,mode,refreshing,running,setWorkflow,task,tour,workflow]);

  if(!account||!count)return null;
  return <div className={styles.guide} data-task-guide={task}>
    <button type="button" className={styles.trigger} ref={trigger} title={menuLabel+"与操作视频"} aria-expanded={menuOpen} aria-controls={id+"-menu"} onClick={()=>{
      if(menu.current?.matches(":popover-open")){menu.current.hidePopover();return;}
      if(mode==="tour")setTour(null);
      if(workflow)setWorkflow(null);
      openGuide(menu.current);
    }}>使用指引</button>
    <div ref={menu} id={id+"-menu"} className={styles.menu} popover="auto" data-guide-float="menu" role="group" aria-label="使用指引选项"
      onToggle={event=>setMenuOpen(event.newState==="open")}>
      <button type="button" onClick={()=>{
        menu.current?.hidePopover();
        initiated.current=true;
        if(mode==="tour")setTour(0);else setWorkflow(task);
      }}><GuideIcon type="steps"/>{menuLabel}</button>
      {video&&<button type="button" onClick={()=>{menu.current?.hidePopover();setFilm(true);}}>
        <GuideIcon type="play"/>观看操作视频
      </button>}
    </div>
    <div ref={hint} className={styles.hint} popover="manual" data-guide-float="hint" data-guide-hint
      aria-label={menuLabel} onToggle={event=>setHintOpen(event.newState==="open")}
      onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();close();}}}>
      <div className={styles.hintText}>
        <span id={id+"-text"}>{message}</span>
        <button className={styles.close} type="button" aria-label="关闭使用指引" onClick={close}><GuideIcon type="close"/></button>
      </div>
      {mode==="tour"&&tour!==null&&<div className={styles.tourNav}>
        <span aria-live="polite">{tour+1} / {count}</span>
        <button type="button" disabled={tour===0} onClick={()=>setTour(tour-1)}>上一步</button>
        <button type="button" data-next onClick={()=>tour+1<count?setTour(tour+1):close()}>{tour+1<count?"下一步":"完成"}</button>
      </div>}
      {hintOpen&&<span className="sr-only" role="status">{message}</span>}
    </div>
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
