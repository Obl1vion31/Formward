"use client";
import {LocalLoading} from "@/components/local-loading";
import { useEffect, useState } from "react";
import { LoadingLink } from "../../components/loading-link";
import { RecordReview, RecordReviewSummary } from "../records/record-review";
import type { RecordReviewAction, RecordReviewView } from "../records/model";
import type { Result } from "../meals/model";
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
export function ChatPreviewCard({id,navigate,initialData,initialError,readOnly=false}:{id:string;navigate?:()=>Promise<boolean>;initialData?:CardData;initialError?:string;readOnly?:boolean}){
  const [data,setData]=useState<CardData|null>(initialData??null),[error,setError]=useState(initialError??""),[attempt,setAttempt]=useState(0);
  async function load(signal?:AbortSignal):Promise<Result<RecordReviewView>>{
    try{const value=await readPreview(id,signal);if(!signal?.aborted){setData(value);setError("");}return {ok:true,data:value.operation};}
    catch(failure){const error=failure instanceof Error?failure.message:"提交暂时无法读取。";if(!signal?.aborted)setError(error);return {ok:false,error};}
  }
  useEffect(()=>{if(attempt===0&&(initialData||initialError))return;const controller=new AbortController(),timer=setTimeout(()=>void load(controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};/* id/attempt identify the request, not a render closure. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  },[id,attempt]);
  async function command(body:Record<string,unknown>){const response=await fetch("/api/assistant-chat/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,previewId:id})});const value=await response.json();if(!response.ok)throw Error(value.error??"操作未完成，请重试。");return value;}
  async function review(action:RecordReviewAction):Promise<Result<RecordReviewView>>{try{const value=await command({action:"review_preview",review:action});window.dispatchEvent(new Event("formward-assistant-updated"));return {ok:true,data:value};}catch(failure){return {ok:false,error:failure instanceof Error?failure.message:"操作未完成。"};}}
  async function remove(domain:"body"|"energy",label:string):Promise<SourceRemovalResult>{try{return {ok:true,sources:await command({action:"remove_preview_source",domain,label})};}catch(failure){return {ok:false,error:failure instanceof Error?failure.message:"来源未移除。"};}}
  const currentData=initialData&&(!data||initialData.operation.revision>data.operation.revision)?initialData:data;
  return <div className={styles.previewCard} data-chat-preview={id}>{currentData
    ? readOnly
      ? <RecordReviewSummary operation={currentData.operation} beforeNavigate={navigate}/>
      : <RecordReview embedded beforeNavigate={navigate} operation={currentData.operation} review={review} load={()=>load()} sources={currentData.sources} energySources={currentData.energySources} removeSource={label=>remove("body",label)} removeEnergySource={label=>remove("energy",label)}/>
    : error ? <div role="alert">{error}<button type="button" onClick={()=>setAttempt(value=>value+1)}>重新读取</button><LoadingLink href={"/dashboard/ai/operations/"+id} beforeNavigate={navigate}>打开原审核页面</LoadingLink></div>
    : <LocalLoading label="正在读取记录摘要…"/>}</div>;
}

/** 旧回答可能同时引用读取过的原提交及本次修改；并行读取后统一消除同对象的重复回执。 */
export function ChatPreviewCards({ids,navigate,readOnly=false}:{ids:string[];navigate?:()=>Promise<boolean>;readOnly?:boolean}){
  const key=[...new Set(ids)].join(","),[entries,setEntries]=useState<{key:string;data:Map<string,CardData>;errors:Map<string,string>}|null>(null);
  useEffect(()=>{if(!key.includes(","))return;const controller=new AbortController();
    const load=async()=>{const rows=await Promise.all(key.split(",").map(async id=>{try{return {id,data:await readPreview(id,controller.signal)};}catch(failure){return {id,error:failure instanceof Error?failure.message:"读取未完成。"};}}));if(!controller.signal.aborted)setEntries({key,data:new Map(rows.filter(row=>row.data).map(row=>[row.id,row.data!])),errors:new Map(rows.filter(row=>row.error).map(row=>[row.id,row.error!]))});};
    void load();const refresh=()=>void load();window.addEventListener("formward-assistant-updated",refresh);return()=>{controller.abort();window.removeEventListener("formward-assistant-updated",refresh);};
  },[key]);
  if(!key)return null;
  if(!key.includes(","))return <ChatPreviewCard id={key} navigate={navigate} readOnly={readOnly}/>;
  if(entries?.key!==key)return <div className={styles.previewCard}><LocalLoading/></div>;
  const hidden=redundantSavedPreviews([...entries.data.values()].map(row=>row.operation));
  return <>{key.split(",").filter(id=>!hidden.has(id)).map(id=><ChatPreviewCard key={id} id={id} navigate={navigate} readOnly={readOnly} initialData={entries.data.get(id)} initialError={entries.errors.get(id)}/>)}</>;
}
