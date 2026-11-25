import { regionConfig } from "./regions";
import { ApiError } from "./ai-identity";
import { readBoundedBody } from "./request-body";
export function pageSecurity(nonce: string, development = process.env.NODE_ENV !== "production") {
  const config = regionConfig(), origins = [...new Set([config.canonical, config.cn, config.global, config.legacyCn].filter((v): v is string => !!v))];
  const bucket = process.env.FORMWARD_COS_BUCKET, region = process.env.FORMWARD_COS_REGION;
  const cos = bucket && region && /^[a-z0-9-]+$/.test(bucket) && /^[a-z0-9-]+$/.test(region) ? `https://${bucket}.cos.${region}.myqcloud.com` : "";
  return ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`, "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${origins.join(" ")} ${cos} https://vercel.com https://*.blob.vercel-storage.com${development ? " ws: wss:" : ""}`,
    "img-src 'self' data: blob:", `media-src 'self' ${origins.join(" ")}`, "font-src 'self'", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'",
    `form-action 'self' ${origins.join(" ")}`, "frame-ancestors 'none'", "report-uri /api/security/csp-report"].join("; ").replace(/\s+/g, " ").trim();
}
export async function boundedSecurityJson(request: Request, maximum = 8192): Promise<unknown> {
  if (!request.body) throw new ApiError(400,"invalid_input","缺少请求内容。");
  const body = await readBoundedBody(request.body, maximum, () => new ApiError(413,"request_too_large","请求过大。"));
  try{return JSON.parse(body.toString("utf8"));}catch{throw new ApiError(400,"invalid_input","请求内容无效。");}
}
