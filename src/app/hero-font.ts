import localFont from "next/font/local";

// 概念词与产品 UI 分开：Newsreader 衔接雕塑，IBM Plex Mono 用于微标签及 SCROLL。
export const heroDisplay = localFont({
  src: "../../public/fonts/newsreader-latin-regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-hero-display",
  display: "swap",
  adjustFontFallback: false,
});

export const heroMono = localFont({
  src: "../../public/fonts/ibm-plex-mono-latin-regular.woff2",
  weight: "400",
  variable: "--font-hero-mono",
  display: "swap",
  adjustFontFallback: false,
});
