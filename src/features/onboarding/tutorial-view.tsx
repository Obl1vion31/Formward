"use client";
import {LocalLoading} from "@/components/local-loading";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceReturn, workspaceReturnLabel } from "@/components/workspace-return";
import { LoadingLink } from "@/components/loading-link";
import { useMobileMode } from "@/components/use-mobile-mode";
import "./tutorial.css";

type Player = { render(options:{startText:string;backAction?:string;backText?:string}):string;bind(root:HTMLElement):void;dispose():void };
declare global { interface Window { FormwardTutorial?:Player;FORMWARD_TUTORIAL_MEDIA?:unknown } }
const pendingScripts=new Map<string,Promise<void>>();
function loadScript(src:string) {
  const existing=pendingScripts.get(src);if(existing)return existing;
  const promise=new Promise<void>((resolve,reject)=>{
    const script=document.createElement("script");let settled=false;
    const finish=(failed:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(failed){script.remove();pendingScripts.delete(src);reject(new Error("教程暂时没有加载成功"));}else resolve();};
    const timer=setTimeout(()=>finish(true),8000);script.src=src;script.async=true;script.onload=()=>finish(false);script.onerror=()=>finish(true);document.head.append(script);
  });
  pendingScripts.set(src,promise);return promise;
}
export function prepareTutorial(){
  return (async()=>{if(!window.FORMWARD_TUTORIAL_MEDIA)await loadScript("/tutorials/media-manifest.js");if(!window.FormwardTutorial)await loadScript("/tutorials/player.js");})();
}
function GuideFilm({topic,label}:{topic:"energy"|"photo"|"food-library";label:string}){
  const mobile=useMobileMode(),[open,setOpen]=useState(false);
  return <details className="tutorial-clip" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>观看操作演示</summary>
    {open&&<video controls muted playsInline preload="metadata" aria-label={label} data-guide-film={topic}
      src={"/tutorials/guidance-"+topic+"-"+(mobile?"mobile":"desktop")+".mp4"}/>}
  </details>;
}
export function TutorialView({startText:customStartText,backText,onStart,onBack,busy=false}:{startText?:string;backText?:string;onStart?:()=>void;onBack?:()=>void;busy?:boolean}) {
  const returns=useWorkspaceReturn();
  const startText=customStartText??workspaceReturnLabel(returns?.visit,"/dashboard");
  const ref=useRef<HTMLDivElement>(null),handlers=useRef({onStart,onBack,back:returns?.back}),router=useRouter();
  const [error,setError]=useState(false),[attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState(false);
  useEffect(()=>{handlers.current={onStart,onBack,back:returns?.back};},[onStart,onBack,returns?.back]);
  useEffect(()=>{
    const host=ref.current!;let live=true,mounted:Player|null=null;
    const action=(event:MouseEvent)=>{
      const b=event.target instanceof Element?event.target.closest<HTMLButtonElement>("[data-action]"):null;if(!b||b.disabled)return;
      if(b.dataset.action==="start"){if(handlers.current.onStart)handlers.current.onStart();else if(handlers.current.back)void handlers.current.back("/dashboard");else router.push("/dashboard");}
      if(b.dataset.action==="back")handlers.current.onBack?.();
    };
    host.addEventListener("click",action);
    void (async()=>{
      try{
        await prepareTutorial();
        if(!live)return;
        const player=window.FormwardTutorial!;
        host.innerHTML=player.render({startText,...(backText?{backText,backAction:"back"}:{})});
        player.bind(host);mounted=player;setLoaded(true);setError(false);
      }catch{if(live){setError(true);setLoaded(false);}}
    })();
    return()=>{live=false;host.removeEventListener("click",action);mounted?.dispose();host.replaceChildren();};
  },[startText,backText,attempt,router]);
  useEffect(()=>{ref.current?.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button=>{button.disabled=busy;button.setAttribute("aria-busy",String(busy));});},[busy,loaded]);
  return <div className="onboarding-tutorial">
    <section className="tutorial-faq" aria-labelledby="tutorial-questions">
      <h2 id="tutorial-questions">常见问题</h2>
      <details><summary>怎么估算全天消耗？</summary><p>在总览或消耗页点「估算今天的消耗」，选当天活动量，核对预计全天消耗并保存。估算依据会注明使用的实测和公式。</p><LoadingLink returnScope="workspace" href="/dashboard/energy">打开消耗页</LoadingLink><GuideFilm topic="energy" label="估算全天消耗演示"/></details>
      <details><summary>为什么今天还没收支？</summary><p>有已知热量的饮食、当天餐次已勾「已记全」，且保存了全天消耗后，总览才显示当天收支。设备的「今日累计」会随当天活动变化。</p><LoadingLink returnScope="workspace" href="/dashboard/meals">打开饮食页</LoadingLink></details>
      <details><summary>AI 草稿怎么保存？</summary><p>饮食拍照后点「发给助手」，在新对话里补充信息、核对餐次，再确认保存。用外部 AI 提交时，从原审核链接核对和保存。</p><LoadingLink returnScope="workspace" href="/dashboard/meals">打开饮食页</LoadingLink><GuideFilm topic="photo" label="拍照并保存餐次演示"/></details>
      <details><summary>怎么从食材库记一餐？</summary><p>先点「记一餐」，再选「从食材库添加」。核对规格，填实际份量，点「加入本餐」后和其他食物一起保存。</p><LoadingLink returnScope="workspace" href="/dashboard/meals">打开饮食页</LoadingLink><GuideFilm topic="food-library" label="选食材规格和份量演示"/></details>
    </section>
    <div ref={ref}/>
    {!loaded&&<section className="tutorial-fallback"><h1>使用说明</h1>
      {error?<p role="alert">视频入口暂时未能加载，可以看文字说明或重试。</p>:<LocalLoading label="正在准备视频…"/>}
      <details open={error||undefined}><summary>文字版</summary><ol>
        <li>饮食：点「记一餐」，从食材库选规格和份量，或自己填写。当天餐次核对后，在列表末尾勾「已记全」。</li>
        <li>身体：先选晨间或晚间，晨间必须空腹；体重、体脂只填知道的部分，点击“保存录入”。缺测保持空白，只记录实测值。</li>
        <li>消耗：填写静息和活动，或只填全天总数。已包含在合计中的运动不再额外增加。</li>
        <li>补录：最近日期直接点“补录”；更早从“查看全部”选择日期并点“查看”，保存前核对日期。保存后展开餐次查看食物，点食物查看营养和依据。</li>
        <li>AI录入：先从“助手 → 常用功能 → AI接入”连接外部AI，打开确认链接，检查修改后点“确认保存”。站内聊天按账号开放，站内预览可在对话里确认。</li>
      </ol></details>
      {error&&<button className="quiet" onClick={()=>{setError(false);setAttempt(n=>n+1);}}>重新加载教程</button>}
      {onBack&&<button className="quiet" disabled={busy} onClick={onBack}>{backText}</button>}
      <button className="primary" disabled={busy} onClick={()=>onStart?onStart():returns?void returns.back("/dashboard"):router.push("/dashboard")}>{startText}</button>
    </section>}
  </div>;
}
