import { NextRequest, NextResponse } from "next/server";
import { regionConfig } from "./features/auth/regions";
import { verifyService } from "./features/auth/regional-transport";

export function proxy(request: NextRequest) {
  const config = regionConfig();
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (/^x-formward-/i.test(name)) headers.delete(name);
  if (!config.enabled) return NextResponse.next({ request: { headers } });
  if (process.env.FORMWARD_MAINTENANCE === "1" && !request.nextUrl.pathname.startsWith("/_next/static/") && request.nextUrl.pathname !== "/api/internal/readiness") {
    return new NextResponse("维护中，请稍后再试。", {status:503,headers:{"Cache-Control":"no-store","Retry-After":"60"}});
  }
  const host = request.headers.get("host"), path = request.nextUrl.pathname, query = request.nextUrl.search;
  if (host === new URL(config.selector).host || host === "www." + new URL(config.selector).host) {
    if (host?.startsWith("www.")) return NextResponse.redirect(config.selector,308);
    if (path === "/") { headers.set("x-formward-selector","1"); return NextResponse.next({request:{headers}}); }
    if (path.startsWith("/_next/static/") || path === "/favicon.ico") return NextResponse.next({request:{headers}});
    return new NextResponse(null,{status:404});
  }
  const internalJwks=process.env.FORMWARD_INTERNAL_JWKS_URL;
  if(internalJwks){const local=new URL(internalJwks);if(request.method==="GET"&&path==="/api/auth/jwks"&&["127.0.0.1","localhost","[::1]"].includes(local.hostname)&&local.protocol==="http:"&&host===local.host)return NextResponse.next({request:{headers}});}
  let origin: string, ip: string;
  const transportHost = new URL(config.transport).host, cnHost = new URL(config.cn).host;
  // IP 调试入口与国际回源共用 443，带服务证明的请求才进入回源校验。
  if (host === transportHost && (transportHost !== cnHost || request.headers.has("x-formward-service"))) {
    const service = verifyService(request.headers,request.method,path+query);
    if (!service) return new NextResponse(null,{status:403,headers:{"Cache-Control":"no-store"}});
    origin = service.origin; ip = service.ip;
    for(const name of ["x-formward-service","x-formward-source","x-formward-time","x-formward-ip"]) headers.set(name,request.headers.get(name)??"");
  } else if (host === new URL(config.cn).host && !request.headers.has("x-formward-service")) {
    origin = config.cn; ip = request.headers.get("x-real-ip") ?? "";
  } else return new NextResponse(null,{status:421});
  headers.set("x-formward-public-origin",origin);
  headers.set("x-formward-region",origin === config.cn ? "cn" : "global");
  headers.set("x-forwarded-host",new URL(origin).host);
  headers.set("x-forwarded-proto",new URL(origin).protocol.slice(0,-1));
  headers.set("x-forwarded-for",ip);
  return NextResponse.next({request:{headers}});
}
