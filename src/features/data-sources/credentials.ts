import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "../auth/ai-identity";

function masterKey() {
  const value = process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new ApiError(503, "source_config", "数据连接尚未配置，请稍后重试。");
  return Buffer.from(value, "hex");
}
export function encryptCredential(value: string, userId: string, connectionId: string) {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", masterKey(), nonce);
  cipher.setAAD(Buffer.from(`formward:data-source:v1:${userId}:${connectionId}`));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}
export function decryptCredential(value: string, userId: string, connectionId: string) {
  try {
    const [version, nonce, tag, data, extra] = value.split(".");
    if (version !== "v1" || extra || !nonce || !tag || !data) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(`formward:data-source:v1:${userId}:${connectionId}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new ApiError(503, "source_credential", "连接凭据暂时无法使用，请重新绑定。"); }
}
