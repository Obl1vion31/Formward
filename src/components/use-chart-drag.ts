"use client";
import {useRef,type PointerEvent,type MouseEvent} from "react";
/** 横向选择日期；纵向交还页面滚动，不扩大重叠命中区。 */
export function useChartDrag(dates:string[],width:number,left:number,right:number,choose:(date:string)=>void) {
 const start=useRef<{id:number;x:number;y:number;dragged:boolean;cancelled:boolean}|null>(null),suppress=useRef(false);
 function select(event:PointerEvent<SVGSVGElement>){const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)*width/rect.width;const index=Math.max(0,Math.min(dates.length-1,Math.floor((x-left)/(width-left-right)*dates.length)));if(dates[index])choose(dates[index]);}
 return {onPointerDown:(e:PointerEvent<SVGSVGElement>)=>{if(e.pointerType!=="mouse"){suppress.current=false;start.current={id:e.pointerId,x:e.clientX,y:e.clientY,dragged:false,cancelled:false};}},onPointerMove:(e:PointerEvent<SVGSVGElement>)=>{const s=start.current;if(!s||s.id!==e.pointerId||s.cancelled)return;const dx=Math.abs(e.clientX-s.x),dy=Math.abs(e.clientY-s.y);if(!s.dragged&&dy>6&&dy>dx){s.cancelled=true;return;}if(dx>6&&dx>dy)s.dragged=true;if(s.dragged){e.currentTarget.setPointerCapture(e.pointerId);select(e);}},onPointerUp:(e:PointerEvent<SVGSVGElement>)=>{if(start.current?.dragged){select(e);suppress.current=true;}start.current=null;},onPointerCancel:()=>{start.current=null;},onClickCapture:(e:MouseEvent<SVGSVGElement>)=>{if(suppress.current){e.preventDefault();e.stopPropagation();suppress.current=false;}}};
}
