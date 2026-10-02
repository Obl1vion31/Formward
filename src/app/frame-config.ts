import type { StaticImageData } from "next/image";
// 静态导入让 Next.js 读取原图尺寸，并在构建时生成随素材内容变化的地址。
// 下面的 /images/1.png 等字符串是配置键；Image 实际接收的是导入的 frame1 对象。
import frame1 from "../../public/images/1.png";
import frame2 from "../../public/images/2.png";
import frame3 from "../../public/images/3.png";
import frame4 from "../../public/images/4.png";
import frame5 from "../../public/images/5.png";
import frame6 from "../../public/images/6.png";
import frame7 from "../../public/images/7.png";
import frame8 from "../../public/images/8.png";
import frame9 from "../../public/images/9.png";
import frame10 from "../../public/images/10.png";
import frame11 from "../../public/images/11.png";
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

// 数组顺序就是正放顺序；倒放使用同一数组的反向权重，不需要另建反向数组。
// as const 保留具体路径的字面量类型，帮助 TypeScript 检查配置有没有漏项。
export const PRE_LOGIN_FRAMES = [
  "/images/1.png",
  "/images/2.png",
  "/images/3.png",
  "/images/4.png",
  "/images/5.png",
  "/images/6.png",
  "/images/7.png",
  "/images/8.png",
  "/images/9.png",
  "/images/10.png",
  "/images/11.png",
  "/images/12.png",
] as const;

// 最终帧只由 Enter 触发，永远不参加滚动时间线。
export const FINAL_FRAME = "/images/13.png";
// [number] 取数组中所有元素的类型；| 将滚动帧路径与最终帧路径合并。
type FramePath = (typeof PRE_LOGIN_FRAMES)[number] | typeof FINAL_FRAME;

// 以路径关联素材和独立对齐值，避免扩展时多个数组错位。
// 1–12 以 Frame 1 的头顶、躯干和尾部标记作离线等比校准，优先稳定头与躯干。
// 第 5 帧为 793×1983，10–12 为 887×1774；测量及残差见 docs/frame-calibration.md。
// Record 要求每个合法路径都有 FigureFrame；desktop / mobile 由 CSS 断点选择。
// 想修正某一张的位置时改对应行；整体人物大小优先改 globals.css 的图片高度。
export const FRAME_CONFIG: Record<FramePath, FigureFrame> = {
  "/images/1.png": { image: frame1, desktop: { scale: 1, x: "0%", y: "1%" }, mobile: { scale: 0.98, x: "0%", y: "-3%" } },
  "/images/2.png": { image: frame2, desktop: { scale: 1.00013, x: "0.488%", y: "0.912%" }, mobile: { scale: 0.98013, x: "0.479%", y: "-3.086%" } },
  "/images/3.png": { image: frame3, desktop: { scale: 1.00442, x: "0.983%", y: "1.07%" }, mobile: { scale: 0.98433, x: "0.964%", y: "-2.932%" } },
  "/images/4.png": { image: frame4, desktop: { scale: 1.00397, x: "-0.488%", y: "0.81%" }, mobile: { scale: 0.98389, x: "-0.478%", y: "-3.186%" } },
  "/images/5.png": { image: frame5, desktop: { scale: 0.98179, x: "-5.167%", y: "1.076%" }, mobile: { scale: 0.96215, x: "-5.063%", y: "-2.926%" } },
  "/images/6.png": { image: frame6, desktop: { scale: 0.99855, x: "-3.706%", y: "0.731%" }, mobile: { scale: 0.97858, x: "-3.632%", y: "-3.263%" } },
  "/images/7.png": { image: frame7, desktop: { scale: 0.9959, x: "-4.281%", y: "0.638%" }, mobile: { scale: 0.97598, x: "-4.196%", y: "-3.355%" } },
  "/images/8.png": { image: frame8, desktop: { scale: 0.97982, x: "-4.556%", y: "0.393%" }, mobile: { scale: 0.96022, x: "-4.465%", y: "-3.595%" } },
  "/images/9.png": { image: frame9, desktop: { scale: 0.96725, x: "-4.221%", y: "-0.169%" }, mobile: { scale: 0.9479, x: "-4.137%", y: "-4.146%" } },
  "/images/10.png": { image: frame10, desktop: { scale: 0.99051, x: "-6.076%", y: "1.434%" }, mobile: { scale: 0.9707, x: "-5.955%", y: "-2.575%" } },
  "/images/11.png": { image: frame11, desktop: { scale: 0.99462, x: "-6.491%", y: "1.071%" }, mobile: { scale: 0.97473, x: "-6.361%", y: "-2.931%" } },
  "/images/12.png": { image: frame12, desktop: { scale: 0.98811, x: "-6.175%", y: "0.918%" }, mobile: { scale: 0.96835, x: "-6.051%", y: "-3.08%" } },
  "/images/13.png": { image: frame13, desktop: { scale: 0.968, x: "-1.5%", y: "0%" }, mobile: { scale: 0.949, x: "-1.5%", y: "-4%" } },
};
