import {delayedTrainingDatabase} from "./training-delayed-db";
import assert from "node:assert/strict";
import {once} from "node:events";
import {spawn,spawnSync} from "node:child_process";
import {createServer} from "node:net";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,mkdtemp,writeFile,readFile,stat,appendFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {parseEnv} from "node:util";
import {join,resolve} from "node:path";
import {PGlite} from "@electric-sql/pglite";
import {PGLiteSocketServer} from "@electric-sql/pglite-socket";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq} from "drizzle-orm";
import * as schema from "../src/db/schema";
import {seedAssistantFixture} from "./assistant-fixture.mjs";
import {createDatabase} from "../src/db/client";
import {migrate as migrateNative} from "drizzle-orm/postgres-js/migrator";
import {localMeasurementDate} from "../src/features/measurements/entry-state";
const realCosPath=process.env.FORMWARD_REAL_PHOTO_CONFIG;
const realCosEnv:Record<string,string>={};
if(realCosPath){assert.equal((await stat(realCosPath)).mode&0o777,0o600);const settings=parseEnv(await readFile(realCosPath,"utf8"));assert.equal(settings.FORMWARD_COS_BUCKET,"formward-images-1520483841");assert.equal(settings.FORMWARD_COS_REGION,"ap-shanghai");for(const key of ["FORMWARD_COS_BUCKET","FORMWARD_COS_REGION","FORMWARD_COS_SECRET_ID","FORMWARD_COS_SECRET_KEY"]){assert.ok(settings[key]);realCosEnv[key]=settings[key];}for(const key of ["FORMWARD_IMAGE_SECRET","FORMWARD_GATEWAY_SECRET","FORMWARD_IMAGE_WORKER_URL","FORMWARD_BLOB_LOCATION"]){if(settings[key])realCosEnv[key]=settings[key];}}
let native:ReturnType<typeof createDatabase>|undefined,stopNative:(()=>void)|undefined,nativeUrl="";
if(process.env.FORMWARD_CHAT_NATIVE==="1"){
 const bin=process.env.FORMWARD_POSTGRES_BIN??"/home/obl1vion/.local/formward-db-testing/node_modules/@embedded-postgres/linux-x64/native/bin",folder=await mkdtemp(join(tmpdir(),"formward-chat-native-")),data=join(folder,"cluster"),probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const port=(probe.address()as{port:number}).port;await new Promise<void>(done=>probe.close(()=>done()));
 const command=(name:string,args:string[])=>{const result=spawnSync(join(bin,name),args,{encoding:"utf8"});assert.equal(result.status,0,`隔离PostgreSQL ${name}: ${result.stderr}`);};
 command("initdb",["-D",data,"-U","postgres","-A","trust","--locale=C","-E","UTF8"]);command("pg_ctl",["-D",data,"-l",join(folder,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port} -k ${folder}`,"-w","start"]);stopNative=()=>command("pg_ctl",["-D",data,"-m","fast","-w","stop"]);
 nativeUrl=`postgresql://postgres@127.0.0.1:${port}/postgres?max=3`;native=createDatabase(nativeUrl);
}
const pg=native?undefined:new PGlite(),db=native?.db??drizzle(pg!,{schema});if(native)await migrateNative(native.db,{migrationsFolder:"drizzle"});else await migrate(drizzle(pg!,{schema}),{migrationsFolder:"drizzle"});
const fixture=await seedAssistantFixture(db,localMeasurementDate(new Date(),"Asia/Shanghai"));
if(process.env.FORMWARD_UI_DECISIONS_FIXTURE==="1"){
 const {seedUiDecisionsFixture}=await import("./ui-decisions-fixture");
 try{await seedUiDecisionsFixture(db as unknown as import("../src/db/client").Database,fixture.userId,fixture.today);}catch(error){await pg?.close();await native?.close();stopNative?.();throw error;}
}
await db.update(schema.user).set({role:"owner"}).where(eq(schema.user.id,fixture.userId));
if(process.env.FORMWARD_CHAT_REFINEMENT_SEED==="1"){
 await db.insert(schema.measurementSource).values({userId:fixture.userId,label:"虚构测试体重秤"}).onConflictDoNothing();
 await db.update(schema.measurement).set({deviceLabel:"虚构测试体重秤"}).where(eq(schema.measurement.userId,fixture.userId));
}

const imageId=randomUUID(),imageBytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nE0AAAAASUVORK5CYII=","base64");
await db.insert(schema.mealImage).values({id:imageId,userId:fixture.userId,pathname:"meal-formal-v2/"+fixture.userId+"/fixture.png",fileName:"虚构照片.png",mimeType:"image/png",byteSize:imageBytes.length,sha256:createHash("sha256").update(imageBytes).digest("hex"),source:"manual",createdBy:fixture.userId,storageProvider:"cos",storageLocation:"chat-fixture-123@ap-shanghai"});
const socket=pg?new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:0,maxConnections:10}):undefined;await socket?.start();const probe=createServer();probe.listen(process.env.FORMWARD_CHAT_PREVIEW_PORT?Number(process.env.FORMWARD_CHAT_PREVIEW_PORT):realCosPath?3300:0,"127.0.0.1");await once(probe,"listening");const port=(probe.address()as{port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
const previewMarker=process.env.FORMWARD_LOCAL_PREVIEW==="1";
const delay=previewMarker?await delayedTrainingDatabase(native?new URL(nativeUrl).host:socket!.getServerConn(),/\b(training_sessions|training_templates|training_plans|meal_items|energy_days|activities|measurements|account_preferences|oauth_connections|ai_tokens|model_usage_events|account_security_events|source_connections|assistant_chat_messages)\b/i):undefined;
const databaseUrl=delay?new URL(nativeUrl||`postgresql://postgres:postgres@${socket!.getServerConn()}/postgres?max=1`):null;
if(databaseUrl)databaseUrl.host=delay!.connection;
const baseURL=process.env.FORMWARD_CHAT_PREVIEW_ORIGIN??`http://127.0.0.1:${port}`,folder=await mkdtemp(join(tmpdir(),"formward-chat-pilot-")),config=join(folder,"fixture.json"),artifacts=resolve(process.env.FORMWARD_CHAT_ARTIFACTS??".codex/assistant-chat-pilot/visual");
await mkdir(artifacts,{recursive:true});await writeFile(config,JSON.stringify({...fixture,baseURL,imageId,imageBytes:imageBytes.toString("base64"),delayControlURL:delay?.controlURL,isolatedFixture:native?"native-postgres":"pglite"}),{mode:0o600});
if(process.env.FORMWARD_CHAT_PREVIEW_CONFIG)await writeFile(process.env.FORMWARD_CHAT_PREVIEW_CONFIG,await readFile(config),{mode:0o600});
const release=process.env.FORMWARD_TEST_RELEASE?resolve(process.env.FORMWARD_TEST_RELEASE):null;
if(release)assert.ok(release.startsWith(resolve(".codex/regional-releases")+"/")&&release.endsWith("/standalone"),"仅验收本工作区私有候选包");
const serverArgs=release?[join(release,"server.js")]:["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)];
const childEnv:NodeJS.ProcessEnv={PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,PORT:String(port),HOSTNAME:"127.0.0.1",FORMWARD_READINESS_SECRET:"fictional-readiness-secret-for-isolated-chat-build",FORMWARD_EXPECTED_DATABASE:"postgres",FORMWARD_ENVIRONMENT:"isolated-chat-browser",NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:databaseUrl?.toString()||nativeUrl||`postgresql://postgres:postgres@${socket!.getServerConn()}/postgres?max=1`,BETTER_AUTH_URL:baseURL,BETTER_AUTH_SECRET:"fictional-chat-browser-secret-at-least-32-characters",FORMWARD_REGIONAL:"1",FORMWARD_SINGLE_WEB:"1",FORMWARD_CN_ORIGIN:baseURL,FORMWARD_DATA_SOURCE_USER_ID:fixture.userId,FORMWARD_CHAT_ENABLED:"1",FORMWARD_CHAT_PILOT_USER_ID:fixture.userId,FORMWARD_CHAT_BROWSER_FIXTURE:config,QWEN_API_KEY:"fictional-key",QWEN_BASE_URL:"https://maas.qianwenaiapi.com/compatible-mode/v1",MIMO_API_KEY:"fictional-key",GLM_API_KEY:"fictional-key",FORMWARD_COS_BUCKET:"chat-fixture-123",FORMWARD_COS_REGION:"ap-shanghai",FORMWARD_COS_SECRET_ID:"fictional",FORMWARD_COS_SECRET_KEY:"fictional",FORMWARD_IMAGE_REGION:"cn",FORMWARD_TIMEZONE:"Asia/Shanghai",FORMWARD_LOCAL_PREVIEW:previewMarker?"1":undefined,FORMWARD_OWNER_MFA_REQUIRED:previewMarker?"0":undefined,...realCosEnv,FORMWARD_TEST_REAL_COS:realCosPath?"1":undefined};
if(process.env.FORMWARD_MEMBERSHIP_SMOKE==="1")Object.assign(childEnv,{FORMWARD_MANAGED_MEMBERSHIP_REQUIRED:"1",FORMWARD_OWNER_MFA_REQUIRED:"0"});
const child=spawn(process.execPath,["--import",resolve("tests/chat-model-fixture.mjs"),...serverArgs],{cwd:release??process.cwd(),env:childEnv,stdio:["ignore","pipe","pipe"]});
const worker=spawn(process.execPath,["--import",resolve("tests/chat-model-fixture.mjs"),release?join(release,"chat-worker.mjs"):resolve(".next/chat-worker.mjs")],{cwd:release??process.cwd(),env:childEnv,stdio:["ignore","pipe","pipe"]});
let log="",logWrite=Promise.resolve();const capture=(chunk:Buffer)=>{log+=chunk;const path=process.env.FORMWARD_CHAT_PREVIEW_SERVER_LOG;if(path)logWrite=logWrite.then(()=>appendFile(path,chunk,{mode:0o600}));};child.stdout!.on("data",capture);child.stderr!.on("data",capture);worker.stdout!.on("data",capture);worker.stderr!.on("data",capture);
try{
 let ready=false;for(let attempt=0;attempt<100;attempt++){assert.equal(child.exitCode,null);try{const probeResponse=await fetch(`http://127.0.0.1:${port}`,{redirect:"manual"});if(probeResponse.ok||process.env.FORMWARD_CHAT_PREVIEW==="1"&&probeResponse.status>=300&&probeResponse.status<500){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready,"隔离正式构建应可启动");
 if(release){const response=await fetch(baseURL+"/api/internal/readiness",{headers:{Authorization:"Bearer fictional-readiness-secret-for-isolated-chat-build"}});assert.equal(response.status,200);assert.equal((await response.json()).schema,JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")).entries.at(-1).tag);}
 process.env.FORMWARD_CHAT_BROWSER_CONFIG=config;process.env.FORMWARD_CHAT_ARTIFACTS=artifacts;
 if(process.env.FORMWARD_MEMBERSHIP_SMOKE==="1"){const {runMembershipContextSmoke}=await import("./membership-context.driver.mjs");await runMembershipContextSmoke(db);}else if(process.env.FORMWARD_CHAT_RELIABILITY==="1"){const {runChatBackgroundBrowser}=await import("./chat-background.driver.mjs");await runChatBackgroundBrowser(db);}else if(process.env.FORMWARD_ASSISTANT_RECORDING==="1"){const {runAssistantRecordingBrowser}=await import("./assistant-recording.driver.mjs");await runAssistantRecordingBrowser(db);}else if(realCosPath&&process.env.FORMWARD_CHAT_PREVIEW!=="1"){const {checkRealPhotoClient}=await import("./real-photo-client.browser.mjs");await checkRealPhotoClient(db);}else if(process.env.FORMWARD_CHAT_PREVIEW==="1"){console.log(JSON.stringify({baseURL,configPath:config,fictional:true}));await new Promise<void>(done=>{process.once("SIGTERM",done);process.once("SIGINT",done);});}else{const {runChatBrowser}=await import("./chat-pilot.driver.mjs");await runChatBrowser(db);}
}catch(error){await writeFile(join(artifacts,"server-failure.log"),log);throw error;}
finally{if(worker.exitCode===null){worker.kill("SIGTERM");await once(worker,"exit");}await logWrite;if(child.exitCode===null){child.kill("SIGTERM");await once(child,"exit");}if(process.env.FORMWARD_CHAT_PREVIEW_IMAGE_MANIFEST){const rows=await db.select({id:schema.mealImage.id,userId:schema.mealImage.userId,pathname:schema.mealImage.pathname,storageProvider:schema.mealImage.storageProvider,storageLocation:schema.mealImage.storageLocation}).from(schema.mealImage).where(eq(schema.mealImage.userId,fixture.userId));await writeFile(process.env.FORMWARD_CHAT_PREVIEW_IMAGE_MANIFEST,JSON.stringify(rows.filter(row=>row.id!==imageId)),{mode:0o600});}await delay?.close();await socket?.stop();await new Promise(resolve=>setImmediate(resolve));await pg?.close();await native?.close();stopNative?.();}
