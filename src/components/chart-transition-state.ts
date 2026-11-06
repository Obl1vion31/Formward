"use client";
import { createContext, useContext } from "react";
import type { MetricTrendModel, TrendKind } from "./metric-trend-model";

export type ChartTarget = { kind: TrendKind; element: SVGSVGElement; model: MetricTrendModel; skeleton?: boolean };
export type ChartOrigin = { kind: TrendKind; destination: string; scroll: number; rail: number };
export type ChartTransitionState = {
  preview: MetricTrendModel | null;
  navigate: (href: string, model: MetricTrendModel, source: SVGSVGElement, rail: HTMLElement | null) => Promise<void>;
  register: (target: ChartTarget) => () => void;
  restore: (rail: HTMLElement) => void;
  back: () => void;
  invalidate: () => void;
};
export const ChartTransitionContext = createContext<ChartTransitionState>({ preview:null, navigate: async()=>{}, register:()=>()=>{}, restore:()=>{}, back:()=>{}, invalidate:()=>{} });
export const useChartTransition = () => useContext(ChartTransitionContext);
