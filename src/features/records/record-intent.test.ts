import assert from 'node:assert/strict';
import {test} from 'node:test';
import {recordOpenIntent,repeatedRecordTask} from '../../components/record-intent';

test('普通日期只查看；编辑必须显式指定，不接受重复或未知意图',()=>{
  const date='2026-11-07';
  assert.equal(recordOpenIntent({date}),'view');
  assert.equal(recordOpenIntent({date,intent:'edit'}),'edit');
  for(const intent of ['create','delete','EDIT',['edit'],['view','edit']]){
    assert.equal(recordOpenIntent({date,intent}),'view');
  }
});

test('直接录入保持兼容，优先于日期编辑；趋势链接始终只查看',()=>{
  const params={date:'2026-11-07',intent:'edit'};
  assert.equal(recordOpenIntent(params,true),'create');
  assert.equal(recordOpenIntent(params,false,true),'view');
  assert.equal(recordOpenIntent({date:params.date},true),'create');
});

test('无效、重复和缺失日期不能打开写入任务',()=>{
  for(const date of [undefined,'','2026-02-30','2026-13-01','07/11/2026',['2026-11-07'],['2026-11-07','2026-11-08']]){
    assert.equal(recordOpenIntent({date,intent:'edit'}),'view');
    assert.equal(recordOpenIntent({date,intent:'edit'},true),'view');
  }
});

test('同日期任务关闭后可重复打开；查询顺序不制造重复导航',()=>{
  const current='https://example.test/dashboard/meals?date=2026-11-07&intent=edit';
  assert.deepEqual(repeatedRecordTask('?intent=edit&date=2026-11-07',current),{path:'/dashboard/meals',date:'2026-11-07',intent:'edit'});
  const view='https://example.test/dashboard/energy?date=2026-11-07';
  assert.equal(repeatedRecordTask(view,view)?.intent,'view');
});

test('重复快捷录入保持创建和晨晚意图，不能拦截趋势或其他导航',()=>{
  for(const path of ['meals','energy']){
    const url=`https://example.test/dashboard/${path}?date=2026-11-07&entry=1`;
    assert.equal(repeatedRecordTask(url,url)?.intent,'create');
  }
  const body='https://example.test/dashboard/measurements?date=2026-11-07&entry=evening';
  assert.deepEqual(repeatedRecordTask(body,body),{path:'/dashboard/measurements',date:'2026-11-07',intent:'create',period:'evening'});
  for(const url of ['https://example.test/dashboard/meals?date=2026-11-07&view=trend','https://example.test/dashboard/account?date=2026-11-07','https://example.test/dashboard/meals?date=2026-02-30','https://example.test/dashboard/meals?date=2026-11-07&date=2026-11-08'])assert.equal(repeatedRecordTask(url,url),null);
});

test('跨日、跨页面、跨来源、锚点及其他查询变化继续正常导航',()=>{
  const current='https://example.test/dashboard/meals?date=2026-11-07&intent=edit';
  for(const href of ['?date=2026-11-06&intent=edit','/dashboard/energy?date=2026-11-07&intent=edit','https://external.test/dashboard/meals?date=2026-11-07&intent=edit','#photo','?date=2026-11-07&intent=view','?date=2026-11-07&intent=edit&filter=x'])assert.equal(repeatedRecordTask(href,current),null);
});
