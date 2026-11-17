import { NextRequest, NextResponse } from "next/server";
import { regionConfig } from "./features/auth/regions";
import { verifyService } from "./features/auth/regional-transport";
import { singleWebRedirect } from "./features/auth/web-entry";
import { pageSecurity } from "./features/auth/http-security";
import { acceptsCurrentAction } from "./features/auth/action-policy";

export function proxy(request: NextRequest) {
  if (!acceptsCurrentAction(request)) return new NextResponse("网站安全功能已更新，请保留输入并刷新页面后重试。", { status: 409, headers: { "Content-Type":"text/plain", "Cache-Control": "no-store", "X-Formward-Refresh-Required": "1" } });
  const isPage = !request.nextUrl.pathname.startsWith("/api/") && !request.nextUrl.pathname.startsWith("/_next/") && !/\.[a-z0-9]{1,6}$/i.test(request.nextUrl.pathname);
  const incoming = new Headers(request.headers);
  incoming.delete("x-nonce"); incoming.delete("content-security-policy");
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64"), policy = pageSecurity(nonce);
  if (isPage) { incoming.set("x-nonce", nonce); incoming.set("Content-Security-Policy", policy); }
  const response = regionalProxy(new NextRequest(request, { headers: incoming }));
  response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("X-Frame-Options", "DENY"); response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  if (request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https") response.headers.set("Strict-Transport-Security", "max-age=31536000");
  if (isPage) response.headers.set(process.env.FORMWARD_CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", policy);
  return response;
}

function regionalProxy(request: NextRequest) {
  const config = regionConfig();
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (/^x-formward-/i.test(name)) headers.delete(name);
  headers.set("x-formward-web-path", request.nextUrl.pathname + request.nextUrl.search);
  if (!config.enabled) return NextResponse.next({ request: { headers } });
  // Next 图片优化器读取本地构建图片时会创建不带 Host 的内部请求。
  // 构建静态资源本来就公开，不能让业务来源校验阻断这次读取。
  if (request.nextUrl.pathname.startsWith("/_next/static/")) return NextResponse.next({ request: { headers } });
  if (process.env.FORMWARD_MAINTENANCE === "1" && !request.nextUrl.pathname.startsWith("/_next/static/") && request.nextUrl.pathname !== "/api/internal/readiness") {
    return new NextResponse("维护中，请稍后再试。", {status:503,headers:{"Cache-Control":"no-store","Retry-After":"60"}});
  }
  const host = request.headers.get("host"), path = request.nextUrl.pathname, query = request.nextUrl.search;
  if ((host === new URL(config.selector).host || host === "www." + new URL(config.selector).host) && !(config.singleWeb && host === new URL(config.cn).host)) {
    if (config.singleWeb && ["GET", "HEAD"].includes(request.method) && path === "/") {
      const response = NextResponse.redirect(config.cn, 307);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
    if (host?.startsWith("www.")) return NextResponse.redirect(config.selector,308);
    if (path === "/") { headers.set("x-formward-selector","1"); return NextResponse.next({request:{headers}}); }
    if (path.startsWith("/_next/static/") || path === "/favicon.ico") return NextResponse.next({request:{headers}});
    return new NextResponse(null,{status:404});
  }
  const internalJwks=process.env.FORMWARD_INTERNAL_JWKS_URL;
  if(internalJwks){const local=new URL(internalJwks);if(request.method==="GET"&&path==="/api/auth/jwks"&&["127.0.0.1","localhost","[::1]"].includes(local.hostname)&&local.protocol==="http:"&&host===local.host)return NextResponse.next({request:{headers}});}
  let origin: string, ip: string;
  const transportHost = new URL(config.transport).host;
  const directOrigin = [config.cn, config.legacyCn].find(value => value && new URL(value).host === host);
  // IP 调试入口与国际回源共用 443，带服务证明的请求才进入回源校验。
  if (host === transportHost && (!directOrigin || request.headers.has("x-formward-service"))) {
    const service = verifyService(request.headers,request.method,path+query);
    if (!service) return new NextResponse(null,{status:403,headers:{"Cache-Control":"no-store"}});
    origin = service.origin; ip = service.ip;
    for(const name of ["x-formward-service","x-formward-source","x-formward-time","x-formward-ip"]) headers.set(name,request.headers.get(name)??"");
  } else if (directOrigin && !request.headers.has("x-formward-service")) {
    origin = directOrigin; ip = request.headers.get("x-real-ip") ?? "";
    if (origin === config.legacyCn && ["GET", "HEAD"].includes(request.method)) {
      const redirect = singleWebRedirect(new Request(new URL(path + query, origin), { method: request.method, headers: request.headers }));
      if (redirect) return new NextResponse(null, { status: redirect.status, headers: redirect.headers });
    }
  } else return new NextResponse(null,{status:421});
  headers.set("x-formward-public-origin",origin);
  headers.set("x-formward-region",[config.cn, config.legacyCn].includes(origin) ? "cn" : "global");
  headers.set("x-forwarded-host",new URL(origin).host);
  headers.set("x-forwarded-proto",new URL(origin).protocol.slice(0,-1));
  headers.set("x-forwarded-for",ip);
  return NextResponse.next({request:{headers}});
}
