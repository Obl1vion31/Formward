"use client";

// 首页交互总控：React 管阶段，rAF 管连续数值，CSS 管画面样式。
// 从 JSX 的 .home-stage 结构开始读，再沿 requestDirection → renderProgress 理解转身。
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { BodySequence } from "./body-sequence";
import { PRE_LOGIN_FRAMES } from "./frame-config";
import { HomeHeader } from "./home-header";
import { createFigureMotion } from "./figure-motion";
import { createProgressTimeline, FINAL_DURATION_MS, frameWeights, loginReveal, type TargetProgress } from "./home-timeline";
import { LoginOverlay } from "./login-overlay";
import { useDirectionTrigger } from "./use-direction-trigger";

// phase 表示交互阶段，不等于帧序号；FORWARD_ANIMATING 内部会依次经过 1–12。
type Phase = "INTRO" | "FORWARD_ANIMATING" | "LOGIN_READY" | "REVERSE_ANIMATING" | "FINAL_TRANSITION" | "FINAL";

export default function HomeExperience() {
  // DOM ref 找到实际元素；控制器 ref 保存独立时钟，避免在每次 React 渲染时重新创建。
  const stageRef = useRef<HTMLDivElement>(null);
  const motionLayerRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<ReturnType<typeof createFigureMotion> | null>(null);
  // 鼠标能力、页面活跃状态和输入锁定共同决定人物联动幅度。
  const mouseEnabledRef = useRef(false);
  const pageActiveRef = useRef(true);
  const motionGainRef = useRef(0);
  const formLockedRef = useRef(false);
  // “输入框现在有焦点”和“本轮登录已开始填写”是两件事；失焦不解除 formLockedRef。
  const inputFocusedRef = useRef(false);
  const frameNodesRef = useRef<HTMLElement[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const focusLoginRef = useRef(false);
  // ref 在事件内立即生效；state 让 React 渲染 data-phase。二者由 changePhase 一起更新。
  const phaseRef = useRef<Phase>("INTRO");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineRef = useRef<ReturnType<typeof createProgressTimeline> | null>(null);
  const targetProgressRef = useRef<TargetProgress>(0);
  const imagesReadyRef = useRef(false);
  const reducedMotionRef = useRef(false);
  // 这些低频 state 影响 JSX；每一帧的进度和鼠标坐标不放在 state 里。
  const [phase, setPhase] = useState<Phase>("INTRO");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const [imageError, setImageError] = useState(false);

  const updateMotion = useCallback((settleMs = 100) => {
    // 先检查设备、解码和系统偏好，再按阶段选择 1、0.5 或 0 倍幅度。
    // 默认 100ms 用于开始转身；输入聚焦传 180ms，能力关闭传 0 立即归零。
    const phase = phaseRef.current;
    const allowed = mouseEnabledRef.current && pageActiveRef.current && imagesReadyRef.current && !reducedMotionRef.current;
    const gain = !allowed ? 0 : phase === "INTRO" ? 1
      : phase === "LOGIN_READY" && !formLockedRef.current ? 0.5
        : phase === "FINAL" && !inputFocusedRef.current ? 0.5 : 0;
    motionGainRef.current = gain;
    motionRef.current?.setGain(gain, settleMs);
  }, []);

  const changePhase = useCallback((next: Phase) => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    if (next === "INTRO" || next === "FINAL") formLockedRef.current = false;
    updateMotion();
    setPhase(next);
  }, [updateMotion]);

  useEffect(() => {
    // 媒体查询也可能在页面打开后改变，因此同时读取初始值和监听 change。
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reducedMotionRef.current = media.matches;
      updateMotion(0);
      setReducedMotion(media.matches);
    };
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, [updateMotion]);

  useEffect(() => {
    const layer = motionLayerRef.current;
    const stage = stageRef.current;
    if (!layer || !stage) return;
    const motion = createFigureMotion((pose, running) => {
      // 只写外层 .figure-motion；内层帧仍使用自身 scale / x / y 校准和透明度。
      layer.style.setProperty("--figure-x", `${pose.x}px`);
      layer.style.setProperty("--figure-y", `${pose.y}px`);
      layer.style.setProperty("--figure-rx", `${pose.rx}deg`);
      layer.style.setProperty("--figure-ry", `${pose.ry}deg`);
      layer.style.willChange = running ? "transform" : "auto";
    });
    motionRef.current = motion;
    const media = window.matchMedia("(min-width: 701px) and (hover: hover) and (pointer: fine)");
    const update = () => {
      mouseEnabledRef.current = media.matches;
      updateMotion(0);
    };
    update();

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (motionGainRef.current === 0) return;
      const rect = stage.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      // 舞台左上角为 (-1, -1)，中心为 (0, 0)，右下角为 (1, 1)。
      motion.move((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
    };
    // 离开时缓慢归稳；窗口失焦或标签页隐藏时立即清零，避免恢复页面后残留偏移。
    const leave = () => { if (motionGainRef.current > 0) motion.reset(600); };
    const blur = () => { pageActiveRef.current = false; updateMotion(0); };
    const focus = () => { pageActiveRef.current = !document.hidden; updateMotion(0); };
    const visibility = () => { pageActiveRef.current = !document.hidden && document.hasFocus(); updateMotion(0); };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    stage.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", update);
    return () => {
      // 卸载或 effect 重建时成对清理监听和 rAF；否则可能出现重复响应。
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      stage.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", update);
      motion.dispose();
      motionRef.current = null;
    };
  }, [updateMotion]);

  useEffect(() => {
    // 键盘入口进入后才自动聚焦；普通滚动不会强行移动用户焦点。
    // input.focus() 会触发下方 focusInput，自动聚焦也遵守 180ms 回中和填写锁定。
    if (phase === "LOGIN_READY" && focusLoginRef.current) {
      focusLoginRef.current = false;
      overlayRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    }
  }, [phase]);

  const renderProgress = useCallback((animationProgress: number) => {
    // 两个显示系统共用同一个进度：人物透明度由 frameWeights 算，表单由 loginReveal 算。
    // 直接写 style 避免为每个 rAF 触发整个组件树渲染。
    const overlay = overlayRef.current;
    if (!overlay) return;

    const frames = frameNodesRef.current;
    const reduced = reducedMotionRef.current;
    const weights = frameWeights(animationProgress, PRE_LOGIN_FRAMES.length, reduced);

    frames.forEach((frame, index) => {
      const weight = weights[index] ?? 0;
      frame.style.opacity = String(weight);
    });

    // 此属性供调试和浏览器验收读取；不是通过读滚动条得到的进度。
    stageRef.current?.setAttribute("data-animation-progress", String(animationProgress));
    const reveal = reduced ? animationProgress : loginReveal(animationProgress);
    overlay.style.setProperty("--login-opacity", String(reveal));
    overlay.style.setProperty("--login-y", `${(1 - reveal) * (reduced ? 0 : 16)}px`);
  }, []);

  const requestDirection = useCallback((target: TargetProgress) => {
    // 所有滚轮、触控与键盘意图统一到这里，最终态直接拒绝方向变化。
    if (phaseRef.current === "FINAL_TRANSITION" || phaseRef.current === "FINAL") return;
    // 先记住最新目标：解码尚未完成时先不播放，就绪后执行最近一次意图。
    targetProgressRef.current = target;
    if (target === 0) focusLoginRef.current = false;
    if (!imagesReadyRef.current || !timelineRef.current) return;
    if ((target === 0 && phaseRef.current === "INTRO") || (target === 1 && phaseRef.current === "LOGIN_READY")) return;
    changePhase(target === 1 ? "FORWARD_ANIMATING" : "REVERSE_ANIMATING");
    timelineRef.current.playTo(target, reducedMotionRef.current);
  }, [changePhase]);

  useEffect(() => {
    // 一次拿到已挂载的帧 DOM；最终帧不带此属性，因而不会被 rAF 覆盖透明度。
    frameNodesRef.current = Array.from(stageRef.current?.querySelectorAll<HTMLElement>("[data-intro-frame]") ?? []);
    const timeline = createProgressTimeline(renderProgress, (target) => {
      changePhase(target === 1 ? "LOGIN_READY" : "INTRO");
    });
    timelineRef.current = timeline;
    renderProgress(0);
    // 解码实际显示的 Next.js 图片（包括缓存命中），全部完成后才允许播放。
    const images = Array.from(stageRef.current?.querySelectorAll<HTMLImageElement>(".body-frame img") ?? []);
    let active = true;
    imagesReadyRef.current = false;
    Promise.all(images.map((image) => image.decode())).then(() => {
      // Promise 不能直接取消；active 防止组件卸载后再写状态或启动动画。
      if (!active) return;
      imagesReadyRef.current = true;
      updateMotion();
      setImagesReady(true);
      if (targetProgressRef.current === 1) requestDirection(1);
    }).catch(() => {
      if (active) setImageError(true);
    });
    return () => {
      active = false;
      timeline.cancel();
      timelineRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [changePhase, renderProgress, requestDirection, updateMotion]);

  // 停在背面时仍监听倒放；只有进入最终过渡后才关闭方向输入。
  useDirectionTrigger(requestDirection, phase !== "FINAL_TRANSITION" && phase !== "FINAL");

  function enter() {
    // 防止重复提交。先确保外层归零，再切阶段；CSS 接管 12 → 13 的透明度和缩放。
    if (phaseRef.current !== "LOGIN_READY" || !imagesReadyRef.current) return;
    timelineRef.current?.cancel();
    motionRef.current?.reset();
    changePhase("FINAL_TRANSITION");
    // 该计时只标记最终阶段完成，不负责逐帧渲染；时长要与下面 --final-duration 一致。
    timeoutRef.current = setTimeout(() => changePhase("FINAL"), reducedMotion ? 240 : FINAL_DURATION_MS);
  }

  function revealLogin() {
    // 由仅在键盘聚焦时显示的入口调用，完成正放后再把焦点移到 Email。
    focusLoginRef.current = true;
    requestDirection(1);
  }

  function focusInput() {
    inputFocusedRef.current = true;
    if (phaseRef.current === "LOGIN_READY") formLockedRef.current = true;
    updateMotion(180);
  }

  function blurInput() {
    // 只更新“当前有无焦点”；不清空 formLockedRef，因此 LOGIN_READY 中继续固定居中。
    inputFocusedRef.current = false;
    updateMotion();
  }

  // 表单在最终阶段仍可聚焦 / 编辑，但 canSubmit 只在 LOGIN_READY 为真。
  const accessible = phase === "LOGIN_READY" || phase === "FINAL_TRANSITION" || phase === "FINAL";

  return (
    <main className="home-page" data-phase={phase} data-reduced-motion={reducedMotion} data-images-ready={imagesReady}
      style={{ "--final-duration": `${reducedMotion ? 240 : FINAL_DURATION_MS}ms` } as CSSProperties}>
      <HomeHeader />
      <section className="home-scroll" aria-label="Formward 登录入口">
        <div className="home-stage" ref={stageRef}>
          {/* 只有人物套在运动层里；表单、提示和状态信息是它的兄弟节点。 */}
          <div className="figure-motion" ref={motionLayerRef}><BodySequence /></div>
          <LoginOverlay overlayRef={overlayRef} accessible={accessible} canSubmit={phase === "LOGIN_READY"} onEnter={enter} onInputFocus={focusInput} onInputBlur={blurInput} />
          {/* SCROLL 由 CSS 的 INTRO + images-ready 条件控制；每次返回首屏都会显示。 */}
          <div className="scroll-hint" aria-hidden="true"><span className="scroll-hint-mouse"><span className="scroll-hint-wheel" /></span><span>SCROLL</span></div>
          {/* 加载提示独立于 SCROLL；role=status 让辅助技术知道加载 / 失败结果。 */}
          {!imagesReady && <div className="image-status" role="status">{imageError ? "图片加载失败，请刷新重试" : "正在加载"}</div>}
          <button className="keyboard-entry" type="button" onClick={revealLogin} inert={phase !== "INTRO"} aria-hidden={phase !== "INTRO"}>进入登录</button>
        </div>
      </section>
    </main>
  );
}
