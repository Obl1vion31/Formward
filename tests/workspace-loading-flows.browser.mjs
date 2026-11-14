import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const pause=ms=>new Promise(done=>setTimeout(done,ms));
export async function checkLoadingFlows({config,folder,createContext,control,shot}){
 const checks=[],errors=[],expectedErrors=[],frames=[],videos=[];
 const before=await(await fetch(config.fixtureControlURL+'/health-digest')).json();
 for(const theme of (process.env.FORMWARD_LOADING_FOCUS?['dark']:['dark','light']))for(const size of (process.env.FORMWARD_LOADING_FOCUS?[[390,640]]:[[390,640],[1440,900]])){
  const context=await createContext(size,theme,'no-preference',true),page=await context.newPage(),mobile=size[0]<700,prefix='flows-'+theme+'-'+size[0];
  let transport='normal',negative=false;
  const pendingRequests=new Map();context.on('request',request=>pendingRequests.set(request,{url:request.url(),method:request.method(),type:request.resourceType(),rsc:request.headers().rsc,time:Date.now()}));context.on('requestfinished',request=>pendingRequests.delete(request));context.on('requestfailed',request=>pendingRequests.delete(request));
  page.on('pageerror',error=>{if(negative&&/Server Components render/.test(error.message))expectedErrors.push(error.message);else errors.push(error.message);});
  await page.route('**/dashboard/**',async route=>{
   const request=route.request(),isRead=request.method()==='POST'&&!!request.headers()['next-action']||request.method()==='GET'&&/\/dashboard\/(profile|account|sources)(?:\?|$)/.test(request.url());
   if(transport==='fail'&&request.method()==='POST'&&request.headers()['next-action'])return route.abort('failed');
   if(transport==='slow'&&isRead)await pause(900);
   return route.continue();
  });
  const menu=()=>page.locator('summary[aria-label="账号菜单"]');
  async function openAccount(name){await menu().click();await page.getByRole('button',{name:name==='设备与数据来源'?'外部接入':'账号管理',exact:true}).click();await page.getByRole(mobile?'button':'link',{name,exact:true}).click();}
  async function closeAccount(){await page.getByRole('dialog').getByRole('button',{name:/^关闭/}).first().click();await page.getByRole('dialog').waitFor({state:'detached'});await page.waitForTimeout(550);assert.equal(await menu().evaluate(node=>document.activeElement===node),true,'账号面板关闭后焦点回到账号按钮');}
  async function localEvidence(entry){const local=await page.evaluate(()=>window.__localFrames);for(const f of local.filter(f=>f.dialog&&f.visible))assert.ok(f.time-f.created>=185,'局部指示不能提前显示');frames.push({prefix,entry,local});}
  try{
   await context.addInitScript(()=>{window.__localFrames=[];const created=new WeakMap();const tick=()=>{for(const node of document.querySelectorAll('[data-local-loading]')){if(!created.has(node))created.set(node,performance.now());if(node.closest('dialog')||node.closest('.account-reading-page')||node.dataset.visible)window.__localFrames.push({time:performance.now(),created:created.get(node),visible:!!node.dataset.visible,label:node.textContent,dialog:!!node.closest('dialog')});}requestAnimationFrame(tick);};requestAnimationFrame(tick);});
   await control(0);await page.goto(config.baseURL+'/dashboard/training');await page.waitForLoadState('networkidle');
   for(const[name,ready]of [['个人资料',()=>page.getByRole('button',{name:'修改资料',exact:true}).waitFor()],['账号与安全',()=>page.getByLabel('当前密码',{exact:true}).waitFor()],['设备与数据来源',()=>page.locator('summary').filter({hasText:'输入个人密钥'}).waitFor()]]){
    transport='slow';await openAccount(name);await page.locator('[data-local-loading][data-visible]').first().waitFor();
    assert.equal(await page.locator('.account-sheet-skeleton').count(),0);assert.equal(await page.locator('.page-loading-dialog[open],.workspace-loading').count(),0);
    await shot(page,prefix+'-'+name+'-reading');await ready();await page.waitForLoadState('networkidle');await page.waitForTimeout(550);await shot(page,prefix+'-'+name+'-ready');
    assert.equal(await page.locator('[data-local-loading][data-visible]').count(),0);
    await localEvidence(name);transport='normal';if(mobile)await closeAccount();else{await page.goto(config.baseURL+'/dashboard/training');await page.waitForLoadState('networkidle');}
   }
   if(mobile){
    transport='fail';await openAccount('个人资料');await page.getByRole('alert').filter({hasText:'暂时无法读取，请重试。'}).waitFor();await shot(page,prefix+'-profile-failure');transport='normal';await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByRole('button',{name:'修改资料',exact:true}).waitFor();await closeAccount();checks.push(prefix+' 面板读取失败与重试');
    transport='slow';await openAccount('个人资料');await page.locator('dialog [data-local-loading]').waitFor({state:'attached'});await closeAccount();transport='normal';await page.waitForLoadState('networkidle');await page.waitForTimeout(550);assert.equal(await page.getByRole('dialog').count(),0);checks.push(prefix+' 读取中关闭及迟到响应不重开');
    await openAccount('个人资料');await page.getByRole('button',{name:'修改资料',exact:true}).click();await page.getByLabel('身高',{exact:false}).fill('178');await page.getByRole('dialog').getByRole('button',{name:/^关闭/}).first().click();await page.getByRole('dialog',{name:'放弃尚未保存的输入？'}).waitFor();await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.getByLabel('身高',{exact:false}).inputValue(),'178');await page.getByRole('dialog').getByRole('button',{name:/^关闭/}).first().click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});checks.push(prefix+' 资料草稿取消保护');
    await openAccount('账号与安全');await page.getByLabel('当前密码',{exact:true}).fill('fictional-discard-only');await page.getByRole('dialog').getByRole('button',{name:/^关闭/}).first().click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await openAccount('账号与安全');await page.getByLabel('当前密码',{exact:true}).waitFor();assert.equal(await page.getByLabel('当前密码',{exact:true}).inputValue(),'');await closeAccount();checks.push(prefix+' 密码草稿不持久化');
   }
   checks.push(prefix+' 三类次级入口延迟反馈与就绪清理');
   await localEvidence('interruption-and-draft');
   // 普通路由、热进入、反向与历史导航：实际动画保留，数据替换不得二次启动。
   await page.evaluate(()=>{window.__motionStarts=[];new MutationObserver(records=>{for(const r of records)if(r.type==='attributes'&&r.target.hasAttribute('data-workspace-moving'))window.__motionStarts.push({path:location.pathname,id:r.target.getAttribute('data-workspace-moving'),time:performance.now()});}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['data-workspace-moving']});});
   await control(250);
   for(const route of ['meals','training','energy','measurements','']){
    const path='/dashboard'+(route?'/'+route:''),start=await page.evaluate(()=>window.__motionStarts.length);
    const link=page.locator(`a[href="${path}"]:visible`).first();await link.click();await page.waitForURL(config.baseURL+path);await page.waitForLoadState('networkidle');await page.waitForTimeout(550);
    assert.ok((await page.evaluate(()=>window.__motionStarts.length))-start<=1,'一次导航只能入场一次');await shot(page,prefix+'-navigation-'+(route||'overview'));
   }
   await control(0);await page.goBack();await page.waitForLoadState('networkidle');await page.goForward();await page.waitForLoadState('networkidle');
   for(const kind of ['intake','morning-weight','energy']){await page.locator(`[data-metric-card="${kind}"]:visible`).click();await page.waitForLoadState('networkidle');await page.locator('.chart-flight').waitFor({state:'detached',timeout:2000});await page.waitForTimeout(550);assert.equal(await page.locator('.chart-flight').count(),0);await page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('link',{name:'总览',exact:true}).click();await page.waitForURL(config.baseURL+'/dashboard');await page.waitForLoadState('networkidle');await page.locator('.chart-flight').waitFor({state:'detached',timeout:2000});await page.waitForTimeout(550);assert.equal(await page.locator('.chart-flight').count(),0);}
   checks.push(prefix+' 普通／热导航、返回与三种图形往返');
   await page.emulateMedia({reducedMotion:'reduce'});await page.locator('a[href="/dashboard/meals"]:visible').first().click();await page.waitForLoadState('networkidle');assert.equal(await page.locator('[data-workspace-moving],.chart-flight').count(),0);await page.emulateMedia({reducedMotion:'no-preference'});
   if(theme==='dark'&&mobile){
    await control(0);await page.goto(config.baseURL+'/dashboard/training');await page.waitForLoadState('networkidle');
    negative=true;assert.equal((await fetch(config.fixtureControlURL+'/meals-failure',{method:'POST',body:JSON.stringify({broken:true})})).status,200);
    await page.goto(config.baseURL+'/dashboard/meals',{waitUntil:'commit'});await page.getByRole('alert').getByText('暂时无法读取页面，已保存的记录保持。请重试。',{exact:true}).waitFor();await shot(page,prefix+'-main-read-failure');
    assert.equal((await fetch(config.fixtureControlURL+'/meals-failure',{method:'POST',body:JSON.stringify({broken:false})})).status,200);await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.getByRole('heading',{name:'最近记录',exact:true}).waitFor();await page.locator('[data-record-slot=metrics]:not([aria-busy=true])').waitFor();await page.waitForTimeout(550);negative=false;checks.push('真实数据库读取失败、导航保留及局部重试');
    negative=true;await fetch(config.fixtureControlURL+'/meals-failure',{method:'POST',body:JSON.stringify({broken:true})});await page.goto(config.baseURL+'/dashboard/meals?entry=1&date='+config.today,{waitUntil:'commit'});await page.getByRole('dialog').getByText('暂时无法读取已保存的值，请重试。',{exact:true}).waitFor();await fetch(config.fixtureControlURL+'/meals-failure',{method:'POST',body:JSON.stringify({broken:false})});
    let retries=0;const count=request=>{const url=new URL(request.url());if(request.method()==='GET'&&request.headers().rsc==='1'&&url.pathname==='/dashboard/meals'&&url.searchParams.get('entry')==='1')retries++;};page.on('request',count);await page.getByRole('dialog').getByRole('button',{name:'重新读取',exact:true}).click();await page.locator('form[data-entry-form="meal"] input[aria-label="自由填写食物名称"]').waitFor();await page.waitForTimeout(550);page.off('request',count);assert.equal(retries,1,'录入失败重试只允许一次重新读取');await page.getByRole('dialog').getByRole('button',{name:/^关闭/}).first().click();await page.getByRole('dialog').waitFor({state:'detached'});negative=false;checks.push('快捷录入失败后一次重试恢复，不重复请求');
   }
   await page.waitForTimeout(550);
  }catch(error){
   await shot(page,prefix+'-failure');await writeFile(folder+'/flows-failure.json',JSON.stringify({prefix,error:String(error),checks,errors,expectedErrors,pendingRequests:[...pendingRequests.values()],document:await page.evaluate(()=>({state:document.readyState,url:location.href})),frames},null,2));throw error;
  }finally{
   await fetch(config.fixtureControlURL+'/meals-failure',{method:'POST',body:JSON.stringify({broken:false})});await page.waitForLoadState('networkidle').catch(()=>{});await context.close();if(page.video()){const path=folder+'/'+prefix+'.webm';await page.video().saveAs(path);videos.push({prefix,path});}
  }
 }
 const isolated=await createContext([390,640],'dark','reduce',true),other=await isolated.newPage();
 try{
  await other.goto(config.baseURL+'/dashboard/measurements');await other.waitForLoadState('networkidle');assert.ok((await other.locator('[data-record-slot=metrics] strong').allTextContents()).some(text=>text.includes('70.14')));
  assert.equal((await isolated.request.post(config.baseURL+'/api/auth/sign-in/email',{headers:{Origin:config.baseURL},data:{email:config.empty.email,password:config.empty.password}})).status(),200);
  await other.reload();await other.waitForLoadState('networkidle');assert.ok((await other.locator('[data-record-slot=metrics] strong').allTextContents()).every(text=>!text.includes('70.14')));
  await other.goto(config.baseURL+'/dashboard/sources');await other.getByRole('heading',{name:'暂未开放',exact:true}).waitFor();checks.push('切换账号清除原健康显示与试运行入口权限');
 }finally{await isolated.close();}
 const after=await(await fetch(config.fixtureControlURL+'/health-digest')).json();assert.deepEqual(after,before,'查看、加载、关闭和重试不得写入健康事实');assert.deepEqual(errors,[]);
 await writeFile(folder+'/flows-report.json',JSON.stringify({passed:true,focus:process.env.FORMWARD_LOADING_FOCUS??'full',checks,errors,expectedErrors,healthFactsUnchanged:true,frames,videos},null,2));return checks;
}
