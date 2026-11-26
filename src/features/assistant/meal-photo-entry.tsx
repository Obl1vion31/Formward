"use client";
/* eslint-disable @next/next/no-img-element -- 原图只经过本人私有图片入口。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmAction } from "../../components/confirmation-state";
import { LocalLoading } from "../../components/local-loading";
import type { MealDraft } from "../meals/model";
import type { RecordReviewView } from "../records/model";
import type { ChatEvent, ChatProvider, ChatSnapshot } from "./chat-model";
import type { FollowupSubmission } from "./followup";
import { TaskGuide } from "@/components/task-guide";
import { FollowupForm } from "./followup-form";
import { usePhotoDraft } from "../meals/use-photo-draft";
import styles from "./meal-photo-entry.module.css";

type Snapshot=ChatSnapshot&{taskId:string;draft:MealDraft;operation:RecordReviewView|null};
export type AppliedMeal={taskId:string;draft:MealDraft;operation:RecordReviewView};
async function post(body:unknown,signal?:AbortSignal){const response=await fetch("/api/assistant-meal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal});if(!response.ok){const value=await response.json().catch(()=>null);throw Error(value?.error??"本次识别未完成，请重试。");}return response;}
export function MealPhotoEntry({initial,draftKey,resumeTaskId,onRestore,onApply,onBack,onBusy,onHandoff,sharedHeader=false,visible=true}:{visible?:boolean;sharedHeader?:boolean;initial:MealDraft;draftKey:string;resumeTaskId?:string;onRestore:(draft:MealDraft)=>void;onApply:(value:AppliedMeal)=>void;onBack:()=>void;onBusy:(busy:boolean)=>void;onHandoff?:(id:string)=>void|Promise<void>}){
 const handingOff=!!onHandoff&&!resumeTaskId;
 const [data,setData]=useState<Snapshot|null>(null),[provider,setProvider]=useState<ChatProvider>("qwen"),[text,setText]=useState(""),[error,setError]=useState(""),[running,setRunning]=useState(false),[reset,setReset]=useState(false),[attempt,setAttempt]=useState(0);
 const acceptSnapshot=useCallback((snapshot:Snapshot)=>setData(prior=>prior?.entitlement&&snapshot.entitlement&&prior.entitlement.version>snapshot.entitlement.version?prior:snapshot),[]);
 const restoredApplication=useRef<string|null>(null);
 const photos=usePhotoDraft(),album=useRef<HTMLInputElement>(null),request=useRef<AbortController|null>(null),active=useRef(true),identity=useRef<{signature:string;id:string}|null>(null);
 const initialized=useRef({initial,draftKey,resumeTaskId,onRestore,onApply});
 useEffect(()=>{active.current=true;const controller=new AbortController(),value=initialized.current;
  if(handingOff)return()=>{active.current=false;request.current?.abort();};
  void(async()=>{try{const response=value.resumeTaskId?await fetch("/api/assistant-meal?taskId="+encodeURIComponent(value.resumeTaskId),{cache:"no-store",signal:controller.signal}):await post({action:"create",draftKey:value.draftKey,draft:value.initial},controller.signal);const snapshot=await response.json();if(!response.ok)throw Error(snapshot.error??"任务读取失败。");if(!active.current)return;acceptSnapshot(snapshot);setProvider(snapshot.provider);if(value.resumeTaskId&&snapshot.operation&&snapshot.operation.status!=="pending"){setError(snapshot.operation.status==="confirmed"?"本餐已保存，请返回饮食页查看。":snapshot.operation.status==="expired"?"本餐预览已过期，原草稿仍保留；可在原审核页重新核对。":"本次识别已结束，请返回填写。");return;}if(value.resumeTaskId)value.onRestore(snapshot.draft);
   if(value.resumeTaskId&&!snapshot.activeRunId&&!snapshot.followup&&snapshot.operation?.status==="pending"){const result=await post({action:"apply",taskId:snapshot.taskId},controller.signal);if(active.current)value.onApply(await result.json());}
  }catch(failure){if(!controller.signal.aborted&&active.current)setError(failure instanceof Error?failure.message:"任务读取未完成。");}})();
  return()=>{active.current=false;controller.abort();request.current?.abort();};
 },[attempt,acceptSnapshot,handingOff]);
 useEffect(()=>{onBusy(running||!!data?.activeRunId||photos.busy);return()=>onBusy(false);},[running,data?.activeRunId,photos.busy,onBusy]);
 useEffect(()=>{const last=data?.messages.filter(message=>message.role==="assistant").at(-1);if(!data||running||data.activeRunId||data.followup||last?.state!=="complete"||data.operation?.status!=="pending"||restoredApplication.current===data.operation.id)return;
  restoredApplication.current=data.operation.id;void post({action:"apply",taskId:data.taskId}).then(response=>response.json()).then(value=>{if(active.current)onApply(value);}).catch(failure=>{restoredApplication.current=null;if(active.current)setError(failure.message);});
 },[data,running,onApply]);
 async function enableModel(){if(!data||busy||!await confirmAction({title:"重新授权此识别模型？",message:"允许此模型查询饮食和生成待核对预览，有效期30天，可随时撤销。正式记录仍由你确认保存。",confirmLabel:"授权",cancelLabel:"取消"}))return;try{const response=await post({action:"enable_model",taskId:data.taskId,provider});acceptSnapshot(await response.json());setError("");}catch(failure){setError(failure instanceof Error?failure.message:"授权未完成。");}}
 async function refresh(){if(!data)return null;const response=await fetch("/api/assistant-meal?taskId="+data.taskId,{cache:"no-store"});const value=await response.json();if(!response.ok)throw Error(value.error??"任务读取失败。");if(active.current)acceptSnapshot(value);return value as Snapshot;}
 useEffect(()=>{if(!data?.activeRunId||running)return;const timer=setInterval(()=>{if(!document.hidden)void refresh().catch(failure=>setError(failure.message));},1800);return()=>clearInterval(timer);/* Snapshot identity is the polling scope. */ // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data?.activeRunId,running]);
 useEffect(()=>{if(!data?.taskId)return;const sync=()=>{if(!document.hidden){request.current?.abort();void refresh().catch(()=>{});}},timer=setInterval(sync,60000);window.addEventListener("focus",sync);document.addEventListener("visibilitychange",sync);return()=>{clearInterval(timer);window.removeEventListener("focus",sync);document.removeEventListener("visibilitychange",sync);}; // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data?.taskId]);
 async function run(followup?:FollowupSubmission){
  if(!data||running||photos.busy||photos.photos.some(p=>p.phase!=="ready"))return;
  const imageIds=photos.photos.flatMap(p=>p.id?[p.id]:[]),signature=JSON.stringify({text,provider,imageIds,followup});if(identity.current?.signature!==signature)identity.current={signature,id:crypto.randomUUID()};
  const controller=new AbortController();request.current=controller;setRunning(true);setError("");
  try{const response=await post({action:"run",taskId:data.taskId,requestId:identity.current.id,provider,imageIds,text,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,...(followup?{followup}:{})},controller.signal);const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer="";
   for(;;){const part=await reader.read();buffer+=part.done?decoder.decode():decoder.decode(part.value,{stream:true});let index;while((index=buffer.indexOf("\n\n"))>=0){const block=buffer.slice(0,index);buffer=buffer.slice(index+2);const line=block.split("\n").find(row=>row.startsWith("data: "));if(!line)continue;const event=JSON.parse(line.slice(6)) as ChatEvent;if(!active.current)continue;if(event.type==="snapshot")setData(previous=>previous?{...previous,...event.snapshot}:previous);if(event.type==="message")setData(previous=>previous?{...previous,messages:[...previous.messages.filter(m=>m.id!==event.message.id),event.message].sort((a,b)=>a.seq-b.seq)}:previous);}
    if(part.done)break;
   }
   identity.current=null;const snapshot=await refresh(),last=snapshot?.messages.filter(m=>m.role==="assistant").at(-1);
   if(snapshot&&!snapshot.followup&&last?.state==="complete"&&snapshot.operation?.status==="pending"){restoredApplication.current=snapshot.operation.id;const result=await post({action:"apply",taskId:data.taskId});if(active.current)onApply(await result.json());}
   else if(last?.error)setError(last.error);
  }catch(failure){if(active.current)setError(controller.signal.aborted?"正在恢复任务状态，后台识别会继续。":failure instanceof Error?failure.message:"本次识别未完成。");}
  finally{if(active.current)setRunning(false);request.current=null;}
 }
 async function sendToAssistant(){
  if(!onHandoff||request.current||!photos.photos.length||photos.photos.some(photo=>photo.phase!=="ready"||!photo.id))return;
  const input={action:"handoff",draftKey,draft:initial,imageIds:photos.photos.map(photo=>photo.id!),text,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  const signature=JSON.stringify(input);
  if(identity.current?.signature!==signature)identity.current={signature,id:crypto.randomUUID()};
  const controller=new AbortController();request.current=controller;setRunning(true);setError("");
  try{
   const response=await post({...input,requestId:identity.current.id},controller.signal),result=await response.json();
   if(active.current)await onHandoff(result.taskId);
  }catch(failure){
   if(active.current&&!controller.signal.aborted){
    const disconnected=failure instanceof TypeError||failure instanceof SyntaxError;
    setError(!disconnected&&failure instanceof Error?failure.message:"发送未完成。照片和说明已保留，请再点「发给助手」重试。");
   }
  }
  finally{if(active.current)setRunning(false);request.current=null;}
 }
 async function stop(){request.current?.abort();if(data){try{await post({action:"stop",taskId:data.taskId});await refresh();}catch(failure){setError(failure instanceof Error?failure.message:"停止未完成。");}}}
 async function back(){if((photos.photos.length||text.trim())&&!await confirmAction({title:"返回餐次填写？",message:"手工草稿保留。本次输入的照片和说明将离开输入区，已生成的预览仍可在 AI 确认中查看。",confirmLabel:"返回填写",cancelLabel:"继续识别"}))return;if(running||data?.activeRunId)await stop();onBack();}
 async function addFiles(files:File[]){const retained=Math.max(initial.expectedImageCount??0,initial.imageIds?.length??0);if(retained+photos.photos.length+files.length>8)throw Error("本餐原有及新增照片合计最多8张，请减少选择或返回填写调整。");await photos.add(files);}
 const answer=data?.messages.filter(message=>message.role==="assistant").at(-1),busy=running||!!data?.activeRunId;
 return <section className={styles.entry} data-meal-mode-content data-meal-photo-entry data-photo-entry-active={visible||undefined} data-shared-header={sharedHeader||undefined} aria-label="AI 拍照录入"><header><button type="button" disabled={handingOff&&running} onClick={()=>void back()}>← 返回填写</button><p className={styles.context}>{initial.date} · {initial.mealType}</p>{handingOff&&<TaskGuide task="meal" video="photo" steps={[
    {target:"meal-send-photo",text:"核对日期和餐别，点「发给助手」后到新对话核对本餐。"},
    ...(!photos.photos.length?[{target:"meal-pick-photo",text:"先选择这餐的照片。份量或做法可填写在下方。"}]:[]),
  ]}/>}</header>
  <div className={styles.photos}>{photos.photos.map((photo,index)=><div className={styles.photo} key={photo.key}>{photo.preview?<a href={photo.id?"/api/meal-images/"+photo.id:photo.preview} target="_blank" rel="noreferrer" aria-label={"查看照片 "+(index+1)+" 原图"}><img src={photo.preview} alt={"待识别照片 "+(index+1)}/></a>:<span>准备照片</span>}{photo.phase!=="ready"&&<div className={styles.progress}>{photo.phase==="error"?<span>上传失败</span>:<div role="progressbar" aria-label={photo.label} aria-valuenow={photo.percent} aria-valuemin={0} aria-valuemax={100}><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><circle cx="20" cy="20" r="16" pathLength="100" strokeDasharray="100" strokeDashoffset={100-photo.percent}/></svg><span>{photo.percent===100?"核对中":photo.percent+"%"}</span></div>}</div>}<button className={styles.removePhoto} type="button" aria-label={"移除照片 "+(index+1)} disabled={busy} onClick={()=>photos.remove(photo.key)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>)}<button type="button" className={styles.addPhoto} data-meal-photo-picker data-guide-target="meal-pick-photo" disabled={busy||!!data?.operation&&data.operation.status!=="pending"||Math.max(initial.expectedImageCount??0,initial.imageIds?.length??0)+photos.photos.length>=8} onClick={()=>album.current?.click()}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.25"/></svg><span className={styles.touchPicker}>拍照或选择照片</span><span className={styles.desktopPicker}>选择照片</span></button></div>
  {photos.photos.filter(p=>p.phase==="error").map(photo=><div key={photo.key} role="alert">{photo.error}<button type="button" onClick={()=>void photos.retry(photo.key)}>重试</button>{photo.region&&<button type="button" onClick={()=>void photos.retry(photo.key,"direct",photo.region==="cn"?"global":"cn")}>{photo.region==="cn"?"改用国际通道":"改用国内通道"}</button>}{photo.relay&&photo.region==="cn"&&<button type="button" onClick={()=>void photos.retry(photo.key,"relay")}>换方式上传</button>}</div>)}
  <input hidden ref={album} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={async event=>{const input=event.currentTarget;try{await addFiles(Array.from(input.files??[]));}catch(failure){setError(failure instanceof Error?failure.message:"照片未添加。");}finally{input.value="";}}}/>
  {handingOff?<div className={styles.notes}><label>补充说明 <small>选填</small><textarea aria-label="补充说明" value={text} disabled={busy} maxLength={6000} placeholder="份量、做法，或照片里没拍到的食物" onChange={event=>setText(event.target.value)}/></label></div>:<details className={styles.notes}>
   <summary>补充说明 <small>选填</small></summary>
   <textarea aria-label="补充说明" value={text} disabled={busy} maxLength={6000} placeholder="份量、做法，或照片里没拍到的食物" onChange={event=>setText(event.target.value)}/>
  </details>}
  {handingOff&&initial.items.length>0&&<details className={styles.notes}><summary>本餐已有 {initial.items.length} 项，一起交给助手</summary><ul>{initial.items.map((item,index)=><li key={index}>{item.name} {item.quantity??""} {item.unit??""}</li>)}</ul></details>}
  {answer?.steps.length? <details className={styles.steps}><summary>{busy?"正在处理本餐":"处理过程"}</summary>{answer.steps.map(step=><p key={step.id}>{step.title} · {step.state==="running"?"处理中":step.state==="error"?"未完成":"已完成"}{step.summary?"："+step.summary:""}</p>)}</details>:busy&&<p role="status">正在识别食物…</p>}
  {answer?.text&&<p className={styles.answer}>{answer.text}</p>}
  {data?.followup&&<FollowupForm key={data.followup.messageId} task={data.followup} busy={busy} submit={run}/>}
  {error&&<div role="alert">{error}{data?.operation&&<a href={data.operation.confirmationPath} target="_blank" rel="noreferrer">打开原审核页面</a>}{!data&&!handingOff&&<button type="button" onClick={()=>{setError("");setAttempt(value=>value+1);}}>重新读取</button>}</div>}
  {data&&data.catalog.find(model=>model.id===provider)?.enabled===false&&<p className={styles.modelStatus}>此模型的授权已停用或到期。<button type="button" disabled={busy} onClick={()=>void enableModel()}>重新授权</button></p>}
  {handingOff?<footer className={styles.handoffFooter}><p>在小助手里核对食物，确认后保存到本餐。</p><button type="button" className={styles.primary} data-guide-target="meal-send-photo" disabled={busy||!photos.photos.length||photos.photos.some(photo=>photo.phase!=="ready"||!photo.id)} onClick={()=>void sendToAssistant()}>{busy?"发送中…":"发给助手"}</button></footer>:
  <footer><select aria-label="识别模型" value={provider} disabled={!data||busy||!!data.operation} onChange={event=>setProvider(event.target.value as ChatProvider)}>{(data?.catalog??[{id:"qwen",label:"千问",configured:false,enabled:false},{id:"mimo",label:"小米 MiMo",configured:false,enabled:false},{id:"glm",label:"智谱",configured:false,enabled:false}]).map(model=><option key={model.id} value={model.id} disabled={!model.configured}>{model.label}</option>)}</select>
   <div className={styles.usage}>{data?<button type="button" onClick={()=>setReset(value=>!value)} title={"北京时间 "+new Date(data.usage.resetAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})+" 重置"}>{data.usage.recognition?`识图 ${data.usage.recognition.used}/${data.usage.recognition.limit}`:data.usage.percent}</button>:<LocalLoading active={!error}/>}{reset&&data&&<small role="status">北京时间 {new Date(data.usage.resetAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})} 重置</small>}</div>
   {busy?<button type="button" onClick={()=>void stop()}>停止识别</button>:<button type="button" className={styles.primary} disabled={!data||!data.catalog.find(model=>model.id===provider)?.configured||!data.catalog.find(model=>model.id===provider)?.enabled||!!data.operation&&data.operation.status!=="pending"||photos.busy||photos.photos.some(p=>p.phase!=="ready")||!text.trim()&&!photos.photos.length||(data.usage.recognition?data.usage.recognition.remaining !== null && data.usage.recognition.remaining<=0:data.usage.available<=0)} onClick={()=>void run()}>识别食物</button>}
  </footer>}
 </section>;
}
