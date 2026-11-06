type Box={left:number;top:number;width:number;height:number};
const origins=new WeakMap<HTMLElement,Box>(),animations=new WeakMap<HTMLElement,Animation>();
let pending:Box|null=null;
export function rememberSurfaceOrigin(element:Element){const r=element.getBoundingClientRect();if(r.width&&r.height)pending={left:r.left,top:r.top,width:r.width,height:r.height};}
export function animateSurface(node:HTMLElement,direction:'open'|'close',source?:Element|null){
 const prior=animations.get(node),style=getComputedStyle(node),current=prior?{transform:style.transform,clipPath:style.clipPath,opacity:style.opacity}:null;
 prior?.cancel();node.style.animation='none';
 if(direction==='open'&&!origins.has(node)){
  const r=pending??source?.getBoundingClientRect();pending=null;
  const target=node.getBoundingClientRect();origins.set(node,r&&r.width?{left:r.left,top:r.top,width:r.width,height:r.height}:{left:target.left+target.width/2-24,top:target.bottom-44,width:48,height:44});
 }
 const r=node.getBoundingClientRect(),o=origins.get(node)??r;
 const x=Math.max(0,Math.min(r.width-44,o.left-r.left)),y=Math.max(0,Math.min(r.height-44,o.top-r.top));
 const folded={transform:`translate(${o.left-r.left-x}px,${o.top-r.top-y}px)`,clipPath:`inset(${y}px ${Math.max(0,r.width-x-44)}px ${Math.max(0,r.height-y-44)}px ${x}px round 22px)`,opacity:'.6'};
 const full={transform:'translate(0px,0px)',clipPath:'inset(0px 0px 0px 0px round 0px)',opacity:'1'};
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||typeof node.animate!=='function')return Promise.resolve();
 const animation=node.animate([current??(direction==='open'?folded:full),direction==='open'?full:folded],{duration:direction==='open'?360:240,easing:'cubic-bezier(.18,.85,.22,1)',fill:'forwards'});animations.set(node,animation);
 return animation.finished.then(()=>{if(animations.get(node)===animation){animation.cancel();animations.delete(node);}}).catch(()=>{});
}
