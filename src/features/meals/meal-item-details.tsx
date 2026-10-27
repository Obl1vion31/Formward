"use client";
import {useLayoutEffect,useRef,useState,type ReactNode,type KeyboardEvent} from "react";
import {createPortal} from "react-dom";
import styles from "./meals.module.css";

/** 原生顶层气泡仍需显式锚定；不依赖浏览器默认 margin 或 CSS anchor 支持。 */
export function MealItemDetails({id,name,children}:{id:string;name:string;children:ReactNode}){
 const button=useRef<HTMLButtonElement>(null),bubble=useRef<HTMLDivElement>(null);
 const [host,setHost]=useState<HTMLDialogElement|null>(null);
 useLayoutEffect(()=>{setHost(button.current?.closest("dialog")??null);},[]);
 const [open,setOpen]=useState(false),[position,setPosition]=useState<{left:number;top:number;width:number;maxHeight:number}|null>(null);
 function close(keyboard=false){bubble.current?.hidePopover();if(keyboard)button.current?.focus({preventScroll:true});}
 function escape(event:KeyboardEvent){if(event.key==="Escape"&&bubble.current?.matches(":popover-open")){event.preventDefault();event.stopPropagation();close(true);}}
 useLayoutEffect(()=>{
  if(!open)return;
  const anchor=button.current!,node=bubble.current!,dialog=anchor.closest("dialog")!;
  let frame=0,dismissFrame=0;
  function place(){
   if(!node.matches(":popover-open"))return;
   const viewport=window.visualViewport,box=dialog.getBoundingClientRect(),a=anchor.getBoundingClientRect();
   const left=Math.max(box.left,viewport?.offsetLeft??0)+8,right=Math.min(box.right,(viewport?.offsetLeft??0)+(viewport?.width??innerWidth))-8;
   const top=Math.max(box.top,viewport?.offsetTop??0)+8,bottom=Math.min(box.bottom,(viewport?.offsetTop??0)+(viewport?.height??innerHeight))-8;
   if(a.bottom<=top||a.top>=bottom||a.right<=left||a.left>=right||right<=left||bottom<=top){
    cancelAnimationFrame(dismissFrame);
    // ResizeObserver后React可能仍在切换列布局，等下一帧确认按钮真正离开。
    dismissFrame=requestAnimationFrame(()=>{
     if(!node.matches(":popover-open"))return;
     const current=anchor.getBoundingClientRect(),bounds=dialog.getBoundingClientRect(),v=window.visualViewport;
     const l=Math.max(bounds.left,v?.offsetLeft??0)+8,r=Math.min(bounds.right,(v?.offsetLeft??0)+(v?.width??innerWidth))-8;
     const t=Math.max(bounds.top,v?.offsetTop??0)+8,b=Math.min(bounds.bottom,(v?.offsetTop??0)+(v?.height??innerHeight))-8;
     if(current.bottom<=t||current.top>=b||current.right<=l||current.left>=r)node.hidePopover();else place();
    });return;
   }
   const width=Math.min(320,right-left),below=Math.max(0,bottom-a.bottom-8),above=Math.max(0,a.top-top-8);
   node.style.width=width+"px";node.style.maxHeight=Math.min(360,Math.max(below,above))+"px";
   const height=node.getBoundingClientRect().height,down=height<=below||below>=above,maxHeight=Math.min(360,down?below:above);
   const next={width,maxHeight,left:Math.max(left,Math.min(a.right-width,right-width)),top:down?a.bottom+8:Math.max(top,a.top-8-Math.min(height,maxHeight))};
   setPosition(previous=>previous&&Object.keys(next).every(key=>previous[key as keyof typeof next]===next[key as keyof typeof next])?previous:next);
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(place);}
  function outside(event:PointerEvent){const path=event.composedPath();if(!path.includes(node)&&!path.includes(anchor))close();}
  function keyboard(event:globalThis.KeyboardEvent){if(event.key==="Escape"&&node.matches(":popover-open")){event.preventDefault();event.stopPropagation();close(true);}}
  place();
  document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",keyboard,true);
  const observer=new ResizeObserver(schedule);observer.observe(node);observer.observe(dialog);
  dialog.addEventListener("scroll",place,{passive:true});document.addEventListener("scroll",schedule,true);window.addEventListener("resize",schedule);window.visualViewport?.addEventListener("resize",schedule);window.visualViewport?.addEventListener("scroll",schedule);
  return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(dismissFrame);observer.disconnect();document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",keyboard,true);dialog.removeEventListener("scroll",place);document.removeEventListener("scroll",schedule,true);window.removeEventListener("resize",schedule);window.visualViewport?.removeEventListener("resize",schedule);window.visualViewport?.removeEventListener("scroll",schedule);};
 },[open]);
 return <><button ref={button} type="button" popoverTarget={id} aria-expanded={open} onClick={()=>host?.querySelectorAll<HTMLElement>("[data-meal-details]:popover-open").forEach(node=>{if(node!==bubble.current)node.hidePopover();})} aria-label={name+"详情"} onKeyDown={escape}>详情</button>{host&&createPortal(<div ref={bubble} popover="manual" data-meal-details id={id} role="dialog" aria-label={name+" · 营养依据"} className={styles.nutritionBubble} onKeyDown={escape} onToggle={event=>{const opened=event.newState==="open";setOpen(opened);if(!opened)setPosition(null);}} style={{...position,visibility:position?"visible":"hidden"}}>{children}</div>,host)}</>;
}
