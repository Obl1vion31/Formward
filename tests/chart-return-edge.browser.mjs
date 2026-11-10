import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const config=JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG,'utf8'));
assert.equal(config.isolatedFixture,true);assert.equal(new URL(config.baseURL).hostname,'127.0.0.1');
const engine=process.env.FORMWARD_CHART_ENGINE??'chromium',engines=await import(process.env.PLAYWRIGHT_MODULE??'/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs'),browser=await engines[engine].launch({headless:true});
const out=resolve(process.env.FORMWARD_CHART_ARTIFACTS??'.codex/chart-return-edge',engine);await mkdir(out,{recursive:true});
const checks=[];
async function control(path,data){const r=await fetch(config.fixtureControlURL+path,{method:data?'POST':'GET',body:data?JSON.stringify(data):undefined});assert.equal(r.status,200);return r.json();}
const context=await browser.newContext({viewport:{width:390,height:780},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',locale:'zh-CN',recordVideo:{dir:out,size:{width:390,height:780}}});
const page=await context.newPage();
async function settled(){await page.waitForFunction(()=>!document.querySelector('.workspace-skeleton,[data-chart-flight]'));await page.waitForTimeout(550);}
const back=()=>page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('link',{name:'总览',exact:true});
try{
 assert.equal((await context.request.post(config.baseURL+'/api/auth/sign-in/email',{headers:{Origin:config.baseURL},data:{email:config.email,password:config.password}})).status(),200);
 const before=await control('/health-digest');
 await page.goto(config.baseURL+'/dashboard');await settled();
 await page.locator('[data-metric-card="intake"]').click();await settled();
 await back().dblclick({delay:10});await page.waitForURL(url=>url.pathname==='/dashboard');await settled();
 assert.equal(await page.locator('[data-chart-flight],[data-chart-travelling]').count(),0);checks.push('连续返回无残层');
 await page.locator('[data-metric-card="intake"]').click();await settled();
 await control('/meals-failure',{broken:true});await back().click();
 await page.getByRole('button',{name:'重新读取',exact:true}).waitFor();await page.waitForTimeout(550);
 assert.equal(await page.locator('[data-chart-flight],[data-chart-travelling]').count(),0);checks.push('读取失败立即清理转场');
 await page.screenshot({path:out+'/failure-clean.png'});
 await control('/meals-failure',{broken:false});await page.getByRole('button',{name:'重新读取',exact:true}).click();await settled();
 await page.locator('[data-metric-card="intake"]').waitFor();checks.push('真实失败恢复');
 await page.goto(config.baseURL+'/dashboard/meals?date='+config.today+'&entry=1');await settled();
 const notes=page.getByLabel('餐次备注',{exact:true});await notes.fill('虚构返回草稿保护');
 const close=()=>page.locator('dialog[open]').getByRole('button',{name:/^关闭/}).first();
 await close().click();await page.getByRole('button',{name:'继续编辑',exact:true}).click();
 assert.equal(await notes.inputValue(),'虚构返回草稿保护');checks.push('返回取消保留草稿');
 await close().click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();await page.locator('dialog[open]').waitFor({state:'detached'});await back().click();await page.waitForURL(url=>url.pathname==='/dashboard');await settled();
 assert.deepEqual(await control('/health-digest'),before);checks.push('查看与取消未写入健康记录');
 await page.screenshot({path:out+'/recovered.png'});await writeFile(out+'/report.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(error){await page.screenshot({path:out+'/failed.png'});await writeFile(out+'/failure.json',JSON.stringify({error:String(error),checks},null,2));throw error;}
finally{await control('/meals-failure',{broken:false});await context.close();await browser.close();}
