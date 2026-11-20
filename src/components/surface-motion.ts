import { workspaceMotionTiming } from "./workspace-motion";

export type SurfaceMode='sheet'|'drawer'|'anchored'|'glass-menu'|'center'|'workspace-page';
type Pose={transform:string;clipPath:string;opacity:string};
const origins=new WeakMap<HTMLElement,{x:number;y:number}>(),animations=new WeakMap<HTMLElement,Animation>();

export function stopSurfaceMotion(node: HTMLElement) {
 const active=animations.get(node);
 animations.delete(node);
 active?.cancel();
}

/** 容器明确选择方向；按钮位置只属于本次锚定面板，不传给后续详情。 */
export async function animateSurface(node:HTMLElement,direction:'open'|'close',source?:Element|null,mode:SurfaceMode='anchored',duration?:number):Promise<boolean>{
 const prior=animations.get(node),style=getComputedStyle(node);
 const current:Pose|undefined=prior||direction==='close'?{transform:style.transform,clipPath:style.clipPath,opacity:style.opacity}:undefined;
 if(current)Object.assign(node.style,current);
 const timing=mode==='workspace-page'?workspaceMotionTiming:{duration:direction==='open'?300:210,easing:'cubic-bezier(.2,.8,.2,1)'};
 const durationMs=duration??timing.duration;
 stopSurfaceMotion(node);
 node.style.animation='none';
 node.style.setProperty('--surface-motion-duration',durationMs+'ms');
 node.dataset.surfaceMode=mode;
 node.dataset.surfacePhase=direction==='open'?'opening':'closing';
 const full:Pose={transform:'translate(0px,0px)',clipPath:'none',opacity:'1'};
 let folded:Pose;
 if(mode==='workspace-page')folded={transform:'translateX(16px)',clipPath:'none',opacity:direction==='open'?'.65':'0'};
 else if(mode==='sheet'||mode==='drawer'){
  // 测量无变换的静止几何，快速反向时不把当前位移重复算入退出距离。
  const savedTransform=node.style.transform;node.style.transform='none';const resting=node.getBoundingClientRect();node.style.transform=savedTransform;
  folded=mode==='sheet'?{transform:`translateY(${Math.max(resting.height,(globalThis.innerHeight||resting.bottom)-resting.top)+24}px)`,clipPath:'none',opacity:'1'}
   :{transform:`translateX(${Math.max(resting.width,(globalThis.innerWidth||resting.right)-resting.left)+24}px)`,clipPath:'none',opacity:'1'};
 }
 else if(mode==='glass-menu'){
  const rect=node.getBoundingClientRect(), button=source?.getBoundingClientRect();
  const width=Math.min(rect.width,button?.width??44),height=Math.min(rect.height,button?.height??44);
  const center=button?button.left+button.width/2:rect.right-width/2;
  const left=Math.max(0,Math.min(rect.width-width,center-rect.left-width/2));
  const fromAbove=!button||button.top<rect.top;
  const top=fromAbove?0:rect.height-height;
  full.clipPath=`inset(0px round ${style.borderTopLeftRadius})`;
  folded={
   transform:`translateY(${fromAbove?-8:8}px)`,
   clipPath:`inset(${top}px ${rect.width-left-width}px ${rect.height-top-height}px ${left}px round 999px)`,
   opacity:'.75',
  };
  if(current?.clipPath==='none')current.clipPath=full.clipPath;
 }
 else if(mode==='center')folded={transform:'scale(.97)',clipPath:'none',opacity:'0'};
 else{
  const rect=node.getBoundingClientRect();
  if(direction==='open'&&!origins.has(node)){const r=source?.getBoundingClientRect();origins.set(node,{x:r?r.left+r.width/2:rect.right-24,y:r?r.top+r.height/2:rect.top});}
  const origin=origins.get(node)??{x:rect.right-24,y:rect.top};
  node.style.transformOrigin=`${Math.max(0,Math.min(rect.width,origin.x-rect.left))}px ${Math.max(0,Math.min(rect.height,origin.y-rect.top))}px`;
  folded={transform:`translateY(${origin.y<rect.top+rect.height/2?-10:10}px) scale(.94)`,clipPath:'none',opacity:'0'};
 }
 const end=direction==='open'?full:folded;
 const resting=direction==='open'&&mode==='glass-menu'?{...end,clipPath:'none'}:end;
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||typeof node.animate!=='function'){Object.assign(node.style,resting);node.dataset.surfacePhase=direction==='open'?'open':'closed';return true;}
 const animation=node.animate([current??(direction==='open'?folded:full),end],{duration:durationMs,easing:timing.easing,fill:'forwards'});animations.set(node,animation);
 try{await animation.finished;}catch{return false;}
 if(animations.get(node)!==animation)return false;
 // 先提交末态再撤销动画；退出容器在卸载前始终留在屏幕外。
 Object.assign(node.style,resting);animation.cancel();animations.delete(node);node.dataset.surfacePhase=direction==='open'?'open':'closed';return true;
}
