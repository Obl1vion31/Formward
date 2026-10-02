import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许该主机名加载开发服务资源；这是开发来源配置，不是生产环境的登录权限或 API CORS。
  // 添加其他端口转发域名后需要重启 pnpm dev。
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
