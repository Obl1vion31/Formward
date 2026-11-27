import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {authenticateFixture} from './fixture-auth.mjs';

const config=JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG,'utf8'));
assert.ok(['native-postgres','pglite'].includes(config.isolatedFixture));
assert.equal(new URL(config.baseURL).hostname,'127.0.0.1');
assert.ok(config.account.email.endsWith('@example.test'));
const engine=process.env.FORMWARD_UI_ENGINE??'chromium',baseline=process.env.FORMWARD_UI_BASELINE==='1';
const engines=await import(process.env.PLAYWRIGHT_MODULE??'/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs');
const browser=await engines[engine].launch({headless:true,...(process.env.FORMWARD_UI_EXECUTABLE_PATH?{executablePath:process.env.FORMWARD_UI_EXECUTABLE_PATH}:{})});
const folder=resolve(process.env.FORMWARD_UI_ARTIFACTS??'.codex/ui-decisions-20261117/evidence',baseline?'before':'after',engine);
await mkdir(folder,{recursive:true});
const shots=[],flows=[],errors=[];
const version=await (await fetch(config.baseURL+'/api/app-version')).json();
const auth=await browser.newContext();
await authenticateFixture(auth.request,config,process.env.FORMWARD_CHAT_BROWSER_CONFIG);
const storageState=await auth.storageState();await auth.close();
async function go(page,url){await page.waitForLoadState("networkidle");await page.goto(url);}
async function settle(page){await page.waitForFunction(()=>!document.querySelector('[data-workspace-reading],[data-chart-flight]'));await page.waitForTimeout(650);}
async function screenshot(page,profile,name,items){
 if(!name.includes('loading'))await page.waitForFunction(()=>!document.getAnimations().some(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity));
 const path=join(folder,profile+'-'+name+'.png');await page.screenshot({path});
 const layout=await page.evaluate(()=>[...document.querySelectorAll('dialog[open]')].map(dialog=>[dialog,...dialog.querySelectorAll('form,fieldset,footer,[data-meal-editor],[class*=composerArea],[aria-label="给小助手发消息"]')].map(node=>{const rect=node.getBoundingClientRect(),css=getComputedStyle(node);return {tag:node.tagName,label:node.getAttribute('aria-label'),className:node.className,x:rect.x,y:rect.y,width:rect.width,height:rect.height,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,scrollTop:node.scrollTop,position:css.position,display:css.display,overflowY:css.overflowY,flex:css.flex,minHeight:css.minHeight,bottom:css.bottom};})));
 shots.push({name,items,path,profile,engine,baseline,url:page.url(),capturedAt:new Date().toISOString(),data:'隔离虚构账号／真实业务组件／模型回复回放',version,browserVersion:browser.version(),layout});
}
async function openChat(page){
 const trigger=page.locator('[data-assistant-trigger]:visible');await trigger.click();
 await page.getByLabel('给小助手发消息',{exact:true}).waitFor();
 await page.getByRole('button',{name:'新对话',exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('[aria-label="新对话"]')?.disabled);
}
async function message(page,text){
 await page.getByLabel('给小助手发消息',{exact:true}).fill(text);await page.getByRole('button',{name:'发送消息',exact:true}).click();
 await page.locator('[data-chat-message]').getByText(text,{exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('[aria-label="停止生成"]'),{timeout:30000});
 await page.waitForTimeout(250);
}
async function newChat(page){
 const response=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/assistant-chat/control'&&res.request().method()==='POST'&&res.request().postDataJSON()?.action==='new');
 await page.getByRole('button',{name:'新对话',exact:true}).click();
 const confirm=page.getByRole('button',{name:'开始新对话',exact:true});
 const choice=await Promise.race([response.then(()=>'done'),confirm.waitFor().then(()=>'confirm').catch(()=>'absent')]);
 if(choice==='confirm')await confirm.click();const result=await response;
 if(result.status()===429){await page.waitForTimeout(61000);return newChat(page);}assert.equal(result.status(),200);
 await page.getByText('今天想聊点什么？',{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-label="新对话"]')?.disabled);
}
async function closeChat(page){await page.getByRole('button',{name:'收起小助手',exact:true}).click();await page.locator('[data-assistant-trigger]:visible').waitFor();}
async function navigate(page,name){await page.getByRole('navigation',{name:'主导航',exact:true}).getByRole('link',{name,exact:true}).click();await settle(page);}
async function tasks(page,width){
 if(width<360)await page.getByLabel('切换聊天与待办').selectOption('tasks');
 else if(width<701)await page.getByRole('tab',{name:/待办/}).click();
}
async function chatTab(page,width){
 if(width<360)await page.getByLabel('切换聊天与待办').selectOption('chat');
 else if(width<701)await page.getByRole('tab',{name:/聊天/}).click();
}
try{
 const sizes=process.env.FORMWARD_UI_WIDTHS?process.env.FORMWARD_UI_WIDTHS.split(',').map(Number):[390,1440];
 for(const [profileIndex,width] of sizes.entries()){
  if(profileIndex&&process.env.FORMWARD_UI_SKIP_CHAT!=='1')await new Promise(resolve=>setTimeout(resolve,61000));
  const height=Number(process.env.FORMWARD_UI_HEIGHT??(width<701?844:1000)),theme=process.env.FORMWARD_UI_THEME??'dark',textScale=Number(process.env.FORMWARD_UI_TEXT_SCALE??1),motion=process.env.FORMWARD_UI_REDUCED==='1'?'reduce':'no-preference',profile=width+'x'+height+'-'+theme+(textScale!==1?'-text'+textScale:'')+(motion==='reduce'?'-reduced':'');
  const context=await browser.newContext({viewport:{width,height},storageState,hasTouch:width<701,isMobile:width<701,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:motion,recordVideo:{dir:folder,size:{width,height}}});
  if(textScale!==1)await context.addInitScript(scale=>{const apply=()=>document.documentElement.style.fontSize=(scale*100)+'%';if(document.documentElement)apply();else new MutationObserver((_,observer)=>{if(document.documentElement){apply();observer.disconnect();}}).observe(document,{childList:true});},textScale);
  await context.addInitScript((theme)=>{localStorage.setItem('formward-theme',theme);},theme);
   const page=await context.newPage(),steps=[];page.on('pageerror',error=>errors.push({profile,url:page.url(),step:steps.at(-1)?.label,error:error.message,stack:error.stack}));
  const mark=label=>steps.push({label,at:new Date().toISOString()});
  try{
   mark('总览首次进入');await go(page,config.baseURL+'/dashboard');await settle(page);await screenshot(page,profile,'overview',['D08','X06']);
   for(const kind of ['intake','morning-weight','energy']){
    mark('总览进入'+kind);await page.locator('[data-metric-card="'+kind+'"]').click();await settle(page);
    if(!baseline)assert.equal(await page.locator('[data-record-slot="records"]>[data-record-date]').count(),1,'默认只显示今天');
    await screenshot(page,profile,'chart-'+kind,['P01','P02','P03','P04','T01','T02','T12','X01']);
    mark('返回总览'+kind);await navigate(page,'总览');
   }
   if(process.env.FORMWARD_UI_SKIP_CHAT!=='1'){
   await openChat(page);mark('新聊天');await newChat(page);await screenshot(page,profile,'chat-welcome',['P09','X15']);
   await tasks(page,width);await screenshot(page,profile,'tasks',['A10','B07']);
   if(!baseline)assert.equal(await page.locator('[data-assistant-task-scroll] [aria-label="快捷记录"]').count(),0);
   await chatTab(page,width);mark('发送真实消息气泡');await message(page,'排版验收');await screenshot(page,profile,'chat-markdown',['A01','A02','A03']);
   assert.equal(await page.getByRole('region',{name:'回答中的表格'}).count(),1);assert.ok(await page.locator('[data-chat-message] ul li').count()>0);
   if(!baseline){const markers=await page.locator('[data-chat-message] ul li').evaluateAll(nodes=>nodes.map(node=>({type:getComputedStyle(node).listStyleType,display:getComputedStyle(node).display})));assert.ok(markers.every(marker=>marker.type==='disc'&&marker.display==='list-item'),'回答列表必须显示实际项目符号，不能只验证li节点存在');}
   await newChat(page);mark('多题补充');await message(page,'逐题补充验收');
   const form=page.getByRole('form',{name:'补充隔离多题补充'});await form.waitFor();
   await screenshot(page,profile,'followup-first',['A09','X16']);
   if(!baseline){
    assert.equal(await form.locator('legend').count(),1);await form.getByRole('button',{name:'自己填写',exact:true}).click();
    await form.getByRole('textbox').fill('家用设备原文');await form.getByRole('button',{name:'下一题',exact:true}).click();
    await form.getByRole('button',{name:'提交补充',exact:true}).click();assert.ok(await form.getByRole('alert').count());
    assert.equal(await form.getByRole('button',{name:'暂不填写',exact:true}).count(),0,'必填题不可跳过');
    await form.getByRole('button',{name:'晨间',exact:true}).click();await form.getByRole('button',{name:'上一题',exact:true}).click();
    assert.equal(await form.getByRole('textbox').inputValue(),'家用设备原文');
    await screenshot(page,profile,'followup-free',['A09','X16','P06']);
    await form.getByRole('button',{name:'下一题',exact:true}).click();assert.equal(await form.getByRole('button',{name:'晨间',exact:true}).getAttribute('aria-pressed'),'true');
    await form.getByRole('button',{name:'下一题',exact:true}).click();await form.getByRole('button',{name:'早餐前',exact:true}).click();await form.getByRole('button',{name:'运动后',exact:true}).click();
    await form.getByRole('button',{name:'自己填写',exact:true}).click();await form.getByRole('textbox').fill('额外说明原文');
    await screenshot(page,profile,'followup-multiple',['X16']);
    await form.getByRole('button',{name:'上一题',exact:true}).click();await form.getByRole('button',{name:'下一题',exact:true}).click();
    assert.equal(await form.getByRole('button',{name:'早餐前',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await form.getByRole('textbox').inputValue(),'额外说明原文');
    await form.getByRole('button',{name:'暂不填写',exact:true}).click();mark('统一提交补充');await form.getByRole('button',{name:'提交补充',exact:true}).click();await form.waitFor({state:'hidden'});
    const summary=page.getByText('已询问3个问题',{exact:true});await summary.waitFor();await screenshot(page,profile,'followup-complete',['X16','P08']);await summary.click();
    assert.ok(await page.getByText('家用设备原文',{exact:true}).count());assert.ok(await page.getByText('本次未填写',{exact:true}).count());await screenshot(page,profile,'followup-answers',['X16','P08']);
   }
   await newChat(page);mark('饮食确认卡');await message(page,'100克，创建预览');await screenshot(page,profile,'confirmation-meal',['A05','B01','B03','X17']);
   const review=page.locator('[data-chat-preview]').first();
   const more=review.locator('summary').filter({hasText:'更多信息'}).first();
   if(await more.count()){await more.click();await screenshot(page,profile,'confirmation-meal-more',['B02','B03','X17','T07']);await more.click();}
   if(await page.getByRole('button',{name:/^(确认保存|保存确认)$/}).count()){
    mark('隔离数据确认保存');await page.getByRole('button',{name:/^(确认保存|保存确认)$/}).click();await page.getByText('已保存',{exact:true}).first().waitFor();await screenshot(page,profile,'confirmation-saved',['A06','B04','B05','B06']);
   }
   void review;
   for(const type of ['来源','消耗','训练']){await newChat(page);await message(page,type+'卡片验收');if(type==='来源'){const source=page.getByRole('form');if(await source.getByRole('button',{name:'自己填写',exact:true}).count())await source.getByRole('button',{name:'自己填写',exact:true}).click();await source.getByRole('textbox').fill('OKOK');await source.getByRole('button',{name:'提交补充',exact:true}).click();await source.waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('[aria-label="停止生成"]'));}await screenshot(page,profile,'confirmation-'+type,['X17','B01','B08']);}
   await closeChat(page);}
   await navigate(page,'饮食');await screenshot(page,profile,'meals-today',['D01','D02','D03','D08']);
   const history=page.locator('[data-history-toggle]');await history.click();await screenshot(page,profile,'meals-history',['T11','P08']);
   const firstHistory=page.locator('[data-record-history] [data-record-date]').first();await firstHistory.getByRole('button',{name:'查看',exact:true}).click();await screenshot(page,profile,'meal-day-detail',['X07']);
   await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.getByRole('button',{name:'食材库',exact:true}).click();await screenshot(page,profile,'food-library',['D10','X09']);
   const detail=page.getByRole('button',{name:/纯牛奶.*详情/});await detail.click();await screenshot(page,profile,'food-library-detail',['D10','X09']);
   if(!baseline)assert.equal(await page.getByRole('dialog').count(),0,'简单详情原位展开');
   if(baseline&&await page.getByRole('button',{name:'关闭详情',exact:true}).count())await page.getByRole('button',{name:'关闭详情',exact:true}).click();
   if(baseline){await openChat(page);await tasks(page,width);await page.getByRole('link',{name:width<701?'记录饮食':'手动记录饮食',exact:true}).click();}
   else await page.getByRole('button',{name:'记一餐',exact:true}).click();
   const meal=page.locator('[data-meal-editor]');await meal.waitFor();await screenshot(page,profile,'meal-loading',['P04']);await page.waitForFunction(()=>{const input=document.querySelector('[aria-label="自由填写食物名称"]');return input&&!input.matches(':disabled');});await screenshot(page,profile,'meal-manual',['C01','C02','C03','C04','C09','X08']);
   await page.getByLabel('自由填写食物名称',{exact:true}).fill('原手填草稿');if(baseline||await page.getByRole('button',{name:'从食材库添加',exact:true}).isVisible())await page.getByRole('button',{name:'从食材库添加',exact:true}).click();await screenshot(page,profile,'meal-picker',['C05','C06','C07']);
    if(!baseline&&width>=1100&&textScale===1){const geometry=await meal.evaluate(node=>{const picker=node.querySelector('[aria-label="选择食材库"]'),entry=node.querySelector('[aria-label="本餐录入"]'),row=picker.querySelector('[draggable]'),summary=row.firstElementChild.firstElementChild,rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};return{picker:rect(picker),entry:rect(entry),row:rect(row),name:rect(summary.querySelector('strong')),energy:rect(summary.querySelector('p'))};});assert.ok(geometry.picker.width/(geometry.picker.width+geometry.entry.width)>=.4,'食材选择占两栏可用宽度至少40%');assert.ok(Math.abs(geometry.name.y-geometry.energy.y)<=6,'名称与热量横排');assert.ok(geometry.row.height<=66,'默认候选行紧凑');}
   if(!baseline){const info=page.locator('[data-meal-editor]').getByRole('button',{name:/详情$/}).first();assert.equal(await info.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('[data-meal-editor] [data-open]>div>div>dl[aria-label$="的宏量营养"]').count(),0,'选择列表默认不铺开宏量详情');await info.click();await page.locator('[data-meal-editor] [data-open]>div>div>dl[aria-label$="的宏量营养"]').waitFor();await screenshot(page,profile,'meal-picker-detail',['C05','X09']);await info.press('Escape');assert.equal(await info.getAttribute('aria-expanded'),'false');assert.equal(await page.getByRole('dialog').count(),1,'Escape先收详情，保留餐次草稿');}
   await page.getByRole('button',{name:'AI 拍照录入',exact:true}).click();await screenshot(page,profile,'meal-photo',['C08','T05','T06','P07']);
   await page.getByRole('button',{name:baseline?'自己填写':'返回本餐',exact:true}).first().click();assert.equal(await page.getByLabel('食物名称 1',{exact:true}).inputValue(),'原手填草稿');
   await page.getByRole('button',{name:'关闭编辑',exact:true}).click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();
   await navigate(page,'身体');await screenshot(page,profile,'body-today',['D04','D09','X11']);await page.locator('[data-history-toggle]').click();await screenshot(page,profile,'body-history',['X11','T11']);
   await navigate(page,'消耗');await screenshot(page,profile,'energy-today',['D06','X12']);await page.locator('[data-history-toggle]').click();await screenshot(page,profile,'energy-history',['X12','T11']);
   if(process.env.FORMWARD_UI_EXTENDED==='1'){
    await navigate(page,'训练');await screenshot(page,profile,'training-calendar',['E01','P05']);
    const start=page.getByRole('button',{name:/^(按计划训练|继续训练|开始训练)$/}).first();await start.click();await page.locator('[data-training-editor]').waitFor();await screenshot(page,profile,'training-editor',['X13','X14']);
    const pause=page.getByRole('button',{name:'暂停',exact:true});if(await pause.count()){await pause.click();await page.getByRole('button',{name:'继续计时',exact:true}).waitFor();await screenshot(page,profile,'training-paused',['X14']);}
    await page.getByRole('button',{name:'保存并收起训练',exact:true}).click();await page.locator('[data-training-editor]').waitFor({state:'hidden'});
    for(const [path,name,items] of [['/dashboard/export','export',['E06','E07','E08','X26']],['/dashboard/sources','sources',['X23','P05']],['/dashboard/ai','ai-access',['E02','E03','E05','X18']],['/dashboard/profile','profile',['X20']],['/dashboard/account','account',['X20']],['/dashboard/tutorial','tutorial',['X24']],['/admin','admin',['X21']]]){
     await go(page,config.baseURL+path);await page.waitForLoadState('networkidle');await screenshot(page,profile,name,items);
     if(path==='/dashboard/ai'){
      await page.getByRole('button',{name:'AI 提交记录',exact:true}).click();
      await page.locator('[data-ai-submissions] li').first().waitFor();
      if(!baseline&&process.env.FORMWARD_UI_SKIP_CHAT!=='1')assert.match(await page.locator('[data-ai-submissions]').innerText(),/隔离力量计划/);
      await screenshot(page,profile,'ai-submissions',['E04','E05','X18']);
     }
    }
   }
   mark('完成');
  }catch(error){await page.screenshot({path:join(folder,profile+'-failure.png')});await writeFile(join(folder,profile+'-failure.txt'),await page.locator('body').innerText());throw error;}
  finally{const video=page.video();await context.close();flows.push({profile,engine,baseline,steps,video:video?await video.path():null,data:'真实浏览器连续录制；隔离账号与回复回放'});}
 }
 assert.deepEqual(errors,[]);
 await writeFile(join(folder,'manifest.json'),JSON.stringify({passed:true,shots,flows,errors},null,2));
 console.log(JSON.stringify({passed:true,engine,baseline,screenshots:shots.length,videos:flows.length,folder}));
}catch(error){await writeFile(join(folder,'failure.json'),JSON.stringify({error:String(error),shots,flows,errors},null,2));throw error;}
finally{await browser.close();}
