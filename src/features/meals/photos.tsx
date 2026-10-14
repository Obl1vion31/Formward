"use client";
import { useRef, useState } from "react";
import { usePageLoading } from "@/components/page-loading-state";
import styles from "./meals.module.css";
export function ImageGallery({ids=[]}:{ids?:string[]}) {
 return ids.length?<div className={styles.photos} aria-label="原始照片">{ids.map((id,index)=><a href={`/api/meal-images/${id}`} key={id} target="_blank" rel="noreferrer">
 {/* 原图经过会话校验，不能通过公开图片优化缓存提供。 */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={`/api/meal-images/${id}`} alt={`原图 ${index+1}`} loading="lazy"/>查看原图 ↗</a>)}</div>:null;
}
export function PhotoFields({ids,change,busy,onBusy,onError}:{ids:string[];change:(ids:string[])=>void;busy:boolean;onBusy:(active:boolean)=>void;onError:(error:string)=>void}) {
 const input=useRef<HTMLInputElement>(null),guard=useRef(false),[error,setError]=useState(""),[uploading,setUploading]=useState(false);
 usePageLoading({active:uploading,label:"正在保存原图…"});
 async function upload(files:FileList|null){if(!files?.length||guard.current)return;guard.current=true;setUploading(true);onBusy(true);setError("");onError("");const next=[...ids];
 try{if(next.length+files.length>8)throw new Error("最多关联8张照片。");for(const file of files){if(file.size>4194304)throw new Error("照片最大4 MiB，请选择符合大小要求的原图。");const form=new FormData();form.set("file",file);const response=await fetch("/api/meal-images/upload",{method:"POST",body:form});const result=await response.json();if(!response.ok)throw new Error(result.error??"原图上传失败，请重试。");if(!next.includes(result.id))next.push(result.id);change([...next]);}if(input.current)input.current.value="";}
 catch(e){const message=e instanceof Error?e.message:"原图上传失败，请重试。";setError(message);onError(message);}finally{guard.current=false;setUploading(false);onBusy(false);}}
 return <div className={styles.photoFields}><label>原始照片（最多8张，每张4 MiB）<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e=>void upload(e.target.files)}/></label><ImageGallery ids={ids}/>{ids.map((id,i)=><button type="button" key={id} disabled={busy} onClick={()=>change(ids.filter(n=>n!==id))}>移除照片 {i+1}</button>)}{error&&<><p role="alert" className={styles.error}>{error}</p><button type="button" onClick={()=>void upload(input.current?.files??null)}>重试上传</button><button type="button" onClick={()=>{setError("");onError("");if(input.current)input.current.value="";}}>放弃本次上传</button></>}</div>;
}
