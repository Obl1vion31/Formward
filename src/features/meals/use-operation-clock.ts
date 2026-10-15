"use client";
import { useEffect, useState } from "react";
// 预览到期无需刷新页面；重新回到页面时立即核对。
export function useOperationClock() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update(); const timer = window.setInterval(update, 5000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return now || undefined;
}
