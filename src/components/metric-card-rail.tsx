"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { LoadingLink } from "./loading-link";
import { useChartTransition } from "./chart-transition-state";
import { TrendGlyph } from "./trend-glyph";
import type { MetricTrendModel } from "./metric-trend-model";
import styles from "./metric-card-rail.module.css";

export type MetricCard = { title: string; value: string; unit: string; date: string; fact?: string; href: string; trend: MetricTrendModel };
export function MetricCardRail({ cards, preview, accountId }: { accountId?:string; cards: MetricCard[]; preview?: (card:MetricCard)=>void }) {
  const rail=useRef<HTMLDivElement>(null), transition=useChartTransition();
  const pointer=useRef<{x:number;y:number;left:number;moved:boolean}|null>(null), suppressed=useRef(false);
  useLayoutEffect(()=>{if(rail.current&&!preview)transition.restore(rail.current);},[transition,preview]);
  useEffect(()=>{const node=rail.current;if(!node||preview||!accountId||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const key='formward:rail-hint:'+accountId;try{if(localStorage.getItem(key))return;}catch{return;}let animation:Animation|undefined;const stop=()=>{clearTimeout(timer);animation?.cancel();};const timer=setTimeout(()=>{if(node.scrollLeft>1||document.hidden||document.documentElement.dataset.chartTravel)return;const card=node.querySelector<HTMLElement>('[data-metric-card="morning-weight"]');if(!card||!card.getClientRects().length)return;try{localStorage.setItem(key,'seen');}catch{}animation=card.animate([{transform:'translateX(0)'},{transform:'translateX(-8px)',offset:.24},{transform:'translateX(0)',offset:.48},{transform:'translateX(-8px)',offset:.74},{transform:'translateX(0)'}],{duration:1050,easing:'ease-in-out'});},650);node.addEventListener('pointerdown',stop,{passive:true});node.addEventListener('scroll',stop,{passive:true});node.addEventListener('focusin',stop);return()=>{stop();node.removeEventListener('pointerdown',stop);node.removeEventListener('scroll',stop);node.removeEventListener('focusin',stop);};},[accountId,preview]);
  useLayoutEffect(()=>{const node=rail.current;if(!node)return;const measure=()=>{for(const card of node.querySelectorAll<HTMLElement>('[data-metric-card]')){const strong=card.querySelector('strong');if(!strong)continue;const range=document.createRange();range.selectNodeContents(strong);const available=card.clientWidth-32-Math.max(80,(card.clientWidth-32-12)*.3)-12;card.dataset.stack=String(range.getBoundingClientRect().width>available);}};const observer=new ResizeObserver(measure);observer.observe(node);measure();void document.fonts.ready.then(measure);return()=>observer.disconnect();},[cards]);
  return <div ref={rail} className={styles.rail} data-metric-rail aria-label="最近状态，可左右滑动" onDragStart={event=>event.preventDefault()}
    onPointerDown={event=>{suppressed.current=false;if(event.button!==0||!event.isPrimary)return;pointer.current={x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,moved:false};}}
    onPointerMove={event=>{const p=pointer.current;if(!p)return;const dx=event.clientX-p.x,dy=event.clientY-p.y;if(!p.moved&&Math.abs(dy)>Math.abs(dx)+4){pointer.current=null;return;}if(Math.abs(dx)>7)p.moved=true;if(p.moved&&event.pointerType==="mouse"){event.currentTarget.style.scrollSnapType="none";event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.scrollLeft=p.left-dx;}}}
    onPointerUp={event=>{suppressed.current=!!pointer.current?.moved;pointer.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);const node=event.currentTarget;node.style.scrollSnapType="";if(suppressed.current&&event.pointerType==="mouse"){const left=node.getBoundingClientRect().left;const positions=[...node.querySelectorAll<HTMLElement>("[data-metric-card]")].map(card=>card.getBoundingClientRect().left-left+node.scrollLeft-16);const nearest=positions.reduce((a,b)=>Math.abs(b-node.scrollLeft)<Math.abs(a-node.scrollLeft)?b:a,positions[0]??0);node.scrollTo({left:nearest,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}}}
    onPointerCancel={event=>{event.currentTarget.style.scrollSnapType="";pointer.current=null;suppressed.current=true;}}
    onClickCapture={event=>{if(suppressed.current){event.preventDefault();event.stopPropagation();}}}>
    {cards.map(card=><LoadingLink key={card.trend.kind} href={card.href} className={styles.card} data-metric-card={card.trend.kind} aria-label={`${card.title} ${card.value} ${card.unit}，${card.date}${card.fact?"，"+card.fact:""}。查看趋势和记录`} onNavigate={event=>{
      const element=rail.current?.querySelector<SVGSVGElement>(`[data-metric-card="${card.trend.kind}"] [data-trend-glyph]`);
      if(preview){event.preventDefault();preview(card);return;}
      if(card.trend.kind==="energy"||!element)return;
      event.preventDefault();void transition.navigate(card.href,card.trend,element,rail.current);
    }}>
      <span className={styles.title}>{card.title}</span><svg className={styles.arrow} width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.3" fill="none" aria-hidden="true"><path d="M4 12 12 4M5 4h7v7"/></svg>
      <strong>{card.value}<small>{card.unit}</small></strong>
      <div className={styles.glyph}><TrendGlyph model={card.trend}/></div>
      <p><time dateTime={card.date}>{card.date?card.date.slice(5).replace("-","."):"暂无记录"}</time>{card.fact&&<> · {card.fact}</>}</p>
      <span className={styles.range}>{card.trend.points[0]?.date.slice(5).replace("-",".")}—{card.trend.points.at(-1)?.date.slice(5).replace("-",".")}</span>
    </LoadingLink>)}
  </div>;
}
