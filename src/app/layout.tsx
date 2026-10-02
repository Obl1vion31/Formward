import type { Metadata } from "next";
// 在根布局引入一次，全站即可使用 globals.css 中的类名和颜色变量。
import "./globals.css";

// 浏览器标签标题及页面描述；不是首页人物旁显示的正文。
export const metadata: Metadata = {
  title: "Formward · 登录",
  description: "在 Formward 记录和回看饮食、训练与身体指标。",
};

// children 是 Next.js 放入的当前页面；根布局提供共有的 html / body 外壳。
// Readonly 和 React.ReactNode 都是类型说明，不会生成浏览器里的 HTML 标签。
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
