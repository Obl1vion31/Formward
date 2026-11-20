import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";

export async function checkEnergyDraftGuard({baseURL,today,accounts,artifacts}){
 const engine=process.env.FORMWARD_ESTIMATE_ENGINE??"chromium",engines=await import(process.env.PLAYWRIGHT_MODULE??"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
 const browser=await engines[engine].launch({headless:true}),auth=await browser.newContext(),reports=[],errors=[];
 assert.equal((await auth.request.post(baseURL+"/api/auth/sign-in/email",{headers:{Origin:baseURL},data:{email:accounts[0].email,password:accounts[0].password}})).status(),200);
 const storageState=await auth.storageState();await auth.close();
 try{for(const theme of ["dark","light"])for(const width of [390,1440]){
  const context=await browser.newContext({storageState,viewport:{width,height:900},locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce"}),page=await context.newPage(),checks=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.addInitScript((theme)=>{localStorage.setItem("formward-theme",theme);},theme);
  const form=page.locator('[data-entry-form=energy]'),confirmation=page.getByRole("dialog",{name:"放弃尚未保存的输入？",exact:true});
  async function settle(){await page.waitForLoadState("networkidle");await page.waitForTimeout(750);await page.waitForLoadState("networkidle");}
  async function open(slow=false){
   if(page.url().startsWith(baseURL))await settle();
   if(slow)await page.route("**/dashboard/energy*",async route=>{if(route.request().method()==="POST")await new Promise(done=>setTimeout(done,600));await route.continue();});
   const response=await page.goto(baseURL+"/dashboard/energy?entry=1&date="+today);await response.finished();await page.getByRole("group",{name:"记录方式",exact:true}).waitFor();
   if(!slow)await settle();
  }
  async function closeClean(label){await page.getByRole("button",{name:"关闭编辑",exact:true}).click();assert.equal(await confirmation.isVisible(),false,label+"不应要求放弃输入");await form.waitFor({state:"hidden"});checks.push(label);}
  async function protect(label){await page.getByRole("button",{name:"关闭编辑",exact:true}).click();await confirmation.waitFor();await confirmation.getByRole("button",{name:"继续编辑",exact:true}).click();assert.equal(await form.isVisible(),true);checks.push(label);}
  async function shot(label){await page.screenshot({path:resolve(artifacts,engine+"-"+theme+"-"+width+"-"+label+".png")});}
  try{
   await open();await closeClean("自动静息预览");
   await open();
   for(const method of ["手动输入","从设备同步","帮我估算","手动输入","帮我估算"]){await page.getByRole("button",{name:method,exact:true}).click();await settle();}
   await page.getByRole("button",{name:"计算设置",exact:true}).click();
   for(const formula of ["cunningham","mifflin-st-jeor","auto"])await page.getByLabel("静息计算公式",{exact:true}).selectOption(formula);
   await page.keyboard.press("Escape");await settle();await shot("preview");await closeClean("切换记录方式与公式");
   await open(true);await page.getByRole("button",{name:"手动输入",exact:true}).click();await settle();await page.unroute("**/dashboard/energy*");await closeClean("慢读取后只切换方式");
   await open();await page.getByRole("button",{name:"手动输入",exact:true}).click();await settle();
   const activity=page.getByLabel("活动合计 · 千卡",{exact:true});await activity.fill("100");await protect("手填活动100");assert.equal(await activity.inputValue(),"100");
   await page.getByRole("button",{name:"帮我估算",exact:true}).click();await settle();await protect("隐藏的手填活动");
   await page.getByRole("button",{name:"手动输入",exact:true}).click();assert.equal(await activity.inputValue(),"100");await activity.fill("");
   await page.getByRole("button",{name:"只有总数？",exact:true}).click();await page.getByRole("button",{name:"分开填写",exact:true}).click();await settle();await closeClean("活动删回空白与空格式缓存");
   await open();await page.getByRole("button",{name:"手动输入",exact:true}).click();await settle();await activity.fill("0");await protect("明确活动0");await activity.fill("");
   await page.locator("summary").filter({hasText:"来源与备注"}).click();const notes=page.getByLabel("消耗备注",{exact:true});await notes.fill("待保存备注");await protect("备注输入");await notes.fill("");await closeClean("备注清空恢复");
   await open();await page.getByRole("radio",{name:/久坐少动/}).check();await protect("选定全天活动档位");await shot("protected");
   await page.getByRole("button",{name:"关闭编辑",exact:true}).click();await confirmation.getByRole("button",{name:"放弃修改",exact:true}).click();await form.waitFor({state:"hidden"});
   reports.push({theme,width,checks});
  }catch(error){await shot("failure");await writeFile(resolve(artifacts,engine+"-draft-failure.json"),JSON.stringify({theme,width,checks,error:String(error),errors},null,2));throw error;}finally{await settle();await context.close();}
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(artifacts,engine+"-draft-guard.json"),JSON.stringify({engine,reports,errors,passed:true},null,2));console.log(JSON.stringify({engine,scenarios:reports.length,checks:reports.reduce((sum,row)=>sum+row.checks.length,0),passed:true}));
 }finally{await browser.close();}
}
