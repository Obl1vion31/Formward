import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// 同一实现只在测试中注入三档时长，页面没有速度开关。
const timelineSource = await readFile(new URL("../src/app/home-timeline.ts", import.meta.url), "utf8");
const timelineModule = "data:text/javascript;base64," + Buffer.from(ts.transpile(timelineSource, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })).toString("base64");
const calibrationDoc = await readFile(new URL("../docs/frame-calibration.md", import.meta.url), "utf8");
const landmarks = JSON.parse(calibrationDoc.match(/```json\n([\s\S]*?)\n```/)[1]);

// 使用临时 Playwright 即可运行，不为首页增加运行时依赖。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
// 测试连接已经启动的服务，不负责启动 Next.js；环境变量允许选择端口和临时截图目录。
const baseUrl = process.env.FORMWARD_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const errors = [];
const results = [];

// 每个 context 有独立的页面状态；先等真实图片就绪，再做交互或像素检查。
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.home-page[data-images-ready="true"]');
  return { context, page };
}

async function phase(page, expected) {
  await page.waitForSelector('.home-page[data-phase="' + expected + '"]', { timeout: 4000 });
}

async function snapshot(page) {
  return page.evaluate(() => ({
    phase: document.querySelector("main").dataset.phase,
    progress: Number(document.querySelector(".home-stage").dataset.animationProgress),
    frames: [...document.querySelectorAll("[data-intro-frame]")].map((node) => Number(getComputedStyle(node).opacity)),
    final: Number(getComputedStyle(document.querySelector(".body-frame-final")).opacity),
    login: Number(getComputedStyle(document.querySelector(".login-overlay")).opacity),
  }));
}

async function figurePose(page) {
  return page.locator(".figure-motion").evaluate((node) => ({
    ...Object.fromEntries(["x", "y", "rx", "ry"].map((key) => [key, parseFloat(node.style.getPropertyValue("--figure-" + key)) || 0])),
    running: node.style.willChange === "transform",
  }));
}

async function assertCentred(page) {
  assert.deepEqual(await figurePose(page), { x: 0, y: 0, rx: 0, ry: 0, running: false });
}

async function moveAndRead(page, x, y) {
  await page.mouse.move(x, y, { steps: 10 });
  await page.waitForTimeout(60);
  return figurePose(page);
}

// 先验证真实鼠标与焦点行为，后面的纯时间线 / 像素检查无法代替这些交互约束。
async function verifyFigureInteraction() {
  const { page, context } = await newPage();
  try {
    await page.waitForTimeout(140);
    assert.equal(await page.locator(".scroll-hint").evaluate((node) => getComputedStyle(node).visibility), "visible");
    assert.equal(await page.locator(".scroll-hint-wheel").evaluate((node) => getComputedStyle(node).animationPlayState), "running");
    const logo = await page.locator(".home-logo").boundingBox();
    const overlay = await page.locator(".login-overlay").boundingBox();
    const intro = await moveAndRead(page, 1400, 100);
    assert.ok(intro.x < -0.5 && intro.x >= -6 && intro.y > 0 && intro.y <= 4);
    assert.ok(intro.ry > 0 && intro.ry <= 0.6 && intro.rx > 0 && intro.rx <= 0.3);
    assert.deepEqual(await page.locator(".home-logo").boundingBox(), logo);
    assert.deepEqual(await page.locator(".login-overlay").boundingBox(), overlay);
    assert.equal((await snapshot(page)).progress, 0, "鼠标不改变帧进度");
    await page.waitForTimeout(120);
    assert.equal(await page.locator(".scroll-hint").evaluate((node) => getComputedStyle(node).visibility), "visible", "鼠标移动后首屏提示持续显示");
    await page.waitForTimeout(680);
    await assertCentred(page);
    results.push({ test: "鼠标：首屏常驻提示、反向视差、静止回中与固定 UI", sampledIntroPose: intro });

    await page.reload();
    await page.waitForSelector('main[data-images-ready="true"]');
    assert.equal(await page.locator(".scroll-hint").evaluate((node) => getComputedStyle(node).visibility), "visible");
    await page.mouse.wheel(0, 1);
    await page.waitForTimeout(140);
    assert.equal(await page.locator(".scroll-hint").evaluate((node) => getComputedStyle(node).visibility), "visible", "未触发播放的小滚轮保持提示");
    assert.equal((await snapshot(page)).phase, "INTRO");
    await moveAndRead(page, 1300, 100);
    await page.mouse.wheel(0, 80);
    await phase(page, "FORWARD_ANIMATING");
    await page.mouse.move(30, 30, { steps: 3 });
    await page.waitForTimeout(120);
    await assertCentred(page);
    await page.locator(".scroll-hint").waitFor({ state: "hidden" });
    await phase(page, "LOGIN_READY");
    await assertCentred(page);
    const ready = await moveAndRead(page, 1400, 100);
    assert.ok(ready.x < -0.5 && ready.x >= -3 && ready.y <= 2 && ready.ry <= 0.3 && ready.rx <= 0.15);
    await page.locator("#email").focus();
    await page.waitForTimeout(90);
    assert.ok(Math.abs((await figurePose(page)).x) < Math.abs(ready.x), "聚焦后逐渐回中");
    await page.waitForTimeout(130);
    await assertCentred(page);
    await page.locator("#email").fill("preview@example.test");
    await page.locator("#password").fill("fictional-preview-password");
    await page.locator("#password").blur();
    await moveAndRead(page, 1200, 80);
    await assertCentred(page);
    await page.mouse.click(80, 400);
    await moveAndRead(page, 1000, 160);
    await assertCentred(page);
    results.push({ test: "表单：首次聚焦回中、切换字段与失焦后保持锁定", sampledReadyPose: ready });

    await page.keyboard.press("PageUp");
    await phase(page, "INTRO");
    assert.equal(await page.locator(".scroll-hint").evaluate((node) => getComputedStyle(node).visibility), "visible", "完整倒放回到首屏重新显示提示");
    assert.equal(await page.locator(".scroll-hint-wheel").evaluate((node) => getComputedStyle(node).animationPlayState), "running");
    assert.ok((await moveAndRead(page, 1400, 80)).x < -0.5, "完整倒放解除填写锁定");
    await page.mouse.wheel(0, 80);
    await phase(page, "LOGIN_READY");
    assert.ok((await moveAndRead(page, 1200, 100)).x < -0.5);
    await page.locator("#email").focus();
    await page.keyboard.press("Enter"); // 已保留的虚构输入允许在回中完成前提交。
    await phase(page, "FINAL_TRANSITION");
    await assertCentred(page);
    await page.mouse.move(40, 40, { steps: 3 });
    await phase(page, "FINAL");
    await moveAndRead(page, 1300, 100);
    await assertCentred(page); // 输入框仍有焦点时，最终状态也保持居中。
    await page.locator("#email").blur();
    await assertCentred(page);
    assert.ok((await moveAndRead(page, 1400, 80)).x < -0.5, "FINAL 接收新鼠标输入恢复半幅联动");
    await page.locator("#password").focus();
    await page.waitForTimeout(210);
    await assertCentred(page);
    await page.locator("#password").blur();
    results.push({ test: "提交：快速 Enter 从中心开始、倒放解除锁定、FINAL 按焦点恢复" });

    assert.ok((await moveAndRead(page, 1300, 120)).x < -0.5);
    await page.mouse.move(-10, -10);
    await page.waitForTimeout(650);
    await assertCentred(page);

    await moveAndRead(page, 1300, 120);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await assertCentred(page);
    await moveAndRead(page, 1200, 100);
    await assertCentred(page);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await assertCentred(page);
    assert.ok((await moveAndRead(page, 1400, 80)).x < -0.5);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await assertCentred(page);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.setViewportSize({ width: 640, height: 800 });
    await moveAndRead(page, 600, 100);
    await assertCentred(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await moveAndRead(page, 1400, 80);
    await assertCentred(page);
    assert.equal(await page.locator(".scroll-hint-wheel").evaluate((node) => getComputedStyle(node).animationName), "none");
    results.push({ test: "联动能力：鼠标离开回稳，失焦、页面隐藏、窄屏与 reduced motion 立即归零" });
  } finally { await context.close(); }
}

// rAF 采样记录每张帧的透明度；MutationObserver 捕获游标实际到端点的时刻。
// 不能直接把“下一张截图完成时间”当作动画结束时间，否则会把测试工具延迟算进去。
async function startRecording(page) {
  await page.evaluate(() => {
    window.animationSamples = [];
    window.animationRecording = true;
    window.animationInputAt = null;
    window.animationEndpointAt = null;
    window.animationObserver?.disconnect();
    const stage = document.querySelector(".home-stage");
    const target = Number(stage.dataset.animationProgress) === 1 ? 0 : 1;
    window.animationObserver = new MutationObserver(() => {
      if (window.animationInputAt !== null && Number(stage.dataset.animationProgress) === target) window.animationEndpointAt ??= performance.now();
    });
    window.animationObserver.observe(stage, { attributes: true, attributeFilter: ["data-animation-progress"] });
    const mark = () => { window.animationInputAt ??= performance.now(); };
    window.addEventListener("wheel", mark, { once: true });
    const sample = () => {
      if (!window.animationRecording) return;
      window.animationSamples.push({
        time: performance.now(),
        phase: document.querySelector("main").dataset.phase,
        progress: Number(document.querySelector(".home-stage").dataset.animationProgress),
        weights: [...document.querySelectorAll("[data-intro-frame]")].map((node) => Number(getComputedStyle(node).opacity)),
        final: Number(getComputedStyle(document.querySelector(".body-frame-final")).opacity),
        login: Number(getComputedStyle(document.querySelector(".login-overlay")).opacity),
      });
      requestAnimationFrame(sample);
    };
    sample();
  });
}

async function finishRecording(page) {
  return page.evaluate(() => {
    window.animationRecording = false;
    window.animationObserver.disconnect();
    return { samples: window.animationSamples, inputAt: window.animationInputAt, endpointAt: window.animationEndpointAt };
  });
}

// 检查帧序、相邻交叠和权重，而不是仅判断最终有没有显示背面。
function verifySequence(recording, reverse = false) {
  const seen = [];
  for (const sample of recording.samples) {
    assert.equal(sample.final, 0, "滚动永远不显示 Frame 13");
    const active = sample.weights.flatMap((value, index) => value > 0.001 ? [index] : []);
    assert.ok(active.length <= 2);
    if (active.length === 2) assert.equal(active[1] - active[0], 1);
    const dominant = sample.weights.indexOf(Math.max(...sample.weights));
    if (seen.at(-1) !== dominant) seen.push(dominant);
  }
  assert.deepEqual(seen, Array.from({ length: 12 }, (_, index) => reverse ? 11 - index : index));
  const ready = recording.samples.find((sample) => sample.phase === (reverse ? "INTRO" : "LOGIN_READY") && sample.time >= recording.inputAt);
  assert.ok(ready, "采样应包含最终状态");
  assert.ok(recording.endpointAt !== null, "应直接记录游标到达端点的时刻");
  const duration = recording.endpointAt - recording.inputAt;
  assert.ok(duration >= 425 && duration <= 480, "完整时间线应在 425ms 加浏览器采样间隔内结束，实际 " + duration);
  return Math.round(duration);
}

// 在浏览器中注入同一份时间线编译产物的时长参数；页面没有额外的速度开关。
async function verifySpeedProfiles(page) {
  const trials = await page.evaluate(async (moduleUrl) => {
    const { createProgressTimeline, frameWeights, loginReveal } = await import(moduleUrl);
    const frames = [...document.querySelectorAll("[data-intro-frame]")];
    const login = document.querySelector(".login-overlay");
    const trials = [];
    for (const duration of [400, 425, 450]) {
      const samples = [];
      const startedAt = performance.now();
      await new Promise((complete) => {
        const timeline = createProgressTimeline((progress) => {
          const weights = frameWeights(progress, frames.length);
          frames.forEach((frame, index) => { frame.style.opacity = String(weights[index]); });
          login.style.setProperty("--login-opacity", String(loginReveal(progress)));
          login.style.setProperty("--login-y", (1 - loginReveal(progress)) * 16 + "px");
          samples.push({ time: performance.now(), progress, weights });
        }, complete, duration);
        timeline.playTo(1);
      });
      const seen = [0];
      for (const sample of samples) {
        const dominant = sample.weights.indexOf(Math.max(...sample.weights));
        if (seen.at(-1) !== dominant) seen.push(dominant);
      }
      trials.push({ duration, measuredMs: samples.at(-1).time - startedAt, seen, intervals: samples.slice(1).map((sample, index) => sample.time - samples[index].time) });
    }
    frames.forEach((frame, index) => { frame.style.opacity = String(index === 0 ? 1 : 0); });
    login.style.removeProperty("--login-opacity");
    login.style.removeProperty("--login-y");
    return trials;
  }, timelineModule);
  for (const trial of trials) {
    assert.deepEqual(trial.seen, Array.from({ length: 12 }, (_, index) => index));
    assert.ok(trial.measuredMs >= trial.duration && trial.measuredMs < trial.duration + 55);
  }
  results.push({ test: "三档时长：真实浏览器顺序与播放时间", trials: trials.map(({ duration, measuredMs, intervals }) => ({ durationMs: duration, measuredMs: Math.round(measuredMs), medianRafMs: Number([...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)].toFixed(2)) })) });
}

// 将文档中的原图标记换算为实际显示坐标；Alpha 边缘只用于检查裁切。
// 头顶、躯干与尾部标记决定校准残差，不能用整个透明画布中心代替人体中心。
async function verifyFrameAlignment(name, width, height) {
  const { page, context } = await newPage({ viewport: { width, height } });
  try {
    const geometry = await page.evaluate((markers) => {
      const poses = [...document.querySelectorAll("[data-intro-frame] img")].map((image, index) => {
        const row = markers[index];
        const rect = image.getBoundingClientRect();
        const [width, height] = row.size;
        const centre = [(row.neck[0] + row.waist[0]) / 2, (row.neck[1] + row.waist[1]) / 2];
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, right = 0, top = canvas.height, bottom = 0;
        for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] < 32) continue;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        return {
          frame: row.frame,
          head: rect.top + row.head / height * rect.height,
          centreY: rect.top + centre[1] / height * rect.height,
          centreX: rect.left + centre[0] / width * rect.width,
          torsoHeight: (row.waist[1] - row.neck[1]) / height * rect.height,
          tail: rect.top + row.tail / height * rect.height,
          bounds: { left: rect.left + left / canvas.width * rect.width, right: rect.left + right / canvas.width * rect.width, top: rect.top + top / canvas.height * rect.height, bottom: rect.top + bottom / canvas.height * rect.height },
        };
      });
      const hint = document.querySelector(".scroll-hint");
      const rect = hint.getBoundingClientRect();
      return { poses, baseHeight: document.querySelector("[data-intro-frame] img").offsetHeight, arrowCount: document.querySelectorAll(".scroll-cue, .scroll-cue-mark").length, hint: { display: getComputedStyle(hint).display, visibility: getComputedStyle(hint).visibility, x: rect.x, right: rect.right, top: rect.top, bottom: rect.bottom, text: hint.textContent } };
    }, landmarks);
    assert.equal(geometry.arrowCount, 0);
    if (width > 700) {
      assert.equal(geometry.hint.visibility, "visible");
      assert.equal(geometry.hint.text, "SCROLL");
      assert.ok(geometry.hint.x - geometry.poses[0].bounds.right >= 30, "提示与人物横向分离");
      assert.ok(geometry.hint.right <= width - 24 && geometry.hint.top > 0 && geometry.hint.bottom < height);
    } else assert.equal(geometry.hint.display, "none");
    const ref = geometry.poses[0];
    const residuals = geometry.poses.map((pose) => {
      const delta = [pose.head - ref.head, pose.centreY - ref.centreY, pose.torsoHeight - ref.torsoHeight, pose.tail - ref.tail];
      const factor = geometry.baseHeight / 806.4;
      assert.ok(Math.abs(delta[0]) <= 4 * factor);
      assert.ok(Math.abs(delta[1]) <= 4 * factor);
      assert.ok(Math.abs(delta[2]) <= 7 * factor);
      assert.ok(Math.abs(delta[3]) <= 12 * factor);
      assert.ok(Math.abs(pose.centreX - ref.centreX) <= 0.1);
      assert.ok(pose.bounds.top >= 16 && pose.bounds.bottom <= height - 16, name + " Frame " + pose.frame + " 纵向裁切");
      assert.ok(pose.bounds.left >= 0 && pose.bounds.right <= width, name + " Frame " + pose.frame + " 横向裁切");
      return Math.sqrt(delta.reduce((sum, value, i) => sum + [8, 8, 6, 1][i] * value * value, 0) / 23);
    });
    if (process.env.FORMWARD_BROWSER_ARTIFACTS) await page.screenshot({ path: process.env.FORMWARD_BROWSER_ARTIFACTS + "/" + name + "-intro-interaction.png" });
    results.push({ test: name + "：12 帧校准、无裁切与提示布局", maxWeightedRmsPx: Number(Math.max(...residuals).toFixed(2)) });
  } finally {
    await context.close();
  }
}

// 使用浏览器真实截图作为两端参考，独立检查合成后的像素，而非透明度之和。
async function verifyCrossfadePixels(page, variant, pairs, checkOriginal = false) {
  const figure = page.locator(".body-sequence");
  const stage = page.locator(".home-stage");
  await page.locator(".scroll-hint").evaluate((node) => { node.style.visibility = "hidden"; });
  await figure.evaluate((node) => {
    assertBrowser(getComputedStyle(node).isolation === "isolate", "人物层必须隔离背景");
    assertBrowser([...node.children].every((frame) => getComputedStyle(frame).mixBlendMode === "plus-lighter"), "所有人物帧必须使用同一种合成方式");
    function assertBrowser(condition, message) { if (!condition) throw new Error(message); }
    window.crossfadePixelImages = new Map();
  });

  async function weights(from, to, blend) {
    await figure.evaluate((node, { from, to, blend }) => {
      [...node.children].forEach((frame, index) => {
        frame.style.opacity = String(index === from ? 1 - blend : index === to ? blend : 0);
      });
      const active = [...node.children].filter((frame) => Number(getComputedStyle(frame).opacity) > 0.001);
      if (active.length > 2) throw new Error("人物不能同时显示三帧");
    }, { from, to, blend });
  }

  async function screenshot(artifact) {
    // 固定截舞台范围；人物外层有倾转时也能保持参考图与交叠图尺寸一致。
    const path = process.env.FORMWARD_BROWSER_ARTIFACTS && artifact
      ? process.env.FORMWARD_BROWSER_ARTIFACTS + "/" + variant + "-" + artifact + ".png" : undefined;
    return (await stage.screenshot({ scale: "css", ...(path ? { path } : {}) })).toString("base64");
  }

  async function saveReference(key, png) {
    await page.evaluate(async ({ key, png }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      window.crossfadePixelImages.set(key, context.getImageData(0, 0, canvas.width, canvas.height).data);
    }, { key, png });
  }

  async function compare(from, to, blend, png) {
    // 参考 = 起点截图 × (1−blend) + 终点截图 × blend；比较真正合成后的 RGB。
    // 这里的 blend 是直接设置的透明度权重，不是 smoothstep 之前的时间比例。
    await saveReference("actual", png);
    return page.evaluate(({ from, to, blend }) => {
      const cache = window.crossfadePixelImages;
      const start = cache.get(from), end = cache.get(to), background = cache.get("background"), actual = cache.get("actual");
      if (start.length !== actual.length || end.length !== actual.length) throw new Error("截图尺寸必须保持一致");
      let rgbError = 0, lumaBias = 0, pixels = 0;
      for (let offset = 0; offset < actual.length; offset += 4) {
        // 只统计人物及其可见边缘，避免背景稀释误差。
        if (![0, 1, 2].some((channel) => Math.max(Math.abs(start[offset + channel] - background[offset + channel]), Math.abs(end[offset + channel] - background[offset + channel])) > 8)) continue;
        pixels += 1;
        for (let channel = 0; channel < 3; channel += 1) {
          const expected = start[offset + channel] * (1 - blend) + end[offset + channel] * blend;
          const difference = actual[offset + channel] - expected;
          rgbError += Math.abs(difference);
          lumaBias += difference * [0.2126, 0.7152, 0.0722][channel];
        }
      }
      if (pixels < 1000) throw new Error("人物像素不足，不能有效验证亮度");
      return { meanRgbError: rgbError / (pixels * 3), meanLumaBias: lumaBias / pixels };
    }, { from, to, blend });
  }

  let worstMeanRgbError = 0, comparisons = 0, originalBlendError;
  try {
    await weights(-1, -1, 0);
    await saveReference("background", await screenshot());
    for (const index of new Set(pairs.flat())) {
      await weights(index, -1, 0);
      await saveReference(index, await screenshot());
    }
    for (const [from, to] of pairs) {
      for (const blend of [0.25, 0.5, 0.75]) {
        await weights(from, to, blend);
        const sample = await compare(from, to, blend, await screenshot(from === pairs[0][0] && blend === 0.5 ? "blend50" : undefined));
        assert.ok(sample.meanRgbError <= 2, variant + " Frame " + (from + 1) + " → " + (to + 1) + " 在 " + blend + " 的平均 RGB 误差超出 2/255：" + sample.meanRgbError);
        worstMeanRgbError = Math.max(worstMeanRgbError, sample.meanRgbError);
        comparisons += 1;
      }
    }
    if (checkOriginal) {
      await figure.evaluate((node) => [...node.children].forEach((frame) => { frame.style.mixBlendMode = "normal"; }));
      const [from, to] = pairs[0];
      await weights(from, to, 0.5);
      const sample = await compare(from, to, 0.5, await screenshot("normal50"));
      assert.ok(sample.meanRgbError > 5 && sample.meanLumaBias < -5, "像素检查必须能识别旧合成方式的变暗");
      originalBlendError = Number(sample.meanRgbError.toFixed(3));
    }
  } finally {
    await figure.evaluate((node) => [...node.children].forEach((frame) => frame.style.removeProperty("mix-blend-mode")));
    await weights(0, -1, 0);
    await page.evaluate(() => { delete window.crossfadePixelImages; });
    await page.locator(".scroll-hint").evaluate((node) => { node.style.removeProperty("visibility"); });
  }
  results.push({ test: variant + "：真实截图交叠像素检查", comparisons, worstMeanRgbError: Number(worstMeanRgbError.toFixed(3)), ...(originalBlendError === undefined ? {} : { originalBlendError }) });
}

try {
  await verifyFigureInteraction();
  for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844], ["compact", 320, 568], ["landscape", 844, 390]]) {
    await verifyFrameAlignment(name, width, height);
  }
  const { context, page } = await newPage();
  assert.equal(await page.locator(".body-frame img").count(), 13);
  assert.equal(await page.locator('link[rel="preload"][as="image"]').count(), 13);
  assert.ok(await page.locator(".body-frame img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)));
  assert.equal((await snapshot(page)).progress, 0);
  await verifySpeedProfiles(page);
  const adjacentPairs = Array.from({ length: 12 }, (_, index) => [index, index + 1]);
  await verifyCrossfadePixels(page, "desktop", adjacentPairs, true);
  await page.locator(".figure-motion").evaluate((node) => {
    node.style.setProperty("--figure-x", "-6px"); node.style.setProperty("--figure-y", "4px");
    node.style.setProperty("--figure-rx", "0.3deg"); node.style.setProperty("--figure-ry", "0.6deg");
  });
  await verifyCrossfadePixels(page, "desktop-parallax", [[0, 1], [4, 5], [10, 11]]);
  await page.locator(".figure-motion").evaluate((node) => ["x", "y", "rx", "ry"].forEach((key) => node.style.setProperty("--figure-" + key, key.length === 1 ? "0px" : "0deg")));

  await startRecording(page);
  await page.mouse.wheel(0, 80);
  await phase(page, "LOGIN_READY");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const forwardRecording = await finishRecording(page);
  const forward = verifySequence(forwardRecording);
  assert.ok(forwardRecording.samples.filter((sample) => sample.progress <= 0.6).every((sample) => sample.login === 0), "表单在转身前段保持隐藏");
  assert.equal((await snapshot(page)).login, 1);
  assert.equal(await page.locator('button[type="submit"]').isEnabled(), false);
  results.push({ test: "A：单次下滚完整正放", durationMs: forward });
  if (process.env.FORMWARD_BROWSER_ARTIFACTS) await page.screenshot({ path: process.env.FORMWARD_BROWSER_ARTIFACTS + "/login-ready.png" });

  await startRecording(page);
  await page.mouse.wheel(0, -80);
  await phase(page, "INTRO");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const reverse = verifySequence(await finishRecording(page), true);
  assert.equal((await snapshot(page)).login, 0);
  results.push({ test: "B：单次上滚完整倒放", durationMs: reverse });

  await startRecording(page);
  await page.mouse.wheel(0, 80);
  await page.waitForFunction(() => Number(document.querySelector(".home-stage").dataset.animationProgress) > 0.4);
  const middle = await snapshot(page);
  await page.mouse.wheel(0, -80);
  await phase(page, "REVERSE_ANIMATING");
  assert.ok((await snapshot(page)).progress > 0.2, "反向不能重置到起点");
  await phase(page, "INTRO");
  const reversedSamples = (await finishRecording(page)).samples;
  assert.ok(Math.max(...reversedSamples.map((sample) => sample.progress)) < 0.85);
  assert.ok(reversedSamples.every((sample) => sample.phase !== "LOGIN_READY" && sample.final === 0));
  assert.ok(middle.login < 0.5, "转身前半段优先展示人物");
  results.push({ test: "C：正放中途立即倒放" });

  await page.mouse.wheel(0, 80);
  await phase(page, "LOGIN_READY");
  await page.mouse.wheel(0, -80);
  await page.waitForFunction(() => Number(document.querySelector(".home-stage").dataset.animationProgress) < 0.6);
  const reverseMiddle = await snapshot(page);
  await page.mouse.wheel(0, 80);
  await phase(page, "FORWARD_ANIMATING");
  assert.ok((await snapshot(page)).progress >= reverseMiddle.progress - 0.15);
  await phase(page, "LOGIN_READY");
  results.push({ test: "倒放中途立即正放" });

  await page.mouse.wheel(0, 300);
  assert.equal((await snapshot(page)).final, 0);
  await page.locator("#email").fill("preview@example.test");
  assert.equal(await page.locator('button[type="submit"]').isEnabled(), false);
  await page.locator("#password").fill("fictional-preview-password");
  assert.equal(await page.locator('button[type="submit"]').isEnabled(), true);
  await startRecording(page);
  await page.locator('button[type="submit"]').click();
  await phase(page, "FINAL_TRANSITION");
  await page.mouse.wheel(0, -120);
  await phase(page, "FINAL");
  const finalSamples = (await finishRecording(page)).samples.filter((sample) => sample.phase === "FINAL_TRANSITION");
  assert.ok(finalSamples.length > 10);
  assert.ok(finalSamples.every((sample) => Math.abs(sample.weights[11] + sample.final - 1) < 0.025), "最终动画也必须保持互补权重");
  assert.equal((await snapshot(page)).final, 1);
  assert.equal((await snapshot(page)).frames[11], 0);
  results.push({ test: "D：Enter 单独触发 12 → 13" });
  if (process.env.FORMWARD_BROWSER_ARTIFACTS) await page.screenshot({ path: process.env.FORMWARD_BROWSER_ARTIFACTS + "/final.png" });
  await page.mouse.wheel(0, -300);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(250);
  assert.equal((await snapshot(page)).phase, "FINAL");
  assert.equal((await snapshot(page)).final, 1);
  results.push({ test: "E：FINAL 不被滚动回退" });
  await page.reload();
  await page.waitForSelector('.home-page[data-images-ready="true"]');
  assert.equal((await snapshot(page)).progress, 0);
  results.push({ test: "刷新重置为 Frame 1" });
  await page.keyboard.press("Tab");
  assert.ok(await page.locator(".keyboard-entry").evaluate((node) => document.activeElement === node && node.getBoundingClientRect().height >= 44));
  await page.keyboard.press("Enter");
  await phase(page, "LOGIN_READY");
  await page.waitForFunction(() => document.activeElement?.id === "email");
  await page.keyboard.press("ArrowUp");
  assert.equal((await snapshot(page)).phase, "LOGIN_READY", "输入框内的方向键不触发倒放");
  await page.locator("#email").blur();
  await page.keyboard.press("PageUp");
  await phase(page, "INTRO");
  results.push({ test: "键盘触发、焦点和输入保护" });
  await context.close();

  const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  assert.equal(await mobile.page.locator(".scroll-hint").evaluate((node) => getComputedStyle(node).display), "none");
  await verifyCrossfadePixels(mobile.page, "mobile", adjacentPairs);
  const session = await mobile.context.newCDPSession(mobile.page);
  async function swipe(fromY, toY) {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: fromY }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: toY }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await swipe(730, 640);
  await phase(mobile.page, "LOGIN_READY");
  await assertCentred(mobile.page);
  assert.equal((await snapshot(mobile.page)).frames[11], 1);
  if (process.env.FORMWARD_BROWSER_ARTIFACTS) await mobile.page.screenshot({ path: process.env.FORMWARD_BROWSER_ARTIFACTS + "/mobile-login-ready.png" });
  await swipe(650, 740);
  await phase(mobile.page, "INTRO");
  assert.equal((await snapshot(mobile.page)).login, 0);
  results.push({ test: "手机：原生单次上滑正放、下滑倒放" });
  if (process.env.FORMWARD_BROWSER_ARTIFACTS) await mobile.page.screenshot({ path: process.env.FORMWARD_BROWSER_ARTIFACTS + "/mobile-intro.png" });
  await mobile.context.close();

  const reduced = await newPage({ reducedMotion: "reduce" });
  await verifyCrossfadePixels(reduced.page, "reduced", [[0, 11], [11, 12]]);
  await reduced.page.mouse.wheel(0, 80);
  await phase(reduced.page, "LOGIN_READY");
  await reduced.page.mouse.wheel(0, -80);
  await phase(reduced.page, "INTRO");
  await reduced.page.mouse.wheel(0, 80);
  await phase(reduced.page, "LOGIN_READY");
  await reduced.page.locator("#email").fill("preview@example.test");
  await reduced.page.locator("#password").fill("fictional-preview-password");
  await reduced.page.locator('button[type="submit"]').click();
  await phase(reduced.page, "FINAL");
  assert.equal((await snapshot(reduced.page)).final, 1);
  results.push({ test: "reduced motion：双向交互和最终态" });
  await reduced.context.close();

  // 冷启动拦截全部图片请求：验证预加载、decode 门槛、排队手势和后续零新增请求。
  const coldContext = await browser.newContext();
  await coldContext.addInitScript(() => {
    window.figureDecodes = [];
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      return decode.call(this).then(() => { if (this.closest(".body-frame")) window.figureDecodes.push(this.currentSrc); });
    };
  });
  const pending = [];
  const imageRequests = [];
  coldContext.on("request", (request) => { if (request.url().includes("/_next/image?")) imageRequests.push(request.url()); });
  await coldContext.route("**/_next/image?**", (route) => { pending.push(route); });
  const coldPage = await coldContext.newPage();
  coldPage.on("pageerror", (error) => errors.push(error.message));
  await coldPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await coldPage.waitForFunction(() => document.querySelector(".home-stage")?.hasAttribute("data-animation-progress"));
  await coldPage.mouse.move(400, 200);
  assert.equal(await coldPage.locator(".scroll-hint").evaluate((node) => getComputedStyle(node).visibility), "hidden", "解码前暂不显示提示");
  await coldPage.mouse.wheel(0, 80);
  assert.equal((await snapshot(coldPage)).progress, 0);
  await coldPage.waitForFunction(() => document.querySelector('main[data-images-ready="false"]'));
  assert.equal(pending.length, 13, "首次手势前已请求全部 13 张图");
  await coldContext.unroute("**/_next/image?**");
  await phase(coldPage, "LOGIN_READY");
  assert.equal(await coldPage.evaluate(() => new Set(window.figureDecodes).size), 13, "全部实际人物图片完成 decode");
  const sources = await coldPage.locator(".body-frame img").evaluateAll((images) => images.map((image) => image.currentSrc));
  await coldPage.mouse.wheel(0, -80);
  await phase(coldPage, "INTRO");
  assert.equal(await coldPage.locator(".scroll-hint").evaluate((node) => getComputedStyle(node).visibility), "visible", "加载期间有操作，返回首屏仍显示提示");
  await coldPage.mouse.wheel(0, 80);
  await phase(coldPage, "LOGIN_READY");
  assert.equal(imageRequests.length, 13, "就绪后的动画不新增图片请求");
  assert.deepEqual(await coldPage.locator(".body-frame img").evaluateAll((images) => images.map((image) => image.currentSrc)), sources);
  results.push({ test: "冷启动：13 张实际图片解码、待执行手势、播放中无新增请求" });
  await coldContext.close();

  // 失败分支也独立验收：人物停在首帧，状态信息不会因鼠标或滚轮操作被隐藏。
  const failedContext = await browser.newContext();
  await failedContext.route("**/_next/image?**", (route) => route.abort());
  const failedPage = await failedContext.newPage();
  await failedPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await failedPage.getByRole("status").filter({ hasText: "图片加载失败" }).waitFor();
  await failedPage.mouse.move(400, 200);
  await failedPage.mouse.wheel(0, 80);
  assert.equal(await failedPage.getByRole("status").textContent(), "图片加载失败，请刷新重试");
  assert.equal((await snapshot(failedPage)).progress, 0);
  await assertCentred(failedPage);
  results.push({ test: "图片失败：状态信息持续显示，人物保持首帧" });
  await failedContext.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
