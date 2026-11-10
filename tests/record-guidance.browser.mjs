import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createDatabase} from '../src/db/client.ts';
import {personalProfile} from '../src/db/schema.ts';
import {eq} from 'drizzle-orm';
import {recordGuideKey,recordGuides} from '../src/features/onboarding/record-guidance-model.ts';

const config=JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG,'utf8'));
assert.equal(config.isolatedFixture,true);assert.equal(new URL(config.baseURL).hostname,'127.0.0.1');
const appVersion=await(await fetch(config.baseURL+'/api/app-version')).json();
const engine=process.env.GUIDANCE_BROWSER??'chromium',folder=resolve(process.env.GUIDANCE_ARTIFACTS??'.codex/record-guidance',engine);await mkdir(folder,{recursive:true});
const engines=await import(process.env.PLAYWRIGHT_MODULE??'/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs'),browser=await engines[engine].launch({headless:true});
const database=createDatabase(config.databaseUrl),reports=[],errors=[];let activePage;
const [originalProfile]=await database.db.select().from(personalProfile).where(eq(personalProfile.userId,config.empty.userId));
const digest=async()=>{const r=await fetch(config.fixtureControlURL+'/health-digest');assert.equal(r.status,200);return r.json();};
const guide=page=>page.locator('[data-record-guidance][data-ready=true]');
const sessions=new Map();
async function login(context,identity=config){
 if(sessions.has(identity.userId)){await context.addCookies(sessions.get(identity.userId));return;}
 const r=await context.request.post(config.baseURL+'/api/auth/sign-in/email',{headers:{Origin:config.baseURL},data:{email:identity.email,password:identity.password}});assert.equal(r.status(),200);sessions.set(identity.userId,await context.cookies());
}
async function context(size,theme='light',motion='no-preference',identity=config,storage=true){
 const c=await browser.newContext({viewport:{width:size[0],height:size[1]},hasTouch:size[0]<1000,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:motion,recordVideo:{dir:folder+'/videos',size:{width:size[0],height:size[1]}}});
 await c.addInitScript(({theme,storage})=>{if(!['http:','https:'].includes(location.protocol))return;localStorage.setItem('formward-theme',theme);if(!storage){Storage.prototype.getItem=()=>{throw Error('test storage unavailable');};Storage.prototype.setItem=()=>{throw Error('test storage unavailable');};}},{theme,storage});
 await login(c,identity);c.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));return c;
}
async function shot(page,name){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(450);await page.screenshot({path:folder+'/'+name+'.png'});}
async function enlargeText(page){await page.evaluate(()=>{const nodes=[document.body,...document.body.querySelectorAll('*')].filter(node=>node instanceof HTMLElement),sizes=nodes.map(node=>parseFloat(getComputedStyle(node).fontSize));nodes.forEach((node,i)=>node.style.fontSize=sizes[i]*2+'px');});await page.waitForTimeout(250);}
async function checkGeometry(page){
 const r=await guide(page).evaluate(node=>{const tip=node.querySelector('section').getBoundingClientRect(),spot=node.firstElementChild.getBoundingClientRect(),v=visualViewport;return{tip:{x:tip.x,y:tip.y,right:tip.right,bottom:tip.bottom,height:tip.height},spot:{x:spot.x,y:spot.y,width:spot.width,height:spot.height},vw:v.width,vh:v.height,top:v.offsetTop,left:v.offsetLeft,overflow:document.documentElement.scrollWidth>innerWidth+1,controls:[...node.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)};});
 assert.ok(r.tip.x>=r.left+10&&r.tip.right<=r.left+r.vw-10,JSON.stringify(r));assert.ok(r.tip.y>=r.top+10&&r.tip.bottom<=r.top+r.vh-10,JSON.stringify(r));assert.equal(r.overflow,false);assert.ok(r.controls.every(h=>h>=44));
 assert.equal(await page.locator('dialog[open]').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)),true,'教程不制造面板横向滚动');return r;
}
async function openReplay(page,kind){
 await page.getByRole('button',{name:/^打开小助手/}).click();const assistant=page.locator('[data-assistant-surface]');await assistant.waitFor();
 await assistant.getByRole('button',{name:'常用功能',exact:true}).click();await assistant.getByRole('button',{name:'重播操作引导',exact:true}).click();
 await assistant.getByRole('button',{name:'重播'+recordGuides[kind].label+'录入引导',exact:true}).click();await guide(page).waitFor();assert.equal(await page.locator('[data-assistant-surface]').count(),0,'先关闭助手再重播');
}
async function fields(page,kind){
 const g=guide(page);await g.waitFor();
 if(await g.getAttribute('data-step')==='1'){
  if(kind==='training')await page.locator('[data-record-guide-entry="training"]').click();else await g.getByRole('button',{name:'去填写',exact:true}).click();
 }
 await page.waitForFunction(()=>document.querySelector('[data-record-guidance][data-ready=true][data-step="2"]'));
 if(await g.getByRole('button',{name:'添加一餐',exact:true}).isVisible())await g.getByRole('button',{name:'添加一餐',exact:true}).click();
 await page.locator(`[data-entry-form="${recordGuides[kind].form}"]`).waitFor();await g.waitFor();
}
try{
 const before=await digest();
 for(const [size,theme]of [[[390,640],'light'],[[1440,900],'dark']]){
  const c=await context(size,theme),p=activePage=await c.newPage();
  for(const kind of ['meals','energy','body','training']){
   await p.goto(config.baseURL+recordGuides[kind].path);await guide(p).waitFor();assert.equal(await guide(p).getAttribute('data-step'),'1');
   await shot(p,size[0]+'-'+theme+'-'+kind+'-1');await checkGeometry(p);
   if(kind==='training'){
    await guide(p).getByRole('button',{name:'先不训练',exact:true}).click();assert.equal(await p.locator('[data-training-editor]').count(),0);
    await openReplay(p,kind);
   }
   await fields(p,kind);await shot(p,size[0]+'-'+theme+'-'+kind+'-2');await checkGeometry(p);
   if(kind==='body'&&size[0]===390){
    await p.evaluate(()=>document.documentElement.setAttribute('data-chart-travel','return'));await p.waitForTimeout(100);assert.equal(await guide(p).count(),0,'图形交接优先于操作引导');await p.evaluate(()=>document.documentElement.removeAttribute('data-chart-travel'));await guide(p).waitFor();
    const handle=p.getByRole('button',{name:/可拖动面板$/});await handle.click();await p.waitForTimeout(500);await checkGeometry(p);
    const aligned=await p.evaluate(()=>{const f=[...document.querySelectorAll('[data-entry-form="body"] [data-record-guide-fields]')].find(n=>n.getClientRects().length),s=document.querySelector('[data-record-guidance] [aria-hidden="true"]').getBoundingClientRect(),r=f.getBoundingClientRect();return Math.abs(s.x-(r.x-5))<=1&&Math.abs(s.y-(r.y-5))<=1;});assert.equal(aligned,true,'面板切换停靠档位后高光跟随');
    await handle.click();await p.waitForTimeout(450);
   }
   await guide(p).getByRole('button',{name:'下一步',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[data-record-guidance][data-ready=true][data-step="3"]'));
   await shot(p,size[0]+'-'+theme+'-'+kind+'-3');await checkGeometry(p);
   const form=p.locator(`[data-entry-form="${recordGuides[kind].form}"]`);
   if(kind!=='body'){await guide(p).getByRole('button',{name:'完成引导',exact:true}).click();assert.equal(await guide(p).count(),0);assert.equal(await form.count(),1,'完成教程保留真实表单');}
   if(kind==='body'){
    const input=form.getByLabel('晨间体重',{exact:true}),original=await input.inputValue();await input.fill('70.15');
    await p.route('**/dashboard/measurements**',route=>route.request().method()==='POST'?route.abort('failed'):route.continue());
    await form.locator('[data-record-guide-save]').click();await form.getByRole('alert').waitFor();assert.equal(await guide(p).count(),0,'实际提交后引导退出，错误和草稿优先');assert.equal(await input.inputValue(),'70.15');
    await p.unroute('**/dashboard/measurements**');await input.fill(original);
   }
   await p.keyboard.press('Escape');await form.waitFor({state:'hidden'});await p.waitForTimeout(550);
   await p.reload();await p.waitForLoadState('networkidle');await p.waitForTimeout(200);assert.equal(await guide(p).count(),0,'本账号本设备不重复自动提示');
   reports.push({kind,size,theme,flow:'entry-fields-save',noAutomaticSubmission:true});
  }
  await p.goto(config.baseURL+'/dashboard');await openReplay(p,'energy');assert.equal(new URL(p.url()).pathname,'/dashboard/energy');await guide(p).getByRole('button',{name:'跳过引导',exact:true}).click();
  assert.equal(await guide(p).count(),0);await c.close();
 }
 assert.deepEqual(await digest(),before,'教程操作、跳过、重播和失败不改健康记录');
 // 窄屏、横屏、短屏、大文字和减少动态效果：高光和提示保持在视口内。
 for(const size of [[320,560],[390,560],[430,780],[640,390],[1100,800],[1920,1080]])for(const theme of ['light','dark']){
  const c=await context(size,theme,'reduce'),p=activePage=await c.newPage();await p.goto(config.baseURL+'/dashboard/measurements');await guide(p).waitFor();
  await fields(p,'body');await shot(p,size.join('x')+'-'+theme+'-body');const geometry=await checkGeometry(p);
  if(size[0]===320&&theme==='light'){await enlargeText(p);await checkGeometry(p);await shot(p,'320-body-large-text');}
  await guide(p).getByRole('button',{name:'下一步',exact:true}).click();await guide(p).waitFor();await p.waitForTimeout(150);await checkGeometry(p);
  await p.keyboard.press('Escape');assert.equal(await guide(p).count(),0);assert.equal(await p.locator('[data-entry-form="body"]').count(),1,'Escape先收起教程，保留编辑器');
  await p.keyboard.press('Escape');await p.locator('[data-entry-form="body"]').waitFor({state:'hidden'});
  await p.goto(config.baseURL+'/dashboard/profile');await p.getByRole('button',{name:'修改资料',exact:true}).click();
  await p.getByLabel('出生年份',{exact:true}).selectOption('1984');await p.getByLabel('出生月份',{exact:true}).selectOption('02');await p.getByLabel('出生日期中的日',{exact:true}).selectOption('29');
  await p.getByLabel('出生年份',{exact:true}).selectOption('1985');assert.equal(await p.getByLabel('出生日期中的日',{exact:true}).inputValue(),'','非闰年不保留2月29日');
  await p.getByRole('button',{name:'保存资料',exact:true}).click();await p.getByRole('alert').filter({hasText:'请选择完整'}).waitFor();
  assert.equal(await p.getByLabel('出生年份',{exact:true}).inputValue(),'1985');await shot(p,size.join('x')+'-'+theme+'-birth-year');
  if(size[0]===320&&theme==='light'){
   await enlargeText(p);await p.getByLabel('出生年份',{exact:true}).evaluate(node=>node.scrollIntoView({block:'center'}));await shot(p,'320-birth-year-large-text');
   const fits=await p.locator('select').evaluateAll(nodes=>nodes.every(node=>{const style=getComputedStyle(node),canvas=document.createElement('canvas').getContext('2d');canvas.font=style.font;return canvas.measureText(node.selectedOptions[0].textContent).width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)<=node.clientWidth+1;}));assert.equal(fits,true,'大字下选择项完整显示');
  }
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);reports.push({size,theme,reducedMotion:true,geometry,birthDirectYear:true});await c.close();
 }
 // 已有账号标记不影响另一账号；禁用存储也不循环弹出。
 const c=await context([390,640],'light','reduce',config.empty),p=activePage=await c.newPage();await p.goto(config.baseURL+'/dashboard/energy');await guide(p).waitFor();
 await guide(p).getByRole('button',{name:'跳过引导',exact:true}).click();assert.equal(await p.evaluate(key=>localStorage.getItem(key),recordGuideKey(config.userId,'energy')),null);
 await c.request.post(config.baseURL+'/api/auth/sign-out',{headers:{Origin:config.baseURL}});sessions.delete(config.empty.userId);await login(c,config);await p.goto(config.baseURL+'/dashboard/energy');await guide(p).waitFor();assert.equal(await p.evaluate(key=>localStorage.getItem(key),recordGuideKey(config.empty.userId,'energy')),'seen');await c.close();
 const blocked=await context([390,640],'dark','reduce',config,false),b=activePage=await blocked.newPage();await b.goto(config.baseURL+'/dashboard/energy');await guide(b).waitFor();await guide(b).getByRole('button',{name:'跳过引导',exact:true}).click();
 await b.getByRole('link',{name:'总览',exact:true}).click();await b.getByRole('link',{name:'消耗',exact:true}).click();await b.waitForLoadState('networkidle');assert.equal(await guide(b).count(),0);await blocked.close();
 // 真正初次资料页面，用另一个虚构账号验证保存及不完整草稿。
 await database.db.update(personalProfile).set({onboardingStep:'profile',heightCm:null,birthDate:null}).where(eq(personalProfile.userId,config.empty.userId));
 const firstUse=await context([390,640],'light','reduce',config.empty),f=activePage=await firstUse.newPage();await f.goto(config.baseURL+'/dashboard');await f.getByRole('heading',{name:'先认识一下你'}).waitFor();
 await f.getByLabel('出生年份',{exact:true}).selectOption('1997');await f.getByLabel('出生月份',{exact:true}).selectOption('04');await f.getByLabel('出生日期中的日',{exact:true}).selectOption('12');await shot(f,'phone-onboarding-direct-year');
 await f.getByRole('button',{name:'保存并继续',exact:true}).click();await f.locator('[data-tutorial-guide]').waitFor();
 assert.equal((await database.db.select().from(personalProfile).where(eq(personalProfile.userId,config.empty.userId)))[0].birthDate,'1997-04-12');await firstUse.close();
 assert.deepEqual(errors,[]);await writeFile(folder+'/report.json',JSON.stringify({engine,appVersion,reports,errors,passed:true,physicalDevice:false},null,2));console.log(JSON.stringify({engine,appVersion,cases:reports.length,passed:true}));
}catch(error){if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:folder+'/failure.png'});await writeFile(folder+'/failure-state.json',JSON.stringify({url:activePage.url(),text:await activePage.locator('body').innerText()},null,2));}await writeFile(folder+'/failure.json',JSON.stringify({error:String(error),stack:error.stack,reports,errors},null,2));throw error;}
finally{await browser.close();if(originalProfile)await database.db.update(personalProfile).set({heightCm:originalProfile.heightCm,birthDate:originalProfile.birthDate,onboardingStep:originalProfile.onboardingStep,version:originalProfile.version,updatedAt:originalProfile.updatedAt}).where(eq(personalProfile.userId,config.empty.userId));await database.close();}
