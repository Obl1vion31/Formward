import assert from "node:assert/strict";
import { mkdtemp,readFile,writeFile,mkdir,cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as netServer } from "node:net";
import { createServer as tlsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { spawn,spawnSync,type ChildProcess } from "node:child_process";
import { randomUUID,randomBytes,createHash } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../src/db/client";
import { provisionAccount } from "../src/features/auth/provision";
import { createAuth } from "../src/features/auth/auth";
import { initializeAccountOwner } from "../src/features/auth/account-management";
import { createAiToken,authenticateAi } from "../src/features/auth/ai-tokens";
import { submitRecordOperation,reviewRecordOperation } from "../src/features/records/operations";
import { serviceHeaders } from "../src/features/auth/regional-transport";
import {meal} from "../src/db/schema";
import {eq} from "drizzle-orm";
import {readMealDayViews,setMealDayStatus} from "../src/features/meals/day-status";
import { OAUTH_SCOPES } from "../src/features/auth/oauth-connections";

export async function regionalFixture(options:{trustedOrigin?:string;singleWeb?:boolean}={}) {
 const folder=await mkdtemp(join(tmpdir(),"formward-regional-browser-")),release=resolve(process.env.FORMWARD_TEST_RELEASE??".codex/regional-releases/acceptance-01");
 const standalone=join(folder,"app"),gatewayFile=join(folder,"gateway.mjs");
 await cp(join(release,"standalone"),standalone,{recursive:true,verbatimSymlinks:true});
 await cp(join(release,"international/.vercel/output/functions/gateway.func/index.mjs"),gatewayFile);
 const {default:EmbeddedPostgres}=await import(pathToFileURL(process.env.FORMWARD_EMBEDDED_POSTGRES_MODULE??"/tmp/formward-account-tooling/node_modules/embedded-postgres/dist/index.js").href);
 async function freePort(){const server=netServer();server.listen(0,"127.0.0.1");await once(server,"listening");const addr=server.address();assert.ok(addr&&typeof addr==="object");await new Promise<void>(r=>server.close(()=>r()));return addr.port;}
 const [pgPort,appPort,cnPort,globalPort,rootPort]=await Promise.all(Array.from({length:5},()=>freePort()));
 const cluster=new EmbeddedPostgres({databaseDir:join(folder,"cluster"),user:"postgres",password:"fictional-browser-postgres",port:pgPort,persistent:false,onLog:()=>{},onError:()=>{}});
 await cluster.initialise();const cfg=join(folder,"cluster/postgresql.conf");await writeFile(cfg,(await readFile(cfg,"utf8"))+"\nlisten_addresses='127.0.0.1'\n");
 await cluster.start();await cluster.createDatabase("formward_regional_browser");
 const database=createDatabase("postgresql://postgres:fictional-browser-postgres@127.0.0.1:"+pgPort+"/formward_regional_browser?max=6"),db=database.db;
 await migrate(db,{migrationsFolder:"./drizzle"});
 const owner={email:"owner@regional.example.test",password:"fictional-owner-password"},person={email:"a.long.regional.account.for.mobile@example.test",password:"fictional-person-password"};
 const ownerId=(await provisionAccount(db,owner)).id,personId=(await provisionAccount(db,person)).id;await initializeAccountOwner(db,ownerId);
 const cn=options.trustedOrigin??"https://localhost:"+cnPort,global="https://127.0.0.1:"+globalPort,selector="https://127.0.0.1:"+rootPort,transport="http://127.0.0.1:"+appPort;
 const authSecret="fictional-production-auth-more-than-32-characters",gatewaySecret="fictional-production-gateway-more-than-32-characters";
 const auth=createAuth(db,{baseURL:global,secret:authSecret,rateLimit:false});
 async function authJson(path:string,body:object,cookie?:string){return auth.handler(new Request(global+"/api/auth/"+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:global,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)}));}
 const signin=await authJson("sign-in/email",person);assert.equal(signin.status,200);const oldCookie=signin.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
 const registered=await authJson("oauth2/register",{client_name:"虚构既有客户端",redirect_uris:["https://example.com/callback"],token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"],scope:OAUTH_SCOPES.join(" ")});assert.equal(registered.status,201);const clientId=(await registered.json()).client_id as string;
 const verifier=randomBytes(32).toString("base64url"),query=new URLSearchParams({client_id:clientId,redirect_uri:"https://example.com/callback",response_type:"code",scope:OAUTH_SCOPES.join(" "),state:randomUUID(),code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",resource:global+"/api/mcp"});
 const authorization=await auth.handler(new Request(global+"/api/auth/oauth2/authorize?"+query,{headers:{Accept:"text/html",Cookie:oldCookie}}));
 const consentUrl=authorization.headers.get("location")??(await authorization.json()).url;assert.match(consentUrl,/consent/);
 const consent=await authJson("oauth2/consent",{accept:true,oauth_query:new URL(consentUrl,global).search.slice(1)},oldCookie);assert.equal(consent.status,200);
 const code=new URL((await consent.json()).url).searchParams.get("code")!;
 const exchange=await auth.handler(new Request(global+"/api/auth/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:clientId,code,code_verifier:verifier,redirect_uri:"https://example.com/callback",resource:global+"/api/mcp"})}));assert.equal(exchange.status,200);const oldTokens=await exchange.json();
 const manual=await createAiToken(db,personId,"虚构预览授权","write"),identity=await authenticateAi(db,"Bearer "+manual.rawToken,true);
 const date=new Date(Date.now()-86400000).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"}),today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
 const preview=await submitRecordOperation(db,identity,{operationId:randomUUID(),items:[
  {key:"morning",kind:"save_record",date:today,period:"daytime",fasting:true,weightKg:"70.00",bodyFatPercent:"18.40",deviceLabel:"虚构体脂秤",timezone:"+08:00"},
  {key:"body",kind:"save_record",date,period:"evening",weightKg:"70.20",bodyFatPercent:"18.50",deviceLabel:"虚构体脂秤",timezone:"+08:00"},
  {key:"meal",kind:"save_meal",date,mealType:"lunch",timezone:"+08:00",items:[{kind:"food",name:"虚构午餐",unit:"份",quantity:"1",nutritionBasis:"consumed_total",nutrition:{caloriesKcal:"520",proteinG:"35",carbsG:"60",fatG:"16"},sourceKind:"estimated"}]},
  {key:"energy",kind:"save_energy_day",date,entryMode:"total",totalKcal:"2150",timezone:"+08:00"}
 ]});
 await reviewRecordOperation(db,personId,preview.id,{kind:"confirm",revision:preview.revision});
 const meals=await db.select().from(meal).where(eq(meal.userId,personId)),day=(await readMealDayViews(db,personId,meals)).get(date)!;
 await setMealDayStatus(db,personId,{operationId:randomUUID(),date,status:"complete",version:day.version,contentDigest:day.contentDigest});
 const key=join(folder,"localhost-key.pem"),cert=join(folder,"localhost-cert.pem");
 const generated=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","2","-keyout",key,"-out",cert,"-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1","-addext","basicConstraints=critical,CA:TRUE"],{stdio:"ignore"});assert.equal(generated.status,0);
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",NODE_EXTRA_CA_CERTS:cert,DATABASE_URL:"postgresql://postgres:fictional-browser-postgres@127.0.0.1:"+pgPort+"/formward_regional_browser?max=6",BETTER_AUTH_URL:global,BETTER_AUTH_SECRET:authSecret,FORMWARD_REGIONAL:"1",FORMWARD_SINGLE_WEB:options.singleWeb?"1":"0",FORMWARD_TIMEZONE:"Asia/Shanghai",FORMWARD_ENVIRONMENT:"test",FORMWARD_EXPECTED_DATABASE:"formward_regional_browser",FORMWARD_CN_ORIGIN:cn,FORMWARD_GLOBAL_ORIGIN:global,FORMWARD_SELECTOR_ORIGIN:selector,FORMWARD_ORIGIN_URL:transport,FORMWARD_GATEWAY_SECRET:gatewaySecret,FORMWARD_IMAGE_SECRET:"fictional-production-image-more-than-32-characters",FORMWARD_INTERNAL_JWKS_URL:transport+"/api/auth/jwks",FORMWARD_IMAGE_WORKER_URL:global,FORMWARD_IMAGE_REGION:"cn",FORMWARD_READINESS_SECRET:"fictional-readiness-more-than-32-characters",HOSTNAME:"127.0.0.1",PORT:String(appPort)};
 Object.assign(process.env,Object.fromEntries(Object.entries(env).filter(([key])=>key.startsWith("FORMWARD_")||key==="BETTER_AUTH_URL")));
 const child:ChildProcess=spawn(process.execPath,[join(standalone,"server.js")],{cwd:standalone,env,stdio:["ignore","pipe","pipe"]});
 let serverLog="";child.stdout?.on("data",v=>serverLog+=v);child.stderr?.on("data",v=>serverLog+=v);
 const tls={key:await readFile(key),cert:await readFile(cert)};
 function proxy(req:import("node:http").IncomingMessage,res:import("node:http").ServerResponse){const upstream=httpRequest({hostname:"127.0.0.1",port:appPort,path:req.url,method:req.method,headers:{...req.headers,"x-real-ip":String(req.headers["x-test-client-ip"]??"127.0.0.1")}},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});upstream.on("error",()=>{res.statusCode=503;res.end();});req.pipe(upstream);}
 const gateway=(await import(process.env.FORMWARD_TEST_GATEWAY_SOURCE==="1" ? "../scripts/self-hosting/gateway-entry.js" : pathToFileURL(gatewayFile).href)).default;
 const servers=[tlsServer(tls,proxy),tlsServer(tls,gateway),tlsServer(tls,proxy)];
 await Promise.all(servers.map((server,index)=>new Promise<void>(resolve=>server.listen([cnPort,globalPort,rootPort][index],"127.0.0.1",resolve))));
 try { for(let i=0;i<100;i++){try{const response=await fetch(transport,{headers:serviceHeaders("GET","/",global)});if(response.status===200)break;}catch{}if(i===99)throw new Error("区域production服务未启动："+serverLog.slice(-1500));await new Promise(r=>setTimeout(r,200));}
 } catch(error) { child.kill("SIGTERM");for(const server of servers){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}await database.close();await cluster.stop();throw error;}
 await mkdir(resolve(".codex/regional-visual"),{recursive:true});
 return {cn,global,selector,transport,env,db,owner,person,ownerId,personId,oldTokens,clientId,oldCookie,folder,serverLog:()=>serverLog,close:async()=>{
  child.kill("SIGTERM");await Promise.race([once(child,"exit"),new Promise(r=>setTimeout(r,3000))]);if(child.exitCode===null)child.kill("SIGKILL");
  for(const server of servers){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  await database.close();await cluster.stop();
 }};
}
