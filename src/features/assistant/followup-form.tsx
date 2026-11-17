"use client";
import {useRef,useState} from "react";
import type {Followup} from "./chat-model";
import {followupQuestions, followupText, type FollowupSubmission} from "./followup";
import styles from "./chat.module.css";

export function FollowupForm({task,busy,submit,cancel}:{task:Followup;busy:boolean;submit:(value:FollowupSubmission)=>Promise<void>;cancel:()=>void}){
 const [answers,setAnswers]=useState<FollowupSubmission["answers"]>([]),[error,setError]=useState("");
 const [writing,setWriting]=useState<string[]>([]),[textDrafts,setTextDrafts]=useState<Record<string,string>>({});
 const [index,setIndex]=useState(0),questionHeading=useRef<HTMLLegendElement>(null);
 const questions=followupQuestions(task),q=questions[index],answer=answers.find(a=>a.questionId===q.id);
 const free=!answer?.skipped&&(writing.includes(q.id)||!q.options?.length&&q.allowText!==false);
 function showQuestion(next:number){setIndex(next);setError("");requestAnimationFrame(()=>questionHeading.current?.focus({preventScroll:true}));}
 function change(id:string,patch:Partial<FollowupSubmission["answers"][number]>){setError("");setAnswers(rows=>{const current=rows.find(row=>row.questionId===id),next={questionId:id,...current,...patch};return [...rows.filter(row=>row.questionId!==id),next];});}
 const check=(selected:boolean)=><span className={styles.followupCheck} aria-hidden="true">{selected&&<svg width="16" height="16" viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>;
 return <form className={styles.followup} aria-label={"补充"+task.subject} onSubmit={async event=>{event.preventDefault();
  const missing=questions.findIndex(question=>{const value=answers.find(a=>a.questionId===question.id);return !value||!value.skipped&&!value.optionIds?.length&&!value.text?.trim();});
  if(missing>=0){setIndex(missing);setError("请回答这一题"+(questions[missing].optional?"，或选择暂不填写。":"后再提交。"));requestAnimationFrame(()=>questionHeading.current?.focus({preventScroll:true}));return;}
  const value={messageId:task.messageId,answers};try{followupText(task,value);}catch(failure){setError(failure instanceof Error?failure.message:"请完成补充。");return;}await submit(value);}}>
  <fieldset disabled={busy}>
   {questions.length>1&&<div className={styles.followupNavigation}><button type="button" aria-label="上一题" disabled={index===0} onClick={()=>showQuestion(index-1)}>‹</button><span aria-live="polite">{index+1} / {questions.length}</span><button type="button" aria-label="下一题" disabled={index===questions.length-1} onClick={()=>showQuestion(index+1)}>›</button></div>}
   <fieldset><legend ref={questionHeading} tabIndex={-1}>{q.prompt}{q.optional&&<small>（选填）</small>}</legend>
   <div className={styles.followupOptions}>{q.options?.map(option=>{const selected=answer?.optionIds?.includes(option.id)??false;return <button key={option.id} type="button" aria-pressed={selected} onClick={()=>{const values=answer?.optionIds??[];if(!q.multiple)setWriting(ids=>ids.filter(id=>id!==q.id));change(q.id,{skipped:false,text:q.multiple?answer?.text:"",optionIds:q.multiple?selected?values.filter(id=>id!==option.id):[...values,option.id]:selected?[]:[option.id]});}}><span>{option.label}</span>{check(selected)}</button>;})}
   {q.allowText!==false&&(!!q.options?.length||answer?.skipped||writing.includes(q.id))&&<button type="button" aria-pressed={free} onClick={()=>{setWriting(ids=>ids.includes(q.id)?ids:[...ids,q.id]);change(q.id,{skipped:false,text:textDrafts[q.id]??"",optionIds:q.multiple?answer?.optionIds:[]});}}><span>自己填写</span>{check(free)}</button>}
   {free&&<input aria-label={q.prompt+" · 自由填写"} maxLength={q.binding?300:2000} placeholder={q.binding?"填写设备或应用名称":"填写你的回答"} value={textDrafts[q.id]??answer?.text??""} onChange={event=>{const text=event.target.value;setTextDrafts(rows=>({...rows,[q.id]:text}));change(q.id,{text,skipped:false,optionIds:q.multiple?answer?.optionIds:[]});}}/>}
   </div>{answer?.skipped&&<p className={styles.followupSkipped}>本题暂不填写，可重新选择。</p>}</fieldset>
   {error&&<p role="alert">{error}</p>}<div className={styles.followupActions}><button type="button" onClick={cancel}>换个话题</button><div>{q.optional&&<button type="button" disabled={answer?.skipped} onClick={()=>{setWriting(ids=>ids.filter(id=>id!==q.id));change(q.id,{skipped:true,text:"",optionIds:[]});}}>{q.binding?"本次不填写来源":"暂不填写"}</button>}<button type="submit">{busy?"正在提交…":"提交补充"}</button></div></div>
  </fieldset>
 </form>;
}
