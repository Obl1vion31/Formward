"use client";
import {useEffect,useRef,useState,type ReactNode,type ComponentPropsWithoutRef,type CSSProperties} from "react";
import {useMobileMode} from "./use-mobile-mode";
import {SelectedDateHeading} from "./daily-records";
import styles from "./record-trend-panel.module.css";
export type RecordMetric={id?:string;label:string;value:string;unit:string;tone?:"blue"|"red"|"gold";note?:string;reserveNote?:boolean;inlineUnit?:boolean};
export function RecordWorkspace({title,headingId,className="",children,...props}:ComponentPropsWithoutRef<"section">&{title:string;headingId?:string}){
 return <section {...props} className={styles.workspace+" "+className} data-record-workspace><header className={styles.pageHeading}><h1 id={headingId}>{title}</h1></header>{children}</section>;
}
export function RecordTrendPanel({range,custom,date,view,metrics,title,unit,options,legend,children,readoutLabel="选中日读数",metricVariants=[],labelVariants=[],noteVariants=[],flags,flagVariants=[],statistics,supplementary,statusInDate=false}:{
 range:ReactNode;custom?:ReactNode;date:string;view:()=>void;metrics:RecordMetric[];title:string;unit?:string;options?:ReactNode;legend:ReactNode;children:ReactNode;readoutLabel?:string;metricVariants?:string[][];labelVariants?:string[][];noteVariants?:string[][];flags?:string;flagVariants?:string[];statistics?:ReactNode;supplementary?:ReactNode;statusInDate?:boolean;
}){
 const mobile=useMobileMode();
 const metricRef=useRef<HTMLDivElement>(null),[columnLimit,setColumnLimit]=useState(metrics.length);
 const readingKey=metrics.map(metric=>metric.value+metric.unit).join("|"),variantKey=JSON.stringify(metricVariants);
 const labelKey=JSON.stringify(metrics.map((metric,index)=>[metric.label,...labelVariants.map(row=>row[index]).filter(Boolean)]));
 const noteKey=JSON.stringify(metrics.map((metric,index)=>[metric.note,...noteVariants.map(row=>row[index])].filter(Boolean)));
 const widthCache=useRef<{key:string;widths:number[]}>({key:"",widths:[]});
 useEffect(()=>{
  const group=metricRef.current;if(!group)return;
  const measure=()=>{
   const gap=parseFloat(getComputedStyle(group).columnGap)||0,nodes=[...group.querySelectorAll<HTMLElement>("[data-metric-number]")];
   const typography=nodes.map(node=>{const number=node.querySelector("span")!,unit=node.querySelector("small"),style=getComputedStyle(number);return {font:style.font||style.fontWeight+" "+style.fontSize+" "+style.fontFamily,unit:unit?unit.getBoundingClientRect().width+(parseFloat(getComputedStyle(unit).marginLeft)||0):0};});
   const labelNodes=[...group.querySelectorAll<HTMLElement>("[data-metric-label]")],noteNodes=[...group.querySelectorAll<HTMLElement>("[data-metric-note]")];
   const textFont=(node:HTMLElement)=>{const style=getComputedStyle(node);return style.font||style.fontWeight+" "+style.fontSize+" "+style.fontFamily;};
   const textStyles=labelNodes.map((node,index)=>({label:textFont(node),note:textFont(noteNodes[index])}));
   const cacheKey=variantKey+labelKey+noteKey+JSON.stringify([typography,textStyles]);
   if(widthCache.current.key!==cacheKey){
    const context=document.createElement("canvas").getContext("2d");
    const variants=JSON.parse(variantKey) as string[][];
    const labels=JSON.parse(labelKey) as string[][],notes=JSON.parse(noteKey) as string[][];
    widthCache.current={key:cacheKey,widths:typography.map((style,index)=>{
     if(!context)return 0;
     context.font=style.font;const values=variants.map(values=>context.measureText(values[index]??"—").width+style.unit);
     context.font=textStyles[index].label;const labelWidths=labels[index].map(label=>context.measureText(label+(metrics[index].inlineUnit?"":" · "+metrics[index].unit)).width);
     context.font=textStyles[index].note;const noteWidths=notes[index].map(note=>context.measureText(note).width);
     return Math.ceil(Math.max(0,...values,...labelWidths,...noteWidths));
    })};
   }
   const values=nodes.map((node,index)=>Math.max(node.scrollWidth,widthCache.current.widths[index]??0));
   let count=metrics.length===6&&(mobile||group.clientWidth<860)?3:metrics.length;
   while(count>1){
    const available=group.clientWidth-gap*(count-1),weights=count===4?[1.5,1,1,1]:Array(count).fill(1),total=weights.reduce((a,b)=>a+b,0);
    if(values.every((width,index)=>width<=available*weights[index%count]/total+1))break;
    count=count===6?3:count>2?2:1;
   }
   setColumnLimit(current=>current===count?current:count);
  };
  const observer=new ResizeObserver(measure);observer.observe(group);
  const frame=requestAnimationFrame(measure);
  return()=>{observer.disconnect();cancelAnimationFrame(frame);};
 },[readingKey,variantKey,labelKey,noteKey,metrics.length,mobile,metrics]);
 const columns=Math.min(columnLimit,metrics.length);
 const statusVariants=[...new Set([...flagVariants,flags].filter((value):value is string=>Boolean(value)))];
 return <div className={styles.panel} data-record-trend data-status-in-date={statusInDate||undefined}>
  <div className={styles.date} data-record-slot="date"><SelectedDateHeading date={date} view={view} status={statusInDate?<span className={styles.dateStatus} role="status" title={flags||undefined}>{flags??""}</span>:undefined}/></div>
  <div className={statistics?styles.readingArea:undefined}>
  <div ref={metricRef} role="group" aria-label={readoutLabel} data-selected-date={date} aria-live="polite" aria-atomic="true" className={styles.metrics} data-record-slot="metrics" data-metric-count={metrics.length} data-record-columns={columns} style={{"--record-layout":columns===4?"1.5fr repeat(3,minmax(0,1fr))":"repeat("+columns+",minmax(0,1fr))"} as CSSProperties}>{metrics.map((metric,index)=>{
   const labels=[...new Set([metric.label,...labelVariants.map(row=>row[index]).filter(Boolean)])];
   const notes=[...new Set([metric.note,...noteVariants.map(row=>row[index])].filter((value):value is string=>Boolean(value)))];
   return <div key={metric.id??index} className={styles.metric}>
    <div className={styles.metricLabel} data-metric-label>{labels.map(label=><span key={label} className={styles.metricMeasure} aria-hidden="true">{label}{!metric.inlineUnit&&<small> · {metric.unit}</small>}</span>)}<span>{metric.label}{!metric.inlineUnit&&<small> · {metric.unit}</small>}</span></div>
    <strong data-metric-number className={metric.tone?styles[metric.tone]:undefined}><span>{metric.value}</span>{metric.inlineUnit&&<small>{metric.unit}</small>}</strong>
    <div className={styles.metricNote} data-metric-note>{notes.map(note=><em key={note} className={styles.metricMeasure} aria-hidden="true">{note}</em>)}{metric.note?<em>{metric.note}</em>:metric.reserveNote?<em className={styles.metricMeasure} aria-hidden="true">{"\u00a0"}</em>:null}</div>
   </div>;
  })}</div>
  {statistics}</div>
  {supplementary}
  {!statusInDate&&statusVariants.length>0&&<div className={styles.flags} data-record-slot="status">{statusVariants.map(value=><span key={value} aria-hidden="true" className={styles.flagMeasure}>{value}</span>)}<span role="status">{flags??""}</span></div>}
  <div className={styles.range} data-record-slot="range">{range}</div>{custom}
  <div className={styles.plotHeading} data-record-slot="title"><h2>{title}{unit&&<small>{unit}</small>}</h2><div className={styles.legend} data-record-slot="legend">{legend}</div>{options&&<div className={styles.plotOptions}>{options}</div>}</div>
  <div className={styles.plot} data-record-slot="plot">{children}</div>
 </div>;
}
export function InlineChartControls({children}:{children:ReactNode}){
 return <div className={styles.controls} data-chart-controls>{children}</div>;
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
