"use client";

import { useRef, useState, type FormEvent } from "react";
import { signOut } from "@/features/auth/client";
import { usePageLoading } from "@/components/page-loading-state";

export function LogoutButton() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  usePageLoading({ active: pending, label: "正在退出登录…" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(false);
    try {
      await signOut();
      // 完整导航清空上一账号的客户端页面缓存。
      window.location.replace("/");
    } catch {
      setError(true);
      setPending(false);
      lock.current = false;
    }
  }
  return <form onSubmit={submit}><button type="submit" disabled={pending}>{pending ? "正在退出…" : "退出登录"}</button>{error && <span role="alert">退出失败，请重试。</span>}</form>;
}
