import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createAuth } from "../src/features/auth/auth";
import { eq } from "drizzle-orm";
import type { Database } from "../src/db/client";
import { dataConnection, personalProfile } from "../src/db/schema";
import { provisionAccount } from "../src/features/auth/provision";
import { configureConnection, bindPersonalSource } from "../src/features/data-sources/mutations";
import { synchronizeSource } from "../src/features/data-sources/sync";
import { addCalendarDays } from "../src/features/measurements/calendar";
import { sevenDays } from "../src/features/garmin/client";

type GuideAccount = { email:string; password:string };

export async function seedGuideBrowserSessions(db:Database, baseURL:string, secret:string, configPath:string, accounts:GuideAccount[]) {
  const base = new URL(baseURL);
  assert.equal(base.hostname,"127.0.0.1");
  const auth = createAuth(db,{secret,baseURL,rateLimit:false});
  for(const account of accounts){
    const response=await auth.handler(new Request(baseURL+"/api/auth/sign-in/email",{
      method:"POST",headers:{"Content-Type":"application/json",Origin:baseURL},body:JSON.stringify(account),
    }));
    assert.equal(response.status,200);
    const cookies=response.headers.getSetCookie().map(header=>{
      const [pair]=header.split(";");
      const separator=pair.indexOf("=");
      return {name:pair.slice(0,separator),value:pair.slice(separator+1),domain:base.hostname,path:"/",expires:-1,
        httpOnly:true,secure:false,sameSite:"Lax"};
    });
    assert.ok(cookies.length);
    const cacheKey=createHash("sha256").update(account.email).digest("hex").slice(0,12);
    await writeFile(configPath+"-session-"+cacheKey+".json",JSON.stringify({cookies,origins:[]}),{mode:0o600});
  }
}

const scenarios = [
  { name: "cumulative", age: 0 },
  { name: "awaiting", age: 1 },
  { name: "stale", age: 10 },
  { name: "paused", age: 1 },
  { name: "steps", age: 1 },
  { name: "disconnected", age: 0 },
] as const;

/** Only the isolated browser harness calls this. Supply the same date used by its other demo accounts. */
export async function seedGuideDevices(db: Database, today: string) {
  const originalAccess = process.env.FORMWARD_DATA_SOURCE_ACCESS;
  const originalKey = process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY;
  process.env.FORMWARD_DATA_SOURCE_ACCESS = "personal";
  process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY = "c".repeat(64);
  try {
    const now = new Date();
    const timezone = "Asia/Shanghai";
    const window = sevenDays(now, timezone);
    const accounts = [];
    for (const scenario of scenarios) {
      const email = `guide-${scenario.name}@example.test`, password = "formward-device-demo";
      const account = await provisionAccount(db, { email, password, name: "设备体验 · 虚构数据" });
      await db.update(personalProfile).set({ onboardingStep:"complete" }).where(eq(personalProfile.userId,account.id));
      accounts.push({ name:scenario.name, email, password });
      if(scenario.name==="disconnected")continue;
      await bindPersonalSource(db,account.id,{ apiKey:"fictional-garmin-unavailable",version:0,timezone });
      const [connection] = await db.select().from(dataConnection).where(eq(dataConnection.userId,account.id));
      if(scenario.name==="steps")await configureConnection(db,account.id,connection.id,{version:connection.version,active:true,metrics:["steps"]});
      const date = addCalendarDays(today,-scenario.age);
      const data = { data:[{calendarDate:date,calories:{burnedTotal:scenario.age?2350:1640,burnedResting:scenario.age?1700:1240,burnedActive:scenario.age?650:400}, movement:{steps:{value:4500}},wellnessChronology:{endTimestampGmt:`${date}T08:30:00.0`}}] };
      const result = await synchronizeSource(db,account.id,{now,activate:true,from:date,capture:async()=>({
        mode:"demo",fetchedAt:now.toISOString(),window:{...window,dates:[date],from:date},region:"global",
        daily:{ok:true,data,rawText:JSON.stringify(data)},activityPages:[],activitiesComplete:true,
      })});
      assert.equal(result.status,"synced");
      if(scenario.name==="paused")await configureConnection(db,account.id,connection.id,{version:connection.version,active:false,metrics:connection.metrics});
      // 保留这次验收的日期事实，页面仍可演示原同步失败反馈。
      await db.update(dataConnection).set({
        lastAttemptAt:now,
        ...(scenario.name==="stale"?{lastSuccessAt:new Date(+now-10*86400000)}:{}),
      }).where(eq(dataConnection.id,connection.id));
    }
    return accounts;
  }finally{
    if(originalAccess===undefined)delete process.env.FORMWARD_DATA_SOURCE_ACCESS;else process.env.FORMWARD_DATA_SOURCE_ACCESS=originalAccess;
    if(originalKey===undefined)delete process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY;else process.env.FORMWARD_DATA_SOURCE_ENCRYPTION_KEY=originalKey;
  }
}
