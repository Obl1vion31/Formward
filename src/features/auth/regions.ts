/** 所有入口均来自部署配置，绝不从任意 Host 推导跨区地址。 */
export type ProcessingRegion = "cn" | "global";
const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function configuredOrigin(value: string) {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && local.has(url.hostname)))) throw new Error("入口必须是 HTTPS 根地址，本机测试可用 HTTP。");
  return url.origin;
}
export function regionConfig(env = process.env) {
  const canonical = configuredOrigin(env.BETTER_AUTH_URL ?? "http://localhost:3000");
  return { enabled: env.FORMWARD_REGIONAL === "1", canonical,
    selector: configuredOrigin(env.FORMWARD_SELECTOR_ORIGIN ?? "https://formward.top"),
    cn: configuredOrigin(env.FORMWARD_CN_ORIGIN ?? "https://cn.formward.top"),
    global: configuredOrigin(env.FORMWARD_GLOBAL_ORIGIN ?? "https://global.formward.top"),
    transport: configuredOrigin(env.FORMWARD_ORIGIN_URL ?? "https://origin.formward.top"),
  };
}
export function publicRequestOrigin(headers: Headers) {
  const config = regionConfig();
  if (!config.enabled) return config.canonical;
  // 此头只由 proxy 在入口认证后重新生成；原始外来值在 proxy 删除。
  const origin = headers.get("x-formward-public-origin");
  if (![config.cn, config.global, config.canonical].includes(origin ?? "")) throw new Error("请求来源尚未验证。");
  return origin!;
}
export function processingRegion(headers?: Headers): ProcessingRegion {
  return headers?.get("x-formward-region") === "global" ? "global" : process.env.FORMWARD_IMAGE_REGION === "cn" ? "cn" : "global";
}
export function canonicalMcpUrl() { return new URL("/api/mcp", regionConfig().canonical).href; }
