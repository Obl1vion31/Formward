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
  return <button type="button" className={styles.control} data-meal-day-status={day.status} aria-label={day.date+" "+mealDayLabels[day.status]+"，点击"+(day.status==="complete"?"标为未记全":"确认已记完")} aria-pressed={day.status==="complete"} disabled={busy||working} onClick={()=>void choose(day.status==="complete"?"incomplete":"complete")}>{working?"保存中…":<>{day.status==="complete"?"✓ ":"○ "}{day.status==="complete"?"已记完":day.status==="incomplete"?"未记全":"待确认"}</>}</button>;
}
