"use client";
import { createContext, useContext } from "react";
import type { MetricTrendModel, TrendKind } from "./metric-trend-model";
import type { ChartRect } from './chart-flight';

export type ChartTarget = { kind: TrendKind; element: SVGSVGElement; model: MetricTrendModel; skeleton?: boolean };
export type ChartOrigin = { kind: TrendKind; destination: string; scroll: number; rail: number; rangeKey: string; modelKey:string; paired:boolean; rect: ChartRect; viewport: { width: number; height: number } };
export type OverviewViewState={mode:string|null;custom:{from:string;to:string};estimates:boolean};
export type ChartTransitionState = {
  preview: MetricTrendModel | null;
  navigate: (href: string, model: MetricTrendModel, source: SVGSVGElement, rail: HTMLElement | null) => Promise<void>;
  register: (target: ChartTarget) => () => void;
  restore: (rail: HTMLElement) => void;
  back: () => void;
  invalidate: () => void;
  recallOverview: () => OverviewViewState | null;
  rememberOverview: (state:OverviewViewState) => void;
};
export const ChartTransitionContext = createContext<ChartTransitionState>({ preview:null, navigate: async()=>{}, register:()=>()=>{}, restore:()=>{}, back:()=>{}, invalidate:()=>{},recallOverview:()=>null,rememberOverview:()=>{} });
export const useChartTransition = () => useContext(ChartTransitionContext);
