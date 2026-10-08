import { LogoutButton } from "./logout-button";
export function DashboardHeader({ email }: { email: string }) {
  return <header className="dashboard-header">
    <a className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></a>
    <div className="dashboard-account"><span>{email}</span><a href="/dashboard/ai" className="dashboard-ai-link">AI 接入</a><LogoutButton /></div>
  </header>;
}
