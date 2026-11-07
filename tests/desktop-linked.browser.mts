import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer,request} from "node:http";
import {createServer as createSocket} from "node:net";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {PGlite} from "@electric-sql/pglite";
import {PGLiteSocketServer} from "@electric-sql/pglite-socket";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq} from "drizzle-orm";
import * as schema from "../src/db/schema";
import {localMeasurementDate} from "../src/features/measurements/entry-state";
import {seedAssistantFixture} from "./assistant-fixture.mjs";
import {checkDesktopLinked} from "./desktop-linked-check.browser.mjs";

// 只创建本机 PGlite；不读取 .env 或接受外部数据库地址。
const artifacts=resolve(process.env.FORMWARD_DESKTOP_ARTIFACTS??".codex/desktop-linked");
const preview=process.env.FORMWARD_DESKTOP_PREVIEW==="1";
await mkdir(artifacts,{recursive:true});
const pg=new PGlite(preview?resolve(artifacts,"fixture-db"):undefined),db=drizzle(pg,{schema});
await migrate(db,{migrationsFolder:"./drizzle"});
const today=localMeasurementDate(new Date(),"Asia/Shanghai");
const existing=await db.select().from(schema.user).where(eq(schema.user.email,"assistant@example.test"));
const fixture=existing.length?{userId:existing[0].id,today,account:{email:"assistant@example.test",password:"formward-assistant-demo"}}:await seedAssistantFixture(db,today);
async function freePort(){
 const server=createSocket();server.listen(0,"127.0.0.1");await once(server,"listening");
 const port=(server.address() as {port:number}).port;
 await new Promise<void>(done=>server.close(()=>done()));return port;
}
const port=preview?Number(process.env.FORMWARD_DESKTOP_PORT??4240):await freePort();
assert.ok(Number.isInteger(port)&&port>1024&&port<65535);
const baseURL="http://localhost:"+port;
const socket=new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:0,maxConnections:10});
await socket.start();
const databaseURL="postgresql://postgres:postgres@"+socket.getServerConn()+"/postgres?max=1";
const children:ReturnType<typeof spawn>[]=[],logs:string[]=[];
async function start(root:string,appPort:number){
 const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port",String(appPort)],{
  cwd:root,stdio:["ignore","pipe","pipe"],env:{...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:databaseURL,BETTER_AUTH_URL:"http://localhost:"+appPort,BETTER_AUTH_SECRET:"fictional-desktop-linked-secret-more-than-32-characters",FORMWARD_TIMEZONE:"Asia/Shanghai",BLOB_READ_WRITE_TOKEN:""},
 });
 children.push(child);child.stdout?.on("data",chunk=>logs.push(String(chunk)));child.stderr?.on("data",chunk=>logs.push(String(chunk)));
 for(let i=0;i<120;i++){
  if(child.exitCode!==null)throw new Error("隔离应用退出："+logs.join(""));
  try{if((await fetch("http://localhost:"+appPort)).ok)return;}catch{}
  await new Promise(done=>setTimeout(done,250));
 }
 throw new Error("隔离应用未就绪");
}
let slow:ReturnType<typeof createServer>|undefined,browser:{close:()=>Promise<void>}|undefined,stopping=false;
async function stop(){
 if(stopping)return;stopping=true;
 await browser?.close();
 if(slow)await new Promise<void>(done=>slow!.close(()=>done()));
 for(const child of children)if(child.exitCode===null){child.kill("SIGTERM");await once(child,"exit");}
 await writeFile(resolve(artifacts,"server.log"),logs.join(""));
 await socket.stop();await pg.close();
}
try{
 await start(process.cwd(),port);
 let baselineURL:string|undefined;
 if(process.env.FORMWARD_DESKTOP_BASELINE_ROOT){const baselinePort=preview?port+2:await freePort();await start(resolve(process.env.FORMWARD_DESKTOP_BASELINE_ROOT),baselinePort);baselineURL="http://localhost:"+baselinePort;}
 let slowURL:string|undefined;
 {
  const slowPort=preview?port+1:await freePort();
  slow=createServer((req,res)=>{
   const forward=()=>{const upstream=request({hostname:"127.0.0.1",port,path:req.url,method:req.method,headers:{...req.headers,host:"localhost:"+port}},incoming=>{res.writeHead(incoming.statusCode??502,incoming.headers);incoming.pipe(res);});upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end("Preview unavailable");});req.pipe(upstream);};
   if(req.method==="GET"&&req.url?.startsWith("/dashboard"))setTimeout(forward,1000);else forward();
  });
  await new Promise<void>(done=>slow!.listen(slowPort,"0.0.0.0",done));slowURL="http://localhost:"+slowPort;
 }
 await writeFile(resolve(artifacts,"preview.json"),JSON.stringify({baseURL,baselineURL,slowURL,fixture,pid:process.pid,databaseURL,root:process.cwd()},null,2),{mode:0o600});
 if(preview){
  console.log(JSON.stringify({baseURL,baselineURL,slowURL,fictionalAccount:fixture.account.email,pid:process.pid}));
  await new Promise<void>(done=>{process.once("SIGTERM",done);process.once("SIGINT",done);});
 }else{
  const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??"/tmp/formward-browser-check/node_modules/playwright/index.mjs");
  const engine=process.env.FORMWARD_DESKTOP_BROWSER??"chromium";
  browser=await(engine==="webkit"?webkit:chromium).launch({headless:true,args:engine==="webkit"?[]:["--no-sandbox","--disable-dev-shm-usage"]});
  await checkDesktopLinked({browser,baseURL,baselineURL,slowURL,fixture,db,artifacts:resolve(artifacts,engine)});
 }
}finally{await stop();}
