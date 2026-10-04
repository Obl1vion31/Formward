// 一秒源视频按 2 倍速完整转身；两端交叠同样缩短一半，保留进度比例。
export const PRE_LOGIN_DURATION_MS = 500;
export const ENDPOINT_BLEND_MS = 40;
export const FINAL_DURATION_MS = 700;
export const REDUCED_DURATION_MS = 180;

// 0 表示正面首帧，1 表示背面第 12 帧；中间进度可以是任意 0–1 小数。
export type TargetProgress = 0 | 1;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  // 3t²−2t³ 在两端速度为零，只用于端点交叠和表单浮现，不改变整段播放速度。
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

// 三个权重分别用于原始首帧、视频与原始尾帧，正倒放共用同一映射。
export function turnFrameWeights(animationProgress: number, reducedMotion = false): [number, number, number] {
  const progress = clamp01(animationProgress);
  if (reducedMotion) return [1 - progress, 0, progress];
  const edge = ENDPOINT_BLEND_MS / PRE_LOGIN_DURATION_MS;
  const first = 1 - smoothstep(progress / edge);
  const last = smoothstep((progress - (1 - edge)) / edge);
  return [first, 1 - first - last, last];
}

// 转身的最后 40% 进度才显现表单，让背部先展开；倒放使用同一映射。
export function loginReveal(animationProgress: number): number {
  return smoothstep((animationProgress - 0.6) / 0.4);
}

// 封面标题在转身前 40%（200ms）退出，倒放时连续恢复；简化模式沿全程淡出。
export function introReveal(animationProgress: number, reducedMotion = false): number {
  return 1 - (reducedMotion ? clamp01(animationProgress) : smoothstep(animationProgress / 0.4));
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
