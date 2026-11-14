import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // 服务签名绑定原始路径与全部查询；保留 RSC 查询和头，避免框架归一化后验签失败。
  skipProxyUrlNormalize: true,
  // 国内原图备用通道最多20 MiB；Proxy默认10 MB会截断请求，路由仍严格校验20 MiB。
  experimental: { proxyClientMaxBodySize: "21mb" },
  output: process.env.FORMWARD_STANDALONE === "1" ? "standalone" : undefined,
  // 允许该主机名加载开发服务资源；这是开发来源配置，不是生产环境的登录权限或 API CORS。
  // 添加其他端口转发域名后需要重启 pnpm dev。
  env: {NEXT_PUBLIC_APP_VERSION: process.env.FORMWARD_BUILD_VERSION ?? "development"},
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
