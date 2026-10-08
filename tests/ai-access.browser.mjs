import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
export async function checkAiAccessBrowser({ baseURL, account, other, date }) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch({ headless: true });
  const artifacts = process.env.FORMWARD_MEASUREMENTS_ARTIFACTS ?? "/tmp/formward-ai-visual";
  await mkdir(artifacts, { recursive: true });
  const errors = [], context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai" });
  const login = await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL, "x-forwarded-for": "192.0.2.201" }, data: account }); assert.equal(login.status(), 200);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  let token;
  const post = async data => {
    const response = await fetch(`${baseURL}/api/v1/measurement-operations`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(data) });
    assert.equal(response.status, 200); return response.json();
  };
  const payload = { kind: "save_day", operationId: crypto.randomUUID(), date, periods: { daytime: { weightKg: "70.20", bodyFatPercent: "20.10", fasting: true, deviceLabel: "虚构 AI 晨间秤" }, evening: { weightKg: "70.90", bodyFatPercent: "20.40", deviceLabel: "虚构 AI 晚间秤" } } };
  try {
    await page.goto(`${baseURL}/dashboard`); await page.getByRole("link", { name: "AI 接入", exact: true }).click();
    await page.getByLabel("令牌名称").fill("虚构 Codex 试验"); await page.getByRole("button", { name: "创建令牌", exact: true }).click();
    await page.getByLabel("新令牌原文").waitFor(); token = await page.getByLabel("新令牌原文").inputValue(); assert.match(token, /^fw_ai_[A-Za-z0-9_-]{43}$/);
    await page.getByRole("button", { name: "已保存，关闭" }).click(); await page.reload(); assert.equal(await page.getByLabel("新令牌原文").count(), 0); assert.ok(!(await page.content()).includes(token));
    const apiRead = await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(apiRead.status, 200); assert.deepEqual((await apiRead.json()).records, []);
    const preview = await post(payload); assert.equal(preview.preview.rows.length, 2); assert.equal(preview.preview.canConfirm, true);
    // 实际本地 HTTP 助手使用私有配置，输出不包含令牌；与当前 Codex 试验路径相同。
    const local = await mkdtemp(join(tmpdir(), "formward-ai-client-"));
    try {
      await writeFile(join(local, ".env.ai.local"), `FORMWARD_AI_BASE_URL=${baseURL}\nFORMWARD_AI_TOKEN=${token}\n`, { mode: 0o600 });
      const query = await promisify(execFile)(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("scripts/ai-request.mts"), "GET", "/measurements"], { cwd: local });
      assert.deepEqual(JSON.parse(query.stdout).records, []); assert.ok(!query.stdout.includes(token));
    } finally { await rm(local, { recursive: true, force: true }); }
    await page.goto(preview.confirmationUrl); await page.getByRole("heading", { name: "确认身体记录", exact: true }).waitFor();
    assert.ok((await page.innerText("main")).includes("70.20 kg")); assert.ok((await page.innerText("main")).includes("20.10%"));
    await page.screenshot({ path: `${artifacts}/ai-confirmation-desktop.png`, fullPage: true });
    await page.getByRole("button", { name: "确认保存", exact: true }).click(); await page.getByText("已保存确认的身体记录。", { exact: true }).waitFor();
    await page.reload(); assert.equal(await page.getByRole("button", { name: "确认保存", exact: true }).count(), 0);
    const saved = await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } }); const records = (await saved.json()).records; assert.equal(records.length, 2); assert.ok(records.every(row => row.entryChannel === "api"));
    await page.goto(`${baseURL}/dashboard`); await page.getByRole("heading", { name: "身体记录", exact: true }).waitFor(); assert.ok((await page.locator('section[aria-label="最近记录"]').innerText()).includes("70.20"));
    const repeated = await post(payload); assert.equal(repeated.id, preview.id); assert.equal(repeated.status, "confirmed");
    const duplicate = await post({ ...payload, operationId: crypto.randomUUID() }); assert.ok(duplicate.preview.rows.every(row => row.state === "duplicate"));
    const conflict = await post({ ...payload, operationId: crypto.randomUUID(), periods: { daytime: { ...payload.periods.daytime, weightKg: "71.00" } } }); assert.equal(conflict.preview.canConfirm, false);
    await page.goto(conflict.confirmationUrl); assert.equal(await page.getByRole("button", { name: "确认保存" }).isDisabled(), true); await page.getByRole("button", { name: "取消操作" }).click(); await page.getByText(`${date} · 已取消`, { exact: true }).waitFor();
    const edit = await post({ ...payload, operationId: crypto.randomUUID(), periods: { daytime: { recordId: records.find(row => row.period === "daytime").id, version: records.find(row => row.period === "daytime").updatedAt, deviceLabel: "虚构修改来源" } } });
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(edit.confirmationUrl); await page.getByRole("heading", { name: "确认身体记录", exact: true }).waitFor();
    assert.ok((await page.innerText("main")).includes("虚构修改来源")); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${artifacts}/ai-confirmation-mobile.png`, fullPage: true });
    await page.getByRole("button", { name: "确认保存" }).click(); await page.getByText("已保存确认的身体记录。", { exact: true }).waitFor();
    const otherContext = await browser.newContext();
    try { await otherContext.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL, "x-forwarded-for": "192.0.2.202" }, data: other }); assert.equal((await otherContext.request.get(preview.confirmationUrl)).status(), 404); } finally { await otherContext.close(); }
    await page.goto(`${baseURL}/dashboard/ai`); await page.getByRole("heading", { name: "AI 接入", exact: true }).waitFor();
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: `${artifacts}/ai-access-${width}.png`, fullPage: true }); }
    await page.getByRole("button", { name: "撤销", exact: true }).click(); await page.getByText("令牌已撤销。", { exact: true }).waitFor();
    assert.equal((await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    const spec = await fetch(`${baseURL}/api/v1/openapi.json`); assert.equal(spec.status, 200); assert.equal((await spec.json()).openapi, "3.1.0");
    assert.deepEqual(errors, []); console.log("通过：AI 令牌一次展示 → 本地助手与 HTTP 预览 → 网页确认 → 刷新／重复／冲突／来源修改／跨账号／撤销，桌面和手机无溢出。");
  } catch (error) { console.log("AI 页面诊断：", { errors, alerts: await page.getByRole("alert").allTextContents(), pathname: new URL(page.url()).pathname }); throw error; } finally { await context.close(); await browser.close(); }
}
