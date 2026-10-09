import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const response = await fetch(`${baseURL}/api/v1/measurement-operations`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Formward-Timezone": "+08:00" }, body: JSON.stringify(data) });
    assert.equal(response.status, 200); return response.json();
  };
  const payload = { kind: "save_day", operationId: crypto.randomUUID(), date, periods: { daytime: { weightKg: "70.20", bodyFatPercent: "20.10", fasting: true, deviceLabel: "虚构 AI 晨间秤" }, evening: { weightKg: "70.90", bodyFatPercent: "20.40", deviceLabel: "虚构 AI 晚间秤" } } };
  try {
    await page.goto(`${baseURL}/dashboard`); await page.getByRole("link", { name: "AI 接入", exact: true }).click();
    assert.ok((await page.locator(".ai-instructions").textContent()).includes("每次新录入自动采用当次系统时区"));
    await page.getByLabel("令牌名称").fill("虚构 Codex 试验"); await page.getByRole("button", { name: "创建令牌", exact: true }).click();
    await page.getByLabel("新令牌原文").waitFor(); token = await page.getByLabel("新令牌原文").inputValue(); assert.match(token, /^fw_ai_[A-Za-z0-9_-]{43}$/);
    await page.getByRole("button", { name: "已保存，关闭" }).click(); await page.reload(); assert.equal(await page.getByLabel("新令牌原文").count(), 0); assert.ok(!(await page.content()).includes(token));
    const apiRead = await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(apiRead.status, 200); assert.deepEqual((await apiRead.json()).records, []);
    const preview = await post(payload); assert.equal(preview.preview.rows.length, 2); assert.equal(preview.preview.canConfirm, true);
    assert.ok(preview.preview.rows.every(row => row.after.timezone === "+08:00"));
    // 实际本地 HTTP 助手使用私有配置，输出不包含令牌；与当前 Codex 试验路径相同。
    const local = await mkdtemp(join(tmpdir(), "formward-ai-client-"));
    try {
      await writeFile(join(local, ".env.ai.local"), `FORMWARD_AI_BASE_URL=${baseURL}\nFORMWARD_AI_TOKEN=${token}\n`, { mode: 0o600 });
      const run = (args, timezone) => promisify(execFile)(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("scripts/ai-request.mts"), ...args], { cwd: local, env: { ...process.env, TZ: timezone } });
      const query = await run(["GET", "/measurements"], "Asia/Bangkok");
      assert.deepEqual(JSON.parse(query.stdout).records, []); assert.equal(JSON.parse(query.stdout).context.timezone, "+07:00"); assert.ok(!query.stdout.includes(token));
      const changed = await run(["GET", "/measurements"], "Asia/Kathmandu"); assert.equal(JSON.parse(changed.stdout).context.timezone, "+05:45");
      const file = join(local, "private-request.json"), contents = JSON.stringify({ kind: "batch", operationId: crypto.randomUUID(), items: [{ kind: "save_record", date, period: "evening", weightKg: "71.00", deviceLabel: "虚构系统时区秤" }] });
      await writeFile(file, contents, { mode: 0o600 });
      const submitted = JSON.parse((await run(["POST", "/measurement-operations", file], "Asia/Bangkok")).stdout);
      assert.equal(submitted.items[0].preview.rows[0].after.timezone, "+07:00"); assert.equal((await readFile(file, "utf8")), contents);
      const retried = JSON.parse((await run(["POST", "/measurement-operations", file], "Asia/Kathmandu")).stdout);
      assert.equal(retried.id, submitted.id); assert.equal(retried.items[0].preview.rows[0].after.timezone, "+07:00");
      await page.goto(submitted.confirmationUrl); await page.getByRole("button", { name: "修改", exact: true }).click();
      assert.equal(await page.getByLabel("时区", { exact: true }).inputValue(), "+07:00");
      await page.getByRole("button", { name: "放弃本行修改", exact: true }).click(); await page.getByRole("button", { name: "取消剩余", exact: true }).click();
      await page.getByText(`${date} · 已取消`, { exact: true }).waitFor();
    } finally { await rm(local, { recursive: true, force: true }); }
    await page.goto(preview.confirmationUrl); await page.getByRole("heading", { name: "审核身体记录", exact: true }).waitFor();
    assert.ok((await page.innerText("main")).includes("70.20 kg")); assert.ok((await page.innerText("main")).includes("20.10%"));
    await page.screenshot({ path: `${artifacts}/ai-confirmation-desktop.png`, fullPage: true });
    await page.getByRole("button", { name: "全部确认保存", exact: true }).click(); await page.getByRole("status").filter({ hasText: "已保存 2 · 待确认 0" }).waitFor();
    await page.reload(); assert.equal(await page.getByRole("button", { name: "确认保存", exact: true }).count(), 0);
    const saved = await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } }); const records = (await saved.json()).records; assert.equal(records.length, 2); assert.ok(records.every(row => row.entryChannel === "api"));
    await page.goto(`${baseURL}/dashboard`); await page.getByRole("heading", { name: "身体记录", exact: true }).waitFor(); assert.ok((await page.locator('section[aria-label="最近记录"]').innerText()).includes("70.20"));
    const repeated = await post(payload); assert.equal(repeated.id, preview.id); assert.equal(repeated.status, "confirmed");
    const duplicate = await post({ ...payload, operationId: crypto.randomUUID() }); assert.ok(duplicate.preview.rows.every(row => row.state === "duplicate"));
    const conflict = await post({ ...payload, operationId: crypto.randomUUID(), periods: { daytime: { ...payload.periods.daytime, weightKg: "71.00" } } }); assert.equal(conflict.preview.canConfirm, false);
    await page.goto(conflict.confirmationUrl); assert.equal(await page.getByRole("button", { name: "全部确认保存" }).isDisabled(), true);
    await page.getByRole("button", { name: "修改", exact: true }).click(); await page.getByLabel("要修改的历史记录").selectOption(records.find(record => record.period === "daytime").id);
    await page.getByRole("button", { name: "更新预览", exact: true }).click(); await page.getByText("修改明确指定的历史记录。", { exact: true }).waitFor();
    assert.equal((await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } }).then(response => response.json())).records.find(record => record.period === "daytime").weightKg, "70.20");
    await page.getByRole("button", { name: "取消剩余" }).click(); await page.getByText(`${date} · 已取消`, { exact: true }).waitFor();
    const edit = await post({ ...payload, operationId: crypto.randomUUID(), periods: { daytime: { recordId: records.find(row => row.period === "daytime").id, version: records.find(row => row.period === "daytime").updatedAt, deviceLabel: "虚构修改来源" } } });
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(edit.confirmationUrl); await page.getByRole("heading", { name: "审核身体记录", exact: true }).waitFor();
    assert.ok((await page.innerText("main")).includes("虚构修改来源")); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${artifacts}/ai-confirmation-mobile.png`, fullPage: true });
    await page.getByRole("button", { name: "确认保存", exact: true }).click(); await page.getByRole("status").filter({ hasText: "已保存 1 · 待确认 0" }).waitFor();
    const read = async () => (await (await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } })).json()).records;
    const nextDate = days => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const submitted = await post({ kind: "batch", operationId: crypto.randomUUID(), items: [
      { kind: "save_record", date: nextDate(1), period: "evening", weightKg: "70.50", deviceLabel: "虚构批量秤" },
      { kind: "save_record", date: nextDate(2), period: "daytime", weightKg: "70.00", bodyFatPercent: "20.00", fasting: true, deviceLabel: "虚构批量秤" },
      { kind: "save_record", date: nextDate(3), period: "evening", weightKg: "-1", deviceLabel: "虚构批量秤" },
      { kind: "save_record", date: nextDate(4), period: "evening", weightKg: "71.00", deviceLabel: "虚构批量秤" },
    ] });
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(submitted.confirmationUrl);
    const row = index => page.locator(`[data-item-id="${submitted.items[index].id}"]`);
    assert.equal(await page.locator(".ai-review-item").count(), 4); assert.equal(await page.getByRole("button", { name: "全部确认保存" }).isDisabled(), true);
    await row(0).getByRole("button", { name: "修改", exact: true }).click();
    assert.equal(await row(0).getByLabel("时区", { exact: true }).inputValue(), "+08:00");
    await row(0).getByLabel("体重（kg）").fill("69.80"); await row(0).getByLabel("测量来源").fill("人工核对批量秤"); await row(0).getByLabel("时区", { exact: true }).selectOption("+07:00");
    await row(0).getByLabel("日期", { exact: true }).fill(nextDate(5)); await row(0).getByLabel("时段", { exact: true }).selectOption("daytime"); await row(0).getByLabel("确认这次晨间测量为空腹").check();
    assert.equal((await read()).length, 2); assert.equal(await row(1).getByRole("button", { name: "确认保存", exact: true }).isDisabled(), true);
    await row(0).getByRole("button", { name: "更新预览", exact: true }).click(); await row(0).getByText("人工核对批量秤", { exact: true }).waitFor();
    assert.ok((await row(0).innerText()).includes("GMT+7（东七区）")); assert.equal((await read()).length, 2);
    await row(2).getByRole("button", { name: "取消", exact: true }).click(); await page.locator(`[data-item-id="${submitted.items[2].id}"][data-item-status="cancelled"]`).waitFor();
    await row(0).getByRole("button", { name: "确认保存", exact: true }).click(); await page.getByRole("status").filter({ hasText: "已保存 1 · 待确认 2" }).waitFor();
    assert.equal((await read()).length, 3); await page.reload(); assert.equal(await row(0).getByRole("button").count(), 0);
    await row(1).getByRole("button", { name: "修改", exact: true }).click(); await row(1).getByLabel("测量来源").fill("保留的未提交草稿");
    // 同会话另一个页面改审核内容，旧页面不能覆盖，加载最新后保留本地输入。
    const otherPage = await context.newPage();
    try {
      await otherPage.goto(submitted.confirmationUrl); const last = otherPage.locator(`[data-item-id="${submitted.items[3].id}"]`);
      await last.getByRole("button", { name: "修改", exact: true }).click(); await last.getByLabel("体脂率（%）").fill("21.00"); await last.getByRole("button", { name: "更新预览", exact: true }).click(); await last.getByText("21.00%", { exact: true }).waitFor();
      await row(1).getByRole("button", { name: "更新预览", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "另一个页面" }).waitFor();
      assert.equal(await row(1).getByLabel("测量来源").inputValue(), "保留的未提交草稿");
      await page.getByRole("button", { name: "加载最新审核，保留输入" }).click(); await page.getByRole("button", { name: "加载最新审核，保留输入" }).waitFor({ state: "hidden" });
      assert.equal(await row(1).getByLabel("测量来源").inputValue(), "保留的未提交草稿");
    } finally { await otherPage.close(); }
    await page.getByRole("button", { name: "批量修改", exact: true }).click();
    for (const index of [1, 3]) await row(index).getByRole("button", { name: "采用设备时区" }).click();
    assert.equal(await row(1).getByLabel("时区", { exact: true }).inputValue(), "+08:00");
    for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: `${artifacts}/ai-batch-edit-${width}.png`, fullPage: true }); }
    await page.getByRole("button", { name: "更新全部预览", exact: true }).click(); await row(1).getByText("保留的未提交草稿", { exact: true }).waitFor();
    assert.equal((await read()).length, 3);
    await page.getByRole("button", { name: "全部确认保存", exact: true }).click(); await page.getByRole("status").filter({ hasText: "已保存 3 · 待确认 0 · 已取消 1" }).waitFor();
    const batchSaved = await read(); assert.equal(batchSaved.length, 5);
    assert.equal(batchSaved.find(record => record.recordDate === nextDate(5)).weightKg, "69.80"); assert.equal(batchSaved.find(record => record.recordDate === nextDate(5)).timezone, "+07:00"); assert.equal(batchSaved.find(record => record.recordDate === nextDate(5)).fasting, true); assert.equal(batchSaved.find(record => record.recordDate === nextDate(5)).period, "daytime");
    assert.ok(batchSaved.filter(record => [nextDate(2), nextDate(4)].includes(record.recordDate)).every(record => record.timezone === "+08:00"));
    assert.ok(!batchSaved.some(record => record.recordDate === nextDate(3))); await page.reload(); assert.equal(await page.getByRole("button", { name: "确认保存", exact: true }).count(), 0);
    const otherContext = await browser.newContext();
    try { await otherContext.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL, "x-forwarded-for": "192.0.2.202" }, data: other }); assert.equal((await otherContext.request.get(preview.confirmationUrl)).status(), 404); } finally { await otherContext.close(); }
    await page.goto(`${baseURL}/dashboard/ai`); await page.getByRole("heading", { name: "AI 接入", exact: true }).waitFor();
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: `${artifacts}/ai-access-${width}.png`, fullPage: true }); }
    await page.getByRole("button", { name: "撤销", exact: true }).click(); await page.getByText("令牌已撤销。", { exact: true }).waitFor();
    assert.equal((await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    const spec = await fetch(`${baseURL}/api/v1/openapi.json`); assert.equal(spec.status, 200); assert.equal((await spec.json()).openapi, "3.1.0");
    assert.deepEqual(errors, []); console.log("通过：AI 令牌与 HTTP 助手 → 兼容单日确认 → 跨日批量修改／逐行保存／取消／整体保存 → GMT 时区／跨页版本冲突保留草稿／跨账号／撤销，1440／390／320px 无溢出。");
  } catch (error) { console.log("AI 页面诊断：", { errors, alerts: await page.getByRole("alert").allTextContents(), pathname: new URL(page.url()).pathname }); throw error; } finally { await context.close(); await browser.close(); }
}
