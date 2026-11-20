import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {authenticateFixture} from "./fixture-auth.mjs";

const config = JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG, "utf8"));
assert.equal(config.isolatedFixture, true);
assert.equal(new URL(config.baseURL).hostname, "127.0.0.1");
const engine = process.env.FORMWARD_LOADING_ENGINE ?? "chromium";
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const browser = await playwright[engine].launch();
const output = resolve(process.env.FORMWARD_LOADING_ARTIFACTS ?? ".codex/workspace-loading", engine, "plots");
const version = (await (await fetch(config.baseURL + "/api/app-version")).json()).version;
const results = [];
const routes = [
  {kind: "nutrition", name: "饮食", path: "/dashboard/meals"},
  {kind: "energy", name: "消耗", path: "/dashboard/energy"},
  {kind: "body", name: "身体", path: "/dashboard/measurements"},
];

async function setDelay(delayMs) {
  assert.equal((await fetch(config.delayControlURL, {method: "POST", body: JSON.stringify({delayMs})})).status, 200);
}

function installProbe({theme, user}) {
  localStorage.setItem("formward-theme", theme);
  for (const kind of ["meals", "body", "energy", "training"]) {
    localStorage.setItem("formward:record-guide:v1:" + encodeURIComponent(user) + ":" + kind, "seen");
  }
  window.plotProbe = {active: false, frames: [], motions: []};
  const selector = "[data-chart-loading-guides]";
  const mounted = new WeakMap();
  new MutationObserver(records => {
    let time;
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      const guides = node.matches(selector) ? [node] : node.querySelectorAll(selector);
      for (const guide of guides) mounted.set(guide, time ??= performance.now());
    }
  }).observe(document, {subtree: true, childList: true});
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    if (window.plotProbe.active) {
      const type = this.matches("[data-workspace-content]") ? "page"
        : this.matches("[data-chart-bar]") ? "bar" : this.matches("[data-chart-point]") ? "point"
          : this.matches("[data-chart-line]") ? "line" : null;
      if (type) window.plotProbe.motions.push({
        type, time: performance.now(), kind: this.closest("[data-workspace-frame]")?.dataset.workspaceFrame,
        duration: options?.duration, delay: options?.delay ?? 0,
        start: type === "bar" ? frames[0].transform : frames[0].opacity,
      });
    }
    return animate.call(this, frames, options);
  };
  const visible = node => node && node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== "hidden";
  const horizontal = style => style.transform === "none" ? 0 : new DOMMatrixReadOnly(style.transform).m41;

  function frame() {
    const state = window.plotProbe;
    if (state.active) {
      const main = document.querySelector("main[data-workspace-frame]");
      const content = main?.querySelector("[data-workspace-content]");
      const plot = [...(content?.querySelectorAll("[data-record-slot=plot]") ?? [])].find(visible);
      const guide = plot?.querySelector(selector);
      const guides = !!visible(guide);
      const sheen = guides ? getComputedStyle(guide, "::after") : null;
      const wait = guide?.getBoundingClientRect();
      const now = performance.now();
      const svg = [...(plot?.querySelectorAll("svg") ?? [])].find(visible);
      const real = !!svg?.querySelector("text") && !svg.closest("[data-workspace-reading]");
      const bounds = plot?.getBoundingClientRect();
      state.frames.push({
        time: now, kind: main?.dataset.workspaceFrame,
        plot: bounds ? [bounds.x - horizontal(getComputedStyle(content)), bounds.y + scrollY, bounds.width, bounds.height] : null,
        guides, real, age: guide && mounted.has(guide) ? now - mounted.get(guide) : null,
        swept: !!sheen && sheen.content !== "none" && horizontal(sheen) > -.65 * wait.width + .75,
        delay: sheen?.animationDelay ?? null,
        masked: guides && (getComputedStyle(guide).maskImage.match(/linear-gradient/g)?.length ?? 0),
      });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const navigation = (page, label) => page.getByRole("navigation", {name: "主导航", exact: true}).getByRole("link", {name: label, exact: true});
const guides = (page, kind) => page.locator('main[data-workspace-frame="' + kind + '"] [data-chart-loading-guides]:visible');
const plot = page => page.locator("[data-route-content] [data-record-slot=plot]:visible");
const loaded = page => page.locator("[data-route-content] [data-record-workspace]:not([data-workspace-reading] [data-record-workspace]):visible");
async function ready(page, route) {
  await page.waitForURL(url => url.pathname === route.path);
  await loaded(page).waitFor();
  await plot(page).locator("svg text:visible").first().waitFor();
}
async function home(page) {
  await setDelay(0);
  await page.goto(config.baseURL + "/dashboard");
  await page.locator("[data-route-content] [data-metric-rail]:visible").waitFor();
}
async function capture(page, label, action) {
  await page.evaluate(() => { window.plotProbe = {active: true, frames: [], motions: []}; });
  try {
    await action();
    await page.waitForTimeout(680);
  } finally {
    const data = await page.evaluate(() => {
      window.plotProbe.active = false;
      return window.plotProbe;
    });
    results.push({label, ...data});
    await writeFile(join(output, "frames.json"), JSON.stringify({version, engine, results}));
  }
  return results.at(-1);
}
function verify(data, route, mode) {
  const frames = data.frames.filter(frame => frame.kind === route.kind);
  assert.ok(frames.length > 2 && frames.at(-1).real, data.label + " 实图可见");
  assert.ok(frames.every(frame => frame.plot && frame.guides !== frame.real), data.label + " 每帧都有占位或实图");
  const first = frames[0].plot;
  const drift = Math.max(...frames.flatMap(frame => frame.plot.map((value, index) => Math.abs(value - first[index]))));
  assert.ok(drift <= 1.01, data.label + " 图框四边偏差 " + drift);
  const waiting = frames.filter(frame => frame.guides);
  assert.ok(waiting.every(frame => frame.masked === 3));
  const pageMotion = data.motions.filter(motion => motion.kind === route.kind && motion.type === "page");
  const draw = data.motions.filter(motion => motion.kind === route.kind && motion.type !== "page");
  assert.equal(pageMotion.length, mode === "reduced" ? 0 : 1, data.label + " 正文转场次数");

  if (mode === "cached") {
    assert.equal(waiting.length, 0, data.label + " 同条件缓存直接看到实图");
    assert.equal(draw.length, 0, data.label + " 缓存图形没有再次入场");
  } else if (mode === "reduced") {
    assert.ok(waiting.length > 0 && waiting.every(frame => !frame.swept));
    assert.equal(draw.length, 0, data.label + " 减少动态效果");
  } else if (mode === "fast" || mode === "slow") {
    if (mode === "slow") {
      assert.ok(waiting.some(frame => !frame.swept), data.label + " 先出现静态细线");
      assert.ok(waiting.some(frame => frame.swept), data.label + " 慢读可见扫光");
    }
    assert.ok(waiting.every(frame => frame.delay === "0.35s")
      && waiting.filter(frame => frame.swept).every(frame => frame.age === null || frame.age >= 325),
      data.label + " 扫光延迟 350ms");
    assert.ok(draw.length > 0);
    if (route.kind === "body") {
      const points = draw.filter(motion => motion.type === "point");
      const lines = draw.filter(motion => motion.type === "line");
      assert.ok(points.length && lines.length && points.every(point => point.start === 0 && point.duration === 180));
      assert.ok(lines.every(line => line.delay === 180 && line.duration === 420));
    } else {
      assert.ok(draw.every(bar => bar.type === "bar" && bar.duration === 400 && bar.start === "scaleY(0)" && bar.delay === 0));
    }
  }
  return {label: data.label, guideFrames: waiting.length, sweepFrames: waiting.filter(frame => frame.swept).length, drift};
}

try {
  const stats = [];
  await mkdir(output, {recursive: true});
  const auth = await browser.newContext();
  await authenticateFixture(auth.request, config, process.env.FORMWARD_LOADING_CONFIG);
  const storageState = await auth.storageState();
  await auth.close();
  for (const theme of ["dark", "light"]) {
    const folder = join(output, theme);
    await mkdir(folder, {recursive: true});
    const viewport = {width: 390, height: 780};
    const context = await browser.newContext({viewport, isMobile: true, hasTouch: true, reducedMotion: "no-preference",
      locale: "zh-CN", timezoneId: "Asia/Shanghai", storageState, recordVideo: {dir: folder, size: viewport}});
    try {
      await context.addInitScript(installProbe, {theme, user: config.userId});
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      for (const route of routes) {
        await home(page);
        const fast = await capture(page, theme + "-" + route.kind + "-fast", async () => {
          await navigation(page, route.name).tap();
          await ready(page, route);
        });
        stats.push(verify(fast, route, "fast"));

        await navigation(page, "总览").tap();
        await page.waitForURL(url => url.pathname === "/dashboard");
        await page.locator("[data-route-content] [data-metric-rail]:visible").waitFor();
        await page.waitForTimeout(240);
        await setDelay(900);
        const cached = await capture(page, theme + "-" + route.kind + "-cached", async () => {
          await navigation(page, route.name).tap();
          await ready(page, route);
        });
        stats.push(verify(cached, route, "cached"));

        await home(page);
        await setDelay(900);
        const slow = await capture(page, theme + "-" + route.kind + "-slow", async () => {
          await navigation(page, route.name).tap();
          await guides(page, route.kind).waitFor();
          await page.waitForTimeout(640);
          await page.screenshot({path: join(folder, route.kind + "-waiting.png")});
          await ready(page, route);
        });
        stats.push(verify(slow, route, "slow"));
        await page.screenshot({path: join(folder, route.kind + "-ready.png")});
      }

      await home(page);
      await setDelay(900);
      const rapid = await capture(page, theme + "-rapid", async () => {
        for (const route of routes) {
          await navigation(page, route.name).tap();
          await guides(page, route.kind).waitFor();
        }
        await ready(page, routes[2]);
      });
      const finalFrames = rapid.frames.filter(frame => frame.kind === "body");
      assert.ok(finalFrames.length > 2 && finalFrames.at(-1).real && finalFrames.every(frame => frame.guides !== frame.real));
      assert.ok(rapid.motions.filter(motion => motion.type !== "page").every(motion => motion.kind === "body"), "只有最后一次切页绘制实图");
      stats.push({label: rapid.label, finalRoute: "/dashboard/measurements"});

      if (theme === "dark") {
        await page.emulateMedia({reducedMotion: "reduce"});
        await home(page);
        await setDelay(900);
        const reduced = await capture(page, "dark-reduced", async () => {
          await navigation(page, routes[2].name).tap();
          await guides(page, routes[2].kind).waitFor();
          await page.waitForTimeout(530);
          await ready(page, routes[2]);
        });
        stats.push(verify(reduced, routes[2], "reduced"));
      }

      const recording = page.video();
      await context.close();
      await recording.saveAs(join(folder, "navigation.webm"));
      await recording.delete();
    } finally {
      await context.close();
    }
  }
  await writeFile(join(output, "report.json"), JSON.stringify({version, engine, stats, passed: true}, null, 2));
  console.log(JSON.stringify({version, engine, cases: stats.length, passed: true}));
} finally {
  await setDelay(0);
  await browser.close();
}
