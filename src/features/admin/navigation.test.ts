import assert from "node:assert/strict";
import {test} from "node:test";
import {adminLocation,adminQuery,personHref,safeAdminReturn} from "./navigation";

test("后台旧链接进入对应新栏目，默认入口只管理用户",()=>{
 assert.equal(adminLocation({}).tab,"users");
 assert.equal(adminLocation({tab:"overview"}).tab,"usage");
 assert.equal(adminLocation({tab:"tiers"}).tab,"rules");
 assert.deepEqual(adminLocation({tab:"invitations"}),{tab:"users",section:"invitations",userView:"summary"});
 assert.equal(adminLocation({tab:"security"}).tab,"security");
 assert.equal(adminLocation({view:"policy"}).userView,"policy");
 assert.equal(adminLocation({view:"unknown"}).userView,"summary");
});
test("用户子页保留用量条件和原列表，返回地址只能进入后台",()=>{
 const filter={from:"2026-11-01",to:"2026-11-18",provider:"qwen" as const,model:"fictional model/1",purpose:"chat" as const,page:3,search:"person@example.test",sort:"requests" as const};
 const back="/admin?"+adminQuery(filter,"usage"),url=new URL(personHref("a/b","account",back,filter),"https://example.test");
 assert.equal(url.pathname,"/admin/users/a%2Fb");assert.equal(url.searchParams.get("view"),"account");assert.equal(url.searchParams.get("model"),filter.model);assert.equal(url.searchParams.get("returnTo"),back);
 assert.equal(url.searchParams.has("page"),false);
 for(const unsafe of["https://evil.test/admin","//evil.test/admin","/admin/users/id","/admin\\evil","/administrator","/admin?x=\n"]){assert.equal(safeAdminReturn(unsafe),undefined);assert.equal(new URL(personHref("id","summary",unsafe),"https://example.test").searchParams.has("returnTo"),false);}
 assert.equal(safeAdminReturn("/admin"),"/admin");assert.equal(safeAdminReturn(back),back);
});
