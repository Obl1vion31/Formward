import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";
import { ApiError } from "../auth/ai-identity";
import type { DoubaoConfig } from "./config";

const envelopeSchema = z.object({
  appId: z.string().min(1),
  clientId: z.string().min(1),
  expiresAt: z.number().int().positive(),
  nonce: z.string().min(16),
  openIdDigest: z.string().regex(/^[a-f0-9]{64}$/),
  verifier: z.string().optional(),
  code: z.string().optional(),
  refreshToken: z.string().optional(),
}).strict();
export type DoubaoEnvelope = z.infer<typeof envelopeSchema>;
type Purpose = "authorize" | "exchange" | "refresh";

function key(config: DoubaoConfig, purpose: Purpose) {
  return Buffer.from(hkdfSync("sha256", config.secret, config.appId, "formward:doubao:v1:" + purpose, 32));
}

export function sealEnvelope(config: DoubaoConfig, purpose: Purpose, payload: DoubaoEnvelope) {
  const data = envelopeSchema.parse(payload);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(config, purpose), iv);
  cipher.setAAD(Buffer.from("formward:doubao:v1:" + config.appId + ":" + purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return "fdb1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openEnvelope(config: DoubaoConfig, purpose: Purpose, value: string, now = Date.now()): DoubaoEnvelope {
  try {
    if (!value.startsWith("fdb1.") || value.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(value.slice(5))) throw new Error();
    const bytes = Buffer.from(value.slice(5), "base64url");
    if (bytes.length < 29 || bytes.toString("base64url") !== value.slice(5)) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(config, purpose), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from("formward:doubao:v1:" + config.appId + ":" + purpose));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = envelopeSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")));
    const maximum = purpose === "refresh" ? 30 * 86400000 : 300000;
    if (payload.appId !== config.appId || payload.expiresAt <= now || payload.expiresAt > now + maximum + 5000) throw new Error();
    if (purpose === "authorize" && (!payload.verifier || payload.code || payload.refreshToken)) throw new Error();
    if (purpose === "exchange" && (!payload.verifier || !payload.code || payload.refreshToken)) throw new Error();
    if (purpose === "refresh" && (!payload.refreshToken || payload.verifier || payload.code)) throw new Error();
    return payload;
  } catch {
    throw new ApiError(401, "invalid_doubao_credential", "连接凭证无效、已过期或已使用，请返回豆包重新连接。");
  }
}
