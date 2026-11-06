import test from 'node:test';
import assert from 'node:assert/strict';
import {animateSurface} from '../components/surface-motion.ts';

async function fixture(run,{reduced=false}={}){
 const previous=['matchMedia','getComputedStyle'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 const node={style:{transform:'none',clipPath:'none',opacity:'1'},dataset:{},getBoundingClientRect:()=>({left:12,top:72,right:372,bottom:472,width:360,height:400})};
 const calls=[];
 node.animate=(frames)=>{let resolve,reject,settled=false;const call={frames,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish(){settled=true;resolve();},cancel(){call.poseAtCancel={...node.style};if(!settled){settled=true;reject(new Error('interrupted'));}}};calls.push(call);return call;};
 Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:reduced})});
 Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:()=>({...node.style})});
 try{await run(node,calls);}finally{for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('底部详情忽略右上按钮坐标，只纵向展开',()=>fixture(async(node,calls)=>{
 const task=animateSurface(node,'open',{getBoundingClientRect:()=>({left:300,top:8,width:44,height:44})},'sheet');
 assert.equal(calls[0].frames[0].transform,'translateY(424px)');
 assert.equal(calls[0].frames[0].clipPath,'none');
 calls[0].finish();assert.equal(await task,true);assert.equal(node.dataset.surfaceMode,'sheet');
}));
test('关闭先保持屏幕外末态，再撤销动画，不闪回原位',()=>fixture(async(node,calls)=>{
 const task=animateSurface(node,'close',null,'sheet');calls[0].finish();
 assert.equal(await task,true);
 assert.equal(calls[0].poseAtCancel.transform,'translateY(424px)');
 assert.equal(node.style.transform,'translateY(424px)');assert.equal(node.dataset.surfacePhase,'closed');
}));
test('快速反向继承当前姿态，旧关闭不会被当作已完成',()=>fixture(async(node,calls)=>{
 const closing=animateSurface(node,'close',null,'sheet');node.style.transform='matrix(1, 0, 0, 1, 0, 180)';
 const opening=animateSurface(node,'open',null,'sheet');
 assert.equal(calls[1].frames[0].transform,'matrix(1, 0, 0, 1, 0, 180)');
 assert.equal(await closing,false);calls[1].finish();assert.equal(await opening,true);assert.equal(node.dataset.surfacePhase,'open');
}));
test('减少动态效果直接提交末态，不等待动画',()=>fixture(async(node,calls)=>{
 assert.equal(await animateSurface(node,'close',null,'drawer'),true);assert.equal(calls.length,0);assert.equal(node.style.transform,'translateX(100%)');
},{reduced:true}));
