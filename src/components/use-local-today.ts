"use client";
import { useEffect, useState } from "react";
export function useLocalToday(initial: string) {
  const [today, setToday] = useState(initial);
  useEffect(() => {
    const update = () => { const now = new Date(); setToday(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`); };
    queueMicrotask(update);
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  return today;
}
