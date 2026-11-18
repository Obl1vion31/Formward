import assert from "node:assert/strict";
import {after,before,test} from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {PGLiteSocketServer} from "@electric-sql/pglite-socket";
import {drizzle} from "drizzle-orm/pglite";
import {migrate} from "drizzle-orm/pglite/migrator";
import {eq} from "drizzle-orm";
import * as schema from "../../db/schema";
import {getDatabase} from "../../db/client";
import {getAuth} from "./auth";
import {provisionAccount} from "./provision";
import {currentSessionIdentity,withReadSession,withWriteSession} from "./request-identity";
import {accountEntitlements,assertAssistantEntitlement} from "./entitlements";
import {ApiError} from "./ai-identity";

const pg=new PGlite(),socket=new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:0,maxConnections:10});
const baseURL="http://127.0.0.1:3038",password="fictional-membership-password";
const accounts=new Map<string,{id:string;headers:Headers}>();
const settingKeys=["DATABASE_URL","BETTER_AUTH_URL","BETTER_AUTH_SECRET","FORMWARD_MANAGED_MEMBERSHIP_REQUIRED","FORMWARD_OWNER_MFA_REQUIRED","FORMWARD_CHAT_ENABLED","FORMWARD_MEAL_AI_ENABLED","FORMWARD_CHAT_PILOT_USER_ID"] as const;
const previous=Object.fromEntries(settingKeys.map(key=>[key,process.env[key]]));

before(async()=>{
 await migrate(drizzle(pg,{schema}),{migrationsFolder:"drizzle"});await socket.start();
 Object.assign(process.env,{DATABASE_URL:`postgresql://postgres:postgres@${socket.getServerConn()}/postgres?max=1`,BETTER_AUTH_URL:baseURL,BETTER_AUTH_SECRET:"fictional-membership-session-secret-at-least-32-characters",FORMWARD_MANAGED_MEMBERSHIP_REQUIRED:"1",FORMWARD_OWNER_MFA_REQUIRED:"0",FORMWARD_CHAT_ENABLED:"1",FORMWARD_MEAL_AI_ENABLED:"1"});
 const db=getDatabase();
 for(const tier of ["beta","admin","free"]){
  const email=`membership-session-${tier}@example.test`,created=await provisionAccount(db,{email,password});
  if(tier==="admin"){process.env.FORMWARD_CHAT_PILOT_USER_ID=created.id;await db.update(schema.user).set({role:"owner"}).where(eq(schema.user.id,created.id));}
  else await db.update(schema.user).set({membershipTier:tier as "beta"|"free",membershipTierId:tier}).where(eq(schema.user.id,created.id));
  const response=await getAuth().handler(new Request(baseURL+"/api/auth/sign-in/email",{method:"POST",headers:{Origin:baseURL,"Content-Type":"application/json"},body:JSON.stringify({email,password})}));
  assert.equal(response.status,200);const cookie=response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");assert.ok(cookie);
  accounts.set(tier,{id:created.id,headers:new Headers({cookie,origin:baseURL})});
 }
});
after(async()=>{
 const shared=globalThis as typeof globalThis&{formwardDatabase?:{close:()=>Promise<void>};formwardAuth?:unknown};
 await shared.formwardDatabase?.close();delete shared.formwardDatabase;delete shared.formwardAuth;
 await socket.stop();await pg.close();
 for(const key of settingKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
});

test("真实网页登录会话为普通用户和管理员传递数据库会员规则",async()=>{
 for(const tier of ["beta","admin"]){
  const {id,headers}=accounts.get(tier)!,raw=await getAuth().api.getSession({headers});
  assert.ok(raw?.user);assert.equal("membershipPolicy"in raw.user,false);
  const identity=await currentSessionIdentity(headers);
  assert.equal(identity.user.id,id);assert.equal(identity.user.membershipPolicy?.id,tier);
  for(const purpose of ["chat","meal_entry"] as const){
   const result=await withWriteSession(headers,async user=>assertAssistantEntitlement(user,purpose));
   assert.equal(purpose==="chat"?result.chat:result.mealRecognition,true);
  }
 }
});

test("同一会话每次读取最新规则及个人覆盖，不信任客户端账号标识",async()=>{
 const {id,headers}=accounts.get("beta")!,spoofed=new Headers(headers);spoofed.set("x-user-id",accounts.get("admin")!.id);
 const db=getDatabase();await db.update(schema.membershipPlan).set({dailyBudgetCents:73,chatEnabled:false}).where(eq(schema.membershipPlan.id,"beta"));
 const identity=await currentSessionIdentity(spoofed);assert.equal(identity.user.id,id);
 const entitlement=await withReadSession(spoofed,async user=>accountEntitlements(user));assert.equal(entitlement.dailyBudgetCny,.73);assert.equal(entitlement.chat,false);assert.equal(entitlement.mealRecognition,true);
 await db.update(schema.user).set({aiDailyBudgetCents:21,aiPaused:true}).where(eq(schema.user.id,id));
 const override=await withWriteSession(headers,async user=>accountEntitlements(user));assert.equal(override.dailyBudgetCny,.21);assert.equal(override.paused,true);assert.equal(override.mealRecognition,false);
 await db.update(schema.user).set({aiDailyBudgetCents:null,aiPaused:false}).where(eq(schema.user.id,id));
 await db.update(schema.membershipPlan).set({dailyBudgetCents:100,chatEnabled:true}).where(eq(schema.membershipPlan.id,"beta"));
});

test("Free仍不能聊天，识图保留档位次数限制",async()=>{
 const {headers}=accounts.get("free")!;
 await assert.rejects(withWriteSession(headers,async user=>assertAssistantEntitlement(user,"chat")),error=>error instanceof ApiError&&error.status===403&&error.code==="chat_unavailable");
 const entitlement=await withReadSession(headers,async user=>assertAssistantEntitlement(user,"meal_entry"));assert.equal(entitlement.dailyRecognitionLimit,4);assert.equal(entitlement.amountLimited,false);
});

test("伪造、过期及停用会话不能执行回调",async()=>{
 let invoked=false;const work=async()=>{invoked=true;};
 await assert.rejects(withWriteSession(new Headers({cookie:"formward.session_token=forged"}),work),error=>error instanceof ApiError&&error.status===401);
 const beta=accounts.get("beta")!,identity=await currentSessionIdentity(beta.headers),db=getDatabase();
 await db.update(schema.session).set({expiresAt:new Date(Date.now()-1000)}).where(eq(schema.session.id,identity.proof.sessionId));
 await assert.rejects(withWriteSession(beta.headers,work),error=>error instanceof ApiError&&error.status===401);
 const free=accounts.get("free")!;await db.update(schema.user).set({banned:true}).where(eq(schema.user.id,free.id));
 await assert.rejects(withReadSession(free.headers,work),error=>error instanceof ApiError&&error.status===401);
 assert.equal(invoked,false);
});
