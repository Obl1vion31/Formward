import localFont from "next/font/local";

// 主标题继承 Logo 的系统字体；仅为微标签及 SCROLL 提供本地字体变量。
export const heroMono = localFont({
  src: "../../public/fonts/ibm-plex-mono-latin-regular.woff2",
  weight: "400",
  variable: "--font-hero-mono",
  display: "swap",
  adjustFontFallback: false,
});
