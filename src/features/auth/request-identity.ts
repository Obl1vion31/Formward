import { getAuth } from "./auth";
import { getDatabase } from "../../db/client";
import { ApiError } from "./ai-identity";
import { requireSessionProof, webSessionContext, type SessionProof } from "./account-security";

/** 当前请求凭据只在服务端传递，不能接受浏览器提交的用户／会话标识。 */
export async function currentSessionIdentity(headers: Headers) {
  const identity = await getAuth().api.getSession({ headers });
  if (!identity) throw new ApiError(401, "invalid_session", "登录已失效，请重新登录。");
  const proof: SessionProof = { userId: identity.user.id, sessionId: identity.session.id, accessVersion: identity.session.accessVersion };
  await requireSessionProof(getDatabase(), proof);
  return { user: identity.user, proof };
}

export async function withCurrentSession<T>(headers: Headers, work: (user: Awaited<ReturnType<typeof currentSessionIdentity>>["user"], proof: SessionProof) => Promise<T>) {
  const identity = await currentSessionIdentity(headers);
  return webSessionContext.run(identity.proof, () => work(identity.user, identity.proof));
}

export function accountRequestSource(headers: Headers) {
  return (headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown").slice(0, 200);
}
