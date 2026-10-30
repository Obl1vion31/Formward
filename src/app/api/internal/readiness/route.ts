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
 return Response.json({ready:true,database:database[0].name,environment:process.env.FORMWARD_ENVIRONMENT,commit:manifest.commit,buildId:manifest.buildId,protocol:manifest.protocol,schema:manifest.schema},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({ready:false},{status:503,headers:{"Cache-Control":"no-store"}});}
}
