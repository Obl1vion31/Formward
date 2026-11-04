"use client";
import {useId,useLayoutEffect,useRef,type ReactNode} from "react";
import styles from "./chart-selection-marker.module.css";

type MarkerProps={x:number|null;y?:number;resetKey:string;direct?:boolean;children:ReactNode};

/** 只移动选日标记；中断时续接当前位置，不插值健康读数。 */
export function ChartSelectionMarker({x,y=0,resetKey,direct=false,children}:MarkerProps){
 const node=useRef<SVGGElement>(null),animation=useRef<Animation|null>(null),previous=useRef<{key:string;x:number|null;y:number}|null>(null);
 useLayoutEffect(()=>{
  const element=node.current!,last=previous.current;
  const from=animation.current?getComputedStyle(element).transform:last?`translate(${last.x??0}px, ${last.y}px)`:null;
  animation.current?.cancel();animation.current=null;
  if(x!==null&&last?.x!==null&&last?.key===resetKey&&!direct&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches&&from&&element.animate){
   animation.current=element.animate([{transform:from},{transform:`translate(${x}px, ${y}px)`}],{duration:100,easing:"cubic-bezier(.2,0,0,1)",fill:"both"});
  }
  previous.current={key:resetKey,x,y};
 },[x,y,resetKey,direct]);
 useLayoutEffect(()=>{
  const query=window.matchMedia("(prefers-reduced-motion: reduce)"),stop=()=>{if(query.matches){animation.current?.cancel();animation.current=null;}};
  query.addEventListener("change",stop);return()=>{query.removeEventListener("change",stop);animation.current?.cancel();};
 },[]);
 return <g ref={node} data-chart-selection-marker aria-hidden="true" pointerEvents="none" style={{transform:`translate(${x??0}px, ${y}px)`,visibility:x===null?"hidden":undefined}}>{children}</g>;
}

type PlotBounds={left:number;right:number;top:number;bottom:number};
/** 背景和辅助线共用同一变换；图表将本层放在真实数据之前。 */
export function ChartSelectionColumn({x,date,column,plot,resetKey,direct=false,baselineTick=false}:Omit<MarkerProps,"y"|"children">&{date:string|null;column:{left:number;right:number}|null;plot:PlotBounds;baselineTick?:boolean}){
 const id=useId().replaceAll(":",""),left=Math.max(plot.left,column?.left??plot.left),right=Math.min(plot.right,column?.right??plot.right);
 return <>
  <defs><clipPath id={id}><rect x={plot.left} y={plot.top} width={Math.max(0,plot.right-plot.left)} height={Math.max(0,plot.bottom-plot.top)+(baselineTick?12:0)}/></clipPath></defs>
  <g className={styles.column} data-chart-selection-column data-selected-date={date??undefined} clipPath={`url(#${id})`} aria-hidden="true">
   <ChartSelectionMarker x={x} resetKey={resetKey} direct={direct}>
    <rect data-chart-selection-band x={left-(x??0)} y={plot.top} width={Math.max(0,right-left)} height={Math.max(0,plot.bottom-plot.top)} className={styles.band}/>
    <line data-chart-selection-line data-crosshair-date={date??undefined} x1="0" x2="0" y1={plot.top} y2={plot.bottom} className={styles.line}/>
    {baselineTick&&<path data-chart-selection-tick d={`M 0 ${plot.bottom+4} v 6`} className={styles.tick}/>}
   </ChartSelectionMarker>
  </g>
 </>;
}

export function ChartSelectionPoint({color,...props}:Omit<MarkerProps,"children">&{color:string}){
 return <ChartSelectionMarker {...props}><circle data-chart-selection-point r="6" stroke={color} className={styles.point}/></ChartSelectionMarker>;
}
