import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
export async function GET(request:Request){
 const expected=process.env.FORMWARD_READINESS_SECRET,actual=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
 if(!expected||expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return new Response(null,{status:404});
 try{const manifest=JSON.parse(await readFile(join(process.cwd(),"release-manifest.json"),"utf8"));
 await getDatabase().execute(sql`select storage_provider,storage_location from meal_images limit 0`);
 await getDatabase().execute(sql`select access_version,banned from users limit 0`);
 return Response.json({ready:true,commit:manifest.commit,buildId:manifest.buildId,protocol:manifest.protocol,schema:manifest.schema},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({ready:false},{status:503,headers:{"Cache-Control":"no-store"}});}
}
