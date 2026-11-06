"use client";
import { useRef, useState } from "react";
import { type MealDayInput, type MealDayView } from "./model";
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
  return <button type="button" role="checkbox" className={styles.control} data-meal-day-status={day.status} aria-label={day.date+" 已记全"} aria-checked={day.status==="complete"} aria-busy={working} disabled={busy||working} onClick={()=>void choose(day.status==="complete"?"incomplete":"complete")}><span className={styles.check} aria-hidden="true">{day.status==="complete"?"✓":""}</span><span>已记全</span></button>;
}

export function MealDayStatus({day}:{day:MealDayView}) {
  return <span className={styles.status} data-meal-day-status={day.status}>{day.status==='complete'?'已记全':day.status==='incomplete'?'未记全':'待确认'}</span>;
}
