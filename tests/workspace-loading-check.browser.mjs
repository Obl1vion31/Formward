import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const config=JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG,'utf8'));
assert.equal(config.isolatedFixture,true,'加载验收只接受本机虚构数据库');
assert.equal(new URL(config.baseURL).hostname,'127.0.0.1');
const engines=await import('/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs');
const engine=process.env.FORMWARD_LOADING_ENGINE??'chromium',browser=await engines[engine].launch({headless:true});
const folder=resolve(process.env.FORMWARD_LOADING_ARTIFACTS??'.codex/workspace-loading',engine);await mkdir(folder,{recursive:true});
const reports=[],failures=[],errors=[],screenshots=[];
const routes=[['','overview'],['meals','nutrition'],['training','training'],['energy','energy'],['measurements','body']].filter(([,kind])=>!process.env.FORMWARD_LOADING_KINDS||process.env.FORMWARD_LOADING_KINDS.split(',').includes(kind));
async function control(delayMs){const response=await fetch(config.delayControlURL,{method:'POST',body:JSON.stringify({delayMs})});assert.equal(response.status,200);}
const login=await browser.newContext();assert.equal((await login.request.post(config.baseURL+'/api/auth/sign-in/email',{headers:{Origin:config.baseURL},data:{email:config.email,password:config.password}})).status(),200);const storageState=await login.storageState();await login.close();
const sizes=process.env.FORMWARD_LOADING_DIAGNOSE==='1'?[[390,640],[1440,900]]:[[320,560],[390,560],[390,640],[430,780],[640,390],[1100,800],[1440,900],[1920,1080]];
async function shot(page,name,fullPage=false){const path=folder+'/'+name+'.png';await page.screenshot({path,fullPage});screenshots.push(path);}
async function createContext(size,theme='dark',motion='reduce',recording=false){
 const context=await browser.newContext({viewport:{width:size[0],height:size[1]},hasTouch:size[0]<1000,storageState,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:motion,recordVideo:recording?{dir:folder+'/videos',size:{width:size[0],height:size[1]}}:undefined});
 await context.addInitScript(({theme})=>{
  if(location.protocol!=='http:'&&location.protocol!=='https:')return;
  localStorage.setItem('formward-assistant-seen-v1','true');localStorage.setItem('formward-theme',theme);
  window.__loadingFrames=[];
  const visible=node=>node&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0&&getComputedStyle(node).visibility!=='hidden'&&getComputedStyle(node).display!=='none';
  const first=(selector,root=document)=>[...root.querySelectorAll(selector)].find(visible);
  const sample=()=>{
   const content=first('[data-workspace-content]'),frame=document.querySelector('[data-workspace-frame]');
   if(content&&frame){
    const kind=frame.dataset.workspaceFrame,root=first('.workspace-skeleton,[data-training-loading],[data-record-workspace],[data-training-view]',content);
    if(root){
     const skeleton=root.matches('.workspace-skeleton,[data-training-loading]'),mobile=matchMedia('(max-width:700px),(hover:none) and (pointer:coarse)').matches;
     const selectors=kind==='training'?{today:'section[aria-label="今日训练"]',action:'section[aria-label="今日训练"] [class*="todayActions"]',templates:'[data-training-templates]',calendarTitle:'[class*="calendarSection"]>[class*="sectionHeading"]',weekdays:'[class*="weekdays"]',calendar:'[class*="calendarSection"]>[class*="calendar"]'}:kind==='overview'?mobile?{rail:'[data-metric-rail],[data-metric-rail-skeleton]',title:'[class*="mobileTrendHeading"]',range:'[aria-label="日期视角"]',date:'[class*="mobileSelected"]',legend:'[class*="mobileLegend"]',plot:'.skeleton-relationship,[class*="relationship"]'}:{rail:'[data-metric-rail],[data-metric-rail-skeleton]',date:'[data-record-slot=date]',metrics:'[data-record-slot=metrics]',range:'[data-record-slot=range]',title:'[data-record-slot=title]',plot:'.skeleton-relationship,[class*="relationship"]'}:{date:'[data-record-slot=date]',metrics:'[data-record-slot=metrics]',range:'[data-record-slot=range]',title:'[data-record-slot=title]',plot:'[data-record-slot=plot]',records:'[data-record-slot=records]>div:first-child'};
     const origin=content.getBoundingClientRect(),anchors={},missing=[];
     for(const[key,selector]of Object.entries(selectors)){const node=first(selector,root);if(!node)missing.push(key);else{const r=node.getBoundingClientRect();anchors[key]={x:r.x-origin.x,y:r.y-origin.y,width:r.width,height:r.height};}}
     const statics=[...root.querySelectorAll('button,h2,[data-record-slot=legend]>span,[class*="mobileLegend"]>span')].filter(visible).map(node=>node.textContent.trim());
     const colors=[...root.querySelectorAll('[data-record-slot=legend]>span,[class*="mobileLegend"]>span')].filter(visible).filter(node=>node.querySelector('i')).map(node=>({label:node.textContent.trim(),color:getComputedStyle(node.querySelector('i')).backgroundColor}));
     const actionButtons=[...root.querySelectorAll('[class*="todayActions"] button')].map(node=>({label:node.textContent.trim(),width:node.getBoundingClientRect().width,disabled:node.disabled}));
     const buttons=[...root.querySelectorAll('button')].filter(visible).map(node=>({label:node.textContent.trim(),disabled:node.disabled}));
     if(window.__loadingFrames.length<6000)window.__loadingFrames.push({time:performance.now(),kind,phase:skeleton?'loading':'actual',originY:origin.y,viewportHeight:innerHeight,scrollY,anchors,missing,statics,colors,actionButtons,buttons,pageTitle:!!first('h1,[role="heading"][aria-level="1"]'),recordRows:root.querySelectorAll('[data-record-date]').length});
    }
   }requestAnimationFrame(sample);
  };requestAnimationFrame(sample);
 },{theme});
 if(!recording)context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
 return context;
}
try{
 await control(900);
 for(const theme of (process.env.FORMWARD_LOADING_PART==='flows'?[]:process.env.FORMWARD_LOADING_DIAGNOSE==='1'?['dark']:['dark','light']))for(const size of sizes)for(const[route,kind]of routes){
  const context=await createContext(size,theme),page=await context.newPage(),prefix=theme+'-'+(route||'overview')+'-'+size.join('x');
  try{
   await page.goto(config.baseURL+'/dashboard'+(route?'/'+route:''),{waitUntil:'commit'});
   await page.locator(kind==='training'?'[data-training-loading]:visible':'.workspace-skeleton:visible').waitFor({state:'visible'});await shot(page,prefix+'-loading');
   const required=kind==='training'?['开始训练','训练模板','训练日历']:kind==='overview'?['摄入','消耗','盈余','缺口']:['查看记录','最近记录','查看全部',...(kind==='nutrition'?['食材库','蛋白质','碳水','脂肪']:[])];
   await page.locator(kind==='training'?'[data-training-view]':'[data-record-workspace]:not(.workspace-skeleton [data-record-workspace])').waitFor({state:'visible'});await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(550);await shot(page,prefix+'-actual');
   const frames=await page.evaluate(()=>window.__loadingFrames),loading=frames.filter(f=>f.phase==='loading'),actual=frames.filter(f=>f.phase==='actual');assert.ok(loading.length>=2);assert.ok(actual.length>=2);
   // 在实际加载帧核对，避免截图命令完成时内容已就绪而误查卸载的骨架。
   for(const frame of loading){for(const label of required)assert.ok(frame.statics.some(value=>value.includes(label)),prefix+'加载帧缺少或隐藏固定文字 '+label);assert.ok(frame.pageTitle,prefix+'加载帧固定页名不可见');if(kind!=='overview'){const label=kind==='training'?'开始训练':'查看记录';const button=frame.buttons.find(item=>item.label.includes(label));assert.ok(button,prefix+'加载帧缺少操作 '+label);assert.equal(button.disabled,true);}}
   const baseline=loading.at(-1),deltas=[];
   for(const f of frames){assert.deepEqual(f.missing,[],prefix+'缺少固定槽位');for(const[key,r]of Object.entries(baseline.anchors)){const a=f.anchors[key];assert.ok(a,prefix+'丢失槽位 '+key);if(r.y+baseline.originY>=baseline.viewportHeight||r.y+r.height+baseline.originY<=0)continue;for(const prop of ['x','y','width','height'])deltas.push({key,prop,delta:Math.abs(a[prop]-r[prop])});}}
   const max=deltas.reduce((a,b)=>a.delta>b.delta?a:b,{delta:0});
   if(kind==='overview'||kind==='nutrition'||kind==='energy'){
    const expected=kind==='overview'?['摄入','消耗','盈余','缺口']:kind==='nutrition'?['蛋白质','碳水','脂肪']:['静息','活动','仅有总数'];
    for(const label of expected){const color=baseline.colors.find(c=>c.label===label);assert.ok(color,prefix+'缺少颜色 '+label);assert.notEqual(color.color,'rgba(0, 0, 0, 0)');assert.equal(actual.at(-1).colors.find(c=>c.label===label)?.color,color.color,prefix+'颜色交接变化 '+label);}
   }
   const report={theme,size,route:route||'overview',max,loadingFrames:loading.length,actualFrames:actual.length,frames};reports.push(report);await writeFile(folder+'/'+prefix+'-frames.json',JSON.stringify(report));if(max.delta>1)failures.push({prefix,max});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),prefix+'横向溢出');
  }catch(error){const failure={prefix,error:String(error),stack:error.stack,frames:await page.evaluate(()=>window.__loadingFrames)};failures.push({prefix,error:String(error)});await writeFile(folder+'/'+prefix+'-failure.json',JSON.stringify(failure));await shot(page,prefix+'-failure');}
  finally{await context.close();}
 }
 if(process.env.FORMWARD_LOADING_DIAGNOSE!=='1'&&process.env.FORMWARD_LOADING_PART!=='matrix'){
  await writeFile(folder+'/matrix-report.json',JSON.stringify({passed:failures.length===0&&errors.length===0,engine,reports:reports.map(report=>({...report,frames:undefined})),failures,errors,screenshots},null,2));
  const {checkLoadingFlows}=await import('./workspace-loading-flows.browser.mjs');await checkLoadingFlows({browser,config,folder,createContext,control,shot});
 }
 await writeFile(folder+'/report.json',JSON.stringify({passed:failures.length===0&&errors.length===0,engine,reports:reports.map(report=>({...report,frames:undefined})),failures,errors,screenshots},null,2));
 console.log(JSON.stringify({engine,cases:reports.length,failures,errors}));
 if(process.env.FORMWARD_LOADING_DIAGNOSE!=='1'){assert.deepEqual(failures,[]);assert.deepEqual(errors,[]);}
}finally{await control(0);await browser.close();}
