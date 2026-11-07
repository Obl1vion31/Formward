import {sourcePilotEnabled} from "@/features/data-sources/model";
import {WorkspaceFrame} from '@/components/workspace-frame';
import {localMeasurementDate} from '@/features/measurements/entry-state';
import {ConfirmationProvider} from "@/components/confirmation";
import {AssistantProvider} from "@/features/assistant/provider";
import {RecordUpdates} from "@/components/record-updates";
import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";
import {DashboardHeader} from "./header";
import {AppearanceSync} from "@/components/appearance-switch";
import {ChartTransitionProvider} from "@/components/chart-transition";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // 登录校验在页面数据的 Suspense 之外，未登录在开始页面流之前正常重定向。
  // 每个页面和 Server Action 继续校验身份，不能只依赖会被复用的 layout。
  const user=await currentPageUser();if (!user) redirect("/");
  return <ConfirmationProvider key={user.id}><AssistantProvider key={user.id} accountId={user.id}><ChartTransitionProvider><AppearanceSync/><RecordUpdates/><div className="workspace-shell"><DashboardHeader sourcePilot={sourcePilotEnabled(user.id)} email={user.email} owner={user.role==="owner"}/><WorkspaceFrame today={localMeasurementDate(new Date(),process.env.FORMWARD_TIMEZONE||"Asia/Shanghai")}>{children}</WorkspaceFrame></div></ChartTransitionProvider></AssistantProvider></ConfirmationProvider>;
}
