import {workspacePages} from "./workspace-pages";

export type WorkspaceLocation={path:string;search:string};
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
  const animation=node.animate([from,{transform:"translateX(0px)",opacity:1}],{duration:200,easing:"cubic-bezier(.22,1,.36,1)",fill:"both"});
  active={id,node,animation};
  const finish=()=>{if(active?.id!==id)return;stop();};
  void animation.finished.then(finish,finish);
 }
 return {play,stop};
}
