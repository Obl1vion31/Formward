import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // 服务签名绑定原始路径与全部查询；保留 RSC 查询和头，避免框架归一化后验签失败。
  skipProxyUrlNormalize: true,
  output: process.env.FORMWARD_STANDALONE === "1" ? "standalone" : undefined,
  // 允许该主机名加载开发服务资源；这是开发来源配置，不是生产环境的登录权限或 API CORS。
  // 添加其他端口转发域名后需要重启 pnpm dev。
  env: {NEXT_PUBLIC_APP_VERSION: process.env.FORMWARD_BUILD_VERSION ?? "development"},
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
