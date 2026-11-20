import assert from "node:assert/strict";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {authenticateFixture} from "./fixture-auth.mjs";

const config = JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG, "utf8"));
assert.equal(config.isolatedFixture, true);
assert.equal(new URL(config.baseURL).hostname, "127.0.0.1");
const engine = process.env.FORMWARD_LOADING_ENGINE ?? "chromium";
const width = Number(process.env.FORMWARD_LOADING_PLOT_WIDTH ?? 390);
const mobile = width <= 700;
const viewport = {width, height: mobile ? 780 : 900};
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const browser = await playwright[engine].launch();
const output = resolve(process.env.FORMWARD_LOADING_ARTIFACTS ?? ".codex/workspace-loading", engine, "plots");
const version = (await (await fetch(config.baseURL + "/api/app-version")).json()).version;
const results = [];
const overview = {kind: "overview", name: "总览", path: "/dashboard"};
const routes = [
  {kind: "nutrition", name: "饮食", path: "/dashboard/meals"},
  {kind: "energy", name: "消耗", path: "/dashboard/energy"},
  {kind: "body", name: "身体", path: "/dashboard/measurements"},
];

async function setDelay(delayMs) {
  assert.equal((await fetch(config.delayControlURL, {method: "POST", body: JSON.stringify({delayMs})})).status, 200);
}

function installProbe({theme}) {
  localStorage.setItem("formward-theme", theme);
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
      const kind = main?.dataset.workspaceFrame;
      const plotSelector = kind === "overview" ? "[data-overview-plot]" : "[data-record-slot=plot]";
      const plot = [...(content?.querySelectorAll(plotSelector) ?? [])].find(visible);
      const visibleGuides = [...(plot?.querySelectorAll(selector) ?? [])].filter(visible);
      const guide = visibleGuides[0];
      const guides = !!guide;
      const sheen = guides ? getComputedStyle(guide, "::after") : null;
      const wait = guide?.getBoundingClientRect();
      const now = performance.now();
      const svg = [...(plot?.querySelectorAll("svg") ?? [])].find(visible);
      const real = !!svg?.querySelector("text") && !svg.closest("[data-workspace-reading]");
      const bounds = plot?.getBoundingClientRect();
      state.frames.push({
        time: now, kind,
        plot: bounds ? [bounds.x - horizontal(getComputedStyle(content)), bounds.y + scrollY, bounds.width, bounds.height] : null,
        guides, guideCount: visibleGuides.length, real, age: guide && mounted.has(guide) ? now - mounted.get(guide) : null,
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
const open = (page, label) => mobile ? navigation(page, label).tap() : navigation(page, label).click();
const guides = (page, kind) => page.locator('main[data-workspace-frame="' + kind + '"] [data-chart-loading-guides]:visible');
const plot = page => page.locator("[data-route-content] :is([data-record-slot=plot],[data-overview-plot]):visible");
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
  assert.ok(waiting.every(frame => frame.masked === 3 && frame.guideCount === (route.kind === "overview" ? 2 : 1)));
  assert.ok(waiting.every(frame => frame.age === null || frame.age >= 0));
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
    if (route.kind !== "overview") assert.ok(draw.length > 0);
    if (route.kind === "body") {
      const points = draw.filter(motion => motion.type === "point");
      const lines = draw.filter(motion => motion.type === "line");
      assert.ok(points.length && lines.length && points.every(point => point.start === 0 && point.duration === 180));
      assert.ok(lines.every(line => line.delay === 180 && line.duration === 420));
    } else if (route.kind !== "overview") {
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
    const context = await browser.newContext({viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: "no-preference",
      locale: "zh-CN", timezoneId: "Asia/Shanghai", storageState, recordVideo: {dir: folder, size: viewport}});
    try {
      await context.addInitScript(installProbe, {theme});
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      for (const route of routes) {
        await home(page);
        const fast = await capture(page, theme + "-" + route.kind + "-fast", async () => {
          await open(page, route.name);
          await ready(page, route);
        });
        stats.push(verify(fast, route, "fast"));

        await open(page, "总览");
        await page.waitForURL(url => url.pathname === "/dashboard");
        await page.locator("[data-route-content] [data-metric-rail]:visible").waitFor();
        await page.waitForTimeout(240);
        await setDelay(900);
        const cached = await capture(page, theme + "-" + route.kind + "-cached", async () => {
          await open(page, route.name);
          await ready(page, route);
        });
        stats.push(verify(cached, route, "cached"));

        await home(page);
        await setDelay(900);
        const slow = await capture(page, theme + "-" + route.kind + "-slow", async () => {
          await open(page, route.name);
          await guides(page, route.kind).waitFor();
          await page.waitForTimeout(640);
          await page.screenshot({path: join(folder, route.kind + "-waiting.png")});
          await ready(page, route);
        });
        stats.push(verify(slow, route, "slow"));
        await page.screenshot({path: join(folder, route.kind + "-ready.png")});
        if (!mobile && route.kind !== "body") {
          const wide = page.getByRole("button", {name: "90D", exact: true});
          await wide.click();
          await wide.and(page.locator('[aria-pressed="true"]')).waitFor();
          await plot(page).locator("svg text:visible").first().waitFor();
          assert.equal(await guides(page, route.kind).count(), 0);
          stats.push({label: theme + "-" + route.kind + "-90D", ready: true});
        }
      }

      await home(page);
      await setDelay(900);
      const rapid = await capture(page, theme + "-rapid", async () => {
        for (const route of routes) {
          await open(page, route.name);
          await guides(page, route.kind).waitFor();
        }
        await ready(page, routes[2]);
      });
      const finalFrames = rapid.frames.filter(frame => frame.kind === "body");
      assert.ok(finalFrames.length > 2 && finalFrames.at(-1).real && finalFrames.every(frame => frame.guides !== frame.real));
      assert.ok(rapid.motions.filter(motion => motion.type !== "page").every(motion => motion.kind === "body"), "只有最后一次切页绘制实图");
      stats.push({label: rapid.label, finalRoute: "/dashboard/measurements"});

      if (!mobile) {
        await setDelay(0);
        await page.goto(config.baseURL + "/dashboard/training");
        await page.locator("main[data-workspace-frame=training] [data-route-content]:visible").waitFor();
        await setDelay(1100);
        const overviewRead = await capture(page, theme + "-overview-slow", async () => {
          await open(page, overview.name);
          await guides(page, overview.kind).first().waitFor();
          assert.equal(await guides(page, overview.kind).count(), 2);
          await page.waitForTimeout(640);
          await page.screenshot({path: join(folder, "overview-waiting.png")});
          await ready(page, overview);
        });
        stats.push(verify(overviewRead, overview, "slow"));
        await page.screenshot({path: join(folder, "overview-ready.png")});
      }

      if (theme === "dark") {
        await page.emulateMedia({reducedMotion: "reduce"});
        await home(page);
        await setDelay(900);
        const reduced = await capture(page, "dark-reduced", async () => {
          await open(page, routes[2].name);
          await guides(page, routes[2].kind).waitFor();
          await page.waitForTimeout(530);
          await ready(page, routes[2]);
        });
        stats.push(verify(reduced, routes[2], "reduced"));
        await page.emulateMedia({reducedMotion: "no-preference"});
        if (!mobile) {
          await home(page);
          await setDelay(900);
          const setBroken = async broken => assert.equal((await fetch(config.fixtureControlURL + "/meals-failure", {
            method: "POST", body: JSON.stringify({broken}),
          })).status, 200);
          await setBroken(true);
          try {
            await open(page, routes[0].name);
            await guides(page, routes[0].kind).waitFor();
            await page.getByRole("alert").getByText("暂时无法读取页面，已保存的记录保持。请重试。", {exact: true}).waitFor();
            assert.equal(await guides(page, routes[0].kind).count(), 0);
            await page.screenshot({path: join(folder, "nutrition-failure.png")});
          } finally {
            await setBroken(false);
          }
          await setDelay(0);
          await page.getByRole("button", {name: "重新读取", exact: true}).click();
          await ready(page, routes[0]);
          assert.equal(await guides(page, routes[0].kind).count(), 0);
          stats.push({label: "dark-nutrition-retry", ready: true});
        }
      }

      const recording = page.video();
      await context.close();
      await recording.saveAs(join(folder, "navigation.webm"));
      await recording.delete();
    } finally {
      await context.close();
    }
  }
  await writeFile(join(output, "report.json"), JSON.stringify({version, engine, viewport, stats, passed: true}, null, 2));
  console.log(JSON.stringify({version, engine, cases: stats.length, passed: true}));
} finally {
  await setDelay(0);
  await browser.close();
}
