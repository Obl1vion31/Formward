import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "../auth/ai-identity";
import type { Region } from "../garmin/client";

function masterKey() {
  const value = process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new ApiError(503, "source_config", "数据连接尚未配置，请稍后重试。");
  return Buffer.from(value, "hex");
}
/** 旧v1凭据保持国际站；v2的站点同时参与认证，不能篡改后把密钥发往另一站。 */
export function credentialRegion(value: string): Region {
  const parts = value.split(".");
  if (parts[0] === "v1" && parts.length === 4 && parts.every(Boolean)) return "global";
  if (parts[0] === "v2" && parts.length === 5 && parts.every(Boolean) && (parts[1] === "global" || parts[1] === "china")) return parts[1];
  throw new ApiError(503, "source_credential", "连接凭据暂时无法使用，请重新绑定。");
}
export function encryptCredential(value: string, userId: string, connectionId: string, region?: Region) {
  if (region !== undefined && region !== "global" && region !== "china") throw new ApiError(400, "invalid_region", "请选择中国站或国际站。");
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", masterKey(), nonce);
  const prefix = region ? ["v2", region] : ["v1"];
  cipher.setAAD(Buffer.from(region ? `formward:data-source:v2:${userId}:${connectionId}:${region}` : `formward:data-source:v1:${userId}:${connectionId}`));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [...prefix, nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}
export function decryptCredential(value: string, userId: string, connectionId: string) {
  try {
    const region = credentialRegion(value), parts = value.split("."), version = parts[0];
    const [nonce, tag, data] = parts.slice(version === "v1" ? 1 : 2);
    const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(version === "v1" ? `formward:data-source:v1:${userId}:${connectionId}` : `formward:data-source:v2:${userId}:${connectionId}:${region}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new ApiError(503, "source_credential", "连接凭据暂时无法使用，请重新绑定。"); }
}
