"use client";
import {useId,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import styles from "./energy.module.css";

/** 计算操作浮在触发按钮旁，不参与表单布局；内容仍属于当前 Inspector。 */
export function CalculationPopover({label,title,open,changeOpen,onOpen,disabled=false,triggerClassName,wide=false,children}:{label:string;title:string;open:boolean;changeOpen:(open:boolean)=>void;onOpen?:()=>void;disabled?:boolean;triggerClassName?:string;wide?:boolean;children:ReactNode}){
 const id=useId(),anchor=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),[host,setHost]=useState<HTMLElement|null>(null);
 useLayoutEffect(()=>{setHost(anchor.current?.closest("dialog")??document.body);},[]);
 const close=()=>{changeOpen(false);anchor.current?.focus({preventScroll:true});};
 useLayoutEffect(()=>{
  if(!host||!panel.current)return;
  const node=panel.current,button=anchor.current!;
  if(!open){if(node.matches(":popover-open")){const restore=node.contains(document.activeElement)||document.activeElement===document.body;node.hidePopover();if(restore)button.focus({preventScroll:true});}return;}
  if(!node.matches(":popover-open"))node.showPopover();
  const place=()=>{
   const a=button.getBoundingClientRect(),h=host===document.body?{left:0,right:innerWidth,top:0,bottom:innerHeight}:host.getBoundingClientRect(),v=visualViewport;
   const left=Math.max(h.left,v?.offsetLeft??0)+12,right=Math.min(h.right,(v?.offsetLeft??0)+(v?.width??innerWidth))-12,top=Math.max(h.top,v?.offsetTop??0)+12,bottom=Math.min(h.bottom,(v?.offsetTop??0)+(v?.height??innerHeight))-12;
   node.style.width=Math.min(wide?400:340,right-left)+"px";node.style.maxHeight=Math.max(80,bottom-top)+"px";
   const box=node.getBoundingClientRect(),beside=a.left-left>=box.width+8;
   node.style.left=Math.max(left,Math.min(beside?a.left-box.width-8:a.right-box.width,right-box.width))+"px";
   node.style.top=Math.max(top,Math.min(beside?a.top:a.bottom+8+box.height<=bottom?a.bottom+8:a.top-box.height-8,bottom-box.height))+"px";
  };
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&node.matches(":popover-open")){const activeDialog=document.activeElement?.closest("dialog");if(activeDialog&&activeDialog!==host)return;event.preventDefault();event.stopImmediatePropagation();node.hidePopover();button.focus({preventScroll:true});}};
  place();node.focus({preventScroll:true});const observer=new ResizeObserver(place);observer.observe(node);observer.observe(host);document.addEventListener("keydown",escape,true);document.addEventListener("scroll",place,true);window.addEventListener("resize",place);visualViewport?.addEventListener("resize",place);
  return()=>{observer.disconnect();document.removeEventListener("keydown",escape,true);document.removeEventListener("scroll",place,true);window.removeEventListener("resize",place);visualViewport?.removeEventListener("resize",place);};
 },[open,host,wide]);
 return <><button ref={anchor} type="button" className={triggerClassName} disabled={disabled} popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} onClick={event=>{event.preventDefault();if(!open)onOpen?.();changeOpen(!open);}}>{label}</button>{host&&createPortal(<div ref={panel} id={id} popover="auto" role="dialog" tabIndex={-1} aria-label={title} className={styles.form+" "+styles.calculationPopover} onToggle={event=>changeOpen(event.newState==="open")}><button type="button" className={styles.popoverClose} onClick={close} aria-label={"关闭"+title}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><fieldset disabled={disabled}>{children}</fieldset></div>,host)}</>;
}
