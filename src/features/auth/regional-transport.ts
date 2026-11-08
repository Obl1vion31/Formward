import { createHmac, timingSafeEqual } from "node:crypto";
import { configuredOrigin, regionConfig } from "./regions";

export const REGIONAL_PROTOCOL = "formward-regional-v1";
export function serviceSignature(method: string, path: string, origin: string, time: string, ip: string, key: string) {
  if (key.length < 32) throw new Error("服务凭据至少32个随机字符。");
  return createHmac("sha256", key).update([REGIONAL_PROTOCOL, method, path, origin, time, ip].join("\n")).digest("base64url");
}
export function serviceHeaders(method: string, path: string, origin: string, ip = "") {
  const key = process.env.FORMWARD_GATEWAY_SECRET;
  if (!key) throw new Error("国际入口尚未配置。");
  const time = String(Date.now());
  return { "x-formward-service": serviceSignature(method, path, origin, time, ip, key),
    "x-formward-time": time, "x-formward-source": origin, "x-formward-ip": ip };
}
export function verifyService(headers: Headers, method: string, path: string) {
  const config = regionConfig(), key = process.env.FORMWARD_GATEWAY_SECRET;
  const origin = headers.get("x-formward-source") ?? "", time = headers.get("x-formward-time") ?? "", ip = headers.get("x-formward-ip") ?? "";
  if (!key || ![config.global, config.canonical].includes(origin) || !/^\d{13}$/.test(time) || Math.abs(Date.now() - Number(time)) > 30_000) return null;
  const expected = Buffer.from(serviceSignature(method, path, origin, time, ip, key));
  const actual = Buffer.from(headers.get("x-formward-service") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? { origin, ip } : null;
}
export function cleanForwardHeaders(input: Headers) {
  const output = new Headers(input), connection = input.get("connection")?.split(",") ?? [];
  for (const name of [...output.keys()]) if (/^(x-formward-|x-middleware-|x-forwarded-)/i.test(name) ||
    ["host","forwarded","x-real-ip","connection","keep-alive","transfer-encoding","upgrade","proxy-authorization","proxy-authenticate","te","trailer","content-length","accept-encoding", ...connection.map(s=>s.trim().toLowerCase())].includes(name.toLowerCase())) output.delete(name);
  return output;
}
export async function forwardRegionalRequest(request: Request, fetcher: typeof fetch = fetch) {
  const config = regionConfig(), url = new URL(request.url), origin = configuredOrigin(url.origin);
  if (![config.global, config.canonical].includes(origin)) return new Response(null, { status: 421 });
  if (url.pathname.startsWith("/api/internal/")) return new Response(null, { status: 404 });
  if (request.headers.get("x-formward-service")) return new Response(null, { status: 400 });
  const target = new URL(url.pathname + url.search, config.transport);
  if (target.origin === origin || target.origin !== config.transport) return new Response(null, { status: 502 });
  const headers = cleanForwardHeaders(request.headers);
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
  for (const [key, value] of Object.entries(serviceHeaders(request.method, target.pathname + target.search, origin, ip))) headers.set(key,value);
  headers.set("accept-encoding","identity");
  const response = await fetcher(target, { method: request.method, headers, body: request.body,
    ...(request.body ? { duplex: "half" } : {}), redirect: "manual", cache: "no-store", signal: request.signal } as RequestInit);
  const immutable = request.method === "GET" && /^\/_next\/static\/[a-zA-Z0-9/_.,~-]+$/.test(url.pathname) && response.status === 200 && !response.headers.has("set-cookie");
  return regionalResponse(response,immutable);
}
export function regionalResponse(response:Response,immutable=false){
  const returned = cleanForwardHeaders(response.headers);
  returned.delete("content-encoding"); returned.delete("content-length");
  returned.delete("set-cookie");
  for (const cookie of response.headers.getSetCookie()) {
    if (/;\s*domain=/i.test(cookie)) throw new Error("拒绝共享域 Cookie。");
    returned.append("set-cookie",cookie);
  }
  returned.set("cache-control", immutable ? "public, max-age=31536000, immutable" : "private, no-store");
  returned.set("x-formward-protocol", REGIONAL_PROTOCOL);
  return new Response(response.body,{ status: response.status, headers: returned });
}
