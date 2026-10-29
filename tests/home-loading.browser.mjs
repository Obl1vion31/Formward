import assert from "node:assert/strict";

const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const engine = process.env.FORMWARD_HOME_BROWSER ?? "chromium";
const browser = await playwright[engine].launch({ headless: true });
const baseURL = process.env.FORMWARD_BASE_URL ?? "http://127.0.0.1:3000";
const errors = [];
const results = [];

try {
  for (const scenario of ["current-frame", "play-required", "gesture-required", "blocked-video", "failed-video", "no-webgl", "desktop-failed-video", "mobile-static", "mobile-reduced", "mobile-landscape", "mobile-failed-image", "desktop-failed-image", "mobile-failed-final-image", "desktop-failed-final-image"]) {
    const desktop = !scenario.startsWith("mobile-");
    const context = await browser.newContext({ viewport: { width: scenario === "mobile-landscape" ? 844 : desktop ? 1440 : 390, height: scenario === "mobile-landscape" ? 390 : desktop ? 900 : 844 }, isMobile: !desktop, hasTouch: !desktop, reducedMotion: scenario === "mobile-reduced" ? "reduce" : "no-preference" });
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
    if (scenario.includes("failed-image") || scenario.includes("failed-final-image")) await context.addInitScript(({ finalOnly }) => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function() { return !finalOnly || this.closest(".body-frame-final") ? Promise.reject(new DOMException("虚构图片解码失败", "EncodingError")) : decode.call(this); };
    }, { finalOnly: scenario.includes("final-image") });
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
    if (scenario.includes("failed-image") || scenario.includes("failed-final-image")) {
      await page.waitForSelector("main[data-image-fallback=true][data-phase=LOGIN_READY]");
      assert.equal(await page.getByRole("heading", { name: "登录 Formward" }).isVisible(), true);
      assert.equal(await page.locator("#email").isEnabled(), true);
      await page.locator("#email").fill("fictional@example.test"); await page.locator("#password").fill("fictional-password");
      for (let retry = 0; retry < 2; retry++) { await page.locator("button[type=submit]").click(); await page.locator("#login-error").waitFor(); }
      assert.equal(loginRequests, 2); assert.equal(await page.locator("#email").inputValue(), "fictional@example.test");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/formward-${scenario}.png` }); results.push({ engine, scenario, loginRequests });
      await context.close(); continue;
    }
    if (!desktop) {
      assert.equal(await page.locator("video").count(), 0, "手机不挂载或请求视频");
      assert.equal(await page.locator("main").getAttribute("data-turn-mode"), "static");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      await page.locator(".home-stage").tap({ position: { x: 12, y: 110 } });
      await page.waitForSelector('main[data-phase="LOGIN_READY"]');
      await page.locator("#email").fill("fictional@example.test");
      await page.locator("#password").fill("fictional-password");
      await page.locator(".home-stage").tap({ position: { x: 12, y: 110 } });
      assert.equal(await page.locator("main").getAttribute("data-phase"), "LOGIN_READY", "登录后背景点击不会返回");
      await page.getByRole("button", { name: "返回初始画面", exact: true }).click();
      await page.waitForSelector('main[data-phase="INTRO"]');
      await page.locator(".home-stage").tap({ position: { x: 12, y: 110 } });
      await page.waitForSelector('main[data-phase="LOGIN_READY"]');
      assert.equal(await page.locator("#email").inputValue(), "fictional@example.test");
      assert.equal(await page.locator("#password").inputValue(), "fictional-password");
      assert.equal(await page.locator(".home-stage").evaluate(node => getComputedStyle(node).backgroundImage), "none");
      assert.equal(await page.locator(".body-frame-intro").first().evaluate(node => getComputedStyle(node).mixBlendMode), "normal");
      await page.locator('button[type="submit"]').click();
      await page.locator("#login-error").waitFor();
      assert.equal(loginRequests, 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/formward-${scenario}.png` });
      results.push({ engine, scenario, turnMode: "static", loginRequests });
      await context.close(); continue;
    }
    const videoScenario = ["current-frame", "play-required", "gesture-required"].includes(scenario);
    if (!videoScenario || scenario === "gesture-required") assert.equal(await page.locator("main").getAttribute("data-turn-mode"), "static", scenario);
    else if (engine === "chromium") assert.equal(await page.locator("main").getAttribute("data-turn-mode"), "video", "当前帧即可使用视频，不等待 canplaythrough");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    if (scenario === "gesture-required") {
      assert.equal(await page.locator("main").getAttribute("data-image-fallback"), "false", "视频等待手势不能被误判为静态图片失败");
      await page.locator(".home-stage").click({ position: { x: 10, y: 100 } });
      await page.waitForSelector('main[data-turn-mode="video"]', { timeout: 8000 });
      assert.equal(await page.locator("main").getAttribute("data-phase"), "INTRO", "手势恢复不改变当前端点");
    }
    await page.evaluate(() => {
      window.turnFrames = [];
      const layer = document.querySelector("[data-turn-video]");
      new MutationObserver(() => window.turnFrames.push(Number(layer.dataset.videoFrame))).observe(layer, { attributes: true, attributeFilter: ["data-video-frame"] });
    });
    await page.mouse.wheel(0, 80);
    await page.waitForSelector('main[data-phase="LOGIN_READY"]');
    if (videoScenario && engine === "chromium") {
      assert.equal(await page.evaluate(() => window.turnFrames.some(frame => frame > 0 && frame < 59)), true, "转身展示真实视频中间帧");
      assert.equal(await page.locator("video").evaluate(video => video.paused), true, "唤醒后暂停，避免自行播放与寻帧冲突");
    }
    if (desktop && await page.locator("main").getAttribute("data-turn-mode") === "static") {
      const orbit = await page.locator(".home-orbit-scene-end").evaluate(node => ({ opacity: getComputedStyle(node).opacity, visibility: getComputedStyle(node).visibility }));
      assert.equal(orbit.visibility, "visible");
      assert.equal(orbit.opacity, "1");
    }
    await page.locator("#email").fill("fictional@example.test");
    await page.locator("#password").fill("fictional-password");
    await page.locator('button[type="submit"]').click();
    await page.locator("#login-error").waitFor();
    assert.equal(loginRequests, 1);
    assert.equal(await page.locator("main").getAttribute("data-phase"), "LOGIN_READY");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    results.push({ engine, scenario, turnMode: await page.locator("main").getAttribute("data-turn-mode"), loginRequests });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: "桌面视频降级与手机点击静态登录回归", results }, null, 2));
} finally {
  await browser.close();
}
