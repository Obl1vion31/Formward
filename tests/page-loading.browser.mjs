import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// 延迟实际 HTTP 请求，验证模态层、状态交接和失败恢复；只操作独立测试账号。
export async function checkPageLoadingBrowser({ baseURL, account, date }) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Shanghai" });
  const artifacts = process.env.FORMWARD_MEASUREMENTS_ARTIFACTS ?? "/tmp/formward-loading-visual";
  await mkdir(artifacts, { recursive: true });
  const login = await context.request.post(`${baseURL}/api/auth/sign-in/email`, { headers: { Origin: baseURL, "x-forwarded-for": "192.0.2.230" }, data: account });
  assert.equal(login.status(), 200);
  const page = await context.newPage(), errors = [], gates = new Set(), requests = [], warnings = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["warning", "error"].includes(message.type()) || /refresh|reload|mismatch|MPA/i.test(message.text())) warnings.push(message.text()); });
  page.on("request", request => { requests.push({ method: request.method(), path: new URL(request.url()).pathname, action: !!request.headers()["next-action"], document: request.isNavigationRequest() }); });
  await page.addInitScript(() => {
    window.loadingOpenings = [];
    let previous = false;
    new MutationObserver(() => {
      const open = !!document.querySelector(".page-loading-dialog[open]");
      if (open && !previous) window.loadingOpenings.push(performance.now());
      previous = open;
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  });
  const actionRequest = request => request.method() === "POST" && !!request.headers()["next-action"];
  async function holdNext(matches) {
    const timeoutError = new Error(`等待实际加载请求超时：${matches.toString()}`);
    let captured = false, count = 0, resume, observed, finished;
    const decision = new Promise(resolve => { resume = resolve; });
    const seen = new Promise(resolve => { observed = resolve; });
    const done = new Promise(resolve => { finished = resolve; });
    const handler = async route => {
      if (!matches(route.request())) { await route.fallback(); return; }
      count++;
      if (captured) { await route.continue(); return; }
      captured = true; observed();
      const next = await decision;
      try { if (next === "abort") await route.abort("failed"); else await route.continue(); }
      finally { finished(); }
    };
    await page.route("**/*", handler);
    const gate = {
      get count() { return count; },
      async wait() {
        let timer;
        try { await Promise.race([seen, new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError), 20000); })]); }
        catch (error) {
          error.message += `\n${JSON.stringify({ requests: requests.slice(-12), busy: await page.locator(".ai-review-page").getAttribute("aria-busy").catch(() => null), buttons: await page.locator(".ai-review-page button").allTextContents() })}`;
          throw error;
        }
        finally { clearTimeout(timer); }
      },
      async release(next = "continue") {
        resume(next);
        if (captured) await done;
        await page.unroute("**/*", handler);
        gates.delete(gate);
      },
    };
    gates.add(gate);
    return gate;
  }
  const loading = () => page.locator(".page-loading-dialog[open]");
  const ready = () => loading().waitFor({ state: "detached" });
  async function assertLoading(label, file) {
    await loading().waitFor();
    assert.equal(await loading().count(), 1, "全站只显示一个加载模态层");
    assert.equal((await loading().innerText()).trim(), label);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    const layers = await loading().evaluate(node => {
      const rect = node.getBoundingClientRect(), backdrop = getComputedStyle(node, "::backdrop");
      return { top: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest("dialog") === node,
        blur: backdrop.backdropFilter, width: rect.width, height: rect.height,
        within: node.scrollWidth <= node.clientWidth, focus: node.contains(document.activeElement) };
    });
    assert.equal(layers.top, true, "遮罩处于包括编辑弹窗在内的最上层");
    assert.equal(layers.blur, "blur(6px)"); assert.equal(layers.within, true); assert.equal(layers.focus, true);
    assert.ok(Math.abs(layers.width - page.viewportSize().width) < 1 && Math.abs(layers.height - page.viewportSize().height) < 1);
    await page.keyboard.press("Escape"); await page.keyboard.press("Tab"); await page.mouse.click(4, 4);
    assert.equal(await loading().count(), 1, "Escape、Tab 和背景点击不能关闭等待或操作背景");
    if (file) await page.screenshot({ path: `${artifacts}/${file}.png` });
  }
  async function slowAction(label, click, file, next = "continue") {
    const gate = await holdNext(label === "正在退出登录…" ? request => request.method() === "POST" && request.url().endsWith("/api/auth/sign-out") : actionRequest);
    await click(); await gate.wait(); await assertLoading(label, file);
    await gate.release(next); await ready();
  }
  let token;
  const post = async items => {
    const response = await context.request.post(`${baseURL}/api/v1/measurement-operations`, {
      headers: { Authorization: `Bearer ${token}`, "X-Formward-Timezone": "+08:00" },
      data: { kind: "batch", operationId: crypto.randomUUID(), items },
    });
    assert.equal(response.status(), 200); return response.json();
  };
  const future = offset => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const item = offset => ({ kind: "save_record", date: future(offset), period: "evening", weightKg: "71.10", deviceLabel: "虚构加载测试秤" });
  try {
    if (process.env.FORMWARD_MEASUREMENTS_DEV === "1") {
      // 先编译入口。Next 16 开发连接重同步时会把冷编译的新 hash 视作重启并整页重载。
      for (const path of ["/", "/dashboard", "/dashboard/ai", "/dashboard/ai/operations/00000000-0000-4000-8000-000000000000", "/api/v1/openapi.json", "/api/v1/measurements", "/api/v1/measurement-operations"]) {
        await context.request.get(`${baseURL}${path}`);
      }
    }
    await page.goto(`${baseURL}/dashboard`);
    await page.getByRole("heading", { name: "身体记录", exact: true }).waitFor(); await ready();
    assert.equal(await page.locator("dialog").count(), 0);
    await page.locator(`tr[data-date="${date}"]`).getByRole("button", { name: `录入 ${date}`, exact: true }).click();
    const form = page.locator('form[aria-label="当天四项录入"]');
    await page.waitForFunction(() => document.querySelector("dialog[data-motion]")?.dataset.motion === "open");
    await form.getByLabel("晚间体重", { exact: true }).fill("70.30");
    const before = await page.evaluate(() => ({ padding: document.body.style.paddingRight, left: document.querySelector(".dashboard-header").getBoundingClientRect().left }));
    const saveGate = await holdNext(actionRequest);
    const started = await page.evaluate(() => performance.now());
    await form.getByRole("button", { name: "保存录入", exact: true }).click(); await saveGate.wait();
    assert.equal(await form.locator('button[type="submit"]').innerText(), "正在保存…");
    await form.evaluate(node => { node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await assertLoading("正在保存记录…", "loading-save-desktop");
    assert.ok(await page.evaluate(started => window.loadingOpenings.at(-1) - started >= 200, started), "全屏提示等待至少 200ms");
    assert.equal(saveGate.count, 1, "慢请求也不会重复提交");
    assert.equal(await page.locator("dialog[open]").count(), 2, "加载层叠在原编辑弹窗上");
    assert.deepEqual(await page.evaluate(() => ({ padding: document.body.style.paddingRight, left: document.querySelector(".dashboard-header").getBoundingClientRect().left })), before, "嵌套滚动锁不重复补偿");
    await saveGate.release(); await ready();
    await form.getByRole("alert").waitFor(); assert.match(await form.getByRole("alert").innerText(), /数据来源/);
    assert.equal(await form.getByLabel("晚间体重", { exact: true }).inputValue(), "70.30");
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden", "加载结束后仍保留编辑弹窗的滚动锁");
    await form.getByLabel("晚间数据来源", { exact: true }).fill("虚构加载测试秤");
    const openings = await page.evaluate(() => window.loadingOpenings.length);
    const fast = await holdNext(actionRequest);
    await form.getByRole("button", { name: "保存录入", exact: true }).click(); await fast.wait(); await fast.release("abort");
    await form.getByRole("alert").waitFor(); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.loadingOpenings.length), openings, "200ms 内结束的失败不闪现全屏提示");
    assert.equal(await form.getByLabel("晚间体重", { exact: true }).inputValue(), "70.30");
    assert.equal(await form.getByLabel("晚间数据来源", { exact: true }).inputValue(), "虚构加载测试秤");
    await page.setViewportSize({ width: 320, height: 740 }); await page.emulateMedia({ reducedMotion: "reduce" });
    const mobileGate = await holdNext(actionRequest);
    await form.getByRole("button", { name: "保存录入", exact: true }).click(); await mobileGate.wait();
    await assertLoading("正在保存记录…", "loading-save-mobile-320");
    assert.equal(await loading().locator(".page-loading-spinner").evaluate(node => getComputedStyle(node).animationName), "none");
    await mobileGate.release(); await ready(); await form.getByRole("status").waitFor();
    await slowAction("正在估算晚间体脂率…", () => form.getByRole("button", { name: "估算晚间体脂率", exact: true }).click());
    assert.equal(await form.getByLabel("晚间体脂率", { exact: true }).inputValue(), "", "样本不足保持空白");
    await page.getByRole("button", { name: "关闭记录详情" }).click(); await page.locator("dialog").waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), ""); assert.equal(await page.evaluate(() => document.body.style.paddingRight), "");
    await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ reducedMotion: "no-preference" });
    const navigation = await holdNext(request => request.method() === "GET" && new URL(request.url()).pathname === "/dashboard/ai" && request.headers()["rsc"] === "1" && !request.headers()["next-router-prefetch"]);
    await page.getByRole("link", { name: "AI 接入", exact: true }).click(); await navigation.wait();
    await assertLoading("正在加载页面…", "loading-navigation-desktop");
    await navigation.release(); await page.getByRole("heading", { name: "AI 接入", exact: true }).waitFor(); await ready();
    await page.getByLabel("令牌名称").fill("虚构加载测试");
    await slowAction("正在创建访问令牌…", () => page.getByRole("button", { name: "创建令牌", exact: true }).click());
    token = await page.getByLabel("新令牌原文").inputValue();
    await page.getByRole("button", { name: "已保存，关闭", exact: true }).click();
    // 两个真实等待来源交叠：前一个失败结束时，导航仍等待，不能提前收起。
    await page.goto(`${baseURL}/dashboard/ai`); await page.getByRole("heading", { name: "AI 接入", exact: true }).waitFor(); await ready();
    await page.getByLabel("令牌名称").fill("虚构交叠请求");
    const overlapping = await holdNext(actionRequest);
    const overlappingNavigation = await holdNext(request => request.method() === "GET" && new URL(request.url()).pathname === "/dashboard" && request.headers()["rsc"] === "1" && !request.headers()["next-router-prefetch"]);
    await page.getByRole("button", { name: "创建令牌", exact: true }).click(); await overlapping.wait();
    await page.getByRole("link", { name: "Formward 主页", exact: true }).evaluate(node => node.click());
    await overlappingNavigation.wait(); await assertLoading("正在加载页面…");
    await overlapping.release("abort"); await page.waitForTimeout(100);
    assert.equal(await loading().count(), 1, "仍有待处理导航时不关闭模态层");
    await overlappingNavigation.release(); await page.getByRole("heading", { name: "身体记录", exact: true }).waitFor(); await ready();
    const batch = await post([item(1), item(2)]);
    await page.goto(`${baseURL}/dashboard/ai`); await page.getByRole("heading", { name: "AI 接入", exact: true }).waitFor(); await ready();
    const reviewNavigation = await holdNext(request => request.method() === "GET" && new URL(request.url()).pathname === batch.confirmationPath && request.headers()["rsc"] === "1" && !request.headers()["next-router-prefetch"]);
    await page.locator(`a[href="${batch.confirmationPath}"]`).click(); await reviewNavigation.wait(); await assertLoading("正在加载页面…");
    await reviewNavigation.release(); await page.getByRole("heading", { name: "审核身体记录", exact: true }).waitFor(); await ready();
    const row = page.locator(`[data-item-id="${batch.items[0].id}"]`);
    await row.getByRole("button", { name: "修改", exact: true }).click(); await row.getByLabel("体重（kg）").fill("72.10");
    await slowAction("正在更新预览…", () => row.getByRole("button", { name: "更新预览", exact: true }).click(), "loading-review-update");
    assert.ok((await row.innerText()).includes("72.10 kg"));
    if (process.env.FORMWARD_MEASUREMENTS_DEV === "1") {
      // 写草稿前用当前编译 hash 建立开发连接；生产继续验证从 Link 进入的完整流程。
      await page.reload(); await page.getByRole("heading", { name: "审核身体记录", exact: true }).waitFor(); await ready();
    }
    await row.getByRole("button", { name: "修改", exact: true }).click();
    await row.getByLabel("测量来源").fill("虚构保留输入");
    const otherPage = await context.newPage(); otherPage.on("pageerror", error => errors.push(error.message));
    try {
      await otherPage.goto(batch.confirmationUrl);
      const otherRow = otherPage.locator(`[data-item-id="${batch.items[1].id}"]`);
      await otherRow.getByRole("button", { name: "修改", exact: true }).click();
      await otherRow.getByLabel("测量来源").fill("虚构另一页面来源");
      await otherRow.getByRole("button", { name: "更新预览", exact: true }).click();
      await otherRow.getByText("虚构另一页面来源", { exact: true }).waitFor();
      await slowAction("正在更新预览…", () => row.getByRole("button", { name: "更新预览", exact: true }).click());
      await slowAction("正在加载最新审核…", () => page.getByRole("button", { name: "加载最新审核，保留输入", exact: true }).click());
      assert.equal(await row.getByLabel("测量来源").inputValue(), "虚构保留输入");
      await slowAction("正在更新预览…", () => row.getByRole("button", { name: "更新预览", exact: true }).click());
    } finally { await otherPage.close(); }
    await slowAction("正在刷新预览…", () => page.getByRole("button", { name: "刷新预览", exact: true }).click());
    await slowAction("正在保存记录…", () => row.getByRole("button", { name: "确认保存", exact: true }).click());
    await page.getByRole("status").filter({ hasText: "已保存 1 · 待确认 1" }).waitFor();
    await slowAction("正在取消待处理记录…", () => page.getByRole("button", { name: "取消剩余", exact: true }).click());
    await page.getByRole("status").filter({ hasText: "已保存 1 · 待确认 0 · 已取消 1" }).waitFor();
    const secondBatch = await post([item(3), item(4)]);
    await page.goto(secondBatch.confirmationUrl); await page.getByRole("heading", { name: "审核身体记录", exact: true }).waitFor(); await ready();
    await slowAction("正在取消待处理记录…", () => page.locator(`[data-item-id="${secondBatch.items[0].id}"]`).getByRole("button", { name: "取消", exact: true }).click());
    await slowAction("正在保存记录…", () => page.getByRole("button", { name: "全部确认保存", exact: true }).click());
    await page.getByRole("status").filter({ hasText: "已保存 1 · 待确认 0 · 已取消 1" }).waitFor();
    await page.goto(`${baseURL}/dashboard/ai`); await page.getByRole("heading", { name: "AI 接入", exact: true }).waitFor(); await ready();
    await slowAction("正在撤销访问令牌…", () => page.getByRole("button", { name: "撤销", exact: true }).click());
    assert.equal(await page.getByRole("button", { name: "撤销", exact: true }).isDisabled(), true);
    await slowAction("正在退出登录…", () => page.getByRole("button", { name: "退出登录", exact: true }).click(), undefined, "abort");
    await page.getByRole("alert").filter({ hasText: "退出失败" }).waitFor();
    const assets = await holdNext(request => request.url().includes("/videos/golden-turn-1s.mp4"));
    const logout = await holdNext(request => request.method() === "POST" && request.url().endsWith("/api/auth/sign-out"));
    await page.getByRole("button", { name: "退出登录", exact: true }).click(); await logout.wait(); await assertLoading("正在退出登录…");
    await logout.release(); await page.waitForURL(`${baseURL}/`); await assets.wait();
    await assertLoading("正在加载登录页面…", "loading-login-assets");
    await assets.release(); await page.waitForSelector('main[data-images-ready="true"]'); await ready();
    await page.mouse.wheel(0, 80); await page.waitForSelector('main[data-phase="LOGIN_READY"]');
    await page.getByLabel("Email", { exact: true }).fill(account.email); await page.getByLabel("Password", { exact: true }).fill(account.password);
    const credentials = request => request.method() === "POST" && request.url().endsWith("/api/auth/sign-in/email");
    const failedLogin = await holdNext(credentials);
    await page.getByRole("button", { name: "ENTER", exact: true }).click(); await failedLogin.wait(); await assertLoading("正在验证登录…");
    await failedLogin.release("abort"); await ready(); await page.locator(".login-error").waitFor();
    assert.equal(await page.getByLabel("Email", { exact: true }).inputValue(), account.email);
    const successfulLogin = await holdNext(credentials);
    const dashboard = await holdNext(request => request.method() === "GET" && new URL(request.url()).pathname === "/dashboard" && request.headers()["rsc"] === "1" && !request.headers()["next-router-prefetch"]);
    await page.getByRole("button", { name: "ENTER", exact: true }).click(); await successfulLogin.wait(); await assertLoading("正在验证登录…");
    await successfulLogin.release(); await page.waitForSelector('main[data-phase="FINAL_TRANSITION"]'); await ready();
    assert.equal(new URL(page.url()).pathname, "/", "认证完成先展示原最终动画");
    await dashboard.wait(); await loading().waitFor();
    assert.match(await loading().innerText(), /正在加载(身体记录|页面)…/);
    await dashboard.release(); await page.getByRole("heading", { name: "身体记录", exact: true }).waitFor(); await ready();
    await page.goBack(); await ready(); await page.goForward(); await ready();
    const failedAssets = await holdNext(request => request.url().includes("/videos/golden-turn-1s.mp4"));
    await page.goto(baseURL, { waitUntil: "domcontentloaded" }); await failedAssets.wait(); await assertLoading("正在加载登录页面…");
    await failedAssets.release("abort"); await ready(); await page.getByText("动画加载失败，请刷新重试", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("通过：加载延迟、真实保存／估算／审核／导航／登录、最上层遮罩、失败草稿、滚动锁、窄屏与减少动态效果。");
  } catch (error) {
    console.log("加载验收诊断：", { warnings, requests: requests.slice(-8), buttons: await page.locator(".ai-review-page button").allTextContents() });
    throw error;
  } finally {
    await Promise.allSettled([...gates].map(gate => gate.release("abort")));
    await browser.close();
  }
}
