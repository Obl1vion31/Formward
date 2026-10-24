"use client";
import { useRef, useState } from "react";
import { mealDayLabels, type MealDayInput, type MealDayView } from "./model";
import styles from "./meal-day-control.module.css";
export function MealDayControl({day,busy,save}:{day:MealDayView;busy:boolean;save:(input:MealDayInput)=>Promise<boolean>}) {
  const request=useRef<MealDayInput|null>(null),[working,setWorking]=useState(false);
  async function choose(status:"complete"|"incomplete"){
    if(busy||working)return;
    const previous=request.current;
    if(!previous||previous.status!==status||previous.version!==day.version||previous.contentDigest!==day.contentDigest)request.current={operationId:crypto.randomUUID(),date:day.date,status,version:day.version,contentDigest:day.contentDigest};
    setWorking(true);
    try{if(await save(request.current!))request.current=null;}finally{setWorking(false);}
  }
  return <div className={styles.control} data-meal-day-status={day.status}><span>{mealDayLabels[day.status]}</span><div role="group" aria-label={day.date+" 饮食是否记完"}><button type="button" disabled={busy||working||day.status==="complete"} aria-pressed={day.status==="complete"} onClick={()=>void choose("complete")}>已记完</button><button type="button" disabled={busy||working||day.status==="incomplete"} aria-pressed={day.status==="incomplete"} onClick={()=>void choose("incomplete")}>未记全</button></div></div>;
}
