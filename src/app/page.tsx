import HomeExperience from "./home-experience";
import { headers } from "next/headers";
import { regionConfig } from "@/features/auth/regions";
import { RegionSelector } from "./region/selector";
import styles from "./home-footer.module.css";

// Next.js 将 src/app/page.tsx 映射为网站根路径 /。
// 页面入口只挂载体验组件；滚动、动画和表单协调都在 HomeExperience 中。
export default async function HomePage() {
  const config = regionConfig(), requestHeaders = await headers();
  if (config.enabled && !config.singleWeb && requestHeaders.get("host") === new URL(config.selector).host) {
    return <RegionSelector cn={config.cn} global={config.global} />;
  }
  return <div className={styles.shell}><HomeExperience /><footer className={styles.footer}>
    <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">沪ICP备2026060534号-1</a>
  </footer></div>;
}
