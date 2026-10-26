"use client";
import {useRef,useState,type ReactNode} from "react";
import {DailyRecordRow} from "./daily-records";
import styles from "./record-ui.module.css";
/** 隐藏历史列表而不卸载，返回时保留滚动及触发按钮。 */
export function RecordHistory({today,dates,initialDate,render,summary}:{today:string;dates:string[];initialDate?:string|null;render:(date:string)=>ReactNode;summary:(date:string)=>ReactNode}){
 const [date,setDate]=useState(initialDate??null),[limit,setLimit]=useState(50),list=useRef<HTMLDivElement>(null),position=useRef({scroll:0,trigger:null as HTMLElement|null});
 function open(next:string){position.current={scroll:list.current?.closest("dialog")?.scrollTop??0,trigger:document.activeElement as HTMLElement};setDate(next);}
 return <><div hidden={date!==null} ref={list}><label className={styles.historyDate}>查看日期<input aria-label="查看日期" type="date" max={today} onChange={e=>{if(e.target.value)open(e.target.value);}}/></label>{dates.slice(0,limit).map(day=><DailyRecordRow key={day} date={day} today={today} value={summary(day)}><button onClick={()=>open(day)}>查看</button></DailyRecordRow>)}{limit<dates.length&&<button type="button" onClick={()=>setLimit(n=>n+50)}>加载更早日期</button>}</div>{date&&<><button type="button" onClick={()=>{setDate(null);requestAnimationFrame(()=>{const panel=list.current?.closest("dialog");if(panel)panel.scrollTop=position.current.scroll;position.current.trigger?.focus({preventScroll:true});});}}>← 返回完整历史</button>{render(date)}</>}</>;
}
