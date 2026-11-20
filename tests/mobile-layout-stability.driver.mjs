import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { assistantConversation, assistantMessage } from "../src/db/schema.ts";
import { authenticateAi, createAiToken } from "../src/features/auth/ai-tokens.ts";
import { mealPreviewOperation } from "../src/features/meals/ai-preview.ts";
import { submitRecordOperation } from "../src/features/records/operations.ts";
import { workspacePages } from "../src/components/workspace-pages.ts";

const requestLabel = "帮我核对这份晚餐和照片。";
const foodName = "虚构晚餐烤鸡";
const draft = "这段草稿会留到回来的时候。";
const assistantPath = "/dashboard/assistant";

function near(actual, expected, description) {
  assert.ok(Math.abs(actual - expected) <= 1, description + "，实测 " + actual + "，预期 " + expected);
}

export async function runMobileLayoutStability(db) {
  const { baseURL, account, userId, today, samples } = JSON.parse(
    await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG, "utf8"),
  );
  const engine = process.env.CHAT_BROWSER ?? "chromium";
  const output = process.env.FORMWARD_CHAT_ARTIFACTS;
  const playwright = await import(process.env.PLAYWRIGHT_MODULE);
  const report = { engine, checks: [], samples: [], screenshots: [], passed: false };
  const token = await createAiToken(db, userId, "虚构间距验收", "write");
  const identity = await authenticateAi(db, "Bearer " + token.rawToken);
  const meal = mealPreviewOperation({
    operationId: randomUUID(), date: today, timezone: "Asia/Shanghai", mealType: "晚餐",
    foods: [{ name: foodName, quantity: "150", unit: "克", caloriesKcal: "240",
      proteinG: "25", carbsG: "0", fatG: "9", sourceKind: "estimated", basis: "虚构份量与营养。" }],
  });
  const operation = await submitRecordOperation(db, identity, {
    operationId: meal.operationId,
    items: [{ ...meal.actions[0], key: "meal" }],
  });
  const origin = { Origin: baseURL };
  const key = workspacePages.map(([path, label]) => [path, label]);
  const browser = await playwright[engine].launch();

  async function login(context) {
    const response = await context.request.post("/api/auth/sign-in/email", { headers: origin, data: account });
    assert.equal(response.status(), 200);
  }

  try {
    const auth = await browser.newContext({ baseURL });
    await login(auth);
    const create = await auth.request.post("/api/assistant-chat/control", { headers: origin, data: { action: "new" } });
    assert.equal(create.status(), 200);
    const { conversationId } = await (await auth.request.get("/api/assistant-chat")).json();
    const questionId = randomUUID();
    await db.insert(assistantMessage).values([
      { id: questionId, userId, conversationId, seq: 1, role: "user", text: requestLabel,
        imageIds: samples.slice(0, 4).map(item => item.id) },
      { id: randomUUID(), userId, conversationId, seq: 2, role: "assistant", provider: "qwen", state: "complete",
        text: "这份晚餐已经整理好，请核对份量。", references: [{ kind: "preview", operationId: operation.id,
          title: "晚餐摘要", href: "/dashboard/ai/operations/" + operation.id }] },
    ]);
    await db.update(assistantConversation).set({ sequence: 2 }).where(eq(assistantConversation.id, conversationId));
    const status = await auth.request.get("/api/assistant-chat?previewId=" + operation.id);
    assert.equal(status.status(), 200);
    const realPreview = await status.json();
    const history = await auth.request.get("/api/assistant-chat?view=history");
    const { items } = await history.json();
    const conversationTitle = items.find(item => item.id === conversationId).title;
    const state = await auth.storageState();
    await auth.close();

    async function runSurface(mobile) {
      const name = mobile ? "mobile" : "desktop";
      const viewport = mobile ? { width: 390, height: 660 } : { width: 1440, height: 900 };
      const context = await browser.newContext({
        baseURL, viewport, hasTouch: mobile, isMobile: mobile, storageState: state,
        recordVideo: { dir: output, size: viewport },
      });
      await context.addInitScript(() => {
        localStorage.setItem("formward-theme", "dark");
        const native = window.visualViewport;
        const mock = new EventTarget();
        let simulated = null;
        for (const property of ["height", "width", "offsetTop", "offsetLeft", "scale"]) {
          Object.defineProperty(mock, property, { get: () => simulated?.[property] ?? native[property] });
        }
        Object.defineProperty(window, "visualViewport", { configurable: true, get: () => mock });
        window.setTestViewport = value => { simulated = value; mock.dispatchEvent(new Event("resize")); };
        native.addEventListener("resize", () => mock.dispatchEvent(new Event("resize")));
        native.addEventListener("scroll", () => mock.dispatchEvent(new Event("scroll")));

        const animate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
          const animation = animate.apply(this, args);
          if (window.holdAssistantEntry && this.matches("[data-assistant-page-content]") &&
              this.closest("[data-assistant-phase]")?.dataset.assistantPhase === "opening") {
            animation.pause();
            animation.currentTime = 0;
            window.assistantEntry = animation;
          }
          return animation;
        };

        window.mobileLayout = () => {
          const box = node => {
            if (!node) return null;
            const bounds = node.getBoundingClientRect(), css = getComputedStyle(node);
            return { top: bounds.top, bottom: bounds.bottom, height: bounds.height, left: bounds.left,
              visible: css.visibility === "visible" && bounds.height > 0, opacity: Number(css.opacity),
              padding: [parseFloat(css.paddingTop), parseFloat(css.paddingBottom)] };
          };
          const shell = document.querySelector("[data-assistant-page]");
          const dock = document.querySelector("[data-workspace-dock]");
          const frame = document.querySelector("[data-workspace-viewport]");
          const card = [...document.querySelectorAll("[data-chat-preview]")].find(node => box(node)?.visible);
          const reading = card?.querySelector("[data-local-loading]");
          const fixedPage = document.body.style.position === "fixed";
          // 固定模式通过 body 偏移保持可见的来源位置，文档自身的 scrollY 会归零。
          const sourceScroll = fixedPage ? -parseFloat(document.body.style.top) : scrollY;
          return {
            time: performance.now(), visibleBottom: mock.height + mock.offsetTop, layoutHeight: innerHeight, scroll: sourceScroll,
            rootBackground: getComputedStyle(document.documentElement).backgroundColor,
            frameBackground: frame ? getComputedStyle(frame).backgroundColor : null,
            viewport: box(frame), content: box(shell?.querySelector("[data-assistant-page-content]")),
            inset: dock ? parseFloat(getComputedStyle(dock).bottom) : null,
            workspaceVisible: !!box(document.querySelector("[data-workspace-frame]"))?.visible,
            locked: document.body.style.position === "fixed" || document.body.style.overflow === "hidden",
            phase: shell?.getAttribute("data-assistant-phase"),
            mountedDock: dock === window.originalWorkspaceDock,
            assistantEntryVisible: !!box(dock?.querySelector("[data-assistant-trigger]"))?.visible,
            selected: dock?.querySelector("[aria-current=page]")?.textContent,
            dock: box(dock), shell: box(shell), composer: box(shell?.querySelector("[class*=composerRow]")?.parentElement),
            send: box(shell?.querySelector('[aria-label="发送消息"]')),
            card: box(card), reading: box(reading),
            readingCount: card?.querySelectorAll("[data-reading-status]").length ?? 0,
            label: reading?.getAttribute("data-visible") === "true",
          };
        };
        window.trackMobileLayout = duration => {
          const start = performance.now(), frames = [];
          window.mobileLayoutFrames = frames;
          const sample = now => {
            frames.push(window.mobileLayout());
            if (now - start < duration) requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        };
      });
      const page = await context.newPage(), video = page.video();
      page.setDefaultTimeout(12000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const dock = page.locator("[data-workspace-dock]");
      const trigger = dock.locator("[data-assistant-trigger]");
      const shell = page.locator("[data-assistant-page]");
      const card = page.locator("[data-chat-preview]:visible").first();
      const text = page.getByRole("textbox", { name: "给小助手发消息", exact: true });
      const summary = page.getByText("正在读取记录摘要…", { exact: true });
      const back = page.getByRole("button", { name: "返回工作区", exact: true });
      const measure = () => page.evaluate(() => window.mobileLayout());
      const track = () => page.evaluate(() => window.trackMobileLayout(1600));
      const frames = () => page.evaluate(() => window.mobileLayoutFrames);
      let response = "fast", blocked;
      const cdp = mobile && engine === "chromium" ? await context.newCDPSession(page) : null;

      async function setSafeArea(bottom) {
        if (cdp) {
          await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom, bottomMax: bottom ? 34 : 0 } });
        } else {
          // 浏览器协议无法设置 WebKit 的 env()，仅替换浏览器提供的安全区值。
          await page.locator("html").evaluate((node, bottom) => node.style.setProperty(
            "--workspace-safe-bottom", bottom + "px",
          ), bottom);
        }
      }

      await context.route(url => url.pathname === "/api/assistant-chat" && url.searchParams.get("previewId") === operation.id,
        async route => {
          const mode = response;
          if (mode === "slow") await blocked.promise;
          if (mode === "fail") await route.fulfill({ status: 503, json: { error: "虚构读取失败，可重新读取。" } });
          else await route.fulfill({ status: 200, json: realPreview });
        });

      async function shot(label) {
        const file = engine + "-" + name + "-" + label + ".png";
        await page.screenshot({ path: join(output, file) });
        report.screenshots.push(file);
      }

      async function openChat() {
        if (mobile) {
          await dock.evaluate(node => { window.originalWorkspaceDock = node; });
          await trigger.click();
          await page.waitForURL("**" + assistantPath);
          await page.waitForFunction(() => window.mobileLayout().phase === "open");
        } else {
          const surface = page.locator("dialog[data-assistant-surface][open]");
          for (let attempt = 0; attempt < 3 && !await surface.isVisible(); attempt++) {
            await page.locator("[data-assistant-trigger]:visible").click();
            await surface.waitFor({ timeout: 1600 }).catch(() => {});
          }
          await surface.waitFor();
        }
        await text.waitFor();
      }

      async function returnTo(path, original, action, { gap = original.inset, resized = false } = {}) {
        await track();
        await action();
        await page.waitForURL(baseURL + path);
        await shell.waitFor({ state: "hidden" });
        await trigger.waitFor();
        await page.waitForFunction(() => document.activeElement?.matches("[data-workspace-dock] [data-assistant-trigger]"));
        await page.waitForTimeout(350);
        const final = await measure();
        const timeline = await frames();
        const steps = timeline.filter(frame => frame.dock?.visible);
        assert.ok(steps.length >= 3, "覆盖底栏露出及随后稳定帧");
        assert.equal(steps[0], timeline.find(frame => frame.workspaceVisible), "来源正文和底栏同一帧露出");
        assert.equal(steps[0].phase, "closing", "底栏在助手退场开始时即可见");
        assert.ok(timeline.every(frame => frame.locked === Boolean(frame.phase)), "滚动锁随助手退场释放");
        for (const frame of steps) {
          assert.ok(frame.mountedDock && frame.assistantEntryVisible, "首帧使用来源页的同一个完整底栏");
          assert.equal(frame.selected, original.selected, "底栏选中态从首帧匹配来源");
          near(frame.dock.bottom, frame.viewport.bottom - frame.inset, "底栏每帧与同一框架的底边对齐");
          if (!resized) near(frame.dock.top, final.dock.top, "可见时没有额外垂直跳动");
        }
        if (!resized) near(final.dock.top, original.dock.top, "来源页面的底栏顶部");
        near(final.scroll, original.scroll, "来源页面滚动位置");
        near(final.viewport.bottom - final.dock.bottom, gap, "使用当前安全区");
        const padding = await page.locator("main.dashboard-page:visible").first().evaluate(node => parseFloat(getComputedStyle(node).paddingBottom));
        near(padding, final.dock.height + gap + 32, "正文留位和底栏共用安全区");
        const stableFrames = steps.filter(frame => frame.viewport.bottom === final.viewport.bottom && frame.inset === final.inset);
        report.samples.push({ name, kind: "return", path, resized, firstVisible: steps[0], final, visibleFrames: steps.length,
          closingFrames: steps.filter(frame => frame.phase === "closing").length,
          dockTopDrift: Math.max(...stableFrames.map(frame => Math.abs(frame.dock.top - final.dock.top))) });
      }

      try {
        await page.goto("/dashboard", { waitUntil: "networkidle" });
        if (mobile) await page.evaluate(() => scrollTo({ top: 18, behavior: "instant" }));
        const home = await measure();
        if (mobile) assert.ok(home.scroll > 0);

        response = "slow";
        blocked = Promise.withResolvers();
        await track();
        await openChat();
        await summary.waitFor();
        await page.waitForFunction(() => window.mobileLayout().reading?.opacity === 1);
        await shot("reading");
        const captured = await frames();
        const blank = captured.find(frame => frame.card?.visible && frame.reading && !frame.label);
        const reading = captured.find(frame => frame.card?.visible && frame.reading && frame.label);
        assert.ok(blank && reading, "分别采集到空白槽和提示文字");
        near(blank.card.height, reading.card.height, "提示出现前后卡片高度");
        near(blank.reading.top - blank.card.top, reading.reading.top - reading.card.top, "提示在同一行顶对齐");
        assert.deepEqual(blank.card.padding, reading.card.padding);
        assert.equal(reading.readingCount, 1);
        report.samples.push({ name, kind: "reading", before: blank, after: reading });
        blocked.resolve();
        await card.getByText(foodName, { exact: true }).waitFor();
        await card.getByRole("button", { name: "保存确认", exact: true }).waitFor();
        await shot("loaded");
        report.checks.push(name + " 慢读固定间距，卡片读取后真实展开");

        if (mobile) {
          const arrivals = captured.filter(frame => frame.phase === "opening");
          assert.ok(arrivals.length > 0, "采样覆盖开场动效，不能只测稳定画面");
          for (const frame of arrivals) {
            assert.equal(frame.frameBackground, frame.rootBackground, "首个绘制帧的画布和视口底色一致");
            assert.equal(frame.frameBackground, reading.frameBackground, "背景颜色贯穿整个入场");
            assert.equal(frame.viewport.opacity, 1);
            assert.ok(frame.composer?.visible, "标题和编辑区首帧一起显示");
            near(frame.composer.bottom, frame.viewport.bottom, "首帧输入区贴底");
            near(frame.viewport.bottom, frame.layoutHeight, "视口从首帧覆盖到屏幕底边");
            near(frame.shell.left, 0, "背景外的助手布局不参与横移");
            assert.equal(frame.locked, true);
            near(frame.scroll, home.scroll, "入场不改来源页滚动");
          }
          report.samples.push({ name, kind: "opening", frameCount: arrivals.length, first: arrivals[0], last: arrivals.at(-1) });
          const normal = await measure();
          near(normal.shell.bottom, normal.visibleBottom, "聊天底色铺到视口边缘");
          near(normal.composer.bottom, normal.visibleBottom, "无安全区时输入框贴底");
          await page.evaluate(() => window.setTestViewport({ height: innerHeight - 6, offsetTop: 0 }));
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const shortViewport = await measure();
          near(shortViewport.layoutHeight - shortViewport.visibleBottom, 6, "复现视觉视口短报");
          near(shortViewport.shell.bottom, shortViewport.layoutHeight, "无键盘时聊天底色仍盖住布局视口");
          near(shortViewport.composer.bottom, shortViewport.layoutHeight, "无键盘时输入区仍贴住布局视口");
          assert.equal(shortViewport.rootBackground, shortViewport.frameBackground, "网页底色与助手一致");
          report.samples.push({ name, kind: "bottom-edge", before: normal, shortViewport });
          await shot("edge");
          await page.evaluate(() => window.setTestViewport(null));
          await text.fill(draft);
          await page.evaluate(() => window.setTestViewport({ height: 235, offsetTop: 0 }));
          await page.waitForFunction(() => document.querySelector("[data-assistant-page]")?.hasAttribute("data-assistant-keyboard"));
          const keyboard = await measure();
          assert.ok(keyboard.send.height >= 44);
          assert.ok(keyboard.send.bottom <= keyboard.visibleBottom);
          near(keyboard.shell.bottom, keyboard.visibleBottom, "键盘打开时页面贴住可见区");
          await page.evaluate(() => { document.activeElement?.blur(); window.setTestViewport(null); });
          await page.waitForFunction(() => !document.querySelector("[data-assistant-page]")?.hasAttribute("data-assistant-keyboard"));
          await page.getByRole("tab", { name: "待办", exact: true }).click();
          await page.getByRole("region", { name: "快捷记录", exact: true }).waitFor();
          await page.getByRole("tab", { name: "聊天", exact: true }).click();
          assert.equal(await text.inputValue(), draft);
          await page.getByRole("button", { name: "查看 4 张照片", exact: true }).click();
          const viewer = page.getByRole("dialog", { name: "照片预览", exact: true });
          await viewer.getByRole("img", { name: "第 1 张照片", exact: true }).waitFor();
          await viewer.getByRole("button", { name: "下一张", exact: true }).click();
          await viewer.getByRole("img", { name: "第 2 张照片", exact: true }).waitFor();
          await viewer.getByRole("button", { name: "关闭照片预览", exact: true }).click();
          await viewer.waitFor({ state: "hidden" });
          await returnTo("/dashboard", home, async () => {
            await page.evaluate(() => window.setTestViewport({ height: innerHeight - 6, offsetTop: 0 }));
            await back.click();
            await page.waitForFunction(() => window.mobileLayout().phase === "closing");
            const transient = await measure();
            near(transient.layoutHeight - transient.visibleBottom, 6, "退出过程仍短报视觉视口");
            near(transient.dock.top, home.dock.top, "视觉视口短报时底栏已在来源位置");
            await page.evaluate(() => window.setTestViewport(null));
          });
          await shot("returned");
          report.checks.push("入场直到稳定底色一致，视口短报不移动底栏，键盘、待办草稿、原图和滚动返回");

          await setSafeArea(34);
          const safeOrigin = await measure();
          response = "fail";
          await openChat();
          await card.getByRole("alert").filter({ hasText: "虚构读取失败" }).waitFor();
          response = "fast";
          await card.getByRole("button", { name: "重新读取", exact: true }).click();
          await card.getByText(foodName, { exact: true }).waitFor();
          const safe = await measure();
          near(safe.visibleBottom - safe.composer.bottom, 34, "输入框留出实际安全区");
          await returnTo("/dashboard", safeOrigin, async () => {
            await back.click();
            await page.waitForFunction(() => window.mobileLayout().phase === "closing");
            await page.setViewportSize({ ...viewport, height: viewport.height - 6 });
            await setSafeArea(30);
          }, { gap: 42, resized: true });
          await setSafeArea(0);
          await page.setViewportSize(viewport);
          near((await measure()).inset, 12, "清除安全区后没有残留历史间距");
          report.checks.push("失败原位重试，真实视口调整与安全区变化同步参考框架，无回程后二次定位");
          for (const [path, label] of key) {
            await page.goto(path, { waitUntil: "networkidle" });
            const before = await measure();
            await track();
            await openChat();
            await card.getByText(foodName, { exact: true }).waitFor();
            assert.equal((await frames()).some(frame => frame.label), false, "快读直接显示真实卡片");
            if (label === "总览") {
              await page.evaluate(() => history.back());
              await page.waitForFunction(() => window.mobileLayout().phase === "closing");
              await page.evaluate(() => history.forward());
              await page.waitForURL("**" + assistantPath);
              await page.waitForFunction(() => window.mobileLayout().phase === "open");
              assert.equal((await measure()).dock.visible, false);
            }
            await returnTo(path, before, () => page.evaluate(() => history.back()));
            assert.equal((await measure()).selected, label);
          }
          report.checks.push("五个主页面软导航返回，浏览器前后及快速重开");

          for (const theme of ["dark", "light"]) {
            await page.evaluate(theme => {
              document.documentElement.dataset.theme = theme;
              window.holdAssistantEntry = true;
            }, theme);
            await trigger.click();
            await page.waitForFunction(() => window.assistantEntry?.playState === "paused");
            const first = await measure();
            near(first.content.left, 16, "首帧仍从右侧进入");
            near(first.content.opacity, 0.65, "首帧只渐变前景");
            // 定格真实入场姿态，再独立模拟前景高度短报，拍摄期间保持同一几何条件。
            await page.evaluate(() => { document.querySelector("[data-assistant-page]").style.height = "calc(100% - 6px)"; });
            const shortened = await measure();
            near(shortened.shell.bottom, first.layoutHeight - 6, "重放旧症状的几何缺口");
            near(shortened.viewport.bottom, first.layoutHeight, "固定底色覆盖前景下方的 6px");
            assert.equal(shortened.frameBackground, shortened.rootBackground);
            await shot(theme + "-first-frame");
            near((await measure()).shell.bottom, shortened.shell.bottom, "截图时前景短报条件保持");
            await page.evaluate(() => {
              document.querySelector("[data-assistant-page]").style.removeProperty("height");
              window.holdAssistantEntry = false;
              window.assistantEntry.play();
              window.assistantEntry = null;
            });
            await page.waitForFunction(() => window.mobileLayout().phase === "open");
            const open = await measure();
            assert.equal(open.frameBackground, first.frameBackground);
            await shot(theme + "-settled");
            report.samples.push({ name, kind: "first-frame-pixels", theme, first, shortened, open });
            await back.click();
            await shell.waitFor({ state: "hidden" });
          }
          report.checks.push("两主题取入场第一帧和稳定画面，并复现前景底部短 6px");

          await openChat();
          await page.getByRole("button", { name: "历史会话", exact: true }).click();
          await page.getByRole("button", { name: new RegExp(conversationTitle) }).first().click();
          await card.getByText(foodName, { exact: true }).waitFor();
          await page.getByRole("button", { name: "返回列表", exact: true }).click();
          await page.getByRole("button", { name: "返回小助手", exact: true }).click();
          const model = page.getByRole("button", { name: "千问", exact: true });
          await model.click();
          await page.getByText("今日剩余", { exact: false }).first().waitFor();
          await page.keyboard.press("Escape");
          report.checks.push("历史回看及模型用量原位读取");
        }

        for (const theme of ["light", "dark"]) {
          await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
          for (const width of mobile ? [320, 390, 430] : [1440]) {
            await page.setViewportSize({ ...viewport, width });
            await page.waitForFunction(width => innerWidth === width, width);
            const dims = await measure();
            if (mobile) {
              near(dims.composer.bottom, dims.visibleBottom, "输入框贴底");
              assert.ok(dims.send.height >= 44 && dims.send.bottom <= dims.visibleBottom);
            }
            report.checks.push(name + " " + width + "px " + theme + " 最终状态");
          }
        }
        if (mobile) {
          await page.setViewportSize(viewport);
          const pendingTasks = Promise.withResolvers();
          const contextRoute = url => url.pathname === "/api/assistant-context";
          await context.route(contextRoute, async route => {
            await pendingTasks.promise;
            await route.continue();
          });
          try {
            await page.goto(assistantPath + "?view=tasks", { waitUntil: "load" });
            const heading = shell.locator('[data-assistant-group="supplements"]');
            await heading.waitFor();
            const before = await heading.boundingBox();
            await heading.getByText("正在读取事项…", { exact: true }).waitFor();
            const waiting = await heading.boundingBox();
            near(waiting.y, before.y, "待办提示出现时标题位置");
            near(waiting.height, before.height, "待办提示出现时标题行高度");
            pendingTasks.resolve();
            await heading.getByText("查看需要补记的记录", { exact: true }).waitFor();
            near((await heading.boundingBox()).y, before.y, "待办数据就绪后的分组位置");
            report.checks.push("待办冷读在说明行呈现，快捷记录与分组位置稳定");
          } finally {
            pendingTasks.resolve();
            await context.unroute(contextRoute);
          }

          await page.goto("/dashboard/ai/operations/" + operation.id, { waitUntil: "networkidle" });
          await page.getByText(foodName, { exact: true }).waitFor();
          report.checks.push("从原审核入口读取实际记录");

          await page.goto("/dashboard", { waitUntil: "networkidle" });
          let accountGate;
          await context.route(url => url.pathname.startsWith("/dashboard"), async route => {
            if (accountGate && route.request().method() === "POST" && route.request().headers()["next-action"]) {
              await accountGate.promise;
            }
            await route.continue();
          });
          for (const [name, group, ready] of [
            ["个人资料", "账号管理", () => page.getByRole("button", { name: "修改资料", exact: true }).waitFor()],
            ["账号与安全", "账号管理", () => page.locator('dialog[open] input[name="currentPassword"]').waitFor()],
            ["设备与数据来源", "外部接入", () => page.getByText("尚未连接", { exact: true }).waitFor()],
          ]) {
            accountGate = Promise.withResolvers();
            try {
              await page.locator('summary[aria-label="账号菜单"]').click();
              await page.getByRole("button", { name: group, exact: true }).click();
              await page.getByRole("button", { name, exact: true }).click();
              const panel = page.getByRole("dialog", { name, exact: true });
              const slot = panel.locator("[data-local-loading]").first();
              await slot.waitFor();
              const height = () => slot.evaluate(node => node.parentElement.getBoundingClientRect().height);
              const initial = await height();
              await panel.locator("[data-local-loading][data-visible]").waitFor();
              near(await height(), initial, name + " 的读取提示留位");
              assert.equal(await panel.locator("[data-local-loading][data-visible]").count(), 1);
              accountGate.resolve();
              await ready();
              await panel.getByRole("button", { name: /^关闭/ }).first().click();
              await panel.waitFor({ state: "hidden" });
              report.checks.push(name + " 读取及关闭");
            } finally {
              accountGate.resolve();
              accountGate = undefined;
            }
          }
        }
        assert.deepEqual(errors, []);
      } catch (error) {
        report.failure = String(error);
        report.diagnostics = await measure().catch(() => null);
        await shot("failure").catch(() => {});
        throw error;
      } finally {
        blocked?.resolve();
        await context.close();
        await video.saveAs(join(output, engine + "-" + name + "-layout.webm"));
      }
    }

    await runSurface(true);
    await runSurface(false);
    report.passed = true;
  } finally {
    await browser.close();
    await writeFile(join(output, engine + "-layout.json"), JSON.stringify(report, null, 2));
  }
}

