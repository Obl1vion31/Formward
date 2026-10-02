import HomeExperience from "./home-experience";

// Next.js 将 src/app/page.tsx 映射为网站根路径 /。
// 页面入口只挂载体验组件；滚动、动画和表单协调都在 HomeExperience 中。
export default function HomePage() {
  return <HomeExperience />;
}
