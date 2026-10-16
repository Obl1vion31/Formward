"use client";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./logout-button";
import { LoadingLink } from "@/components/loading-link";
export function DashboardHeader({ email }: { email: string }) {
  const pathname = usePathname();
  return <header className="dashboard-header">
    <LoadingLink className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></LoadingLink>
    {pathname!=="/dashboard"&&<LoadingLink className="dashboard-back" href="/dashboard">← 总览</LoadingLink>}
    <div className="dashboard-account"><span>{email}</span><LoadingLink href="/dashboard/ai" className="dashboard-ai-link">AI 接入</LoadingLink><LogoutButton /></div>
  </header>;
}
