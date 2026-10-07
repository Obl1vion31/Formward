import assert from "node:assert/strict";

// 仅使用 HTTP 验收建立的虚构账号，检查表格录入及真实／估计写入顺序。
export async function checkMeasurementEntry({ loggedInPage, entryAccount, today, artifacts, baseURL }) {
  const { page, context } = await loggedInPage({ width: 1440, height: 1000 }, entryAccount);
  const form = () => page.getByRole("form", { name: "当天四项录入" });
  const missing = () => form().locator('[data-entry-cell][data-kind="missing"]');
  const close = async () => { await page.getByRole("button", { name: "关闭记录详情" }).click(); await page.locator("dialog").waitFor({ state: "detached" }); };
  const save = async () => { await form().getByRole("button", { name: "保存录入", exact: true }).click(); await form().getByRole("status").waitFor(); assert.equal(await form().getByRole("alert").count(), 0); };
  const openToday = async () => {
    await page.locator(`section[aria-label="最近记录"] tr[data-date="${today}"]`).getByRole("button", { name: new RegExp(`^(录入|编辑) ${today}$`) }).click();
    await form().waitFor();
    await page.waitForFunction(() => document.querySelector("dialog")?.dataset.motion === "open");
  };
  try {
    await page.locator(`tr[data-date="${today}"]`).waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.locator("dialog").count(), 0, "缺项不会自动弹出");
    assert.equal(await page.getByRole("button", { name: "录入今天", exact: true }).count(), 0);
    await openToday();
    assert.equal(await form().getByRole("combobox", { name: "晨间空腹条件" }).count(), 0);
    assert.equal(await form().getByRole("button", { name: "今天不录入" }).count(), 0);
    assert.equal(await form().getByText("未填项保持空白。估计仅辅助趋势，并非实际测量。", { exact: true }).count(), 0);
    assert.equal(await form().evaluate(node => node.lastElementChild.querySelector('button')?.textContent), "保存录入");
    const decoration = await form().getByRole("button", { name: "保存录入", exact: true }).evaluate(node => {
      const style = getComputedStyle(node); return { line: style.textDecorationLine, offset: style.textUnderlineOffset, height: node.getBoundingClientRect().height };
    });
    assert.equal(decoration.line, "underline"); assert.equal(decoration.offset, "4px"); assert.ok(decoration.height >= 44);
    assert.equal(await missing().count(), 4);
    assert.equal(await form().getByRole("textbox").count(), 4, "每日四项直接输入，无 BMI 表单");
    for (const cell of await missing().all()) {
      assert.equal(await cell.locator("input + button").count(), 1, "估算紧贴每个空项输入框");
    }
    assert.equal(await form().getByRole("combobox", { name: "晨间数据来源" }).inputValue(), "虚构默认秤-应用");
    assert.equal(await form().getByRole("combobox", { name: "晚间数据来源" }).inputValue(), "虚构默认秤-应用");
    assert.equal(await form().getByText("BMI", { exact: false }).count(), 0);
    await page.screenshot({ path: `${artifacts}/entry-desktop-form.png` });
    await close();
    await openToday();
    assert.equal(await missing().count(), 4, "关闭表单不产生测量");
    await form().getByRole("textbox", { name: "晨间体重", exact: true }).fill("70.20");
    assert.equal(await form().getByRole("button", { name: "估算晚间体重" }).isDisabled(), true, "先保存实测草稿，再估算");
    const morningSource = form().getByRole("combobox", { name: "晨间数据来源" });
    await morningSource.fill("");
    await form().getByRole("button", { name: "保存录入", exact: true }).click();
    await form().getByRole("alert").waitFor();
    assert.match(await form().getByRole("alert").innerText(), /数据来源/);
    assert.equal(await form().getByRole("textbox", { name: "晨间体重", exact: true }).inputValue(), "70.20");
    await morningSource.fill("虚构晨间新来源");
    await save();
    assert.equal(await missing().count(), 3);
    assert.equal(await form().locator('[data-entry-cell="daytime:weightKg"][data-kind="observed"]').count(), 1);
    await close();
    assert.equal(await page.locator(`[data-date="${today}"][data-kind="estimated"]`).count(), 0, "部分保存不自动估计");
    await page.reload(); await openToday();
    assert.equal(await missing().count(), 3, "再次进入表格编辑保留剩余三项");
    assert.equal(await form().getByRole("textbox", { name: "晨间体重", exact: true }).inputValue(), "70.20", "编辑直接呈现已保存实测");
    await form().getByRole("textbox", { name: "晚间体脂率", exact: true }).fill("20.60");
    const eveningSource = form().getByRole("combobox", { name: "晚间数据来源" });
    assert.equal(await eveningSource.inputValue(), "虚构晨间新来源", "空时段默认最近成功使用的来源");
    await eveningSource.fill("虚构默认"); await eveningSource.press("ArrowDown");
    assert.equal(await eveningSource.getAttribute("aria-expanded"), "true");
    await eveningSource.press("Escape"); assert.equal(await eveningSource.getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("dialog").count(), 1, "来源 Escape 只关闭建议");
    await eveningSource.press("ArrowDown"); await eveningSource.press("Enter");
    assert.equal(await eveningSource.inputValue(), "虚构默认秤-应用");
    await save();
    assert.equal(await missing().count(), 2, "晚间仅体脂独立保存");
    await form().getByRole("button", { name: "估算晚间体重", exact: true }).click();
    await form().locator('[data-entry-cell="evening:weightKg"][data-kind="estimated"]').waitFor();
    assert.match(await form().locator('[data-entry-cell="evening:weightKg"]').innerText(), /70\.70/);
    assert.equal(await missing().count(), 1, "只估算所点指标，晨间体脂仍为空");
    await close(); await page.reload(); await openToday();
    assert.equal(await missing().count(), 1, "估计算作已填");
    assert.equal(await form().getByRole("combobox", { name: "晨间数据来源" }).inputValue(), "虚构晨间新来源");
    assert.equal(await form().getByRole("combobox", { name: "晚间数据来源" }).inputValue(), "虚构默认秤-应用");
    await form().getByRole("combobox", { name: "晨间数据来源" }).fill("虚构仅改来源");
    await save();
    assert.equal(await form().getByRole("textbox", { name: "晨间体重" }).inputValue(), "70.20");
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
    await close(); await page.reload();
    await page.locator(`tr[data-date="${today}"]`).waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.locator("dialog").count(), 0, "刷新及部分保存后都不弹出提醒");
    await openToday(); assert.equal(await missing().count(), 1, "表格入口仍可补录");
    await close();
    for (const offset of [4, 5]) {
      const date = new Date(Date.parse(`${today}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);
      await page.locator(`section[aria-label="最近记录"] tr[data-date="${date}"]`).getByRole("button", { name: `编辑 ${date}`, exact: true }).click();
      await form().waitFor();
      assert.match(await form().innerText(), /原记录非空腹或空腹条件未确认，保留只读/);
      assert.equal(await form().getByRole("textbox", { name: "晨间体重", exact: true }).count(), 0);
      assert.equal(await form().getByRole("textbox", { name: "晨间体脂率", exact: true }).count(), 0);
      assert.equal(await form().getByRole("textbox", { name: "晚间体重", exact: true }).isEnabled(), true);
      await close();
    }
    console.log("通过：统一表格编辑、晨间空腹及旧条件只读、部分录入、逐项估算与实测替代。");

    // 从完整历史的日历空行补录，旧日期无需新增入口。
    const blankDate = new Date(Date.parse(`${today}T00:00:00Z`) - 55 * 86_400_000).toISOString().slice(0, 10);
    assert.equal(await page.getByRole("button", { name: /新增日期/ }).count(), 0);
    await page.getByRole("button", { name: "查看全部", exact: false }).click();
    const history = page.getByRole("dialog");
    assert.equal(await history.locator('details:has(> summary time)').count(), 50);
    for (let batch = 0; !(await history.locator(`summary time[datetime="${blankDate}"]`).count()); batch++) {
      assert.ok(batch < 25, "日历加载应到达已知最早日期");
      const before = await history.locator('details:has(> summary time)').count();
      await history.getByRole("button", { name: "加载更早日期", exact: true }).click();
      const after = await history.locator('details:has(> summary time)').count();
      assert.ok(after > before && after <= before + 50, "每次最多加载 50 个更早日期");
    }
    console.log("通过：完整历史每批加载 50 个日期，已到达较早漏记日期。");
    const blank = history.locator(`details:has(> summary time[datetime="${blankDate}"])`);
    await blank.locator("summary").click();
    await blank.getByRole("button", { name: `补录 ${blankDate}`, exact: true }).click();
    await form().waitFor(); assert.equal(await missing().count(), 4);
    await form().getByRole("textbox", { name: "晨间体脂率", exact: true }).fill("21.20");
    await save();
    await page.getByRole("button", { name: "← 返回完整历史", exact: true }).click();
    assert.equal(await blank.getAttribute("open"), "", "补录返回保留历史展开状态");
    await close();
    await page.reload();
    await page.getByRole("button", { name: "自定义日期", exact: true }).click();
    await page.getByLabel("起始日期", { exact: true }).fill(blankDate);
    await page.getByLabel("结束日期", { exact: true }).fill(blankDate);
    await page.getByRole("button", { name: "应用", exact: true }).click();
    const blankRow = page.locator(`section[aria-label="最近记录"] tr[data-date="${blankDate}"]`);
    await blankRow.getByRole("button", { name: `查看 ${blankDate} 晨间体脂率实测记录`, exact: true }).click();
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
    console.log("通过：历史空行仅体脂补录、来源保留与编辑返回。");

    for (const width of [390, 320]) {
      const mobile = await loggedInPage({ width, height: 844 }, entryAccount, { isMobile: true, hasTouch: true });
      await mobile.page.locator(`section[aria-label="最近记录"] tr[data-date="${today}"]`).getByRole("button", { name: new RegExp(`^(录入|编辑) ${today}$`) }).tap();
      const mobileForm = mobile.page.getByRole("form", { name: "当天四项录入" });
      await mobileForm.waitFor();
      await mobile.page.waitForFunction(() => document.querySelector("dialog")?.dataset.motion === "open");
      const panel = await mobile.page.getByRole("dialog").boundingBox();
      assert.ok(Math.abs(panel.x) < 1 && Math.abs(panel.width - width) < 1, "手机 Inspector 完全展开后占满屏幕");
      assert.equal(await mobileForm.locator('[data-entry-cell][data-kind="missing"]').count(), 1);
      const layout = await mobileForm.evaluate(node => {
        const buttons = [...node.querySelectorAll('button')].filter(button => button.getClientRects().length);
        return { pageOverflow: document.documentElement.scrollWidth > innerWidth, formOverflow: node.scrollWidth > node.clientWidth,
          heights: buttons.map(button => button.getBoundingClientRect().height) };
      });
      assert.equal(layout.pageOverflow, false); assert.equal(layout.formOverflow, false);
      assert.ok(layout.heights.every(height => height >= 44), "移动端所有表单操作保持触控尺寸");
      const overview = mobile.page.getByRole("region", { name: "当天晨晚概览" });
      const overviewRect = await overview.boundingBox();
      assert.ok(overviewRect.y >= 0 && overviewRect.y + overviewRect.height < 844, "手机首屏显示完整晨晚概览");
      const source = mobileForm.getByRole("combobox", { name: "晨间数据来源" });
      await source.fill("虚构默认");
      await mobileForm.getByRole("option", { name: "虚构默认秤-应用" }).tap();
      assert.equal(await source.inputValue(), "虚构默认秤-应用");
      await mobile.page.screenshot({ path: `${artifacts}/entry-mobile-${width}.png` });
      await mobile.page.getByRole("button", { name: "← 返回身体记录", exact: true }).tap();
      await mobile.page.locator("dialog").waitFor({ state: "detached" });
      await mobile.page.getByRole("button", { name: "自定义日期", exact: true }).click();
      await mobile.page.getByLabel("起始日期", { exact: true }).fill("2024-02-27");
      await mobile.page.getByLabel("结束日期", { exact: true }).fill("2024-03-02");
      await mobile.page.getByRole("button", { name: "应用", exact: true }).click();
      const rows = mobile.page.locator('section[aria-label="最近记录"] tbody tr');
      assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.date)), ["2024-03-02", "2024-03-01", "2024-02-29", "2024-02-28", "2024-02-27"]);
      const cells = await rows.evaluateAll(nodes => nodes.map(node => ({ height: node.getBoundingClientRect().height, count: node.cells.length, overflow: [...node.cells].some(cell => cell.scrollWidth > cell.clientWidth + 1) })));
      assert.ok(cells.every(row => row.count === 5 && !row.overflow && row.height === cells[0].height), "连续空行与闰年日期仍五列对齐，无单元格溢出");
      await mobile.page.screenshot({ path: `${artifacts}/calendar-mobile-${width}.png`, fullPage: true });
      const blankLeap = rows.filter({ has: mobile.page.locator('time[datetime="2024-02-29"]') });
      await blankLeap.getByRole("button", { name: "查看 2024-02-29", exact: true }).tap();
      await mobile.page.getByRole("region", { name: "当天晨晚概览" }).waitFor();
      assert.equal(await mobileForm.count(), 0, "空日期查看保留空概览，不自动录入");
      assert.equal(await mobile.page.locator('[data-period-details][open]').count(), 0);
      await mobile.page.getByRole("button", { name: "关闭记录详情" }).tap();
      await mobile.page.locator("dialog").waitFor({ state: "detached" });
      await blankLeap.getByRole("button", { name: "补录 2024-02-29", exact: true }).tap();
      await mobileForm.waitFor();
      assert.equal(await mobileForm.locator('[data-entry-cell][data-kind="missing"]').count(), 4);
      await mobile.context.close();
    }
    await page.getByRole("button", { name: "30D", exact: true }).click();
    await openToday();
    await form().getByRole("textbox", { name: "晨间体脂率", exact: true }).fill("20.10");
    const signedOut = await context.request.post(`${baseURL}/api/auth/sign-out`, { headers: { Origin: baseURL }, data: {} });
    assert.equal(signedOut.status(), 200);
    await form().getByRole("button", { name: "保存录入", exact: true }).click();
    await form().getByRole("alert").waitFor();
    assert.match(await form().getByRole("alert").innerText(), /登录/);
    assert.equal(await form().getByRole("textbox", { name: "晨间体脂率", exact: true }).inputValue(), "20.10", "会话过期仍保留草稿");
    console.log("通过：四格直接录入与相邻逐项估算、部分保存／仅体脂、无自动提醒、空腹约束、日历空行、50 日历史加载与补录、历史编辑、移动触控和失效会话。");
  } finally { await context.close(); }
}
