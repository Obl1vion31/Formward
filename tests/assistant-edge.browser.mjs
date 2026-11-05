import assert from "node:assert/strict";

export async function checkAssistantEdges({ createContext, config, payload, ready, open, close, surface, shot, checks }) {
  const shared = await createContext(), one = await shared.newPage(), two = await shared.newPage();
  try {
    await Promise.all([one.goto(config.baseURL + "/dashboard"), two.goto(config.baseURL + "/dashboard")]);
    await Promise.all([ready(one), ready(two)]); await one.waitForTimeout(700);
    assert.equal((await surface(one).count()) + (await surface(two).count()), 1, "同账号多标签同时进入只展示一次");
    const active = await surface(one).count() ? one : two;
    await close(active); await open(one); await surface(one).getByRole("checkbox").uncheck();
    await open(two); assert.equal(await surface(two).getByRole("checkbox").isChecked(), false, "自动出现偏好多标签同步");
  } finally { await shared.close(); }
  checks.push("multiple tabs: one automatic presentation and preference sync");

  const legacy = await createContext();
  await legacy.addInitScript(({ id, date }) => { try { localStorage.setItem(`formward:reminders:${id}:${date}`, "closed"); } catch {} }, { id: config.userId, date: config.today });
  try {
    const page = await legacy.newPage(); await page.goto(config.baseURL + "/dashboard"); await ready(page); await page.waitForTimeout(500);
    assert.equal(await surface(page).count(), 0, "尊重旧提醒当日收起偏好"); await open(page); await close(page);
  } finally { await legacy.close(); }

  const zone = await createContext({ timezone: "Pacific/Honolulu" });
  try {
    const page = await zone.newPage(); await page.goto(config.baseURL + "/dashboard/energy"); await ready(page);
    const request = page.waitForResponse(response => response.url().includes("/api/assistant-context?")); await open(page);
    const response = await request, data = await response.json(); assert.equal(data.timezone, "Pacific/Honolulu");
    assert.equal(new URL(response.url()).searchParams.get("timezone"), "Pacific/Honolulu");
    await surface(page).getByRole("link", { name: "记录一餐", exact: true }).waitFor();
    assert.ok((await surface(page).getByRole("link", { name: "记录一餐", exact: true }).getAttribute("href")).includes(`date=${data.localDate}`));
    await shot(page, "timezone-honolulu");
  } finally { await zone.close(); }
  checks.push("legacy dismissal / current device timezone and action dates");

  const priority = await createContext();
  try {
    const page = await priority.newPage(); await page.goto(config.baseURL + "/dashboard/energy"); await ready(page); await open(page);
    await page.route("**/api/app-version", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: "assistant-qa-update" }) }));
    const version = page.waitForResponse(response => response.url().endsWith("/api/app-version"));
    const records = page.waitForResponse(response => new URL(response.url()).pathname === "/api/record-changes");
    await page.evaluate(() => dispatchEvent(new Event("focus"))); await version; await (await records).finished(); await ready(page);
    assert.equal(await page.getByRole("complementary", { name: "应用版本更新" }).count(), 0, "版本提醒不盖住助手");
    await close(page); const notice = page.getByRole("complementary", { name: "应用版本更新" }); await notice.waitFor(); await notice.getByRole("button", { name: "稍后", exact: true }).click();
    await open(page);
    await page.route("**/api/record-changes", async route => {
      const response = await route.fetch(), result = await response.json();
      result.records[0].version += "-fictional-change"; await route.fulfill({ response, json: result });
    });
    await page.evaluate(() => dispatchEvent(new Event("focus")));
    const update = page.getByRole("dialog", { name: "记录在其他页面有更新", exact: true }); await update.waitFor();
    await surface(page).waitFor({ state: "hidden" }); await update.getByRole("button", { name: "稍后查看", exact: true }).click();
  } finally { await priority.close(); }
  checks.push("version notice deferred / existing record-change dialog takes priority");

  const expired = await createContext();
  try {
    const page = await expired.newPage(); await page.route("**/api/assistant-context?**", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await page.goto(config.baseURL + "/dashboard/energy"); await ready(page); await open(page);
    await surface(page).getByText("登录已失效，请重新登录。", { exact: true }).waitFor();
    assert.equal(await surface(page).getByRole("link", { name: "重新登录 →", exact: true }).count(), 1);
    assert.equal(await surface(page).getByText("当前没有需要核对的记录", { exact: true }).count(), 0);
    await shot(page, "session-expired");
  } finally { await expired.close(); }

  const delayed = await createContext();
  let release, started;
  const pendingRequest = new Promise(resolve => { started = resolve; });
  try {
    const page = await delayed.newPage();
    await page.addInitScript(() => {
      const RealDate = Date; let current = null;
      window.__assistantSetTime = value => { current = RealDate.parse(value); };
      window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [current ?? RealDate.now()])); } static now() { return current ?? RealDate.now(); } };
    });
    let count = 0, latest = payload;
    await page.route("**/api/assistant-context?**", async route => {
      if (++count === 1) { started(); await new Promise(resolve => { release = resolve; }); }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(latest) }).catch(() => {});
    });
    await page.goto(config.baseURL + "/dashboard/energy"); await ready(page); await open(page); await pendingRequest;
    await close(page);
    const next = new Date(config.today + "T12:00:00+08:00"); next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = next.toISOString().slice(0, 10);
    latest = { ...payload, localDate: nextDate, pending: [], suggestions: [], generatedAt: next.toISOString() };
    await page.evaluate(time => { window.__assistantSetTime(time); dispatchEvent(new Event("focus")); }, next.toISOString());
    await page.waitForTimeout(350); assert.equal(await surface(page).count(), 0, "跨日及恢复前台不主动弹出");
    await open(page); await surface(page).getByText(`今天 · ${nextDate.replaceAll("-", ".")}`, { exact: true }).waitFor();
    release(); await page.waitForTimeout(350); assert.equal(await surface(page).getByText("当前没有需要核对的记录", { exact: true }).count(), 1, "过期请求不覆盖新日期");
    await shot(page, "next-day-stale-response");
  } finally { release?.(); await delayed.close(); }
  checks.push("401 / cross-midnight and foreground do not open / stale response discarded");

  // 1440×900 屏幕在 200% 页面缩放时的等效 CSS 可用区为 720×450。
  const zoom = await createContext({ width: 720, height: 450 });
  try {
    const page = await zoom.newPage(); await page.goto(config.baseURL + "/dashboard/energy"); await ready(page); await open(page);
    assert.ok(await surface(page).evaluate(node => { const box = node.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight + 1 && node.scrollWidth <= node.clientWidth; }));
    const footer = surface(page).getByRole("button", { name: "先继续浏览", exact: true }); await footer.click(); assert.equal(await surface(page).count(), 0);
    await open(page); await shot(page, "zoom-200-equivalent");
  } finally { await zoom.close(); }
  checks.push("200% equivalent available area / reduced motion / scrollable content and reachable footer");
}
