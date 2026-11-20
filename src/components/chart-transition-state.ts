"use client";
import { createContext, useContext } from "react";
import type { MetricTrendModel, TrendKind } from "./metric-trend-model";
import type { Totals } from '@/features/meals/model';
import type { WorkspaceScene } from './workspace-motion';

export type ChartTarget = { kind: TrendKind; element: SVGSVGElement; model: MetricTrendModel; skeleton?: boolean };
/** 仅本账号这次来源卡片的事实快照；与图形几何分开，不从 segments 还原营养。 */
export type ChartReadingsSnapshot =
  | {kind:"intake";date:string;totals:Totals}
  | {kind:"energy";date:string;totalKcal:string|null;restingKcal:string|null;activeKcal:string|null}
  | {kind:"morning-weight";date:string;weightKg:string|null};
const readingPaths:Record<TrendKind,string>={intake:"/dashboard/meals",energy:"/dashboard/energy","morning-weight":"/dashboard/measurements"};
export function matchingChartReadings(snapshot:ChartReadingsSnapshot|undefined,kind:TrendKind,href:string):ChartReadingsSnapshot|null{
  if(!snapshot||snapshot.kind!==kind||!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date))return null;
  const date=new Date(snapshot.date);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==snapshot.date)return null;
  const target=new URL(href,"https://formward.invalid");
  return target.pathname===readingPaths[kind]&&target.searchParams.get("date")===snapshot.date?structuredClone(snapshot):null;
}
export function chartDestinationSearch(search:string){const params=new URLSearchParams(search);params.sort();return params.toString();}
export function chartDestinationMatches(origin:{destination:string; destinationSearch?:string},href:string){
  const url=new URL(href,"https://formward.invalid");
  return origin.destination===url.pathname&&(origin.destinationSearch===undefined||origin.destinationSearch===chartDestinationSearch(url.search));
}
export type OverviewViewState={mode:string|null;custom:{from:string;to:string}};
export type ChartTransitionState = {
  claimChartEntry: (key:string,container?:HTMLElement|null)=>boolean;
  preview: MetricTrendModel | null;
  previewReadings: ChartReadingsSnapshot | null;
  forwardDestination:string|null;
  scene: WorkspaceScene | null;
  sceneLeaving: boolean;
  displayPath: string | null;
  revealScene: (id: number) => void;
  finishScene: (id: number) => void;
  returningToOverview:boolean;
  overviewReady:()=>void;
  cancelOverviewReturn:(href:string)=>void;
  navigate: (href: string, model: MetricTrendModel, source: SVGSVGElement, rail: HTMLElement | null,readings?:ChartReadingsSnapshot) => Promise<void>;
  register: (target: ChartTarget) => () => void;
  restore: (rail: HTMLElement) => void;
  back: () => void;
  invalidate: () => void;
  recallOverview: () => OverviewViewState | null;
  rememberOverview: (state:OverviewViewState) => void;
};
export const ChartTransitionContext = createContext<ChartTransitionState>({ claimChartEntry:()=>true, preview:null, previewReadings:null, forwardDestination:null, scene:null, sceneLeaving:false, displayPath:null, revealScene:()=>{}, finishScene:()=>{}, returningToOverview:false, overviewReady:()=>{}, cancelOverviewReturn:()=>{}, navigate: async()=>{}, register:()=>()=>{}, restore:()=>{}, back:()=>{}, invalidate:()=>{},recallOverview:()=>null,rememberOverview:()=>{} });
export const useChartTransition = () => useContext(ChartTransitionContext);

/** 图形注册与业务失效不订阅飞行状态，避免动画挂载重绘整张业务图。 */
export const ChartTransitionActionsContext=createContext<Pick<ChartTransitionState,"register"|"invalidate"|"recallOverview"|"rememberOverview"|"claimChartEntry">>({claimChartEntry:()=>true,register:()=>()=>{},invalidate:()=>{},recallOverview:()=>null,rememberOverview:()=>{}});
export const useChartTransitionActions=()=>useContext(ChartTransitionActionsContext);
