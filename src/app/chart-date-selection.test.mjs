import test from 'node:test';
import assert from 'node:assert/strict';
import {updateChartDateChoice} from '../components/use-chart-date-selection.ts';

const dates=['2026-11-01','2026-11-02','2026-11-03'],range=dates.join('|')+':';
const apply=(choice,action)=>updateChartDateChoice(choice,action,dates,range);

test('鼠标点击日期后，移过其他日期和离开整个面板仍保持选中',()=>{
 let choice=apply(null,{type:'preview',date:dates[0]});
 choice=apply(choice,{type:'select',date:dates[0],origin:'click'});
 assert.equal(choice.origin,'click');
 assert.equal(apply(choice,{type:'preview',date:dates[2]}),choice);
 assert.equal(apply(choice,{type:'leave'}),choice);
 assert.equal(apply(choice,{type:'select',date:dates[1],origin:'click'}).date,dates[1]);
});
test('没有点击时悬停仍是临时预览，离开恢复默认',()=>{
 const preview=apply(null,{type:'preview',date:dates[0]});
 assert.equal(preview.origin,'pointer');assert.equal(apply(preview,{type:'leave'}),null);
});
test('Escape和区间／指标变化清除旧点击，不能把锁定带到另一区间',()=>{
 const clicked=apply(null,{type:'select',date:dates[0],origin:'click'});
 assert.equal(apply(clicked,{type:'release'}),null);
 const preview=updateChartDateChoice(clicked,{type:'preview',date:dates[1]},dates,range+'body-fat');
 assert.equal(preview.date,dates[1]);assert.equal(preview.origin,'pointer');
 assert.equal(updateChartDateChoice(clicked,{type:'leave'},dates.slice(1),range),null);
});
test('触屏、键盘可以接管点击选择，同日重复事件不制造新状态',()=>{
 const clicked=apply(null,{type:'select',date:dates[0],origin:'click'});
 const touch=apply(clicked,{type:'select',date:dates[1],origin:'touch'});
 assert.equal(apply(touch,{type:'leave'}),touch);
 const keyboard=apply(touch,{type:'select',date:dates[2],origin:'keyboard'});
 assert.equal(apply(keyboard,{type:'leave'}),keyboard);
 assert.equal(apply(keyboard,{type:'select',date:dates[2],origin:'keyboard'}),keyboard);
 assert.equal(apply(keyboard,{type:'select',date:'unknown',origin:'click'}),keyboard);
});
test('打开详情只清理悬停预览，返回时保留明确点击或触屏选择',()=>{
 for(const origin of ['click','touch']){const choice=apply(null,{type:'select',date:dates[1],origin});assert.equal(apply(choice,{type:'release-preview'}),choice);}
 for(const origin of ['pointer','initial','keyboard']){const choice=apply(null,{type:'select',date:dates[1],origin});assert.equal(apply(choice,{type:'release-preview'}),null);}
});
