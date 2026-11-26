"use client";
import {LocalLoading} from "@/components/local-loading";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LoadingLink } from "../../components/loading-link";
import { RecordReview, RecordReviewSummary, type ReviewResult } from "../records/record-review";
import type { RecordReviewAction, RecordReviewView } from "../records/model";
import type { SourceRemovalResult } from "../measurements/entry-state";
import styles from "./chat.module.css";
import {redundantSavedPreviews} from "./preview-presentation";

type CardData={operation:RecordReviewView;sources:string[];energySources:string[]};
async function readPreview(id: string, signal?: AbortSignal): Promise<CardData> {
  const response = await fetch("/api/assistant-chat?previewId=" + encodeURIComponent(id), { cache: "no-store", signal });
  const value = await response.json();
  if (!response.ok) throw Error(value.error ?? "提交暂时无法读取。");
  if (!value.operation || !Array.isArray(value.operation.rows)) throw Error("提交摘要暂时无法读取。");
  return value;
}
export function ChatPreviewCard({id,navigate,initialData,initialError,readOnly=false,mealActions}:{id:string;navigate?:()=>Promise<boolean>;initialData?:CardData;initialError?:string;readOnly?:boolean;mealActions?:ReactNode}){
  const [data,setData]=useState<CardData|null>(initialData??null),[error,setError]=useState(initialError??""),[attempt,setAttempt]=useState(0);
  const load = useCallback(async (signal?: AbortSignal): ReviewResult => {
    try {
      const value = await readPreview(id, signal);
      if (!signal?.aborted) {
        setData(current => current?.operation.id === id && current.operation.revision > value.operation.revision ? current : value);
        setError("");
      }
      return { ok: true, data: value.operation };
    } catch (failure) {
      const error = failure instanceof Error ? failure.message : "暂时读不到这份记录。";
      if (!signal?.aborted) setError(error);
      return { ok: false, error };
    }
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    const hasGroupData = Boolean(initialData || initialError);
    const refresh = (event?: Event) => {
      const previewId = (event as CustomEvent<{ previewId?: string }> | undefined)?.detail?.previewId;
      if (!previewId || previewId === id) void load(controller.signal);
    };
    const timer = attempt > 0 || !hasGroupData ? setTimeout(refresh, 0) : undefined;
    const focused = () => refresh();
    if (!hasGroupData) {
      window.addEventListener("formward-assistant-updated", refresh);
      window.addEventListener("focus", focused);
    }
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (!hasGroupData) {
        window.removeEventListener("formward-assistant-updated", refresh);
        window.removeEventListener("focus", focused);
      }
    };
  }, [id, attempt, load, initialData, initialError]);
  async function command(body: Record<string, unknown>) {
    const response = await fetch("/api/assistant-chat/control", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, previewId: id }),
    });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error ?? "操作未完成，请重试。"), { code: value.code as string | undefined, status: response.status });
    return value;
  }
  async function review(action: RecordReviewAction): ReviewResult {
    try {
      const operation: RecordReviewView = await command({ action: "review_preview", review: action });
      if (operation.id !== id || !Array.isArray(operation.rows)) throw new Error("暂时无法确认操作结果。");
      window.dispatchEvent(new CustomEvent("formward-assistant-updated", { detail: { previewId: id } }));
      return { ok: true, data: operation };
    } catch (failure) {
      if (failure instanceof Error) {
        const { code, status } = failure as Error & { code?: string; status?: number };
        return { ok: false, error: failure.message, code, status };
      }
      return { ok: false, error: "操作未完成。" };
    }
  }
  async function remove(domain:"body"|"energy",label:string):Promise<SourceRemovalResult>{try{return {ok:true,sources:await command({action:"remove_preview_source",domain,label})};}catch(failure){return {ok:false,error:failure instanceof Error?failure.message:"来源未移除。"};}}
  const currentData=initialData&&(!data||initialData.operation.revision>data.operation.revision)?initialData:data;
  return <div className={styles.previewCard} data-chat-preview={id}>{currentData
    ? readOnly
      ? <RecordReviewSummary operation={currentData.operation} beforeNavigate={navigate}/>
      : <RecordReview embedded beforeNavigate={navigate} operation={currentData.operation} review={review} load={async () => { const latest = await load(); if (latest.ok && latest.data.status !== "pending") window.dispatchEvent(new CustomEvent("formward-assistant-updated", { detail: { previewId: id } })); return latest; }} sources={currentData.sources} energySources={currentData.energySources} removeSource={label=>remove("body",label)} removeEnergySource={label=>remove("energy",label)} mealActions={mealActions}/>
    : <>{error ? <div role="alert">{error}<button type="button" onClick={()=>setAttempt(value=>value+1)}>重新读取</button><LoadingLink href={"/dashboard/ai/operations/"+id} beforeNavigate={navigate}>打开原审核页面</LoadingLink></div>
      : <LocalLoading label="正在读取记录摘要…"/>}{mealActions}</>}</div>;
}

/** 旧回答可能同时引用读取过的原提交及本次修改；并行读取后统一消除同对象的重复回执。 */
export function ChatPreviewCards({ids,navigate,readOnly=false,mealActions}:{ids:string[];navigate?:()=>Promise<boolean>;readOnly?:boolean;mealActions?:ReactNode}){
  const key=[...new Set(ids)].join(","),[entries,setEntries]=useState<{key:string;data:Map<string,CardData>;errors:Map<string,string>}|null>(null);
  useEffect(()=>{if(!key.includes(","))return;const controller=new AbortController();
    const load=async()=>{const rows=await Promise.all(key.split(",").map(async id=>{try{return {id,data:await readPreview(id,controller.signal)};}catch(failure){return {id,error:failure instanceof Error?failure.message:"读取未完成。"};}}));if(!controller.signal.aborted)setEntries({key,data:new Map(rows.filter(row=>row.data).map(row=>[row.id,row.data!])),errors:new Map(rows.filter(row=>row.error).map(row=>[row.id,row.error!]))});};
    void load();const refresh=(event:Event)=>{const id=(event as CustomEvent<{previewId?:string}>).detail?.previewId;if(!id||key.split(",").includes(id))void load();};window.addEventListener("formward-assistant-updated",refresh);return()=>{controller.abort();window.removeEventListener("formward-assistant-updated",refresh);};
  },[key]);
  if(!key)return null;
  if(!key.includes(","))return <ChatPreviewCard id={key} navigate={navigate} readOnly={readOnly} mealActions={mealActions}/>;
  if(entries?.key!==key)return <div className={styles.previewCard}><LocalLoading/>{mealActions}</div>;
  const hidden=redundantSavedPreviews([...entries.data.values()].map(row=>row.operation));
  const visible=key.split(",").filter(id=>!hidden.has(id));
  return <>{visible.map(id=><ChatPreviewCard key={id} id={id} navigate={navigate} readOnly={readOnly} initialData={entries.data.get(id)} initialError={entries.errors.get(id)} mealActions={id===visible.at(-1)?mealActions:undefined}/>)}</>;
}
