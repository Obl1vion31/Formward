import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
export async function GET(request:Request){
 const expected=process.env.FORMWARD_READINESS_SECRET,actual=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
 if(!expected||expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return new Response(null,{status:404});
 try{const manifest=JSON.parse(await readFile(join(process.cwd(),"release-manifest.json"),"utf8"));
 const database=await getDatabase().execute<{name:string}>(sql`select current_database() as name`);
 if(!process.env.FORMWARD_EXPECTED_DATABASE||database[0]?.name!==process.env.FORMWARD_EXPECTED_DATABASE||!process.env.FORMWARD_ENVIRONMENT)throw new Error("部署环境不匹配。");
 await getDatabase().execute(sql`select storage_provider,storage_location from meal_images limit 0`);
 await getDatabase().execute(sql`select access_version,banned from users limit 0`);
 await getDatabase().execute(sql`select two_factor_enabled,ai_paused,ai_daily_budget_cents,ai_daily_recognition_limit from users limit 0`);
 await getDatabase().execute(sql`select mfa_verified_at,security_verified_at,mfa_recovery_required from sessions limit 0`);
 await getDatabase().execute(sql`select secret,backup_codes,verified from two_factors limit 0`);
 await getDatabase().execute(sql`select date from ai_budget_days limit 0`);
 await getDatabase().execute(sql`select date,requests,failures from api_daily_usage limit 0`);
 await getDatabase().execute(sql`select id,category,created_at from security_events limit 0`);
 await getDatabase().execute(sql`select user_id,date,bytes,state from image_quota_leases limit 0`);
 const actions:unknown=JSON.parse(await readFile(join(process.cwd(),".next/security-actions.json"),"utf8"));
 if(!Array.isArray(actions)||!actions.length||actions.some(id=>typeof id!=="string"))throw new Error("安全执行清单缺失。");
 await getDatabase().execute(sql`select sex_for_calculation from personal_profiles limit 0`);
 await getDatabase().execute(sql`select energy_resting_method,energy_formula from account_preferences limit 0`);
 await getDatabase().execute(sql`select resting_input_method,calculation_snapshot from energy_days limit 0`);
 if(process.env.FORMWARD_CHAT_ENABLED==="1"){
  await getDatabase().execute(sql`select token_id,provider from assistant_connections limit 0`);
  await getDatabase().execute(sql`select provider,followup,purpose,context,removed_at from assistant_conversations limit 0`);
  await getDatabase().execute(sql`select image_ids,"references" from assistant_messages limit 0`);
  await getDatabase().execute(sql`select request_id,token_id,tool_results,execution_input,claimed_at,worker_id,request_diagnostics from assistant_runs limit 0`);
  await getDatabase().execute(sql`select date,reserved_cny,cost_cny,usage,rates from assistant_usage_requests limit 0`);
 }
 return Response.json({ready:true,database:database[0].name,environment:process.env.FORMWARD_ENVIRONMENT,commit:manifest.commit,buildId:manifest.buildId,protocol:manifest.protocol,schema:manifest.schema},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({ready:false},{status:503,headers:{"Cache-Control":"no-store"}});}
}
