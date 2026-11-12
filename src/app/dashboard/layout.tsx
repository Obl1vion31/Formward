import {sourceAccessEnabled} from "@/features/data-sources/model";
import {WorkspaceFrame} from '@/components/workspace-frame';
import {localMeasurementDate} from '@/features/measurements/entry-state';
import {ConfirmationProvider} from "@/components/confirmation";
import {chatAllowed} from "@/features/assistant/chat-config";
import {AssistantProvider} from "@/features/assistant/provider";
import {RecordUpdates} from "@/components/record-updates";
import { requirePageUser } from "@/features/auth/server";
import {DashboardHeader} from "./header";
import {AppearanceSync} from "@/components/appearance-switch";
import {ChartTransitionProvider} from "@/components/chart-transition";
import {RecordGuidanceProvider} from "@/features/onboarding/record-guidance";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // 登录校验在页面数据的 Suspense 之外，未登录在开始页面流之前正常重定向。
  // 每个页面和 Server Action 继续校验身份，不能只依赖会被复用的 layout。
  const user=await requirePageUser();
  return <ConfirmationProvider key={user.id}><RecordGuidanceProvider key={user.id} accountId={user.id}><AssistantProvider key={user.id} accountId={user.id} chatEnabled={chatAllowed(user)}><ChartTransitionProvider><AppearanceSync/><RecordUpdates/><div className="workspace-shell"><DashboardHeader sourcePilot={sourceAccessEnabled(user.id)} email={user.email} owner={user.role==="owner"}/><WorkspaceFrame sourcePilot={sourceAccessEnabled(user.id)} today={localMeasurementDate(new Date(),process.env.FORMWARD_TIMEZONE||"Asia/Shanghai")}>{children}</WorkspaceFrame></div></ChartTransitionProvider></AssistantProvider></RecordGuidanceProvider></ConfirmationProvider>;
}
