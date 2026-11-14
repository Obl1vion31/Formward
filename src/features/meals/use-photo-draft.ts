"use client";
import { useEffect, useRef, useState } from "react";
import { stagePrivateMealPhoto, uploadPrivateMealPhoto, PhotoTransferError, type PhotoUploadPhase } from "./photo-upload";

export type PhotoDraft={key:string;file:File;preview?:string;id?:string;phase:PhotoUploadPhase|"queued"|"error";percent:number;label:string;error?:string;relay?:boolean};
export function usePhotoDraft(){
 const [photos,setPhotos]=useState<PhotoDraft[]>([]),items=useRef<PhotoDraft[]>([]),requests=useRef(new Map<string,AbortController>()),alive=useRef(true);
 function change(update:(items:PhotoDraft[])=>PhotoDraft[]){items.current=update(items.current);if(alive.current)setPhotos(items.current);}
 function remove(key:string){requests.current.get(key)?.abort();const photo=items.current.find(p=>p.key===key);if(photo?.preview)URL.revokeObjectURL(photo.preview);change(rows=>rows.filter(p=>p.key!==key));}
 async function transfer(key:string,transport:"direct"|"relay"="direct"){
  const photo=items.current.find(p=>p.key===key);if(!photo||requests.current.has(key))return;
  const controller=new AbortController();requests.current.set(key,controller);
  const patch=(value:Partial<PhotoDraft>)=>{if(alive.current)change(rows=>rows.map(p=>p.key===key?{...p,...value}:p));};
  patch({phase:"queued",percent:0,label:"等待上传",error:undefined,relay:false});
  try{const result=await uploadPrivateMealPhoto(photo.file,()=>{},{transport,signal:controller.signal,onProgress:progress=>patch({phase:progress.phase,percent:progress.percent,label:progress.label}),onPreview:body=>{if(!items.current.find(p=>p.key===key)?.preview&&alive.current&&items.current.some(p=>p.key===key))patch({preview:URL.createObjectURL(body)});}});patch({id:result.id,phase:"ready",percent:100,label:"照片已就绪"});}
  catch(failure){patch({phase:"error",label:"上传未完成",error:failure instanceof Error?failure.message:"请重新选择照片。",relay:transport==="direct"&&failure instanceof PhotoTransferError&&failure.allowRelay});}
  finally{requests.current.delete(key);}
 }
 async function add(files:File[]){
  if(items.current.length+files.length>8)throw Error("每餐最多8张照片。");
  const incoming=files.map(file=>({key:crypto.randomUUID(),file,phase:"queued" as const,percent:0,label:"正在读取照片"}));
  change(rows=>[...rows,...incoming]);
  // 在第一次网络等待之前读取全部原图；Safari文件选择器清空后仍可重试。
  const staged=incoming.map(photo=>stagePrivateMealPhoto(photo.file).then(body=>{if(alive.current&&items.current.some(p=>p.key===photo.key))change(rows=>rows.map(p=>p.key===photo.key?{...p,preview:URL.createObjectURL(body)}:p));},failure=>{change(rows=>rows.map(p=>p.key===photo.key?{...p,phase:"error",error:failure instanceof Error?failure.message:"读取照片失败。"}:p));}));
  await Promise.all(staged);
  for(const photo of incoming)if(alive.current&&items.current.find(p=>p.key===photo.key)?.phase!=="error")await transfer(photo.key);
 }
 useEffect(()=>{alive.current=true;const controllers=requests.current;return()=>{alive.current=false;for(const controller of controllers.values())controller.abort();for(const photo of items.current)if(photo.preview)URL.revokeObjectURL(photo.preview);};},[]);
 return {photos,add,remove,retry:transfer,busy:photos.some(p=>p.phase!=="ready"&&p.phase!=="error")};
}
