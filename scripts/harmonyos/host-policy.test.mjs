import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../apps/harmonyos/entry/src/main/ets/host/HostPolicy.ets', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { isTrustedPage, isExternalLink, isTrustedDownload, safeExportName, HostBridge, ORIGIN, IS_FIXTURE } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('正式包仅允许完整的 formward.top HTTPS 源，拒绝相似域名和权限混淆', () => {
  assert.equal(ORIGIN, 'https://formward.top');
  assert.equal(IS_FIXTURE, false);
  for (const url of [ORIGIN, ORIGIN+'/', ORIGIN+'/dashboard?day=2026-11-21#top', 'HTTPS://FORMWARD.TOP:443/dashboard']) assert.ok(isTrustedPage(url),url);
  for (const url of ['http://formward.top','https://formward.top.evil.test','https://formward.top@evil.test','https://evil@formward.top','https://formward.top:444/','https://formward.top\\@evil.test/','https://formward.top\n/','https://formward.top%2fevil.test','javascript:alert(1)','file:///data/private','https://127.0.0.1:51000/']) assert.equal(isTrustedPage(url),false,url);
});

test('外链与导出分别限制协议和来源，不把其他站点或脚本当作可信下载', () => {
  assert.ok(isExternalLink('https://developer.huawei.com/consumer/cn/'));
  for (const url of ['javascript:alert(1)', 'intent://camera', 'file:///tmp/test', 'https://a@b.test/', ORIGIN]) assert.equal(isExternalLink(url),false,url);
  assert.ok(isTrustedDownload(ORIGIN+'/api/exports/meals'));
  assert.ok(isTrustedDownload('blob:'+ORIGIN+'/87df'));
  for (const url of ['blob:https://evil.test/id','data:text/csv,secret','https://evil.test/export.xlsx']) assert.equal(isTrustedDownload(url),false,url);
});

test('导出文件保留数据格式但不能控制本机路径或打开脚本', () => {
  assert.equal(safeExportName('饮食记录.xlsx'),'饮食记录.xlsx');
  assert.equal(safeExportName('../meal.csv'),'');
  assert.equal(safeExportName('folder/meal.csv'),'folder_meal.csv');
  for (const name of ['run.exe','page.html','data.xlsx.exe','.hidden.csv','no-extension']) assert.equal(safeExportName(name),'');
  assert.equal(safeExportName('a'.repeat(200)+'.xlsx'),'Formward-export.xlsx');
});

test('网页桥只接受有限的界面消息，不执行凭证、文件或健康写入指令', () => {
  const events=[];const bridge=new HostBridge(event=>events.push(event));
  for (const message of ['bad', '{}','null',JSON.stringify({type:'write-record',content:'fictional'}),JSON.stringify({type:'appearance',theme:'a'.repeat(600)})]) bridge.postEvent(message);
  assert.equal(events.length,0);
  bridge.postEvent(JSON.stringify({type:'appearance',theme:'dark'}));
  bridge.postEvent(JSON.stringify({type:'back-result',id:'11-2',handled:true}));
  assert.deepEqual(events,[{type:'appearance',theme:'dark'},{type:'back-result',id:'11-2',handled:true}]);
});
