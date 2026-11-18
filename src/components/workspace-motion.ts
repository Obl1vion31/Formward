import {workspacePages} from "./workspace-pages";

export type WorkspaceLocation={path:string;search:string};
export const workspaceMotionTiming = { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" };
export type WorkspaceScene={id:number;direction:"forward"|"back";sourcePath:string};

/** 目标先完整绘制在旧正文下方，旧画面淡出时自然露出目标。 */
export function animateWorkspaceScene(previous:HTMLElement,body:HTMLElement,direction:WorkspaceScene["direction"],reveal:()=>void,finish:()=>void){
 const sign=direction==="forward"?1:-1;
 const exit=previous.animate([
  {transform:"translateX(0)",opacity:1},
  {transform:`translateX(${-2*sign}px)`,opacity:1,offset:.23},
  {transform:`translateX(${-3*sign}px)`,opacity:.76,offset:.4},
  {transform:`translateX(${-4.5*sign}px)`,opacity:.48,offset:.56},
  {transform:`translateX(${-6*sign}px)`,opacity:0}
 ],{duration:120,fill:"both"});
 const enter=body.animate([
  {transform:`translateX(${8*sign}px)`},
  {transform:"translateX(0)"}
 ],{duration:200,easing:"cubic-bezier(.32,0,.25,1)",fill:"both"});
 // 等到真正可绘制的帧再计时，避免准备目标布局时消耗整段离场动画。
 for (const animation of [exit,enter]) {
  animation.pause();
  animation.currentTime=0;
  void animation.finished.catch(()=>{});
 }
 let previousFrame:number|undefined,elapsed=0,revealed=false;
 let frame=0;
 function step(now:number){
  if(previousFrame!==undefined)elapsed=Math.min(200,elapsed+Math.min(50,now-previousFrame));
  previousFrame=now;
  exit.currentTime=elapsed;
  enter.currentTime=elapsed;
  if(!revealed&&elapsed>=48){revealed=true;reveal();}
  if(elapsed<200)frame=requestAnimationFrame(step);
  else finish();
 }
 const visibilityChanged=()=>{if(document.hidden)finish();};
 document.addEventListener("visibilitychange",visibilityChanged);
 frame=requestAnimationFrame(step);
 return ()=>{
  document.removeEventListener("visibilitychange",visibilityChanged);
  cancelAnimationFrame(frame);
  exit.cancel();
  enter.cancel();
 };
}
/** 普通模块导航才移动正文；图形交接、录入与日期详情保留自己的容器。 */
export function workspaceMotionDirection(from:WorkspaceLocation,to:WorkspaceLocation,chartActive=false){
 const previous=workspacePages.findIndex(([href])=>href===from.path),next=workspacePages.findIndex(([href])=>href===to.path);
 const query=new URLSearchParams(to.search),oldQuery=new URLSearchParams(from.search);
 if(chartActive||previous<0||next<0||previous===next||query.has("entry")||query.has("date")||query.has("intent")||query.get("view")==="trend"||next===0&&oldQuery.get("view")==="trend")return 0;
 return next>previous?1:-1;
}

/** 持久正文节点仅拥有一个动画；过期的完成／取消回调不能影响新导航。 */
export function createWorkspaceMotion(){
 let active:{id:number;node:HTMLElement;animation:Animation}|null=null,sequence=0;
 function stop(){const old=active;active=null;sequence++;if(old){old.node.removeAttribute("data-workspace-moving");old.animation.cancel();}}
 function play(node:HTMLElement,direction:number,{distance=16,reduced=false}:{distance?:number;reduced?:boolean}={}){
  const pose=active?.node===node&&active.animation.playState==="running"?getComputedStyle(node):null;
  const from=pose?{transform:pose.transform,opacity:pose.opacity}:{transform:`translateX(${direction*distance}px)`,opacity:.65};
  stop();
  if(!direction||reduced||typeof node.animate!=="function")return;
  const id=++sequence;
  node.setAttribute("data-workspace-moving",String(id));
  const animation=node.animate([from,{transform:"translateX(0px)",opacity:1}],{...workspaceMotionTiming,fill:"both"});
  active={id,node,animation};
  const finish=()=>{if(active?.id!==id)return;stop();};
  void animation.finished.then(finish,finish);
 }
 return {play,stop};
}
