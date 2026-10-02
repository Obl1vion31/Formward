// x / y 是 CSS 像素，rx / ry 是角度；0 表示外层无视差，不会改动逐帧对齐配置。
export type FigurePose = { x: number; y: number; rx: number; ry: number };

const centre = (): FigurePose => ({ x: 0, y: 0, rx: 0, ry: 0 });
// 三个时间分别控制停止多久后回稳、回稳持续多久、跟随鼠标的响应速度。
const IDLE_DELAY_MS = 180;
const RETURN_DURATION_MS = 600;
const FOLLOW_TIME_CONSTANT_MS = 90;

// 独立于换帧时钟，只驱动人物组外层；静止后不再请求 rAF。
export function createFigureMotion(render: (pose: FigurePose, running: boolean) => void) {
  // pose 是当前姿态，target 是鼠标目标；gain 为 1 / 0.5 / 0，分别对应全幅 / 半幅 / 关闭。
  let pose = centre();
  let target = centre();
  let gain = 0;
  let frame: number | null = null;
  let following = false;
  let lastTime = 0;
  let idleAt = Infinity;
  let settling: { from: FigurePose; startedAt: number; duration: number } | null = null;
  let disposed = false;

  function publish() {
    // 传出副本，避免调用者改写内部姿态；running 让父组件只在运动时开启 will-change。
    render({ ...pose }, following || settling !== null);
  }

  function sample(time: number) {
    if (following) {
      const until = Math.min(time, idleAt);
      // 使用真实经过时间 dt，而不是“每帧移动固定比例”，使 60Hz / 120Hz 响应一致。
      // dt = 90ms 时靠近目标约 63%；结果始终落在当前位置与目标之间，不产生过冲。
      const blend = 1 - Math.exp(-Math.max(0, until - lastTime) / FOLLOW_TIME_CONSTANT_MS);
      for (const key of ["x", "y", "rx", "ry"] as const) pose[key] += (target[key] - pose[key]) * blend;
      lastTime = until;
      if (time >= idleAt) {
        // 按实际静止截止时间起算；即使某次 rAF 晚到，也不延长整个回稳。
        following = false;
        settling = { from: { ...pose }, startedAt: idleAt, duration: RETURN_DURATION_MS };
      }
    }
    if (settling) {
      // 回稳权重从 1 平滑降到 0；每次以固定起点计算，最终精确归零。
      const elapsed = Math.min(1, Math.max(0, (time - settling.startedAt) / settling.duration));
      const remaining = 1 - elapsed * elapsed * (3 - 2 * elapsed);
      for (const key of ["x", "y", "rx", "ry"] as const) pose[key] = settling.from[key] * remaining;
      if (elapsed === 1) {
        pose = centre();
        settling = null;
      }
    }
    publish();
  }

  function schedule() {
    // frame 为 null 才安排下一次，避免多个鼠标事件建立重复的 rAF 循环。
    if (frame === null) frame = requestAnimationFrame(tick);
  }

  function tick(time: number) {
    frame = null;
    if (disposed) return;
    sample(time);
    if (following || settling) schedule();
  }

  function reset(duration = 0) {
    // reset(0) 立即归零；reset(180) 等带时长的调用平滑回中，但不自行改变 gain。
    if (disposed) return;
    following = false;
    target = centre();
    if (duration === 0 || Object.values(pose).every((value) => Math.abs(value) < 1e-6)) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pose = centre();
      settling = null;
      publish();
      return;
    }
    settling = { from: { ...pose }, startedAt: performance.now(), duration };
    schedule();
  }

  function move(horizontal: number, vertical: number) {
    if (disposed || gain === 0) return;
    const now = performance.now();
    // 在回稳中重新移动时先补采当前位置，再换目标，视觉上不会跳回旧起点。
    if (following || settling) sample(now);
    const x = Math.min(1, Math.max(-1, horizontal));
    const y = Math.min(1, Math.max(-1, vertical));
    // 坐标限制在 -1…1；负号使位移反向，倾转保持微弱的朝向鼠标效果。
    target = { x: -x * 6 * gain, y: -y * 4 * gain, rx: -y * 0.3 * gain, ry: x * 0.6 * gain };
    settling = null;
    following = true;
    lastTime = now;
    idleAt = now + IDLE_DELAY_MS;
    schedule();
  }

  function setGain(value: number, settleMs = 100) {
    // 阶段、焦点与设备能力由 HomeExperience 判断，这里只执行幅度切换和回中。
    if (disposed) return;
    const next = Math.min(1, Math.max(0, value));
    if (next === gain) {
      if (next === 0 && settleMs === 0) reset();
      return;
    }
    gain = next;
    // 恢复时只接收新的鼠标输入，不回放播放前的目标。
    reset(next === 0 ? settleMs : 0);
  }

  function dispose() {
    // 先取消动画并发布零姿态，再标记销毁；后续调用都直接返回。
    reset();
    gain = 0;
    disposed = true;
  }

  return { move, setGain, reset, dispose };
}
