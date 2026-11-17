/** 只在本次转场内暂存真实SVG像素；不上传、不持久化，不替代可交互业务图表。 */
export async function prepareChartFlightBitmap(node:HTMLElement,destination:{width:number;height:number}){
 const drawings=[...node.querySelectorAll<SVGSVGElement>(':scope > svg')];
 const source=node.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
 if(!source.width||!source.height||!drawings.length)return;
 const width=Math.ceil(Math.max(source.width,destination.width)*ratio),height=Math.ceil(Math.max(source.height,destination.height)*ratio);
 const prepared=await Promise.all(drawings.map(async svg=>{
  const clone=svg.cloneNode(true) as SVGSVGElement,originals=[...svg.querySelectorAll<SVGElement>('rect,line,ellipse,path,circle')],copies=[...clone.querySelectorAll<SVGElement>('rect,line,ellipse,path,circle')];
  // 序列化图像没有页面主题及CSS上下文；逐形状带上实际语义色与笔触。
  originals.forEach((shape,index)=>{
   const style=getComputedStyle(shape),copy=copies[index];
   for(const key of ['fill','stroke','stroke-linecap','stroke-dasharray','opacity'])copy.style.setProperty(key,style.getPropertyValue(key));
   const stroke=parseFloat(style.strokeWidth);
   if(Number.isFinite(stroke))copy.style.strokeWidth=String(stroke*(style.vectorEffect==='non-scaling-stroke'?width/source.width:1))+'px';
  });
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',String(width));clone.setAttribute('height',String(height));clone.style.opacity='1';clone.style.visibility='visible';
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'})),image=new Image();
  try{
   image.src=url;
   const decoded=await Promise.race([image.decode().then(()=>true),new Promise<false>(resolve=>setTimeout(()=>resolve(false),150))]);
   if(!decoded||!node.isConnected)return null;
   const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)return null;
   canvas.width=width;canvas.height=height;context.drawImage(image,0,0,width,height);
   canvas.setAttribute('data-flight-bitmap','');if(svg.dataset.chartGlyphLayer)canvas.dataset.chartGlyphLayer=svg.dataset.chartGlyphLayer;
   canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
   return {svg,canvas};
  }catch{return null;}finally{URL.revokeObjectURL(url);}
 }));
 // 任一层失败时保持原SVG；取消后的异步结果不得写进另一场转场。
 if(!node.isConnected||prepared.some(value=>!value))return;
 for(const value of prepared){if(!value)return;value.svg.style.display='none';node.append(value.canvas);}
}
