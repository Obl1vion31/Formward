"use client";
import {useCallback,useEffect,useId,useRef,useState,type ReactNode} from "react";
import {lockPageScroll} from "./scroll-lock";
import {useBackdropDismiss} from "./use-backdrop-dismiss";
import {DraftGuardContext,DraftCloseContext,type DraftState} from "./draft-guard";
import styles from "./inspector.module.css";
export function Inspector({title,close,busy=false,children,wide=false,header,className,onCloseReady}:{title:string;close:()=>void;busy?:boolean;children:ReactNode;wide?:boolean;header?:ReactNode;className?:string;onCloseReady?:(close:()=>void)=>void}){
 const titleId=useId(),ref=useRef<HTMLDialogElement>(null),drafts=useRef(new Map<symbol,DraftState>()),timer=useRef<ReturnType<typeof setTimeout>|null>(null),[closing,setClosing]=useState(false),callback=useRef(close);
 useEffect(()=>{callback.current=close;},[close]);
 const register=useCallback((state:DraftState)=>{const id=Symbol();drafts.current.set(id,state);return()=>{drafts.current.delete(id);};},[]);
 useEffect(()=>{const node=ref.current!,previous=document.activeElement;node.showModal();node.dataset.motion=window.matchMedia("(prefers-reduced-motion: reduce)").matches?"open":"opening";const unlock=lockPageScroll();return()=>{if(timer.current)clearTimeout(timer.current);node.close();unlock();if((previous instanceof HTMLElement||previous instanceof SVGElement)&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
 useEffect(()=>{const protect=(e:BeforeUnloadEvent)=>{if([...drafts.current.values()].some(s=>s.dirty)){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);},[]);
 function requestClose(){if(busy||closing||[...drafts.current.values()].some(s=>s.busy))return;if([...drafts.current.values()].some(s=>s.dirty)&&!window.confirm("本次输入尚未提交，关闭会放弃这些改动。确定关闭？"))return;if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)callback.current();else{setClosing(true);timer.current=setTimeout(()=>callback.current(),240);}}
 useEffect(()=>{onCloseReady?.(requestClose);});
 const backdrop=useBackdropDismiss(requestClose);
 return <dialog {...backdrop} ref={ref} className={className??(styles.drawer+" "+(wide?styles.wide:""))} data-motion={closing?"closing":"open"} data-closing={closing} aria-label={header?title:undefined} aria-labelledby={header?undefined:titleId} onAnimationEnd={e=>{if(e.target===e.currentTarget&&!closing)e.currentTarget.dataset.motion="open";}} onCancel={e=>{e.preventDefault();requestClose();}} onKeyDown={e=>{if(e.key!=="Tab")return;const nodes=[...e.currentTarget.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],summary,[tabindex]")].filter(n=>n.tabIndex>=0&&!n.matches(":disabled")&&n.getClientRects().length>0&&!n.closest("[hidden]")&&[...e.currentTarget.querySelectorAll("details:not([open])")].every(d=>!d.contains(n)||d.querySelector(":scope > summary")===n));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement?.getAttribute("tabindex")==="-1")){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}>
 <DraftGuardContext.Provider value={register}><DraftCloseContext.Provider value={requestClose}>{header?<>{header}{children}</>:<div className={styles.content}><div className={styles.heading}><h2 id={titleId}>{title}</h2><button aria-label="关闭编辑" disabled={busy} onClick={requestClose}>×</button></div>{children}</div>}</DraftCloseContext.Provider></DraftGuardContext.Provider></dialog>;
}
