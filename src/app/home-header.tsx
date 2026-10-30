import { BrandLogo } from "@/components/brand-logo";

// 品牌图形和文字共用 BrandLogo；位置、字号和阶段透明度在 globals.css。
// 此组件没有动画计时器；父级的 data-phase 让 CSS 决定 Logo 的显示状态。
export function HomeHeader({ showBack = false, canGoBack = false, onBack }: { showBack?: boolean; canGoBack?: boolean; onBack?: () => void }) {
  return (
    <header className="home-header">
      <div className="home-logo" role="img" aria-label="Formward"><BrandLogo /></div>
      {showBack && <button className="home-return" type="button" aria-label="返回初始画面" disabled={!canGoBack} onClick={onBack}>← 返回</button>}
    </header>
  );
}
