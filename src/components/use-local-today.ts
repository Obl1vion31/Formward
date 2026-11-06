"use client";
import { useEffect, useState } from "react";
export function useLocalToday(initial: string,onDateChange?:()=>void) {
  const [today, setToday] = useState(initial);
  useEffect(() => {
    const localDate=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;};
    let observed=localDate();
    const update=()=>{const next=localDate();setToday(next);if(next!==observed){observed=next;onDateChange?.();}};
    queueMicrotask(update);
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [onDateChange]);
  return today;
}
