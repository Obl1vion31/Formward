"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {usePathname,useRouter} from "next/navigation";
import {confirmDraftDiscard} from "@/components/draft-guard";
import {guideKindForPath,guidePlacement,recordGuideKey,recordGuides,type RecordGuideKind} from "./record-guidance-model";
import styles from "./record-guidance.module.css";

type Tour={kind:RecordGuideKind;step:0|1|2;id:number};
const GuidanceContext=createContext<{replay:(kind:RecordGuideKind)=>Promise<void>}>({replay:async()=>{}});
export const useRecordGuidance=()=>useContext(GuidanceContext);
const visible=(node:HTMLElement)=>node.isConnected&&node.getClientRects().length>0&&!node.closest("[inert],[aria-hidden=true],[data-closing=true],[data-surface-phase=closing]");
const first=(selector:string,root:ParentNode=document)=>[...root.querySelectorAll<HTMLElement>(selector)].find(visible)??null;

export function RecordGuidanceProvider({accountId,children}:{accountId:string;children:ReactNode}){
 const path=usePathname(),router=useRouter(),[tour,setTour]=useState<Tour|null>(null),sequence=useRef(0),seen=useRef(new Set<string>()),currentPath=useRef(path);
 const queued=useRef<RecordGuideKind|null>(null);
 useEffect(()=>{currentPath.current=path;},[path]);
 const remember=useCallback((kind:RecordGuideKind)=>{const key=recordGuideKey(accountId,kind);seen.current.add(key);try{localStorage.setItem(key,"seen");}catch{/* 禁用存储时，本次登录仍只提示一次。 */}},[accountId]);
 const finish=useCallback(()=>setTour(null),[]);
 useEffect(()=>{
  // 等真实 DOM 就绪后读取本设备标记；导航取消时清理未执行的帧。
  const frame=requestAnimationFrame(()=>{
   const kind=guideKindForPath(path),replay=queued.current===kind&&kind!==null;queued.current=null;
   if(!kind){setTour(null);return;}
   const key=recordGuideKey(accountId,kind);let done=seen.current.has(key);try{done ||=localStorage.getItem(key)==="seen";}catch{}
   setTour(!done||replay?{kind,step:0,id:++sequence.current}:null);
  });return()=>cancelAnimationFrame(frame);
 },[accountId,path]);
 const replay=useCallback(async(kind:RecordGuideKind)=>{
  if(!await confirmDraftDiscard())return;
  queued.current=kind;
  if(currentPath.current===recordGuides[kind].path){queued.current=null;setTour({kind,step:0,id:++sequence.current});}
  else {setTour(null);router.push(recordGuides[kind].path);}
 },[router]);
 return <GuidanceContext value={{replay}}>{children}{tour&&recordGuides[tour.kind].path===path&&<RecordWalkthrough key={tour.id} tour={tour} onShown={()=>remember(tour.kind)} change={step=>setTour(current=>current?.id===tour.id?{...current,step}:current)} finish={finish}/>}</GuidanceContext>;
}

function RecordWalkthrough({tour,onShown,change,finish}:{tour:Tour;onShown:()=>void;change:(step:0|1|2)=>void;finish:()=>void}){
 const config=recordGuides[tour.kind],target=useRef<HTMLElement|null>(null),tip=useRef<HTMLElement|null>(null),layer=useRef<HTMLDivElement|null>(null),shown=useRef(false),hadForm=useRef(false),scrolled=useRef<HTMLElement|null>(null);
 const [surface,setSurface]=useState<HTMLElement|null>(null),[positionedStep,setPositionedStep]=useState<number|null>(null),[preparingMeal,setPreparingMeal]=useState(false);
 const ready=positionedStep===tour.step;
 const end=useCallback(()=>{
  const node=target.current;
  if(layer.current?.contains(document.activeElement)&&node?.isConnected){
   const focusable=node.matches('input,select,textarea,button:not(:disabled),a[href]')?node:first('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)',node)??first('input:not(:disabled),button:not(:disabled)',node.closest('form')??document);
   focusable?.focus({preventScroll:true});
  }
  finish();
 },[finish]);
 const callbacks=useRef({onShown,change,finish:end});useEffect(()=>{callbacks.current={onShown,change,finish:end};},[onShown,change,end]);
 useEffect(()=>{
  let frame=0,disposed=false,movingUntil=0,observed:HTMLElement|null=null;
  const queue=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const resize=new ResizeObserver(queue);
  const update=()=>{
   frame=0;if(disposed)return;
   const form=first(`[data-entry-form="${config.form}"]`),entry=first(`[data-workspace-frame] [data-record-action="edit"]`),training=first('[data-record-guide-entry="training"]');
   if(form)hadForm.current=true;else if(hadForm.current){callbacks.current.finish();return;}
   const add=tour.kind==='meals'?first('[data-meal-add]'):null;
   const fields=form?(tour.kind==='meals'?first('[aria-label="自由填写食物名称"],[aria-label="食物名称 1"]',form)??first('[data-record-guide-fields]',form):first('[data-record-guide-fields]',form)):null;
   const next=tour.step===0?(form?fields:tour.kind==='training'?training:add??entry):tour.step===1?(form?fields:add):form?first('[data-record-guide-save]',form):null;
   const modal=[...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(visible).at(-1);
   // 确认框、助手和其他任务优先；不穿透顶层面板或只读查看。
   if(!next||modal&&!modal.contains(next)||form?.getAttribute('aria-busy')==='true'||document.documentElement.hasAttribute('data-chart-travel')){
    target.current=null;setPositionedStep(null);return;
   }
   if(tour.step===0&&form){callbacks.current.change(1);return;}
   if(tour.step===2&&!form){callbacks.current.finish();return;}
   target.current=next;setPreparingMeal(Boolean(add&&!form));
   const parent=next.closest<HTMLDialogElement>('dialog[open]')??document.body;
   if(layer.current?.parentElement!==parent){setSurface(parent);setPositionedStep(null);queue();return;}
   if(!shown.current){shown.current=true;callbacks.current.onShown();}
   if(scrolled.current!==next){
    scrolled.current=next;
    const r=next.getBoundingClientRect(),v=window.visualViewport;
    if(r.top<(v?.offsetTop??0)+12||r.bottom>(v?.offsetTop??0)+(v?.height??innerHeight)-60)next.scrollIntoView({block:'center',behavior:'instant'});
    movingUntil=performance.now()+450;
   }
   const rect=next.getBoundingClientRect(),base=layer.current?.getBoundingClientRect(),viewport=window.visualViewport;
   if(!base||!tip.current){setPositionedStep(null);queue();return;}
   const area={left:viewport?.offsetLeft??0,top:viewport?.offsetTop??0,width:viewport?.width??innerWidth,height:viewport?.height??innerHeight};
   if(parent!==document.body){
    const bounds=parent.getBoundingClientRect(),right=Math.min(area.left+area.width,bounds.left+parent.clientLeft+parent.clientWidth),bottom=Math.min(area.top+area.height,bounds.top+parent.clientTop+parent.clientHeight);
    area.left=Math.max(area.left,bounds.left+parent.clientLeft);area.top=Math.max(area.top,bounds.top+parent.clientTop);area.width=right-area.left;area.height=bottom-area.top;
   }
   const place=guidePlacement(rect,area,{width:336,height:Math.ceil(Math.max(tip.current.getBoundingClientRect().height,tip.current.scrollHeight+2))});
   const node=layer.current!;
   node.style.setProperty('--guide-x',`${rect.left-base.left-5}px`);node.style.setProperty('--guide-y',`${rect.top-base.top-5}px`);
   node.style.setProperty('--guide-w',`${rect.width+10}px`);node.style.setProperty('--guide-h',`${rect.height+10}px`);
   tip.current.style.left=`${place.left-base.left}px`;tip.current.style.top=`${place.top-base.top}px`;tip.current.style.width=`${place.width}px`;tip.current.style.maxHeight=`${area.height-24}px`;
   setPositionedStep(tour.step);
   if(observed!==next){resize.disconnect();resize.observe(next);if(tip.current)resize.observe(tip.current);observed=next;}
   if(performance.now()<movingUntil)queue();
  };
  const click=(event:MouseEvent)=>{const node=event.target;if(!(node instanceof Node)||!target.current?.contains(node))return;if(tour.step===2)callbacks.current.finish();else if(tour.step===0&&tour.kind!=='training')callbacks.current.change(1);};
  const submit=(event:SubmitEvent)=>{if(event.target instanceof HTMLElement&&event.target.dataset.entryForm===config.form)callbacks.current.finish();};
  const input=()=>queue();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&target.current&&!(event.target instanceof HTMLSelectElement)){event.preventDefault();event.stopImmediatePropagation();callbacks.current.finish();}};
  const observer=new MutationObserver(mutations=>{
   if(!mutations.some(mutation=>mutation.attributeName!=='style'||mutation.target instanceof HTMLDialogElement))return;
   if(mutations.some(mutation=>mutation.target instanceof HTMLDialogElement)){movingUntil=performance.now()+400;}
   queue();
  });observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','aria-busy','data-selected','data-selected-period','data-surface-phase','data-closing','data-motion','data-sheet-expanded','style']});
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-chart-travel']});
  document.addEventListener('click',click,true);document.addEventListener('submit',submit,true);document.addEventListener('keydown',escape,true);document.addEventListener('input',input,true);document.addEventListener('scroll',queue,true);window.addEventListener('resize',queue);window.visualViewport?.addEventListener('resize',queue);window.visualViewport?.addEventListener('scroll',queue);
  queue();
  // 目标长期未就绪不占住页面；失败与重试仍由原任务处理。
  const timeout=setTimeout(()=>{if(!shown.current)callbacks.current.finish();},8000);
  return()=>{disposed=true;clearTimeout(timeout);cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();document.removeEventListener('click',click,true);document.removeEventListener('submit',submit,true);document.removeEventListener('keydown',escape,true);document.removeEventListener('input',input,true);document.removeEventListener('scroll',queue,true);window.removeEventListener('resize',queue);window.visualViewport?.removeEventListener('resize',queue);window.visualViewport?.removeEventListener('scroll',queue);};
 },[config,tour.step,tour.kind]);
 if(!surface)return null;
 const step=tour.step,title=step===0?config.entry:step===1?preparingMeal?'添加这一餐':'填写记录':'确认后保存';
 const description=step===0?(tour.kind==='training'?'准备好训练时点这里。开始会创建真实训练；已有进度可继续，也可以先跳过。':'点高亮的录入或编辑入口，进入对应日期的记录。'):step===1?preparingMeal?'点“添加一餐”，打开本餐填写区。':config.fields:config.save;
 return createPortal(<div ref={layer} className={styles.layer} data-record-guidance={tour.kind} data-step={step+1} data-ready={ready}>
  <div className={styles.spotlight} aria-hidden="true"/>
  <section ref={tip} className={styles.tip} aria-label={`${config.label}操作引导`}>
   <div className={styles.top}><ol aria-label="引导进度">{[1,2,3].map(number=><li key={number} aria-current={number===step+1?'step':undefined} data-complete={number<step+1}>{number}</li>)}</ol><button type="button" onClick={end}>跳过引导</button></div>
   <div aria-live="polite"><h2>{title}</h2><p>{description}</p></div>
   <div className={styles.actions}><span>{step+1} / 3</span><button type="button" onClick={()=>{if(step===2)end();else if(step===0||preparingMeal){if(tour.kind==='training'){end();return;}target.current?.click();}else change(2);}}>{step===2?'完成引导':step===0?tour.kind==='training'?'先不训练':'去填写':preparingMeal?'添加一餐':'下一步'}</button></div>
  </section>
 </div>,surface);
}
