import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginPageUrl } from "./login-return";
import { currentUser } from "./auth";
import { currentSessionIdentity } from "./request-identity";
import { ApiError } from "./ai-identity";
import {getDatabase} from "../../db/client";
import {consumeSecurityRate} from "./security-usage";

// Next.js 入口通过此模块使用认证，防止数据库与 secret 进入客户端依赖。
// 管理员脚本和独立测试直接调用 auth.ts / provision.ts。
export { getAuth, currentUser } from "./auth";
export { withCurrentSession, withReadSession,withWriteSession,currentSessionIdentity, accountRequestSource } from "./request-identity";

// 只在当前 Server Component 渲染请求中复用查询，不跨请求缓存会话。
export const currentPageUser = cache(async () => currentUser(await headers()));

/** 普通网页登录保留确认目标；OAuth页面继续使用原授权流程。 */
export const requirePageUser=cache(async function requirePageUser() {
  const user = await currentPageUser();
  if (!user) redirect(loginPageUrl((await headers()).get("x-formward-web-path")));
  try { await currentSessionIdentity(await headers());await consumeSecurityRate(getDatabase(),"read",user.id,120); }
  catch (error) {
    if (error instanceof ApiError && ["mfa_setup_required", "mfa_rebind_required", "mfa_required"].includes(error.code)) redirect("/account/security?returnTo=" + encodeURIComponent((await headers()).get("x-formward-web-path") ?? "/dashboard"));
    throw error;
  }
  return user;
});
