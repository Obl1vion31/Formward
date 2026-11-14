"use client";
import { useEffect, useState } from "react";
import { LoadingLink } from "../../components/loading-link";
import { RecordReview } from "../records/record-review";
import type { RecordReviewAction, RecordReviewView } from "../records/model";
import type { Result } from "../meals/model";
import type { SourceRemovalResult } from "../measurements/entry-state";
import styles from "./chat.module.css";

type CardData={operation:RecordReviewView;sources:string[];energySources:string[]};
export function ChatPreviewCard({id,navigate}:{id:string;navigate?:()=>Promise<boolean>}){
  const [data,setData]=useState<CardData|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  async function load(signal?:AbortSignal):Promise<Result<RecordReviewView>>{
    try{const response=await fetch("/api/assistant-chat?previewId="+encodeURIComponent(id),{cache:"no-store",signal});const value=await response.json();if(!response.ok)throw Error(value.error??"提交暂时无法读取。");if(!value.operation||!Array.isArray(value.operation.rows))throw Error("当前版本暂不支持聊天内确认，请打开原审核页面。");setData(value);setError("");return {ok:true,data:value.operation};}
    catch(failure){const error=failure instanceof Error?failure.message:"提交暂时无法读取。";if(!signal?.aborted)setError(error);return {ok:false,error};}
  }
  useEffect(()=>{const controller=new AbortController(),timer=setTimeout(()=>void load(controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};/* id/attempt identify the request, not a render closure. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  },[id,attempt]);
  async function command(body:Record<string,unknown>){const response=await fetch("/api/assistant-chat/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,previewId:id})});const value=await response.json();if(!response.ok)throw Error(value.error??"操作未完成，请重试。");return value;}
  async function review(action:RecordReviewAction):Promise<Result<RecordReviewView>>{try{const value=await command({action:"review_preview",review:action});window.dispatchEvent(new Event("formward-assistant-updated"));return {ok:true,data:value};}catch(failure){return {ok:false,error:failure instanceof Error?failure.message:"操作未完成。"};}}
  async function remove(domain:"body"|"energy",label:string):Promise<SourceRemovalResult>{try{return {ok:true,sources:await command({action:"remove_preview_source",domain,label})};}catch(failure){return {ok:false,error:failure instanceof Error?failure.message:"来源未移除。"};}}
  return <div className={styles.previewCard} data-chat-preview={id}>{data?<RecordReview embedded beforeNavigate={navigate} operation={data.operation} review={review} load={()=>load()} sources={data.sources} energySources={data.energySources} removeSource={label=>remove("body",label)} removeEnergySource={label=>remove("energy",label)}/>:error?<div role="alert">{error}<button type="button" onClick={()=>setAttempt(value=>value+1)}>重新读取</button><LoadingLink href={"/dashboard/ai/operations/"+id} beforeNavigate={navigate}>打开原审核页面</LoadingLink></div>:<p role="status">正在读取待确认内容…</p>}</div>;
}
