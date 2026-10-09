import { redirect } from "next/navigation";
import { currentPageUser } from "@/features/auth/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // 登录校验在页面数据的 Suspense 之外，未登录在开始页面流之前正常重定向。
  // 每个页面和 Server Action 继续校验身份，不能只依赖会被复用的 layout。
  if (!await currentPageUser()) redirect("/");
  return children;
}
