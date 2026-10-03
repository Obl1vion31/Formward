import "server-only";

// Next.js 入口通过此模块使用认证，防止数据库与 secret 进入客户端依赖。
// 管理员脚本和独立测试直接调用 auth.ts / provision.ts。
export { getAuth, currentUser } from "./auth";
