"use client";
import {useId,type ReactNode} from "react";
import styles from "./surface.module.css";
export function TaskGroup({kind,title,description,count,open,onToggle,children}:{kind:"supplements"|"reviews"|"tools";title:string;description:ReactNode;count:string;open:boolean;onToggle?:()=>void;children?:ReactNode}){
 const id=useId();
 const summary=<>
 <svg className={styles.groupIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{kind==="supplements"?<><rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 11h8M8 15h8"/></>:kind==="reviews"?<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>}</svg>
 <span className={styles.groupCopy}><strong>{title}</strong><small>{description}</small></span>
 <span className={styles.count}>{count}</span></>;
 return <section className={styles.taskGroup} data-open={open}>
  {onToggle
   ? <button type="button" className={styles.groupToggle} data-assistant-group={kind} aria-expanded={open} aria-controls={id} onClick={onToggle}>
    {summary}<svg className={styles.groupChevron} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
   </button>
   : <div className={styles.groupToggle} data-assistant-group={kind}>{summary}</div>}
  {onToggle && <div className={styles.groupReveal} data-open={open} id={id} inert={!open} aria-hidden={!open}><div><div className={styles.groupBody}>{children}</div></div></div>}
 </section>;
}
