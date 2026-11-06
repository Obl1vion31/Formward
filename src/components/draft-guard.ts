"use client";
import { createContext, useContext, useLayoutEffect } from "react";
import {confirmAction} from "./confirmation-state";

export type VisibleRecord = {key:string;version:string;summary?:string};
export type DraftState = { dirty: boolean; busy: boolean; records?:VisibleRecord[] };
export const InspectorBusyContext=createContext(false);
export const DraftCloseContext = createContext<(() => void) | null>(null);
export const DraftGuardContext = createContext<((state: DraftState) => () => void) | null>(null);

const currentDrafts=new Map<symbol,DraftState>();
export const draftIsBusy=()=>[...currentDrafts.values()].some(state=>state.busy);
export const visibleRecordSummary=(key:string,version:string)=>[...currentDrafts.values()].flatMap(state=>state.records??[]).find(row=>row.key===key&&row.version===version)?.summary;
export const draftIsDirty=()=>[...currentDrafts.values()].some(state=>state.dirty||state.busy);

/** 仅登记当前弹窗内尚未提交的输入，不在浏览器存储健康数据。 */
export function useDraftGuard(dirty: boolean, busy = false, records?:VisibleRecord[]) {
  const register = useContext(DraftGuardContext);
  useLayoutEffect(() => {const key=Symbol();currentDrafts.set(key,{dirty,busy,records});const unregister=register?.({dirty,busy});return()=>{currentDrafts.delete(key);unregister?.();};}, [register, dirty, busy, records]);
}

/** 子表单的放弃按钮与弹窗关闭、Escape、遮罩使用同一保护。 */
export function useDraftClose(fallback: () => void) {
  return useContext(DraftCloseContext) ?? fallback;
}

let refreshApprovedUntil=0;
export function approvePageRefresh(){refreshApprovedUntil=Date.now()+2000;}
export const pageRefreshApproved=()=>Date.now()<refreshApprovedUntil;

/** 站内离开与内部返回共用；不把切标签或默认值当作编辑。 */
export async function confirmDraftDiscard(){
 if(draftIsBusy())return false;
 return !draftIsDirty()||await confirmAction({title:"放弃尚未保存的输入？",message:"尚未保存的修改会被放弃，已保存记录保持。",confirmLabel:"放弃修改",cancelLabel:"继续编辑"});
}
