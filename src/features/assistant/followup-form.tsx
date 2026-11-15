"use client";
import { useState } from "react";
import type { Followup } from "./chat-model";
import { followupQuestions, followupText, type FollowupSubmission } from "./followup";
import styles from "./chat.module.css";

export function FollowupForm({task,busy,submit,cancel}:{task:Followup;busy:boolean;submit:(value:FollowupSubmission)=>Promise<void>;cancel:()=>void}){
  const questions=followupQuestions(task),[answers,setAnswers]=useState<FollowupSubmission["answers"]>([]),[error,setError]=useState("");
  function change(id:string,patch:Partial<FollowupSubmission["answers"][number]>){setAnswers(previous=>{const current=previous.find(a=>a.questionId===id)??{questionId:id};return [...previous.filter(a=>a.questionId!==id),{...current,...patch}];});setError("");}
  return <form className={styles.followup} aria-label={"补充"+task.subject} onSubmit={async event=>{event.preventDefault();const value={messageId:task.messageId,answers};try{followupText(task,value);}catch(failure){setError(failure instanceof Error?failure.message:"请完成补充。");return;}await submit(value);}}>
    <fieldset disabled={busy}>{questions.map(q=>{const answer=answers.find(a=>a.questionId===q.id);return <fieldset key={q.id}><legend>{q.prompt}{q.optional&&!q.binding&&<small>（选填）</small>}</legend>
      {!!q.options?.length&&<div className={styles.followupOptions}>{q.options.map(option=><button key={option.id} type="button" aria-pressed={answer?.optionIds?.includes(option.id)??false} onClick={()=>{const selected=answer?.optionIds??[];change(q.id,{skipped:false,text:q.multiple?answer?.text:"",optionIds:q.multiple?selected.includes(option.id)?selected.filter(id=>id!==option.id):[...selected,option.id]:selected.includes(option.id)?[]:[option.id]});}}>{option.label}</button>)}</div>}
      {q.allowText!==false&&<input aria-label={q.prompt+" · 自由填写"} maxLength={q.binding?300:2000} placeholder={q.binding?"填写设备或应用名称":q.options?.length?"也可以自己填写":q.prompt} value={answer?.text??""} onChange={event=>change(q.id,{text:event.target.value,skipped:false,optionIds:q.multiple?answer?.optionIds:[]})}/>}
      {q.optional&&<button type="button" aria-pressed={answer?.skipped??false} onClick={()=>change(q.id,{skipped:!answer?.skipped,text:"",optionIds:[]})}>{q.binding?"本次不填写来源":"暂不填写"}</button>}
    </fieldset>;})}</fieldset>{error&&<p role="alert">{error}</p>}<div className={styles.followupActions}><button type="submit" disabled={busy}>提交补充</button><button type="button" disabled={busy} onClick={cancel}>换个话题</button></div>
  </form>;
}
