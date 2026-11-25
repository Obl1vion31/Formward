"use client";
import {useCallback,useContext,useEffect,useLayoutEffect,useId,useRef,useState,type ReactNode,type PointerEvent as ReactPointerEvent} from "react";
import {EntrySurfaceContext,RouteEntryContent} from './entry-surface-state';
import {animateSurface,stopSurfaceMotion} from "./surface-motion";
import {MOBILE_MEDIA} from "./use-mobile-mode";
import {observeInputViewport, revealFocusedInput} from "./input-viewport";
import {confirmAction} from "./confirmation-state";
import {lockPageScroll} from "./scroll-lock";
import {useBackdropDismiss} from "./use-backdrop-dismiss";
import {pageRefreshApproved,InspectorBusyContext,InspectorStepContext,DraftGuardContext,DraftCloseContext,type DraftState,type InspectorStep} from "./draft-guard";
import styles from "./inspector.module.css";
export type InspectorProps={assistant?:boolean;closeLabel?:string;title:string;titleParts?:string[];backAction?:{label:string;run:()=>void};stableScroll?:boolean;close:()=>void;busy?:boolean;beforeClose?:()=>Promise<boolean>;children:ReactNode;wide?:boolean;compact?:boolean;fitContent?:boolean;motionDuration?:number;header?:ReactNode;className?:string;onCloseReady?:(close:()=>void)=>void;onSavedCloseReady?:(close:()=>Promise<void>)=>void;routeEntry?:boolean};
export function Inspector(props:InspectorProps){const entry=useContext(EntrySurfaceContext);return props.routeEntry&&entry.active?<RouteEntryContent {...props}/>:<InspectorSurface {...props}/>;}
function InspectorSurface({title,titleParts,backAction,stableScroll=false,close,busy=false,beforeClose,children,wide=false,compact=false,fitContent=false,motionDuration,header,className,onCloseReady,onSavedCloseReady,assistant=false,closeLabel="关闭编辑"}:InspectorProps){
 const titleId=useId(),ref=useRef<HTMLDialogElement>(null),headingRef=useRef<HTMLDivElement>(null),drafts=useRef(new Map<symbol,DraftState>()),[closing,setClosing]=useState(false),callback=useRef(close),before=useRef(beforeClose),closePending=useRef(false),[expanded,setExpanded]=useState(!stableScroll),gesture=useRef<{y:number;delta:number;start:number}|null>(null),suppressHandle=useRef(0);
 useLayoutEffect(()=>{callback.current=close;before.current=beforeClose;},[close,beforeClose]);
 const [childBusy,setChildBusy]=useState(false),blocked=busy||childBusy;
 const [step,setStep]=useState<InspectorStep|null>(null),activeStep=useRef<InspectorStep|null>(null);
 const registerStep=useCallback((next:InspectorStep)=>{
  activeStep.current=next;setStep(next);
  return()=>{if(activeStep.current===next){activeStep.current=null;setStep(null);}};
 },[]);
 const register=useCallback((state:DraftState)=>{const id=Symbol();drafts.current.set(id,state);setChildBusy([...drafts.current.values()].some(s=>s.busy));return()=>{drafts.current.delete(id);setChildBusy([...drafts.current.values()].some(s=>s.busy));};},[]);
 useLayoutEffect(()=>{
  const node=ref.current!;
  const previous=document.activeElement;
  const origin=previous?.closest('section[aria-label="最近记录"]');
  const date=previous?.closest("[data-record-date]")?.getAttribute("data-record-date");
  const scroll={path:location.pathname,x:window.scrollX,y:window.scrollY};
  node.showModal();
  void animateSurface(node,"open",null,matchMedia(MOBILE_MEDIA).matches?"sheet":compact?"center":"drawer",motionDuration);
  const unlock=lockPageScroll();
  return()=>{
   stopSurfaceMotion(node);
   node.getAnimations().forEach(animation=>animation.cancel());
   node.close();
   unlock();
   if(location.pathname!==scroll.path)return;
   window.scrollTo(scroll.x,scroll.y);
   if((previous instanceof HTMLElement||previous instanceof SVGElement)&&previous.isConnected){
    previous.focus({preventScroll:true});
   }else if(origin?.isConnected){
    const row=[...origin.querySelectorAll<HTMLElement>("[data-record-date]")].find(item=>item.dataset.recordDate===date&&item.getClientRects().length>0);
    const target=row?.querySelector<HTMLElement>("button")??origin.querySelector<HTMLElement>("[data-history-toggle]");
    target?.focus({preventScroll:true});
   }
  };
 },[compact,motionDuration]);
 useLayoutEffect(() => {
  const dialog = ref.current;
  if (!dialog) return;
  const reset = () => {
   dialog.removeAttribute("data-input-keyboard");
   dialog.removeAttribute("data-photo-keyboard");
   dialog.style.removeProperty("--input-viewport-height");
   dialog.style.removeProperty("--input-viewport-bottom");
  };
  const stop = observeInputViewport(dialog, ({keyboard, field, height, top, bottom}) => {
   if (!keyboard) {
    reset();
    return;
   }
   dialog.setAttribute("data-input-keyboard", "");
   dialog.toggleAttribute("data-photo-keyboard", Boolean(dialog.querySelector("[data-meal-photo-entry][data-photo-entry-active]")));
   dialog.style.setProperty("--input-viewport-height", height + "px");
   const layoutBottom = Math.max(document.documentElement.clientHeight, innerHeight);
   dialog.style.setProperty("--input-viewport-bottom", Math.max(0, layoutBottom - bottom) + "px");
   if (!field) return;
   const bounds = dialog.getBoundingClientRect();
   const heading = headingRef.current;
   const headerBottom = heading && getComputedStyle(heading).position === "sticky" ? heading.getBoundingClientRect().bottom : bounds.top;
   const footer = Array.from(dialog.querySelectorAll<HTMLElement>("[data-entry-footer], [data-meal-footer]"))
    .find(node => node.getClientRects().length > 0 && getComputedStyle(node).position === "sticky" && !node.contains(field));
   revealFocusedInput(field, dialog, Math.max(top, bounds.top, headerBottom) + 12,
    Math.min(bottom, bounds.bottom, footer?.getBoundingClientRect().top ?? Infinity) - 12);
  });
  return () => { stop(); reset(); };
 }, []);
 const [lastStable,setLastStable]=useState(stableScroll);if(lastStable!==stableScroll){setLastStable(stableScroll);if(!stableScroll)setExpanded(true);}
 useEffect(()=>{const protect=(e:BeforeUnloadEvent)=>{if(!pageRefreshApproved()&&[...drafts.current.values()].some(s=>s.dirty)){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);},[]);
 const requestClose=useCallback(async(saved=false)=>{
  if(closing||closePending.current||!saved&&(blocked||[...drafts.current.values()].some(s=>s.busy)))return;
  if(!saved&&activeStep.current){activeStep.current.back();return;}
  closePending.current=true;
  try{
   if(!saved&&[...drafts.current.values()].some(s=>s.dirty)&&!await confirmAction({title:'放弃尚未保存的输入？',message:'关闭会放弃本次尚未提交的修改。',confirmLabel:'放弃修改',cancelLabel:'继续编辑'}))return;
   if(!saved&&before.current&&!await before.current())return;
   const node=ref.current;
   if(!node?.open)return;
   if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){callback.current();return;}
   setClosing(true);
   const finished=await animateSurface(node,'close',null,matchMedia(MOBILE_MEDIA).matches?'sheet':compact?'center':'drawer',motionDuration);
   if(ref.current!==node)return;
   if(finished)callback.current();else setClosing(false);
  }finally{closePending.current=false;}
 },[blocked,closing,compact,motionDuration]);
 useLayoutEffect(()=>{onCloseReady?.(()=>{void requestClose();});onSavedCloseReady?.(()=>requestClose(true));});
 useLayoutEffect(()=>{const node=ref.current,heading=headingRef.current;if(!node||!heading)return;const measure=()=>node.style.setProperty("--inspector-sticky-offset",matchMedia("(max-width:700px), (hover:none) and (pointer:coarse)").matches?heading.getBoundingClientRect().height+"px":"0px");measure();const observer=new ResizeObserver(measure);observer.observe(heading);window.addEventListener("resize",measure);return()=>{observer.disconnect();window.removeEventListener("resize",measure);};},[]);
 const drag={
  onPointerDown(event:ReactPointerEvent<HTMLDivElement>){if(!matchMedia(MOBILE_MEDIA).matches||event.button!==0||closing||blocked||(event.target as Element).closest("button,select,input,textarea,a,summary"))return;const node=ref.current,start=node?new DOMMatrixReadOnly(getComputedStyle(node).transform).m42:0;gesture.current={y:event.clientY,delta:0,start};event.currentTarget.setPointerCapture(event.pointerId);node?.getAnimations().forEach(animation=>animation.cancel());if(node)node.style.transform=`translateY(${start}px)`;},
  onPointerMove(event:ReactPointerEvent<HTMLDivElement>){const g=gesture.current;if(!g)return;g.delta=event.clientY-g.y;if(ref.current)ref.current.style.transform=`translateY(${g.start+(g.delta<0?-Math.sqrt(-g.delta)*2:g.delta)}px)`;},
  onPointerUp(event:ReactPointerEvent<HTMLDivElement>){const g=gesture.current;gesture.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(!g)return;if(Math.abs(g.delta)>7)suppressHandle.current=performance.now()+350;const node=ref.current;
   const release=()=>{
    if(!node)return;
    const from=node.style.transform;node.style.transform="";
    if(!matchMedia("(prefers-reduced-motion:reduce)").matches)node.animate([{transform:from},{transform:"translateY(0)"}],{duration:220,easing:"cubic-bezier(.2,.8,.2,1)"});
   };
   if(g.delta<-35)setExpanded(true);
   if(g.delta>65){
    if(expanded)setExpanded(false);
    else{
     if([...drafts.current.values()].some(state=>state.dirty)||before.current)release();
     void requestClose().finally(()=>{if(node?.open&&node.style.transform)node.style.transform="";});
     return;
    }
   }
   release();},
  onPointerCancel(){gesture.current=null;if(ref.current)ref.current.style.transform="";}
 };
 const backdrop=useBackdropDismiss(()=>{void requestClose();});
 const sheetHandle = !fitContent && !step ? (
  <button type="button" className={styles.sheetHandle} aria-label={expanded ? "收起到半屏" : "展开详情"}
    aria-expanded={expanded} disabled={blocked || closing}
    onClick={() => { if (performance.now() > suppressHandle.current) setExpanded(value => !value); }}>
   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d={expanded ? "m7 10 5 5 5-5" : "m7 14 5-5 5 5"}/>
   </svg>
  </button>
 ) : null;
 const leading = step ? (
  <button type="button" className={styles.stepBack} aria-label={"返回" + step.backTo} disabled={blocked} onClick={step.back}>
   <span aria-hidden="true">←</span>
   <span className={styles.fullBackLabel} aria-hidden="true">{step.backTo}</span>
   {step.shortBackTo && <span className={styles.shortBackLabel} aria-hidden="true">{step.shortBackTo}</span>}
  </button>
 ) : backAction ? (
  <button type="button" className={styles.headingBack} aria-label={backAction.label} disabled={blocked} onClick={backAction.run}>←</button>
 ) : sheetHandle;
 return <dialog {...backdrop} ref={ref} className={(className??(styles.drawer+" "+(wide?styles.wide:"")+" "+(compact?styles.compact:"")))+" "+styles.mobileSheet+(stableScroll?" "+styles.stableScroll:"")} data-assistant-surface={assistant||undefined} data-fit-content={fitContent||undefined} data-sheet-expanded={expanded} data-inspector="" data-closing={closing} aria-label={header?title:undefined} aria-labelledby={header?undefined:titleId} onCancel={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();requestClose();}} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();return;}if(e.key!=="Tab")return;const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],summary,[tabindex]")].filter(n=>n.tabIndex>=0&&!n.matches(":disabled")&&n.getClientRects().length>0&&!n.closest("[hidden]")&&[...e.currentTarget.querySelectorAll("details:not([open])")].every(d=>!d.contains(n)||d.querySelector(":scope > summary")===n));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement?.getAttribute("tabindex")==="-1")){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}>
 <InspectorBusyContext value={blocked}><DraftGuardContext.Provider value={register}><DraftCloseContext.Provider value={requestClose}><InspectorStepContext value={registerStep}>
 <div ref={headingRef} data-inspector-heading className={styles.surfaceHeading} {...(!fitContent && drag)}>
  {!fitContent && <span className={styles.dragIndicator} aria-hidden="true"/>}
  {header ? <>{sheetHandle}{header}</> : (
   <div className={styles.heading} data-inspector-title-row data-inspector-paired-actions={Boolean(backAction && sheetHandle) || undefined}>
    {leading}
    <h2 id={titleId} data-inspector-step-title={Boolean(step) || undefined} tabIndex={step ? -1 : undefined}
      className={!step && titleParts ? styles.titleParts : undefined}>
     {step ? step.title : titleParts ? titleParts.map((part, index) => <span key={index}>{index > 0 ? " · " : ""}{part}</span>) : title}
    </h2>
    {!step && <div className={styles.headingActions}>
     {backAction && sheetHandle}
     <button type="button" aria-label={closeLabel} disabled={blocked} onClick={() => void requestClose()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
       <path d="m6 6 12 12M18 6 6 18"/>
      </svg>
     </button>
    </div>}
   </div>
  )}
 </div>
 {header?children:<div className={styles.content+(titleParts?" "+styles.titledContent:"")}>{children}</div>}
 </InspectorStepContext></DraftCloseContext.Provider></DraftGuardContext.Provider></InspectorBusyContext></dialog>;

}

export function InspectorCloseButton({label,disabled=false}:{label:string;disabled?:boolean}){const close=useContext(DraftCloseContext),busy=useContext(InspectorBusyContext);return <button type="button" aria-label={label} disabled={disabled||busy} onClick={()=>close?.()}>×</button>;}
