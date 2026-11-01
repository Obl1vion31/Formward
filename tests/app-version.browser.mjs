import assert from "node:assert/strict";
import {mkdir,writeFile,mkdtemp,rm,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,dirname,basename} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {resolve} from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer as createNetServer} from "node:net";
import {createServer,request} from "node:http";
import postgres from "postgres";
import {drizzle} from "drizzle-orm/postgres-js";
import {migrate} from "drizzle-orm/postgres-js/migrator";
import {eq} from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import {provisionAccount} from "../src/features/auth/provision.ts";
async function port(){const s=createNetServer();s.listen(0,"127.0.0.1");await once(s,"listening");const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const directoryA=process.env.VERSION_APP_A;if(!directoryA)throw Error("VERSION_APP_A must reference a preserved production build");
const artifacts=resolve(process.env.VERSION_ARTIFACTS||".codex/app-versions");await mkdir(artifacts,{recursive:true});
const execute=promisify(execFile),pgBin=process.env.FORMWARD_PG_BIN||"/usr/lib/postgresql/18/bin";
const pgDirectory=await mkdtemp(join(tmpdir(),"formward-versions-")),dbPort=await port();
await execute(join(pgBin,"initdb"),["-D",pgDirectory,"--username=postgres","--encoding=UTF8","--locale=C.UTF-8","--auth-local=trust","--auth-host=trust","--no-instructions"]);
await execute(join(pgBin,"pg_ctl"),["-D",pgDirectory,"-l",join(pgDirectory,"server.log"),"-o","-h 127.0.0.1 -p "+dbPort+" -k "+pgDirectory,"-w","start"]);
const connection="postgresql://postgres@127.0.0.1:"+dbPort+"/postgres?max=1";
const sql=postgres(connection,{max:1,prepare:false}),db=drizzle(sql,{schema});await migrate(db,{migrationsFolder:"./drizzle"});
const account={email:"versions@example.test",password:"fictional-two-builds-password"},owner=await provisionAccount(db,account);
await db.delete(schema.personalProfile).where(eq(schema.personalProfile.userId,owner.id));

const portA=await port(),portB=await port(),proxyPort=await port(),base="http://127.0.0.1:"+proxyPort;let activePort=portA;
const proxy=createServer((req,res)=>{
 const forwarded=request({hostname:"127.0.0.1",port:activePort,path:req.url,method:req.method,headers:req.headers},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
 forwarded.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(forwarded);
});proxy.listen(proxyPort,"127.0.0.1");await once(proxy,"listening");
const children=[];let log="",browser,failure=null;const checks=[],errors=[];
for(const [cwd,p]of [[directoryA,portA],[process.cwd(),portB]]){
 const child=spawn(process.execPath,[resolve("node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(p)],{cwd,env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:connection,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:"fictional-two-builds-secret-more-than-thirty-two",FORMWARD_TIMEZONE:"Asia/Shanghai"},stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",b=>{log+=b});child.stderr.on("data",b=>{log+=b});children.push(child);
}
try{
 for(const p of [portA,portB])for(let i=0;i<150;i++){try{if((await fetch("http://127.0.0.1:"+p+"/api/app-version")).ok)break;}catch{}if(i===149)throw Error("start timeout");await new Promise(r=>setTimeout(r,200));}
 const a=await(await fetch("http://127.0.0.1:"+portA+"/api/app-version")).json(),b=await(await fetch("http://127.0.0.1:"+portB+"/api/app-version")).json();assert.notEqual(a.version,b.version);
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs");browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:720},locale:"zh-CN",timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});
 assert.equal((await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:account})).status(),200);
 const p=await context.newPage();p.on("pageerror",e=>errors.push(e.message));await p.clock.install();
 await p.goto(base+"/dashboard/profile");await p.waitForLoadState("networkidle");
 await p.getByRole("button",{name:"修改资料",exact:true}).click();await p.getByLabel("身高",{exact:true}).fill("172");
 const originalURL=p.url();let navigations=0;p.on("framenavigated",f=>{if(f===p.mainFrame())navigations++;});
 await p.clock.fastForward(90001);await p.waitForTimeout(100);assert.equal(await p.getByLabel("应用版本更新",{exact:true}).count(),0);checks.push("same-build-no-reminder");
 activePort=portB;await p.evaluate(()=>window.dispatchEvent(new Event("focus")));await p.getByLabel("应用版本更新",{exact:true}).waitFor();
 assert.equal(navigations,0);assert.equal(p.url(),originalURL);assert.equal(await p.getByLabel("身高",{exact:true}).inputValue(),"172");
 await p.screenshot({path:resolve(artifacts,"build-B-available.png")});checks.push("real-build-B-found-on-same-alias","no-auto-reload","draft-kept");
 await p.getByRole("button",{name:"刷新",exact:true}).click();await p.getByRole("heading",{name:"刷新到新版本？",exact:true}).waitFor();
 await p.screenshot({path:resolve(artifacts,"refresh-confirm.png")});await p.getByRole("dialog",{name:"刷新到新版本？",exact:true}).getByRole("button",{name:"取消",exact:true}).click();
 assert.equal(await p.getByLabel("身高",{exact:true}).inputValue(),"172");assert.equal(navigations,0);checks.push("cancel-does-not-refresh-or-clear-input");
 await p.getByRole("button",{name:"刷新",exact:true}).click();
 await Promise.all([p.waitForNavigation({waitUntil:"load"}),p.getByRole("button",{name:"放弃输入并刷新",exact:true}).click()]);
 await p.getByRole("button",{name:"修改资料",exact:true}).waitFor();await p.waitForLoadState("networkidle");assert.equal(p.url(),originalURL);
 assert.ok(navigations>=1);assert.equal((await(await p.request.get(base+"/api/app-version")).json()).version,b.version);
 await p.clock.fastForward(90001);assert.equal(await p.getByLabel("应用版本更新",{exact:true}).count(),0);await p.screenshot({path:resolve(artifacts,"updated-build-B.png")});
 checks.push("confirmed-refresh-loaded-build-B","same-route-and-login-kept","new-build-does-not-prompt-again");
 await context.close();assert.deepEqual(errors,[]);
}catch(error){failure=String(error);if(browser)for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:resolve(artifacts,"failure.png")}).catch(()=>{});}
finally{
 await browser?.close();proxy.closeAllConnections();await new Promise(r=>proxy.close(r));
 for(const child of children)if(child.exitCode===null){child.kill("SIGTERM");await once(child,"exit");}

 assert.equal((await db.select().from(schema.personalProfile).where(eq(schema.personalProfile.userId,owner.id))).length,0);
 assert.equal((await db.select().from(schema.measurement)).length,0);
 await sql.end();await execute(join(pgBin,"pg_ctl"),["-D",pgDirectory,"-m","fast","-w","stop"]);
 const resolved=await realpath(pgDirectory);
 if(dirname(resolved)!==resolve(tmpdir())||!basename(resolved).startsWith("formward-versions-"))throw Error("Refuse to remove unexpected test database directory");
 await rm(resolved,{recursive:true,force:true});await writeFile(resolve(artifacts,"server.log"),log);await writeFile(resolve(artifacts,"report.json"),JSON.stringify({passed:!failure,failure,checks,errors,fixture:"two actual local production builds, shared formal-origin proxy, isolated fake account; no health records"},null,2)+"\n");
 console.log(JSON.stringify({passed:!failure,failure,checks,errors}));if(failure)process.exitCode=1;
}
