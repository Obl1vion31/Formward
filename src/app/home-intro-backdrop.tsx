import { Fragment, type CSSProperties, type RefObject } from "react";

// 坐标与 SVG viewBox 一致，节点和标题共用锚点，避免响应式缩放后脱节。
const principles = [
  { id: "discipline", title: "Discipline", detail: "Nutrition", x: 360, y: 288, leaderX: 310 },
  { id: "drive", title: "Drive", detail: "Build yourself", x: 1080, y: 270, leaderX: 1120 },
  { id: "ai", title: "Effortless", detail: "AI logging", x: 1080, y: 640, leaderX: 1120 },
];

// 三组标题与弧线共用转身进度；背景层独立于人物视差和人物内部的透明合成。
export function HomeIntroBackdrop({ backdropRef }: { backdropRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="home-intro-backdrop" ref={backdropRef} lang="en">
      <svg className="home-intro-arc" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="home-orbit" d="M 360 288 C 440 112, 940 118, 1080 270 C 1204 404, 1204 580, 1080 640" vectorEffect="non-scaling-stroke" />
        {principles.map(({ id, x, y, leaderX }) => (
          <path className="home-orbit-leader" key={id} d={`M ${leaderX} ${y} H ${x}`} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {principles.map(({ id, title, detail, x, y }) => {
        const anchor = { "--node-x": `${x / 1440 * 100}%`, "--node-y": `${y / 900 * 100}%` } as CSSProperties;
        return (
          <Fragment key={id}>
            <span className="home-orbit-node" style={anchor} aria-hidden="true" />
            <p className={`home-principle home-principle-${id}`} style={anchor}>
              <span className="home-principle-title">{title}</span>{" "}
              <span className="home-principle-detail">{detail}</span>
            </p>
          </Fragment>
        );
      })}
    </div>
  );
}
