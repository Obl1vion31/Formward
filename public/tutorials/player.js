(() => {
'use strict';
const topics=[
 {id:'meals',name:'饮食',title:'记录一餐',summary:'记录餐次和营养',short:['找日期','填本餐','保存记全'],steps:[['找到日期','当天点“录入”，已有餐次时点“添加一餐”。'],['填写本餐','选餐次，填食物和本次总营养；不知道的留空。'],['保存与记全','先核对保存日期；一天都记完后再勾“已记全”。']],note:'自由填写的是本次吃下的总营养，数量不会再乘一次。食材库项目按已选规格换算。'},
 {id:'body',name:'身体',title:'记录体重与体脂',summary:'晨晚体重与体脂',short:['选时段','填实测','保存查看'],steps:[['日期与时段','找到称重日期，点“录入”或“编辑”；手机先选晨间或晚间，切换保留两侧输入。'],['只填实测值','晨间必须空腹；体重、体脂只填知道的部分，不知道的留空。'],['保存后查看','核对日期、公斤和百分比，点“保存录入”一次保存晨晚修改，再回到那一天查看。']],note:'不知道的数不填0。每日体重、体脂在身体页记录，不用去个人资料重复填写。'},
 {id:'energy',name:'消耗',title:'记录当天消耗',summary:'静息、活动与总数',short:['找日期','填消耗','核对保存'],steps:[['找到当天','在对应日期点“录入”或“补录”。'],['选择填写方式','填静息和活动，或只填全天总数；运动明细按需添加。'],['核对后保存','某项运动已在活动合计中时选“已包含”，避免重复增加，再核对总数。']],note:'示例：静息1800＋活动400＝2200千卡。400里已有的320快走只留明细，不再多加一次。来源可以留空。'},
 {id:'backfill',name:'补录',title:'补到正确那一天',summary:'昨天和更早日期',short:['补昨天','选更早','核对日期'],steps:[['先补昨天','在昨天那行点“补录”，核对窗口和保存按钮都是昨天的日期。'],['找更早日期','点“查看全部”，在“查看日期”选好那一天并点“查看”，再补录。'],['核对日期与结果','保存前再看日期，保存后从对应日期找到记录，避免误存到今天。']],note:'最近7天只是快捷入口。已有餐次仍可追加一餐；补录或修改饮食后，重新确认那天是否“已记全”。'},
 {id:'ai',name:'AI录入',title:'AI提交与确认',summary:'外部AI提交，网页确认',short:['AI提交','检查修改','确认保存'],steps:[['告诉外部AI','说清日期、餐次和吃了什么，打开AI返回的待确认链接。'],['检查并修改','核对日期、本餐总量和食物；“应用修改”还没有正式保存。'],['确认保存','最后点“确认保存”，再从“查看记录”找到这餐。']],note:'片中聊天明确为示例，随后是测试账号的实际网页操作。站内聊天录入尚未开放。'}
];
const device=matchMedia('(max-width:700px), (hover:none) and (pointer:coarse)');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');

let selected='meals',cleanup=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=paths=>'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'+paths+'</svg>';
const playIcon=icon('<path d="m8 4 12 8-12 8Z" fill="currentColor"/>');
const pauseIcon=icon('<path d="M7 5v14M17 5v14" stroke="currentColor" stroke-width="3"/>');
const fullIcon=icon('<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" stroke="currentColor" stroke-width="1.5"/>');
const assetFor=(id,mobile=device.matches)=>window.FORMWARD_TUTORIAL_MEDIA?.[id]?.[mobile?'mobile':'desktop'];
const topicFor=id=>topics.find(t=>t.id===id)||topics[0];
const clock=s=>{const n=Math.max(0,Math.floor(s||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};

function render(options){
 selected='meals';
 const back=options.backAction?'<button class="quiet" type="button" data-action="'+options.backAction+'">'+esc(options.backText)+'</button>':'<span></span>';
 return [
 '<main class="journey tutorial-journey" data-tutorial-guide data-mode="'+(device.matches?'mobile':'desktop')+'">',
 '<div class="guide-heading"><h1>使用说明</h1><span class="guide-reference">演示使用虚构数据</span></div>',
 '<section class="guide-directory" aria-label="教程目录与预览"><nav class="directory-topics" aria-label="五项教程">',
 topics.map(t=>'<button type="button" class="directory-topic" data-directory-topic="'+t.id+'" aria-label="'+t.name+'：'+t.summary+'，选择教程"><span class="directory-copy"><span class="directory-name">'+t.name+'</span><span class="directory-summary">'+t.summary+'</span></span><span class="directory-arrow" aria-hidden="true">›</span></button>').join(''),
 '</nav><div class="directory-preview" data-preview-topic="'+selected+'"><div class="preview-heading"><h2 data-preview-title>'+topicFor(selected).title+'</h2><button type="button" class="preview-toggle" data-preview-toggle aria-label="自动播放短预览" aria-pressed="'+!reduced.matches+'">'+(reduced.matches?'播放预览':'暂停预览')+'</button></div>',
 '<div class="preview-picture"><img alt="" loading="lazy"><video muted loop playsinline preload="none" aria-hidden="true" data-directory-preview></video></div><button type="button" class="preview-open" data-open-preview>'+playIcon+'<span>观看完整教程</span></button></div></section>',
 '<section class="mobile-guide" aria-label="手机操作教程"><div class="tutorial-topics" role="tablist" aria-label="操作教程">',
 topics.map(t=>'<button class="tutorial-topic" type="button" role="tab" id="topic-'+t.id+'" aria-controls="mobile-lesson" aria-selected="'+(t.id===selected)+'" tabindex="'+(t.id===selected?'0':'-1')+'" data-topic="'+t.id+'">'+t.name+'</button>').join(''),
 '</div><div id="mobile-lesson" role="tabpanel" aria-labelledby="topic-'+selected+'"></div></section>',
 '<dialog class="tutorial-modal" aria-labelledby="tutorial-modal-title"><header class="modal-head"><h2 id="tutorial-modal-title"></h2><div class="modal-head-actions"><button type="button" class="text-switch" data-view-switch aria-pressed="false">文字版</button><button type="button" class="modal-close" data-close-lesson aria-label="关闭教程">×</button></div></header><div class="modal-body"></div></dialog>',
 '<div class="tutorial-actions"><div class="tutorial-action-inner">'+back+'<button type="button" class="primary" data-action="start">'+esc(options.startText)+'</button></div></div></main>'
 ].join('');
}
function bind(container){
 dispose();
 const root=container.querySelector('[data-tutorial-guide]');if(!root)return;
 const modal=root.querySelector('.tutorial-modal'),modalBody=modal.querySelector('.modal-body');
 const inline=root.querySelector('#mobile-lesson'),footer=root.querySelector('.tutorial-actions');
 const preview=root.querySelector('.directory-preview'),previewVideo=preview.querySelector('video'),previewPoster=preview.querySelector('img');
 let lesson=null,previewTopic=selected,previewEnabled=!reduced.matches,previewPending=false,previewVisible=false,previewGeneration=0;
 let engaged=false,modalOpen=false,origin=null,oldOverflow=null,generation=0,dead=false;
 const off=[];
 const listen=(el,event,fn)=>{el.addEventListener(event,fn);off.push(()=>el.removeEventListener(event,fn));};
 function reflectPreview(){
  const playing=!previewVideo.paused&&!previewVideo.ended&&preview.getAttribute('data-previewing')==='true';
  const button=root.querySelector('[data-preview-toggle]');
  button.textContent=playing?'暂停预览':previewPending?'正在加载…':'播放预览';button.setAttribute('aria-pressed',String(playing));button.setAttribute('aria-label',button.textContent);
 }
 function pausePreview(){++previewGeneration;previewPending=false;previewVideo.pause();preview.removeAttribute('data-previewing');reflectPreview();}
 function syncPreview(){
  reflectPreview();
  if(dead||device.matches){pausePreview();return;}
  const a=assetFor(previewTopic,false);if(!a)return;
  if(previewPoster.getAttribute('src')!==a.poster)previewPoster.src=a.poster;
  const allowed=previewEnabled&&previewVisible&&!modalOpen&&!document.hidden;
  if(!allowed){pausePreview();return;}
  if(previewVideo.getAttribute('src')!==a.preview){pausePreview();previewVideo.src=a.preview;}
  const ticket=++previewGeneration;
  previewPending=true;reflectPreview();
  previewVideo.play().then(()=>{if(ticket===previewGeneration){previewPending=false;reflectPreview();}}).catch(()=>{if(ticket===previewGeneration){previewPending=false;previewEnabled=false;preview.removeAttribute('data-previewing');reflectPreview();}});

 }
 function setPreview(id){
  if(!topics.some(t=>t.id===id))return;
  if(previewTopic!==id){++previewGeneration;pausePreview();previewTopic=id;}
  preview.dataset.previewTopic=id;
  root.querySelector('[data-preview-title]').textContent=topicFor(id).title;
  root.querySelector('[data-open-preview]').setAttribute('aria-label','打开'+topicFor(id).name+'完整教程');
  root.querySelectorAll('[data-directory-topic]').forEach(b=>{if(b.dataset.directoryTopic===id)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});
  syncPreview();
 }
 listen(previewVideo,'playing',()=>{
  const a=assetFor(previewTopic,false);
  if(!dead&&a&&previewVideo.currentSrc===new URL(a.preview,location.href).href&&previewEnabled&&!modalOpen&&!device.matches&&!document.hidden){preview.dataset.previewing='true';previewPending=false;reflectPreview();}
 });
 listen(previewVideo,'pause',reflectPreview);
 listen(previewVideo,'error',()=>{previewEnabled=false;previewPending=false;preview.removeAttribute('data-previewing');reflectPreview();});
 const previewObserver=new IntersectionObserver(entries=>{previewVisible=Boolean(entries[0]?.isIntersecting);syncPreview();},{threshold:.1});previewObserver.observe(preview);
 const footerObserver=new ResizeObserver(()=>requestAnimationFrame(()=>{
  if(!dead&&root.isConnected){root.style.setProperty('--tutorial-actions-height',footer.getBoundingClientRect().height+'px');lesson?.layout();}
 }));footerObserver.observe(footer);
 function lock(){if(oldOverflow===null){oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}}
 function unlock(){if(oldOverflow!==null){document.body.style.overflow=oldOverflow;oldOverflow=null;}}
 function updateTabs(){
  root.querySelectorAll('[data-topic]').forEach(b=>{const active=b.dataset.topic===selected;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
  inline.setAttribute('aria-labelledby','topic-'+selected);
 }
 function createLesson(topic,mobile){
  const a=assetFor(topic.id,mobile);
  const cues=a?.cues?.length?a.cues:[{id:'entry',step:0,start:0,end:30,text:topic.steps[0][1]}];
  const node=document.createElement('section');node.className='lesson';node.dataset.lesson=topic.id;node.dataset.view='video';node.dataset.started='false';
  node.innerHTML=[
   mobile?'<header class="lesson-head"><h2>'+topic.title+'</h2><div class="lesson-head-actions"><button type="button" class="text-switch" data-control="fullscreen" aria-label="全屏观看">全屏</button><button type="button" class="text-switch" data-view-switch aria-pressed="false">文字版</button></div></header>':'',
   '<div class="lesson-error" role="alert" hidden><span data-error-message></span><button type="button" data-control="retry">重试视频</button></div>',
   '<div class="lesson-video-pane"><div class="lesson-stage"><div class="lesson-frame">',
   '<video muted playsinline preload="none" tabindex="-1" aria-label="'+topic.name+'操作演示"></video>',
   a?'<img class="lesson-poster" src="'+(a.lessonPoster||a.poster)+'" alt="" aria-hidden="true">':'',
   '<button type="button" class="lesson-play" aria-label="播放'+topic.name+'演示">'+playIcon+'<span>观看完整教程</span></button></div>',
   '<div class="lesson-controls" role="group" aria-label="播放控制"><button type="button" data-control="toggle" aria-label="播放">'+playIcon+'</button>',
   '<input class="lesson-range" type="range" min="0" max="'+(a?.duration||30)+'" step="0.1" value="0" aria-label="播放进度" disabled>',
   '<output class="lesson-time">0:00/'+clock(a?.duration||30)+'</output><button type="button" data-control="fullscreen" aria-label="全屏观看">'+fullIcon+'</button></div>',
   '<ol class="lesson-steps">'+topic.steps.map((s,i)=>'<li><button type="button" class="lesson-step" data-step="'+i+'" aria-label="重看：'+s[0]+'"><span class="step-number">'+String(i+1).padStart(2,'0')+'</span><span class="step-label">'+topic.short[i]+'</span></button></li>').join('')+'</ol></div></div>',
   '<div class="lesson-text" hidden><ol class="text-steps">'+topic.steps.map(s=>'<li><h3>'+s[0]+'</h3><p>'+s[1]+'</p></li>').join('')+'</ol><p class="lesson-note">'+topic.note+'</p>',
   topic.id==='ai'?'<p class="ai-connection"><strong>第一次连接AI</strong><br>工具 → AI接入 → 按页面指引连接外部AI并授权。连接后再提交，最后回网页确认保存。</p>':'',
   '</div><p class="guide-sr-only lesson-status" role="status" aria-live="polite"></p>'
  ].join('');
  const video=node.querySelector('video'),stage=node.querySelector('.lesson-stage'),frame=node.querySelector('.lesson-frame');
  const pane=node.querySelector('.lesson-video-pane'),textPane=node.querySelector('.lesson-text'),poster=node.querySelector('.lesson-poster');
  const cover=node.querySelector('.lesson-play'),toggle=node.querySelector('[data-control=toggle]'),range=node.querySelector('.lesson-range');
  const time=node.querySelector('.lesson-time'),status=node.querySelector('.lesson-status'),error=node.querySelector('.lesson-error');
  let mode='video',failed=false,disposed=false,lastCue=null,loadTimer=null,resizeFrame=null,frameClock=null,pendingSeek=null;
  let seekPlaying=null,seekingByUser=false;
  const handlers=[];
  const on=(el,event,fn)=>{el.addEventListener(event,fn);handlers.push(()=>el.removeEventListener(event,fn));};
  function current(t=video.currentTime){let active=cues[0];for(const c of cues){if(t+.015<c.start)break;active=c;}return active;}
  function update(){
   if(disposed)return;
   const c=current();
   if(c.id!==lastCue){lastCue=c.id;status.textContent=c.text;node.querySelectorAll('[data-step]').forEach(b=>{if(Number(b.dataset.step)===c.step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});}
   const length=Number.isFinite(video.duration)&&video.duration>0?video.duration:a?.duration||30;
   range.max=String(length);if(!seekingByUser)range.value=String(video.currentTime||0);
   range.setAttribute('aria-valuetext',clock(video.currentTime)+'，共'+clock(length));
   time.textContent=clock(video.currentTime)+'/'+clock(length);
  }
  function syncViewButtons(){
   root.querySelectorAll('[data-view-switch]').forEach(b=>{b.textContent=failed?'重试视频':mode==='text'?'返回视频':'文字版';b.setAttribute('aria-pressed',String(mode==='text'));});
  }
  function stopClock(){if(frameClock!==null)cancelAnimationFrame(frameClock);frameClock=null;}
  function startClock(){stopClock();const tick=()=>{frameClock=null;if(disposed||video.paused||video.ended)return;update();frameClock=requestAnimationFrame(tick);};tick();}
  function layout(){
   if(!node.isConnected||mode!=='video'||document.fullscreenElement===stage)return;
   const h=window.visualViewport?.height||innerHeight;
   const head=mobile?node.querySelector('.lesson-head').getBoundingClientRect().height+8:modal.querySelector('.modal-head').getBoundingClientRect().height;
   const chrome=node.querySelector('.lesson-controls').getBoundingClientRect().height+node.querySelector('.lesson-steps').getBoundingClientRect().height+10;
   const bottom=mobile?footer.getBoundingClientRect().height:0;
   const available=Math.max(mobile&&h<480?100:140,h-head-chrome-bottom-(mobile?16:68));
   const ratio=(a?.width||390)/(a?.height||696);
   if(!mobile){
    const width=Math.floor(Math.min(1440,innerWidth-32,available*ratio+38))+'px';
    if(modal.style.width!==width)modal.style.width=width;
   }
   const natural=stage.clientWidth/ratio;
   const value=Math.floor(mobile?natural:Math.min(natural,available))+'px';
   if(node.style.getPropertyValue('--frame-height')!==value)node.style.setProperty('--frame-height',value);
  }
  async function align(){
   layout();
   if(document.fullscreenElement===stage||video.webkitDisplayingFullscreen)return;
   if(mobile){
    const r=node.getBoundingClientRect(),bottom=Math.min(window.visualViewport?.height||innerHeight,footer.getBoundingClientRect().top);
    if(r.top<8||r.bottom>bottom-8)window.scrollTo({top:Math.max(0,scrollY+r.top-8),behavior:reduced.matches?'instant':'smooth'});
   }else if(modalBody.scrollTop)modalBody.scrollTo({top:0,behavior:reduced.matches?'instant':'smooth'});
   await new Promise(r=>setTimeout(r,reduced.matches?20:360));
  }
  function setMode(next){
   if(disposed)return;
   if(next==='text')video.pause();
   mode=next;node.dataset.view=next;
   if(!mobile&&next==='text')modal.style.width='min(920px, calc(100vw - 32px))';pane.hidden=next!=='video';textPane.hidden=next!=='text';syncViewButtons();
   requestAnimationFrame(()=>{if(!disposed)layout();});
  }
  function fail(message){
   if(disposed)return;
   clearTimeout(loadTimer);video.pause();failed=true;error.hidden=false;error.querySelector('[data-error-message]').textContent=message;
   cover.disabled=false;setMode('text');status.textContent=message;
  }
  function startLoadTimer(){
   clearTimeout(loadTimer);
   loadTimer=setTimeout(()=>{if(!disposed&&!video.paused&&video.readyState<3)fail('视频加载较慢，可以先看文字说明。');},8000);
  }
  async function play(alignFirst=false){
   const ticket=generation;if(alignFirst)await align();
   if(disposed||ticket!==generation||!node.isConnected||mode!=='video')return;
   engaged=true;node.dataset.started='true';pausePreview();cover.disabled=true;
   if(a&&!video.getAttribute('src')){video.preload='auto';video.src=a.src;video.load();}
   if(video.readyState<3){cover.hidden=false;cover.querySelector('span').textContent='正在加载…';startLoadTimer();}
   try{await video.play();}catch{
    if(disposed)return;clearTimeout(loadTimer);cover.disabled=false;
    if(!failed){cover.hidden=false;cover.querySelector('span').textContent='点这里继续播放';}
   }
  }
  function setPosition(value){
   if(a&&!video.getAttribute('src')){video.preload='auto';video.src=a.src;video.load();}
   const length=a?.duration||video.duration||30,target=Math.max(0,Math.min(value,length));
   if(video.readyState>=1)video.currentTime=target;else pendingSeek=target;
   update();
  }
  function finish(){
   stopClock();toggle.innerHTML=playIcon;toggle.setAttribute('aria-label','重播');
   cover.disabled=false;cover.hidden=false;cover.querySelector('span').textContent='再看一遍';update();
  }
  function retry(){
   failed=false;error.hidden=true;setMode('video');pendingSeek=video.currentTime||0;
   if(poster)poster.hidden=false;cover.hidden=false;video.load();void play(true);
  }
  function endSeek(){
   if(seekPlaying===null)return;
   const resume=seekPlaying;seekPlaying=null;seekingByUser=false;update();
   if(resume)void play(false);
  }
  on(range,'pointerdown',()=>{seekPlaying=!video.paused;seekingByUser=true;video.pause();});
  on(range,'input',()=>{if(seekPlaying===null){seekPlaying=!video.paused;video.pause();}seekingByUser=true;setPosition(Number(range.value));});
  on(range,'change',endSeek);on(range,'pointerup',endSeek);on(range,'pointercancel',endSeek);
  on(video,'loadedmetadata',()=>{
   range.disabled=false;
   if(pendingSeek!==null){const t=pendingSeek;pendingSeek=null;video.currentTime=Math.min(t,video.duration);}
   layout();update();
  });
  on(video,'play',()=>{if(disposed)return;toggle.innerHTML=pauseIcon;toggle.setAttribute('aria-label','暂停');update();});
  on(video,'playing',()=>{if(disposed)return;clearTimeout(loadTimer);cover.disabled=false;cover.hidden=true;if(poster)poster.hidden=true;startClock();});
  on(video,'waiting',()=>{if(!disposed&&!video.paused)startLoadTimer();});
  on(video,'pause',()=>{if(disposed)return;stopClock();clearTimeout(loadTimer);cover.disabled=false;toggle.innerHTML=playIcon;toggle.setAttribute('aria-label',video.ended?'重播':'播放');if(video.ended)finish();});
  on(video,'ended',finish);on(video,'timeupdate',update);
  on(video,'seeked',()=>{update();if(video.ended)finish();else if(engaged&&video.readyState>=2){cover.hidden=true;if(poster)poster.hidden=true;}});
  on(video,'error',()=>{if(video.error)fail('视频暂时没能加载，完整步骤仍可阅读。');});
  on(video,'webkitendfullscreen',()=>{video.controls=false;});
  on(node,'click',event=>{
   const b=event.target instanceof Element?event.target.closest('button'):null;if(!b)return;
   if(b===cover){if(video.ended)setPosition(0);void play(true);return;}
   if(b.hasAttribute('data-step')){
    const c=cues.find(c=>c.step===Number(b.dataset.step));if(!c)return;
    setPosition(c.start);setMode('video');void play(true);return;
   }
   const action=b.dataset.control;
   if(action==='toggle'){if(video.paused){if(video.ended)setPosition(0);void play(!engaged);}else video.pause();}
   if(action==='retry')retry();
   if(action==='fullscreen'){
    if(document.fullscreenElement===stage){void document.exitFullscreen();return;}
    if(stage.requestFullscreen)stage.requestFullscreen().catch(()=>{status.textContent='当前浏览器未能进入全屏，可以继续在这里播放。';});
    else if(video.webkitEnterFullscreen){video.controls=true;video.webkitEnterFullscreen();}
    else status.textContent='当前浏览器不支持全屏，可以继续在这里播放。';
   }
  });
  on(document,'fullscreenchange',()=>{
   node.querySelector('[data-control=fullscreen]').setAttribute('aria-label',document.fullscreenElement===stage?'退出全屏':'全屏观看');layout();
  });
  const size=new ResizeObserver(()=>{if(resizeFrame===null)resizeFrame=requestAnimationFrame(()=>{resizeFrame=null;if(!disposed)layout();});});
  size.observe(stage);size.observe(node.querySelector('.lesson-controls'));size.observe(node.querySelector('.lesson-steps'));
  if(mobile)size.observe(node.querySelector('.lesson-head'));
  const visible=new IntersectionObserver(entries=>{if(entries[0]&&!entries[0].isIntersecting&&!video.paused)video.pause();},{threshold:.02});visible.observe(frame);
  if(!a)fail('视频暂时不可用，可以先看文字说明。');
  update();syncViewButtons();
  return{
   node,video,layout,play,pause:()=>video.pause(),
   toggleText(){if(failed){retry();return;}setMode(mode==='text'?'video':'text');if(mobile)void align();},
   snapshot(){const c=current();return{topic:topic.id,cueId:c.id,step:c.step,fraction:Math.max(0,Math.min(1,(video.currentTime-c.start)/(c.end-c.start||1))),playing:!video.paused,engaged,view:mode,failed};},
   restore(saved){
    if(!saved)return;engaged=saved.engaged;node.dataset.started=String(saved.engaged);
    const c=cues.find(c=>c.id===saved.cueId)||cues.find(c=>c.step===saved.step)||cues[0];
    setPosition(c.start+(c.end-c.start)*saved.fraction);
    if(saved.engaged){cover.hidden=true;if(poster)poster.hidden=true;}
    if(saved.failed)fail('视频暂时不可用，可以先看文字说明。');
    else{setMode(saved.view||'video');if(saved.playing&&mode==='video')void play(true);}
   },
   dispose(){disposed=true;stopClock();clearTimeout(loadTimer);if(resizeFrame!==null)cancelAnimationFrame(resizeFrame);video.pause();size.disconnect();visible.disconnect();handlers.splice(0).forEach(fn=>fn());video.removeAttribute('src');video.load();}
  };
 }
 function mount(mobile,saved=null,autoplay=false){
  ++generation;lesson?.dispose();lesson?.node.remove();lesson=createLesson(topicFor(selected),mobile);
  if(mobile){inline.replaceChildren(lesson.node);}else{modal.querySelector('h2').textContent=topicFor(selected).title;modalBody.replaceChildren(lesson.node);}
  updateTabs();requestAnimationFrame(()=>lesson?.layout());
  if(saved)lesson.restore(saved);else if(autoplay)void lesson.play(true);
 }
 function openLesson(id,autoplay=true){
  selected=id;origin=root.querySelector('[data-open-preview]');engaged=true;pausePreview();modalOpen=true;lock();
  if(!modal.open)modal.showModal();mount(false,null,autoplay);modal.querySelector('[data-close-lesson]').focus({preventScroll:true});
 }
 function closeLesson(focus=true){
  if(document.fullscreenElement){void document.exitFullscreen();return;}
  ++generation;lesson?.dispose();lesson?.node.remove();lesson=null;engaged=false;modalOpen=false;
  if(modal.open)modal.close();unlock();setPreview(selected);
  if(focus&&origin?.isConnected)origin.focus({preventScroll:true});
 }
 listen(root,'click',event=>{
  const b=event.target instanceof Element?event.target.closest('button'):null;if(!b)return;
  if(b.dataset.directoryTopic){selected=b.dataset.directoryTopic;setPreview(selected);return;}
  if(b.hasAttribute('data-open-preview')){openLesson(previewTopic);return;}
  if(b.dataset.topic){selected=b.dataset.topic;engaged=false;mount(true,null,false);return;}
  if(b.hasAttribute('data-preview-toggle')){previewEnabled=!previewEnabled;syncPreview();}
  if(b.hasAttribute('data-view-switch'))lesson?.toggleText();
  if(b.hasAttribute('data-close-lesson'))closeLesson();
 });
 listen(modal,'cancel',e=>{e.preventDefault();closeLesson();});
 listen(modal,'click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeLesson();}});
 listen(modal,'keydown',e=>{
  if(e.key!=='Tab')return;
  const stops=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],[tabindex]')].filter(el=>el.tabIndex>=0&&el.getClientRects().length&&!el.closest('[hidden]'));
  if(!stops.length)return;const first=stops[0],last=stops.at(-1),active=document.activeElement;
  if(e.shiftKey&&(active===first||!modal.contains(active))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(active===last||!modal.contains(active))){e.preventDefault();first.focus();}
 });
 root.querySelectorAll('[data-topic]').forEach(b=>listen(b,'keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const list=[...root.querySelectorAll('[data-topic]')],i=list.indexOf(b),next=e.key==='Home'?0:e.key==='End'?4:(i+(e.key==='ArrowRight'?1:-1)+5)%5;
  list.forEach((b,i)=>b.tabIndex=i===next?0:-1);list[next].focus();
 }));
 const adapt=()=>{
  if(dead)return;
  const saved=lesson?.snapshot(),active=modalOpen||root.dataset.mode==='mobile'&&engaged;
  root.dataset.mode=device.matches?'mobile':'desktop';
  if(device.matches){modalOpen=false;if(modal.open)modal.close();unlock();mount(true,saved,false);}
  else if(active&&saved){modalOpen=true;lock();if(!modal.open)modal.showModal();mount(false,saved,false);}
  else{++generation;lesson?.dispose();lesson?.node.remove();lesson=null;}
  setPreview(selected);
 };
 listen(device,'change',adapt);
 listen(reduced,'change',()=>{previewEnabled=false;syncPreview();});
 listen(document,'visibilitychange',()=>{if(document.hidden){pausePreview();lesson?.pause();}else syncPreview();});
 listen(window,'pagehide',()=>{pausePreview();lesson?.pause();});
 listen(window,'resize',()=>lesson?.layout());if(window.visualViewport)listen(window.visualViewport,'resize',()=>lesson?.layout());
 cleanup=()=>{
  dead=true;++generation;++previewGeneration;pausePreview();lesson?.dispose();if(modal.open)modal.close();unlock();
  previewObserver.disconnect();footerObserver.disconnect();off.splice(0).forEach(fn=>fn());previewVideo.removeAttribute('src');previewVideo.load();
 };
 setPreview(selected);if(device.matches)mount(true);
}
function dispose(){if(cleanup){const fn=cleanup;cleanup=null;fn();}}
window.FormwardTutorial={render,bind,dispose};
})();
