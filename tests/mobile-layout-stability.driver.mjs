import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { assistantConversation, assistantMessage } from "../src/db/schema.ts";
import { authenticateAi, createAiToken } from "../src/features/auth/ai-tokens.ts";
import { previewMeal } from "../src/features/meals/ai-preview.ts";
import { recordGuideKey } from "../src/features/onboarding/record-guidance-model.ts";
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
  const browser = await playwright[engine].launch();
  const report = { engine, checks: [], samples: [], screenshots: [], passed: false };
  const token = await createAiToken(db, userId, "虚构间距验收", "write");
  const identity = await authenticateAi(db, "Bearer " + token.rawToken);
  const operation = await previewMeal(db, identity, {
    operationId: randomUUID(), date: today, timezone: "Asia/Shanghai", mealType: "晚餐",
    foods: [{ name: foodName, quantity: "150", unit: "克", caloriesKcal: "240",
      proteinG: "25", carbG: "0", fatG: "9", sourceKind: "estimated", basis: "虚构份量与营养。" }],
  });
  const origin = { Origin: baseURL };
  const key = workspacePages.map(([path, label]) => [path, label]);
  const guideKeys = ["meals", "energy", "training"].map(kind => recordGuideKey(userId, kind));

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
      const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
      const context = await browser.newContext({
        baseURL, viewport, hasTouch: mobile, isMobile: mobile, storageState: state,
        recordVideo: { dir: output, size: viewport },
      });
      await context.addInitScript(({ guideKeys }) => {
        localStorage.setItem("formward-theme", "dark");
        for (const key of guideKeys) localStorage.setItem(key, "seen");
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

        window.mobileLayout = () => {
          const box = node => {
            if (!node) return null;
            const bounds = node.getBoundingClientRect(), css = getComputedStyle(node);
            return { top: bounds.top, bottom: bounds.bottom, height: bounds.height,
              visible: css.visibility === "visible" && bounds.height > 0, opacity: Number(css.opacity),
              padding: [parseFloat(css.paddingTop), parseFloat(css.paddingBottom)] };
          };
          const shell = document.querySelector("[data-assistant-page]");
          const dock = document.querySelector("[data-workspace-dock]");
          const card = [...document.querySelectorAll("[data-chat-preview]")].find(node => box(node)?.visible);
          const reading = card?.querySelector("[data-local-loading]");
          return {
            time: performance.now(), visibleBottom: mock.height + mock.offsetTop, scroll: scrollY,
            locked: document.body.style.position === "fixed", phase: shell?.getAttribute("data-assistant-phase"),
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
      }, { guideKeys });
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

      async function returnTo(path, original, action, expectedGap) {
        await track();
        await action();
        await page.waitForURL(baseURL + path);
        await shell.waitFor({ state: "hidden" });
        await trigger.waitFor();
        await page.waitForFunction(() => document.activeElement?.matches("[data-workspace-dock] [data-assistant-trigger]"));
        const final = await measure();
        const steps = (await frames()).filter(frame => frame.dock?.visible);
        assert.ok(steps.length > 0);
        for (const frame of steps) {
          assert.equal(frame.locked, false, "底栏首次可见时来源滚动锁已释放");
          assert.equal(frame.phase, undefined);
          near(frame.dock.bottom, final.dock.bottom, "已露出的底栏位置");
        }
        if (expectedGap === undefined) {
          near(final.dock.top, original.dock.top, "静态视口的底栏顶部");
          near(final.scroll, original.scroll, "来源页面滚动位置");
        } else {
          near(final.visibleBottom - final.dock.bottom, expectedGap, "变化后的底栏安全区");
          const padding = await page.locator("main.dashboard-page:visible").first().evaluate(node => parseFloat(getComputedStyle(node).paddingBottom));
          near(padding, final.dock.height + expectedGap + 32, "正文留位和底栏共用安全区");
        }
        report.samples.push({ name, kind: "return", path, final, visibleFrames: steps.length });
      }

      try {
        await page.goto("/dashboard", { waitUntil: "networkidle" });
        if (mobile) await page.evaluate(() => scrollTo(0, 18));
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
          const normal = await measure();
          near(normal.shell.bottom, normal.visibleBottom, "聊天底色铺到视口边缘");
          near(normal.composer.bottom, normal.visibleBottom, "无安全区时输入框贴底");
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
          await returnTo("/dashboard", home, () => back.click());
          report.checks.push("小助手底边、键盘、待办草稿、原图和滚动返回");

          if (cdp) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 34, bottomMax: 34 } });
          else await page.evaluate(() => document.documentElement.style.setProperty("--workspace-dock-gap", "34px"));
          response = "fail";
          await openChat();
          await card.getByRole("alert").filter({ hasText: "虚构读取失败" }).waitFor();
          response = "fast";
          await card.getByRole("button", { name: "重新读取", exact: true }).click();
          await card.getByText(foodName, { exact: true }).waitFor();
          if (cdp) {
            const safe = await measure();
            near(safe.visibleBottom - safe.composer.bottom, 34, "输入框留出实际安全区");
          }
          await returnTo("/dashboard", await measure(), async () => {
            await back.click();
            // 关闭时真实安全区只在 Chromium 由浏览器协议模拟。
            if (cdp) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 30, bottomMax: 34 } });
            else await page.evaluate(() => document.documentElement.style.setProperty("--workspace-dock-gap", "30px"));
          }, 30);
          await shot("returned");
          report.checks.push("失败原位重试，动态安全区与正文留位同帧接管");

          if (cdp) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 0, bottomMax: 0 } });
          else await page.evaluate(() => document.documentElement.style.removeProperty("--workspace-dock-gap"));
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

