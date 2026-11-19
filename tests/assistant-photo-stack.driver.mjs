import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { assistantConversation, assistantMessage, assistantRun, rateLimit } from "../src/db/schema.ts";

const question = "四张都是同一顿晚餐。前两张是餐盘，后两张是标签。请合起来记一餐，重复食物只算一次。";

async function layout(stack, expected) {
  const geometry = await stack.evaluate(button => {
    const layers = [...button.querySelectorAll("[data-photo-layer]")];
    return {
      button: button.getBoundingClientRect().toJSON(),
      count: Number(button.dataset.photoStack),
      layers: layers.map(node => {
        const box = node.getBoundingClientRect();
        const exposed = document.elementFromPoint(box.right - 9, box.top + 8);
        return { x: box.x, y: box.y, width: box.width, height: box.height, exposed: node.contains(exposed) };
      }),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
  assert.equal(geometry.count, expected);
  assert.equal(geometry.layers.length, expected);
  assert.ok(geometry.button.width >= 44 && geometry.button.height >= 44);
  assert.ok(geometry.button.x >= 0 && geometry.button.right <= geometry.viewportWidth + 1);
  assert.ok(geometry.documentWidth <= geometry.viewportWidth + 1);
  assert.ok(geometry.layers.every(layer => layer.exposed), "每个右上角在该层实际可见，未被相邻层盖住");
  assert.ok(geometry.layers.every((layer, index) => !index ||
    Math.abs(layer.x - geometry.layers[index - 1].x - 12) <= 1 &&
    Math.abs(layer.y - geometry.layers[index - 1].y + 12) <= 1));
  return geometry;
}

async function trackOpening(stack) {
  await stack.evaluate(button => {
    window.photoOpeningFrames = null;
    button.addEventListener("click", () => {
      const frames = [];
      const start = performance.now();
      function update(now) {
        const viewer = document.querySelector('dialog[aria-label="照片预览"]');
        const stage = viewer?.querySelector('[class*="photoStage"]');
        const photo = stage?.querySelector('img[data-ready="true"]');
        if (viewer?.open && stage) {
          const { x, y, width, height } = stage.getBoundingClientRect();
          frames.push({ at: now - start, opacity: Number(getComputedStyle(viewer).opacity),
            photo: !!photo && photo.complete && photo.naturalWidth > 0, stage: [x, y, width, height] });
        }
        if (now - start < 440) requestAnimationFrame(update);
        else window.photoOpeningFrames = frames;
      }
      requestAnimationFrame(update);
    }, { once: true });
  });
}

async function openingFrames(page) {
  await page.waitForFunction(() => !!window.photoOpeningFrames);
  const frames = await page.evaluate(() => window.photoOpeningFrames);
  assert.ok(frames.length >= 5 && frames[0].opacity < 1 && frames.at(-1).opacity === 1, "打开过程实际从淡入到完全可见");
  assert.ok(frames.at(-1).photo);
  let loaded = false;
  for (const [index, frame] of frames.entries()) {
    assert.ok(!index || frame.opacity + .03 >= frames[index - 1].opacity, "打开过程中透明度连续单向增加");
    assert.ok(frame.stage.every((n, j) => Math.abs(n - frames[0].stage[j]) <= 1), "预览框从第一帧定位，图片读取不挪位");
    assert.ok(!loaded || frame.photo, "原图出现后连续显示");
    loaded ||= frame.photo;
  }
  return { frames: frames.length, imageAtMs: Math.round(frames.find(frame => frame.photo).at),
    duration: Math.round(frames.find(frame => frame.opacity === 1).at), geometryStable: true, monotonic: true };
}

export async function runAssistantPhotoStack(db) {
  const fixture = JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG, "utf8"));
  const { baseURL, userId, account, samples } = fixture;
  const directory = process.env.FORMWARD_CHAT_ARTIFACTS;
  const engine = process.env.CHAT_BROWSER ?? "chromium";
  const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
  const browser = await playwright[engine].launch({ headless: true });
  const report = [];

  async function journey(surface) {
    const mobile = surface === "mobile";
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const context = await browser.newContext({ baseURL, viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1,
      recordVideo: { dir: directory, size: viewport } });
    const page = await context.newPage();
    const video = page.video();
    const shots = [], checks = [], errors = [], measurements = [];
    const result = { surface, viewport, shots, checks, measurements, passed: false };
    report.push(result);
    page.setDefaultTimeout(30000);
    page.on("pageerror", error => errors.push(String(error)));
    await page.addInitScript(() => localStorage.setItem("formward-theme", "light"));
    const button = name => page.getByRole("button", { name, exact: true }).filter({ visible: true });
    const stack = number => button("查看 " + number + " 张照片");
    const dialog = page.getByRole("dialog", { name: "照片预览", exact: true });
    const feed = page.getByRole("log", { name: "聊天消息", exact: true });
    const input = page.getByRole("textbox", { name: "给小助手发消息", exact: true });
    const chat = () => context.request.get("/api/assistant-chat").then(response => response.json());
    async function shot(name) {
      const file = engine + "-" + surface + "-" + name + ".png";
      await page.screenshot({ path: join(directory, file) });
      shots.push(file);
    }
    async function viewPhoto(number, id, viewer = dialog) {
      const photo = viewer.getByRole("img", { name: "第 " + number + " 张照片", exact: true });
      await photo.waitFor({ state: "visible" });
      const url = new URL(await photo.getAttribute("src"), baseURL);
      assert.equal(url.pathname, "/api/meal-images/" + id);
      assert.equal(await photo.evaluate(node => getComputedStyle(node).objectFit), "contain");
    }

    try {
      await db.delete(rateLimit);
      const signed = await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL }, data: account });
      assert.equal(signed.status(), 200);
      const started = await context.request.post("/api/assistant-chat/control", { headers: { Origin: baseURL }, data: { action: "new" } });
      assert.equal(started.status(), 200);
      const conversationId = (await chat()).conversationId;
      const firstPhotos = [
        { id: randomUUID(), userId, conversationId, seq: 1, role: "user", imageIds: [samples[0].id], text: "验收单张照片" },
        { id: randomUUID(), userId, conversationId, seq: 2, role: "user", imageIds: samples.slice(0, 2).map(sample => sample.id), text: "验收两张照片" },
        { id: randomUUID(), userId, conversationId, seq: 3, role: "user", imageIds: samples.slice(0, 8).map(sample => sample.id), text: "" },
      ];
      await db.insert(assistantMessage).values(firstPhotos);
      await db.update(assistantConversation).set({ sequence: 3 }).where(eq(assistantConversation.id, conversationId));

      await page.goto(mobile ? "/dashboard/assistant" : "/dashboard");
      if (!mobile) await page.locator("[data-assistant-trigger]:visible").click();
      await stack(2).waitFor();
      await input.fill(question);
      await page.getByLabel("选择聊天照片", { exact: true }).setInputFiles(samples.slice(0, 4).map(photo => photo.file));
      await page.getByText("已选 4 张，发送后分批读取", { exact: true }).waitFor();
      await shot("01-selected");
      assert.equal(await input.inputValue(), question);
      const accepted = page.waitForResponse(response =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/api/assistant-chat");
      await button("发送消息").click();
      const four = stack(4);
      await four.waitFor();
      await four.scrollIntoViewIfNeeded();
      await four.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
      assert.ok((await accepted).ok());
      const sent = await chat();
      const sentMessage = sent.messages.find(message => message.text === question);
      assert.ok(sentMessage, "服务端已回读到带完整文字的消息");
      const ids = sentMessage.imageIds;
      assert.equal(ids.length, 4);
      assert.ok(await four.locator("[data-photo-layer]").evaluateAll(nodes =>
        nodes.every(node => [...node.querySelectorAll("img")].some(image => image.complete && image.naturalWidth > 0))),
        "发送后各层预览直接可见");
      assert.equal(await four.locator("[data-photo-layer='1'] img").first().evaluate(node => getComputedStyle(node).objectFit), "contain");
      measurements.push({ theme: "light", width: viewport.width, ...await layout(four, 4) });
      assert.equal(await four.evaluate(node => node.nextElementSibling?.textContent.trim()), question);
      await shot("02-four-layers");
      // 原速录像在关键操作留出阅读时间，功能断言仍等待真实状态。
      await page.waitForTimeout(800);
      checks.push("实际发送后前景图完整，四层对角露出，照片在所属文字上方");

      await trackOpening(four);
      await four.click();
      await viewPhoto(1, ids[0]);
      result.opening = await openingFrames(page);
      checks.push("点开时预览框位置稳定，160 毫秒淡入连续，首图出现后持续可见");
      assert.ok(await button("上一张").isDisabled());
      await shot("03-open");
      await page.waitForTimeout(750);
      if (mobile) {
        const stage = dialog.locator("[class*='photoStage']");
        if (engine === "chromium") {
          const cdp = await context.newCDPSession(page);
          const box = await stage.boundingBox();
          const x = Math.round(box.x + box.width * .8), y = Math.round(box.y + box.height * .5);
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
          for (const distance of [24, 48, 88, 140]) {
            await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - distance, y }] });
          }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await cdp.detach();
        } else await stage.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const data = { bubbles: true, pointerId: 1, isPrimary: true, pointerType: "touch", clientY: rect.y + 100 };
          node.dispatchEvent(new PointerEvent("pointerdown", { ...data, clientX: rect.x + 210 }));
          node.dispatchEvent(new PointerEvent("pointerup", { ...data, clientX: rect.x + 80 }));
        });
      } else await page.keyboard.press("ArrowRight");
      await viewPhoto(2, ids[1]);
      await page.waitForTimeout(650);
      await button("下一张").click();
      await viewPhoto(3, ids[2]);
      await page.waitForTimeout(650);
      await button("下一张").click();
      await viewPhoto(4, ids[3]);
      assert.ok(await button("下一张").isDisabled());
      await shot("04-last-original");
      await page.waitForTimeout(750);
      // 助手完成生成可能自然增高正文，记录此时背景的滚动位置。
      const scrollWithPreview = await feed.evaluate(node => node.scrollTop);
      if (mobile) await button("关闭照片预览").click();
      else await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.ok(await four.evaluate(node => document.activeElement === node));
      assert.ok(Math.abs(await feed.evaluate(node => node.scrollTop) - scrollWithPreview) <= 1,
        "关闭只回原消息，滚动位置保持");
      await shot("05-return");
      await page.waitForTimeout(650);
      checks.push("预览按真实发送顺序查看四张，手机滑动、桌面方向键和 Esc 都能返回原消息");

      await button("保存确认").waitFor();
      const runsBeforeReading = (await db.select({ id: assistantRun.id }).from(assistantRun).where(eq(assistantRun.userId, userId))).length;
      await button("历史会话").click();
      await page.getByRole("button", { name: /验收单张照片/ }).filter({ visible: true }).first().click();
      const historyFour = stack(4);
      await historyFour.scrollIntoViewIfNeeded();
      await layout(historyFour, 4);
      await historyFour.click();
      await viewPhoto(1, ids[0]);
      await button("下一张").click();
      await viewPhoto(2, ids[1]);
      await shot("06-history");
      await button("关闭照片预览").click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await db.select({ id: assistantRun.id }).from(assistantRun).where(eq(assistantRun.userId, userId))).length, runsBeforeReading);
      checks.push("历史实际可展开同一组原图，浏览照片不新建助手任务");

      for (const theme of ["light", "dark"]) {
        for (const width of mobile ? [320, 390, 430] : [1100, 1440]) {
          await page.setViewportSize({ ...viewport, width });
          await page.evaluate(value => {
            localStorage.setItem("formward-theme", value);
            document.documentElement.dataset.theme = value;
          }, theme);
          for (const count of [2, 4, 8]) {
            const target = stack(count);
            await target.scrollIntoViewIfNeeded();
            const geometry = await layout(target, count);
            measurements.push({ theme, width, ...geometry });
            if (count === 8) await shot("08-layers-" + theme + "-" + width);
          }
        }
      }
      await page.setViewportSize(viewport);
      await page.evaluate(() => {
        localStorage.setItem("formward-theme", "light");
        document.documentElement.dataset.theme = "light";
      });
      const one = page.getByRole("link", { name: "本条消息的私有照片", exact: true });
      await one.scrollIntoViewIfNeeded();
      assert.equal(await one.getAttribute("href"), "/api/meal-images/" + samples[0].id);
      checks.push("双主题各宽度核对 2、4、8 个实际露角，纯照片消息和原有单张入口可用");

      // 空白浏览器会话预设慢读与故障，避免复用同一页面已经读取的原图。
      await db.delete(rateLimit);
      const reading = await browser.newContext({ baseURL, viewport, hasTouch: mobile, isMobile: mobile, reducedMotion: "reduce" });
      let releaseRead;
      const slowRead = new Promise(resolve => { releaseRead = resolve; });
      const review = await reading.newPage();
      try {
        const path = url => url.pathname === "/api/meal-images/" + ids[1] && !url.search;
        let rejectedReads = 0;
        const failRead = async route => {
          rejectedReads++;
          await slowRead;
          await route.fulfill({ status: 503, body: "" });
        };
        await reading.route(path, failRead);
        const authenticated = await reading.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL }, data: account });
        assert.equal(authenticated.status(), 200);
        review.on("pageerror", error => errors.push(String(error)));
        await review.goto(mobile ? "/dashboard/assistant" : "/dashboard", { waitUntil: "domcontentloaded" });
        if (!mobile) {
          await review.locator("[data-assistant-trigger]:visible").click();
          await review.locator("dialog[data-assistant-surface]").evaluate(node =>
            Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
        }
        await review.getByRole("button", { name: "查看 4 张照片", exact: true }).click();
        const viewer = review.getByRole("dialog", { name: "照片预览", exact: true });
        assert.equal(await viewer.evaluate(node => getComputedStyle(node).animationName), "none");
        await viewPhoto(1, ids[0], viewer);
        const previous = await viewer.getByRole("img", { name: "第 1 张照片", exact: true }).boundingBox();
        await viewer.getByRole("button", { name: "下一张", exact: true }).click();
        await viewer.getByText("正在读取照片…", { exact: true }).waitFor();
        await viewPhoto(1, ids[0], viewer);
        assert.deepEqual(await viewer.getByRole("img", { name: "第 1 张照片", exact: true }).boundingBox(), previous);
        await review.screenshot({ path: join(directory, engine + "-" + surface + "-slow-read.png") });
        shots.push(engine + "-" + surface + "-slow-read.png");
        releaseRead();
        await viewer.getByText("这张照片读取失败。", { exact: true }).waitFor();
        assert.ok(rejectedReads > 0);
        await reading.unroute(path, failRead);
        await viewer.getByRole("button", { name: "重新读取", exact: true }).click();
        await viewPhoto(2, ids[1], viewer);
        assert.deepEqual(await viewer.getByRole("img", { name: "第 2 张照片", exact: true }).boundingBox(), previous);
        await viewer.getByRole("button", { name: "关闭照片预览", exact: true }).click();
        await viewer.waitFor({ state: "hidden" });
      } catch (error) {
        await review.screenshot({ path: join(directory, engine + "-" + surface + "-read-failure.png") }).catch(() => {});
        throw error;
      } finally {
        releaseRead();
        await reading.close();
      }
      checks.push("减少动态效果直接显示，慢读时保留上一张，原图失败可在相同位置重试");
      assert.deepEqual(errors, []);
      result.passed = true;
    } catch (error) {
      result.failure = String(error);
      await shot("failure").catch(() => {});
      throw error;
    } finally {
      await context.close();
      if (video) {
        result.video = engine + "-" + surface + "-photo-stack.webm";
        await video.saveAs(join(directory, result.video));
      }
      await writeFile(join(directory, engine + "-photo-stack-report.json"), JSON.stringify(report, null, 2));
    }
  }

  try {
    for (const surface of ["mobile", "desktop"]) await journey(surface);
  } finally {
    await browser.close();
  }
}
