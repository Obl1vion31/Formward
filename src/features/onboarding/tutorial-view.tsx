"use client";
import {LocalLoading} from "@/components/local-loading";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceReturn, workspaceReturnLabel } from "@/components/workspace-return";
import { LoadingLink } from "@/components/loading-link";
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
    <div ref={ref}/>
    {!loaded&&<section className="tutorial-fallback"><h1>使用说明</h1>
      {error?<p role="alert">使用说明暂时未能加载，可以看下面的文字步骤或重试。</p>:<LocalLoading label="正在准备使用说明…"/>}
      <details open={error||undefined}><summary>文字版</summary><ol>
        <li>总览和趋势页的「使用指引」带编号及前后步骤按钮，只在主动点击后打开。录入和核对按正常表单操作。</li>
        <li>饮食：点「记一餐」，从食材库选规格和份量，或自己填写。当天餐次核对后，在列表末尾勾「已记全」。</li>
        <li>身体：先选晨间或晚间，晨间必须空腹；体重、体脂只填知道的部分，点击“保存录入”。缺测保持空白，只记录实测值。</li>
        <li>消耗：选活动量估算全天消耗，或手动填写。已采用稳定的设备来源时，查看今日累计与同步结果。</li>
        <li>补录：最近日期直接点“补录”；更早从“查看全部”选择日期并点“查看”，保存前核对日期。保存后展开餐次查看食物，点食物查看营养和依据。</li>
        <li>拍照：从记餐面板选图并点「发给助手」，在新对话核对后确认保存。外部 AI 从提交返回的审核链接确认。</li>
      </ol></details>
      {error&&<button className="quiet" onClick={()=>{setError(false);setAttempt(n=>n+1);}}>重新加载教程</button>}
      {onBack&&<button className="quiet" disabled={busy} onClick={onBack}>{backText}</button>}
      <button className="primary" disabled={busy} onClick={()=>onStart?onStart():returns?void returns.back("/dashboard"):router.push("/dashboard")}>{startText}</button>
    </section>}
    <section className="tutorial-faq" aria-labelledby="tutorial-questions">
      <h2 id="tutorial-questions">常见问题</h2>
      <details><summary>怎么打开高光指引？</summary><p>在总览或趋势页点「使用指引」，按编号切换前后步骤。录入、选材和核对不再弹出高亮提示。</p><LoadingLink returnScope="workspace" href="/dashboard">打开总览</LoadingLink></details>
      <details><summary>怎么从食材库记一餐？</summary><p>点「记一餐」，选「从食材库添加」。打开对应规格后填写实际份量，点「加入本餐」。日期和食物核对完再保存。</p><LoadingLink returnScope="workspace" href="/dashboard/meals">打开饮食页</LoadingLink></details>
      <details><summary>拍照或 AI 草稿怎么保存？</summary><p>选图后核对餐别和日期，点「发给助手」。在小助手的新对话中补充份量，核对餐次，再点「确认保存」。外部 AI 提交的草稿从原审核链接确认。</p><LoadingLink returnScope="workspace" href="/dashboard/meals">打开饮食页</LoadingLink></details>
      <details><summary>什么时候要估算当天消耗？</summary><p>没有采用稳定的设备日消耗时，可点「估算今天的消耗」，选活动量并保存。缺资料就先补实测或个人资料。已采用设备时，在消耗页查看当日累计或同步状态。</p><LoadingLink returnScope="workspace" href="/dashboard/energy">打开消耗页</LoadingLink></details>
      <details><summary>为什么今天还没收支？</summary><p>总览需要已知摄入、当天餐次勾选「已记全」和完整的全天消耗。设备显示「今日累计」时，全天结果还在等待同步。</p><LoadingLink returnScope="workspace" href="/dashboard/meals">核对饮食记录</LoadingLink></details>
    </section>
  </div>;
}
