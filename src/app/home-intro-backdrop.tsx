import { Fragment, type RefObject } from "react";

const principles = [
  { id: "discipline", title: "Discipline", detail: "NUTRITION" },
  { id: "drive", title: "Drive", detail: "BUILD YOURSELF" },
  { id: "ai", title: "Effortless", detail: "AI LOGGING" },
];

// 两套视觉构图用于 reduced motion 的静态交叠；屏幕阅读器只读取一份文案。
// 正常模式更新 start 场景；手机使用同一场景的底部网格。
export function HomeIntroBackdrop({ backdropRef }: { backdropRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="home-intro-backdrop" ref={backdropRef} lang="en">
      <p className="sr-only">Discipline: Nutrition. Drive: Build yourself. Effortless: AI logging.</p>
      {["start", "end"].map((scene) => (
        <div className={`home-orbit-scene home-orbit-scene-${scene}`} data-orbit-scene={scene} key={scene} aria-hidden="true">
          <svg className="home-intro-arc" viewBox="0 0 1440 900" preserveAspectRatio="none" focusable="false">
            <path className="home-orbit home-orbit-front" vectorEffect="non-scaling-stroke" />
            <path className="home-orbit home-orbit-back" vectorEffect="non-scaling-stroke" />
            {principles.map(({ id }) => <path className="home-orbit-leader" key={id} vectorEffect="non-scaling-stroke" />)}
          </svg>
          {principles.map(({ id, title, detail }) => (
            <Fragment key={id}>
              <span className="home-orbit-node" />
              <p className={`home-principle home-principle-${id}`}>
                <span className="home-principle-title">{title}</span>
                <span className="home-principle-detail">{detail}</span>
              </p>
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
