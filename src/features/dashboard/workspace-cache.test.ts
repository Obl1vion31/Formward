import assert from "node:assert/strict";
import {test} from "node:test";
import {WorkspaceCache,workspaceQuery,workspaceCacheKey} from "./workspace-cache-state";
test("展示缓存按页面、日期、区间和筛选匹配；账号实例和跨日隔离",()=>{
 const first=new WorkspaceCache<string>(),second=new WorkspaceCache<string>(),day="2026-11-14",key=workspaceCacheKey("/dashboard/meals",workspaceQuery({date:day,from:"2026-11-08",to:day,filter:"known"}));
 first.remember(key,day,"真实快照");assert.equal(first.read(key,day),"真实快照");assert.equal(second.read(key,day),undefined);assert.equal(first.read(key,"2026-11-15"),undefined);
 assert.equal(first.read(workspaceCacheKey("/dashboard/meals","date=2026-11-13"),day),undefined);assert.equal(first.read(workspaceCacheKey("/dashboard/energy",key.split("?")[1]),day),undefined);
 assert.equal(workspaceCacheKey("/dashboard/meals","b=2&a=1"),workspaceCacheKey("/dashboard/meals","a=1&b=2"));
 first.clear();assert.equal(first.read(key,day),undefined);
});
test("录入编辑不缓存，每类页面只保留最近一次视图",()=>{
 const cache=new WorkspaceCache<string>(),day="2026-11-14";for(const query of ["entry=1","intent=edit","intent=create"])cache.remember("/dashboard/meals?"+query,day,"草稿");
 assert.equal(cache.read("/dashboard/meals?entry=1",day),undefined);
 for(let i=0;i<17;i++)cache.remember("/dashboard/meals?date="+i,day,"真实"+i);
 assert.equal(cache.read("/dashboard/meals?date=0",day),undefined);assert.equal(cache.read("/dashboard/meals?date=15",day),undefined);assert.equal(cache.read("/dashboard/meals?date=16",day),"真实16");cache.remember("/dashboard/energy?",day,"消耗");assert.equal(cache.read("/dashboard/meals?date=16",day),"真实16");
});
