"use client";
import {useEffect,useRef,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {usePageLoading} from "./page-loading-state";
import {Inspector} from "./inspector";
import {draftIsBusy,draftIsDirty} from "./draft-guard";
import {fetchRecordStamps} from "./record-change-client";
import {changedRecords,type RecordStamp} from "@/features/records/change-state";
export function RecordUpdates(){
 const [pending,startTransition]=useTransition();usePageLoading({active:pending,label:"正在读取最新记录…"});
 const router=useRouter(),baseline=useRef<RecordStamp[]|null>(null),inflight=useRef(false),generation=useRef(0),[changes,setChanges]=useState<ReturnType<typeof changedRecords>>([]),[details,setDetails]=useState(false),[detailError,setDetailError]=useState("");
 useEffect(()=>{let active=true;
  async function check(){if(document.hidden||inflight.current||draftIsBusy())return;inflight.current=true;const epoch=generation.current;
   try{const next=await fetchRecordStamps();if(!active||epoch!==generation.current||draftIsBusy())return;
    if(baseline.current){const difference=changedRecords(baseline.current,next);if(difference.length)setChanges(previous=>[...new Map([...previous,...difference].map(row=>[row.record.key,row])).values()]);}
    baseline.current=next;
   }catch{}finally{inflight.current=false;}}
  const visible=()=>{if(!document.hidden)void check();};
  const saved=(event:Event)=>{generation.current++;const entries=(event as CustomEvent<{key:string;version:string|null}[]>).detail;if(!baseline.current)return;for(const entry of entries){const before=baseline.current.find(row=>row.key===entry.key);baseline.current=baseline.current.filter(row=>row.key!==entry.key);if(entry.version!==null)baseline.current.push({...before,key:entry.key,id:before?.id??entry.key,date:before?.date??"",title:before?.title??"记录",href:before?.href??"/dashboard",version:entry.version});}};
  void check();const timer=setInterval(check,90000);document.addEventListener("visibilitychange",visible);window.addEventListener("focus",visible);window.addEventListener("formward-record-saved",saved);
  return()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible);window.removeEventListener("formward-record-saved",saved);};
 },[]);
 function load(href?:string){if(draftIsBusy()){setDetailError("正在保存，请稍后查看最新。");return;}if(draftIsDirty()&&!window.confirm("查看最新会放弃尚未保存的输入，确定采用最新内容？"))return;window.dispatchEvent(new Event("formward-load-latest"));setChanges([]);setDetails(false);startTransition(()=>{if(href)router.push(href);else router.refresh();});}
 if(!changes.length)return null;
 return <Inspector title={details?"最新记录变化":"记录在其他页面有更新"} close={()=>{setChanges([]);setDetails(false);setDetailError("");}}><p>你正在填写的内容已保留。</p>{detailError&&<p role="alert">{detailError}</p>}<ul>{changes.map(change=><li key={change.record.key}>{change.record.date} {change.record.title} · 已{change.kind}{details&&<small> · {change.record.summary??"记录内容已变化"}<button onClick={()=>load(change.record.href)}>查看这条 →</button></small>}</li>)}</ul><div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:20}}><button onClick={()=>{setChanges([]);setDetails(false);setDetailError("");}}>稍后查看</button>{details?<button onClick={()=>load()}>采用最新内容</button>:<button onClick={async()=>{setDetailError("");try{const latest=await fetchRecordStamps(changes.map(c=>c.record.key));setChanges(rows=>rows.map(c=>({...c,record:latest.find(r=>r.key===c.record.key)??c.record})));setDetails(true);}catch{setDetailError("暂时无法读取最新内容，请重试，输入已保留。");}}}>查看最新</button>}</div></Inspector>;
}
