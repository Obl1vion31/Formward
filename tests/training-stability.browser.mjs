import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
export async function checkTrainingStability({ browser, config, folder, engine, checks, screenshots }) {
  const reports=[], errors=[], authStates=new Map();
  async function contextFor(size, account=config) {
    const context=await browser.newContext({viewport:{width:size[0],height:size[1]},hasTouch:size[0]<1000,timezoneId:'Asia/Shanghai',locale:'zh-CN',reducedMotion:'reduce',storageState:authStates.get(account.email)});
    if(!authStates.has(account.email)){const login=await context.request.post(config.baseURL+'/api/auth/sign-in/email',{headers:{Origin:config.baseURL},data:{email:account.email,password:account.password}});assert.equal(login.status(),200);authStates.set(account.email,await context.storageState());}
    await context.addInitScript(()=>{if(location.protocol!=='http:'&&location.protocol!=='https:')return;localStorage.setItem('formward-assistant-seen-v1','true');window.__stableFrames=[];
      const visible=(selector,scope=document)=>[...scope.querySelectorAll(selector)].find(node=>node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0);
      const sample=()=>{const content=visible('[data-workspace-content]'), root=content&&visible('[data-training-loading],[data-training-view],[data-record-workspace]',content);if(root){const kind=root.hasAttribute('data-training-loading')||root.hasAttribute('data-training-view')?'training':document.querySelector('[data-workspace-frame]')?.dataset.workspaceFrame;
        const phase=root.hasAttribute('data-training-loading')||root.closest('.workspace-skeleton')?'skeleton':'actual', origin=content.getBoundingClientRect();
        const selectors=kind==='training'?{tabs:'nav[aria-label="训练与消耗"]',month:'[data-training-month]',today:'section[aria-label="今日训练"]',calendarTitle:'[class*="calendarSection"]>[class*="sectionHeading"]',weekdays:'[class*="weekdays"]',calendar:'[class*="calendarSection"]>[class*="calendar"]',templates:'aside>[class*="sectionHeading"]'}:{tabs:'nav[aria-label="训练与消耗"]',date:'[data-record-slot=date]',metrics:'[data-record-slot=metrics]',range:'[data-record-slot=range]',title:'[data-record-slot=title]',plot:'[data-record-slot=plot]'};
        const anchors={};for(const[key,selector]of Object.entries(selectors)){const node=visible(selector,content);if(node){const r=node.getBoundingClientRect();anchors[key]={x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};}}
        if(window.__stableFrames.length<4000)window.__stableFrames.push({time:performance.now(),kind,phase,anchors,originY:origin.y,viewportHeight:innerHeight,scrollY:scrollY});
      }requestAnimationFrame(sample);};requestAnimationFrame(sample);
    });
    context.__pending=new Set();context.__lastActivity=Date.now();context.on('request',request=>{context.__pending.add(request);context.__lastActivity=Date.now();});const finished=request=>{context.__pending.delete(request);context.__lastActivity=Date.now();};context.on('requestfinished',finished);context.on('requestfailed',finished);context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));return context;
  }
  async function drain(context){const until=Date.now()+30000;while(Date.now()<until){if(!context.__pending.size&&Date.now()-context.__lastActivity>=700)return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('主动离开前仍有在途请求:'+JSON.stringify([...context.__pending].map(request=>new URL(request.url()).pathname)));}
  async function dispose(context){await drain(context);await context.close();}
  const control=async delayMs=>{if(!config.delayControlURL)return {delayMs:0};const response=await fetch(config.delayControlURL,{method:'POST',body:JSON.stringify({delayMs})});assert.equal(response.status,200);return response.json();};
  await control(650);
  try {
    if(config.delayControlURL){
    for(const size of [[320,560],[390,640],[430,780],[640,390],[1100,800],[1440,900],[1920,1080]])for(const route of [...['training','energy'],...([390,1440].includes(size[0])?['meals','measurements']:[])]){
      const context=await contextFor(size),page=await context.newPage();
      try{
        await page.goto(config.baseURL+'/dashboard/'+route,{waitUntil:'commit'});
        await page.locator(route==='training'?'[data-training-loading]:visible':'.workspace-skeleton:visible').first().waitFor({state:'visible'});assert.equal(await page.locator(route==='training'?'[data-training-loading]:visible':'.workspace-skeleton:visible').count(),1);
        const prefix='loading-'+route+'-'+size.join('x'), before=folder+'/'+prefix+'-skeleton.png';await page.screenshot({path:before});screenshots.push(before);
        await page.locator(route==='training'?'[data-training-view]':'[data-record-workspace]:not(.workspace-skeleton [data-record-workspace])').waitFor({state:'visible'});await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(550);
        const after=folder+'/'+prefix+'-actual.png';await page.screenshot({path:after});screenshots.push(after);
        const frames=await page.evaluate(()=>window.__stableFrames), skeleton=frames.filter(f=>f.phase==='skeleton'), actual=frames.filter(f=>f.phase==='actual');assert.ok(skeleton.length>=2,'必须实际观察到骨架全过程');assert.ok(actual.length>=2);
        const baseline=skeleton.at(-1), deltas=[];for(const frame of [...skeleton,...actual])for(const[key,rect]of Object.entries(frame.anchors)){const reference=baseline.anchors[key];if(!reference || reference.y+baseline.originY>=baseline.viewportHeight || reference.y+reference.height+baseline.originY<=0)continue;for(const prop of ['x','y','width','height'])deltas.push({anchor:key,prop,delta:Math.abs(rect[prop]-reference[prop])});}
        const max=deltas.reduce((a,b)=>a.delta>b.delta?a:b,{delta:0}), report={route,size,engine,skeletonFrames:skeleton.length,actualFrames:actual.length,max,scope:'首屏相交的稳定槽位；屏外真实列表内容增长单独保留在frames中',frames};reports.push(report);await writeFile(folder+'/'+prefix+'-frames.json',JSON.stringify(report));assert.ok(max.delta<=1,route+' '+size+' 稳定锚点偏移 '+JSON.stringify(max));assert.ok(actual.every(f=>f.scrollY===0));
      }finally{await dispose(context);}
    }
    checks.push('训练与消耗七视口、饮食与身体双端慢请求首屏稳定锚点逐帧≤1px');
    const navigationContext=await contextFor([390,640]),navigationPage=await navigationContext.newPage();
    try{
      await navigationPage.goto(config.baseURL+'/dashboard/training');await navigationPage.waitForLoadState('networkidle');
      for(const destination of ['消耗','训练','消耗','训练']){
        await navigationPage.evaluate(()=>{window.__stableFrames=[];});await navigationPage.getByRole('navigation',{name:'训练与消耗',exact:true}).getByRole('link',{name:destination,exact:true}).click();await navigationPage.waitForURL(config.baseURL+'/dashboard/'+(destination==='训练'?'training':'energy'));await navigationPage.locator(destination==='训练'?'[data-training-view]':'section[aria-label="消耗历史趋势"]').waitFor({state:'visible'});await navigationPage.waitForLoadState('networkidle');await navigationPage.waitForTimeout(550);
        const frames=await navigationPage.evaluate(()=>window.__stableFrames),kind=destination==='训练'?'training':'energy',target=frames.filter(f=>f.kind===kind),skeleton=target.filter(f=>f.phase==='skeleton'),actual=target.filter(f=>f.phase==='actual');assert.ok(actual.length);const reference=skeleton.at(-1)??actual[0];let delta=0;for(const frame of [...skeleton,...actual])for(const[key,rect]of Object.entries(frame.anchors)){const r=reference.anchors[key];if(!r||r.y+reference.originY>=reference.viewportHeight)continue;for(const prop of ['x','y','width','height'])delta=Math.max(delta,Math.abs(rect[prop]-r[prop]));}reports.push({navigation:destination,skeletonFrames:skeleton.length,actualFrames:actual.length,maxDelta:delta,frames});assert.ok(delta<=1,'页内切换稳定锚点偏移'+delta);
      }
      await navigationPage.goBack();await navigationPage.waitForLoadState('networkidle');await navigationPage.goForward();await navigationPage.waitForLoadState('networkidle');checks.push('训练与消耗普通切换、预取缓存命中和浏览器前进返回');
    }finally{await dispose(navigationContext);}
    }
    await control(0);
    const empty=await contextFor([390,640],config.empty),page=await empty.newPage();
    try{await page.goto(config.baseURL+'/dashboard/training');await page.waitForLoadState('networkidle');assert.equal(await page.getByRole('button',{name:'开始训练',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'自由训练',exact:true}).count(),0);assert.equal(await page.locator('[aria-label="训练月历"]> *').count(),42);for(const action of ['上个月','下个月','下个月']){await page.getByRole('button',{name:action,exact:true}).click();assert.equal(await page.locator('[aria-label="训练月历"]> *').count(),42);}await drain(empty);await page.goto(config.baseURL+'/dashboard/training?date=2027-01-15');await page.waitForLoadState('networkidle');assert.equal(await page.locator('[data-training-month]').innerText(),'2027年1月');assert.equal(await page.locator('[data-training-date="2027-01-15"]').getAttribute('aria-pressed'),'true');checks.push('无计划单一入口、六周网格及排期回执日期定位');
      if(config.trainingPreviewPath){
        await drain(empty);await page.goto(config.baseURL+config.trainingPreviewPath);await page.waitForLoadState('networkidle');await page.getByRole('heading',{name:'训练模板与排期',exact:true}).waitFor();
        for(const size of [[390,640],[1440,900]]){await page.setViewportSize({width:size[0],height:size[1]});const path=folder+'/gpt-plan-preview-'+size[0]+'.png';await page.screenshot({path});screenshots.push(path);}
        await page.setViewportSize({width:390,height:640});await page.getByRole('button',{name:'修改模板',exact:true}).click();await page.getByLabel('平板支撑目标秒数',{exact:true}).fill('45');await page.getByRole('button',{name:'应用修改',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByText('2组 · 45秒',{exact:true}).first().waitFor();
        await page.getByRole('button',{name:'确认保存',exact:true}).click();await page.waitForURL(config.baseURL+'/dashboard');await page.waitForLoadState('networkidle');await drain(empty);await page.locator('a[href="/dashboard/training"]:visible').first().click();await page.waitForURL(config.baseURL+'/dashboard/training');await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'按计划训练',exact:true}).waitFor();
        await page.getByRole('button',{name:'按计划训练',exact:true}).click();await page.getByLabel('杠铃卧推第1组次数',{exact:true}).waitFor();assert.equal(await page.getByLabel('杠铃卧推第1组次数',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('平板支撑第1组秒数',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('跑步机跑步第1组米数',{exact:true}).inputValue(),'');assert.ok(await page.getByText('模板目标：45秒',{exact:true}).isVisible());
        const path=folder+'/gpt-plan-started.png';await page.screenshot({path});screenshots.push(path);await page.getByRole('button',{name:'稍后继续',exact:true}).click();await page.locator('[data-training-editor]').waitFor({state:'detached'});await page.getByRole('button',{name:'继续训练',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'自由训练',exact:true}).count(),0);checks.push('GPT四类动作预览、人工修改、确认排期和目标与实测分离');
      }
    }finally{await dispose(empty);}
    const animated=await contextFor([1920,1080],config.empty),motionPage=await animated.newPage();await motionPage.emulateMedia({reducedMotion:'no-preference'});
    try{await motionPage.goto(config.baseURL+'/dashboard/training');await motionPage.waitForLoadState('networkidle');
      await motionPage.evaluate(()=>{window.__dialogFrames=[];const sample=reason=>{const node=document.querySelector('dialog[open][data-surface-mode=drawer]');if(node){const r=node.getBoundingClientRect();window.__dialogFrames.push({reason,phase:node.dataset.surfacePhase,left:r.left,right:r.right,viewport:innerWidth});}};const tick=()=>{sample('frame');requestAnimationFrame(tick);};requestAnimationFrame(tick);new MutationObserver(()=>sample('commit')).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','data-surface-phase']});});
      for(const method of ['button','escape','backdrop','interrupted']){
        await motionPage.getByRole('button',{name:'＋ 新建',exact:true}).click();const dialog=motionPage.getByRole('dialog',{name:'新建训练模板',exact:true});await dialog.waitFor();
        if(method!=='interrupted')await motionPage.waitForFunction(()=>document.querySelector('dialog[open]')?.dataset.surfacePhase==='open');
        if(method==='button') {const shot=folder+'/template-dialog-desktop.png';await motionPage.screenshot({path:shot});screenshots.push(shot);await dialog.getByLabel('关闭编辑',{exact:true}).click();}
        else if(method==='backdrop')await motionPage.mouse.click(5,5);else await motionPage.keyboard.press('Escape');
        await dialog.waitFor({state:'detached'});const frames=await motionPage.evaluate(()=>{const f=window.__dialogFrames;window.__dialogFrames=[];return f;});reports.push({motion:method,frames});await writeFile(folder+'/motion-'+method+'.json',JSON.stringify(frames));const closing=frames.filter(f=>f.phase==='closing'||f.phase==='closed');assert.ok(closing.some(f=>f.left>=f.viewport),method+'关闭必须完全离屏后卸载');
      }
      await motionPage.emulateMedia({reducedMotion:'reduce'});await motionPage.getByRole('button',{name:'＋ 新建',exact:true}).click();await motionPage.getByRole('dialog',{name:'新建训练模板',exact:true}).waitFor();await motionPage.keyboard.press('Escape');await motionPage.getByRole('dialog',{name:'新建训练模板',exact:true}).waitFor({state:'detached'});checks.push('宽屏关闭按钮、Escape、遮罩、入场中关闭与减少动态效果');
    }finally{await dispose(animated);}
    assert.deepEqual(errors,[]);await writeFile(folder+'/stability-report.json',JSON.stringify({passed:true,localSlowQueryCoverage:!!config.delayControlURL,reports,errors},null,2));
  }finally{await writeFile(folder+'/stability-diagnostics.json',JSON.stringify({reports,errors}));await control(0);}
}
