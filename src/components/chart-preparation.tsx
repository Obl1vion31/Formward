"use client";
import type {ReactNode} from "react";
import {useChartTransition} from "./chart-transition-state";

/** 服务端读取照常进行；共享图形到达后才挂载目标业务视图，避免不可见内容争用绘制帧。 */
export function ChartArrivalContent({children}:{children:ReactNode}){
 const {forwardChartMoving}=useChartTransition();
 return forwardChartMoving?null:children;
}

/** 数据已到、绘图区尚待测量时保留图框；透明反馈不遮盖正在承接的来源图。 */
export function ChartPreparation({active}:{active:boolean}){
 return active?<div className="chart-preparation" role="status"><span>正在准备趋势…</span></div>:null;
}
