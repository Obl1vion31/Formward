import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const tools = await import("/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");

/** 所有写入只在调用方提供的本机隔离虚构账号内执行。 */
export async function checkMeasurementsBrowser(options) {
  const {baseURL,first,entryAccount}=options;
  assert.equal(new URL(baseURL).hostname,"127.0.0.1");
  const folder=process.env.FORMWARD_BODY_ARTIFACTS??".codex/body-retirement/forms";
  await mkdir(folder,{recursive:true});
  const browser=await tools.chromium.launch({headless:true}),errors=[];
  try {
    const login=await browser.newContext();
    assert.equal((await login.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:first})).status(),200);
    const storageState=await login.storageState();await login.close();
    for(const [width,height] of (process.env.FORMWARD_BODY_FLOW_ONLY==="1"?[]:[[320,560],[390,640],[430,780],[640,390],[1100,800],[1440,900],[1920,1080]])) {
      for(const theme of ["light","dark"]) {
        const context=await browser.newContext({storageState,viewport:{width,height},hasTouch:width<1000,locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});
        await context.addInitScript(value=>localStorage.setItem("formward-theme",value),theme);
        const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
        await page.goto(baseURL+"/dashboard/measurements",{waitUntil:"networkidle"});
        await page.getByText("最近记录",{exact:true}).waitFor();
        assert.equal(await page.getByRole("button",{name:/估算|估计补全/}).count(),0);
        assert.equal(await page.locator('[data-kind="estimated"],[data-estimate-value]').count(),0);
        assert.equal(await page.getByLabel("晚间数据",{exact:true}).count(),1);
        assert.ok(!/估算规则|原估计|填实测/.test(await page.locator("main").innerText()));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.screenshot({path:folder+"/"+theme+"-body-"+width+"x"+height+".png"});
        await context.close();
      }
    }
    // 真实表单：缺测无估算操作，录入、保存、刷新均沿用实测流程。
    const credentials=entryAccount??first,context=await browser.newContext({storageState,viewport:{width:390,height:780},hasTouch:true,locale:"zh-CN",timezoneId:"Asia/Shanghai",recordVideo:{dir:folder+"/videos",size:{width:390,height:780}}});
    if(credentials.email!==first.email)assert.equal((await context.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:credentials})).status(),200);
    const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
    const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai"}).format(new Date());
    await page.goto(baseURL+"/dashboard/measurements?date="+date+"&intent=edit",{waitUntil:"networkidle"});
    const form=page.getByRole("form",{name:"当天身体录入"});await form.waitFor();
    assert.equal(await form.getByRole("button",{name:/估算/}).count(),0);
    const field=form.getByRole("spinbutton",{name:"晨间体重",exact:true});
    const before=await field.inputValue(),next=(Number(before||70)+.1).toFixed(2);
    await field.fill(next);
    const source=form.getByRole("combobox",{name:"晨间数据来源",exact:true});
    if(await source.count())await source.fill("虚构验收体重秤");
    await form.getByRole("button",{name:"保存录入",exact:true}).click();
    await form.getByRole("button",{name:"保存录入",exact:true}).waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({path:folder+"/body-save.png"});
    assert.ok(!(await form.innerText()).includes("保存未完成"));
    await page.reload({waitUntil:"networkidle"});
    await page.getByRole("form",{name:"当天身体录入"}).waitFor();
    assert.equal(Number(await page.getByRole("spinbutton",{name:"晨间体重",exact:true}).inputValue()),Number(next));
    await page.keyboard.press("Escape");await page.locator("dialog[open]").waitFor({state:"hidden"});await page.waitForTimeout(400);
    await page.getByRole("button",{name:"身体设置",exact:true}).first().click();
    const fat=page.getByRole("switch",{name:"显示体脂率",exact:true});await fat.waitFor();
    await fat.uncheck();await page.waitForTimeout(500);await page.keyboard.press("Escape");await page.locator("dialog[open]").waitFor({state:"hidden"});
    assert.ok(!(await page.locator("[data-record-slot=metrics]").innerText()).includes("晨间体脂率"));
    await page.screenshot({path:folder+"/body-weight-only.png"});
    await page.getByRole("button",{name:"身体设置",exact:true}).first().click();await page.getByRole("switch",{name:"显示体脂率",exact:true}).check();await page.waitForTimeout(500);await page.keyboard.press("Escape");await page.locator("dialog[open]").waitFor({state:"hidden"});
    assert.ok((await page.locator("[data-record-slot=metrics]").innerText()).includes("晨间体脂率"));
    await page.screenshot({path:folder+"/body-weight-and-fat.png"});
    await page.goto(baseURL+"/dashboard",{waitUntil:"networkidle"});
    const card=page.locator('[data-metric-card="morning-weight"]');await card.click();await page.waitForLoadState("networkidle");await page.waitForTimeout(700);await page.goBack({waitUntil:"networkidle"});await page.waitForTimeout(700);
    assert.equal(await page.locator("[data-chart-flight]:visible").count(),0);
    await context.close();
    assert.deepEqual(errors,[]);
    return {screens:process.env.FORMWARD_BODY_FLOW_ONLY==="1"?0:14,savedAndReloaded:true,fictional:true,folder};
  } finally {await browser.close();}
}
