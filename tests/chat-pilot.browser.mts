import assert from "node:assert/strict";
import {once} from "node:events";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,mkdtemp,writeFile,readFile,stat} from "node:fs/promises";
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
import {localMeasurementDate} from "../src/features/measurements/entry-state";
const realCosPath=process.env.FORMWARD_REAL_PHOTO_CONFIG;
const realCosEnv:Record<string,string>={};
if(realCosPath){assert.equal((await stat(realCosPath)).mode&0o777,0o600);const settings=parseEnv(await readFile(realCosPath,"utf8"));assert.equal(settings.FORMWARD_COS_BUCKET,"formward-images-1520483841");assert.equal(settings.FORMWARD_COS_REGION,"ap-shanghai");for(const key of ["FORMWARD_COS_BUCKET","FORMWARD_COS_REGION","FORMWARD_COS_SECRET_ID","FORMWARD_COS_SECRET_KEY"]){assert.ok(settings[key]);realCosEnv[key]=settings[key];}}
const pg=new PGlite(),db=drizzle(pg,{schema});await migrate(db,{migrationsFolder:"drizzle"});
const fixture=await seedAssistantFixture(db,localMeasurementDate(new Date(),"Asia/Shanghai"));
await db.update(schema.user).set({role:"owner"}).where(eq(schema.user.id,fixture.userId));
const imageId=randomUUID(),imageBytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nE0AAAAASUVORK5CYII=","base64");
await db.insert(schema.mealImage).values({id:imageId,userId:fixture.userId,pathname:"meal-formal-v2/"+fixture.userId+"/fixture.png",fileName:"虚构照片.png",mimeType:"image/png",byteSize:imageBytes.length,sha256:createHash("sha256").update(imageBytes).digest("hex"),source:"manual",createdBy:fixture.userId,storageProvider:"cos",storageLocation:"chat-fixture-123@ap-shanghai"});
const socket=new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:0,maxConnections:10});await socket.start();const probe=createServer();probe.listen(realCosPath?3300:0,"127.0.0.1");await once(probe,"listening");const port=(probe.address()as{port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
const baseURL=`http://127.0.0.1:${port}`,folder=await mkdtemp(join(tmpdir(),"formward-chat-pilot-")),config=join(folder,"fixture.json"),artifacts=resolve(process.env.FORMWARD_CHAT_ARTIFACTS??".codex/assistant-chat-pilot/visual");
await mkdir(artifacts,{recursive:true});await writeFile(config,JSON.stringify({...fixture,baseURL,imageId,imageBytes:imageBytes.toString("base64"),isolatedFixture:"pglite"}),{mode:0o600});
const release=process.env.FORMWARD_TEST_RELEASE?resolve(process.env.FORMWARD_TEST_RELEASE):null;
if(release)assert.ok(release.startsWith(resolve(".codex/regional-releases")+"/")&&release.endsWith("/standalone"),"仅验收本工作区私有候选包");
const serverArgs=release?[join(release,"server.js")]:["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)];
const child=spawn(process.execPath,["--import",resolve("tests/chat-model-fixture.mjs"),...serverArgs],{cwd:release??process.cwd(),env:{PATH:process.env.PATH,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_FILE:process.env.FONTCONFIG_FILE,PORT:String(port),HOSTNAME:"127.0.0.1",FORMWARD_READINESS_SECRET:"fictional-readiness-secret-for-isolated-chat-build",FORMWARD_EXPECTED_DATABASE:"postgres",FORMWARD_ENVIRONMENT:"isolated-chat-browser",NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:`postgresql://postgres:postgres@${socket.getServerConn()}/postgres?max=1`,BETTER_AUTH_URL:baseURL,BETTER_AUTH_SECRET:"fictional-chat-browser-secret-at-least-32-characters",FORMWARD_REGIONAL:"1",FORMWARD_SINGLE_WEB:"1",FORMWARD_CN_ORIGIN:baseURL,FORMWARD_DATA_SOURCE_USER_ID:fixture.userId,FORMWARD_CHAT_ENABLED:"1",FORMWARD_CHAT_PILOT_USER_ID:fixture.userId,FORMWARD_CHAT_BROWSER_FIXTURE:config,QWEN_API_KEY:"fictional-key",QWEN_BASE_URL:"https://maas.qianwenaiapi.com/compatible-mode/v1",MIMO_API_KEY:"fictional-key",GLM_API_KEY:"fictional-key",FORMWARD_COS_BUCKET:"chat-fixture-123",FORMWARD_COS_REGION:"ap-shanghai",FORMWARD_COS_SECRET_ID:"fictional",FORMWARD_COS_SECRET_KEY:"fictional",FORMWARD_IMAGE_REGION:"cn",FORMWARD_TIMEZONE:"Asia/Shanghai",...realCosEnv,FORMWARD_TEST_REAL_COS:realCosPath?"1":undefined},stdio:["ignore","pipe","pipe"]});
let log="";child.stdout!.on("data",chunk=>log+=chunk);child.stderr!.on("data",chunk=>log+=chunk);
try{
 let ready=false;for(let attempt=0;attempt<100;attempt++){assert.equal(child.exitCode,null);try{if((await fetch(baseURL)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready,"隔离正式构建应可启动");
 if(release){const response=await fetch(baseURL+"/api/internal/readiness",{headers:{Authorization:"Bearer fictional-readiness-secret-for-isolated-chat-build"}});assert.equal(response.status,200);assert.equal((await response.json()).schema,"0037_youthful_wolfsbane");}
 process.env.FORMWARD_CHAT_BROWSER_CONFIG=config;process.env.FORMWARD_CHAT_ARTIFACTS=artifacts;
 if(realCosPath){const {checkRealPhotoClient}=await import("./real-photo-client.browser.mjs");await checkRealPhotoClient(db);}else if(process.env.FORMWARD_CHAT_PREVIEW==="1"){console.log(JSON.stringify({baseURL,configPath:config,fictional:true}));await new Promise<void>(done=>{process.once("SIGTERM",done);process.once("SIGINT",done);});}else{const {runChatBrowser}=await import("./chat-pilot.driver.mjs");await runChatBrowser(db);}
}catch(error){await writeFile(join(artifacts,"server-failure.log"),log);throw error;}
finally{if(child.exitCode===null){child.kill("SIGTERM");await once(child,"exit");}await socket.stop();await new Promise(resolve=>setImmediate(resolve));await pg.close();}
