import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "../auth/ai-identity";
import type { DoubaoConfig } from "./config";
import { limitedJson } from "./http";

const responseSchema = z.object({
  code: z.number(),
  log_id: z.string().optional(),
  data: z.object({ open_id: z.string().min(1).max(512) }).nullish(),
});

export async function exchangeOpenId(config: DoubaoConfig, loginCode: string, fetcher: typeof fetch = fetch) {
  const started = Date.now(), requestId = randomUUID();
  let platformCode: number | undefined, logId: string | undefined;
  try {
    const response = await fetcher(config.openApiBase + "/api/login/v1/developer/get_openid", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret, grant_type: "authorization_code", login_code: loginCode }),
    });
    if (!response.ok) throw new Error();
    const result = responseSchema.parse(await limitedJson(response));
    platformCode = result.code;
    logId = result.log_id?.slice(0, 120);
    if (result.code !== 0 || !result.data?.open_id) throw new Error();
    console.info(JSON.stringify({ event: "doubao_openid_exchange", requestId, endpoint: "get_openid", appId: config.appId, stage: "complete", durationMs: Date.now() - started, platformCode, logId }));
    return result.data.open_id;
  } catch {
    console.info(JSON.stringify({ event: "doubao_openid_exchange", requestId, endpoint: "get_openid", appId: config.appId, stage: "failed", durationMs: Date.now() - started, platformCode, logId }));
    throw new ApiError(401, "doubao_login_failed", "豆包登录凭证无效或交换失败，请重新登录后再试。");
  }
}
