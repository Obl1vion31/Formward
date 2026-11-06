export type SurfaceMode='sheet'|'drawer'|'anchored'|'center';
type Pose={transform:string;clipPath:string;opacity:string};
const origins=new WeakMap<HTMLElement,{x:number;y:number}>(),animations=new WeakMap<HTMLElement,Animation>();

/** 容器明确选择方向；按钮位置只属于本次锚定面板，不传给后续详情。 */
export async function animateSurface(node:HTMLElement,direction:'open'|'close',source?:Element|null,mode:SurfaceMode='anchored'):Promise<boolean>{
 const prior=animations.get(node),style=getComputedStyle(node);
 const current:Pose|undefined=prior?{transform:style.transform,clipPath:style.clipPath,opacity:style.opacity}:undefined;
 if(current)Object.assign(node.style,current);
 prior?.cancel();node.style.animation='none';node.dataset.surfaceMode=mode;node.dataset.surfacePhase=direction==='open'?'opening':'closing';
 const full:Pose={transform:'translate(0px,0px)',clipPath:'none',opacity:'1'};
 let folded:Pose;
 if(mode==='sheet')folded={transform:`translateY(${node.getBoundingClientRect().height+24}px)`,clipPath:'none',opacity:'1'};
 else if(mode==='drawer')folded={transform:'translateX(100%)',clipPath:'none',opacity:'1'};
 else if(mode==='center')folded={transform:'scale(.97)',clipPath:'none',opacity:'0'};
 else{
  const rect=node.getBoundingClientRect();
  if(direction==='open'&&!origins.has(node)){const r=source?.getBoundingClientRect();origins.set(node,{x:r?r.left+r.width/2:rect.right-24,y:r?r.top+r.height/2:rect.top});}
  const origin=origins.get(node)??{x:rect.right-24,y:rect.top};
  node.style.transformOrigin=`${Math.max(0,Math.min(rect.width,origin.x-rect.left))}px ${Math.max(0,Math.min(rect.height,origin.y-rect.top))}px`;
  folded={transform:`translateY(${origin.y<rect.top+rect.height/2?-10:10}px) scale(.94)`,clipPath:'none',opacity:'0'};
 }
 const end=direction==='open'?full:folded;
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||typeof node.animate!=='function'){Object.assign(node.style,end);node.dataset.surfacePhase=direction==='open'?'open':'closed';return true;}
 const animation=node.animate([current??(direction==='open'?folded:full),end],{duration:direction==='open'?300:210,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});animations.set(node,animation);
 try{await animation.finished;}catch{return false;}
 if(animations.get(node)!==animation)return false;
 // 先提交末态再撤销动画；退出容器在卸载前始终留在屏幕外。
 Object.assign(node.style,end);animation.cancel();animations.delete(node);node.dataset.surfacePhase=direction==='open'?'open':'closed';return true;
}
