"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
export function TutorialView({startText="返回总览",backText,onStart,onBack,busy=false}:{startText?:string;backText?:string;onStart?:()=>void;onBack?:()=>void;busy?:boolean}) {
  const ref=useRef<HTMLDivElement>(null),handlers=useRef({onStart,onBack}),router=useRouter();
  const [error,setError]=useState(false),[attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState(false);
  useEffect(()=>{handlers.current={onStart,onBack};},[onStart,onBack]);
  useEffect(()=>{
    const host=ref.current!;let live=true,mounted:Player|null=null;
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
        player.bind(host);mounted=player;setLoaded(true);setError(false);
      }catch{if(live){setError(true);setLoaded(false);}}
    })();
    return()=>{live=false;host.removeEventListener("click",action);mounted?.dispose();host.replaceChildren();};
  },[startText,backText,attempt,router]);
  useEffect(()=>{ref.current?.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button=>button.disabled=busy);},[busy,loaded]);
  return <div className="onboarding-tutorial">
    <div ref={ref}/>
    {!loaded&&<section className="tutorial-fallback"><h1>使用说明</h1>
      <p role={error?"alert":"status"}>{error?"视频入口暂时未能加载，可以看文字说明或重试。":"正在准备视频，也可以先看文字说明。"}</p>
      <details open={error||undefined}><summary>文字版</summary><ol>
        <li>饮食：找到日期，点“录入”或“添加一餐”；选择食材库或自己填写，本次营养未知留空。一天记完后确认“已记全”。</li>
        <li>身体：先选晨间或晚间，晨间必须空腹；体重、体脂只填知道的部分，点击“保存录入”。估计有独立标识，不能当实测。</li>
        <li>消耗：填写静息和活动，或只填全天总数。已包含在合计中的运动不再额外增加。</li>
        <li>补录：最近日期直接点“补录”；更早从“查看全部”选择日期并点“查看”，保存前核对日期。</li>
        <li>AI录入：先从“工具 → AI接入”连接外部AI，打开确认链接，检查修改后点“确认保存”。站内聊天暂未开放。</li>
      </ol></details>
      {error&&<button className="quiet" onClick={()=>{setError(false);setAttempt(n=>n+1);}}>重新加载教程</button>}
      {onBack&&<button className="quiet" disabled={busy} onClick={onBack}>{backText}</button>}
      <button className="primary" disabled={busy} onClick={()=>onStart?onStart():router.push("/dashboard")}>{startText}</button>
    </section>}
  </div>;
}
