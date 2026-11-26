(() => {
'use strict';
const topics=[
 {id:'meals',name:'饮食',title:'从食材库记一餐',summary:'选食材、填份量、保存',short:['打开指引','选食材','保存'],steps:[['打开记录一餐','从总览或饮食页点「记一餐」。想跟着做，就点「使用指引」。'],['添加食材','从食材库打开实际吃的食物，核对规格和数量，再点「加入本餐」。也可以手填或拍照。'],['核对并保存','核对日期、餐别和食物，再点「保存餐次」。当天全部记完后，在饮食列表末尾勾「已记全」。']],note:'手填的是本次吃下的总营养。食材库项目按规格和份量自动换算。'},
 {id:'overview',name:'总览',title:'看懂总览与趋势',summary:'日期、状态卡与日收支',short:['打开指引','看状态卡','看趋势'],steps:[['打开页面导览','点总览的「使用指引」，金框标出今天的日期和可用记录入口。'],['查看状态卡','点「下一步」看今日摄入、最近晨重和今日消耗。点亮起的卡片可进入对应趋势。'],['查看选中日期','图表显示所选日收支和次晨实测变化。点「查看记录」打开同一天。']],note:'饮食、消耗和身体趋势页也可直接打开高光导览。'},
 {id:'body',name:'身体',title:'记录实测体重',summary:'选晨晚、填实测、保存',short:['打开录入','填实测','保存'],steps:[['打开身体录入','点「记录体重」后可点「使用指引」。在手机按实际称重时段选择晨间或晚间。'],['填写实测','晨间填空腹实测，晚间可以记非空腹值。体脂率没测可留空。'],['核对保存','核对日期、时段和值，再点「保存录入」。可在身体页查看原记录。']],note:'切换时段会保留已填内容。缺测按事实留空。'},
 {id:'energy',name:'消耗',title:'估算并保存当天消耗',summary:'活动量、估算依据与保存',short:['打开估算','选活动量','保存'],steps:[['打开当天估算','没有采用稳定设备来源时，点「估算今天的消耗」。需要的话点「使用指引」。'],['选择活动量','选与实际最接近的一项。提示缺资料时可补实测或个人资料，返回继续同一天的估算。'],['查看依据并保存','核对预计全天消耗。可展开「估算依据」查看公式与实测日期，然后点「保存」。']],note:'手动填写仍可用。活动合计已包含的运动保留明细，避免重复增加。'},
 {id:'photo',name:'拍照',title:'拍照后在助手里核对',summary:'选图、补充、确认保存',short:['发送照片','补充核对','保存'],steps:[['选择照片并发送','在记录一餐里选「拍照录入」，加照片和必要说明，核对日期和餐别后点「发给助手」。'],['在同一对话补充','如果助手追问，在对应问题卡填写实际吃下的份量。核对卡可以修改食物，也可以改用手填。'],['确认本餐','检查餐别、日期和食物后点「确认保存」。保存后从回执打开饮食记录。']],note:'拍照发送只是提交识别。本餐以你最后确认保存的内容为准。'},
 {id:'device',name:'设备',title:'查看设备消耗和同步状态',summary:'今日累计和已导入记录',short:['打开消耗','看累计','看同步'],steps:[['查看当天消耗','已采用稳定的设备日消耗时，总览和消耗页展示设备来源或同步状态。'],['读懂今日累计','今日累计会随设备同步更新，全天数据完整后可查看当天结果。'],['查看来源和状态','点设备状态前往「设备与数据来源」。在那里查看最近导入，或处理连接、暂停与失败。']],note:'仅同步步数或运动的设备不会接管全天消耗。'},
 {id:'backfill',name:'补录',title:'补到正确的日期',summary:'选历史日期并查看记录',short:['打开记录','选日期','核对保存'],steps:[['查找日期','从饮食趋势选择日期，或在「查看记录」里查找要补的那一天。'],['补记当天','在相应日期点「补记这天」或进入编辑，核对面板上的日期与餐别。'],['保存并重新核对','保存后从同一天查看餐次与食物。补记或修改后，再确认那天是否「已记全」。']],note:'昨天待确认时也可从总览的「核对」直接打开昨天。'},
 {id:'ai',name:'外部 AI',title:'核对外部 AI 提交的草稿',summary:'连接、核对与确认保存',short:['连接提交','检查修改','确认保存'],steps:[['连接并提交','从小助手的「常用功能」打开「AI 接入」，连接并授权所需权限。提交时说清日期、餐别和食物。'],['回网页核对','打开提交返回的审核链接。对照原内容和份量，需要时点「修改」。'],['确认保存','最后点「确认保存」，再从回执查看对应记录。']],note:'草稿可以多次修改。正式记录以确认保存后的内容为准。'}
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
 '<section class="journey tutorial-journey" aria-labelledby="manual-title" data-tutorial-guide data-mode="'+(device.matches?'mobile':'desktop')+'">',
 '<div class="guide-heading"><h1 id="manual-title">使用说明</h1><span class="guide-reference">演示使用虚构数据</span></div>',
 '<p class="guide-intro">在页面或录入面板点「使用指引」，跟着金框操作。</p><h2 class="guide-video-title" id="operation-videos">操作视频</h2>',
 '<section class="guide-directory" aria-label="教程目录与预览"><nav class="directory-topics" aria-label="操作视频主题">',
 topics.map(t=>'<button type="button" class="directory-topic" data-directory-topic="'+t.id+'" aria-label="'+t.name+'：'+t.summary+'，选择教程"><span class="directory-copy"><span class="directory-name">'+t.name+'</span><span class="directory-summary">'+t.summary+'</span></span><span class="directory-arrow" aria-hidden="true">›</span></button>').join(''),
 '</nav><div class="directory-preview" data-preview-topic="'+selected+'"><div class="preview-heading"><h2 data-preview-title>'+topicFor(selected).title+'</h2><button type="button" class="preview-toggle" data-preview-toggle aria-label="自动播放短预览" aria-pressed="'+!reduced.matches+'">'+(reduced.matches?'播放预览':'暂停预览')+'</button></div>',
 '<div class="preview-picture"><img alt="" loading="lazy"><video muted loop playsinline preload="none" aria-hidden="true" data-directory-preview></video></div><button type="button" class="preview-open" data-open-preview>'+playIcon+'<span>观看完整教程</span></button></div></section>',
 '<section class="mobile-guide" aria-label="手机操作教程"><div class="tutorial-topics" role="tablist" aria-label="操作教程">',
 topics.map(t=>'<button class="tutorial-topic" type="button" role="tab" id="topic-'+t.id+'" aria-controls="mobile-lesson" aria-selected="'+(t.id===selected)+'" tabindex="'+(t.id===selected?'0':'-1')+'" data-topic="'+t.id+'">'+t.name+'</button>').join(''),
 '</div><div id="mobile-lesson" role="tabpanel" aria-labelledby="topic-'+selected+'"></div></section>',
 '<dialog class="tutorial-modal" aria-labelledby="tutorial-modal-title"><header class="modal-head"><h2 id="tutorial-modal-title"></h2><div class="modal-head-actions"><button type="button" class="text-switch" data-view-switch aria-pressed="false">文字版</button><button type="button" class="modal-close" data-close-lesson aria-label="关闭教程">×</button></div></header><div class="modal-body"></div></dialog>',
 '<div class="tutorial-actions"><div class="tutorial-action-inner">'+back+'<button type="button" class="primary" data-action="start">'+esc(options.startText)+'</button></div></div></section>'
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
   topic.id==='ai'?'<p class="ai-connection"><strong>第一次连接AI</strong><br>在小助手的「常用功能」打开「AI 接入」，按需开启读取和提交草稿权限。</p>':'',
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
