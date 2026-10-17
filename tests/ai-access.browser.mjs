import assert from "node:assert/strict";
import { checkUnifiedReview } from "./record-review.browser.mjs";
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
      await page.getByRole("button", { name: "放弃本行修改", exact: true }).click();
      await page.getByText("审核信息与刷新", {exact:true}).click(); await page.getByRole("button", { name: "取消本次提交", exact: true }).click();
      await page.getByRole("heading", {name:"已取消",exact:true}).waitFor();
    } finally { await rm(local, { recursive: true, force: true }); }
    await page.goto(preview.confirmationUrl); await page.getByRole("heading", { name: "确认记录", exact: true }).waitFor();
    await page.getByRole("button", { name: "确认并全部保存", exact: true }).click(); await page.getByRole("heading", { name: "已保存", exact: true }).waitFor();
    await page.waitForURL(`${baseURL}/dashboard`);
    const read = async () => (await (await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } })).json()).records;
    assert.equal((await read()).length,2);
    assert.equal((await post(payload)).status,"confirmed");
    const nextDate = days => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0,10);
    // 缺来源、历史建议移除与空来源保存沿用原业务约定。
    const missing = await post({kind:"batch",operationId:crypto.randomUUID(),items:[{kind:"save_record",date:nextDate(6),period:"evening",weightKg:"71.20"}]});
    assert.equal(missing.needsUserInput[0].field,"deviceLabel");
    await page.goto(missing.confirmationUrl); await page.getByRole("button",{name:"修改",exact:true}).click();
    const editor=page.getByRole("dialog",{name:"修改待保存内容",exact:true}),source=editor.getByRole("combobox",{name:"测量来源",exact:true});
    assert.equal(await editor.getByLabel("确认不填写测量来源").count(),0);
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1000});await source.fill("保留的来源草稿");await source.click();
      assert.equal(await source.inputValue(),"保留的来源草稿");
      await editor.getByRole("gridcell",{name:"虚构 AI 晚间秤",exact:true}).click();
      assert.equal(await source.inputValue(),"虚构 AI 晚间秤");
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await editor.getByLabel("体重（kg）").fill("72.34");await source.fill("");
    await editor.getByRole("button",{name:"移除来源建议 虚构 AI 晚间秤",exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('[aria-label="移除来源建议 虚构 AI 晚间秤"]'));
    assert.equal(await editor.getByLabel("体重（kg）").inputValue(),"72.34");assert.equal(await source.inputValue(),"");
    await editor.getByRole("button",{name:"更新预览",exact:true}).click();await editor.waitFor({state:"hidden"});
    assert.equal((await read()).length,2);
    await page.getByRole("button",{name:"确认并全部保存",exact:true}).click();await page.getByRole("heading",{name:"已保存",exact:true}).waitFor();
    assert.equal((await read()).find(record=>record.recordDate===nextDate(6)).deviceLabel,null);
    await page.waitForURL(`${baseURL}/dashboard`);
    await checkUnifiedReview({baseURL,context,page,token,date,artifacts});
    const otherContext = await browser.newContext();
    try { await otherContext.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL, "x-forwarded-for": "192.0.2.202" }, data: other }); assert.equal((await otherContext.request.get(preview.confirmationUrl)).status(), 404); } finally { await otherContext.close(); }
    await page.goto(`${baseURL}/dashboard/ai`); await page.getByRole("heading", { name: "AI 接入", exact: true }).waitFor();
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: `${artifacts}/ai-access-${width}.png`, fullPage: true }); }
    await page.getByRole("button", { name: "撤销", exact: true }).click(); await page.getByText("令牌已撤销。", { exact: true }).waitFor();
    assert.equal((await fetch(`${baseURL}/api/v1/measurements`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    const spec = await fetch(`${baseURL}/api/v1/openapi.json`); assert.equal(spec.status, 200); assert.equal((await spec.json()).openapi, "3.1.0");
    assert.deepEqual(errors, []); console.log("通过：AI 令牌与 HTTP 助手 → 兼容单日确认 → 混合批次修改／草稿核对／取消／统一保存 → GMT 时区／跨页版本冲突保留草稿／跨账号／撤销，1440／390／320px 无溢出。");
  } catch (error) { console.log("AI 页面诊断：", { errors, alerts: await page.getByRole("alert").allTextContents(), pathname: new URL(page.url()).pathname }); throw error; } finally { await context.close(); await browser.close(); }
}
