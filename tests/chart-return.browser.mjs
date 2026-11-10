import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const config=JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG,'utf8'));
assert.equal(config.isolatedFixture,true);
assert.equal(new URL(config.baseURL).hostname,'127.0.0.1');
const engines=await import(process.env.PLAYWRIGHT_MODULE??'/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs');
const engine=process.env.FORMWARD_CHART_ENGINE??'chromium',browser=await engines[engine].launch({headless:process.env.FORMWARD_CHART_HEADED!=='1'});
const out=resolve(process.env.FORMWARD_CHART_ARTIFACTS??'.codex/chart-return',engine);
await mkdir(out,{recursive:true});
const results=[],body=[],errors=[];
const auth=await browser.newContext();
assert.equal((await auth.request.post(config.baseURL+'/api/auth/sign-in/email',{headers:{Origin:config.baseURL},data:{email:config.email,password:config.password}})).status(),200);
const storageState=await auth.storageState();await auth.close();
const delay=async delayMs=>assert.equal((await fetch(config.delayControlURL,{method:'POST',body:JSON.stringify({delayMs})})).status,200);
async function settled(page){await page.waitForFunction(()=>!document.querySelector('.workspace-skeleton,[data-chart-flight]'));await page.waitForTimeout(550);}
function overview(page){return page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('link',{name:'总览',exact:true});}
async function create(width,height,theme='light'){
 const context=await browser.newContext({viewport:{width,height},storageState,hasTouch:width<1000,isMobile:width<1000,timezoneId:'Asia/Shanghai',locale:'zh-CN',recordVideo:process.env.FORMWARD_CHART_NO_VIDEO==='1'?undefined:{dir:out,size:{width,height}}});
 await context.addInitScript(theme=>{
  localStorage.setItem('formward-theme',theme);
  window.chartFrames=[];window.chartMark=null;window.chartStarts=[];
  document.addEventListener('click',event=>{const card=event.target.closest?.('a[data-metric-card]');if(card)window.chartOrigin={rail:card.closest('[data-metric-rail]').scrollLeft,scroll:scrollY};const link=event.target.closest?.('a[href="/dashboard"]');if(link&&location.pathname!=='/dashboard'){window.chartMark=performance.now();window.chartFrames=[];window.chartStarts=[];}},true);
  new MutationObserver(()=>{
   if(window.chartMark===null)return;
   const node=document.querySelector('[data-chart-flight][data-motion-starts="1"]');
   if(node&&node.dataset.chartDirection==='back'&&!window.chartStarts.some(start=>start.id===node.dataset.chartFlight))window.chartStarts.push({id:node.dataset.chartFlight,t:performance.now()-window.chartMark});
  }).observe(document,{subtree:true,attributes:true,attributeFilter:['data-motion-starts']});
  function frame(t){
   if(window.chartMark!==null){
    const node=document.querySelector('[data-chart-flight]'),visible=!!node&&node.style.visibility==='visible';
    let sourceVisible=true;
    // 只在真正等待的帧读取一次源图样式，避免验收探针逐帧强制整页布局、影响被测动效。
    if(node?.dataset.chartDirection==='back'&&!visible&&location.pathname!=='/dashboard'){
     const source=document.querySelector('[data-chart-arrival] [data-trend-glyph]'),primitive=source?.querySelector('rect,line,circle');
     sourceVisible=!!primitive&&getComputedStyle(source).visibility!=='hidden'&&+getComputedStyle(primitive).opacity>0;
    }
    window.chartFrames.push({t:t-window.chartMark,path:location.pathname,id:node?.dataset.chartFlight,dir:node?.dataset.chartDirection,visible,moving:!!node?.dataset.motionStarts,sourceVisible});
   }
   requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
 },theme);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 return {context,page};
}
async function inspectReturn(page,label,{paired=true,warm=true}={}){
 await page.waitForURL(url=>url.pathname==='/dashboard');await settled(page);
 const {frames,starts}=await page.evaluate(()=>{const value={frames:window.chartFrames,starts:window.chartStarts};window.chartMark=null;return value;});
 const back=frames.filter(frame=>frame.dir==='back'),ids=[...new Set(back.map(frame=>frame.id))],first=back.find(frame=>frame.visible&&frame.moving);
 const result={label,paired,firstMotion:starts[0]?.t??null,firstPresentedFrame:first?.t??null,frames};results.push(result);
 assert.ok(ids.length<=1,label+'重复回程');
 assert.ok(starts.length<=1,label+'重复启动动画');
 if(paired){assert.ok(first,label+'缺少回程运动');assert.ok(starts[0],label+'缺少运动启动');if(warm)assert.ok(starts[0].t<=100,label+'起步超过100ms: '+starts[0].t);}
 for(const frame of back)if(!frame.visible&&frame.path!=='/dashboard')assert.equal(frame.sourceVisible,true,label+'等待时原图消失');
 assert.equal(await page.locator('[data-chart-flight],[data-chart-travelling]').count(),0);
 const position=await page.evaluate(()=>({expected:window.chartOrigin,rail:document.querySelector('[data-metric-rail]').scrollLeft,scroll:scrollY}));
 if(position.expected){assert.ok(Math.abs(position.rail-position.expected.rail)<=1,label+'卡片带未恢复');assert.ok(Math.abs(position.scroll-position.expected.scroll)<=1,label+'页面滚动未恢复');}
 return result;
}
async function bodyGeometry(page){return page.evaluate(()=>{
 const plot=document.querySelector('[data-body-plot]'),svg=plot.querySelector('svg'),readout=document.querySelector('[data-body-plot-readout]');
 const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 const glyph=svg.querySelector('[data-trend-glyph]'),point=glyph?.querySelector('[data-glyph-point]'),line=glyph?.querySelector('[data-glyph-line]');
 const count=glyph?JSON.parse(glyph.dataset.trendKey).points.length:0;
 return {plot:box(plot),readout:box(readout),ticks:[...svg.querySelectorAll('text')].filter(n=>/^\d{2}\.\d{2}$/.test(n.textContent)).map(n=>({text:n.textContent,...box(n)})),text:readout.textContent,pointDiameter:point?.getBoundingClientRect().width??null,stroke:line?Number(getComputedStyle(line).strokeWidth.replace('px','')):null,count};
});}
function checkBodyInk(geometry,label){
 if(geometry.pointDiameter!==null)assert.ok(Math.abs(geometry.pointDiameter-(geometry.count<=7?9:7))<=.1,label+'数据点随SVG放大');
 if(geometry.stroke!==null)assert.ok(Math.abs(geometry.stroke-(geometry.count<=7?2.5:1.75))<=.01,label+'主线宽度不一致');
}
try{
 const sizes=(process.env.FORMWARD_CHART_QUICK==='1'?[[390,780],[1440,1000]]:[[320,780],[390,780],[430,780],[1100,900],[1440,1000],[1920,1080]]).filter(([width])=>!process.env.FORMWARD_CHART_WIDTHS||process.env.FORMWARD_CHART_WIDTHS.split(',').includes(String(width)));
 for(const [width,height] of sizes){
  const {context,page}=await create(width,height,width===390||width===1100?'dark':'light');
  try{
   await page.goto(config.baseURL+'/dashboard');await settled(page);
   const loops=process.env.FORMWARD_CHART_BODY_ONLY==='1'?0:process.env.FORMWARD_CHART_QUICK==='1'?2:width===390||width===1440?20:3;
   for(const kind of ['intake','morning-weight','energy'])for(let i=0;i<loops;i++){
    await page.locator(`[data-metric-card="${kind}"]`).click();await settled(page);
    await overview(page).click();await inspectReturn(page,`${width}-${kind}-${i+1}`);
    if(i===0||i===loops-1)await page.screenshot({path:out+`/${width}-${kind}-return-${i+1}.png`});
   }
   await page.locator('[data-metric-card="morning-weight"]').click();await settled(page);
   for(const range of ['custom','7D','30D']){
    if(range!=='custom')await page.getByRole('button',{name:range,exact:true}).click();
    const evening=page.getByRole('checkbox',{name:'晚间数据'});await evening.uncheck();await page.waitForTimeout(200);
    const before=await bodyGeometry(page);await evening.check();await page.waitForTimeout(200);const after=await bodyGeometry(page);
    checkBodyInk(before,`${width}-${range}-morning`);checkBodyInk(after,`${width}-${range}-evening`);
    assert.deepEqual(before.ticks,after.ticks,`${width}-${range}晚间改变日期轴`);
    for(const key of ['plot','readout'])for(const property of ['x','y','width','height'])assert.ok(Math.abs(before[key][property]-after[key][property])<=1,`${width}-${range}-${key}.${property}`);
    assert.ok(after.ticks.length<=4);assert.ok(after.text===''||/^\d{4}\.\d{2}\.\d{2} · (晨间|晚间) · /.test(after.text));
    const points=page.locator('[data-body-plot] [data-point-id]');await points.first().click();
    assert.equal(await points.first().getAttribute('aria-pressed'),'true');
    body.push({width,range,before,after});await page.screenshot({path:out+`/${width}-body-${range}-evening.png`});
   }
   const fatCard=page.getByRole('button',{name:'查看晨间体脂率趋势'});
   if(await fatCard.count()){
    await fatCard.click();await page.waitForTimeout(200);const fat=await bodyGeometry(page);
    checkBodyInk(fat,`${width}-fat`);
    assert.ok(fat.ticks.length<=4);body.push({width,metric:'bodyFatPercent',geometry:fat});
    await page.screenshot({path:out+`/${width}-body-fat.png`});
   }
   if(process.env.FORMWARD_CHART_BODY_ONLY==='1'){console.log(JSON.stringify({width,body:body.length}));continue;}
   await overview(page).click();await inspectReturn(page,`${width}-changed-indicator`,{paired:false});
   await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-metric-card="energy"]').click();await settled(page);
   await overview(page).click();await inspectReturn(page,`${width}-reduced`,{paired:false});await page.emulateMedia({reducedMotion:'no-preference'});
   await page.locator('[data-metric-card="intake"]').click();await settled(page);
   await delay(650);await overview(page).click();await inspectReturn(page,`${width}-slow`,{warm:false});await delay(0);
   await page.locator('[data-metric-card="energy"]').click();await page.waitForTimeout(40);await overview(page).click();await inspectReturn(page,`${width}-quick-reverse`,{warm:false});
   await page.locator('[data-metric-card="morning-weight"]').click();await settled(page);
   await page.evaluate(()=>{window.chartMark=performance.now();window.chartFrames=[];window.chartStarts=[];});await page.goBack();await inspectReturn(page,`${width}-browser-back`,{warm:false});
   await page.locator('[data-metric-card="intake"]').click();await settled(page);await delay(650);await overview(page).click();
   await page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('link',{name:'身体',exact:true}).click();await page.waitForURL(url=>url.pathname==='/dashboard/measurements');await settled(page);
   assert.equal(await page.locator('[data-workspace-frame=body]').count(),1);assert.equal(await page.locator('[data-chart-flight],[data-return-covered]').count(),0);await delay(0);
   console.log(JSON.stringify({width,returns:results.length,body:body.length}));
  }finally{await delay(0);await context.close();}
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'/report.json',JSON.stringify({results,body,errors},null,2));
 console.log(JSON.stringify({passed:true,returns:results.length,body:body.length,maxWarmStart:Math.max(...results.filter(r=>r.paired&&!/slow|reverse|browser/.test(r.label)).map(r=>r.firstMotion))}));
}catch(error){await writeFile(out+'/failure.json',JSON.stringify({error:String(error),results,body,errors},null,2));throw error;}
finally{await delay(0);await browser.close();}
