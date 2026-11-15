import assert from "node:assert/strict";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const config=JSON.parse(await readFile(process.env.FORMWARD_INFORMATION_CONFIG,"utf8"));
assert.equal(config.isolatedFixture,true,"只允许独立虚构账号 fixture");
const base=config.baseURL, baseline=process.env.FORMWARD_HOME_BASELINE;
const out=resolve(process.env.FORMWARD_INFORMATION_ARTIFACTS||".codex/more-information-qa");await mkdir(out,{recursive:true});
const engine=process.env.FORMWARD_INFORMATION_ENGINE||"chromium";
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");
const browser=await({chromium,webkit}[engine]).launch({headless:true});const reports=[],errors=[];
const version=(await(await fetch(base+"/api/app-version")).json()).version;
const beforeHealth=await(await fetch(config.fixtureControlURL+"/health-digest")).json();
const next=()=>new Promise(r=>setTimeout(r,60));
function contextOptions(width,height){return{viewport:{width,height},isMobile:width<=430||height<500,hasTouch:width<=430||height<500,reducedMotion:"reduce",locale:"zh-CN",timezoneId:"Asia/Shanghai"};}
async function ready(p){await p.waitForSelector('.home-page[data-images-ready="true"]');await p.evaluate(()=>document.fonts.ready);}
async function loginStage(p){await p.getByRole("button",{name:"进入登录",exact:true}).focus();await p.keyboard.press("Enter");await p.waitForSelector('.home-page[data-phase="LOGIN_READY"]');}
async function rects(p){return p.locator(".body-frame img").evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));}
async function footerCheck(p){const values=await p.locator('[data-home-footer]').evaluate(node=>{const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,targets:[...node.querySelectorAll('a,button')].map(n=>{const r=n.getBoundingClientRect();return{height:r.height,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})};});assert.ok(values.top>=0&&values.bottom<=values.viewport+1&&!values.overflow,JSON.stringify(values));for(const target of values.targets)assert.ok(target.height>=44&&target.hit,JSON.stringify(values));return values;}
async function openInfo(p){await p.getByRole("button",{name:"更多信息",exact:true}).click();const dialog=p.getByRole("dialog",{name:"更多信息",exact:true});await dialog.waitFor();return dialog;}
async function openVersion(d){const b=d.getByRole("button",{name:/版本与更新/});if(await b.getAttribute("aria-expanded")==="false")await b.click();}
async function closeInfo(p){await p.getByRole("button",{name:"关闭更多信息",exact:true}).click();await p.getByRole("dialog",{name:"更多信息",exact:true}).waitFor({state:"detached"});}
try{
 if(process.env.FORMWARD_INFORMATION_PART!=="account"){
 for(const[width,height]of [[320,560],[390,560],[390,640],[390,780],[430,780],[844,390],[1100,850],[1440,900]]){
  const c=await browser.newContext(contextOptions(width,height)),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await ready(p);
  const current=await rects(p),footer=await footerCheck(p);let figureDelta=null;
  if(baseline){const b=await c.newPage();await b.goto(baseline);await ready(b);const original=await rects(b);figureDelta=Math.max(...current.flatMap((r,i)=>Object.keys(r).map(k=>Math.abs(r[k]-original[i][k]))));assert.ok(figureDelta<=1,JSON.stringify({width,height,current,original}));await b.close();}
  await p.screenshot({path:`${out}/${engine}-${width}x${height}-intro.png`});
  const dialog=await openInfo(p);if(width>1000){await dialog.hover();await p.mouse.wheel(0,400);await p.waitForTimeout(220);assert.equal(await p.locator('.home-page').getAttribute('data-phase'),'INTRO');}assert.equal(await dialog.locator('[aria-expanded=true]').count(),0);await p.screenshot({path:`${out}/${engine}-${width}x${height}-information-root.png`});await dialog.getByRole('link',{name:'隐私政策',exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/${engine}-${width}x${height}-information-bottom.png`});
  await dialog.getByRole('button',{name:'更新说明',exact:true}).click();assert.ok(await dialog.locator('ul').isVisible());await dialog.getByRole('button',{name:'备案信息',exact:true}).click();assert.equal(await dialog.getByRole('button',{name:'更新说明',exact:true}).getAttribute('aria-expanded'),'false');assert.equal(await dialog.getByRole('link',{name:'沪ICP备2026060534号-1',exact:true}).getAttribute('href'),'https://beian.miit.gov.cn/');await dialog.getByRole('button',{name:'联系我们',exact:true}).click();assert.equal(await dialog.getByRole('button',{name:'备案信息',exact:true}).getAttribute('aria-expanded'),'false');assert.match(await dialog.getByRole('link',{name:'邮件联系',exact:true}).getAttribute('href'),/^mailto:opg\.obl1v@gmail\.com/);await dialog.getByRole('button',{name:'联系我们',exact:true}).click();
  for(const name of ['使用帮助','隐私政策','服务条款'])assert.equal(await dialog.getByRole('link',{name,exact:true}).getAttribute('target'),'_blank');
  await closeInfo(p);assert.equal(await p.evaluate(()=>document.activeElement.textContent),'更多信息');assert.equal(await p.locator('.home-page').getAttribute('data-phase'),'INTRO');
  await loginStage(p);await p.locator('#email').fill('fictional@example.test');await p.locator('#password').fill('fictional-password');await p.locator('#password').blur();
  await p.screenshot({path:`${out}/${engine}-${width}x${height}-login.png`});await openInfo(p);await closeInfo(p);assert.equal(await p.locator('#email').inputValue(),'fictional@example.test');assert.equal(await p.locator('#password').inputValue(),'fictional-password');assert.deepEqual(await rects(p),current);
  await p.evaluate(()=>document.documentElement.style.fontSize='200%');await next();const scaled=await footerCheck(p);await p.screenshot({path:`${out}/${engine}-${width}x${height}-text200.png`});
  const d=await openInfo(p);await p.screenshot({path:`${out}/${engine}-${width}x${height}-information-text200.png`});await d.getByRole('link',{name:'服务条款',exact:true}).scrollIntoViewIfNeeded();assert.ok(await d.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await closeInfo(p);
  const before=await p.locator('[data-home-footer]').boundingBox();await p.evaluate(()=>{Object.defineProperty(window,'visualViewport',{configurable:true,value:new EventTarget()});Object.assign(window.visualViewport,{height:260,width:innerWidth,offsetTop:160,offsetLeft:0,scale:1});window.visualViewport.dispatchEvent(new Event('resize'));});await next();assert.deepEqual(await p.locator('[data-home-footer]').boundingBox(),before);
  reports.push({kind:'layout',width,height,figureDelta,footer,scaled,keyboard:'visualViewport simulation only'});await c.close();
 }
 for(const javaScriptEnabled of [false,true]){
  const c=await browser.newContext({...contextOptions(390,640),javaScriptEnabled});const p=await c.newPage();if(javaScriptEnabled)await p.route('**/*',async r=>{if(['image','media','font'].includes(r.request().resourceType()))await new Promise(done=>setTimeout(done,1300));await r.continue();});await p.goto(base,{waitUntil:'domcontentloaded'});const samples=[];
  for(let i=0;i<(javaScriptEnabled?18:1);i++){const filing=p.locator('a[href="https://beian.miit.gov.cn/"]');assert.equal(await filing.textContent(),'沪ICP备2026060534号-1');const r=await filing.boundingBox();assert.ok(r);assert.ok(await filing.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));samples.push(r);await p.screenshot({path:`${out}/${engine}-${javaScriptEnabled?'slow':'no-js'}-${i}.png`});await p.waitForTimeout(100);}
  const maxShift=Math.max(...samples.map(r=>Math.abs(r.y-samples[0].y)));assert.ok(maxShift<=1);reports.push({kind:'loading',javaScriptEnabled,maxShift,samples:samples.length});await c.close();
 }
 // 公开页手动检查：状态真实、请求去重、草稿确认及取消。
 {
  const c=await browser.newContext(contextOptions(390,640)),p=await c.newPage();await p.goto(base);await ready(p);await loginStage(p);await p.locator('#email').fill('fictional@example.test');await p.locator('#password').fill('fictional-password');
  let count=0,result=version,fail=false;await p.route('**/api/app-version',async route=>{count++;await route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify({version:result})});});
  const d=await openInfo(p);await openVersion(d);const check=d.getByRole('button',{name:'检查更新',exact:true});await check.click();await d.getByText('已是最新版本',{exact:true}).waitFor();assert.equal(count,1);
  fail=true;await check.click();await d.getByText('暂时无法检查更新，请重试。',{exact:true}).waitFor();
  fail=false;result='invalid version value';await check.click();await d.getByText('暂时无法检查更新，请重试。',{exact:true}).waitFor();
  fail=false;result='available-fictional-build';await check.click();await d.getByText('有新版本可用',{exact:true}).waitFor();
  let navigations=0;p.on('framenavigated',frame=>{if(frame===p.mainFrame())navigations++;});await d.getByRole('button',{name:'刷新到新版本',exact:true}).click();const confirmation=p.getByRole('dialog',{name:'刷新到新版本？',exact:true});await confirmation.waitFor();await p.screenshot({path:`${out}/${engine}-login-refresh-confirm.png`});await confirmation.getByRole('button',{name:'取消',exact:true}).click();assert.equal(navigations,0);await closeInfo(p);assert.equal(await p.locator('#email').inputValue(),'fictional@example.test');
  await openVersion(await openInfo(p));await p.getByRole('button',{name:'刷新到新版本',exact:true}).click();await Promise.all([p.waitForNavigation(),p.getByRole('button',{name:'放弃输入并刷新',exact:true}).click()]);assert.ok(navigations>=1);reports.push({kind:'manual-update',latest:true,error:true,available:true,noAutomaticReload:true,loginDraftCancel:true,confirmedRefresh:true});await c.close();
 }
 }
 // 账号菜单一级入口、深浅主题、现有业务草稿及自动/手动共享检查。
 for(const theme of ['dark','light']){
  const c=await browser.newContext(contextOptions(390,780));assert.equal((await c.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:config.email,password:config.password}})).status(),200);const p=await c.newPage();
  await p.goto(base+'/dashboard/profile');await p.waitForLoadState('networkidle');await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);await p.getByRole('button',{name:'修改资料',exact:true}).click();await p.getByLabel('身高',{exact:true}).fill('172');
  let count=0,unblock;const gate=new Promise(r=>unblock=r);await p.route('**/api/app-version',async route=>{count++;await gate;await route.fulfill({json:{version:'fictional-newer-version'}});});
  await p.locator('summary[aria-label="账号菜单"]').click();await p.getByRole('button',{name:'更多信息',exact:true}).click();const d=p.getByRole('dialog',{name:'更多信息',exact:true});await d.waitFor();await openVersion(d);await d.getByRole('button',{name:'检查更新',exact:true}).click();await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.waitForTimeout(120);assert.equal(count,1);unblock();await d.getByText('有新版本可用',{exact:true}).waitFor();
  await d.getByRole('button',{name:'复制版本信息',exact:true}).click();await p.waitForFunction(()=>document.querySelector('dialog[open]')?.textContent.match(/版本信息已复制|暂时无法复制版本信息/));
  await d.getByRole('button',{name:'联系我们',exact:true}).click();
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('isolated clipboard failure');}}}));await d.getByRole('button',{name:'复制邮箱',exact:true}).click();await d.getByText('暂时无法复制邮箱，可以选择下方文字手动复制。',{exact:true}).waitFor();assert.equal(await d.locator('pre').textContent(),'opg.obl1v@gmail.com');
  await p.screenshot({path:`${out}/${engine}-account-${theme}.png`});assert.equal(await p.getByLabel('应用版本更新',{exact:true}).count(),0);
  await openVersion(d);await d.getByRole('button',{name:'刷新到新版本',exact:true}).click();await p.getByRole('dialog',{name:'刷新到新版本？',exact:true}).getByRole('button',{name:'取消',exact:true}).click();await closeInfo(p);assert.equal(await p.getByLabel('身高',{exact:true}).inputValue(),'172');assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('aria-label')),'账号菜单');
  if(theme==='dark'){
   let releaseSave;const saveGate=new Promise(resolve=>releaseSave=resolve);await p.route('**/dashboard/profile',async route=>{if(route.request().method()==='POST'){await saveGate;await route.abort('failed');}else await route.continue();});
   await p.getByRole('button',{name:'保存资料',exact:true}).click();await p.locator('form[data-entry-form=profile][aria-busy=true]').waitFor();await p.locator('summary[aria-label="账号菜单"]').click();await p.getByRole('button',{name:'更多信息',exact:true}).click();const busyInfo=p.getByRole('dialog',{name:'更多信息',exact:true});await openVersion(busyInfo);await busyInfo.getByRole('button',{name:'刷新到新版本',exact:true}).click();await busyInfo.getByText('当前操作正在进行，完成后再刷新。',{exact:true}).waitFor();assert.equal(await p.getByRole('dialog',{name:'刷新到新版本？',exact:true}).count(),0);await closeInfo(p);releaseSave();await p.locator('form[data-entry-form=profile][aria-busy=false]').waitFor();assert.equal(await p.getByLabel('身高',{exact:true}).inputValue(),'172');
  }
  reports.push({kind:'account',theme,busyRefreshBlocked:theme==='dark',copyFailureFallback:true,businessDraftPreserved:true,sharedRequestCount:count,focusRestored:true});await c.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(await(await fetch(config.fixtureControlURL+'/health-digest')).json(),beforeHealth);
 await writeFile(out+`/${engine}-report.json`,JSON.stringify({passed:true,engine,version,reports,errors,healthUnchanged:true},null,2));console.log(JSON.stringify({passed:true,engine,cases:reports.length,errors}));
}catch(error){for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:`${out}/${engine}-failure.png`}).catch(()=>{});await writeFile(out+`/${engine}-failure.json`,JSON.stringify({failure:String(error),reports,errors},null,2));throw error;}finally{await browser.close();}
