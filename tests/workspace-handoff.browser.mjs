import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {authenticateFixture} from "./fixture-auth.mjs";

const config = JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG, "utf8"));
assert.equal(config.isolatedFixture, true);
assert.equal(new URL(config.baseURL).hostname, "127.0.0.1");
const engine = process.env.FORMWARD_LOADING_ENGINE ?? "chromium";
const engines = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const browser = await engines[engine].launch();
const output = resolve(process.env.FORMWARD_LOADING_ARTIFACTS ?? ".codex/workspace-loading", engine, "handoff");
await mkdir(output, {recursive: true});
const version = await (await fetch(config.baseURL + "/api/app-version")).json();
const results = [];

async function setDelay(delayMs) {
  const response = await fetch(config.delayControlURL, {method: "POST", body: JSON.stringify({delayMs})});
  assert.equal(response.status, 200);
}

function installProbe({theme}) {
  localStorage.setItem("formward-theme", theme);
  window.handoffProbe = {frames: [], enabled: false};
  const visible = node => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0;
  };
  function sample(source) {
    const probe = window.handoffProbe;
    if (!probe.enabled) return;
    const main = document.querySelector("main[data-workspace-frame]");
    const content = main?.querySelector("[data-workspace-content]");
    const body = [...(content?.children ?? [])].find(visible);
    const plot = [...(content?.querySelectorAll("[data-record-slot=plot]") ?? [])].find(visible);
    const dialog = [...document.querySelectorAll("dialog:modal[data-surface-phase]")].at(-1);
    const shade = dialog && getComputedStyle(dialog, "::backdrop");
    const gradient = !!shade && shade.backgroundImage !== "none";
    const alpha = shade?.backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([.\d]+)\)/)?.[1];
    probe.frames.push({
      source, time: performance.now(), kind: main?.dataset.workspaceFrame, scroll: scrollY,
      handoff: !!body?.hasAttribute("data-route-handoff"), body: !!body,
      pending: [...(content?.querySelectorAll("[data-workspace-reading]") ?? [])].some(visible),
      plotY: plot ? plot.getBoundingClientRect().top + scrollY : null,
      phase: dialog?.dataset.surfacePhase, gradient,
      shade: !shade || shade.visibility === "hidden" ? 0
        : Number(shade.opacity) * (gradient ? 1 : Number(alpha ?? (shade.backgroundColor === "transparent" ? 0 : 1))),
    });
  }
  function frame() { sample("paint"); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  new MutationObserver(records => {
    if (records.some(record => record.target instanceof HTMLDialogElement)) sample("dialog");
  }).observe(document, {subtree: true, attributes: true, attributeFilter: ["data-surface-phase"]});
}

async function record(page, label, action, validate) {
  await page.evaluate(() => { window.handoffProbe.frames = []; window.handoffProbe.enabled = true; });
  try {
    await action();
    await page.waitForTimeout(500);
  } finally {
    const frames = await page.evaluate(() => {
      window.handoffProbe.enabled = false;
      return window.handoffProbe.frames;
    });
    results.push({label, frames});
    await writeFile(join(output, "frames.json"), JSON.stringify({engine, version, results}));
  }
  validate(results.at(-1).frames);
}

const navigation = (page, name) => page.getByRole("navigation", {name: "主导航", exact: true}).getByRole("link", {name, exact: true});
const reading = page => page.locator("[data-route-content] [data-workspace-reading]:visible");
const plot = page => page.locator("[data-route-content] [data-record-slot=plot]:visible");
const bodyForm = page => page.locator("dialog:modal form[data-entry-form=body]:not([aria-busy=true])");
const closeEdit = page => page.locator("dialog:modal").last().getByRole("button", {name: /^关闭/}).first();

function assertReadingContinuity(frames, injected) {
  const target = frames.filter(frame => frame.kind === "nutrition" && frame.source === "paint");
  assert.ok(target.length > 2, "采到真实饮食页绘制帧");
  assert.ok(target.every(frame => frame.body), "整个切换期间饮食正文有可见内容");
  if (injected) assert.ok(target.some(frame => frame.handoff), "测到跨提交短暂使用同页外壳");
  const positions = target.filter(frame => frame.plotY !== null).map(frame => frame.plotY);
  assert.ok(positions.length > 2);
  assert.ok(Math.max(...positions) - Math.min(...positions) <= 1, "等待与实页共用图表位置");
}

function assertBackdrop(frames, desktop) {
  const closing = frames.filter(frame => frame.phase === "closing" || frame.phase === "closed");
  assert.ok(closing.some(frame => frame.phase === "closing"));
  assert.ok(closing.some(frame => frame.phase === "closed"), "采到浏览器顶层仍在的退场末态");
  assert.ok(closing.every(frame => frame.gradient === desktop), "身体遮罩保持设备对应的背景");
  for (let index = 1; index < closing.length; index++) {
    assert.ok(closing[index].shade <= closing[index - 1].shade + 0.016, "遮罩退场时不再变深");
  }
  assert.ok(closing.filter(frame => frame.phase === "closed").every(frame => frame.shade === 0), "卸载前遮罩已透明");
  assert.equal(frames.at(-1).shade, 0);
}

async function injectEmptyCommit(page) {
  await page.evaluate(() => {
    // 强制复现一个已撤下旧树、目标树还未显示的短空档。实际页面、路由和后续交互仍由浏览器运行。
    const observer = new MutationObserver(() => {
      const content = document.querySelector('main[data-workspace-frame="nutrition"] [data-route-content]');
      const next = content?.querySelector(":scope > [data-record-workspace]");
      if (!(next instanceof HTMLElement) || content.querySelector("[data-workspace-reading]")) return;
      observer.disconnect();
      const previous = next.style.display;
      next.style.display = "none";
      requestAnimationFrame(() => requestAnimationFrame(() => { next.style.display = previous; }));
    });
    observer.observe(document.body, {childList: true, subtree: true});
  });
}

try {
  const auth = await browser.newContext();
  await authenticateFixture(auth.request, config, process.env.FORMWARD_LOADING_CONFIG);
  const storageState = await auth.storageState();
  await auth.close();
  for (const phone of [true, false]) {
    const device = phone ? "phone" : "desktop";
    const viewport = phone ? {width: 390, height: 780} : {width: 1440, height: 900};
    const size = join(output, device);
    await mkdir(size, {recursive: true});
    const context = await browser.newContext({
      storageState, viewport, hasTouch: phone, isMobile: phone, reducedMotion: "no-preference",
      locale: "zh-CN", timezoneId: "Asia/Shanghai", recordVideo: {dir: size, size: viewport},
    });
    const errors = [];
    try {
      await context.addInitScript(installProbe, {theme: phone ? "light" : "dark"});
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      const press = locator => phone ? locator.tap() : locator.click();

      for (const injected of [false, true]) {
        await setDelay(0);
        await page.goto(config.baseURL + "/dashboard");
        await page.locator("[data-route-content] [data-metric-rail]:visible").waitFor();
        await setDelay(injected ? 700 : 0);
        if (injected) await injectEmptyCommit(page);
        await record(page, device + (injected ? " 模拟交接空档" : " 总览进入饮食"), async () => {
          await press(navigation(page, "饮食"));
          await page.waitForURL(url => url.pathname === "/dashboard/meals");
          if (injected) {
            await reading(page).waitFor();
            await page.screenshot({path: join(size, "meals-pending.png")});
          }
          await reading(page).waitFor({state: "hidden"});
          await plot(page).waitFor();
        }, frames => assertReadingContinuity(frames, injected));
        await page.screenshot({path: join(size, "meals-ready.png")});
      }
      await setDelay(0);

      async function openBody() {
        if (phone) {
          await page.goto(config.baseURL + "/dashboard");
          await page.locator("[data-route-content] [data-metric-rail]:visible").waitFor();
          await press(page.getByRole("link", {name: "记录测量", exact: true}));
        } else {
          await page.goto(config.baseURL + "/dashboard/measurements");
          const records = page.getByRole("region", {name: "最近记录", exact: true});
          await press(records.getByRole("button", {name: "编辑 " + config.today, exact: true}));
        }
        await bodyForm(page).waitFor();
        await page.locator(".pending-entry-fields").waitFor({state: "detached"});
        await page.locator("dialog[data-surface-phase=open]").waitFor();
      }

      await openBody();
      await page.screenshot({path: join(size, "body-open.png")});
      await record(page, device + " 身体关闭", async () => {
        await press(closeEdit(page));
        await bodyForm(page).waitFor({state: "detached"});
      }, frames => assertBackdrop(frames, !phone));
      await page.screenshot({path: join(size, "body-closed.png")});

      await openBody();
      const weight = bodyForm(page).getByLabel("晨间体重", {exact: true});
      await weight.fill("71.23");
      await press(closeEdit(page));
      const confirmation = page.getByRole("dialog", {name: "放弃尚未保存的输入？"});
      await confirmation.getByRole("button", {name: "继续编辑"}).click();
      assert.equal(await weight.inputValue(), "71.23", "返回编辑保留草稿");
      await press(closeEdit(page));
      await confirmation.getByRole("button", {name: "放弃修改"}).click();
      await bodyForm(page).waitFor({state: "detached"});

      await page.emulateMedia({reducedMotion: "reduce"});
      await openBody();
      await record(page, device + " 减少动态效果关闭", async () => {
        await press(closeEdit(page));
        await bodyForm(page).waitFor({state: "detached"});
      }, frames => {
        assert.ok(frames.every(frame => frame.phase !== "closing"));
        assert.equal(frames.at(-1).shade, 0);
      });
      assert.deepEqual(errors, []);
      const video = page.video();
      await context.close();
      if (video) {
        await video.saveAs(join(size, "activities.webm"));
        await video.delete();
      }
    } finally {
      await context.close();
    }
  }
  console.log(JSON.stringify({passed: true, engine, version: version.version, cases: results.length}));
} finally {
  await setDelay(0);
  await browser.close();
}
