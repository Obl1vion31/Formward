import { requirePageUser } from "@/features/auth/server";

export default async function Page() {
  await requirePageUser();
  // 已登录工作区统一负责显示助手页面。
  return null;
}
