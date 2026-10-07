import assert from "node:assert/strict";

// 仅使用 HTTP 验收建立的虚构账号；日期与服务器一致，验证今日提醒的持久化。
export async function checkMeasurementEntry({ loggedInPage, entryAccount, today, artifacts, baseURL }) {
  const { page, context } = await loggedInPage({ width: 1440, height: 1000 }, entryAccount);
  const form = () => page.getByRole("form", { name: "当天四项录入" });
  const missing = () => form().locator('[data-entry-cell][data-kind="missing"]');
  const close = async () => { await page.getByRole("button", { name: "关闭记录详情" }).click(); await page.locator("dialog").waitFor({ state: "detached" }); };
  const save = async () => { await form().getByRole("button", { name: "保存录入", exact: true }).click(); await form().getByRole("status").waitFor(); assert.equal(await form().getByRole("alert").count(), 0); };
  const openToday = async () => { await page.getByRole("button", { name: "录入今天", exact: true }).click(); await form().waitFor(); };
  try {
    await form().waitFor();
    assert.equal(await missing().count(), 4);
    assert.equal(await form().getByRole("textbox").count(), 4, "每日四项直接输入，BMI 默认折叠");
    for (const cell of await missing().all()) {
      assert.equal(await cell.locator("input + button").count(), 1, "估算紧贴每个空项输入框");
    }
    await page.screenshot({ path: `${artifacts}/entry-desktop-reminder.png` });
    await close();
    await openToday();
    assert.equal(await missing().count(), 4, "关闭提示不产生测量");
    await form().getByRole("textbox", { name: "晨间体重", exact: true }).fill("70.20");
    await form().getByRole("combobox", { name: "晨间空腹条件" }).selectOption("yes");
    assert.equal(await form().getByRole("button", { name: "估算晚间体重" }).isDisabled(), true, "先保存实测草稿，再估算");
    await save();
    assert.equal(await missing().count(), 3);
    assert.equal(await form().locator('[data-entry-cell="daytime:weightKg"][data-kind="observed"]').count(), 1);
    await close();
    assert.equal(await page.locator(`[data-date="${today}"][data-kind="estimated"]`).count(), 0, "部分保存不自动估计");
    await page.reload(); await form().waitFor();
    assert.equal(await missing().count(), 3, "再次访问只提示剩余三项");
    assert.equal(await form().getByRole("textbox", { name: "晨间体重", exact: true }).count(), 0, "已填项只读并保留编辑入口");
    await form().getByRole("textbox", { name: "晚间体脂率", exact: true }).fill("20.60");
    await save();
    assert.equal(await missing().count(), 2, "晚间仅体脂独立保存");
    await form().getByRole("button", { name: "估算晚间体重", exact: true }).click();
    await form().locator('[data-entry-cell="evening:weightKg"][data-kind="estimated"]').waitFor();
    assert.match(await form().locator('[data-entry-cell="evening:weightKg"]').innerText(), /70\.70/);
    assert.equal(await missing().count(), 1, "只估算所点指标，晨间体脂仍为空");
    await close(); await page.reload(); await form().waitFor();
    assert.equal(await missing().count(), 1, "估计算作已填，不重复提醒");
    await close();
    await page.locator(`section[aria-label="身体指标趋势"] [data-date="${today}"][data-period="evening"][data-kind="estimated"]`).click();
    await page.getByRole("article", { name: "记录详情" }).waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "编辑", exact: true }).click();
    await form().getByRole("textbox", { name: "晚间体重", exact: true }).fill("70.80");
    await save();
    assert.equal(await form().locator('[data-entry-cell="evening:weightKg"][data-kind="observed"]').count(), 1);
    assert.equal(await form().getByRole("textbox", { name: "晚间体脂率", exact: true }).inputValue(), "20.60", "补实测保留同一时段其他数据");
    await page.getByRole("button", { name: "← 返回记录详情", exact: true }).click();
    assert.equal(await page.locator('[data-inspector-record]').getAttribute("data-kind"), "observed", "替代估计后返回对应实测详情");
    assert.match(await page.locator('[data-record-value] strong').innerText(), /70\.80/);
    await page.getByRole("dialog").getByRole("button", { name: "编辑", exact: true }).click();
    await form().getByRole("button", { name: "今天不录入", exact: true }).click();
    await page.locator("dialog").waitFor({ state: "detached" });
    await page.reload();
    await page.getByRole("button", { name: "录入今天", exact: true }).waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.locator("dialog").count(), 0, "当天不录入在刷新后仍生效");
    await openToday(); assert.equal(await missing().count(), 1, "常驻入口仍可补录");
    await close();

    // 新建空白历史日，刷新仍有空行；不存在零值、隐式实测或估计。
    const blankDate = "2024-02-29";
    await page.getByRole("button", { name: /新增日期/ }).click();
    await page.getByLabel("新增记录日期", { exact: true }).fill(blankDate);
    await page.getByRole("button", { name: "添加日期", exact: true }).click();
    await form().waitFor(); assert.equal(await missing().count(), 4);
    await close();
    let blankRow = page.locator(`tr[data-date="${blankDate}"]`);
    assert.equal(await blankRow.count(), 1);
    for (const cell of await blankRow.locator("td").all()) assert.equal((await cell.innerText()).trim(), "—");
    await page.reload();
    await page.getByRole("button", { name: "全部", exact: true }).click();
    blankRow = page.locator(`tr[data-date="${blankDate}"]`);
    assert.equal(await blankRow.count(), 1, "空白历史日期持久保存");
    await blankRow.getByRole("button", { name: `录入 ${blankDate}`, exact: true }).click();
    await form().getByRole("textbox", { name: "晨间体脂率", exact: true }).fill("21.20");
    await save(); await close();
    await page.getByRole("button", { name: "体脂率", exact: true }).click();
    await page.locator(`section[aria-label="最近记录"] tr[data-date="${blankDate}"]`).getByRole("button", { name: `查看 ${blankDate} 白天实测记录`, exact: true }).click();
    const detail = page.getByRole("article", { name: "记录详情", exact: true });
    await detail.waitFor();
    const infoBefore = await detail.getByRole("region", { name: "记录信息" }).innerText();
    await page.getByRole("dialog").getByRole("button", { name: "编辑", exact: true }).click();
    await form().getByRole("textbox", { name: "晨间体脂率", exact: true }).fill("21.30");
    await save();
    await page.getByRole("button", { name: "← 返回记录详情", exact: true }).click();
    assert.match(await detail.locator('[data-record-value] strong').innerText(), /21\.30/);
    assert.equal(await detail.getByRole("region", { name: "记录信息" }).innerText(), infoBefore, "历史编辑保留日期时段、时间精度和来源");
    await close();

    for (const width of [390, 320]) {
      const mobile = await loggedInPage({ width, height: 844 }, entryAccount, { isMobile: true, hasTouch: true });
      await mobile.page.getByRole("button", { name: "录入今天", exact: true }).click();
      const mobileForm = mobile.page.getByRole("form", { name: "当天四项录入" });
      await mobileForm.waitFor();
      assert.equal(await mobileForm.locator('[data-entry-cell][data-kind="missing"]').count(), 1);
      const layout = await mobileForm.evaluate(node => {
        const buttons = [...node.querySelectorAll('button')].filter(button => button.getClientRects().length);
        return { pageOverflow: document.documentElement.scrollWidth > innerWidth, formOverflow: node.scrollWidth > node.clientWidth,
          heights: buttons.map(button => button.getBoundingClientRect().height) };
      });
      assert.equal(layout.pageOverflow, false); assert.equal(layout.formOverflow, false);
      assert.ok(layout.heights.every(height => height >= 44), "移动端所有表单操作保持触控尺寸");
      await mobile.page.screenshot({ path: `${artifacts}/entry-mobile-${width}.png` });
      await mobile.context.close();
    }
    await openToday();
    await form().getByRole("textbox", { name: "晨间体脂率", exact: true }).fill("20.10");
    const signedOut = await context.request.post(`${baseURL}/api/auth/sign-out`, { headers: { Origin: baseURL }, data: {} });
    assert.equal(signedOut.status(), 200);
    await form().getByRole("button", { name: "保存录入", exact: true }).click();
    await form().getByRole("alert").waitFor();
    assert.match(await form().getByRole("alert").innerText(), /登录/);
    assert.equal(await form().getByRole("textbox", { name: "晨间体脂率", exact: true }).inputValue(), "20.10", "会话过期仍保留草稿");
    console.log("通过：四格直接录入与相邻逐项估算、部分保存／仅体脂、剩余项提醒、关闭与当天跳过、空白日期、历史编辑、移动触控和失效会话。");
  } finally { await context.close(); }
}
