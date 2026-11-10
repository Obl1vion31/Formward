import { createHash, createHmac } from "node:crypto";
import { ApiError } from "../auth/ai-identity";
import { configuredOrigin } from "../auth/regions";

export type DoubaoConfig = {
  appId: string;
  appSecret: string;
  origin: string;
  secret: string;
  openApiBase: string;
};

export function doubaoConfig(env: Record<string, string | undefined> = process.env): DoubaoConfig {
  if (env.FORMWARD_DOUBAO_ENABLED !== "1") {
    throw new ApiError(503, "doubao_unavailable", "豆包接入尚未启用。");
  }
  const appId = env.FORMWARD_DOUBAO_APP_ID;
  const appSecret = env.FORMWARD_DOUBAO_APP_SECRET;
  const secret = env.BETTER_AUTH_SECRET;
  if (!appId || !appSecret || !secret || secret.length < 32 || !env.FORMWARD_DOUBAO_ORIGIN) {
    throw new ApiError(503, "doubao_unavailable", "豆包服务端配置尚未完成。");
  }
  const origin = configuredOrigin(env.FORMWARD_DOUBAO_ORIGIN);
  const base = new URL(env.DOUBAO_OPENAPI_BASE_DOMAIN ?? "https://api.doubao-dev.com");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
  if ((base.protocol !== "https:" && !(local && base.protocol === "http:")) || base.username || base.password || base.search || base.hash) {
    throw new ApiError(503, "doubao_unavailable", "豆包服务地址配置无效。");
  }
  return { appId, appSecret, secret, origin, openApiBase: base.href.replace(/\/$/, "") };
}

export function openIdDigest(config: DoubaoConfig, openId: string) {
  return createHmac("sha256", config.secret).update("formward:doubao:openid:v1\0" + config.appId + "\0" + openId).digest("hex");
}

export function doubaoClientId(config: DoubaoConfig, digest: string) {
  return "doubao_" + createHash("sha256").update(config.appId + "\0" + config.origin + "\0" + digest).digest("hex");
}
