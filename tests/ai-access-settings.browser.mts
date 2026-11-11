import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createAuth } from "../src/features/auth/auth";
import { authenticateAi } from "../src/features/auth/ai-tokens";
import { requireOauthConnection } from "../src/features/auth/oauth-connections";
import { seedAiAccessFixture, fixtureAiConnection } from "./ai-access-fixture";
import { delayedTrainingDatabase } from "./training-delayed-db";

const artifacts = resolve(process.env.FORMWARD_AI_ACCESS_ARTIFACTS ?? ".codex/ai-access/browser");
await mkdir(artifacts, { recursive: true });
const pg = new PGlite(), local = drizzle(pg, { schema }), db = local as unknown as Database;
await migrate(local, { migrationsFolder: "./drizzle" });
const fixture = await seedAiAccessFixture(db);
const socket = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 }); await socket.start();
const delayed = await delayedTrainingDatabase(socket.getServerConn(), /\b(ai_tokens|oauth_connections|measurement_operations|meal_operations|record_operations)\b/i);
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening"); const port = (probe.address() as { port: number }).port;
await new Promise<void>(done => probe.close(() => done()));
const baseURL = `http://127.0.0.1:${port}`, secret = "fictional-ai-access-browser-secret-more-than-32";
const auth = createAuth(db, { baseURL, secret, rateLimit: false });
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: `postgresql://postgres:postgres@${delayed.connection}/postgres?max=1`, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: secret, FORMWARD_REGIONAL: "0", FORMWARD_SINGLE_WEB: "0", FORMWARD_TIMEZONE: "Asia/Shanghai" }, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = ""; child.stdout?.on("data", value => serverLog += value); child.stderr?.on("data", value => serverLog += value);
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const engine = process.env.FORMWARD_AI_ACCESS_BROWSER ?? "chromium";
const browser = await playwright[engine].launch({ headless: true });
const errors: string[] = [], failures: string[] = [], checks: string[] = [], screenshots: string[] = [], layout: unknown[] = [];
type Context = Awaited<ReturnType<typeof browser.newContext>>;
type Page = Awaited<ReturnType<Context["newPage"]>>;
async function login(account: { email: string; password: string }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Shanghai", reducedMotion: "reduce" });
  // tsx 的 keepNames 辅助函数只服务于测试回调序列化，不进入应用。
  await context.addInitScript({ content: "window.__name = (target) => target;" });
  const response = await auth.handler(new Request(baseURL + "/api/auth/sign-in/email", { method: "POST", headers: { Origin: baseURL, "Content-Type": "application/json" }, body: JSON.stringify(account) }));
  assert.equal(response.status, 200);
  await context.addCookies(response.headers.getSetCookie().map(value => { const [name, ...rest] = value.split(";")[0].split("="); return { name, value: rest.join("="), url: baseURL, httpOnly: true, sameSite: "Lax" as const }; }));
  const page = await context.newPage(); page.on("pageerror", (error: Error) => errors.push(error.message));
  page.on("response", (response: { status(): number; url(): string }) => { if (response.status() >= 500) failures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return { context, page };
}
async function open(page: Page) { await page.goto(baseURL + "/dashboard/ai"); await page.locator("[data-ai-access-ready]:visible").waitFor(); await page.waitForLoadState("networkidle"); const reminder = page.getByRole("button", { name: "关闭提醒", exact: true }); if (await reminder.isVisible()) await reminder.click(); }
async function shot(page: Page, name: string) { const file = `${engine}-${name}.png`; await page.screenshot({ path: join(artifacts, file), animations: "disabled" }); screenshots.push(file); }
async function fit(page: Page) {
  const result = await page.evaluate(() => {
    const roots = [...document.querySelectorAll("[data-ai-access],[data-ai-panel]")].filter(node => node.checkVisibility());
    const nodes = [...new Set(roots.flatMap(root => [...root.querySelectorAll("summary,button,input,select")]))].filter(node => node.checkVisibility());
    const controls = nodes.map(node => ({ label: node.textContent?.trim() || node.getAttribute("aria-label"), height: node.getBoundingClientRect().height, font: parseFloat(getComputedStyle(node).fontSize), tag: node.tagName }));
    const tables = roots.flatMap(root => [...root.querySelectorAll("table")]).filter(node => node.checkVisibility()).map(node => ({ width: node.getBoundingClientRect().width, columnGap: getComputedStyle(node.querySelector("td")!).paddingRight, rowBottom: getComputedStyle(node.querySelector("td")!).paddingBottom, rows: [...node.querySelectorAll("tbody tr")].map(row => [...row.children].map(cell => ({ x: cell.getBoundingClientRect().x, y: cell.getBoundingClientRect().y, height: cell.getBoundingClientRect().height, text: cell.textContent }))) }));
    const collisions = [...document.querySelectorAll("[data-ai-provider]")].flatMap(node => {
      const identity = [...node.querySelectorAll("h2,[data-state],h2~span")].filter(item=>item.checkVisibility());
      const actions = [...node.querySelectorAll("button")].filter(item=>item.checkVisibility());
      return identity.flatMap(label => actions.flatMap(button => { const a=label.getBoundingClientRect(),b=button.getBoundingClientRect(); return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1 ? [label.textContent+" / "+button.textContent] : []; }));
    });
    const sectionHeading=document.querySelector("[data-ai-submissions] h2"), filters=document.querySelector("[data-ai-submissions] select");
    if(sectionHeading && filters) { const a=sectionHeading.getBoundingClientRect(),b=filters.getBoundingClientRect(); if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) collisions.push("分区标题 / 筛选"); }
    const providers = [...document.querySelectorAll("[data-ai-provider]")].map(node => ({ name: node.querySelector("h2")!.textContent, font: getComputedStyle(node.querySelector("h2")!).fontSize, weight: getComputedStyle(node.querySelector("h2")!).fontWeight, height: node.querySelector("[data-ai-anchor]")!.getBoundingClientRect().height }));
    const records = [...document.querySelectorAll("[data-ai-submissions] li")].map(node => ({ height: node.getBoundingClientRect().height, text: node.textContent, font: getComputedStyle(node).fontSize }));
    return { overflow: document.documentElement.scrollWidth > innerWidth, controls, tables, providers, records, collisions };
  });
  assert.equal(result.overflow, false, "页面不得横向溢出");
  assert.deepEqual(result.collisions, [], "AI名称／状态不得与操作重叠");
  assert.ok(result.controls.every((control: { height: number }) => control.height >= 43.9), "所有可见操作至少44px");
  assert.ok(result.controls.filter((control: { tag: string }) => ["INPUT", "SELECT"].includes(control.tag)).every((control: { font: number }) => control.font >= 16));
  layout.push({ viewport: page.viewportSize(), result });
  return result;
}
const panel = (page: Page) => page.locator("[data-ai-panel]:visible");
async function closePanel(page: Page) { await page.getByRole("button", { name: "关闭连接面板", exact: true }).click(); await panel(page).waitFor({ state: "hidden" }); }
async function records(page: Page) { if (await page.locator("[data-ai-submissions]").getAttribute("data-open") !== "true") await page.getByRole("button", { name: "AI 提交记录", exact: true }).click(); }
async function doubleText(page: Page) { await page.evaluate(() => { const roots = [...document.querySelectorAll("[data-ai-access],[data-ai-panel],.mobile-page-name")]; const nodes = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll("*")]))].filter(node => !node.hasAttribute("data-ai-text-doubled")); const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize)); nodes.forEach((node, index) => { (node as HTMLElement).style.fontSize = sizes[index] * 2 + "px"; node.setAttribute("data-ai-text-doubled", ""); }); }); }
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(baseURL)).status === 200) break; } catch {} if (attempt === 99) throw Error("隔离服务未启动"); await new Promise(done => setTimeout(done, 200)); }
  const { context, page } = await login(fixture.account);
  const empty = await login(fixture.empty), typical = await login(fixture.typical);
  if (process.env.FORMWARD_AI_ACCESS_LOADING_ONLY !== "1") {
    await open(page);
    assert.equal(await page.locator("[data-ai-submissions]").getAttribute("data-open"), "false");
    assert.equal(await page.locator("table:visible").count(), 0, "权限默认收起");
    assert.equal(await page.getByLabel("令牌名称", { exact: true }).isVisible(), false);
    assert.equal(await page.getByRole("heading", { name: "AI 连接", exact: true }).count(), 0);
    assert.deepEqual(await page.locator("[data-ai-provider] h2").allTextContents(), ["ChatGPT", "豆包"]);
    const permissionTrigger = page.getByRole("button", { name: /^ChatGPT权限/ });
    await permissionTrigger.click();
    const partial = panel(page).locator(`[data-connection-id="${fixture.gpt.id}"]`);
    assert.deepEqual(await partial.locator("tbody tr").nth(1).locator("td").allTextContents(), ["查询未授权", "提交预览未授权"]);
    assert.equal(await panel(page).locator("table").count(), 2, "多连接分别显示授权");
    assert.equal(await panel(page).getByText("只读 · 可查询已授权数据", { exact: true }).isVisible(), true);
    await fit(page); assert.equal(await panel(page).locator("h2").evaluate((node:Element) => getComputedStyle(node).fontSize), "16px"); await shot(page, "permissions-desktop");
    assert.ok((await page.getByRole("button", { name: "ChatGPT连接详情", exact:true }).boundingBox())!.width < 100, "焦点范围紧贴次级控件");
    const dimensions = await panel(page).boundingBox(); assert.ok(dimensions!.width <= 440.1);
    await page.keyboard.press("Escape"); assert.equal(await permissionTrigger.evaluate((node: Element) => document.activeElement === node), true);
    await records(page); const history = page.locator("[data-ai-submissions]");
    assert.equal(await history.locator("li").count(), 7); assert.ok(!(await history.textContent())!.includes("初始化"));
    await page.getByLabel("筛选发起来源").selectOption("doubao"); assert.equal(await history.locator("li").count(), 2);
    await page.getByLabel("筛选发起来源").selectOption("chatgpt"); await page.getByLabel("筛选审核状态").selectOption("confirmed");
    assert.equal(await history.getByText("没有符合筛选条件的提交。", { exact: true }).isVisible(), true);
    await page.getByLabel("筛选发起来源").selectOption("all"); assert.equal(await history.locator("li").count(), 1);
    await page.getByLabel("筛选审核状态").selectOption("pending"); await page.getByLabel("筛选发起来源").selectOption("chatgpt");
    await history.locator("li a").first().click(); await page.waitForURL(new RegExp("/dashboard/ai/operations/")); await page.waitForLoadState("networkidle");
    await page.getByText("审核信息与刷新", { exact: true }).click(); assert.match((await page.getByText(/提交于/).textContent())!, /2026/);
    await page.goBack(); await page.locator("[data-ai-access-ready]:visible").waitFor(); await page.waitForLoadState("networkidle");
    checks.push("权限默认收起、多连接独立授权、只读、部分授权、紧凑浮层、双筛选、来源、审核时间与返回");
    await page.getByRole("button", { name: "豆包连接详情", exact: true }).click();
    const doubao = panel(page).locator(`[data-connection-id="${fixture.doubao.id}"]`);
    await doubao.getByRole("button", { name: "撤销连接", exact: true }).click(); await page.getByRole("button", { name: "取消", exact: true }).click();
    await requireOauthConnection(db, fixture.userId, fixture.doubao.id);
    const failOnce = async (route: { request(): { method(): string }; abort(): Promise<void>; continue(): Promise<void> }) => { if (route.request().method() === "POST") await route.abort(); else await route.continue(); };
    await page.route("**/dashboard/ai", failOnce);
    await doubao.getByRole("button", { name: "撤销连接", exact: true }).click(); await page.locator("dialog[open]").getByRole("button", { name: "撤销连接", exact: true }).click();
    await page.getByText("操作未完成，请稍后重试。", { exact: true }).waitFor(); await requireOauthConnection(db, fixture.userId, fixture.doubao.id); await page.unroute("**/dashboard/ai", failOnce);
    await fit(page); await shot(page, "revoke-failure");
    await doubao.getByRole("button", { name: "撤销连接", exact: true }).click(); await page.locator("dialog[open]").getByRole("button", { name: "撤销连接", exact: true }).click();
    await page.getByText("连接已撤销。", { exact: true }).waitFor(); await assert.rejects(requireOauthConnection(db, fixture.userId, fixture.doubao.id), /撤销/);
    await closePanel(page); await open(page);
    assert.equal(await page.locator('[data-ai-provider="doubao"]').getByText("已撤销", { exact: true }).isVisible(), true);
    await page.getByRole("button", { name: /^豆包权限/ }).click(); assert.equal(await panel(page).getByRole("table", { name: "豆包可申请权限", exact: true }).isVisible(), true); await closePanel(page);
    checks.push("撤销取消、网络失败原处重试、实际Server Action、即时鉴权失效、刷新历史与重新接入");
    await page.locator("[data-ai-anchor=advanced]").click();
    await page.getByLabel("令牌名称", { exact: true }).fill("虚构新建令牌"); await page.getByRole("button", { name: "创建令牌", exact: true }).click();
    const raw = page.getByLabel("新令牌原文", { exact: true }); await raw.waitFor(); const token = await raw.inputValue();
    assert.match(token, /^fw_ai_/); await authenticateAi(db, "Bearer " + token, true);
    assert.equal(await page.getByLabel("新建令牌，仅显示一次").evaluate((node: Element) => node === document.activeElement), true);
    await page.locator("[data-ai-anchor=advanced]").click(); await page.locator("[data-ai-anchor=advanced]").click(); assert.equal(await page.getByLabel("新令牌原文").count(), 0);
    assert.ok(!(await page.content()).includes(token)); checks.push("手动令牌创建、鉴权、一次性原文聚焦与关闭清除");
    await fixtureAiConnection(db, fixture.userId, "虚构的特别长的客户端名称用于验证手机与电脑完整自然换行 Long client name for layout verification");
    for (const theme of ["light", "dark"]) for (const [width, height] of [[320, 560], [390, 560], [390, 640], [430, 780], [844, 390], [1100, 780], [1440, 900]]) {
      await typical.page.setViewportSize({ width, height }); await open(typical.page); await typical.page.evaluate((value: string) => { document.documentElement.dataset.theme = value; }, theme);
      const heading = typical.page.getByRole("heading", { name: "AI 接入", exact: true }); assert.equal(await heading.count(), 1, "只显示一个页面标题");
      assert.equal(await heading.evaluate((node: Element) => parseFloat(getComputedStyle(node).fontSize)), width <= 700 ? 24 : 28);
      let result = await fit(typical.page); assert.ok(result.providers.every((row: { font: string; weight: string }) => row.font === "18px" && row.weight === "600"));
      assert.ok(result.providers.every((row: { height: number }) => row.height <= 64.1), `正常AI行保持64px: ${JSON.stringify(result.providers)}`);
      await shot(typical.page, `${theme}-${width}x${height}-collapsed`);
      await records(typical.page); result = await fit(typical.page);
      assert.ok(result.records.every((row: { height: number }) => row.height <= 48.1), `普通记录保持单行48px: ${JSON.stringify(result.records)}`);
      await shot(typical.page, `${theme}-${width}x${height}-records`);
      assert.ok(result.controls.filter((row:{tag:string;label:string}) => row.tag === "BUTTON").every((row:{label:string;font:number}) => row.font === (row.label === "AI 提交记录" ? 16 : 14)), "明确分区与操作字号");
      assert.ok(result.records.every((row:{font:string}) => row.font === "14px"));
      if (width >= 1100) { const starts = await typical.page.locator("[data-ai-provider] button[aria-label*=权限]").evaluateAll((nodes:Element[])=>nodes.map(node=>node.getBoundingClientRect().x)); assert.ok(Math.max(...starts)-Math.min(...starts)<1, "两行权限入口共用列宽"); }
      if (width === 390 && height === 640) { await typical.page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight)); await shot(typical.page, `${theme}-390-records-bottom`); }

      await typical.page.getByRole("button", { name: /^豆包权限/ }).click();
      const table = panel(typical.page).locator("table"); const columns = await table.locator("tbody tr").first().locator("th,td").evaluateAll((nodes: Element[]) => nodes.map(node => node.getBoundingClientRect().y));
      assert.ok(Math.max(...columns) - Math.min(...columns) <= 1, "正常字号保持权限三列同排");
      await fit(typical.page); if ([390,1440].includes(width)) await shot(typical.page, `${theme}-${width}-permissions`);
      if (width === 390) { await typical.page.keyboard.press("Escape"); await panel(typical.page).waitFor({state:"hidden"}); assert.equal(await typical.page.getByRole("button", {name:/^豆包权限/}).evaluate((node:Element)=>node===document.activeElement), true); } else await closePanel(typical.page);
    }
    for (const [width,height,name] of [[1662,946,"reference-desktop"],[390,845,"reference-mobile"]] as const) {
      await typical.page.setViewportSize({width,height}); await open(typical.page); await typical.page.evaluate(()=>document.documentElement.dataset.theme="light"); await records(typical.page); await shot(typical.page,name);
    }
    for (const [target, name] of [[empty, "empty"], [{ page, context }, "multiple-long"]] as const) for (const width of [320, 390, 1440]) {
      await target.page.setViewportSize({ width, height: 780 }); await open(target.page); await records(target.page); await fit(target.page); await shot(target.page, `${name}-${width}`);
      if (name === "multiple-long" && width === 320) { await page.locator("[data-ai-anchor=advanced]").click(); await page.getByRole("heading", { name: /虚构的特别长的客户端名称/ }).scrollIntoViewIfNeeded(); await fit(page); await shot(page, "advanced-long-name-320"); }

    }
    for (const width of [320, 390, 1440]) {
      await typical.page.setViewportSize({ width, height: 780 }); await open(typical.page); await records(typical.page); await doubleText(typical.page);
      await fit(typical.page); await shot(typical.page, `text-200-${width}`); await typical.page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight)); await shot(typical.page, `text-200-${width}-bottom`);
      await typical.page.getByRole("button", { name: /^豆包权限/ }).click(); await doubleText(typical.page); await fit(typical.page); await shot(typical.page, `text-200-${width}-permissions`); await closePanel(typical.page);
    }
    for (const target of [empty, {page}]) {
      await target.page.setViewportSize({width:320,height:780}); await open(target.page); await records(target.page); await doubleText(target.page); await fit(target.page); await shot(target.page, target === empty ? "empty-text-200-320" : "multiple-text-200-320");
    }
    await typical.page.setViewportSize({width:390,height:640}); await open(typical.page); await typical.page.getByRole("button", {name:"豆包连接详情",exact:true}).click();
    await panel(typical.page).getByRole("button",{name:"撤销连接",exact:true}).click(); await typical.page.getByRole("button",{name:"取消",exact:true}).click();
    await typical.page.route("**/dashboard/ai",failOnce); await panel(typical.page).getByRole("button",{name:"撤销连接",exact:true}).click(); await typical.page.getByRole("dialog",{name:"撤销 豆包 · Formward 连接",exact:true}).getByRole("button",{name:"撤销连接",exact:true}).click();
    await panel(typical.page).getByText("操作未完成，请稍后重试。",{exact:true}).waitFor(); await typical.page.unroute("**/dashboard/ai",failOnce); await shot(typical.page,"mobile-revoke-failure"); await closePanel(typical.page);
    await empty.page.setViewportSize({ width: 1440, height: 900 }); await open(empty.page);
    const chatgpt = empty.page.locator('[data-ai-provider="chatgpt"]'); await chatgpt.getByRole("button", { name: "接入", exact: true }).click();
    await panel(empty.page).getByRole("button", { name: "复制 MCP 地址", exact: true }).click(); await panel(empty.page).locator('[role="status"],[role="alert"]').first().waitFor();
    await panel(empty.page).getByRole("button", { name: "复制授权指令", exact: true }).focus(); await empty.page.keyboard.press("Escape");
    assert.equal(await chatgpt.getByRole("button", { name: "接入", exact: true }).evaluate((node: Element) => node === document.activeElement), true);
    await empty.page.keyboard.press("Tab"); assert.equal(await chatgpt.getByRole("button", { name: "ChatGPT连接详情", exact: true }).evaluate((node: Element) => node === document.activeElement), true);
    checks.push("双主题七种视口、28/24/18/16/14px层级、64px AI行、48px单行记录、权限三列、空账号、多连接、长名称、200%自然换行、复制、键盘焦点与手机底部面板");
  }
  if (process.env.FORMWARD_AI_ACCESS_LOADING_ONLY !== "1") {
    await typical.page.emulateMedia({reducedMotion:"no-preference"});
    for (const width of [1440,390]) {
      await typical.page.setViewportSize({width,height:780}); await open(typical.page); await typical.page.getByRole("button",{name:/^豆包权限/}).click();
      const timing = await panel(typical.page).evaluate((node:Element) => { const surface = node.closest("dialog") ?? node; return { css:getComputedStyle(surface).animationDuration, durations:surface.getAnimations().map(animation=>animation.effect?.getTiming().duration) }; });
      if (width === 1440) assert.equal(timing.css,"0.16s"); else assert.ok(timing.durations.includes(160),"底部面板沿用160ms开合");
      await typical.page.keyboard.press("Escape"); await panel(typical.page).waitFor({state:"hidden"});
    }
    await typical.page.emulateMedia({reducedMotion:"reduce"});
    checks.push("正常动态效果：桌面与手机160ms开合；减少动态效果即时交接");
  }
  // 真实查询延迟；首帧必须已经存在两个AI位置，不跳过缺失锚点。
  const frames: { time: number; ready: boolean; anchors: { key: string; x: number; y: number }[] }[] = [];
  await typical.page.setViewportSize({ width: 390, height: 640 });
  await typical.page.addInitScript(() => {
    (window as unknown as { aiFrames: unknown[] }).aiFrames = [];
    const start = performance.now(); function record() {
      const root = [...document.querySelectorAll("[data-ai-access]")].find(node => node.checkVisibility());
      if (root) (window as unknown as { aiFrames: unknown[] }).aiFrames.push({ time: performance.now() - start, ready: root.hasAttribute("data-ai-access-ready"), anchors: [...root.querySelectorAll("[data-ai-anchor],h2")].filter(node => node.checkVisibility() && (node.hasAttribute("data-ai-anchor") || ["ChatGPT","豆包"].includes(node.textContent ?? ""))).map(node => { const box = node.getBoundingClientRect(); return { key: node.getAttribute("data-ai-anchor") ?? "name:" + node.textContent, x: box.x, y: box.y }; }) });
      if (performance.now() - start < 12000) requestAnimationFrame(record);
    } requestAnimationFrame(record);
  });
  for (const [width,height] of [[320,640],[390,640],[1440,900]]) for (const wait of [0, 220]) {
    await typical.page.setViewportSize({width,height});
    await fetch(delayed.controlURL, { method: "POST", body: JSON.stringify({ delayMs: wait }) });
    await typical.page.goto(baseURL + "/dashboard/ai", { waitUntil: "commit" });
    await typical.page.locator("[data-ai-access]:visible").waitFor(); await shot(typical.page, `loading-${width}-${wait}-first`);
    await typical.page.locator("[data-ai-access-ready]:visible").waitFor(); await typical.page.waitForTimeout(100);
    const sequence: typeof frames = await typical.page.evaluate(() => (window as unknown as { aiFrames: typeof frames }).aiFrames); frames.push(...sequence);
    await writeFile(join(artifacts, `${engine}-loading-${width}-${wait}-raw.json`), JSON.stringify(sequence, null, 2)); await shot(typical.page, `loading-${width}-${wait}-ready`);
    const final = sequence.at(-1)!; let maxDelta = 0;
    for (const frame of sequence) for (const key of ["heading", "chatgpt", "doubao", "submissions", "advanced", "name:ChatGPT", "name:豆包"]) {
      const start = frame.anchors.find(anchor => anchor.key === key), end = final.anchors.find(anchor => anchor.key === key);
      assert.ok(start && end, `首帧必需锚点 ${key} 存在且可见`); maxDelta = Math.max(maxDelta, Math.abs(start.x - end.x), Math.abs(start.y - end.y));
    }
    assert.ok(maxDelta <= 1, `稳定布局锚点偏移 ${maxDelta}px`);
    checks.push(`${width}px数据库延迟${wait}ms：${sequence.length}帧，结构与AI名称七个首帧锚点最大偏移${maxDelta}px`);
    await writeFile(join(artifacts, `${engine}-loading-${width}-${wait}.json`), JSON.stringify({ maxDelta, sequence }, null, 2));
  }
  await typical.page.setViewportSize({ width: 1440, height: 900 });
  await typical.page.goto(baseURL + "/dashboard/ai", { waitUntil: "commit" });
  await typical.page.locator('[data-ai-provider="doubao"]').waitFor(); await typical.page.getByRole("button", { name: "豆包连接详情", exact: true }).click();
  const focused = await typical.page.evaluate(() => document.activeElement?.getAttribute("data-ai-panel"));
  await typical.page.locator("[data-ai-access-ready]:visible").waitFor(); assert.equal(await panel(typical.page).count(), 1);
  assert.equal(await typical.page.evaluate(() => document.activeElement?.getAttribute("data-ai-panel")), focused); await closePanel(typical.page);
  await typical.page.goto(baseURL + "/dashboard/ai", { waitUntil: "commit" }); await typical.page.locator('[data-ai-provider="doubao"]').waitFor(); await records(typical.page);
  await typical.page.locator("[data-ai-access-ready]:visible").waitFor(); assert.equal(await typical.page.locator("[data-ai-submissions]").getAttribute("data-open"), "true");
  assert.equal(await typical.page.getByLabel("筛选发起来源").isEnabled(), true);
  await fetch(delayed.controlURL, { method: "POST", body: JSON.stringify({ delayMs: 0 }) });
  checks.push("历史读取期间可展开管理和记录，数据接管保留面板、焦点及开合状态");
  await writeFile(join(artifacts, `${engine}-frames.json`), JSON.stringify(frames, null, 2));
  await typical.context.close(); await empty.context.close(); await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  await writeFile(join(artifacts, `${engine}-report.json`), JSON.stringify({ engine, checks, screenshots, layout, errors, failures }, null, 2));
  console.log(JSON.stringify({ engine, checks, screenshots: screenshots.length, errors, failures }));
} catch (error) { for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({path:join(artifacts, `${engine}-failed-${browser.contexts().indexOf(context)}-${context.pages().indexOf(page)}.png`)}).catch(() => {}); await writeFile(join(artifacts, `${engine}-failed-layout.json`), JSON.stringify(layout,null,2)); await writeFile(join(artifacts, `${engine}-failure-${Date.now()}.txt`), String(error) + "\n" + serverLog); throw error; }
finally { await browser.close(); child.kill("SIGTERM"); await once(child, "exit"); await delayed.close(); await socket.stop(); await pg.close(); }
