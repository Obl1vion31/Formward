import test from 'node:test';
import assert from 'node:assert/strict';
import {createChartFlights,chartModelMatches,chartRectMatches} from '../components/chart-flight.ts';
import {metricTrendModel,trendRangeKey,trendKey} from '../components/metric-trend-model.ts';

const model=metricTrendModel('intake',[{date:'2026-11-01',value:1200}]);
const rect={left:200,top:240,width:80,height:40};

test('准备阶段不隐藏原图，浮层可见后才交出目标，过期回调不得再次显示',()=>{
 const owner=createChartFlights(()=>{}),flight=owner.start(model,rect,'back'),events=[];
 flight.node={style:{visibility:'hidden'}};
 const target={setAttribute(){assert.equal(flight.node.style.visibility,'visible');events.push('hide-target');},removeAttribute(){events.push('restore-target');}};
 assert.equal(flight.hidden,undefined);assert.equal(flight.node.style.visibility,'hidden');
 assert.equal(owner.reveal(flight.id,target),true);
 assert.deepEqual(events,['hide-target']);
 owner.clear(flight.id);
 assert.equal(flight.node.style.visibility,'hidden');assert.deepEqual(events,['hide-target','restore-target']);
 assert.equal(owner.reveal(flight.id,target),false);assert.equal(flight.node.style.visibility,'hidden');
});

test('按钮、popstate和路由提交重复准备返回，只创建一个回程图层',()=>{
 const published=[],owner=createChartFlights(f=>published.push(f?.id??null));
 try{
  owner.start(model,rect,'forward');
  assert.equal(owner.beginReturn({model,rect}),true);
  const id=owner.active.id;
  assert.equal(owner.beginReturn({model,rect}),false);
  assert.equal(owner.beginReturn({model,rect}),false);
  assert.equal(owner.active.id,id);assert.equal(published.filter(id=>id!==null).length,2);
 }finally{owner.clear();}
});
test('取消填充动画前先隐藏旧图层，恢复目标后再发布卸载',()=>{
 const events=[],owner=createChartFlights(f=>{if(!f)events.push('unmount');}),flight=owner.start(model,rect,'forward');
 flight.node={style:{visibility:'visible'}};
 flight.hidden={removeAttribute(name){assert.equal(name,'data-chart-travelling');events.push('restore-target');}};
 flight.animation={cancel(){assert.equal(flight.node.style.visibility,'hidden');events.push('cancel-hidden');}};
 flight.decorations=[{cancel(){assert.equal(flight.node.style.visibility,'hidden');events.push('cancel-details-hidden');}}];
 assert.equal(owner.clear(flight.id),true);
 assert.deepEqual(events,['cancel-hidden','cancel-details-hidden','restore-target','unmount']);assert.equal(owner.active,null);
});
test('旧完成回调和超时不得清掉已经反向的新图层',()=>{
 const owner=createChartFlights(()=>{}),outbound=owner.start(model,rect,'forward');
 try{
  owner.beginReturn({model,rect});const incoming=owner.active;
  incoming.node={style:{visibility:'visible'}};
  assert.equal(owner.clear(outbound.id),false);
  assert.equal(owner.active,incoming);assert.equal(incoming.node.style.visibility,'visible');
 }finally{owner.clear();}
});
test('无有效目标的返回也保持幂等，下一次正常进入可重新开始',()=>{
 const owner=createChartFlights(()=>{});
 try{
  owner.start(model,rect,'forward');owner.beginReturn(null);
  assert.equal(owner.active,null);assert.equal(owner.beginReturn({model,rect}),false);
  owner.start(model,rect,'forward');assert.equal(owner.returning,false);
  assert.equal(owner.beginReturn({model,rect}),true);assert.equal(owner.active.direction,'back');
 }finally{owner.clear();}
});
test('配对按指标和完整日期轴识别，换区间或指标不会误配',()=>{
 const otherDates=metricTrendModel('intake',[{date:'2026-11-02',value:1200}]);
 const weight=metricTrendModel('morning-weight',model.points);
 assert.notEqual(trendRangeKey(model),trendRangeKey(otherDates));assert.notEqual(trendRangeKey(model),trendRangeKey(weight));
 assert.equal(trendRangeKey(model),trendRangeKey({...model,points:[{date:'2026-11-01',value:1300}]}));
});

// 真实目标的身份独立于本次渲染中的调用顺序；不使用计时器猜测数据何时到达。
function targetFixture(){
 const svg={setAttribute(){},removeAttribute(){}};
 return {svg,container:{contains(node){return node===svg;},querySelectorAll(){return [svg];}}};
}
function readyFlight(owner,svg){
 const flight=owner.start(model,rect,'forward');flight.node={style:{visibility:'hidden'}};
 owner.reveal(flight.id,svg);flight.ready=true;
 return flight;
}
test('普通首次数据和主动更换区间保持各自的首次绘制登记',()=>{
 const owner=createChartFlights(()=>{}),{container}=targetFixture();
 assert.equal(owner.claimEntry('/dashboard/meals:2026-11-01:2026-11-07:grams',container),true);
 assert.equal(owner.claimEntry('/dashboard/meals:2026-11-01:2026-11-07:grams',container),false);
 assert.equal(owner.claimEntry('/dashboard/meals:2026-10-09:2026-11-07:grams',container),true);
});
test('快数据先登记实际viewKey，成功图形交接后不再首次生长',()=>{
 const owner=createChartFlights(()=>{}),{svg,container}=targetFixture(),key='/dashboard/meals:2026-11-01:2026-11-07:grams';
 try{
  const flight=readyFlight(owner,svg);
  assert.equal(owner.claimEntry(key,container),false,'共享移动期间不能再播放柱形生长');
  flight.arrived=true;assert.equal(owner.complete(flight.id),true);
  assert.equal(owner.active,null);
  const later=targetFixture();assert.equal(owner.claimEntry(key,later.container),false,'已完成的同视图回访不重播');
 }finally{owner.clear();}
});
test('慢数据在300ms飞行后才接管，子图先完成也不触发父图第二次入场',()=>{
 const owner=createChartFlights(()=>{}),{svg,container}=targetFixture(),key='/dashboard/energy:2026-11-01:2026-11-07';
 try{
  const flight=readyFlight(owner,svg);flight.arrived=true;
  assert.equal(owner.complete(flight.id),true,'真实子图的layout阶段先完成共享交接');
  assert.equal(owner.claimEntry(key,container),false,'父图稍后取得实际viewKey时识别已交接SVG');
  assert.equal(owner.claimEntry(key,targetFixture().container),false);
  assert.equal(owner.claimEntry('/dashboard/energy:2026-10-09:2026-11-07',targetFixture().container),true,'其他区间仍有正常首次绘制');
  assert.equal(owner.claimEntry('/dashboard/energy:2026-10-01:2026-11-07',container),true,'迟到交接凭据只消费一次，同一DOM的其他视图不误判');
 }finally{owner.clear();}
});
test('飞行取消不把待消费视图记作已完成，迟到回调不能复活消费',()=>{
 const owner=createChartFlights(()=>{}),{svg,container}=targetFixture(),key='/dashboard/measurements:weightKg:false:2026-11-01:2026-11-07';
 try{
  const flight=readyFlight(owner,svg);assert.equal(owner.claimEntry(key,container),false);
  owner.clear(flight.id);assert.equal(owner.complete(flight.id),false);
  assert.equal(owner.claimEntry(key,targetFixture().container),true,'取消之后的普通首次仍应播放');
 }finally{owner.clear();}
});
test('共享目标必须为同一指标、完整日期轴和真实数据，几何容差不超过1px',()=>{
 const expected={rangeKey:trendRangeKey(model),modelKey:trendKey(model)};
 assert.equal(chartModelMatches(expected,model),true);
 for(const next of [metricTrendModel('energy',model.points),metricTrendModel('intake',[{date:'2026-11-02',value:1200}]),metricTrendModel('intake',[{date:'2026-11-01',value:1201}]),metricTrendModel('intake',[{date:'2026-11-01',value:null}])])assert.equal(chartModelMatches(expected,next),false);
 assert.equal(chartRectMatches(rect,{...rect,left:rect.left+1}),true);
 for(const field of ['left','top','width','height'])assert.equal(chartRectMatches(rect,{...rect,[field]:rect[field]+2}),false);
});
test('错误或卸载移走真实目标后，即使动画完成也不得消费首次绘制',()=>{
 const owner=createChartFlights(()=>{}),{svg,container}=targetFixture(),key='/dashboard/energy:2026-11-01:2026-11-07';
 try{
  const flight=readyFlight(owner,svg);assert.equal(owner.claimEntry(key,container),false);
  svg.isConnected=false;flight.arrived=true;
  assert.equal(owner.complete(flight.id),false);assert.equal(owner.active,null);
  assert.equal(owner.claimEntry(key,targetFixture().container),true);
 }finally{owner.clear();}
});
test('只有ready和arrived都成立才消费，同一页面其他图不借用交接身份',()=>{
 const owner=createChartFlights(()=>{}),{svg,container}=targetFixture(),other=targetFixture(),key='/dashboard/meals:2026-11-01:2026-11-07:grams';
 try{
  const flight=readyFlight(owner,svg);
  assert.equal(owner.complete(flight.id),false,'尚未到达不能提交');
  assert.equal(owner.claimEntry('/dashboard/another-chart',other.container),true,'不相关图仍是普通首次');
  flight.ready=false;flight.arrived=true;assert.equal(owner.complete(flight.id),false,'只有骨架到达不能提交');
  owner.clear();assert.equal(owner.claimEntry(key,container),true,'无成功交接不能留下元素身份');
 }finally{owner.clear();}
});

test('无配对的新图在旧飞行尚未清理时仍是正常首次，不被全局飞行标志吞掉',()=>{
 const owner=createChartFlights(()=>{}),old=targetFixture(),newChart=targetFixture();
 try{
  readyFlight(owner,old.svg);
  assert.equal(owner.claimEntry('/dashboard/another-cold-chart',newChart.container),true);
 }finally{owner.clear();}
});


test('8秒仅释放移动合成层，真实来源留在同次导航，迟到真实图按SVG接管且不再生长',context=>{
 context.mock.timers.enable({apis:['setTimeout']});
 const published=[],owner=createChartFlights((flight,reason)=>published.push({flight:flight?.id??null,reason})),loading=targetFixture(),real=targetFixture(),key='/dashboard/meals:2026-11-01:2026-11-07:grams';
 try{
  const flight=owner.start(model,rect,'forward');flight.node={style:{visibility:'hidden'}};flight.destination={...rect};owner.reveal(flight.id,loading.svg);flight.arrived=true;
  context.mock.timers.tick(8001);
  assert.equal(owner.active,null);assert.equal(flight.node.style.visibility,'hidden');
  assert.deepEqual(owner.handoff,{id:flight.id,model,destination:rect});
  assert.equal(published.at(-1).reason,'timeout');
  assert(!('node' in owner.handoff));assert(!('animation' in owner.handoff));assert(!('hidden' in owner.handoff));
  context.mock.timers.tick(60000);assert.equal(owner.active,null,'继续慢读不复活或延长移动层');
  assert.equal(owner.acceptHandoff(flight.id,{element:real.svg,model,rect}),true);
  assert.equal(owner.handoff,null);assert.equal(published.at(-1).reason,'complete');
  assert.equal(owner.claimEntry(key,real.container),false,'真实SVG先完成静态交接，父图实际viewKey不再首次生长');
  assert.equal(owner.claimEntry('/dashboard/meals:another-range',targetFixture().container),true);
  assert.equal(owner.complete(flight.id),false,'旧移动完成回调不能复活交接');
 }finally{owner.clear();}
});

test('超时前尚无目标时，之后必须先由同尺寸外壳落位；普通冷真实图不误消费',context=>{
 context.mock.timers.enable({apis:['setTimeout']});
 const owner=createChartFlights(()=>{}),loading=targetFixture(),real=targetFixture();
 try{
  let flight=owner.start(model,rect,'forward');context.mock.timers.tick(8001);
  assert.equal(owner.handoff.destination,undefined);
  assert.equal(owner.acceptHandoff(flight.id,{element:loading.svg,model,rect,skeleton:true}),true);
  assert.deepEqual(owner.handoff.destination,rect);
  assert.equal(owner.acceptHandoff(flight.id,{element:real.svg,model,rect}),true);
  assert.equal(owner.claimEntry('late-shell-view',real.container),false);
  flight=owner.start(model,rect,'forward');context.mock.timers.tick(8001);
  assert.equal(owner.acceptHandoff(flight.id,{element:real.svg,model,rect}),false);
  assert.equal(owner.claimEntry('ordinary-cold-without-shell',real.container),true);
 }finally{owner.clear();}
});

test('超时后取消、失败、换页和resize都可清理纯来源，不为后来普通首次登记完成',()=>{
 for(const reason of ['cancel','failure','route','resize']){
  const owner=createChartFlights(()=>{}),real=targetFixture(),flight=owner.start(model,rect,'forward');flight.destination={...rect};
  try{
   assert.equal(owner.expire(flight.id),true);
   assert.equal(owner.clear(),true,reason+'必须能清理已经没有active图层的来源');
   assert.equal(owner.handoff,null);assert.equal(owner.acceptHandoff(flight.id,{element:real.svg,model,rect}),false);
   assert.equal(owner.claimEntry('cold-after-'+reason,real.container),true);
  }finally{owner.clear();}
 }
});

test('迟到数据、日期、几何或真实目标失配时不借用超时来源；旧编号不能清理新导航',()=>{
 const variants=[{model:metricTrendModel('intake',[{date:'2026-11-02',value:1200}])},{model:metricTrendModel('intake',[{date:'2026-11-01',value:1201}])},{rect:{...rect,left:rect.left+2}},{disconnected:true}];
 for(const [index,variant] of variants.entries()){
  const owner=createChartFlights(()=>{}),real=targetFixture(),flight=owner.start(model,rect,'forward');flight.destination={...rect};
  try{
   owner.expire(flight.id);if(variant.disconnected)real.svg.isConnected=false;
   assert.equal(owner.acceptHandoff(flight.id,{element:real.svg,model:variant.model??model,rect:variant.rect??rect}),false);
   assert.equal(owner.handoff,null);assert.equal(owner.claimEntry('mismatch-'+index,real.container),true);
  }finally{owner.clear();}
 }
 const owner=createChartFlights(()=>{}),old=owner.start(model,rect,'forward');owner.expire(old.id);
 try{
  const next=owner.start(metricTrendModel('energy',model.points),rect,'forward');
  assert.equal(owner.handoff,null);assert.equal(owner.clear(old.id),false);assert.equal(owner.expire(old.id),false);assert.equal(owner.active,next);
 }finally{owner.clear();}
});

test('数据已就绪但移动动画超时，以真实目标结束；回程超时不留下前进来源',()=>{
 const owner=createChartFlights(()=>{}),real=targetFixture(),key='ready-before-layer-timeout';
 try{
  let flight=readyFlight(owner,real.svg);flight.destination={...rect};assert.equal(owner.claimEntry(key,real.container),false);
  assert.equal(owner.expire(flight.id),true);assert.equal(owner.active,null);assert.equal(owner.handoff,null);assert.equal(owner.claimEntry(key,targetFixture().container),false);
  flight=owner.start(model,rect,'back');assert.equal(owner.expire(flight.id),true);assert.equal(owner.handoff,null);
  assert.equal(owner.claimEntry('cold-after-back-timeout',real.container),true);
 }finally{owner.clear();}
});
