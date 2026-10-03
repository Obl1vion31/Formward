import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/features/auth/server";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = { title: "Formward · 主页" };

export default async function DashboardPage() {
  const user = await currentUser(await headers());
  if (!user) redirect("/");

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <a className="dashboard-logo" href="/dashboard" aria-label="Formward 主页">formward<span>.</span></a>
        <div className="dashboard-account"><span>{user.email}</span><LogoutButton /></div>
      </header>
      <section className="dashboard-content" aria-labelledby="dashboard-title">
        <p className="dashboard-eyebrow">你的 Formward</p>
        <h1 id="dashboard-title">每一次记录，<br />都让方向更清晰。</h1>
        <p className="dashboard-intro">在这里记录饮食、运动与身体变化，回看自己的进展。</p>
        <div className="dashboard-modules">
          <article><h2>饮食</h2><p>记录每日摄入与餐次。</p><span>即将开放</span></article>
          <article><h2>运动</h2><p>留下每次训练与活动。</p><span>即将开放</span></article>
          <article><h2>身体指标</h2><p>追踪测量与阶段变化。</p><span>即将开放</span></article>
        </div>
      </section>
    </main>
  );
}
