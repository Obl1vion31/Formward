"use client";
/* eslint-disable @next/next/no-img-element -- 私有原图按账号鉴权，不进入公开优化缓存。 */
import {chatDisplayText} from "./chat-presentation";
import {useEffect,useRef,useState} from "react";
import {useAssistantChat} from "./chat-client";
import {ChatText} from "./chat-text";
import type {ChatSnapshot} from "./chat-model";
import styles from "./surface.module.css";
type Page={items:{id:string;title:string;updatedAt:string;active:boolean}[];next:{at:string;id:string}|null};
export function ChatHistory({close,navigate}:{close:()=>void;navigate:()=>Promise<boolean>}){
 const chat=useAssistantChat(),[page,setPage]=useState<Page|null>(null),[view,setView]=useState<ChatSnapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const epoch=useRef(0),title=useRef<HTMLHeadingElement>(null);
 async function load(cursor?:Page["next"]){const key=++epoch.current;setBusy(true);setError("");try{const response=await fetch("/api/assistant-chat?view=history"+(cursor?"&cursor="+encodeURIComponent(JSON.stringify(cursor)):""),{cache:"no-store",signal:AbortSignal.timeout(15000)});const value=await response.json();if(!response.ok)throw Error(value.error);if(key===epoch.current)setPage(old=>({...value,items:cursor?[...(old?.items??[]),...value.items]:value.items}));}catch(e){if(key===epoch.current)setError(e instanceof Error?e.message:"历史暂时无法读取。");}finally{if(key===epoch.current)setBusy(false);}}
 useEffect(()=>{const frame=requestAnimationFrame(()=>{void load();title.current?.focus({preventScroll:true});});return()=>{cancelAnimationFrame(frame);epoch.current++;};},[]); // eslint-disable-line react-hooks/exhaustive-deps
 async function inspect(id:string){const key=++epoch.current;setBusy(true);setError("");try{const response=await fetch("/api/assistant-chat?conversationId="+id,{cache:"no-store",signal:AbortSignal.timeout(15000)});const value=await response.json();if(!response.ok)throw Error(value.error);if(key===epoch.current)setView(value);}catch(e){if(key===epoch.current)setError(e instanceof Error?e.message:"对话读取失败。");}finally{if(key===epoch.current)setBusy(false);}}
 return <section className={styles.history} aria-label="历史会话" onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();if(view)setView(null);else close();}}}>
 <header><h3 ref={title} tabIndex={-1}>{view?"查看历史对话":"历史会话"}</h3><button type="button" onClick={()=>view?setView(null):close()}>{view?"返回列表":"返回"}</button></header>
 {error&&<p role="alert">{error}<button onClick={()=>void load()}>重试</button></p>}
 {busy&&<p role="status">正在读取…</p>}
 {!view?<><ul>{page?.items.map(row=><li key={row.id}><button disabled={busy} onClick={()=>void inspect(row.id)}><strong>{row.title}</strong><span>{new Date(row.updatedAt).toLocaleDateString("zh-CN")}{row.active?" · 当前对话":""}</span></button></li>)}</ul>{page&&!page.items.length&&<p>暂无历史会话</p>}{page?.next&&<button disabled={busy} onClick={()=>void load(page.next)}>加载更早会话</button>}</>:<><div className={styles.historyMessages}>{view.hasMore&&<p>显示最近消息，继续此对话后可加载更早消息。</p>}{view.messages.map(row=><article key={row.id} data-role={row.role}><small>{row.role==="user"?"你":row.provider==="qwen"?"千问":row.provider==="mimo"?"小米":"小助手"}</small><ChatText value={chatDisplayText(row,view.capabilities?.inlinePreviews===true)} navigate={navigate}/>{row.imageIds.map(id=><a key={id} href={"/api/meal-images/"+id} target="_blank" rel="noreferrer"><img src={"/api/meal-images/"+id} alt="历史消息的私有照片"/></a>)}</article>)}</div><footer>{chat.busy&&<p>当前回答生成中；可查看历史，完成后继续对话。</p>}{chat.uploading&&<p>照片上传中，请就绪后切换。</p>}<button disabled={chat.busy||chat.managing||!!chat.uploading} onClick={()=>void chat.control("select_conversation",undefined,view.conversationId).then(ok=>{if(ok){window.dispatchEvent(new Event("formward-assistant-chat-selected"));close();}})}>继续此对话</button>{chat.error&&<p role="alert">{chat.error}</p>}</footer></>}
 </section>;
}
