"use client";
import {useId,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {trackPopoverPosition} from "@/components/anchored-popover";
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
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&node.matches(":popover-open")){const activeDialog=document.activeElement?.closest("dialog");if(activeDialog&&activeDialog!==host)return;event.preventDefault();event.stopImmediatePropagation();node.hidePopover();button.focus({preventScroll:true});}};
  const stopPositioning=trackPopoverPosition(node,button,{
   owner:host,avoidHeading:true,width:wide?400:340,align:"end",gap:8,minHeight:48,preferLeft:true,
  });
  if(!node.style.visibility)node.focus({preventScroll:true});
  document.addEventListener("keydown",escape,true);
  return()=>{stopPositioning();document.removeEventListener("keydown",escape,true);};
 },[open,host,wide]);
 return <><button ref={anchor} type="button" className={triggerClassName} disabled={disabled} popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} onClick={event=>{event.preventDefault();if(!open)onOpen?.();changeOpen(!open);}}>{label}</button>{host&&createPortal(<div ref={panel} id={id} popover="auto" role="dialog" tabIndex={-1} aria-label={title} className={styles.form+" "+styles.calculationPopover} onToggle={event=>changeOpen(event.newState==="open")}><button type="button" className={styles.popoverClose} onClick={close} aria-label={"关闭"+title}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><fieldset disabled={disabled}>{children}</fieldset></div>,host)}</>;
}
