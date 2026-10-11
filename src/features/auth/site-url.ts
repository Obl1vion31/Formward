const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

// 公网地址由管理员配置，不能采用代理内部地址或客户端提供的 Host。
export function siteOrigin(request: Request, baseURL = process.env.BETTER_AUTH_URL) {
  if (baseURL) {
    const configured = new URL(baseURL);
    if (configured.username || configured.password || configured.search || configured.hash || configured.pathname !== "/") {
      throw new Error("BETTER_AUTH_URL 必须是网站根地址。");
    }
    if (!localHosts.has(configured.hostname)) {
      if (configured.protocol !== "https:") throw new Error("公网 BETTER_AUTH_URL 必须使用 HTTPS。");
      return configured.origin;
    }
    if (!["http:", "https:"].includes(configured.protocol)) throw new Error("网站地址无效。");
  }

  // 本机开发兼容同端口 localhost / 127.0.0.1，保留浏览器的会话域名。
  const local = new URL(request.url);
  local.host = request.headers.get("host") ?? local.host;
  if (!localHosts.has(local.hostname) || !["http:", "https:"].includes(local.protocol)) {
    throw new Error("请配置公网 HTTPS BETTER_AUTH_URL。");
  }
  return local.origin;
}
