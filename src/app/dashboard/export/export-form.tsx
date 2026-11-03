"use client";
import {useRef,useState} from "react";
import styles from "./page.module.css";
export function ExportForm(){
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[expired,setExpired]=useState(false);
 const lock=useRef(false);
 const issue=from&&to&&from>to?"开始日期不能晚于结束日期。":"";
 return <form data-entry-form="export" className={styles.form} onSubmit={async event=>{
  event.preventDefault();if(lock.current||issue)return;lock.current=true;setBusy(true);setError("");setExpired(false);
  try{
   const params=new URLSearchParams();if(from)params.set("from",from);if(to)params.set("to",to);
   const response=await fetch("/dashboard/export/file?"+params,{cache:"no-store"});
   if(!response.ok){const result=await response.json().catch(()=>null);if(response.status===401)setExpired(true);throw new Error(result?.error??"导出未完成，请重试。");}
   if(!response.headers.get("content-type")?.includes("spreadsheetml"))throw new Error("文件响应异常，请重试。");
   const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
   a.href=url;a.download=response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]??"formward-records.xlsx";a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(e instanceof TypeError?"网络连接未完成，日期范围已保留，请重试。":e instanceof Error?e.message:"导出未完成，日期范围已保留，请重试。");}
  finally{setBusy(false);lock.current=false;}
 }}>
 <div className={styles.range}><label>开始日期<input type="date" name="from" value={from} onChange={e=>{setFrom(e.target.value);setError("");}} disabled={busy}/></label><label>结束日期<input type="date" name="to" value={to} onChange={e=>{setTo(e.target.value);setError("");}} disabled={busy}/></label></div>
 <p className={styles.hint}>留空下载全部有效记录；食材库和公式资料始终完整导出。</p>
 {(issue||error)&&<p role="alert">{issue||error}</p>}{expired&&<a href="/" target="_blank" rel="noreferrer">重新登录后返回此页重试</a>}
 <button type="submit" disabled={busy||!!issue}>{busy?"正在导出…":error?"重试下载 Excel":"下载 Excel · .xlsx"}</button>
 </form>;
}
