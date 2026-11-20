// 仅专用鸿蒙隔离进程加载；不进入正式运行包，不连接真实模型或 COS。
import assert from 'node:assert/strict';
import COS from 'cos-nodejs-sdk-v5';
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
const validate=params=>{
  assert.equal(params.Bucket,'chat-fixture-123');
  assert.equal(params.Region,'ap-shanghai');
  assert.match(params.Key,/^meal-(?:tmp|formal)-v2\/[a-f0-9-]{36}\//);
};
COS.prototype.putObject=async function(params){
  validate(params); assert.ok(Buffer.isBuffer(params.Body));
  files.set(params.Key,{bytes:Buffer.from(params.Body),type:params.ContentType});
  return {statusCode:200,headers:{}};
};
COS.prototype.deleteObject=async function(params){validate(params);files.delete(params.Key);return {statusCode:204,headers:{}};};
const previousFetch=globalThis.fetch;
globalThis.fetch=async function(input,options){
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
  if(url.hostname==='chat-fixture-123.cos.ap-shanghai.myqcloud.com'){
    const file=files.get(decodeURIComponent(url.pathname).slice(1));
    if(file)return new Response(file.bytes,{headers:{'content-type':file.type}});
  }
  return previousFetch(input,options);
};
