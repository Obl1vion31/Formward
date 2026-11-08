import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
/** 真实浏览器输入：Chromium用CDP触点，WebKit使用原生触屏点按及指针连续拖动；不伪造capture。 */
export async function checkTrainingCompact({page: originalPage,context: originalContext,config,folder,engine,checks,screenshots}) {
  const context=await originalContext.browser().newContext({viewport:{width:390,height:640},hasTouch:true,isMobile:true,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce',storageState:await originalContext.storageState()});
  const page=await context.newPage(),errors=[],failures=[],inputs=[];let posts=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=500)failures.push(r.status()+' '+new URL(r.url()).pathname);});page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/dashboard/training')posts++;});
  await context.addInitScript(()=>{if(!/^https?:$/.test(location.protocol))return;localStorage.setItem('formward-assistant-seen-v1','true');window.__trainingPointerInputs=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(name,e=>{if(window.__trainingPointerInputs.length<1500)window.__trainingPointerInputs.push({type:e.type,pointerType:e.pointerType,trusted:e.isTrusted});},true);});
  async function ready(){await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);}
  async function shot(name){await ready();const p=folder+'/compact-'+name+'.png';await page.screenshot({path:p});screenshots.push(p);}
  async function removeDialog(){await page.getByLabel('胸 · 肩 · 三头更多操作',{exact:true}).click();await page.getByRole('button',{name:'删除训练',exact:true}).click();return page.getByRole('dialog');}
  let cdp;
  try{
    await page.goto(config.baseURL+'/dashboard/training');await ready();
    const templates=page.getByRole('button',{name:'训练模板',exact:true});assert.equal(await templates.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('[aria-label="训练与消耗"]:visible').count(),1);
    const geometry=await page.evaluate(()=>{const nav=[...document.querySelectorAll('[aria-label="训练与消耗"]')].find(n=>n.getBoundingClientRect().height>0),header=document.querySelector('.dashboard-header').getBoundingClientRect(),today=document.querySelector('[aria-label="今日训练"]').getBoundingClientRect();return{inHeader:!!nav.closest('.dashboard-header'),gap:today.top-header.bottom,headerHeight:header.height};});
    assert.equal(geometry.inHeader,true);assert.equal(geometry.headerHeight,64);assert.ok(geometry.gap>=0&&geometry.gap<=40,JSON.stringify(geometry));
    assert.equal(await page.getByText('今天已经练过了',{exact:true}).count(),0);assert.equal(await page.getByText('今天，自由安排',{exact:true}).count(),0);await shot('mobile-entry');checks.push('切换并入64px顶栏、紧凑入口与模板默认折叠');
    const today=page.locator('[data-training-date="'+config.today+'"]');await today.click();
    const beforeLabel=await today.getAttribute('aria-label');assert.ok(beforeLabel.includes('1次完成'));
    let dialog=await removeDialog();assert.ok((await dialog.innerText()).includes('恢复为待训练'));await dialog.getByRole('button',{name:'保留',exact:true}).click();assert.equal(await today.getAttribute('aria-label'),beforeLabel);checks.push('删除确认取消保留记录与计划');
    const fail=route=>route.request().method()==='POST'?route.abort('failed'):route.continue();await page.route('**/dashboard/training',fail);
    dialog=await removeDialog();await dialog.getByRole('button',{name:'删除训练',exact:true}).click();await page.getByRole('alert').filter({hasText:'保存未完成'}).waitFor();assert.equal(await today.getAttribute('aria-label'),beforeLabel);await page.unroute('**/dashboard/training',fail);
    dialog=await removeDialog();await shot('delete-confirmation');await dialog.getByRole('button',{name:'删除训练',exact:true}).click();await page.getByText('训练已删除',{exact:true}).waitFor();await ready();
    assert.equal(await page.getByLabel('胸 · 肩 · 三头更多操作',{exact:true}).count(),0);assert.ok(!(await today.getAttribute('aria-label')).includes('次完成'));assert.ok((await today.getAttribute('aria-label')).includes('2次计划'));
    await page.reload();await ready();assert.equal(await page.getByLabel('胸 · 肩 · 三头更多操作',{exact:true}).count(),0);checks.push('完成训练删除失败留存、重试、计划恢复与刷新持久化');
    await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'训练模板',exact:true}).click();
    await page.getByRole('button',{name:'胸 · 肩 · 三头',exact:true}).click();assert.ok(await page.getByText('3组 · 10次',{exact:true}).isVisible());await shot('expanded-template');
    const handle=page.getByRole('button',{name:'拖动胸 · 肩 · 三头到日历',exact:true});assert.equal(await handle.evaluate(n=>getComputedStyle(n).touchAction),'none');
    if(engine==='chromium')cdp=await context.newCDPSession(page);
    const move=async(x,y)=>{if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1,radiusX:4,radiusY:4,force:1}]});else await page.mouse.move(x,y);};
    const down=async()=>{await handle.scrollIntoViewIfNeeded();const b=await handle.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1,radiusX:4,radiusY:4,force:1}]});else {await page.mouse.move(x,y);await page.mouse.down();}return{x,y};};
    const up=async(cancel=false)=>{if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});else{if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}};
    if(engine==='webkit'){const b=await handle.boundingBox(),before=posts;await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);assert.equal(posts,before);}
    let before=posts;await down();await move(190,580);await page.locator('[class*="dragPreview"]').waitFor();await up(true);await page.locator('[class*="dragPreview"]').waitFor({state:'detached'});assert.equal(posts,before);
    before=posts;await down();await move(190,35);await up();await page.waitForTimeout(150);assert.equal(posts,before);checks.push('拖拽取消、丢失触点或日期外释放不写入');
    const dates=await page.locator('[data-training-date]').evaluateAll(nodes=>nodes.map(n=>n.dataset.trainingDate));const target=dates.at(-1),target2=dates.at(-2),cell=page.locator('[data-training-date="'+target+'"]');
    const scrollBefore=await page.evaluate(()=>scrollY);await down();await move(195,584);await page.locator('[class*="dragPreview"]').waitFor();
    let box;for(let i=0;i<120;i++){box=await cell.boundingBox();if(box.y>80&&box.y+box.height<530)break;await move(195,584);await page.waitForTimeout(40);}
    assert.ok(box.y>80&&box.y+box.height<530,'边缘滚动应把月末日期带入可投放区');assert.ok(await page.evaluate(()=>scrollY)>scrollBefore+20);
    await move(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(80);assert.equal(await cell.getAttribute('data-training-drop'),'true');await shot('touch-drag-target');const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/dashboard/training');await up();assert.equal((await accepted).status(),200);await page.waitForFunction(date=>document.querySelector('[data-training-date="'+date+'"]')?.getAttribute('aria-label').includes('1次计划'),target);await ready();assert.ok((await cell.getAttribute('aria-label')).includes('1次计划'));
    const drop=async()=>{await down();await move(195,584);for(let i=0;i<120;i++){const r=await cell.boundingBox();if(r.y>80&&r.y+r.height<530){await move(r.x+r.width/2,r.y+r.height/2);const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/dashboard/training');await up();assert.equal((await accepted).status(),200);await page.waitForTimeout(700);await ready();return;}await move(195,584);await page.waitForTimeout(40);}throw Error('重复排期目标未进入视口');};
    await drop();assert.ok((await cell.getAttribute('aria-label')).includes('1次计划'));assert.ok(!(await cell.getAttribute('aria-label')).includes('2次计划'));checks.push(engine==='chromium'?'原生触点拖动、边缘自动滚动、落点高亮与重复排期防重':'WebKit触屏点按及真实指针拖动、边缘滚动与排期防重');
    await page.getByRole('button',{name:'训练模板',exact:true}).click();await page.getByRole('button',{name:'训练模板',exact:true}).click();
    const article=handle.locator('xpath=ancestor::article');await article.getByRole('button',{name:'排期',exact:true}).click();await page.getByLabel('安排日期',{exact:true}).fill(target2);await page.getByRole('button',{name:'加入日历',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await ready();assert.ok((await page.locator('[data-training-date="'+target2+'"]').getAttribute('aria-label')).includes('1次计划'));await shot('scheduled-calendar');checks.push('模板原位展开与点选排期替代操作');
    const pointerInputs=await page.evaluate(()=>window.__trainingPointerInputs);inputs.push(...pointerInputs);assert.ok(pointerInputs.some(e=>e.trusted&&e.pointerType==='touch'&&e.type==='pointerdown'));if(engine==='chromium')assert.ok(pointerInputs.some(e=>e.trusted&&e.pointerType==='touch'&&e.type==='pointermove'));
    assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);await writeFile(folder+'/compact-report.json',JSON.stringify({passed:true,engine,geometry,posts,inputs,errors,failures,nativeTouchDrag:engine==='chromium',webkitNativeContinuousTouchAvailable:false},null,2));
  }catch(error){await page.screenshot({path:folder+'/compact-failure.png'});await writeFile(folder+'/compact-failure.json',JSON.stringify({error:String(error),errors,failures,posts,inputs:await page.evaluate(()=>window.__trainingPointerInputs),calendar:await page.locator('[data-training-date]').evaluateAll(nodes=>nodes.map(n=>({date:n.dataset.trainingDate,label:n.getAttribute('aria-label')})))},null,2));throw error;}
  finally{await ready().catch(()=>{});await page.waitForTimeout(700);await context.close();await originalPage.bringToFront();}
}
