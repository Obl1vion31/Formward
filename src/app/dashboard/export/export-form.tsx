"use client";
import { WorkspaceReturnLink } from "@/components/workspace-return";
import {LocalLoading} from "@/components/local-loading";
import {useRef,useState} from "react";
import {DateField} from "@/components/date-field";
import styles from "./page.module.css";
export function ExportWorkspace({ready=true}:{ready?:boolean}){
 return <main className="dashboard-page" aria-busy={!ready||undefined}><section className={styles.workspace}><WorkspaceReturnLink/><h1>导出 Excel</h1><p>下载自己的饮食、身体与消耗记录，保存为 Excel。</p><ExportForm ready={ready}/><details className={styles.details}><summary>文件包含什么</summary><p>每日汇总、餐次、食物明细、身体记录、每日消耗、活动明细、食材库与公式资料。保留日期、单位与来源，未知留空、0正常保存。</p><p>不包含已删除记录、账号凭据或访问令牌。图片仅保留数量和内部标识，不包含原图；Excel不替代照片或数据库完整备份。</p></details></section></main>;
}
export function ExportForm({ready=true}:{ready?:boolean}){
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[expired,setExpired]=useState(false);
 const lock=useRef(false);
 const issue=from&&to&&from>to?"开始日期不能晚于结束日期。":"";
 return <form data-entry-form="export" className={styles.form} onSubmit={async event=>{
  event.preventDefault();if(!ready||lock.current||issue)return;lock.current=true;setBusy(true);setError("");setExpired(false);
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
 <div className={styles.range}><label>开始日期<DateField name="from" value={from} onChange={e=>{setFrom(e.target.value);setError("");}} disabled={!ready||busy}/></label><label>结束日期<DateField name="to" value={to} onChange={e=>{setTo(e.target.value);setError("");}} disabled={!ready||busy}/></label></div>
 <p className={styles.hint} aria-live="polite">{from&&to?from+" 至 "+to:from?"自 "+from+" 起":to?"截至 "+to:"全部日期"} · 饮食、身体、消耗及活动<br/>附食材库和公式资料。未知值留空，来源栏保留 AI 标识。</p>{!ready&&<LocalLoading/>}
 {(issue||error)&&<p role="alert">{issue||error}</p>}{expired&&<a href="/" target="_blank" rel="noreferrer">重新登录后返回此页重试</a>}
 <button type="submit" disabled={!ready||busy||!!issue}>{busy?"正在导出…":error?"重试下载 Excel":"下载 Excel · .xlsx"}</button>
 </form>;
}
