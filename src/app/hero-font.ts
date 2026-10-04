import localFont from "next/font/local";

// 仅为 Hero 提供字体变量；不改变表单或其他页面的字体。
export const heroSans = localFont({
  src: "../../public/fonts/manrope-latin-variable.woff2",
  weight: "300 500",
  variable: "--font-hero-sans",
  display: "swap",
});

export const heroMono = localFont({
  src: "../../public/fonts/ibm-plex-mono-latin-regular.woff2",
  weight: "400",
  variable: "--font-hero-mono",
  display: "swap",
  adjustFontFallback: false,
});
