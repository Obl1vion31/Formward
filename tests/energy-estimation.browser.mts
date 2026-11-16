import {once} from "node:events";
import {spawn,spawnSync} from "node:child_process";
import {createServer} from "node:net";
import {mkdir,writeFile,mkdtemp,rm,copyFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {PGLiteSocketServer} from "@electric-sql/pglite-socket";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import {createDatabase,type Database} from "../src/db/client";
import {migrate as migrateNative} from "drizzle-orm/postgres-js/migrator";
import {provisionAccount} from "../src/features/auth/provision";
import {saveMeasurementDay} from "../src/features/measurements/editing";
import {localMeasurementDate} from "../src/features/measurements/entry-state";
const artifacts=resolve(process.env.FORMWARD_ESTIMATE_ARTIFACTS??".codex/energy-estimation-browser");await mkdir(artifacts,{recursive:true});
const bin=process.env.FORMWARD_POSTGRES_BIN;
let native:ReturnType<typeof createDatabase>|undefined,nativeFolder:string|undefined,nativeUrl:string|undefined;
function postgresCommand(name:string,args:string[]){const result=spawnSync(join(bin!,name),args,{encoding:"utf8"});assert.equal(result.status,0,"隔离PostgreSQL命令失败："+name);}
if(bin){
 nativeFolder=await mkdtemp(join(tmpdir(),"formward-estimation-native-"));const probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const port=(probe.address()as{port:number}).port;await new Promise<void>(done=>probe.close(()=>done()));
 postgresCommand("initdb",["-D",join(nativeFolder,"cluster"),"-U","postgres","-A","trust","--locale=C","-E","UTF8"]);
 postgresCommand("pg_ctl",["-D",join(nativeFolder,"cluster"),"-l",join(nativeFolder,"postgres.log"),"-o","-h 127.0.0.1 -p "+port+" -k "+nativeFolder,"-w","start"]);
 nativeUrl="postgresql://postgres:fictional-energy-postgres@127.0.0.1:"+port+"/postgres?max=4";native=createDatabase(nativeUrl);
}
const pg=native?undefined:new PGlite(),db:Database=native?.db??drizzle(pg!,{schema});
if(native)await migrateNative(native.db,{migrationsFolder:"drizzle"});else await migrate(drizzle(pg!,{schema}),{migrationsFolder:"drizzle"});
const today=localMeasurementDate(new Date(),"Asia/Shanghai"),birth=String(Number(today.slice(0,4))-21)+today.slice(4);
const accounts:{email:string;password:string;id:string}[]=[];
for(const kind of ["complete","missing","device"]){
 const account={email:kind+"@energy-estimation.example.test",password:"fictional-estimation-"+kind+"-password"},user=await provisionAccount(db,{...account,name:"虚构消耗估算验收"});accounts.push({...account,id:user.id});
 await db.update(schema.personalProfile).set({onboardingStep:"complete",...(kind==="complete"?{heightCm:"173.5",sexForCalculation:"male",birthDate:birth}:{})}).where((await import("drizzle-orm")).eq(schema.personalProfile.userId,user.id));
 if(kind==="complete")await saveMeasurementDay(db,{userId:user.id,actorId:user.id},{operationId:randomUUID(),date:today,timezone:"Asia/Shanghai",periods:{daytime:{weightKg:"67.8",bodyFatPercent:"17",fasting:true,deviceLabel:"虚构实测秤"}}});
 if(kind==="device"){
  await db.insert(schema.energyDay).values({id:randomUUID(),userId:user.id,date:today,entryMode:"total",activityMode:"total",timezone:"Asia/Shanghai",totalKcal:"2158",sourceSystem:"Garmin Personal:虚构设备"});
  await db.insert(schema.energyDayAdoption).values({userId:user.id,date:today,mode:"source",metadata:{strategy:"total",sources:{total:null,resting:null,active:null,steps:null,activities:null},facts:[],restingKcal:"2058",activeKcal:"100",compositionKnown:true,coverageUntil:null,syncedAt:new Date().toISOString(),label:"虚构Garmin"}});
 }
}
const socket=pg?new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:0}):undefined;await socket?.start();
const probe=createServer();probe.listen(Number(process.env.FORMWARD_ESTIMATE_PORT??0),"127.0.0.1");await once(probe,"listening");const port=(probe.address()as{port:number}).port;await new Promise<void>(done=>probe.close(()=>done()));
const baseURL="http://127.0.0.1:"+port;
await writeFile(resolve(artifacts,"fixture.json"),JSON.stringify({baseURL,today,birth,accounts}),{mode:0o600});
const release=process.env.FORMWARD_ESTIMATE_RELEASE?resolve(process.env.FORMWARD_ESTIMATE_RELEASE):null;
const child=spawn(process.execPath,release?[resolve(release,"server.js")]:["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{...(release?{cwd:release}:{}),env:{PORT:String(port),HOSTNAME:"127.0.0.1",PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:nativeUrl??"postgresql://postgres:postgres@"+socket!.getServerConn()+"/postgres?max=1",BETTER_AUTH_URL:baseURL,BETTER_AUTH_SECRET:"fictional-energy-calculation-browser-secret-more-than-32",FORMWARD_TIMEZONE:"Asia/Shanghai",FORMWARD_DATA_SOURCE_ACCESS:"personal",FORMWARD_SINGLE_WEB:"1"},stdio:["ignore","pipe","pipe"]});
let log="";child.stdout.on("data",b=>{log+=b;});child.stderr.on("data",b=>{log+=b;});
try{
 let ready=false;for(let i=0;i<100;i++){assert.equal(child.exitCode,null);try{if((await fetch(baseURL)).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,250));}assert.ok(ready,"隔离服务启动");
 if(process.env.FORMWARD_ESTIMATE_PREVIEW==="1"){console.log(JSON.stringify({baseURL,fictional:true,fixture:resolve(artifacts,"fixture.json")}));await new Promise<void>(done=>{process.once("SIGTERM",done);process.once("SIGINT",done);});}
 else{const {checkEnergyEstimation}=await import("./energy-estimation.driver.mjs");await checkEnergyEstimation({baseURL,today,birth,accounts,db,artifacts});}
}finally{if(child.exitCode===null){child.kill("SIGTERM");await once(child,"exit");}await writeFile(resolve(artifacts,"server.log"),log,{mode:0o600});await socket?.stop();await pg?.close();await native?.close();if(nativeFolder){postgresCommand("pg_ctl",["-D",join(nativeFolder,"cluster"),"-m","fast","-w","stop"]);await copyFile(join(nativeFolder,"postgres.log"),resolve(artifacts,"postgres.log"));assert.ok(nativeFolder.startsWith(join(tmpdir(),"formward-estimation-native-")));await rm(nativeFolder,{recursive:true,force:true});}}
