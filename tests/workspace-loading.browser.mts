import { delayedTrainingDatabase } from './training-delayed-db';
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import {createServer as createHttpServer} from 'node:http';
import {sql} from 'drizzle-orm';
import { spawn,spawnSync } from "node:child_process";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {resolve} from "node:path";

import {createDatabase} from "../src/db/client";
import {migrate as migrateNative} from "drizzle-orm/postgres-js/migrator";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../src/db/client";
import * as schema from "../src/db/schema";
import { seedTrainingFixture } from "./training-fixture";
import {seedDetailHierarchy} from './detail-hierarchy-fixture.mjs';
import {saveImportedMeasurements} from '../src/features/measurements/records';
import {createHash,randomUUID} from 'node:crypto';
import {addCalendarDays} from '../src/features/measurements/calendar';
const useNative=process.env.FORMWARD_LOADING_NATIVE==="1";
let cluster:{stop:()=>Promise<void>}|undefined,native:ReturnType<typeof createDatabase>|undefined,nativeUpstream="";
if(useNative){
 const bin=process.env.FORMWARD_POSTGRES_BIN??"/usr/lib/postgresql/18/bin";
 const folder=await mkdtemp(join(tmpdir(),"formward-loading-native-")),probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const port=(probe.address() as {port:number}).port;await new Promise<void>(done=>probe.close(()=>done()));
 const data=join(folder,"cluster"),command=(name:string,args:string[])=>{const result=spawnSync(join(bin,name),args,{encoding:"utf8"});if(result.status!==0)throw Error("Isolated PostgreSQL command failed: "+name);};
 command("initdb",["-D",data,"-U","postgres","-A","trust","--locale=C","-E","UTF8"]);
 command("pg_ctl",["-D",data,"-l",join(folder,"postgres.log"),"-o","-h 127.0.0.1 -p "+port+" -k "+folder,"-w","start"]);
 const administrator=createDatabase("postgresql://postgres@127.0.0.1:"+port+"/postgres?max=1");
 try{await administrator.db.execute(sql.raw("CREATE DATABASE formward_browser_loading"));}finally{await administrator.close();}
 const instance={stop:async()=>{command("pg_ctl",["-D",data,"-m","fast","-w","stop"]);}};
 cluster=instance;nativeUpstream="127.0.0.1:"+port;native=createDatabase("postgresql://postgres:fictional-loading-postgres@"+nativeUpstream+"/formward_browser_loading?max=6");
}
const pg=native?undefined:new PGlite(),db=native?.db??drizzle(pg!,{schema});
if(native)await migrateNative(native.db,{migrationsFolder:"./drizzle"});else await migrate(drizzle(pg!,{schema}),{migrationsFolder:"./drizzle"});
const fixture = await seedTrainingFixture(db as unknown as Database);
await seedDetailHierarchy(db,fixture.userId,fixture.today,{stressOffset:-37});
await saveImportedMeasurements(db as unknown as Database,{userId:fixture.userId,actorId:fixture.userId,fileDigest:createHash('sha256').update(randomUUID()).digest('hex'),sourceLabel:'虚构加载验收体重',captureChannel:'file',records:Array.from({length:14},(_,i)=>i).filter(i=>i!==2).flatMap(i=>['daytime','evening'].map((period,j)=>({sourceLocalTime:addCalendarDays(fixture.today,-i)+(j?' 20:12:00':' 07:25:00'),weightKg:(70.14+i*.037+j*.51).toFixed(2),bodyFatPercent:i===4?null:(20.8+i*.014+j*.12).toFixed(2),fasting:!j,fastingSource:j?'evening_rule':'user_confirmed',timezone:'Asia/Shanghai',sourceRow:i*2+j+2})))});
const socket = pg?new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 10 }):undefined; await socket?.start();
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
const delayed = await delayedTrainingDatabase(nativeUpstream||socket!.getServerConn());
let broken=false;
const fixtureControl=createHttpServer(async(request,response)=>{
 try{
  if(request.method==='POST'&&request.url==='/meals-failure'){
   const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));const input=JSON.parse(Buffer.concat(chunks).toString());assert.equal(typeof input.broken,'boolean');
   if(input.broken!==broken){await db.execute(input.broken?sql`alter table meal_items rename to loading_fixture_meal_items`:sql`alter table loading_fixture_meal_items rename to meal_items`);broken=input.broken;}
   response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({broken}));return;
  }
  if(request.method==='GET'&&request.url==='/health-digest'){
   assert.equal(broken,false);const values=[];for(const table of ['meals','meal_items','energy_days','activities','measurements']){const result=await db.execute(sql.raw(`select count(*)::int as count,md5(string_agg(to_jsonb(t)::text,'' order by id)) as digest from ${table} t`)) as unknown as ({count:number;digest:string|null}[]|{rows:{count:number;digest:string|null}[]});values.push({table,...(Array.isArray(result)?result[0]:result.rows[0])});}
   response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(values));return;
  }
  response.writeHead(404).end();
 }catch{response.writeHead(500).end('Fixture control failed');}
});
await new Promise<void>(done=>fixtureControl.listen(0,'127.0.0.1',done));
const fixtureControlURL='http://127.0.0.1:'+(fixtureControl.address() as {port:number}).port;
const baseURL = "http://127.0.0.1:" + port, databaseUrl = native?"postgresql://postgres:fictional-loading-postgres@"+delayed.connection+"/formward_browser_loading?max=6":"postgresql://postgres:postgres@" + delayed.connection + "/postgres?max=1";
const folder = process.env.FORMWARD_LOADING_ARTIFACTS ?? ".codex/workspace-loading";
await mkdir(folder, { recursive: true });
const configPath = folder + "/config.json"; await writeFile(configPath, JSON.stringify({ ...fixture, baseURL, databaseUrl, delayControlURL: delayed.controlURL, fixtureControlURL,pid: process.pid, isolatedFixture: true }), { mode: 0o600 });
const release=process.env.FORMWARD_LOADING_RELEASE?resolve(process.env.FORMWARD_LOADING_RELEASE):null;
if(release)assert.ok(release.startsWith(resolve('.codex/regional-releases')+'/')&&release.endsWith('/standalone'),'仅允许本仓库私有发布产物');
const child = spawn(process.execPath, release?[join(release,'server.js')]:["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, NODE_ENV: "production", PORT:String(port), HOSTNAME:'127.0.0.1', NEXT_TELEMETRY_DISABLED: "1", FORMWARD_DATA_SOURCE_USER_ID: fixture.userId, DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: "fictional-training-secret-longer-than-32-characters", FORMWARD_TIMEZONE: "Asia/Shanghai" }, stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; child.stdout.on("data", chunk => { log += chunk; }); child.stderr.on("data", chunk => { log += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) { assert.equal(child.exitCode, null); try { if ((await fetch(baseURL)).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, "独立训练测试服务启动超时");
  process.env.FORMWARD_LOADING_CONFIG = configPath;
  if (process.env.FORMWARD_LOADING_PREVIEW !== "1") await import("./workspace-loading-check.browser.mjs");
  else { console.log(JSON.stringify({ baseURL, email: fixture.email, password: fixture.password, configPath, fictional: true })); await new Promise<void>(done => {process.once("SIGTERM",done);process.once("SIGINT",done);}); }
} catch (error) { await writeFile(folder + "/server-failure.log", log); throw error; }
finally { if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } await new Promise<void>(done=>fixtureControl.close(()=>done()));await delayed.close(); await socket?.stop(); await new Promise(resolve => setImmediate(resolve)); await pg?.close();await native?.close();await cluster?.stop(); }
