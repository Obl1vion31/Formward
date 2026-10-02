import Image from "next/image";
import type { CSSProperties } from "react";
import { FINAL_FRAME, FRAME_CONFIG, PRE_LOGIN_FRAMES, type FigureFrame } from "./frame-config";

// 将 TypeScript 配置传给 CSS 自定义属性；globals.css 的 transform 读取这些值。
// CSSProperties 的类型断言用于接受 --frame-* 属性，不会改动这些数值。
function frameStyle(frame: FigureFrame): CSSProperties {
  return {
    "--frame-scale-desktop": frame.desktop.scale,
    "--frame-x-desktop": frame.desktop.x,
    "--frame-y-desktop": frame.desktop.y,
    "--frame-scale-mobile": frame.mobile.scale,
    "--frame-x-mobile": frame.mobile.x,
    "--frame-y-mobile": frame.mobile.y,
  } as CSSProperties;
}

// 一次挂载全部 13 张图片，之后只改变透明度，不在播放时切换 src 或创建图片。
// 图片组是装饰画面：aria-hidden 与空 alt 避免屏幕阅读器重复朗读 13 张图。
export function BodySequence() {
  return (
    <div className="body-sequence" aria-hidden="true">
      {/* index 从 0 开始，对应 1.png；data-intro-frame 供父组件和测试定位帧节点。 */}
      {PRE_LOGIN_FRAMES.map((path, index) => (
        <div
          className="body-frame body-frame-intro"
          data-intro-frame={index}
          data-frame-path={path}
          key={path}
          style={frameStyle(FRAME_CONFIG[path])}
        >
          {/* preload 提前请求图片；全部 decode 完成的播放门槛由父组件控制。 */}
          <Image src={FRAME_CONFIG[path].image} alt="" preload />
        </div>
      ))}
      {/* 最终帧独立放在末尾，没有 data-intro-frame，不参加 1–12 的 rAF 权重更新。 */}
      <div
        className="body-frame body-frame-final"
        data-frame-path={FINAL_FRAME}
        style={frameStyle(FRAME_CONFIG[FINAL_FRAME])}
      >
        <Image src={FRAME_CONFIG[FINAL_FRAME].image} alt="" preload />
      </div>
    </div>
  );
}
