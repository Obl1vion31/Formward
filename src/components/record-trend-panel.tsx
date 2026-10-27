"use client";
import {useEffect,useRef,type ReactNode,type ComponentPropsWithoutRef,type CSSProperties} from "react";
import {SelectedDateHeading} from "./daily-records";
import styles from "./record-trend-panel.module.css";
export type RecordMetric={label:string;value:string;unit:string;tone?:"blue"|"red"|"gold";note?:string};
export function RecordWorkspace({title,headingId,className="",children,...props}:ComponentPropsWithoutRef<"section">&{title:string;headingId?:string}){
 return <section {...props} className={styles.workspace+" "+className} data-record-workspace><header className={styles.pageHeading}><h1 id={headingId}>{title}</h1></header>{children}</section>;
}
export function RecordTrendPanel({range,custom,date,view,metrics,title,options,legend,children,readoutLabel="选中日读数",flags}:{
 range:ReactNode;custom?:ReactNode;date:string;view:()=>void;metrics:RecordMetric[];title:string;options?:ReactNode;legend:ReactNode;children:ReactNode;readoutLabel?:string;flags?:string;
}){
 const columns=metrics.some(metric=>metric.value.length>(metrics.length===4?7:metrics.length===3?9:13))?Math.min(2,metrics.length):metrics.length;
 return <div className={styles.panel} data-record-trend>
  <div className={styles.range} data-record-slot="range">{range}</div>{custom}
  <div className={styles.date} data-record-slot="date"><SelectedDateHeading date={date} view={view}/></div>
  <div role="group" aria-label={readoutLabel} data-selected-date={date} aria-live="polite" aria-atomic="true" className={styles.metrics} data-record-slot="metrics" style={{"--record-layout":columns===4?"1.125fr repeat(3,minmax(0,1fr))":"repeat("+columns+",minmax(0,1fr))"} as CSSProperties}>{metrics.map(metric=><div key={metric.label} className={styles.metric}><span>{metric.label}<small> · {metric.unit}</small></span><strong className={metric.tone?styles[metric.tone]:undefined}>{metric.value}</strong>{metric.note&&<em>{metric.note}</em>}</div>)}</div>
  {flags&&<p className={styles.flags}>{flags}</p>}
  <div className={styles.plotHeading} data-record-slot="title"><h2>{title}</h2>{options}</div>
  <div className={styles.legend} data-record-slot="legend">{legend}</div>
  <div className={styles.plot} data-record-slot="plot">{children}</div>
 </div>;
}
export function ChartOptions({children,label="显示选项"}:{children:ReactNode;label?:string}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))ref.current.open=false;};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[]);
 return <details ref={ref} className={styles.options} data-chart-controls onKeyDown={event=>{if(event.key==="Escape"&&ref.current?.open){event.preventDefault();event.stopPropagation();ref.current.open=false;ref.current.querySelector("summary")?.focus();}}}><summary>{label}</summary><div>{children}</div></details>;
}
export function CustomRecordRange({label,value,change,apply,cancel}:{label:string;value:{from:string;to:string};change:(next:{from:string;to:string})=>void;apply:()=>void;cancel:()=>void}){
 const valid=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 const days=(Date.parse(value.to)-Date.parse(value.from))/86400000+1,okay=valid(value.from)&&valid(value.to)&&days>0&&days<=3661;
 return <form className={styles.custom} data-chart-controls aria-label="自定义日期范围" onSubmit={event=>{event.preventDefault();if(okay)apply();}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel();}}}><label>开始<input autoFocus type="date" required aria-label={label+"开始日期"} value={value.from} onChange={event=>change({...value,from:event.target.value})}/></label><label>结束<input type="date" required aria-label={label+"结束日期"} value={value.to} onChange={event=>change({...value,to:event.target.value})}/></label><div><button disabled={!okay} type="submit">应用</button><button type="button" onClick={cancel}>取消</button></div>{!okay&&<p role="status">请选择有效日期范围，最长10年。</p>}</form>;
}
