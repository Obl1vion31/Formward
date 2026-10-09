import { LogoutButton } from "./logout-button";
import { LoadingLink } from "@/components/loading-link";
export function DashboardHeader({ email }: { email: string }) {
  return <header className="dashboard-header">
    <LoadingLink className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></LoadingLink>
    <div className="dashboard-account"><span>{email}</span><LoadingLink href="/dashboard/ai" className="dashboard-ai-link">AI 接入</LoadingLink><LogoutButton /></div>
  </header>;
}
