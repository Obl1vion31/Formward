/* eslint-disable @next/next/no-img-element -- 独立React原型只预览内存Blob，不使用Next图片上传／优化服务。 */
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {createRoot} from "react-dom/client";
import {BrandLogo} from "../../src/components/brand-logo";
import {AssistantIcon} from "../../src/features/assistant/icon";
import {useMobileMode} from "../../src/components/use-mobile-mode";
import {lockPageScroll} from "../../src/components/scroll-lock";
import {animateSurface} from "../../src/components/surface-motion";
import {TODAY,YESTERDAY,seed,scenes,suggestions,planReply,type Scene,type Message,type Preview,type Source,type Task,type Plan} from "./mock";
import "../../src/app/theme.css";
import "./styles.css";

type Glyph="close"|"send"|"plus"|"photo"|"chevron"|"quote"|"check"|"more"|"theme"|"stop"|"arrow"|"link"|"grid"|"food"|"training"|"energy"|"body";
function Icon({name}:{name:Glyph}){return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
 {name==="close"?<path d="m6 6 12 12M18 6 6 18"/>:name==="send"?<path d="M12 20V4m-7 7 7-7 7 7"/>:name==="plus"?<path d="M12 5v14M5 12h14"/>:name==="photo"?<><rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="8" cy="10" r="1"/><path d="m4 17 5-4 4 3 4-5 4 6"/></>:name==="chevron"?<path d="m8 4 8 8-8 8"/>:name==="quote"?<><path d="M10 8H4v7h5v-4H4m16-3h-6v7h5v-4h-5"/></>:name==="check"?<path d="m5 12 4 4 10-10"/>:name==="more"?<><circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/></>:name==="theme"?<><path d="M20 13A8 8 0 0 1 11 4a8 8 0 1 0 9 9Z"/></>:name==="stop"?<rect x="6" y="6" width="12" height="12" rx="2"/>:name==="arrow"?<path d="m7 11 5 5 5-5M12 4v12"/>:name==="link"?<><path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/></>:name==="grid"?<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></>:name==="food"?<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-5 5-5 9h5"/>:name==="training"?<path d="m6.5 6.5 11 11M3 6l3-3 3 3-3 3Zm12 12 3-3 3 3-3 3ZM2 10l8-8m4 20 8-8"/>:name==="energy"?<path d="M13 3c1 5-2 5-1 9 2-1 3-3 3-5 4 4 5 7 3 11-3 5-11 3-12-2-1-4 2-6 3-8-1 4 1 5 2 5-1-4 2-6 2-10Z"/>:<><circle cx="12" cy="4" r="2"/><path d="m5 9 7 2 7-2M12 11v5m0 0-4 5m4-5 4 5"/></>}
 </svg>;}
function ActionIcon({name,label,onClick,disabled=false}:{name:Glyph;label:string;onClick:()=>void;disabled?:boolean}){return <button className="iconButton" type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}><Icon name={name}/></button>;}
function Overlay({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),callback=useRef(close);
 useLayoutEffect(()=>{callback.current=close;});
 useLayoutEffect(()=>{const node=ref.current!,previous=document.activeElement;node.showModal();const unlock=lockPageScroll();node.querySelector<HTMLElement>("[data-overlay-title]")?.focus();return()=>{node.close();unlock();if(previous instanceof HTMLElement&&previous.isConnected&&previous.checkVisibility())previous.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className="overlay" aria-labelledby="overlay-title" onCancel={event=>{event.preventDefault();callback.current();}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)callback.current();}}}>
  <header><h2 id="overlay-title" tabIndex={-1} data-overlay-title>{title}</h2><ActionIcon name="close" label="关闭详情" onClick={close}/></header>{children}
 </dialog>;
}
type OverlayState={kind:"source";source:Source}|{kind:"review";preview:Preview}|{kind:"manual";date:string;category?:"food"|"body"|"energy"}|{kind:"record";date:string;category?:"food"|"body"|"energy"}|{kind:"new"|"account"};
const limited:Partial<Record<Scene,{title:string;body:string}>>={
 "context-limit":{title:"这段对话已达到长度上限",body:"历史消息仍可查看。请开始新对话；如需接续，可以先查看并复制交接摘要。不会自动把旧对话带到新的会话。"},
 "daily-limit":{title:"今天的AI可用额度已用完",body:"待办提醒和手工记录仍可使用。这里是额度限制演示，未设置真实恢复时间。"},
 "rate-limit":{title:"发送得有些频繁，请稍后重试",body:"当前输入已保留。可以先查看记录，等服务允许后再发送。"}
};
function pause(ms:number,signal:AbortSignal){return new Promise<boolean>(resolve=>{if(signal.aborted){resolve(false);return;}const stop=()=>{clearTimeout(timer);resolve(false);};const timer=setTimeout(()=>{signal.removeEventListener("abort",stop);resolve(!signal.aborted);},ms);signal.addEventListener("abort",stop,{once:true});});}
function App(){
 const mobile=useMobileMode(),[open,setOpen]=useState(true),[closing,setClosing]=useState(false),[expanded,setExpanded]=useState(true),[tab,setTab]=useState<"chat"|"tasks">("chat"),[theme,setTheme]=useState<"light"|"dark">("light");
 const [view,setView]=useState("总览"),[slow,setSlow]=useState(false);
 const [scene,setScene]=useState<Scene>("meal"),[messages,setMessages]=useState<Message[]>(()=>seed("meal")),[draft,setDraft]=useState(""),[quote,setQuote]=useState<Message|null>(null),[task,setTask]=useState<Task|null>({date:TODAY,rice:150,origin:"meal"});
 const [photo,setPhoto]=useState<{url:string;name:string}|null>(null),[uploadError,setUploadError]=useState(""),[busy,setBusy]=useState(false),[requests,setRequests]=useState(0),[writes,setWrites]=useState(0),[ignored,setIgnored]=useState(false),[complete,setComplete]=useState(false),[toast,setToast]=useState(false),[account,setAccount]=useState("A");
 const [overlay,setOverlay]=useState<OverlayState|null>(null),[status,setStatus]=useState(""),[showLatest,setShowLatest]=useState(false),[currentStep,setCurrentStep]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLTextAreaElement>(null),feed=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null),launcher=useRef<HTMLButtonElement>(null),scenarioMenu=useRef<HTMLDetailsElement>(null),sequence=useRef(0),controller=useRef<AbortController|null>(null),stick=useRef(true),saved=useRef(new Set<string>()),blobs=useRef(new Set<string>()),reminded=useRef(false),closePending=useRef(false),retry=useRef<{text:string;task:Task|null;quote:Message|null;photo:string|undefined;target:string}|null>(null);
 const hasReminder=scene!=="welcome"&&!ignored&&!complete,limit=limited[scene],blocked=!!limit||scene==="login",dirty=!!draft.trim()||!!photo;
 const sheetGesture=useRef({start:0,dragged:false});
 useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[dirty]);
 useEffect(()=>()=>{controller.current?.abort();blobs.current.forEach(url=>URL.revokeObjectURL(url));},[]);
 useLayoutEffect(()=>{
  if(!open||mobile===null)return;
  const node=dialog.current!,previous=document.activeElement,launch=launcher.current;
  if(mobile)node.showModal();else node.show();
  const unlock=mobile?lockPageScroll():()=>{};
  void animateSurface(node,"open",launcher.current,mobile?"sheet":"anchored",180);
  node.querySelector<HTMLElement>("#chat-title")?.focus({preventScroll:true});
  return()=>{node.getAnimations().forEach(animation=>animation.cancel());node.close();unlock();if(launch?.isConnected&&launch.checkVisibility())launch.focus({preventScroll:true});else if(previous instanceof HTMLElement&&previous!==document.body&&previous.isConnected&&previous.checkVisibility())previous.focus({preventScroll:true});};
 },[open,mobile]);
 useLayoutEffect(()=>{
  const node=feed.current;if(!node)return;
  if(stick.current){node.scrollTop=node.scrollHeight;setShowLatest(false);}
  else setShowLatest(node.scrollHeight-node.scrollTop-node.clientHeight>60);
 },[messages,tab,open,busy]);
 useLayoutEffect(()=>{const node=input.current;if(node){node.style.height="auto";node.style.height=Math.min(144,node.scrollHeight)+"px";}},[draft,quote,photo]);
 useEffect(()=>{
  const update=()=>{const viewport=window.visualViewport;document.documentElement.style.setProperty("--viewport-height",(viewport?.height??innerHeight)+"px");document.documentElement.style.setProperty("--viewport-top",(viewport?.offsetTop??0)+"px");};
  update();window.visualViewport?.addEventListener("resize",update);window.visualViewport?.addEventListener("scroll",update);window.addEventListener("resize",update);
  return()=>{window.visualViewport?.removeEventListener("resize",update);window.visualViewport?.removeEventListener("scroll",update);window.removeEventListener("resize",update);};
 },[]);
 function updateMessage(id:string,change:Partial<Message>){setMessages(rows=>rows.map(row=>row.id===id?{...row,...change}:row));}
 async function closeChat(){
  if(closePending.current)return;closePending.current=true;setClosing(true);
  if(dialog.current?.open)await animateSurface(dialog.current,"close",launcher.current,mobile?"sheet":"anchored",160);
  setOpen(false);setClosing(false);closePending.current=false;
 }
 async function navigate(view:OverlayState){await closeChat();setOverlay(view);}
 function reset(next:Scene,changeAccount=false){
  controller.current?.abort();controller.current=null;setBusy(false);setCurrentStep(0);setScene(next);setMessages(seed(next));setDraft("");setQuote(null);setPhoto(null);setUploadError("");setStatus("");setTask(["meal","expired","conflict","duplicate"].includes(next)?{date:TODAY,rice:150,origin:"meal"}:null);setIgnored(false);setComplete(false);setRequests(0);setWrites(0);setToast(false);setShowLatest(false);setTab("chat");saved.current.clear();retry.current=null;stick.current=true;
  blobs.current.forEach(url=>URL.revokeObjectURL(url));blobs.current.clear();if(changeAccount){setAccount(value=>value==="A"?"B":"A");reminded.current=false;}
 }
 function changeScene(next:Scene){reset(next);if(scenarioMenu.current)scenarioMenu.current.open=false;setOpen(true);}
 function startNewConversation(){controller.current?.abort();setBusy(false);setMessages([]);setDraft("");setQuote(null);setTask(null);setPhoto(null);setUploadError("");setScene("meal");setStatus("已开始新对话，没有自动携带旧消息。待办与记录保持。");setTab("chat");stick.current=true;blobs.current.forEach(url=>URL.revokeObjectURL(url));blobs.current.clear();retry.current=null;}
 function requestNew(){if(dirty||messages.some(row=>row.preview?.status==="pending"))setOverlay({kind:"new"});else startNewConversation();}

 function scrollLatest(){stick.current=true;if(feed.current)feed.current.scrollTop=feed.current.scrollHeight;setShowLatest(false);}
 function citeMessage(message:Message){setQuote(message);setTab("chat");input.current?.focus();stick.current=true;}
 function jump(id:string){
  const node=document.getElementById(id);if(!node){setStatus("原消息已不在这段对话中，请重新选择引用。");return;}
  stick.current=false;node.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});node.classList.add("referenced");setTimeout(()=>node.classList.remove("referenced"),1400);
 }
 async function perform(text:string,chosenTask:Task|null,chosenQuote:Message|null,photoUrl?:string,target?:string,override?:Scene,continuation=false){
  if(busy)return;
  const abort=new AbortController();controller.current?.abort();controller.current=abort;
  const id=target??"answer-"+(++sequence.current),effective=override??scene;
  const plan:Plan=continuation?{answer:"\n接着说：先补充实际发生的内容，再核对预览。记录是否完整由你确认；没有数据的部分保留未知，不为了完整而补数值。",steps:[]}:planReply(text,effective,chosenTask,chosenQuote,!!photoUrl,effective==="duplicate"?"duplicate-operation":"operation-"+id);
  if(plan.preview&&saved.current.has(plan.preview.id)){plan.preview={...plan.preview,status:"confirmed"};plan.answer="这次请求已处理，返回原来的演示结果，没有重复新增记录。";}
  setBusy(true);setRequests(value=>value+1);setCurrentStep(0);setStatus("");setTab("chat");
  if(!target)setMessages(rows=>[...rows,{id,role:"assistant",text:"",time:"09:42",status:"working",steps:plan.steps}]);
  else updateMessage(id,{status:"working",error:undefined,...(!continuation?{text:"",steps:plan.steps}:{})});
  const before=continuation?(messages.find(row=>row.id===id)?.text??""):"";
  if(!await pause(slow?1000:250,abort.signal))return;
  for(let index=0;index<plan.steps.length;index++){setCurrentStep(index);if(!await pause(slow?1600:420,abort.signal))return;setCurrentStep(index+1);}
  if(plan.failure){updateMessage(id,{status:"error",error:plan.failure});retry.current={text,task:chosenTask,quote:chosenQuote,photo:photoUrl,target:id};setBusy(false);return;}
  if(matchMedia("(prefers-reduced-motion: reduce)").matches)updateMessage(id,{text:before+plan.answer});
  else for(let index=0;index<plan.answer.length;index+=8){if(!await pause(32,abort.signal))return;updateMessage(id,{text:before+plan.answer.slice(0,index+8)});}
  if(abort.signal.aborted)return;
  updateMessage(id,{text:before+plan.answer,status:plan.truncated?"truncated":"complete",sources:plan.sources,preview:plan.preview});
  setTask(plan.task??null);setBusy(false);
 }
 function send(value=draft){
  const text=value.trim();if((!text&&!photo)||busy||blocked)return;
  const id="user-"+(++sequence.current),selected=quote,attachment=photo;
  setMessages(rows=>[...rows,{id,role:"user",text:text||"这张照片帮我看看。",time:"09:42",date:task?.date,photo:attachment?.url,replyTo:selected?{id:selected.id,text:selected.text}:undefined}]);
  retry.current=null;setDraft("");setQuote(null);setPhoto(null);setUploadError("");stick.current=true;
  void perform(text||"这张照片帮我看看。",task,selected,attachment?.url);
 }
 function stop(){controller.current?.abort();setBusy(false);setMessages(rows=>rows.map(row=>row.status==="working"?{...row,status:"stopped"}:row));}
 function retryLast(id:string){
  const request=retry.current;if(request?.target!==id)return;
  void perform(request.text,request.task,request.quote,request.photo,id,scene==="tool-error"?"sources":"meal");
 }
 function ignoreReminder(){setIgnored(true);setToast(false);setStatus("已忽略这一天的提醒，没有修改饮食记录或记全状态。");}
 function helpReminder(){setTab("chat");setDraft("帮我补记11月11日的饮食：");setTask({date:YESTERDAY,rice:150,origin:"meal"});input.current?.focus();stick.current=true;}
 function finishPreview(preview:Preview){
  if(saved.current.has(preview.id))return;
  saved.current.add(preview.id);setWrites(value=>value+1);setMessages(rows=>rows.map(row=>row.preview?.id===preview.id?{...row,preview:{...row.preview,status:"confirmed"}}:row));if(preview.date===YESTERDAY)setComplete(true);setOverlay(null);setOpen(true);setStatus("本地演示已保存。正式记录没有发生变化。");
 }
 const sceneSelect=<details ref={scenarioMenu} className="scenarioMenu" onKeyDown={event=>{if(event.key==="Escape"&&event.currentTarget.open){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector<HTMLElement>("summary")?.focus();}}}>
  <summary aria-label="演示场景" title="演示场景"><Icon name="more"/></summary>
  <div><strong>本地交互场景</strong><p>全部是虚构数据，不连接模型或正式记录。</p><label>切换演示场景<select aria-label="切换演示场景" value={scene} onChange={event=>changeScene(event.target.value as Scene)}>{scenes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <button type="button" onClick={()=>{if(scenarioMenu.current)scenarioMenu.current.open=false;if(dirty||busy){setStatus("正在输入或回答时不弹出提醒。");return;}if(!hasReminder){setStatus("当前没有待办，不需要提醒。");return;}void closeChat();if(!reminded.current){reminded.current=true;setToast(true);}else setStatus("今天已提示过，不重复打断。");}}>触发每日站内提醒</button>
   <label className="slowOption"><input type="checkbox" checked={slow} onChange={event=>setSlow(event.target.checked)}/>慢速响应演示</label><button type="button" onClick={()=>{scenarioMenu.current!.open=false;setOverlay({kind:"account"});}}>切换演示账号（当前{account}）</button>
   <p>刷新将清空演示会话，关闭面板会保留。图片仅在浏览器内存中。</p>
  </div>
 </details>;
 const taskList=<div className="tasksContent">
  <div className="sectionLabel"><h3>待办</h3><span>{hasReminder?"1 项":"已处理"}</span></div>
  {hasReminder?<article className="reminderItem"><span className="dateLabel">昨天 · 11月11日</span><h4>饮食是不是还没记全？</h4><p>已有两餐，完整性待确认。</p><div className="reminderActions"><button className="subtleButton" onClick={()=>void navigate({kind:"manual",date:YESTERDAY})}>去补录<Icon name="chevron"/></button><button className="textButton" onClick={ignoreReminder}>忽略这一天</button></div><button className="textButton helpButton" onClick={helpReminder}><AssistantIcon/>让 AI 帮我补记</button></article>:<div className="taskEmpty"><Icon name="check"/><h4>{ignored?"这一天的提醒已忽略":complete?"昨日待办已处理":"暂时没有待办"}</h4><p>{ignored?"没有修改记录，也没有标记为记全。":"需要时，仍可以查看或补充记录。"}</p></div>}
  <section className="quickSection"><h3>快捷记录</h3>{[["food","饮食"],["body","测量"],["energy","消耗"]].map(([icon,label])=><button key={label} onClick={()=>void navigate({kind:"manual",date:TODAY,category:icon as "food"|"body"|"energy"})}><Icon name={icon as Glyph}/><span>记录{label}</span><Icon name="plus"/></button>)}</section>
  <details className="commonTools"><summary>常用功能</summary><button onClick={()=>setStatus("使用说明：选择演示场景，或在聊天里补充“100克”。")}>使用说明</button><button onClick={()=>void navigate({kind:"record",date:YESTERDAY})}>查看记录</button></details>
 </div>;
 return <div className="prototype" data-account={account} data-model-requests={requests} data-write-count={writes}>
  <header className="workspaceHeader"><button className="brandHome" aria-label="Formward本地原型总览" onClick={()=>void closeChat()}><BrandLogo compactOnMobile/></button><span className="prototypeLabel">本地演示 · 虚构数据</span><ActionIcon name="theme" label="切换深浅主题" onClick={()=>setTheme(theme==="light"?"dark":"light")}/></header>
  <nav className="workspaceNav" aria-label="主导航">{[["grid","总览"],["food","饮食"],["training","训练"],["energy","消耗"],["body","身体"]].map(([icon,label])=><button key={label} aria-current={label===view?"page":undefined} onClick={()=>setView(label)}><Icon name={icon as Glyph}/><span>{label}</span></button>)}</nav>
  <main className="workspace"><header><h1>{view}</h1><p>11月12日，星期四</p></header><div className="workspaceActions"><button className="subtleButton" onClick={()=>setOverlay({kind:"manual",date:TODAY})}><Icon name="plus"/>记录饮食</button><button className="subtleButton" onClick={()=>setOverlay({kind:"manual",date:TODAY,category:"body"})}><Icon name="plus"/>记录测量</button><button className="subtleButton" onClick={()=>setOverlay({kind:"manual",date:TODAY,category:"energy"})}><Icon name="plus"/>记录消耗</button></div>
   <div className="backgroundMetrics">{[["今日摄入","1,280","kcal","早餐、午餐已记录"],["最近晨重","70.2","kg","11月12日 · 实测示例"],["今日消耗","—","kcal","暂无完整读数"]].map(([label,value,unit,note])=><article key={label}><h2>{label}</h2><p className="metricValue">{value}<span>{unit}</span></p><p>{note}</p><button onClick={()=>setOverlay({kind:"record",date:TODAY})}>查看记录<Icon name="chevron"/></button></article>)}</div>
   <section className="backgroundRecords"><div><h2>最近记录</h2><button className="textButton" onClick={()=>setOverlay({kind:"record",date:YESTERDAY})}>查看全部</button></div>{[["今天","午餐","米饭、鸡胸肉"],["今天","早餐","牛奶、鸡蛋、面包"],["昨天","饮食","待确认是否记全"]].map(([date,title,detail],index)=><button key={index} onClick={()=>setOverlay({kind:"record",date:index===2?YESTERDAY:TODAY})}><span>{date}</span><strong>{title}</strong><span>{detail}</span><Icon name="chevron"/></button>)}</section>
  </main>
  {status&&!open&&<p role="status" className="workspaceNotice">{status}</p>}
  {toast&&!open&&<div className="reminderToast" role="status"><span>昨天的饮食待你确认</span><button onClick={()=>{setToast(false);setTab("tasks");setOpen(true);}}>查看</button><ActionIcon name="close" label="关闭提醒" onClick={()=>setToast(false)}/></div>}
  <button ref={launcher} className="assistantLauncher" aria-label="打开小助手" aria-expanded={open} onClick={()=>{setOpen(true);setToast(false);}}><AssistantIcon/><span>小助手</span>{hasReminder&&<small>1</small>}</button>
  <dialog ref={dialog} className={"chatWindow"+(mobile?" mobile":"")+(closing?" closing":"")} data-expanded={expanded} data-tab={tab} aria-labelledby="chat-title" onCancel={event=>{event.preventDefault();void closeChat();}} onKeyDown={event=>{if(event.key==="Escape"&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();void closeChat();}}}>
   <button className="sheetHandle" aria-label={expanded?"收起到半屏，可拖动面板":"展开到近全屏，可拖动面板"} onClick={event=>{if(sheetGesture.current.dragged&&event.detail>0){sheetGesture.current.dragged=false;return;}sheetGesture.current.dragged=false;setExpanded(value=>!value);}} onPointerDown={event=>{sheetGesture.current={start:event.clientY,dragged:false};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerUp={event=>{const delta=event.clientY-sheetGesture.current.start;if(Math.abs(delta)>28){sheetGesture.current.dragged=true;setExpanded(delta<0);}if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{sheetGesture.current.dragged=false;}}><span/></button>
   <header className="chatHeading"><div><AssistantIcon/><h2 id="chat-title" tabIndex={-1}>小助手</h2><span className="demoTag">演示</span></div><div className="headingActions"><ActionIcon name="plus" label="新对话" onClick={requestNew}/>{sceneSelect}<ActionIcon name="close" label="关闭小助手" onClick={()=>void closeChat()}/></div></header>
   <div className="chatTabs" role="tablist" aria-label="小助手内容"><button role="tab" aria-selected={tab==="chat"} onClick={()=>setTab("chat")}>聊天</button><button role="tab" aria-selected={tab==="tasks"} onClick={()=>setTab("tasks")}>待办{hasReminder&&<span>1</span>}</button></div>
   <div className="assistantBody"><aside className="taskRail" aria-label="提醒与快捷记录">{taskList}</aside><section className="conversation" aria-label="聊天">
    <div ref={feed} className="messageFeed" role="log" aria-label="对话消息" aria-live="off" onScroll={event=>{const node=event.currentTarget;stick.current=node.scrollHeight-node.scrollTop-node.clientHeight<60;setShowLatest(!stick.current);}}>
     <p className="conversationDate">今天 · 本地演示对话</p>
     {!messages.length&&<div className="welcome"><AssistantIcon/><h3>想补记，还是先看看今天？</h3><p>可以拍照、描述食物，或直接问我。<br/>只有你确认后，记录才会保存。</p><button className="subtleButton" onClick={()=>{setDraft("昨天有哪些记录没记全？");input.current?.focus();}}>看看昨天的记录<Icon name="chevron"/></button></div>}
     {messages.map(message=><article className={"message "+message.role} id={message.id} key={message.id} data-message-id={message.id}>
      <div className="messageMeta"><span>{message.role==="user"?"你":"小助手"}</span><time>{message.time}</time></div>
      {message.replyTo&&<button className="messageQuote" onClick={()=>jump(message.replyTo!.id)}><Icon name="quote"/><span>{message.replyTo.text}</span></button>}
      {!!message.steps?.length&&<details className="progress" open={message.status==="working"?true:undefined}><summary><span className={message.status==="working"?"progressSpinner":message.status==="error"?"stepError":"stepDone"}>{message.status==="working"?null:<Icon name={message.status==="error"?"close":"check"}/>}</span><span>{message.status==="working"?(message.steps[Math.min(currentStep,message.steps.length-1)]?.label??"正在整理回答")+"…":message.status==="error"?"查询未完成":message.steps.some(step=>step.state==="error")?"部分查询成功":"已完成 "+message.steps.length+" 个步骤"}</span><Icon name="chevron"/></summary><ol>{message.steps.map((step,index)=><li key={step.label} data-step-state={message.status==="working"&&index>=currentStep?"working":step.state??"complete"}><strong>{step.label}{step.state==="error"&&message.status!=="working"&&<span className="stepFailureLabel"> · 未成功</span>}</strong><span className="toolName">{step.tool}</span><p>{message.status==="working"&&index>=currentStep?"正在处理…":step.result}</p></li>)}</ol></details>}
      {message.status==="working"&&!message.steps?.length&&!message.text&&<p className="workingText"><span className="progressSpinner"/>正在整理回答…</p>}
      {message.photo&&<img className="messagePhoto" src={message.photo} alt="本地选择的照片，未上传"/>}
      {!!message.text&&<div className="messageText">{message.text.split("\n").map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>}
      {message.sources&&<div className="sources" aria-label="回答依据">{message.sources.map((source,index)=><button key={source.id} onClick={()=>setOverlay({kind:"source",source})}><span className="sourceNumber">{index+1}</span>{source.title}<Icon name="link"/></button>)}</div>}
      {message.preview&&<article className="previewCard" data-preview-id={message.preview.id}><div><Icon name={message.preview.status==="confirmed"?"check":"food"}/><strong>{message.preview.title}</strong><span>{message.preview.status==="confirmed"?"已保存 · 演示":message.preview.status==="cancelled"?"已取消":message.preview.status==="expired"?"已过期":message.preview.status==="conflict"?"需重新核对":"待你确认"}</span></div><p>{message.preview.date} · {message.preview.detail}</p><button className="subtleButton" onClick={()=>void navigate({kind:"review",preview:message.preview!})}>{message.preview.status==="confirmed"?"查看演示结果":"查看并确认"}<Icon name="chevron"/></button></article>}
      {message.error&&<div className="messageError" role="alert"><p>{message.error}</p><button className="textButton" onClick={()=>retryLast(message.id)}>{scene==="tool-error"?"重试查询":"重试这条消息"}</button><button className="textButton" onClick={()=>void navigate({kind:"manual",date:YESTERDAY})}>先手工记录</button></div>}
      {(message.status==="stopped"||message.status==="truncated")&&<div className="unfinished"><span>{message.status==="stopped"?"生成已停止":"回答尚未完成"}</span><button className="textButton" onClick={()=>void perform("",null,null,undefined,message.id,undefined,true)}>继续回答</button></div>}
      {message.status!=="working"&&<div className="messageActions"><button className="textButton" onClick={()=>citeMessage(message)} aria-label={"引用回复："+message.text.slice(0,24)}><Icon name="quote"/>引用回复</button>{message.role==="assistant"&&<button className="textButton" onClick={async()=>{try{await navigator.clipboard.writeText(message.text);setStatus("回答已复制。");}catch{setStatus("无法自动复制，请选择回答文字复制。");}}}>复制</button>}</div>}
     </article>)}
     {limit&&<div className="limitNotice" role="status"><strong>{limit.title}</strong><p>{limit.body}</p>{scene==="context-limit"?<><button className="textButton" onClick={()=>{setStatus("交接摘要：当前有一份待补充食量的饮食任务；没有正式保存任何内容。");}}>查看交接摘要</button><button className="subtleButton" onClick={requestNew}>开始新对话</button></>:<><button className="textButton" onClick={()=>void navigate({kind:"manual",date:TODAY})}>手工记录</button>{scene==="rate-limit"&&<button className="textButton" onClick={()=>{setScene("meal");setStatus("演示服务已恢复，可以继续发送。");}}>重试</button>}</>}</div>}
     {scene==="login"&&<div className="limitNotice" role="alert"><strong>登录已失效</strong><p>重新登录后继续，当前草稿与照片会保留。</p><button className="subtleButton" onClick={()=>{setScene("meal");setStatus("已恢复演示登录，草稿仍在。");}}>重新登录 · 演示</button></div>}
    </div>
    {showLatest&&<button className="latestButton subtleButton" onClick={scrollLatest}>回到最新<Icon name="arrow"/></button>}
    <footer className="composerArea">
     {status&&<p className="localStatus" role="status">{status}</p>}
     {quote&&<div className="quoteDraft"><Icon name="quote"/><button className="quoteText" onClick={()=>jump(quote.id)}><span>回复{quote.role==="user"?"你的消息":"小助手"}</span><span>{quote.text}</span></button><ActionIcon name="close" label="取消引用" onClick={()=>setQuote(null)}/></div>}
     {!quote&&task&&<div className="taskContext"><span>补充：{task.date===YESTERDAY?"昨天":"今天"}午餐的实际食量</span><button className="textButton" onClick={()=>setTask(null)}>换个话题</button></div>}
     {photo&&<div className="photoDraft"><img src={photo.url} alt="待发送的本地照片"/><span>{photo.name}<small>仅在本地预览</small></span><ActionIcon name="close" label="移除照片" onClick={()=>{if(photo){URL.revokeObjectURL(photo.url);blobs.current.delete(photo.url);}setPhoto(null);}}/></div>}
     {uploadError&&<p className="uploadError" role="alert">{uploadError}</p>}
     <form className="composer" onSubmit={event=>{event.preventDefault();send();}}>
      <textarea ref={input} aria-label="给小助手发消息" rows={1} placeholder={task?"补充实际食量，例如：鸡胸肉100克":"描述这顿饭，或问我一个问题…"} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing&&!mobile){event.preventDefault();send();}}}/>
      <div className="composerTools"><div><ActionIcon name="photo" label="选择照片" disabled={blocked} onClick={()=>fileInput.current?.click()}/><span>照片或文字</span></div>{busy?<button className="sendButton stopButton" aria-label="停止生成" type="button" onClick={stop}><Icon name="stop"/></button>:<button className="sendButton" aria-label="发送消息" disabled={blocked||(!draft.trim()&&!photo)} type="submit"><Icon name="send"/></button>}</div>
     </form>
     <input ref={fileInput} className="fileInput" type="file" accept="image/*" aria-label="本地照片文件" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setUploadError("暂不支持这种图片格式，请选择JPEG、PNG或WebP照片。");return;}if(file.size>20*1024*1024){setUploadError("照片超过20MB，请选择更小的图片。");return;}if(photo){URL.revokeObjectURL(photo.url);blobs.current.delete(photo.url);}const url=URL.createObjectURL(file);blobs.current.add(url);setPhoto({url,name:file.name});setUploadError("");}}/>
     <p className="composerHint">{busy?"正在处理，可以停止生成。":"AI可提交预览，正式保存由你确认。"}<span className="desktopHint">Enter发送 · Shift+Enter换行</span></p>
     {!busy&&!limit&&!task&&suggestions[scene]&&<button className="suggestion" onClick={()=>send(suggestions[scene]!)}>{suggestions[scene]}<Icon name="send"/></button>}
    </footer>
   </section></div>
  </dialog>
  {overlay&&<Overlay title={overlay.kind==="source"?"引用依据":overlay.kind==="review"?"核对记录预览":overlay.kind==="manual"?(overlay.category==="body"?"记录测量 · 本地演示":overlay.category==="energy"?"记录消耗 · 本地演示":"补录饮食 · 本地演示"):overlay.kind==="record"?"饮食记录 · 本地演示":overlay.kind==="account"?"切换演示账号？":"开始新对话？"} close={()=>{setOverlay(null);if(["manual","review"].includes(overlay.kind))setOpen(true);}}>
   {overlay.kind==="source"?<div className="sourceDetail"><span className="dateLabel">{overlay.source.kind==="record"?"你的记录":overlay.source.kind==="estimate"?"识别与估算":"外部资料"}{overlay.source.date?" · "+overlay.source.date:""}</span><h3>{overlay.source.title}</h3><p>{overlay.source.summary}</p>{overlay.source.stale&&<p className="warning" role="status">引用的是当时的摘要，当前记录已有更新。请重新查询后再据此修改。</p>}{overlay.source.url?<a className="subtleButton" href={overlay.source.url} target="_blank" rel="noreferrer">打开外部资料<Icon name="link"/></a>:<button className="subtleButton" onClick={()=>{setOverlay(null);void navigate({kind:"record",date:overlay.source.date??YESTERDAY});}}>查看记录<Icon name="chevron"/></button>}{overlay.source.stale&&<button className="textButton" onClick={()=>{setOverlay(null);void perform("重新查询昨天的饮食",null,null,undefined,undefined,"sources");}}>重新查询</button>}</div>
   :overlay.kind==="review"?<div className="reviewBody"><span className="dateLabel">{overlay.preview.date} · {overlay.preview.title}</span><p>{overlay.preview.detail}</p>{overlay.preview.status==="confirmed"?<p className="success" role="status">这份演示预览已经保存，不会重复新增。</p>:overlay.preview.status==="cancelled"?<p className="dateLabel" role="status">这份预览已经取消。需要重新提交才能继续，不会保存已取消的内容。</p>:overlay.preview.status==="expired"||overlay.preview.status==="conflict"?<><p className="warning" role="alert">{overlay.preview.status==="expired"?"预览已过期，需要重新获取并核对。":"原记录已更新，需要加载最新版本后重新核对。"}</p><button className="subtleButton" onClick={()=>{const next={...overlay.preview,status:"pending" as const};setMessages(rows=>rows.map(row=>row.preview?.id===next.id?{...row,preview:next}:row));setOverlay({kind:"review",preview:next});}}>重新获取预览</button></>:<><p className="dateLabel">待确认 · 演示预览有效至今天09:57。</p>{!overlay.preview.noteOnly&&<div className="nutritionExample"><span>307<small>kcal · 虚构估算</small></span><p>蛋白质28g · 碳水40g · 脂肪4.5g</p></div>}<p className="dateLabel">{overlay.preview.noteOnly?"只修改这份记录的备注，其他内容保持。":"这是交互演示，不是经成分表核验的营养结果。"}</p><div className="overlayActions"><button className="subtleButton" onClick={()=>{setMessages(rows=>rows.map(row=>row.preview?.id===overlay.preview.id?{...row,preview:{...row.preview,status:"cancelled"}}:row));setOverlay(null);setOpen(true);}}>取消本次提交</button><button className="primaryButton" onClick={()=>finishPreview(overlay.preview)}>确认保存 · 演示</button></div></>}</div>
   :overlay.kind==="manual"?<form className="manualForm" onSubmit={event=>{event.preventDefault();if(overlay.date===YESTERDAY&&(!overlay.category||overlay.category==="food"))setComplete(true);setWrites(value=>value+1);setOverlay(null);setOpen(true);setStatus(overlay.date===YESTERDAY&&(!overlay.category||overlay.category==="food")?"本地演示补录完成，昨日待办已更新；正式记录未变。":"本地演示记录完成，其他待办与正式记录未变。");}}><span className="dateLabel">{overlay.date} · 只更新本地演示</span>{overlay.category==="body"?<><label>实测体重（kg）<input name="weight" inputMode="decimal" type="number" min="1" max="500" step="0.01" required placeholder="例如：70.2"/></label><p>这里只接收你输入的实测值，不估算或补全。</p></>:overlay.category==="energy"?<label>全天消耗（kcal）<input name="energy" inputMode="numeric" type="number" min="0" max="100000" required placeholder="按设备实际读数填写"/></label>:<><label>食物名称<input name="food" required defaultValue="米饭和鸡胸肉"/></label><label>本次实际食量<input name="amount" required placeholder="例如：米饭150克，鸡胸肉100克"/></label></>}<p>保存后只更新这份原型里的记录和待办。</p><div className="overlayActions"><button className="subtleButton" type="button" onClick={()=>{setOverlay(null);setOpen(true);}}>返回聊天</button><button className="primaryButton" type="submit">保存补录 · 演示</button></div></form>
   :overlay.kind==="record"?<div className="recordDetail"><span className="dateLabel">{overlay.date} · 虚构记录</span><h3>已记录的餐次</h3><dl><div><dt>早餐</dt><dd>牛奶、鸡蛋、面包</dd></div><div><dt>午餐</dt><dd>米饭、鸡胸肉</dd></div><div><dt>完整性</dt><dd>{complete?"已在演示中确认":"尚未确认是否记全"}</dd></div></dl><p>打开或查看记录不代表已补录，也不会自动移除待办。</p><button className="subtleButton" onClick={()=>{setOverlay(null);setOpen(true);}}>返回小助手</button></div>
   :<div className="confirmationBody"><p>{overlay.kind==="account"?"切换后会清空当前演示会话、草稿和本地照片，避免账号之间沿用信息。":"当前草稿或待确认预览还没有处理。开始新对话会清除本次演示内容，不会自动携带旧会话。"} </p><div className="overlayActions"><button className="subtleButton" onClick={()=>setOverlay(null)}>继续编辑</button><button className="primaryButton" onClick={()=>{const change=overlay.kind==="account";if(change)reset("welcome",true);else startNewConversation();setOverlay(null);}}> {overlay.kind==="account"?"切换账号":"开始新对话"} </button></div></div>}
  </Overlay>}
 </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
