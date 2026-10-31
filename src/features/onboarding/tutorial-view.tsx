"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "./tutorial.css";

type Player = { render(options:{startText:string;backAction?:string;backText?:string}):string;bind(root:HTMLElement):void;dispose():void };
declare global { interface Window { FormwardTutorial?:Player;FORMWARD_TUTORIAL_MEDIA?:unknown } }
const pendingScripts=new Map<string,Promise<void>>();
function loadScript(src:string) {
  const existing=pendingScripts.get(src);if(existing)return existing;
  const promise=new Promise<void>((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.async=true;script.onload=()=>resolve();script.onerror=()=>{script.remove();pendingScripts.delete(src);reject(new Error("教程暂时没有加载成功"));};document.head.append(script);});
  pendingScripts.set(src,promise);return promise;
}
export function TutorialView({startText="返回总览",backText,onStart,onBack,busy=false}:{startText?:string;backText?:string;onStart?:()=>void;onBack?:()=>void;busy?:boolean}) {
  const ref=useRef<HTMLDivElement>(null),handlers=useRef({onStart,onBack}),router=useRouter();
  const [error,setError]=useState(false),[attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState(false);
  useEffect(()=>{handlers.current={onStart,onBack};},[onStart,onBack]);
  useEffect(()=>{
    const host=ref.current!;let live=true,mounted=false;
    const action=(event:MouseEvent)=>{
      const b=event.target instanceof Element?event.target.closest<HTMLButtonElement>("[data-action]"):null;if(!b||b.disabled)return;
      if(b.dataset.action==="start"){if(handlers.current.onStart)handlers.current.onStart();else router.push("/dashboard");}
      if(b.dataset.action==="back")handlers.current.onBack?.();
    };
    host.addEventListener("click",action);
    void (async()=>{
      try{
        if(!window.FORMWARD_TUTORIAL_MEDIA)await loadScript("/tutorials/media-manifest.js");
        if(!window.FormwardTutorial)await loadScript("/tutorials/player.js");
        if(!live)return;
        const player=window.FormwardTutorial!;
        host.innerHTML=player.render({startText,...(backText?{backText,backAction:"back"}:{})});
        player.bind(host);mounted=true;setLoaded(true);setError(false);
      }catch{if(live){setError(true);setLoaded(false);}}
    })();
    return()=>{live=false;host.removeEventListener("click",action);if(mounted)window.FormwardTutorial?.dispose();host.replaceChildren();};
  },[startText,backText,attempt,router]);
  useEffect(()=>{ref.current?.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button=>button.disabled=busy);},[busy,loaded]);
  return <div className="onboarding-tutorial">
    <div ref={ref}/>
    {!loaded&&!error&&<p className="tutorial-fallback" role="status">正在加载使用说明…</p>}
    {error&&<section className="tutorial-fallback"><h1>使用说明</h1><p role="alert">视频入口暂时未能加载，可以先看下面的步骤。</p><ol>
      <li>饮食：找到日期，点“录入”或“添加一餐”，填餐次和本次总营养；未知留空。一天记完后再确认“已记全”。</li>
      <li>身体：找到称重日期，晨间必须空腹；体重、体脂只填知道的部分。</li>
      <li>消耗：填写静息和活动，或只填全天总数。已包含在合计中的运动不再额外增加。</li>
      <li>补录：最近日期直接点“补录”；更早点“查看全部”和“查看日期”，保存前核对日期。</li>
      <li>AI录入：先从“工具 → AI接入”连接外部AI，打开返回的确认链接，检查修改后点“确认保存”。站内聊天暂未开放。</li>
    </ol><button className="quiet" onClick={()=>{setError(false);setAttempt(n=>n+1);}}>重新加载教程</button>{onBack&&<button className="quiet" disabled={busy} onClick={onBack}>{backText}</button>}<button className="primary" disabled={busy} onClick={()=>onStart?onStart():router.push("/dashboard")}>{startText}</button></section>}
  </div>;
}
