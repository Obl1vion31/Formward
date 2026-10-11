import assert from "node:assert/strict";

const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const engine = process.env.FORMWARD_HOME_BROWSER ?? "chromium";
const browser = await playwright[engine].launch({ headless: true });
const baseURL = process.env.FORMWARD_BASE_URL ?? "http://127.0.0.1:3000";
const errors = [];
const results = [];

try {
  for (const scenario of ["current-frame", "play-required", "gesture-required", "blocked-video", "failed-video", "no-webgl", "desktop-failed-video"]) {
    const desktop = scenario === "desktop-failed-video";
    const context = await browser.newContext({ viewport: { width: desktop ? 1440 : 390, height: desktop ? 900 : 844 }, isMobile: !desktop, hasTouch: true });
    if (scenario === "current-frame") {
      await context.addInitScript(() => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState");
        Object.defineProperty(HTMLMediaElement.prototype, "readyState", { get() { return Math.min(2, descriptor.get.call(this)); } });
        const add = HTMLMediaElement.prototype.addEventListener;
        HTMLMediaElement.prototype.addEventListener = function(type, listener, options) {
          if (type !== "canplaythrough") return add.call(this, type, listener, options);
        };
      });
    }
    if (scenario === "play-required" || scenario === "gesture-required") {
      await context.addInitScript(({ gestureRequired }) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState");
        const play = HTMLMediaElement.prototype.play;
        let activated = false;
        let hasGesture = false;
        for (const event of ["touchend", "click", "keydown"]) document.addEventListener(event, value => {
          if (value.isTrusted) hasGesture = true;
        }, true);
        // 模拟手机只允许 metadata 预加载，解码需 play；保留原生视频下载与寻帧。
        Object.defineProperty(HTMLMediaElement.prototype, "readyState", { get() {
          return Math.min(activated ? 2 : 1, descriptor.get.call(this));
        } });
        HTMLMediaElement.prototype.play = function() {
          if (gestureRequired && !hasGesture) return Promise.reject(new DOMException("需要触摸", "NotAllowedError"));
          if (!this.muted || !this.playsInline || this.getBoundingClientRect().width === 0) return Promise.reject(new DOMException("需静音内联并有布局尺寸", "NotAllowedError"));
          activated = true;
          return play.call(this);
        };
      }, { gestureRequired: scenario === "gesture-required" });
    }
    if (scenario === "blocked-video") await context.route("**/videos/golden-turn-1s.mp4?*", () => {});
    if (scenario.endsWith("failed-video")) await context.route("**/videos/golden-turn-1s.mp4?*", route => route.abort());
    if (scenario === "no-webgl") {
      await context.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          return type === "webgl" ? null : getContext.call(this, type, ...args);
        };
      });
    }
    let loginRequests = 0;
    // 只验证登录表单可提交及失败可重试，不向真实库发送测试密码。
    await context.route("**/api/auth/sign-in/email", async route => {
      loginRequests++;
      await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('main[data-images-ready="true"]', { timeout: 15000 });
    const videoScenario = ["current-frame", "play-required", "gesture-required"].includes(scenario);
    if (!videoScenario || scenario === "gesture-required") assert.equal(await page.locator("main").getAttribute("data-turn-mode"), "static", scenario);
    else if (engine === "chromium") assert.equal(await page.locator("main").getAttribute("data-turn-mode"), "video", "当前帧即可使用视频，不等待 canplaythrough");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    if (scenario === "gesture-required") {
      await page.locator(".home-stage").tap({ position: { x: 10, y: 100 } });
      await page.waitForSelector('main[data-turn-mode="video"]', { timeout: 8000 });
      assert.equal(await page.locator("main").getAttribute("data-phase"), "INTRO", "手势恢复不改变当前端点");
    }
    await page.evaluate(() => {
      window.turnFrames = [];
      const layer = document.querySelector("[data-turn-video]");
      new MutationObserver(() => window.turnFrames.push(Number(layer.dataset.videoFrame))).observe(layer, { attributes: true, attributeFilter: ["data-video-frame"] });
    });
    await page.evaluate(() => {
      const target = document.querySelector(".home-stage");
      const touch = y => new Touch({ identifier: 1, target, clientX: 190, clientY: y });
      target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(600)] }));
      target.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, touches: [touch(450)] }));
      target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [] }));
    });
    await page.waitForSelector('main[data-phase="LOGIN_READY"]');
    if (videoScenario && engine === "chromium") {
      assert.equal(await page.evaluate(() => window.turnFrames.some(frame => frame > 0 && frame < 59)), true, "转身展示真实视频中间帧");
      assert.equal(await page.locator("video").evaluate(video => video.paused), true, "唤醒后暂停，避免自行播放与寻帧冲突");
    }
    if (desktop) {
      const orbit = await page.locator(".home-orbit-scene-end").evaluate(node => ({ opacity: getComputedStyle(node).opacity, visibility: getComputedStyle(node).visibility }));
      assert.equal(orbit.visibility, "visible");
      assert.equal(orbit.opacity, "1");
    }
    await page.locator("#email").fill("fictional@example.test");
    await page.locator("#password").fill("fictional-password");
    await page.locator('button[type="submit"]').tap();
    await page.locator("#login-error").waitFor();
    assert.equal(loginRequests, 1);
    assert.equal(await page.locator("main").getAttribute("data-phase"), "LOGIN_READY");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    results.push({ engine, scenario, turnMode: await page.locator("main").getAttribute("data-turn-mode"), loginRequests });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: "手机视频加载、超时与静态登录回归", results }, null, 2));
} finally {
  await browser.close();
}
