// 单位均为毫秒。总时长与下方 11 个段长之和必须一致，参数变化后同步调整测试。
export const PRE_LOGIN_DURATION_MS = 425;
// 交叠包含在段长内，不额外加到 425ms 上；过长会增加两个人物轮廓的重影。
export const FRAME_OVERLAP_MS = 16;
// 每次换帧的完整段长：启动快，中段最快，最后三段逐渐收住。
export const FRAME_INTERVALS_MS = [38, 36, 34, 32, 30, 30, 32, 38, 45, 52, 58] as const;
const FRAME_TIMES_MS = [0];
// 累积节点为 0、38、74、108……425；每个节点对应下一帧完全显示的时刻。
for (const interval of FRAME_INTERVALS_MS) FRAME_TIMES_MS.push(FRAME_TIMES_MS.at(-1)! + interval);
export const FINAL_DURATION_MS = 700;
export const REDUCED_DURATION_MS = 180;

// 0 表示正面首帧，1 表示背面第 12 帧；中间进度可以是任意 0–1 小数。
export type TargetProgress = 0 | 1;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  // 3t²−2t³ 在两端速度为零，只用于短交叠和表单浮现，不改变整段播放速度。
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

// 进度是线性时间游标；节奏由帧节点决定，反向沿同一时间轴返回。
export function frameWeights(animationProgress: number, count: number, reducedMotion = false): number[] {
  if (count < 1) return [];
  if (count === 1) return [1];

  const progress = clamp01(animationProgress);
  const weights = Array<number>(count).fill(0);
  if (reducedMotion) {
    // 减少动态效果时只混合首尾；中间 10 张仍已加载，但不显示连续转身。
    weights[0] = 1 - progress;
    weights[count - 1] = progress;
    return weights;
  }

  if (progress === 1) {
    // 终点单独处理，避免寻找 time 之后的节点时超出数组。
    weights[count - 1] = 1;
    return weights;
  }

  // 将归一化游标映射到基准时间轴。测试注入不同播放时长时，帧节奏比例保持相同。
  const time = progress * PRE_LOGIN_DURATION_MS;
  const calibratedSequence = count === FRAME_TIMES_MS.length;
  const uniformInterval = PRE_LOGIN_DURATION_MS / (count - 1);
  // 当前 12 帧使用显式节点；其他帧数自动退回等间隔兼容映射。
  const currentFrameIndex = calibratedSequence
    ? FRAME_TIMES_MS.findIndex((end) => end > time) - 1
    : Math.floor(progress * (count - 1));
  const nextFrameIndex = Math.min(currentFrameIndex + 1, count - 1);
  const end = calibratedSequence ? FRAME_TIMES_MS[nextFrameIndex] : uniformInterval * nextFrameIndex;
  const interval = calibratedSequence ? FRAME_INTERVALS_MS[currentFrameIndex] : uniformInterval;
  const overlap = Math.min(FRAME_OVERLAP_MS, interval);
  // 段尾才交叠：以首段为例，0–22ms 停留，22–38ms 混合 Frame 1 与 Frame 2。
  // 未进入交叠时 smoothstep 会把负值截为 0，当前帧保持全亮。
  const blend = smoothstep((time - (end - overlap)) / overlap);

  // 两个透明度互补，总和为 1；正确的像素相加还依赖 CSS 的隔离组和 plus-lighter。
  weights[currentFrameIndex] = 1 - blend;
  if (nextFrameIndex !== currentFrameIndex) weights[nextFrameIndex] = blend;
  return weights;
}

// 转身的最后 40% 进度才显现表单，让背部先展开；倒放使用同一映射。
export function loginReveal(animationProgress: number): number {
  return smoothstep((animationProgress - 0.6) / 0.4);
}

export function createProgressTimeline(
  onProgress: (animationProgress: number) => void,
  onComplete: (targetProgress: TargetProgress) => void,
  durationMs = PRE_LOGIN_DURATION_MS,
) {
  // 闭包保存时钟，不使用 React state。每次 tick 只调用 onProgress 更新实际 DOM。
  let animationProgress = 0;
  let targetProgress: TargetProgress = 0;
  let startProgress = 0;
  let startedAt = 0;
  let duration = 0;
  let frame = 0;
  let running = false;

  function sample(time: number) {
    // 当前进度 = 起点 + 剩余路程 × 已经过时间比例；正放 / 倒放共用同一个公式。
    const elapsed = clamp01((time - startedAt) / duration);
    animationProgress = elapsed === 1
      ? targetProgress
      : startProgress + (targetProgress - startProgress) * elapsed;
    onProgress(animationProgress);
    return elapsed;
  }

  function tick(time: number) {
    if (!running) return;
    if (sample(time) === 1) {
      // 端点只完成一次，之后不再安排下一帧；父组件据此切换 INTRO / LOGIN_READY。
      running = false;
      onComplete(targetProgress);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function cancel() {
    // 停止时保留 animationProgress，方便反向从当前位置接着播放。
    running = false;
    cancelAnimationFrame(frame);
  }

  function playTo(target: TargetProgress, reducedMotion = false) {
    // 惯性和同方向输入不重启时钟。
    if (running && target === targetProgress) return;
    // 输入可能发生在两次 rAF 之间，先补采真实时刻，避免沿用上一帧的旧位置。
    if (running) sample(performance.now());
    cancel();
    targetProgress = target;
    startProgress = animationProgress;
    if (animationProgress === target) {
      onComplete(target);
      return;
    }
    // 反向从当前连续位置起步，剩余时间随剩余路程缩短。
    duration = (reducedMotion ? REDUCED_DURATION_MS : durationMs) * Math.abs(target - startProgress);
    startedAt = performance.now();
    running = true;
    frame = requestAnimationFrame(tick);
  }

  return { playTo, cancel, getProgress: () => animationProgress };
}
