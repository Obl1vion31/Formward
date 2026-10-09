import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { currentUser } from "./auth";

// Next.js 入口通过此模块使用认证，防止数据库与 secret 进入客户端依赖。
// 管理员脚本和独立测试直接调用 auth.ts / provision.ts。
export { getAuth, currentUser } from "./auth";

// 只在当前 Server Component 渲染请求中复用查询，不跨请求缓存会话。
export const currentPageUser = cache(async () => currentUser(await headers()));
