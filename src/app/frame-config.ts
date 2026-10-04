import type { StaticImageData } from "next/image";
// 静态导入让 Next.js 读取原图尺寸，并在构建时生成随素材内容变化的地址。
// 下面的 /images/1.png 等字符串是配置键；Image 实际接收的是导入的 frame1 对象。
import frame1 from "../../public/images/1.png";
import frame12 from "../../public/images/12.png";
import frame13 from "../../public/images/13.png";

// scale 是无单位的等比缩放；x / y 保留 CSS 单位，例如 "1%"。
// translate 的百分比以图片所在帧元素自身的宽 / 高为基准，不是屏幕宽 / 高。
export type FrameTransform = {
  scale: number;
  x: string;
  y: string;
};

export type FigureFrame = {
  image: StaticImageData;
  desktop: FrameTransform;
  mobile: FrameTransform;
};

// 保留原始首尾静态图；中间动作由 turn-video.ts 的视频提供。
// as const 保留具体路径的字面量类型，帮助 TypeScript 检查配置有没有漏项。
export const PRE_LOGIN_FRAMES = [
  "/images/1.png",
  "/images/12.png",
] as const;

// 最终帧只由 Enter 触发，永远不参加滚动时间线。
export const FINAL_FRAME = "/images/13.png";
// [number] 取数组中所有元素的类型；| 将滚动帧路径与最终帧路径合并。
type FramePath = (typeof PRE_LOGIN_FRAMES)[number] | typeof FINAL_FRAME;

// 以路径关联素材和独立对齐值，避免扩展时多个数组错位。
// 首尾和最终帧沿用原来的校准；视频单独匹配两端，见 docs/frame-calibration.md。
// Record 要求每个合法路径都有 FigureFrame；desktop / mobile 由 CSS 断点选择。
// 想修正某一张的位置时改对应行；整体人物大小优先改 globals.css 的图片高度。
export const FRAME_CONFIG: Record<FramePath, FigureFrame> = {
  "/images/1.png": { image: frame1, desktop: { scale: 1, x: "0%", y: "1%" }, mobile: { scale: 0.98, x: "0%", y: "-3%" } },
  "/images/12.png": { image: frame12, desktop: { scale: 0.98811, x: "-6.175%", y: "0.918%" }, mobile: { scale: 0.96835, x: "-6.051%", y: "-3.08%" } },
  "/images/13.png": { image: frame13, desktop: { scale: 0.968, x: "-1.5%", y: "0%" }, mobile: { scale: 0.949, x: "-1.5%", y: "-4%" } },
};
