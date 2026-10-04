import Image from "next/image";
import type { CSSProperties } from "react";
import { FINAL_FRAME, FRAME_CONFIG, PRE_LOGIN_FRAMES, type FigureFrame } from "./frame-config";
import { TURN_VIDEO_SRC, VIDEO_TRANSFORM } from "./turn-video";

// 将 TypeScript 配置传给 CSS 自定义属性；globals.css 的 transform 读取这些值。
// CSSProperties 的类型断言用于接受 --frame-* 属性，不会改动这些数值。
function frameStyle(frame: Pick<FigureFrame, "desktop" | "mobile">): CSSProperties {
  return {
    "--frame-scale-desktop": frame.desktop.scale,
    "--frame-x-desktop": frame.desktop.x,
    "--frame-y-desktop": frame.desktop.y,
    "--frame-scale-mobile": frame.mobile.scale,
    "--frame-x-mobile": frame.mobile.x,
    "--frame-y-mobile": frame.mobile.y,
  } as CSSProperties;
}

// 静态首尾保留鼠标联动及最终衔接；视频在透明 Canvas 中绘制，不露出黑色矩形。
export function BodySequence() {
  return (
    <div className="body-sequence" aria-hidden="true">
      {/* 两个端点分别为原来的 1.png 和 12.png。 */}
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
      <div className="body-frame body-frame-intro body-frame-video" data-turn-video style={frameStyle(VIDEO_TRANSFORM)}>
        <canvas width={960} height={1440} />
      </div>
      <video className="turn-video-source" src={TURN_VIDEO_SRC} width={960} height={1440} preload="auto" muted playsInline tabIndex={-1} />
      {/* 最终帧不参与转身时间线，继续由 Enter 和认证结果触发。 */}
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
