import test from 'node:test';
import assert from 'node:assert/strict';
import {createChartFlights} from '../components/chart-flight.ts';
import {metricTrendModel,trendRangeKey} from '../components/metric-trend-model.ts';

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
