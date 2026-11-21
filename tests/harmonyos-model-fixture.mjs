// 仅专用鸿蒙隔离进程加载；不进入正式运行包，不连接真实模型或 COS。
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http,{createServer,request as localRequest} from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {urlToHttpOptions} from 'node:url';
import './chat-model-fixture.mjs';

assert.equal(process.env.FORMWARD_HARMONY_PREVIEW,'1');
assert.equal(process.env.FORMWARD_ENVIRONMENT,'isolated-chat-browser');
assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1');
assert.equal(process.env.FORMWARD_COS_BUCKET,'chat-fixture-123');
assert.equal(process.env.FORMWARD_COS_SECRET_ID,'fictional');
assert.equal(process.env.FORMWARD_COS_SECRET_KEY,'fictional');
assert.equal(process.env.QWEN_API_KEY,'fictional-key');
assert.equal(process.env.MIMO_API_KEY,'fictional-key');
const files=new Map();
const fakeHost='chat-fixture-123.cos.ap-shanghai.myqcloud.com';
// Turbopack内联SDK时不共享外部COS.prototype，在同一虚构主机的HTTP边界回放。
const storageServer=createServer(async(req,res)=>{
  try{
    assert.equal(req.headers.host,fakeHost);
    const key=decodeURIComponent(new URL(req.url,'http://fixture.test').pathname).slice(1);
    assert.match(key,/^meal-(?:tmp|formal)-v2\/[a-f0-9-]{36}\//);
    if(req.method==='DELETE'){files.delete(key);res.writeHead(204).end();return;}
    assert.equal(req.method,'PUT');
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;assert.ok(size<=20*1024*1024);chunks.push(chunk);}
    files.set(key,{bytes:Buffer.concat(chunks),type:req.headers['content-type']});
    res.writeHead(200,{etag:'"fictional-storage"'}).end();
  }catch(error){console.error('isolated-storage-replay',error);res.writeHead(500).end();}
});
storageServer.listen(0,'127.0.0.1');await once(storageServer,'listening');storageServer.unref();
function replayRequest(realRequest){return function(...args){
  const [input,options,callback]=args;
  const settings=typeof input==='string'||input instanceof URL?{...urlToHttpOptions(new URL(input)),...(typeof options==='object'?options:{})}:input;
  if((settings.hostname??settings.host)!==fakeHost)return realRequest.apply(this,args);
  return localRequest({...settings,protocol:'http:',hostname:'127.0.0.1',host:undefined,port:storageServer.address().port,agent:false,headers:{...settings.headers,host:fakeHost}},typeof options==='function'?options:callback);
};}
http.request=replayRequest(http.request);
https.request=replayRequest(https.request);
syncBuiltinESMExports();
const previousFetch=globalThis.fetch;
globalThis.fetch=async function(input,options){
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
  if(url.hostname===fakeHost){
    const file=files.get(decodeURIComponent(url.pathname).slice(1));
    if(file)return new Response(file.bytes,{headers:{'content-type':file.type}});
  }
  return previousFetch(input,options);
};
