import assert from 'node:assert/strict';
import {afterEach,test,describe} from 'node:test';
import {cancelAppearanceReveal,revealAppearance} from '../components/appearance-motion.ts';

describe('外观转场的隔离环境',()=>{
const originals=Object.fromEntries(['document','matchMedia','innerWidth','innerHeight'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
function setup({supported=true,reduced=false}={}){
 const attributes=new Map(),calls=[],queued=[];let active;
 const root={setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),animate:(frames,options)=>{let finish;const finished=new Promise(resolve=>{finish=resolve;});const call={frames,options,finish,cancelled:0};calls.push(call);return{finished,cancel(){call.cancelled++;finish();}};}};
 const doc={documentElement:root};
 if(supported)doc.startViewTransition=update=>{let ready,fail,finish;const value={ready:new Promise((resolve,reject)=>{ready=resolve;fail=reject;}),finished:new Promise(resolve=>{finish=resolve;}),skipped:0,skipTransition(){value.skipped++;fail(Error('skipped'));finish();}};active=value;queued.push(()=>{update();ready();});value.update=update;value.finish=finish;value.fail=fail;return value;};
 Object.defineProperties(globalThis,{document:{value:doc,writable:true,configurable:true},matchMedia:{value:()=>({matches:reduced}),writable:true,configurable:true},innerWidth:{value:390,writable:true,configurable:true},innerHeight:{value:780,writable:true,configurable:true}});
 return{attributes,calls,queued,get active(){return active;},origin:{isConnected:true,getBoundingClientRect:()=>({left:286,top:10,width:44,height:44})}};
}
const tick=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
afterEach(()=>{cancelAppearanceReveal();for(const[key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});

test('减少动态效果与不支持的浏览器直接交接，不创建动画或遗留层',()=>{
 for(const options of[{supported:false},{reduced:true}]){const env=setup(options);let count=0;revealAppearance(()=>count++,env.origin);assert.equal(count,1);assert.equal(env.calls.length,0);assert.equal(env.attributes.size,0);}
});
test('新主题从按钮中心揭示至最远角，结束后清理浮层状态',async()=>{
 const env=setup();let updated=0;revealAppearance(()=>updated++,env.origin);assert.equal(updated,0);env.queued[0]();await tick();
 assert.equal(updated,1);assert.equal(env.calls.length,1);const call=env.calls[0];assert.equal(call.options.duration,450);assert.equal(call.options.pseudoElement,'::view-transition-new(root)');
 assert.equal(call.frames.clipPath[0],'circle(0px at 308px 32px)');assert.equal(call.frames.clipPath[1],'circle('+(Math.hypot(308,748)+1)+'px at 308px 32px)');
 call.finish();env.active.finish();await tick();assert.equal(env.attributes.size,0);assert.equal(call.cancelled,1);
});
test('连续反向点击采用最后选择，旧更新回调不得改回主题或启动动画',async()=>{
 const env=setup(),values=[];revealAppearance(()=>values.push('light'),env.origin);const old=env.active;revealAppearance(()=>values.push('dark'),env.origin);
 env.queued[0]();await tick();assert.deepEqual(values,['dark']);assert.ok(old.skipped>0);assert.equal(env.calls.length,0);assert.equal(env.attributes.size,0);
});
test('浏览器拒绝转场时保留已完成主题更新，清理状态并可继续使用',async()=>{
 const env=setup();let updated=0;revealAppearance(()=>updated++,env.origin);env.active.update();env.active.fail(Error('unavailable'));await tick();
 assert.equal(updated,1);assert.equal(env.attributes.size,0);assert.equal(env.calls.length,0);
});

});
