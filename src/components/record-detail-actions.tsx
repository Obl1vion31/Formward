"use client";
import {useEffect,useRef} from "react";
import recordUI from "./record-ui.module.css";
import styles from "./record-detail-actions.module.css";

/** 仅用于编辑任务：编辑直接可见，删除留在本记录的更多操作中。 */
export function RecordDetailActions({edit,remove,busy,editLabel="编辑",removeLabel="删除",recordLabel}:{edit:()=>void;remove:()=>void;busy:boolean;editLabel?:string;removeLabel?:string;recordLabel:string}){
 const more=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{const node=more.current;if(node?.open&&event.target instanceof Node&&!node.contains(event.target))node.open=false;};
  document.addEventListener("pointerdown",outside);
  return()=>document.removeEventListener("pointerdown",outside);
 },[]);
 return <div className={styles.actions} data-record-detail-actions>
  <button type="button" className={recordUI.editAction} disabled={busy} onClick={edit}>{editLabel}</button>
  <details ref={more} className={styles.more} onKeyDown={event=>{
   if(event.key==="Escape"&&event.currentTarget.open){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector("summary")?.focus({preventScroll:true});}
  }} onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))event.currentTarget.open=false;}}>
   <summary className={recordUI.secondary} aria-label={recordLabel+"的更多操作"}>更多</summary>
   <div><button type="button" className={recordUI.secondary} disabled={busy} onClick={()=>{if(more.current)more.current.open=false;remove();}}>{removeLabel}</button></div>
  </details>
 </div>;
}
