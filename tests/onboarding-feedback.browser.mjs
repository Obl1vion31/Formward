import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createDatabase} from '../src/db/client.ts';
import {personalProfile} from '../src/db/schema.ts';
import {eq} from 'drizzle-orm';
import {initializeAccountOwner} from '../src/features/auth/account-management.ts';
import {provisionAccount} from '../src/features/auth/provision.ts';

const config=JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG,'utf8'));
assert.equal(config.isolatedFixture,true);assert.equal(new URL(config.baseURL).hostname,'127.0.0.1');
const engine=process.env.GUIDANCE_BROWSER??'chromium',folder=resolve(process.env.FEEDBACK_ARTIFACTS??'.codex/onboarding-feedback',engine);await mkdir(folder,{recursive:true});
const engines=await import(process.env.PLAYWRIGHT_MODULE??'/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs');
const browser=await engines[engine].launch({headless:true}),database=createDatabase(config.databaseUrl),reports=[],errors=[];
await initializeAccountOwner(database.db,config.empty.userId);
const original=await database.db.select().from(personalProfile).where(eq(personalProfile.userId,config.empty.userId));
const healthBefore=await(await fetch(config.fixtureControlURL+'/health-digest')).json();
const cookies=new Map();
async function context(identity,size,theme,motion='reduce'){
 const c=await browser.newContext({viewport:{width:size[0],height:size[1]},reducedMotion:motion,colorScheme:theme,recordVideo:{dir:folder+'/videos'},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 await c.addInitScript(mode=>{try{localStorage.setItem('formward-theme',mode);}catch{}},theme);
 if(cookies.has(identity.email))await c.addCookies(cookies.get(identity.email));else{const r=await c.request.post(config.baseURL+'/api/auth/sign-in/email',{headers:{Origin:config.baseURL},data:{email:identity.email,password:identity.password}});assert.equal(r.status(),200);cookies.set(identity.email,await c.cookies());}
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return {c,p};
}
async function shot(p,name){await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:folder+'/'+name+'.png',fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name);}
async function noOverlay(p){assert.equal(await p.locator('.page-loading-dialog[open],.workspace-loading,.page-loading-fallback:not([hidden])').count(),0);}
try{
 for(const size of [[320,640],[390,780],[430,780],[640,360],[1100,780],[1440,900],[1920,1080]])for(const theme of ['light','dark']){
  const {c,p}=await context(config.empty,size,theme,size[0]===390?"no-preference":"reduce");await p.goto(config.baseURL+'/onboarding?mode=test');await p.getByRole('heading',{name:'先认识一下你'}).waitFor();
  assert.equal(await p.getByRole('radiogroup',{name:'选择外观'}).count(),0);
  await p.getByRole('button',{name:theme==='light'?'切换为深色':'切换为浅色',exact:true}).click();await p.waitForFunction(mode=>document.documentElement.dataset.theme!==mode,theme);if(size[0]===390){await p.waitForTimeout(100);await shot(p,theme+'-circular-reveal');await p.waitForTimeout(450);assert.equal(await p.evaluate(()=>document.documentElement.hasAttribute('data-theme-reveal')),false);}
  await p.getByRole('button',{name:theme==='light'?'切换为浅色':'切换为深色',exact:true}).click();
  await p.getByLabel('外观选项',{exact:true}).click();await p.getByRole('menuitemcheckbox',{name:'跟随系统外观'}).click();assert.equal(await p.evaluate(()=>document.documentElement.dataset.appearance),'system');await p.keyboard.press('Escape');
  await p.getByLabel('身高',{exact:true}).fill('181');await p.getByLabel('出生年份',{exact:true}).selectOption('1994');await p.getByLabel('出生月份',{exact:true}).selectOption('07');await p.getByLabel('出生日期中的日',{exact:true}).selectOption('08');
  if(size[0]===320){await p.evaluate(()=>{const nodes=[...document.body.querySelectorAll('*')];const sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));nodes.forEach((n,i)=>{if(n instanceof HTMLElement)n.style.fontSize=sizes[i]*2+'px';});});}
  await shot(p,size[0]+'-'+theme+'-profile');const posts=[];p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await p.getByRole('button',{name:'保存并继续',exact:true}).click();await p.getByRole('button',{name:'返回资料',exact:true}).filter({visible:true}).waitFor();
  await p.getByRole('button',{name:'返回资料',exact:true}).filter({visible:true}).click();assert.equal(await p.getByLabel('身高',{exact:true}).inputValue(),'181');
  await p.getByRole('button',{name:'暂时跳过',exact:true}).click();await p.getByRole('button',{name:'结束演练',exact:true}).filter({visible:true}).waitFor();await p.getByRole('button',{name:'结束演练',exact:true}).filter({visible:true}).click();await p.getByRole('heading',{name:'演练完成'}).waitFor();await noOverlay(p);
  const link=p.getByRole('link',{name:'返回总览',exact:true});const geometry=await link.evaluate(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n),t=document.createRange();t.selectNodeContents(n);const tr=t.getBoundingClientRect();return {height:r.height,align:s.alignItems,justify:s.justifyContent,textCenterDelta:Math.abs((r.x+r.width/2)-(tr.x+tr.width/2)),radius:s.borderRadius};});assert.ok(geometry.height>=44);assert.equal(geometry.align,'center');assert.equal(geometry.justify,'center');assert.ok(geometry.textCenterDelta<=1);
  await shot(p,size[0]+'-'+theme+'-complete');await link.click();await p.waitForURL(config.baseURL+'/dashboard');await p.locator('[data-workspace-frame]').waitFor();await p.waitForTimeout(550);await noOverlay(p);assert.equal(await p.getByRole('heading',{name:'演练完成'}).count(),0);assert.equal(posts.length,0);reports.push({size,theme,geometry,ownerNoWrites:true,returned:true});await c.close();
 }
 assert.deepEqual(await database.db.select().from(personalProfile).where(eq(personalProfile.userId,config.empty.userId)),original);
 assert.deepEqual(await(await fetch(config.fixtureControlURL+'/health-digest')).json(),healthBefore);
 const identity={email:'onboarding-feedback-'+engine+'@example.test',password:'Fictional-guide-feedback-password-7'};const user=await provisionAccount(database.db,identity);
 const {c,p}=await context(identity,[390,780],'light','no-preference');await p.goto(config.baseURL+'/dashboard');await p.getByRole('heading',{name:'先认识一下你'}).waitFor();
 await p.evaluate(()=>{window.badOverlays=[];window.feedbackObserver=new MutationObserver(()=>{if(document.querySelector('.page-loading-dialog[open],.workspace-loading'))window.badOverlays.push(performance.now());});window.feedbackObserver.observe(document.body,{subtree:true,childList:true,attributes:true});});
 let fail=true;await p.route('**/onboarding',async route=>{if(route.request().method()!=='POST')return route.continue();await new Promise(r=>setTimeout(r,800));if(fail){fail=false;return route.abort();}return route.continue();});
 await p.getByLabel('身高',{exact:true}).fill('179');await p.getByRole('button',{name:'暂时跳过',exact:true}).click();await p.waitForTimeout(400);await noOverlay(p);assert.equal(await p.getByRole('button',{name:'暂时跳过',exact:true}).isDisabled(),true);await shot(p,'slow-skip-local-feedback');await p.getByRole('alert').waitFor();assert.equal(await p.getByLabel('身高',{exact:true}).inputValue(),'179');await shot(p,'failed-skip-keeps-input');
 await p.getByRole('button',{name:'暂时跳过',exact:true}).click();await p.getByRole('button',{name:'开始使用',exact:true}).filter({visible:true}).waitFor();await noOverlay(p);assert.equal((await database.db.select().from(personalProfile).where(eq(personalProfile.userId,user.id)))[0].heightCm,null);
 await p.getByRole('button',{name:'开始使用',exact:true}).filter({visible:true}).click();await p.waitForURL(config.baseURL+'/dashboard');await p.waitForTimeout(550);assert.equal((await database.db.select().from(personalProfile).where(eq(personalProfile.userId,user.id)))[0].onboardingStep,'complete');await noOverlay(p);
 await p.goto(config.baseURL+'/dashboard');assert.equal(new URL(p.url()).pathname,'/dashboard');await c.close();
 assert.deepEqual(errors,[]);await writeFile(folder+'/report.json',JSON.stringify({passed:true,engine,reports,slowFailure:true,realSkipAndFinish:true,errors},null,2));console.log(JSON.stringify({passed:true,engine,cases:reports.length,slowFailure:true}));
} catch(e){await writeFile(folder+'/failure.txt',String(e.stack));throw e;} finally {await browser.close();await database.close();}
