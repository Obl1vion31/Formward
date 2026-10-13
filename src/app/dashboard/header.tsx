"use client";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./logout-button";
import { LoadingLink } from "@/components/loading-link";
export function DashboardHeader({ email }: { email: string }) {
  const pathname = usePathname();
  return <header className="dashboard-header">
    <LoadingLink className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></LoadingLink>
    <nav className="dashboard-navigation" aria-label="记录导航"><LoadingLink href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>身体记录</LoadingLink><LoadingLink href="/dashboard/meals" aria-current={pathname.startsWith("/dashboard/meals") ? "page" : undefined}>饮食记录</LoadingLink></nav>
    <div className="dashboard-account"><span>{email}</span><LoadingLink href="/dashboard/ai" className="dashboard-ai-link">AI 接入</LoadingLink><LogoutButton /></div>
  </header>;
}
