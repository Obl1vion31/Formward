import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {authenticateFixture} from './fixture-auth.mjs';

const config=JSON.parse(await readFile(process.env.FORMWARD_LOADING_CONFIG,'utf8'));
assert.equal(config.isolatedFixture,true);
assert.equal(new URL(config.baseURL).hostname,'127.0.0.1');
const version=await(await fetch(config.baseURL+'/api/app-version')).json();
const engines=await import(process.env.PLAYWRIGHT_MODULE??'/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs');
const engine=process.env.FORMWARD_CHART_ENGINE??'chromium',browser=await engines[engine].launch({headless:process.env.FORMWARD_CHART_HEADED!=='1',...(process.env.FORMWARD_CHART_EXECUTABLE_PATH?{executablePath:process.env.FORMWARD_CHART_EXECUTABLE_PATH}:{})});
const out=resolve(process.env.FORMWARD_CHART_ARTIFACTS??'.codex/chart-return',engine);
await mkdir(out,{recursive:true});
const results=[],body=[],errors=[];
const auth=await browser.newContext();
await authenticateFixture(auth.request,config,process.env.FORMWARD_LOADING_CONFIG);
const storageState=await auth.storageState();await auth.close();
const delay=async delayMs=>assert.equal((await fetch(config.delayControlURL,{method:'POST',body:JSON.stringify({delayMs})})).status,200);
async function settled(page){await page.waitForFunction(()=>!document.querySelector('.workspace-skeleton,[data-chart-flight]'));await page.waitForTimeout(550);}
function overview(page){return page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('link',{name:'总览',exact:true});}
async function create(width,height,theme='light'){
 const context=await browser.newContext({viewport:{width,height},storageState,hasTouch:width<1000,isMobile:width<1000,timezoneId:'Asia/Shanghai',locale:'zh-CN',recordVideo:process.env.FORMWARD_CHART_NO_VIDEO==='1'?undefined:{dir:out,size:{width,height}}});
 await context.addInitScript(userId=>{for(const kind of ['meals','body','energy','training'])localStorage.setItem('formward:record-guide:v1:'+encodeURIComponent(userId)+':'+kind,'seen');},config.userId);
 await context.addInitScript(theme=>{
  localStorage.setItem('formward-theme',theme);
  window.chartFrames=[];window.chartMark=null;window.chartStarts=[];window.chartObservedStarts=[];window.firstOverviewRange=null;window.firstOverviewCard=null;
  // MutationObserver在整次React提交后才派发，不能把派发延迟当作动画起步。直接记录真实WAAPI调用，另保留观察时间。
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){const animation=animate.apply(this,args);if(window.chartMark!==null&&this.matches('[data-chart-flight][data-chart-direction="back"]'))window.chartStarts.push({id:this.dataset.chartFlight,t:performance.now()-window.chartMark,range:[...document.querySelectorAll('[aria-label="日期视角"] button[aria-pressed=true]')].find(node=>node.getClientRects().length&&getComputedStyle(node).visibility==='visible'&&!node.closest('[data-return-covered],[inert]'))?.textContent});return animation;};
  document.addEventListener('click',event=>{const card=event.target.closest?.('a[data-metric-card]');if(card)window.chartOrigin={rail:card.closest('[data-metric-rail]').scrollLeft,scroll:scrollY,kind:card.dataset.metricCard,card:card.getBoundingClientRect().toJSON()};const link=event.target.closest?.('a[href="/dashboard"]');if(link&&location.pathname!=='/dashboard'){window.chartMark=performance.now();window.chartFrames=[];window.chartStarts=[];window.chartObservedStarts=[];window.firstOverviewRange=null;window.firstOverviewCard=null;}},true);
  new MutationObserver(()=>{
   if(window.chartMark===null)return;
   const node=document.querySelector('[data-chart-flight][data-motion-starts="1"]');
   if(node&&node.dataset.chartDirection==='back'&&!window.chartObservedStarts.some(start=>start.id===node.dataset.chartFlight))window.chartObservedStarts.push({id:node.dataset.chartFlight,t:performance.now()-window.chartMark});
  }).observe(document,{subtree:true,attributes:true,attributeFilter:['data-motion-starts']});
  function frame(t){
   if(window.chartMark!==null){
    // 图形可在原详情上先起步；区间应读取首个可见总览帧，不能误读尚在退出的详情“自定义”。
    if(window.firstOverviewRange===null){const overview=document.querySelector('[data-workspace-frame="overview"]');if(overview){window.firstOverviewRange=[...overview.querySelectorAll('[aria-label="日期视角"] button[aria-pressed=true]')].find(node=>node.getClientRects().length&&!node.closest('[data-return-covered],[data-return-prepared],[inert]'))?.textContent??null;const card=[...overview.querySelectorAll('a[data-metric-card]')].find(node=>node.dataset.metricCard===window.chartOrigin?.kind&&node.getClientRects().length&&!node.closest('[data-return-covered],[data-return-prepared],[inert]'));if(card)window.firstOverviewCard=card.getBoundingClientRect().toJSON();}}
    const node=document.querySelector('[data-chart-flight]'),visible=!!node&&node.style.visibility==='visible';
    let sourceVisible=true;
    // 只在真正等待的帧读取一次源图样式，避免验收探针逐帧强制整页布局、影响被测动效。
    if(node?.dataset.chartDirection==='back'&&!visible&&location.pathname!=='/dashboard'){
     const source=document.querySelector('[data-chart-arrival] [data-trend-glyph]'),primitive=source?.querySelector('rect,line,circle');
     sourceVisible=!!primitive&&getComputedStyle(source).visibility!=='hidden'&&+getComputedStyle(primitive).opacity>0;
    }
    window.chartFrames.push({t:performance.now()-window.chartMark,rafTime:t-window.chartMark,path:location.pathname,id:node?.dataset.chartFlight,dir:node?.dataset.chartDirection,visible,moving:!!node?.dataset.motionStarts,sourceVisible});
   }
   requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
 },theme);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 return {context,page};
}
async function inspectReturn(page,label,{paired=true,warm=true}={}){
 await page.waitForURL(url=>url.pathname==='/dashboard');await settled(page);
 const {frames,starts,observedStarts,firstOverviewRange,firstOverviewCard}=await page.evaluate(()=>{const value={frames:window.chartFrames,starts:window.chartStarts,observedStarts:window.chartObservedStarts,firstOverviewRange:window.firstOverviewRange,firstOverviewCard:window.firstOverviewCard};window.chartMark=null;return value;});
 const back=frames.filter(frame=>frame.dir==='back'),ids=[...new Set(back.map(frame=>frame.id))],first=back.find(frame=>frame.visible&&frame.moving);
 const result={label,paired,firstMotion:starts[0]?.t??null,startedRange:starts[0]?.range??null,firstOverviewRange,firstOverviewCard,firstPresentedFrame:first?.t??null,observedStarts,frames};results.push(result);
 assert.ok(ids.length<=1,label+'重复回程');
 assert.ok(starts.length<=1,label+'重复启动动画');
 if(paired){assert.ok(first,label+'缺少回程运动');assert.ok(starts[0],label+'缺少运动启动');if(warm)assert.ok(starts[0].t<=100,label+'起步超过100ms: '+starts[0].t);}
 for(const frame of back)if(!frame.visible&&frame.path!=='/dashboard')assert.equal(frame.sourceVisible,true,label+'等待时原图消失');
 assert.equal(await page.locator('[data-chart-flight],[data-chart-travelling]').count(),0);
  const position=await page.evaluate(()=>({expected:window.chartOrigin,rail:[...document.querySelectorAll('[data-metric-rail]')].find(node=>node.getClientRects().length>0&&!node.closest('[inert]')).scrollLeft,scroll:scrollY,focus:document.activeElement?.closest('[data-metric-card]')?.dataset.metricCard,active:document.activeElement?{tag:document.activeElement.tagName,role:document.activeElement.getAttribute('role'),label:document.activeElement.getAttribute('aria-label'),cached:!!document.activeElement.closest('[data-workspace-cached]')}:null}));
 result.position=position;if(position.expected){assert.ok(Math.abs(position.rail-position.expected.rail)<=1,label+'卡片带未恢复');assert.ok(Math.abs(position.scroll-position.expected.scroll)<=1,label+'页面滚动未恢复');assert.equal(position.focus,position.expected.kind,label+'焦点回到原卡片');}
 if(position.expected?.card&&firstOverviewCard)for(const key of ['x','y','width','height'])assert.ok(Math.abs(firstOverviewCard[key]-position.expected.card[key])<=1,label+'首个总览帧卡片'+key+'跳动');
 return result;
}
async function bodyGeometry(page){return page.evaluate(()=>{
 const plot=document.querySelector('[data-body-plot]'),svg=plot.querySelector('svg'),hint=document.querySelector('[data-body-plot-readout]');
 // 手机按已认可布局不显示重复的图后读数，稳定锚点检查实际可见的主读数区。
 const readout=hint?.getBoundingClientRect().height?hint:[...document.querySelectorAll('[data-record-slot="metrics"]')].find(node=>node.getBoundingClientRect().height>0);
 const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 const glyph=svg.querySelector('[data-trend-glyph]'),point=glyph?.querySelector('[data-glyph-point]'),line=glyph?.querySelector('[data-glyph-line]');
 const count=glyph?JSON.parse(glyph.dataset.trendKey).points.length:0;
 return {scrollY,plot:box(plot),readout:box(readout),ticks:[...svg.querySelectorAll('text')].filter(n=>/^\d{2}\.\d{2}$/.test(n.textContent)).map(n=>({text:n.textContent,...box(n)})),text:hint.textContent,visibleReading:readout.textContent,pointDiameter:point?.getBoundingClientRect().width??null,stroke:line?Number(getComputedStyle(line).strokeWidth.replace('px','')):null,count};
});}
function checkBodyInk(geometry,label){
 assert.ok(geometry.readout.height>0&&geometry.readout.width>0,label+'实际读数区必须可见');
 if(geometry.pointDiameter!==null)assert.ok(Math.abs(geometry.pointDiameter-7)<=.1,label+'数据点随SVG放大');
 if(geometry.stroke!==null)assert.ok(Math.abs(geometry.stroke-(geometry.count<=7?2.5:1.75))<=.01,label+'主线宽度不一致');
}
try{
 const sizes=(process.env.FORMWARD_CHART_QUICK==='1'?[[390,780],[1440,1000]]:[[320,780],[390,780],[430,780],[1100,900],[1440,1000],[1920,1080]]).filter(([width])=>!process.env.FORMWARD_CHART_WIDTHS||process.env.FORMWARD_CHART_WIDTHS.split(',').includes(String(width)));
 for(const [width,height] of sizes){
  const {context,page}=await create(width,height,width===390||width===1100?'dark':'light');
  try{
   await page.goto(config.baseURL+'/dashboard');await settled(page);
   const loops=process.env.FORMWARD_CHART_BODY_ONLY==='1'||process.env.FORMWARD_CHART_POSITION_ONLY==='1'?0:process.env.FORMWARD_CHART_QUICK==='1'?2:width===390||width===1440?20:3;
   for(const kind of ['intake','morning-weight','energy'])for(let i=0;i<loops;i++){
    await page.locator(`[data-metric-card="${kind}"]:visible`).click();await settled(page);
    await overview(page).click();await inspectReturn(page,`${width}-${kind}-${i+1}`);
    if(i===0||i===loops-1)await page.screenshot({path:out+`/${width}-${kind}-return-${i+1}.png`});
   }
   await page.getByRole('button',{name:'90D',exact:true}).click();await page.locator('[data-metric-card="intake"]:visible').click();await settled(page);await overview(page).click();const remembered=await inspectReturn(page,`${width}-overview-range`);assert.equal(remembered.firstOverviewRange,'90D','首个可见总览帧保留已应用区间');assert.equal(await page.getByRole('button',{name:'90D',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:width<700?'7D':'30D',exact:true}).click();
   await page.locator('[data-metric-card="morning-weight"]:visible').click();await settled(page);
   for(const range of ['custom','7D','30D']){
    if(range!=='custom')await page.getByRole('button',{name:range,exact:true}).click();
    const evening=page.getByRole('checkbox',{name:'晚间数据'});await evening.uncheck();await page.waitForTimeout(200);
    const before=await bodyGeometry(page),fixedScroll=await page.evaluate(()=>scrollY);await evening.check();await page.evaluate(top=>window.scrollTo({top,behavior:'instant'}),fixedScroll);await page.waitForTimeout(200);const after=await bodyGeometry(page);body.push({width,range,before,after});
    checkBodyInk(before,`${width}-${range}-morning`);checkBodyInk(after,`${width}-${range}-evening`);
    assert.deepEqual(before.ticks,after.ticks,`${width}-${range}晚间改变日期轴`);
    for(const key of ['plot','readout'])for(const property of ['x','y','width','height'])assert.ok(Math.abs(before[key][property]-after[key][property])<=1,`${width}-${range}-${key}.${property}`);
    assert.ok(after.ticks.length<=4);assert.ok(after.text===''||/^\d{4}\.\d{2}\.\d{2} · (晨间|晚间) · /.test(after.text));
    const points=page.locator('[data-body-plot] [data-point-id]');await points.first().click();
    assert.equal(await points.first().getAttribute('aria-pressed'),'true');
    await page.screenshot({path:out+`/${width}-body-${range}-evening.png`});
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
   await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-metric-card="energy"]:visible').click();await settled(page);
   await overview(page).click();await inspectReturn(page,`${width}-reduced`,{paired:false});await page.emulateMedia({reducedMotion:'no-preference'});
   await page.locator('[data-metric-card="intake"]:visible').click();await settled(page);
   await delay(650);await overview(page).click();await inspectReturn(page,`${width}-slow`,{warm:false});await delay(0);
   await page.locator('[data-metric-card="energy"]:visible').click();await page.waitForTimeout(40);await overview(page).click();await inspectReturn(page,`${width}-quick-reverse`,{warm:false});
   await page.locator('[data-metric-card="morning-weight"]:visible').click();await settled(page);
   await page.evaluate(()=>{window.chartMark=performance.now();window.chartFrames=[];window.chartStarts=[];window.chartObservedStarts=[];window.firstOverviewRange=null;window.firstOverviewCard=null;});await page.goBack();await inspectReturn(page,`${width}-browser-back`,{warm:false});
   await page.locator('[data-metric-card="intake"]:visible').click();await settled(page);await delay(650);await overview(page).click();
   await page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('link',{name:'身体',exact:true}).click();await page.waitForURL(url=>url.pathname==='/dashboard/measurements');await settled(page);
   assert.equal(await page.locator('[data-workspace-frame=body]').count(),1);assert.equal(await page.locator('[data-chart-flight],[data-return-covered]').count(),0);await delay(0);
   console.log(JSON.stringify({width,returns:results.length,body:body.length}));
  }finally{await delay(0);await context.close();}
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,version,results,body,errors},null,2));
 console.log(JSON.stringify({passed:true,returns:results.length,body:body.length,maxWarmStart:Math.max(...results.filter(r=>r.paired&&!/slow|reverse|browser/.test(r.label)).map(r=>r.firstMotion))}));
}catch(error){await writeFile(out+'/failure.json',JSON.stringify({error:String(error),results,body,errors},null,2));throw error;}
finally{await delay(0);await browser.close();}
