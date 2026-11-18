import assert from 'node:assert/strict';
import {test} from 'node:test';
import {animateWorkspaceScene,createWorkspaceMotion,workspaceMotionDirection} from '../components/workspace-motion.ts';
const route=(path,search='')=>({path,search});
const overview=route('/dashboard'),meals=route('/dashboard/meals'),energy=route('/dashboard/energy'),body=route('/dashboard/measurements');

test('五模块按真实顺序确定方向，日期、图形、录入和刷新不叠加',()=>{
 assert.equal(workspaceMotionDirection(overview,meals),1);
 assert.equal(workspaceMotionDirection(body,energy),-1);
 assert.equal(workspaceMotionDirection(route("/dashboard/training"),energy),1);
 assert.equal(workspaceMotionDirection(energy,route("/dashboard/training")),-1);
 assert.equal(workspaceMotionDirection(meals,overview),-1);
 assert.equal(workspaceMotionDirection(meals,route(meals.path,'from=2026-11-01')),0);
 for(const search of ['date=2026-11-06','entry=1','intent=edit','view=trend'])assert.equal(workspaceMotionDirection(overview,route(energy.path,search)),0);
 assert.equal(workspaceMotionDirection(route(meals.path,'view=trend'),overview),0);
 assert.equal(workspaceMotionDirection(overview,meals,true),0);
 assert.equal(workspaceMotionDirection(route('/dashboard/ai'),meals),0);
});

function host(){
 const attributes=new Map(),animations=[];
 return {attributes,animations,setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),animate:(frames,options)=>{
  let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const animation={frames,options,finished,playState:'running',cancel(){this.playState='idle';reject(new Error('cancelled'));},finish(){this.playState='finished';resolve();}};
  animations.push(animation);return animation;
 }};
}
test('快速反向续接当前姿态，旧完成回调不能结束新动画',async t=>{
 const node=host(),motion=createWorkspaceMotion();
 const oldStyle=globalThis.getComputedStyle;t.after(()=>{if(oldStyle)globalThis.getComputedStyle=oldStyle;else delete globalThis.getComputedStyle;});
 globalThis.getComputedStyle=()=>({transform:'matrix(1, 0, 0, 1, 7, 0)',opacity:'.82'});
 motion.play(node,1);const first=node.animations[0];
 motion.play(node,-1);const second=node.animations[1],owner=node.attributes.get('data-workspace-moving');
 assert.deepEqual(second.frames[0],{transform:'matrix(1, 0, 0, 1, 7, 0)',opacity:'.82'});
 first.finish();await Promise.resolve();assert.equal(node.attributes.get('data-workspace-moving'),owner);
 second.finish();await Promise.resolve();assert.equal(node.attributes.has('data-workspace-moving'),false);
});
test('减少动态效果、退出和不支持动画时保持内容可见并清理',async()=>{
 const node=host(),motion=createWorkspaceMotion();
 motion.play(node,1);motion.stop();await Promise.resolve();assert.equal(node.attributes.size,0);
 motion.play(node,-1,{reduced:true});assert.equal(node.animations.length,1);
 motion.play({...node,animate:undefined},1);assert.equal(node.attributes.size,0);
 motion.play(node,0);assert.equal(node.animations.length,1);
});

test("来回正文在同一个200毫秒时间轴内交接，中断取消对应两层", async t=>{
 t.mock.timers.enable({apis:["setTimeout"]});
 const window=globalThis.window;
 globalThis.window={setTimeout,clearTimeout};
 t.after(()=>{if(window)globalThis.window=window;else delete globalThis.window;});
 for(const direction of ["forward","back"]){
  const source=host(),destination=host(),events=[];
  const stop=animateWorkspaceScene(source,destination,direction,()=>events.push("reveal"),()=>events.push("finish"));
  const [exit]=source.animations,[enter]=destination.animations;
  assert.equal(enter.options.duration,200);
  assert.ok(exit.options.duration<enter.options.duration);
  assert.ok(enter.frames.every(frame=>frame.opacity===undefined));
  assert.equal(exit.frames.at(-1).transform,direction==="forward"?"translateX(-6px)":"translateX(6px)");
  assert.equal(enter.frames[0].transform,direction==="forward"?"translateX(8px)":"translateX(-8px)");
  if(direction==="forward"){
   t.mock.timers.tick(50);
   enter.finish();await Promise.resolve();assert.deepEqual(events,["reveal","finish"]);
  }else{
   stop();t.mock.timers.tick(200);await Promise.resolve();
   assert.deepEqual(events,[]);assert.equal(exit.playState,"idle");assert.equal(enter.playState,"idle");
  }
 }
});
