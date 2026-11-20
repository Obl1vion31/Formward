import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";

export async function checkPageLoadingBrowser({baseURL,account,date}){
  assert.equal(new URL(baseURL).hostname,"127.0.0.1");
  assert.ok(account.email.endsWith("@example.test"));
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??"playwright");
  const browser=await chromium.launch({headless:true});
  const artifacts=process.env.FORMWARD_MEASUREMENTS_ARTIFACTS??"/tmp/formward-loading-visual";
  await mkdir(artifacts,{recursive:true});
  const signIn=await browser.newContext();
  const login=await signIn.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:account});
  assert.equal(login.status(),200);
  const storageState=await signIn.storageState();
  await signIn.close();

  try{
    for(const viewport of [{width:1440,height:900},{width:390,height:780}]){
      const context=await browser.newContext({storageState,viewport,timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});
      const page=await context.newPage();
      let intercepted;
      try{
        await page.goto(baseURL+"/dashboard/measurements?entry=daytime&date="+date);
        const entry=page.locator('dialog[open] form[data-entry-form="body"]');
        const weight=entry.getByRole("textbox",{name:"晨间体重",exact:true});
        await entry.waitFor();
        const field=await weight.count()?weight:entry.locator("input:visible").first();
        await field.fill(viewport.width===1440?"70.31":"70.32");
        const submit=entry.locator("[data-entry-primary-action]");
        let captured;
        let resume;
        const requested=new Promise(done=>{captured=done;});
        const paused=new Promise(done=>{resume=done;});
        intercepted=resume;
        const routeAction=async route=>{
          if(route.request().method()!=="POST"||!route.request().headers()["next-action"]){await route.continue();return;}
          captured();
          await paused;
          await route.abort("failed");
        };
        await page.route("**/*",routeAction);
        await submit.click();
        let timeout;
        try {await Promise.race([requested,new Promise((_,fail)=>{timeout=setTimeout(()=>fail(Error("未捕获实际保存请求")),8000);})]);}
        finally{clearTimeout(timeout);}
        await page.waitForTimeout(500);
        assert.match(await submit.innerText(),/正在保存/);
        assert.equal(await submit.isEnabled(),false);
        assert.equal(await page.locator("dialog[open]").count(),1,"等待期间只有录入面板");
        assert.equal(await page.locator(".page-loading-dialog,.module-skeleton,.skeleton-block").count(),0);
        await page.screenshot({path:artifacts+"/body-save-"+viewport.width+".png"});
        resume();
        await entry.getByRole("alert").first().waitFor();
        assert.equal(await field.inputValue(),viewport.width===1440?"70.31":"70.32");
        await page.unroute("**/*",routeAction);
      }finally{
        intercepted?.();
        await context.close();
      }
    }
  }finally{
    await browser.close();
  }
}
