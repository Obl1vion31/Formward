"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {registerConfirmation,setConfirmationOpen,type ConfirmationRequest} from "./confirmation-state";
import {lockPageScroll} from "./scroll-lock";
import styles from "./confirmation.module.css";
export function ConfirmationProvider({children}:{children:ReactNode}){
 const queue=useRef<ConfirmationRequest[]>([]),current=useRef<ConfirmationRequest|null>(null),[request,setRequest]=useState<ConfirmationRequest|null>(null);
 useEffect(()=>{registerConfirmation(next=>{if(current.current)queue.current.push(next);else{current.current=next;setConfirmationOpen(true);setRequest(next);}});return()=>{registerConfirmation(null);current.current?.resolve(false);for(const item of queue.current)item.resolve(false);queue.current=[];current.current=null;setConfirmationOpen(false);};},[]);
 function finish(value:boolean){const item=current.current;if(!item)return;const next=queue.current.shift()??null;current.current=next;setRequest(next);setConfirmationOpen(!!next);item.resolve(value);}
 return <>{children}{request&&<ConfirmationDialog key={request.title+request.message} request={request} finish={finish}/>}</>;
}
function ConfirmationDialog({request,finish}:{request:ConfirmationRequest;finish:(value:boolean)=>void}){
 const ref=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const node=ref.current!,previous=document.activeElement,unlock=lockPageScroll();node.showModal();cancel.current?.focus();return()=>{node.close();unlock();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className={styles.dialog} aria-label={request.title} onKeyDown={event=>{if(event.key==="Escape")event.stopPropagation();}} onCancel={event=>{event.preventDefault();event.stopPropagation();finish(false);}} onClick={event=>{if(event.target!==event.currentTarget)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)finish(false);}}>
  <h2>{request.title}</h2><p>{request.message}</p><div className={styles.actions}><button ref={cancel} onClick={()=>finish(false)}>取消</button><button className={request.danger?styles.danger:styles.confirm} onClick={()=>finish(true)}>{request.confirmLabel??"继续"}</button></div>
 </dialog>;
}
