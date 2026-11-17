"use client";
import {ModuleSkeleton} from "./module-skeleton";
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type ComponentPropsWithoutRef,type CSSProperties} from "react";
import {useMobileMode} from "./use-mobile-mode";
import {SelectedDateHeading} from "./daily-records";
import styles from "./record-trend-panel.module.css";
export type RecordMetric={pending?:boolean;id?:string;label:string;value:string;unit:string;tone?:"blue"|"red"|"gold";note?:string;reserveNote?:boolean;inlineUnit?:boolean;select?:()=>void;selected?:boolean;graphic?:ReactNode;action?:ReactNode};
export function RecordWorkspace({title,headingId,className="",children,...props}:ComponentPropsWithoutRef<"section">&{title:string;headingId?:string}){
 return <section {...props} className={styles.workspace+" "+className} data-record-workspace><header className={styles.pageHeading}><h1 id={headingId}>{title}</h1></header>{children}</section>;
}
export function RecordTrendPanel({range,custom,date,view,metrics,title,unit,options,legend,children,readoutLabel="选中日读数",metricVariants=[],labelVariants=[],noteVariants=[],flags,flagVariants=[],statistics,supplementary,statusInDate=false,presentation,mobileMetrics,graphic,loading=false,chartSummary}:{
 mobileMetrics?:RecordMetric[];chartSummary?:ReactNode;presentation?:"nutrition"|"energy"|"body";graphic?:ReactNode;loading?:boolean;range:ReactNode;custom?:ReactNode;date:string;view:()=>void;metrics:RecordMetric[];title:string;unit?:string;options?:ReactNode;legend:ReactNode;children:ReactNode;readoutLabel?:string;metricVariants?:string[][];labelVariants?:string[][];noteVariants?:string[][];flags?:string;flagVariants?:string[];statistics?:ReactNode;supplementary?:ReactNode;statusInDate?:boolean;
}){
 const mobile=useMobileMode();
 const metricRef=useRef<HTMLDivElement>(null),[columnLimit,setColumnLimit]=useState(metrics.length);
 const readingKey=metrics.map(metric=>metric.value+metric.unit).join("|"),variantKey=JSON.stringify(metricVariants);
 const metricLayoutKey=JSON.stringify(metrics.map(metric=>[metric.inlineUnit,metric.unit]));
 const labelKey=JSON.stringify(metrics.map((metric,index)=>[metric.label,...labelVariants.map(row=>row[index]).filter(Boolean)]));
 const noteKey=JSON.stringify(metrics.map((metric,index)=>[metric.note,...noteVariants.map(row=>row[index])].filter(Boolean)));
 const widthCache=useRef<{key:string;widths:number[]}>({key:"",widths:[]});
 useLayoutEffect(()=>{
  const group=metricRef.current;if(!group)return;
  const measure=()=>{
   const groupWidth=group.clientWidth;
   if(!groupWidth)return;
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
     context.font=textStyles[index].label;const labelWidths=labels[index].map(label=>context.measureText(label+(metrics[index].inlineUnit?"":" · "+(metrics[index].unit==="kcal"?"千卡":metrics[index].unit))).width);
     context.font=textStyles[index].note;const noteWidths=notes[index].map(note=>context.measureText(note).width);
     return Math.ceil(Math.max(0,...values,...labelWidths,...noteWidths));
    })};
   }
   const values=nodes.map((node,index)=>Math.max(node.scrollWidth,widthCache.current.widths[index]??0));
   const desktopCards=mobile===false&&presentation!==undefined;
   let count=metrics.length===6&&(mobile||groupWidth<860)?3:metrics.length;
   while(count>1){
    const available=groupWidth-gap*(count-1),weights=count===4?[1.5,1,1,1]:count===3&&desktopCards&&(presentation==='energy'||presentation==='body')?[1.5,1,1]:Array(count).fill(1),total=weights.reduce((a,b)=>a+b,0);
    if(values.every((width,index)=>width+(desktopCards?36+(index===0?(presentation==='energy'?136:108):0):0)<=available*weights[index%count]/total+1))break;
    count=count===6?3:count>2?2:1;
   }
   if(presentation){const heroStack=String(values[0]+160>(group.firstElementChild?.clientWidth??groupWidth)),relevant=values.slice(1),cols=presentation==='nutrition'?3:2,richStack=String(relevant.some(width=>width+24>(groupWidth-gap*(cols-1))/cols));if(group.dataset.heroStack!==heroStack)group.dataset.heroStack=heroStack;if(group.dataset.richStack!==richStack)group.dataset.richStack=richStack;}
   setColumnLimit(current=>current===count?current:count);
  };
  const observer=new ResizeObserver(measure);observer.observe(group);
  measure();
  return()=>{observer.disconnect();};
 // metrics的对象身份随外壳状态改变；相同内容不重建观察器或同步测量整页。
 // 所有影响测量的字段分别包含在这些内容键中，窗口/字体尺寸仍由观察器接管。
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[readingKey,variantKey,labelKey,noteKey,metricLayoutKey,metrics.length,mobile,presentation]);
 const columns=Math.min(columnLimit,metrics.length);
 const statusVariants=[...new Set([...flagVariants,flags].filter((value):value is string=>Boolean(value)))];
 return <div className={styles.panel} data-panel-presentation={presentation} data-record-trend data-status-in-date={statusInDate||undefined}>
  <div className={styles.date} data-record-slot="date"><SelectedDateHeading date={date} view={view} pending={loading} status={statusInDate?<span className={styles.dateStatus} role="status" title={flags||undefined}>{flags??""}</span>:undefined}/></div>
  <div className={statistics?styles.readingArea:undefined}>
  <div ref={metricRef} role="group" aria-label={readoutLabel} data-selected-date={date} aria-live="polite" aria-atomic="true" className={styles.metrics} data-record-slot="metrics" data-presentation={presentation} data-loading={loading||undefined} aria-busy={loading||undefined} data-metric-count={metrics.length} data-record-columns={columns} style={{"--record-layout":columns===4?"1.5fr repeat(3,minmax(0,1fr))":columns===3&&(presentation==='energy'||presentation==='body')?"1.5fr repeat(2,minmax(0,1fr))":"repeat("+columns+",minmax(0,1fr))"} as CSSProperties}>{metrics.map((metric,index)=>{
   const labels=[...new Set([metric.label,...labelVariants.map(row=>row[index]).filter(Boolean)])];
   const notes=[...new Set([metric.note,...noteVariants.map(row=>row[index])].filter((value):value is string=>Boolean(value)))];
   const pending=metric.pending??loading;
   return <div key={metric.id??index} className={styles.metric} data-pending={pending||undefined} data-selected={metric.selected||undefined}>
    {metric.select&&<button type="button" className={styles.metricSelect} aria-label={"查看"+metric.label+"趋势"} aria-pressed={metric.selected} onClick={metric.select}/>}
    {metric.action&&<div className={styles.metricAction}>{metric.action}</div>}
    <div className={styles.metricLabel} data-metric-label>{labels.map(label=><span key={label} className={styles.metricMeasure} aria-hidden="true">{label}{!metric.inlineUnit&&<small> · {metric.unit==="kcal"?"千卡":metric.unit}</small>}</span>)}<span>{metric.label}{!metric.inlineUnit&&<small> · {metric.unit==="kcal"?"千卡":metric.unit}</small>}</span></div>
    <strong aria-hidden={pending||undefined} data-metric-number className={metric.tone?styles[metric.tone]:undefined}>{pending?<span className={styles.pendingNumber}><span className={styles.metricMeasure}>—</span><ModuleSkeleton shape="number" label="正在读取读数…"/></span>:<span>{metric.value}</span>}{metric.inlineUnit&&<small>{metric.unit==="kcal"?"千卡":metric.unit}</small>}</strong>
    <div className={styles.metricNote} data-metric-note data-reserve-note={metric.reserveNote||undefined}>{notes.map(note=><em key={note} className={styles.metricMeasure} aria-hidden="true">{note}</em>)}{metric.note?<em>{metric.note}</em>:metric.reserveNote?<em className={styles.metricMeasure} aria-hidden="true">{"\u00a0"}</em>:null}</div>
    {(metric.graphic||index===0&&graphic)&&<div className={styles.metricGraphic}>{metric.graphic??graphic}</div>}
   </div>;
  })}</div>
  {presentation&&<MobileRecordReadings metrics={mobileMetrics??metrics} presentation={presentation} graphic={graphic} loading={loading} date={date} label={readoutLabel}/>}
  {statistics}</div>
  {supplementary}
  {!statusInDate&&statusVariants.length>0&&<div className={styles.flags} data-record-slot="status">{statusVariants.map(value=><span key={value} aria-hidden="true" className={styles.flagMeasure}>{value}</span>)}<span role="status">{flags??""}</span></div>}
  <div className={styles.range} data-record-slot="range">{range}</div>{custom}
  <div className={styles.plotHeading} data-record-slot="title"><h2>{title}{unit&&<small>{unit==="kcal"?"千卡":unit}</small>}</h2><div className={styles.legend} data-record-slot="legend">{legend}</div>{options&&<div className={styles.plotOptions}>{options}</div>}</div>
  {chartSummary&&<div className={styles.chartSummary} data-record-slot="summary">{chartSummary}</div>}
  <div className={styles.plot} data-record-slot="plot">{children}</div>
 </div>;
}
export function InlineChartControls({children}:{children:ReactNode}){
 return <div className={styles.controls} data-chart-controls>{children}</div>;
}
export function ChartOptions({children,label="显示选项",disabled=false}:{children:ReactNode;label?:string;disabled?:boolean}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))ref.current.open=false;};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);},[]);
 return <details ref={ref} className={styles.options} data-chart-controls onKeyDown={event=>{if(event.key==="Escape"&&ref.current?.open){event.preventDefault();event.stopPropagation();ref.current.open=false;ref.current.querySelector("summary")?.focus();}}}><summary aria-disabled={disabled||undefined} onClick={event=>{if(disabled)event.preventDefault();}}>{label}</summary><div>{children}</div></details>;
}
export function CustomRecordRange({label,value,change,apply,cancel}:{label:string;value:{from:string;to:string};change:(next:{from:string;to:string})=>void;apply:()=>void;cancel:()=>void}){
 const valid=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 const days=(Date.parse(value.to)-Date.parse(value.from))/86400000+1,okay=valid(value.from)&&valid(value.to)&&days>0&&days<=3661;
 return <form className={styles.custom} data-chart-controls aria-label="自定义日期范围" onSubmit={event=>{event.preventDefault();if(okay)apply();}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel();}}}><label>开始<input autoFocus type="date" required aria-label={label+"开始日期"} value={value.from} onChange={event=>change({...value,from:event.target.value})}/></label><label>结束<input type="date" required aria-label={label+"结束日期"} value={value.to} onChange={event=>change({...value,to:event.target.value})}/></label><div><button disabled={!okay} type="submit">应用</button><button type="button" onClick={cancel}>取消</button></div>{!okay&&<p role="status">请选择有效日期范围，最长10年。</p>}</form>;
}

function MobileRecordReadings({metrics,presentation,graphic,loading,date,label}:{metrics:RecordMetric[];presentation:"nutrition"|"body"|"energy";graphic?:ReactNode;loading:boolean;date:string;label:string}){
 const first=metrics[0];if(!first)return null;
 const number=(metric:RecordMetric,primary=false)=>{const pending=metric.pending??loading;return <strong className={(primary?styles.mobilePrimary:styles.mobileStatValue)+" "+(metric.tone?styles[metric.tone]:"")} data-metric-number><span className={pending?styles.mobileNumberLoading:undefined}>{pending?<><span className={styles.mobileNumberMeasure} aria-hidden="true">—</span><ModuleSkeleton shape="number" label="读数加载中"/></>:metric.value}</span><small>{metric.unit==="kcal"?"千卡":metric.unit}</small></strong>;};
 const caption=<span className={styles.mobileCaption}>{presentation==="nutrition"?"当天摄入":first.label}</span>;
 const mark=first.graphic??graphic;
 if(presentation==="nutrition")return <details className={styles.mobileReading+" "+styles.mobileNutrition} data-record-slot="metrics" data-presentation={presentation} data-selected-date={date} aria-label={label} aria-busy={loading||undefined}><summary><div>{caption}{number(first,true)}</div><span className={styles.nutritionControl}>{mark}<span>营养详情</span><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span></summary><dl className={styles.mobileNutrients}>{metrics.slice(1).map(metric=><div key={metric.label}><dt>{metric.label}</dt><dd>{number(metric)}{!(metric.pending??loading)&&metric.note&&<small>{metric.note}</small>}</dd></div>)}</dl></details>;
 return <div className={styles.mobileReading+" "+(presentation==="body"?styles.mobileBody:styles.mobileEnergy)} data-record-slot="metrics" data-presentation={presentation} data-selected-date={date} role="group" aria-label={label} aria-busy={loading||undefined}>
   <div className={styles.mobileHero}>{caption}{first.action&&<div className={styles.mobileAction}>{first.action}</div>}{number(first,true)}{presentation==="body"&&mark&&<div className={styles.mobileSpark}>{mark}</div>}</div>
   {presentation==="energy"?graphic:<div className={styles.mobileStats}>{metrics.slice(1).map(metric=><div key={metric.id??metric.label}><span>{metric.label.replace("7日平均体重","7日均")}</span>{number(metric)}</div>)}</div>}
 </div>;
}
