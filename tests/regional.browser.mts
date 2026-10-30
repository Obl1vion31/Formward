import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {eq} from "drizzle-orm";
import {regionalFixture} from "./regional-fixture.mjs";
import {session} from "../src/db/schema";
import {unlockAccountAdmin,manageAccount} from "../src/features/auth/account-management";
const fixture=await regionalFixture(),engine=process.env.FORMWARD_REGIONAL_BROWSER??"chromium";
const playwright=await import(process.env.PLAYWRIGHT_MODULE??"/tmp/formward-account-tooling/node_modules/playwright/index.mjs");
const browser=await playwright[engine].launch({headless:true}),artifacts=resolve(".codex/regional-visual",engine);await mkdir(artifacts,{recursive:true});
const errors:string[]=[],checks:string[]=[],screenshots:string[]=[];
let captureFailure:(()=>Promise<void>)|undefined;
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900},reducedMotion:"reduce"});
 const page=await context.newPage();captureFailure=async()=>{await page.screenshot({path:resolve(artifacts,"failure.png")});await writeFile(resolve(artifacts,"failure.html"),await page.content());};page.on("pageerror",(error:Error)=>errors.push(error.message));
 type Context=typeof context;
 async function login(target:Context,origin:string,credentials=fixture.person){
  const response=await target.request.post(origin+"/api/auth/sign-in/email",{headers:{Origin:origin},data:credentials});assert.equal(response.status(),200,await response.text());
 }
 async function shot(name:string){await page.evaluate(()=>document.fonts.ready);const path=resolve(artifacts,name+".png");await page.screenshot({path});screenshots.push(path);}
 await page.goto(fixture.selector);await page.getByRole("heading",{name:"选择访问地区"}).waitFor();
 for(const [width,height]of [[1440,900],[320,560],[390,640],[430,780],[844,390]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot("selector-"+width+"x"+height);
 }
 await page.evaluate(()=>localStorage.setItem("formward-region","global"));await page.reload();await page.getByText("上次选择",{exact:true}).waitFor();assert.equal(page.url(),fixture.selector+"/");
 await page.keyboard.press("Tab");assert.equal(await page.locator("a:focus-visible").count(),1);checks.push("选择页五组视口、键盘焦点、记住选择但不自动导航");
 await login(context,fixture.cn);const unsigned=await context.request.get(fixture.global+"/api/auth/get-session");assert.equal(await unsigned.json(),null);
 await login(context,fixture.global);
 const cookies=await context.cookies();assert.ok(cookies.some((v:{domain:string})=>v.domain==="localhost"));assert.ok(cookies.some((v:{domain:string})=>v.domain==="127.0.0.1"));
 checks.push("两个HTTPS入口分别登录，Cookie按主机隔离");
 for(const origin of [fixture.cn,fixture.global]){
  await page.setViewportSize({width:1440,height:900});
  for(const path of ["/dashboard","/dashboard/meals","/dashboard/energy","/dashboard/measurements"]){
   await page.goto(origin+path);await page.locator("main").waitFor();assert.equal(new URL(page.url()).pathname,path);
   const name=path.split("/").pop()||"overview";await shot((origin===fixture.cn?"cn":"global")+"-"+name+"-desktop");
  }
  await page.goto(origin+"/dashboard/ai");assert.equal(await page.getByLabel("MCP 服务器地址").inputValue(),fixture.global+"/api/mcp");
 }
 for(const [width,height]of [[320,560],[390,640],[430,780],[844,390]]){
  await page.setViewportSize({width,height});
  for(const path of ["/dashboard","/dashboard/meals","/dashboard/energy","/dashboard/measurements"]){await page.goto(fixture.cn+path);await page.locator("main").waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot("cn-"+path.split("/").pop()+"-"+width+"x"+height);}
 }
 checks.push("两区四业务页面与固定MCP地址、320／390／430手机及触屏横屏截图");
 const call=await context.request.post(fixture.global+"/api/mcp",{headers:{Authorization:"Bearer "+fixture.oldTokens.access_token,Accept:"application/json, text/event-stream"},data:{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_profile",arguments:{}}}});
 assert.equal(call.status(),200,await call.text());assert.ok((await call.text()).includes(fixture.personId));checks.push("架构切换前签发的OAuth访问令牌通过production入口和内部JWKS验证");
 const refreshed=await context.request.post(fixture.global+"/api/auth/oauth2/token",{form:{grant_type:"refresh_token",client_id:fixture.clientId,refresh_token:fixture.oldTokens.refresh_token,resource:fixture.global+"/api/mcp"}});
 assert.equal(refreshed.status(),200,await refreshed.text());const currentTokens=await refreshed.json();assert.ok(currentTokens.access_token);checks.push("原OAuth刷新令牌经真实国际网关轮换，issuer与resource保持");
 const ownerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:640}});
 await login(ownerContext,fixture.cn,fixture.owner);await login(ownerContext,fixture.global,fixture.owner);
 const ownerPage=await ownerContext.newPage();ownerPage.on("pageerror",(error:Error)=>errors.push(error.message));await ownerPage.goto(fixture.cn+"/admin");await ownerPage.getByRole("heading",{name:"输入密码以继续管理"}).waitFor();
 await ownerPage.getByLabel("当前密码",{exact:true}).fill(fixture.owner.password);await ownerPage.getByRole("button",{name:"验证并进入"}).click();await ownerPage.getByRole("textbox",{name:"搜索登录邮箱"}).waitFor();
 await ownerPage.getByRole("textbox",{name:"搜索登录邮箱"}).fill("regional");await ownerPage.getByRole("button",{name:"搜索",exact:true}).click();
 await ownerPage.goto(fixture.global+"/admin");await ownerPage.getByRole("heading",{name:"输入密码以继续管理"}).waitFor();checks.push("owner国内再次验密不解锁国际会话");
 const [ownerSession]=await fixture.db.select().from(session).where(eq(session.userId,fixture.ownerId)).orderBy(session.createdAt);
 assert.ok(ownerSession);
 const proof={userId:fixture.ownerId,sessionId:ownerSession.id,accessVersion:ownerSession.accessVersion};
 await unlockAccountAdmin(fixture.db,proof,fixture.owner.password,"fictional-browser");
 await manageAccount(fixture.db,proof,fixture.personId,"suspend","虚构停用验收",crypto.randomUUID());
 for(const origin of [fixture.cn,fixture.global]){const result=await context.request.get(origin+"/api/auth/get-session");assert.equal(await result.json(),null);}
 const revoked=await context.request.post(fixture.global+"/api/mcp",{headers:{Authorization:"Bearer "+currentTokens.access_token,Accept:"application/json, text/event-stream"},data:{jsonrpc:"2.0",id:2,method:"tools/list",params:{}}});assert.equal(revoked.status(),401);
 await manageAccount(fixture.db,proof,fixture.personId,"restore","",crypto.randomUUID());
 for(const origin of [fixture.cn,fixture.global]){const result=await context.request.get(origin+"/api/auth/get-session");assert.equal(await result.json(),null);}
 checks.push("停用撤销两区网页和旧OAuth；恢复不复活原会话");
 await login(context,fixture.cn);await page.goto(fixture.cn+"/dashboard/account");await page.getByRole("heading",{name:"账号设置",exact:true}).waitFor();
 await page.getByLabel("当前密码",{exact:true}).fill(fixture.person.password);await page.getByLabel("新密码",{exact:true}).fill("fictional-new-regional-password");await page.getByLabel("确认新密码",{exact:true}).fill("fictional-new-regional-password");
 await shot("account-before-password-change");await page.getByRole("button",{name:"修改密码",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.waitFor();await shot("account-password-confirm");await dialog.getByRole("button",{name:/修改.*退出|修改.*登录|确认修改/}).click();await page.waitForURL(fixture.cn+"/",{timeout:20000});
 const failedOld=await context.request.post(fixture.global+"/api/auth/sign-in/email",{headers:{Origin:fixture.global},data:fixture.person});assert.ok(failedOld.status()>=400);
 await login(context,fixture.global,{...fixture.person,password:"fictional-new-regional-password"});checks.push("国内Server Action修改密码后，国际旧密码失效、新密码可登录");
 assert.deepEqual(errors,[]);await writeFile(resolve(artifacts,"report.json"),JSON.stringify({engine,checks,screenshots,errors,notTested:["真实COS","公网跨境网络","真实iOS软键盘","正式证书续期"]},null,2));console.log(JSON.stringify({engine,checks,screenshotCount:screenshots.length}));
 await ownerContext.close();await context.close();
} catch(error){
 await captureFailure?.().catch(()=>{});
 await writeFile(resolve(artifacts,"failure.json"),JSON.stringify({error:error instanceof Error?error.stack:String(error),errors,checks},null,2));await writeFile(resolve(artifacts,"server.log"),fixture.serverLog());throw error;
}finally{await browser.close();await fixture.close();}
