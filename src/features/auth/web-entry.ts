import { regionConfig } from "./regions";
import { siteOrigin } from "./site-url";

const webRoots = ["/dashboard", "/account", "/admin", "/onboarding", "/region"];

/** 只收拢用户新打开的网页；旧页面的数据读取和保存继续使用原有会话。 */
export function singleWebRedirect(request: Request): Response | null {
  const config = regionConfig();
  if (!config.enabled || !config.singleWeb || !["GET", "HEAD"].includes(request.method)) return null;
  const source = new URL(request.url);
  if (source.origin === config.cn || ![config.canonical, config.global, config.selector].includes(source.origin)) return null;
  if (request.headers.get("rsc") === "1" || request.headers.get("next-router-prefetch") === "1") return null;
  if (source.pathname === "/dashboard/export/file") return null;
  if (source.pathname !== "/" && !webRoots.some(root => source.pathname === root || source.pathname.startsWith(root + "/"))) return null;
  // 分别赋值路径和查询，避免 //host 等输入变成另一个跳转目标。
  const target = new URL(config.cn);
  target.pathname = source.pathname === "/region" ? "/" : source.pathname;
  target.search = source.pathname === "/region" ? "" : source.search;
  return new Response(null, { status: 307, headers: {
    Location: target.href, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    Vary: "RSC, Next-Router-Prefetch",
  } });
}

/** 人工确认页采用唯一网页地址，OAuth issuer、MCP resource 和 API 地址继续保持。 */
export function confirmationPageUrl(request: Request, path: string): string {
  const requestOrigin = siteOrigin(request), config = regionConfig();
  const origin = config.enabled && config.singleWeb ? config.cn : requestOrigin;
  const target = new URL(path, origin);
  if (target.origin !== origin || !path.startsWith("/") || path.startsWith("//")) throw new Error("确认页面地址无效。");
  return target.href;
}
