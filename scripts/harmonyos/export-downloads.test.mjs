import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import ts from 'typescript';

function load(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(name => {
    if (!(name in imports)) throw Error('Unexpected SDK dependency: ' + name);
    return imports[name];
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const policy = load('../../apps/harmonyos/entry/src/main/ets/host/HostPolicy.ets');

function fixture({ destinations = ['file:///user-selected/export.xlsx'], copyError = false, closeError = false } = {}) {
  const calls = [], messages = [], busy = [];
  let delegate;
  class Delegate {
    onBeforeDownload(fn) { this.before = fn; }
    onDownloadUpdated(fn) { this.updated = fn; }
    onDownloadFailed(fn) { this.failed = fn; }
    onDownloadFinish(fn) { this.finished = fn; }
  }
  let descriptor = 0;
  const fs = {
    OpenMode: { READ_ONLY: 1, READ_WRITE: 2, CREATE: 4, TRUNC: 8 },
    openSync: (path, mode) => { calls.push(['open',path,mode]); return { fd: ++descriptor }; },
    copyFileSync: (from,to) => { calls.push(['copy',from,to]); if (copyError) throw Error('fictional I/O failure'); },
    closeSync: file => { calls.push(['close',file.fd]); if (closeError) throw Error('fictional close failure'); },
    unlinkSync: path => calls.push(['unlink',path])
  };
  class DocumentViewPicker {
    async save(options) { calls.push(['picker',options]); return destinations; }
  }
  const { ExportDownloads } = load('../../apps/harmonyos/entry/src/main/ets/host/ExportDownloads.ets', {
    '@kit.ArkWeb': { webview: { WebDownloadDelegate: Delegate } },
    '@kit.CoreFileKit': { fileIo: fs, picker: { DocumentViewPicker } },
    './HostPolicy': policy
  });
  const host = new ExportDownloads({ cacheDir: '/private-fixture-cache' }, message => messages.push(message), value => busy.push(value));
  host.attach({ setDownloadDelegate: value => { assert.ok(value instanceof Delegate); delegate = value; } });
  function download(id, { url = 'https://formward.top/api/exports/meals', name = '饮食.xlsx', mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size = 200 } = {}) {
    const item = { getGuid: () => id, getUrl: () => url, getSuggestedFileName: () => name, getMimeType: () => mime,
      getReceivedBytes: () => size, start: path => calls.push(['start',id,path]), cancel: () => calls.push(['cancel',id]) };
    delegate.before(item);
    return item;
  }
  return { delegate, download, calls, messages, busy };
}

test('受保护导出只复用 ArkWeb 请求，完成后交给用户选择位置并关闭文件', async () => {
  const f=fixture(); const item=f.download('one'); f.delegate.finished(item); await setImmediate();
  assert.equal(f.calls.filter(row=>row[0]==='start').length,1);
  assert.deepEqual(f.calls.find(row=>row[0]==='picker')[1],{newFileNames:['饮食.xlsx']});
  assert.equal(f.calls.filter(row=>row[0]==='open')[1][1],'file:///user-selected/export.xlsx');
  assert.deepEqual(f.calls.find(row=>row[0]==='copy'),['copy',1,2]);
  assert.equal(f.calls.filter(row=>row[0]==='close').length,2);
  assert.match(f.calls.find(row=>row[0]==='unlink')[1],/^\/private-fixture-cache\/formward-export-\d+-\d+\.tmp$/);
  assert.equal(f.busy.at(-1),false); assert.deepEqual(f.messages,['文件已保存。']);
});

test('取消保存不创建目标文件，复制或关闭失败也回收本次缓存并解除忙碌', async () => {
  const cancelled=fixture({destinations:[]}); cancelled.delegate.finished(cancelled.download('cancel')); await setImmediate();
  assert.equal(cancelled.calls.some(row=>row[0]==='open'),false); assert.equal(cancelled.busy.at(-1),false);
  assert.ok(cancelled.calls.some(row=>row[0]==='unlink')); assert.equal(cancelled.messages.length,0);
  const failed=fixture({copyError:true,closeError:true}); failed.delegate.finished(failed.download('error')); await setImmediate();
  assert.equal(failed.calls.filter(row=>row[0]==='close').length,2);
  assert.ok(failed.calls.some(row=>row[0]==='unlink')); assert.equal(failed.busy.at(-1),false);
  assert.match(failed.messages[0],/没有保存/);
});

test('错误来源、脚本、HTML 及过大的下载不能进入文件保存流程', () => {
  const f=fixture();
  f.download('foreign',{url:'https://foreign.example/export.xlsx'});
  f.download('script',{name:'script.exe'});
  f.download('login',{mime:'text/html'});
  const large=f.download('large',{size:20*1024*1024+1}); f.delegate.updated(large);
  assert.equal(f.calls.filter(row=>row[0]==='cancel').length,4);
  assert.equal(f.calls.filter(row=>row[0]==='picker').length,0);
  assert.equal(f.busy.at(-1),false);
});

test('并发最多两个，失败后重新下载不复用正在使用的缓存路径', t => {
  t.mock.timers.enable({apis:['Date'],now:1700000000000});
  const f=fixture(); const one=f.download('one'); f.download('two'); f.download('three'); f.delegate.failed(one); f.download('four');
  const starts=f.calls.filter(row=>row[0]==='start');
  assert.equal(starts.length,3); assert.equal(new Set(starts.map(row=>row[2])).size,3);
  assert.ok(f.calls.some(row=>row[0]==='cancel'&&row[1]==='three'));
});
