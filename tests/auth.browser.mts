import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { provisionAccount } from "../src/features/auth/provision";
import * as schema from "../src/db/schema";

// 测试自带独立的内存 PostgreSQL，不读取或写入 .env.local 指向的真实数据库。
const pg = new PGlite();
const db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
const first = { email: "preview@example.test", password: "fictional-preview-password" };
const second = { email: "other@example.test", password: "fictional-other-password" };
await provisionAccount(db, first);
await provisionAccount(db, second);
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 });
await socket.start();
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const address = portProbe.address();
assert.ok(address && typeof address === "object");
const port = address.port;
await new Promise<void>((resolve) => portProbe.close(() => resolve()));
const baseURL = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: {
    ...process.env,
    DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`,
    BETTER_AUTH_SECRET: "fictional-browser-secret-at-least-32-characters",
    BETTER_AUTH_URL: baseURL,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout?.on("data", (chunk) => { logs += chunk; });
child.stderr?.on("data", (chunk) => { logs += chunk; });
let browser: { close: () => Promise<void> } | undefined;

async function stopChild(process: ChildProcess) {
  if (process.exitCode !== null || process.signalCode) return;
  process.kill("SIGTERM");
  const timeout = setTimeout(() => process.kill("SIGKILL"), 5000);
  await once(process, "exit");
  clearTimeout(timeout);
}

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      ready = (await fetch(`${baseURL}/api/auth/get-session`, { signal: AbortSignal.timeout(500) })).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "独立 production 测试服务启动成功");
  const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const chromium = playwright.chromium;
  const launched = await chromium.launch({ headless: true });
  browser = launched;
  const errors: string[] = [];
  let nextTestIP = 10;

  async function makePage(options: object = {}) {
    const context = await launched.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `192.0.2.${nextTestIP++}` }, ...options });
    await context.addInitScript(() => {
      const timings = { started: 0, ended: 0, dashboardRequested: 0 };
      Object.assign(window, { authAnimationTimings: timings });
      window.addEventListener("animationstart", (event) => { if (event.animationName === "final-presence") timings.started = performance.now(); }, true);
      window.addEventListener("animationend", (event) => { if (event.animationName === "final-presence") timings.ended = performance.now(); }, true);
      const originalFetch = window.fetch;
      window.fetch = (...args) => {
        if (String(args[0]).includes("/dashboard")) timings.dashboardRequested ||= performance.now();
        return originalFetch(...args);
      };
    });
    const page = await context.newPage();
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(baseURL);
    await page.waitForSelector('main[data-images-ready="true"]');
    await page.mouse.wheel(0, 80);
    await page.waitForSelector('main[data-phase="LOGIN_READY"]');
    return { context, page };
  }

  async function fill(page: Awaited<ReturnType<typeof makePage>>["page"], credentials = first) {
    await page.locator("#email").fill(credentials.email);
    await page.locator("#password").fill(credentials.password);
  }

  const unauthenticated = await launched.newContext();
  const guarded = await unauthenticated.newPage();
  await guarded.goto(`${baseURL}/dashboard`);
  assert.equal(new URL(guarded.url()).pathname, "/");
  await unauthenticated.close();
  console.log("通过：未登录不能直接访问主页。");

  const login = await makePage();
  await fill(login.page, { ...first, password: "fictional-wrong-password" });
  await login.page.locator('button[type="submit"]').click();
  await login.page.locator("#login-error").waitFor();
  assert.match(await login.page.locator("#login-error").textContent() || "", /邮箱或密码不正确/);
  assert.equal(new URL(login.page.url()).pathname, "/");
  assert.equal(await login.page.locator("main").getAttribute("data-phase"), "LOGIN_READY");
  assert.equal(await login.page.locator(".home-intro-backdrop").getAttribute("data-orbit-angle"), "150", "认证失败仍保留轨道终点");
  assert.equal(await login.page.locator(".home-intro-backdrop").evaluate((node: Element) => getComputedStyle(node).visibility), "visible");
  assert.equal(await login.page.locator(".body-frame-final").evaluate((node: Element) => Number(getComputedStyle(node).opacity)), 0);
  console.log("通过：错误密码保持 Frame 12，不播放最终动画，可以重试。");

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let submissions = 0;
  await login.page.route("**/api/auth/sign-in/email", async (route: { continue: () => Promise<void> }) => {
    submissions++;
    await held;
    await route.continue();
  });
  await fill(login.page);
  await login.page.locator('button[type="submit"]').click();
  await login.page.waitForSelector('main[data-phase="AUTHENTICATING"]');
  await login.page.locator("form.login-form").evaluate((form: Element) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await login.page.mouse.wheel(0, -100);
  assert.equal(submissions, 1);
  assert.equal(await login.page.locator("main").getAttribute("data-phase"), "AUTHENTICATING");
  assert.equal(await login.page.locator(".home-intro-backdrop").getAttribute("data-orbit-angle"), "150", "认证中轨道保持静止");
  assert.equal(await login.page.locator(".body-frame-final").evaluate((node: Element) => Number(getComputedStyle(node).opacity)), 0);
  release();
  await login.page.waitForSelector('main[data-phase="FINAL_TRANSITION"]');
  assert.equal(new URL(login.page.url()).pathname, "/");
  await login.page.waitForTimeout(200);
  const orbitOpacity = await login.page.locator(".home-intro-backdrop").evaluate((node: Element) => Number(getComputedStyle(node).opacity));
  assert.ok(orbitOpacity > 0 && orbitOpacity < 1, "认证成功后轨道随最终人物动画淡出");
  assert.equal(new URL(login.page.url()).pathname, "/", "700ms 动画尚未结束时不能提前导航");
  const combined = await login.page.evaluate(() => [...document.querySelectorAll("[data-intro-frame], .body-frame-final")].reduce((sum, node) => sum + Number(getComputedStyle(node).opacity), 0));
  assert.ok(Math.abs(combined - 1) < .05);
  await login.page.waitForURL("**/dashboard");
  const timings = await login.page.evaluate(() => (window as typeof window & { authAnimationTimings: { started: number; ended: number; dashboardRequested: number } }).authAnimationTimings);
  assert.ok(timings.ended - timings.started >= 650);
  assert.ok(timings.dashboardRequested >= timings.ended, "实际动画结束事件先于主页请求");
  assert.ok((await login.page.locator(".dashboard-account").textContent()).includes(first.email));
  await login.page.reload();
  assert.ok((await login.page.locator(".dashboard-account").textContent()).includes(first.email));
  console.log("通过：认证中拒绝重复提交和倒放，成功后完成 700ms 动画才进入主页，刷新保留登录。");

  const other = await makePage();
  await fill(other.page, second);
  await other.page.locator('button[type="submit"]').click();
  await other.page.waitForURL("**/dashboard");
  await other.page.goto(`${baseURL}/dashboard?user_id=first-account`);
  const otherContent = await other.page.locator(".dashboard-account").textContent();
  assert.ok(otherContent.includes(second.email));
  assert.ok(!otherContent.includes(first.email));
  await login.page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login.page.waitForURL(baseURL + "/");
  await login.page.goto(`${baseURL}/dashboard`);
  assert.equal(new URL(login.page.url()).pathname, "/");
  await other.page.reload();
  assert.ok((await other.page.locator(".dashboard-account").textContent()).includes(second.email));
  await other.context.close();
  await login.context.close();
  console.log("通过：两个账号会话隔离，退出撤销自己的会话，另一个账号继续可用。");

  const mobile = await makePage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await fill(mobile.page);
  await mobile.page.locator('button[type="submit"]').click();
  await mobile.page.waitForURL("**/dashboard");
  const reducedTimings = await mobile.page.evaluate(() => (window as typeof window & { authAnimationTimings: { started: number; ended: number; dashboardRequested: number } }).authAnimationTimings);
  assert.ok(reducedTimings.ended - reducedTimings.started >= 200 && reducedTimings.ended - reducedTimings.started < 650);
  assert.ok(reducedTimings.dashboardRequested >= reducedTimings.ended);
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mobile.page.screenshot({ path: "/tmp/formward-dashboard-mobile.png" });
  await mobile.context.close();
  console.log("通过：手机 reduced motion 完成 240ms 动画后跳转，主页不横向溢出。");
  assert.deepEqual(errors, []);

  if (process.env.FORMWARD_VISUAL_CHECK === "1") {
    const visual = spawn(process.execPath, ["tests/home-experience.browser.mjs"], { env: { ...process.env, FORMWARD_BASE_URL: baseURL }, stdio: "inherit" });
    const [code] = await once(visual, "exit");
    assert.equal(code, 0, "首页完整视觉与手势验收通过");
  }
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  await stopChild(child);
  await socket.stop();
  // Socket 包用 setImmediate 完成断连后的清理；先排空这些回调，再关闭 WASM 数据库。
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  await pg.close();
}
